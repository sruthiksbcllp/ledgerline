'use strict';

/**
 * In-house stock: what the store already holds, checked before raising a purchase requisition.
 * When the item is in stock it is issued to the requester instead of being bought again.
 * Built on the inventory tables (items, inventorybalances, stocktransactions).
 */
const { Op } = require('sequelize');
const { sequelize, Item, InventoryBalance, Location, Region, StockTransaction, User, Vendor, PurchaseRequisition } = require('../models');
const { buildWhere, getClientId } = require('../utils/tenantFilter');

const num = (v) => Number(v || 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;

const stockStatus = (onHand, reorderLevel) => {
  if (onHand <= 0) return 'OUT_OF_STOCK';
  if (onHand <= num(reorderLevel)) return 'LOW';
  return 'IN_STOCK';
};

/** Latest known unit cost per item (from receipts and opening stock). */
const latestUnitCosts = async (itemIds) => {
  if (!itemIds.length) return {};
  const rows = await StockTransaction.findAll({
    attributes: ['item_id', 'unit_cost', 'createdAt', 'id'],
    where: { item_id: itemIds, unit_cost: { [Op.ne]: null }, transaction_type: ['GRN', 'ADJUSTMENT'] },
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  });
  const out = {};
  rows.forEach((r) => { if (out[r.item_id] === undefined) out[r.item_id] = num(r.unit_cost); });
  return out;
};

exports.list = async (req, res) => {
  try {
    const items = await Item.findAll({
      where: { item_type: 'INVENTORY', status: 'ACTIVE', ...buildWhere(req) },
      include: [{ model: InventoryBalance, required: false, include: [{ model: Location, attributes: ['id', 'location_name'] }] }],
      order: [['item_name', 'ASC']]
    });
    const costs = await latestUnitCosts(items.map((i) => i.id));
    const data = items.map((item) => {
      const locations = (item.InventoryBalances || []).map((b) => ({
        location_id: b.location_id,
        location_name: b.Location?.location_name || `Location ${b.location_id}`,
        quantity: num(b.quantity)
      }));
      const onHand = round2(locations.reduce((sum, l) => sum + l.quantity, 0));
      const unitCost = costs[item.id] ?? null;
      return {
        id: item.id,
        item_name: item.item_name,
        sku_code: item.sku_code,
        description: item.item_description || '',
        unit: item.unit,
        reorder_level: num(item.reorder_level),
        on_hand: onHand,
        unit_cost: unitCost,
        value: unitCost === null ? null : round2(onHand * unitCost),
        status: stockStatus(onHand, item.reorder_level),
        locations
      };
    });
    const summary = {
      items: data.length,
      in_stock: data.filter((d) => d.status === 'IN_STOCK').length,
      low: data.filter((d) => d.status === 'LOW').length,
      out_of_stock: data.filter((d) => d.status === 'OUT_OF_STOCK').length,
      value: round2(data.reduce((sum, d) => sum + num(d.value), 0))
    };
    return res.json({ success: true, data, summary });
  } catch (error) {
    console.error('[in-house-stock] list failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not load the in-house stock' });
  }
};

