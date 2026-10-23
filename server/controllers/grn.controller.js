const { GRN, GRNItem, GRNItemSerial, Asset, AssetAccounting, AssetCategory, PurchaseOrder, PurchaseOrderItem, PurchaseRequisition, Item, Property, Vendor, sequelize } = require('../models');
const { buildAdminWhere } = require('../utils/tenantFilter');
const { sendResponse } = require('../utils/response');
const AppError = require('../utils/appError');
const { getNextNumber } = require('../services/documentNumbering');
const { getStatusId, STATUS } = require('../services/statusResolver');
const { isCapexOnlyAssetCreation, shouldMakeAsset } = require('../services/grnAssets');

// GET /api/procurement/grn/purchase-orders
exports.getApprovedPOs = async (req, res, next) => {
  try {
    const client_id = req.user?.client_id;
    const { Op } = require('sequelize');
    const where = { status: { [Op.in]: ['ISSUED', 'APPROVED', 'PARTIAL_RECEIVED'] } };
    if (client_id) where.client_id = client_id;

    const pos = await PurchaseOrder.findAll({
      where,
      include: [{ model: Vendor, attributes: ['id', 'vendor_name'] }],
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    sendResponse(res, 200, pos);
  } catch (error) {
    next(error);
  }
};

exports.getGRNs = async (req, res, next) => {
  try {
    const client_id = req.user?.client_id;
    const { po_id, status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (po_id) where.po_id = po_id;
    if (status) where.status = status;

    const grns = await GRN.findAndCountAll({
      where,
      include: [
        { model: PurchaseOrder, where: client_id ? { client_id } : {}, attributes: ['po_number', 'client_id'] },
        { model: GRNItem, attributes: ['id', 'item_name', 'received_quantity', 'accepted_quantity', 'rejected_quantity', 'qc_status'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    sendResponse(res, 200, { rows: grns.rows, count: grns.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    next(error);
  }
};

exports.getGRNById = async (req, res, next) => {
  try {
    const client_id = req.user?.client_id;
    const grn = await GRN.findByPk(req.params.id, {
      include: [
        {
          model: PurchaseOrder, where: client_id ? { client_id } : {}, attributes: ['po_number', 'client_id'],
          include: [{ model: PurchaseRequisition, attributes: ['pr_number'], required: false }]
        },
        { model: GRNItem, include: [{ model: GRNItemSerial }] }
      ]
    });
    if (!grn) throw new AppError('GRN not found', 404);
    sendResponse(res, 200, grn);
  } catch (error) {
    next(error);
  }
};

exports.createGRN = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { po_id, items, invoice_number, remarks } = req.body;

    const po = await PurchaseOrder.findOne({ where: { id: po_id, ...buildAdminWhere(req) } });
    if (!po) throw new AppError('Purchase Order not found', 404);
    const grnVendor = po.vendor_id ? await Vendor.findByPk(po.vendor_id) : null;

    const clientId = req.user?.client_id || po.client_id;
    const capexOnly = await isCapexOnlyAssetCreation(clientId);
    const grn_number = await getNextNumber(clientId, 'GRN', transaction);
    const grn = await GRN.create({
      grn_number,
      po_id,
      entity_id: po.entity_id || null, // Phase D - buying entity from PO
      property_id: po.property_id,
      location_id: po.location_id || null, // location arc - from PO
      vendor_id: po.vendor_id,
      invoice_number,
      received_date: new Date(),
      status: 'PARTIAL', // valid GRN enum (RECEIVED/PARTIAL/COMPLETED/REJECTED); finalized after items below
      client_id: clientId,
      remarks
    }, { transaction });

    let warnings = [];

    for (let incomingItem of items) {
      const {
        id: po_item_id,
        received_qty = 0,
        accepted_qty = 0,
        rejected_qty = 0,
        qc_status = 'PASS',
        condition = 'GOOD',
        qc_remarks = '',
        serials = [],
        location_id,
        department_id
      } = incomingItem;

      if (received_qty <= 0) continue;

      const poItem = await PurchaseOrderItem.findOne({ where: { id: po_item_id, po_id: po.id } });
      if (!poItem) throw new AppError(`PO Item ${po_item_id} not found`, 404);

      const remaining = Number(poItem.quantity) - Number(poItem.received_quantity);
      if (received_qty > remaining) {
        throw new AppError(`Quantity mismatch: Received (${received_qty}) exceeds PO remaining (${remaining}) for ${poItem.item_name}`, 400);
      }

      if (Number(incomingItem.unit_price) && Number(incomingItem.unit_price) !== Number(poItem.unit_price)) {
        warnings.push(`Price mismatch for ${poItem.item_name}: PO Rs.${poItem.unit_price} vs Invoice Rs.${incomingItem.unit_price}`);
      }

      let finalAccepted = accepted_qty;
      let finalRejected = rejected_qty;
      if (qc_status === 'FAIL') {
        finalAccepted = 0;
        finalRejected = received_qty;
      }

      const grnItem = await GRNItem.create({
        grn_id: grn.id,
        po_item_id,
        item_id: poItem.item_id,
        item_name: poItem.item_name,
        ordered_quantity: poItem.quantity,
        received_quantity: received_qty,
        accepted_quantity: finalAccepted,
        rejected_quantity: finalRejected,
        qc_status,
        condition,
        qc_remarks,
        remarks: incomingItem.remarks || ''
      }, { transaction });

      if (serials && serials.length > 0) {
        if (serials.length !== finalAccepted) {
          throw new AppError(`Serial number count (${serials.length}) does not match accepted quantity (${finalAccepted}) for ${poItem.item_name}`, 400);
        }
        const serialRecords = serials.map(sn => ({
          grn_item_id: grnItem.id,
          serial_number: sn,
          status: 'AVAILABLE'
        }));
        await GRNItemSerial.bulkCreate(serialRecords, { transaction });
      }

      await poItem.increment('received_quantity', { by: finalAccepted, transaction });

      const itemMaster = poItem.item_id ? await Item.findByPk(poItem.item_id) : null;
      // Create fixed assets when the item master is a fixed-asset/categorised item, OR when the
      // PO is a CAPEX purchase (every received unit on a Capex PO is a capital asset, even if the
      // line is free-text with no item master).
      const createAssets = shouldMakeAsset(po, itemMaster, capexOnly);
      if (createAssets) {
        const baseCount = await Asset.count();
        for (let i = 0; i < finalAccepted; i++) {
          const asset_code = `AST-${new Date().getFullYear()}-${(baseCount + 1 + i).toString().padStart(6, '0')}`;
          const createdAsset = await Asset.create({
            asset_name: (itemMaster && itemMaster.item_name) || poItem.item_name || 'Asset',
            asset_code,
            serial_number: serials[i] || null,
            category_id: itemMaster ? itemMaster.category_id : null,
            sub_category_id: itemMaster ? itemMaster.sub_category_id : null,
            property_id: po.property_id,
            location_id: location_id || poItem.location_id || null,
            department_id: department_id || poItem.department_id || null,
            status_id: await getStatusId(STATUS.ACTIVE),
            vendor_id: po.vendor_id,
            vendor_name: grnVendor?.vendor_name || null,
            po_id: po.id,
            po_number: po.po_number || null,
            entity_id: po.entity_id || null, // Phase D - buying entity from PO
            grn_id: grn.id,
            invoice_number,
            purchase_date: po.createdAt,
            put_to_use_date: grn.received_date || new Date(), // depreciation starts when available for use
            purchase_cost: poItem.unit_price,
            total_cost: poItem.unit_price,
            source_type: 'GRN',
            is_active: true,
            client_id: clientId,
            created_by: req.user.id
          }, { transaction });

          // Asset accounting drives depreciation + gross block / NBV. Without it the asset
          // shows zero financials. Mirror the manual-create logic (Schedule II 5% residual cap).
          try {
            const cost = Number(poItem.unit_price || 0);
            let usefulLife = 5, method = 'SLM', residualPct = 5;
            if (itemMaster && itemMaster.category_id) {
              const cat = await AssetCategory.findByPk(itemMaster.category_id);
              if (cat) { usefulLife = Number(cat.useful_life || 5); method = cat.depreciation_method || 'SLM'; residualPct = Number(cat.companies_act_residual_percent || 5); }
            }
            const putToUse = grn.received_date || new Date(); // available-for-use date (GRN receipt)
            const retire = new Date(putToUse); retire.setFullYear(retire.getFullYear() + usefulLife);
            const residual = cost * (residualPct / 100);
            await AssetAccounting.create({
              asset_id: createdAsset.id,
              client_id: clientId,
              cost_of_purchase: cost,
              original_useful_life_years: usefulLife,
              residual_value: residual,
              scrap_value: residual,
              method_of_depreciation: method,
              date_of_put_in_place: putToUse,
              date_of_retirement: retire,
              wdv_rate: method === 'WDV' ? (100 / usefulLife) : 0,
              it_act_rate: 0,
              sale_of_asset: 'NO',
              created_by: req.user.id
            }, { transaction });
          } catch (accErr) { /* accounting sync non-blocking */ }
        }
      }
    }

    // Roll up receipt status onto the PO + finalize the GRN status (the direct GRN path
    // previously left the PO stuck at ISSUED and wrote an invalid GRN status). Mirrors the
    // gate-entry path: fully received when every PO line's received_quantity >= ordered quantity.
    const allPoItems = await PurchaseOrderItem.findAll({ where: { po_id: po.id }, transaction });
    const isFullyReceived = allPoItems.length > 0 && allPoItems.every(i => Number(i.received_quantity) >= Number(i.quantity));
    await grn.update({ status: isFullyReceived ? 'RECEIVED' : 'PARTIAL' }, { transaction });
    await po.update({ status: isFullyReceived ? 'RECEIVED' : 'PARTIAL_RECEIVED' }, { transaction });

    await transaction.commit();

    // GL Integration — post acquisition JV (non-blocking, no-op if toggle OFF)
    try {
      const totalAmount = items.reduce((sum, i) => {
        const qty = Number(i.accepted_qty || i.received_qty || 0);
        const price = Number(i.unit_price || 0);
        return sum + (qty * price);
      }, 0);
      if (totalAmount > 0) {
        const { postAcquisition } = require('../services/glPostingService');
        postAcquisition({ clientId: req.user?.client_id, grn, po, totalAmount }).catch(() => {});
      }
    } catch { /* GL posting is non-blocking */ }

    sendResponse(res, 201, { grn, warnings }, 'GRN created successfully');
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
};