exports.issues = async (req, res) => {
  try {
    const rows = await StockTransaction.findAll({
      where: { transaction_type: 'ISSUE', ...buildWhere(req) },
      include: [
        { model: Item, attributes: ['item_name', 'sku_code', 'unit'] },
        { model: Location, as: 'FromLocation', attributes: ['location_name'] },
        { model: User, attributes: ['first_name', 'last_name', 'email'] }
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 200
    });
    const prIds = [...new Set(rows.map((r) => r.pr_id).filter(Boolean))];
    const prs = prIds.length ? await PurchaseRequisition.findAll({ attributes: ['id', 'pr_number'], where: { id: prIds } }) : [];
    const prNumber = Object.fromEntries(prs.map((p) => [p.id, p.pr_number]));
    const data = rows.map((r) => ({
      id: r.id,
      issue_number: r.reference_number,
      issued_at: r.createdAt,
      item_name: r.Item?.item_name,
      sku_code: r.Item?.sku_code,
      unit: r.Item?.unit,
      quantity: num(r.quantity),
      location_name: r.FromLocation?.location_name || '',
      issued_to: r.issued_to,
      issued_department: r.issued_department,
      pr_number: r.pr_id ? (prNumber[r.pr_id] || `PR #${r.pr_id}`) : null,
      notes: r.notes,
      issued_by: [r.User?.first_name, r.User?.last_name].filter(Boolean).join(' ') || r.User?.email || ''
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[in-house-stock] issues failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not load the stock issues' });
  }
};

const UNITS = ['Nos', 'Kg', 'Liters', 'Meters', 'Pack'];

/** Next free stock code for the company, e.g. STK-C1-035. */
const nextSku = async (clientId, t) => {
  let n = (await Item.count({ where: { client_id: clientId }, transaction: t })) + 1;
  for (;;) {
    const sku = `STK-C${clientId}-${String(n).padStart(3, '0')}`;
    if (!(await Item.findOne({ attributes: ['id'], where: { sku_code: sku }, transaction: t }))) return sku;
    n += 1;
  }
};

/**
 * Adds stock that arrived from outside (bought locally, returned, transferred in). Either for an
 * existing item, or a new item created here. Raises the store balance and records the receipt.
 */
exports.receive = async (req, res) => {
  const body = req.body || {};
  const itemId = Number(body.item_id) || null;
  const locationId = Number(body.location_id);
  const quantity = round2(body.quantity);
  const unitCost = body.unit_cost === null || body.unit_cost === undefined || body.unit_cost === '' ? null : round2(body.unit_cost);
  const reference = String(body.reference || '').trim();
  const notes = String(body.notes || '').trim();
  const supplierId = Number(body.supplier_id) || null;
  if (!locationId) return res.status(400).json({ success: false, message: 'Choose the store location' });
  if (!(quantity > 0)) return res.status(400).json({ success: false, message: 'Quantity must be more than 0' });
  if (unitCost !== null && unitCost < 0) return res.status(400).json({ success: false, message: 'Unit cost cannot be negative' });

  const newItem = body.new_item || null;
  if (!itemId) {
    if (!String(newItem?.item_name || '').trim()) return res.status(400).json({ success: false, message: 'Choose an item or enter the new item name' });
    if (newItem.unit && !UNITS.includes(newItem.unit)) return res.status(400).json({ success: false, message: `Unit must be one of ${UNITS.join(', ')}` });
  }

  try {
    const tenant = buildWhere(req);
    const clientId = Number(getClientId(req)) || null;
    const location = await Location.findOne({ where: { id: locationId, ...tenant } });
    if (!location) return res.status(404).json({ success: false, message: 'Store location not found' });

    const result = await sequelize.transaction(async (t) => {
      let item;
      if (itemId) {
        item = await Item.findOne({ where: { id: itemId, item_type: 'INVENTORY', ...tenant }, transaction: t });
        if (!item) { const e = new Error('Item not found'); e.status = 404; throw e; }
      } else {
        const name = String(newItem.item_name).trim();
        const owner = clientId || location.client_id;
        const duplicate = await Item.findOne({ where: { item_name: name, item_type: 'INVENTORY', client_id: owner }, transaction: t });
        if (duplicate) { const e = new Error(`"${name}" is already a stock item. Choose it from the list instead.`); e.status = 409; throw e; }
        const sku = String(newItem.sku_code || '').trim();
        if (sku && await Item.findOne({ attributes: ['id'], where: { sku_code: sku }, transaction: t })) {
          const e = new Error(`Item code ${sku} is already used`); e.status = 409; throw e;
        }
        item = await Item.create({
          item_name: name,
          sku_code: sku || await nextSku(owner, t),
          unit: newItem.unit || 'Nos',
          reorder_level: round2(newItem.reorder_level),
          min_stock_level: round2(newItem.reorder_level),
          item_type: 'INVENTORY',
          item_description: String(newItem.group || '').trim() || null,
          client_id: owner
        }, { transaction: t });
      }

      const [balance] = await InventoryBalance.findOrCreate({
        where: { item_id: item.id, location_id: locationId },
        defaults: { quantity: 0 },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const after = round2(num(balance.quantity) + quantity);
      await balance.update({ quantity: after }, { transaction: t });
      await StockTransaction.create({
        item_id: item.id,
        client_id: item.client_id,
        transaction_type: 'GRN',
        quantity,
        unit_cost: unitCost,
        to_location_id: locationId,
        supplier_id: supplierId,
        reference_number: reference || null,
        notes: notes || null,
        created_by: req.user?.id || null
      }, { transaction: t });
      return { item, after };
    });

    return res.status(201).json({
      success: true,
      message: `Added ${quantity} ${result.item.unit} of ${result.item.item_name} to ${location.location_name} (now ${result.after})`,
      data: { item_id: result.item.id, on_hand_at_location: result.after }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('[in-house-stock] receive failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not add the stock' });
  }
};

exports.receipts = async (req, res) => {
  try {
    const rows = await StockTransaction.findAll({
      where: { transaction_type: ['GRN', 'ADJUSTMENT'], ...buildWhere(req) },
      include: [
        { model: Item, attributes: ['item_name', 'sku_code', 'unit'] },
        { model: Location, as: 'ToLocation', attributes: ['location_name'] },
        { model: Vendor, attributes: ['vendor_name'] },
        { model: User, attributes: ['first_name', 'last_name', 'email'] }
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 200
    });
    const data = rows.map((r) => ({
      id: r.id,
      added_at: r.createdAt,
      item_name: r.Item?.item_name,
      sku_code: r.Item?.sku_code,
      unit: r.Item?.unit,
      quantity: num(r.quantity),
      unit_cost: r.unit_cost === null ? null : num(r.unit_cost),
      location_name: r.ToLocation?.location_name || '',
      supplier: r.Vendor?.vendor_name || '',
      reference: r.reference_number === 'OPENING-STOCK' ? 'Opening stock' : r.reference_number,
      notes: r.notes,
      added_by: [r.User?.first_name, r.User?.last_name].filter(Boolean).join(' ') || r.User?.email || ''
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[in-house-stock] receipts failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not load the stock added' });
  }
};

/** Issues stock to a requester: lowers the store balance and records an issue slip. */
exports.issue = async (req, res) => {
  const itemId = Number(req.body?.item_id);
  const locationId = Number(req.body?.location_id);
  const quantity = round2(req.body?.quantity);
  const issuedTo = String(req.body?.issued_to || '').trim();
  const department = String(req.body?.issued_department || '').trim();
  const notes = String(req.body?.notes || '').trim();
  const prId = Number(req.body?.pr_id) || null;
  if (!itemId || !locationId) return res.status(400).json({ success: false, message: 'Choose the item and the store location' });
  if (!(quantity > 0)) return res.status(400).json({ success: false, message: 'Quantity must be more than 0' });
  if (!issuedTo) return res.status(400).json({ success: false, message: 'Enter who the item is issued to' });

  try {
    const tenant = buildWhere(req);
    const item = await Item.findOne({ where: { id: itemId, item_type: 'INVENTORY', ...tenant } });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (prId && !(await PurchaseRequisition.findOne({ attributes: ['id'], where: { id: prId, ...tenant } }))) {
      return res.status(404).json({ success: false, message: 'Purchase requisition not found' });
    }

    const result = await sequelize.transaction(async (t) => {
      const balance = await InventoryBalance.findOne({
        where: { item_id: itemId, location_id: locationId },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const available = num(balance?.quantity);
      if (!balance || available < quantity) {
        const err = new Error(`Only ${available} ${item.unit} of ${item.item_name} in stock at this location`);
        err.status = 409;
        throw err;
      }
      await balance.update({ quantity: round2(available - quantity) }, { transaction: t });

      const year = new Date().getFullYear();
      const prefix = `ISS-C${item.client_id}-${year}-`;
      const issued = await StockTransaction.count({
        where: { transaction_type: 'ISSUE', client_id: item.client_id, reference_number: { [Op.like]: `${prefix}%` } },
        transaction: t
      });
      const slip = await StockTransaction.create({
        item_id: itemId,
        client_id: item.client_id,
        transaction_type: 'ISSUE',
        quantity,
        from_location_id: locationId,
        reference_number: `${prefix}${String(issued + 1).padStart(4, '0')}`,
        issued_to: issuedTo,
        issued_department: department || null,
        pr_id: prId,
        notes: notes || null,
        created_by: req.user?.id || null
      }, { transaction: t });
      return { slip, left: round2(available - quantity) };
    });

    return res.status(201).json({
      success: true,
      message: `Issued ${quantity} ${item.unit} of ${item.item_name} to ${issuedTo} (${result.slip.reference_number})`,
      data: { id: result.slip.id, issue_number: result.slip.reference_number, remaining_at_location: result.left }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('[in-house-stock] issue failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not issue the stock' });
  }
};

// Sample store stock for trying the feature: office items, one running low and one out of stock.
const SAMPLE_ITEMS = [
  ['A4 copier paper (500 sheets)', 'Pack', 120, 40, 245, 'Stationery'],
  ['Ball pens, blue (box of 10)', 'Pack', 35, 10, 60, 'Stationery'],
  ['Whiteboard markers (set of 4)', 'Pack', 6, 10, 180, 'Stationery'],
  ['Stapler with pins', 'Nos', 18, 5, 210, 'Stationery'],
  ['Office chair, ergonomic', 'Nos', 8, 2, 7500, 'Furniture'],
  ['Laptop, Dell Latitude 5440', 'Nos', 3, 2, 68000, 'IT equipment'],
  ['Monitor 24-inch, Dell', 'Nos', 6, 2, 11500, 'IT equipment'],
  ['Wireless keyboard and mouse', 'Nos', 15, 5, 1450, 'IT equipment'],
  ['LAN cable Cat6 (3 m)', 'Nos', 40, 10, 180, 'IT equipment'],
  ['HP 88A toner cartridge', 'Nos', 0, 3, 4200, 'Printer supplies'],
  ['Extension board, 6 sockets', 'Nos', 12, 4, 650, 'Electrical'],
  ['Hand sanitiser (5 L can)', 'Liters', 25, 10, 160, 'Housekeeping'],
  ['Drinking water cans (20 L)', 'Nos', 30, 10, 90, 'Pantry'],
  ['Safety helmets', 'Nos', 2, 5, 350, 'Safety']
];

exports.loadSample = async (req, res) => {
  try {
    const clientId = Number(getClientId(req)) || null;
    if (!clientId) return res.status(400).json({ success: false, message: 'Open a company first' });
    const existing = await Item.count({ where: { item_type: 'INVENTORY', client_id: clientId } });
    if (existing) return res.status(409).json({ success: false, message: 'This company already has stock items, so sample stock was not added' });

    await sequelize.transaction(async (t) => {
      let locations = await Location.findAll({ where: { client_id: clientId, status: 'ACTIVE' }, order: [['id', 'ASC']], limit: 2, transaction: t });
      if (!locations.length) {
        let region = await Region.findOne({ order: [['id', 'ASC']], transaction: t });
        if (!region) region = await Region.create({ region_name: 'Default', region_code: `DEF-${clientId}`, country: 'India' }, { transaction: t });
        locations = [await Location.create({
          location_name: 'Main Store', location_code: `STORE-C${clientId}`, client_id: clientId, region_id: region.id, type: 'STORE'
        }, { transaction: t })];
      }
      for (const [index, [name, unit, qty, reorder, cost, group]] of SAMPLE_ITEMS.entries()) {
        const item = await Item.create({
          item_name: name,
          sku_code: `STK-C${clientId}-${String(index + 1).padStart(3, '0')}`,
          unit,
          reorder_level: reorder,
          min_stock_level: reorder,
          item_type: 'INVENTORY',
          item_description: group,
          client_id: clientId
        }, { transaction: t });
        // With two stores, every third item is split between them.
        const split = locations.length > 1 && index % 3 === 0 && qty > 1;
        const parts = split
          ? [[locations[0].id, Math.ceil(qty / 2)], [locations[1].id, qty - Math.ceil(qty / 2)]]
          : [[locations[0].id, qty]];
        for (const [locationId, quantity] of parts) {
          await InventoryBalance.create({ item_id: item.id, location_id: locationId, quantity }, { transaction: t });
          await StockTransaction.create({
            item_id: item.id, client_id: clientId, transaction_type: 'ADJUSTMENT', quantity, unit_cost: cost,
            to_location_id: locationId, reference_number: 'OPENING-STOCK', notes: 'Sample opening stock', created_by: req.user?.id || null
          }, { transaction: t });
        }
      }
    });
    return res.status(201).json({ success: true, message: `Added ${SAMPLE_ITEMS.length} sample stock items` });
  } catch (error) {
    console.error('[in-house-stock] sample failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not add the sample stock' });
  }
};
