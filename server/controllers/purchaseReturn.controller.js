'use strict';
/**
 * Purchase returns (return to vendor) recorded against a GRN. Whether the GRN has been invoiced
 * decides the stage: BEFORE_INVOICE reverses the receipt on GR/IR; AFTER_INVOICE reduces the booked
 * invoice (invoices.returns_credit) and waits for the vendor's credit note. The journal is posted by
 * services/apJournal.service.js (postReturn) when the return is saved.
 */
const { Op } = require('sequelize');
const { PurchaseReturn, PurchaseReturnItem, GRN, GRNItem, PurchaseOrder, PurchaseOrderItem, Invoice, Vendor, sequelize } = require('../models');
const { getClientId } = require('../utils/tenantFilter');
const { getNextNumber } = require('../services/documentNumbering');
const { resolveActor } = require('../services/workflowTrail.service');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clientOf = (req) => getClientId(req) || req.user?.client_id || null;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

/** GRN with its lines, what each line can still be returned, and the invoice booked on it (if any). */
async function returnableFor(grnId, clientId, transaction) {
  const grn = await GRN.findOne({ where: { id: grnId, client_id: clientId }, transaction });
  if (!grn) return null;
  const [po, items, poItems, invoice] = await Promise.all([
    grn.po_id ? PurchaseOrder.findByPk(grn.po_id, { attributes: ['id', 'po_number', 'vendor_id', 'type'], transaction }) : null,
    GRNItem.findAll({ where: { grn_id: grn.id }, order: [['id', 'ASC']], transaction }),
    grn.po_id ? PurchaseOrderItem.findAll({ where: { po_id: grn.po_id }, transaction }) : [],
    Invoice.findOne({ where: { grn_id: grn.id, client_id: clientId, status: { [Op.ne]: 'REJECTED' } }, order: [['id', 'DESC']], transaction })
  ]);
  const returnedRows = items.length
    ? await PurchaseReturnItem.findAll({ where: { grn_item_id: items.map((i) => i.id) }, attributes: ['grn_item_id', 'quantity'], transaction })
    : [];
  const returnedOf = (id) => returnedRows.filter((r) => r.grn_item_id === id).reduce((s, r) => s + Number(r.quantity || 0), 0);
  const priceOf = (it) => Number((poItems.find((p) => p.id === it.po_item_id) || poItems.find((p) => p.item_name === it.item_name))?.unit_price || 0);
  const lines = items.map((it) => {
    const accepted = Number(it.accepted_quantity || 0);
    const returned = returnedOf(it.id);
    return {
      grn_item_id: it.id, po_item_id: it.po_item_id, item_name: it.item_name, accepted_quantity: accepted,
      returned_quantity: returned, returnable_quantity: Math.max(0, round2(accepted - returned)), unit_price: priceOf(it)
    };
  });
  return {
    grn, po, invoice,
    stage: invoice ? 'AFTER_INVOICE' : 'BEFORE_INVOICE',
    lines
  };
}

exports.list = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const where = { client_id: clientId };
  if (req.query.grn_id) where.grn_id = Number(req.query.grn_id);
  const rows = await PurchaseReturn.findAll({
    where,
    include: [
      { model: PurchaseReturnItem, as: 'items' },
      { model: GRN, as: 'grn', attributes: ['id', 'grn_number'] },
      { model: PurchaseOrder, as: 'po', attributes: ['id', 'po_number'] },
      { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
      { model: Invoice, as: 'invoice', attributes: ['id', 'invoice_number', 'status'] }
    ],
    order: [['id', 'DESC']]
  });
  return res.json({ success: true, data: rows });
};

/** What can be returned on a GRN, and which entry a return would post (before / after the invoice). */
exports.returnable = async (req, res) => {
  const clientId = clientOf(req);
  const info = await returnableFor(req.params.grnId, clientId);
  if (!info) return fail(res, 404, 'GRN not found');
  const { grn, po, invoice, stage, lines } = info;
  return res.json({
    success: true,
    data: {
      grn_id: grn.id, grn_number: grn.grn_number, po_id: po?.id || null, po_number: po?.po_number || null, stage,
      invoice: invoice ? { id: invoice.id, invoice_number: invoice.invoice_number, status: invoice.status, gst_ratio: Number(invoice.base_amount) > 0 ? round2(Number(invoice.gst_amount || 0) / Number(invoice.base_amount) * 10000) / 10000 : 0 } : null,
      lines
    }
  });
};

exports.create = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const { grn_id, items, reason, return_date } = req.body || {};
  if (!String(reason || '').trim()) return fail(res, 400, 'Give a reason for the return');
  const wanted = (Array.isArray(items) ? items : []).map((i) => ({ grn_item_id: Number(i.grn_item_id), quantity: round2(i.quantity) })).filter((i) => i.quantity > 0);
  if (!wanted.length) return fail(res, 400, 'Enter the quantity being returned for at least one item');

  const transaction = await sequelize.transaction();
  try {
    const info = await returnableFor(grn_id, clientId, transaction);
    if (!info) { await transaction.rollback(); return fail(res, 404, 'GRN not found'); }
    const { grn, po, invoice, stage, lines } = info;
    const picked = [];
    for (const w of wanted) {
      const line = lines.find((l) => l.grn_item_id === w.grn_item_id);
      if (!line) { await transaction.rollback(); return fail(res, 400, 'Item is not on this GRN'); }
      if (w.quantity > line.returnable_quantity + 0.001) {
        await transaction.rollback();
        return fail(res, 400, `${line.item_name}: only ${line.returnable_quantity} can be returned (accepted ${line.accepted_quantity}, already returned ${line.returned_quantity})`);
      }
      picked.push({ ...line, quantity: w.quantity, amount: round2(w.quantity * line.unit_price) });
    }
    const value = round2(picked.reduce((s, p) => s + p.amount, 0));
    // After the invoice, the vendor is also owed back the GST billed on these goods (invoice's GST rate).
    const gst = stage === 'AFTER_INVOICE' && Number(invoice.base_amount) > 0
      ? round2(value * Number(invoice.gst_amount || 0) / Number(invoice.base_amount))
      : 0;

    const actor = await resolveActor(require('../models'), null, clientId).catch(() => ({}));
    const ret = await PurchaseReturn.create({
      client_id: clientId,
      return_number: await getNextNumber(clientId, 'RETURN', transaction),
      grn_id: grn.id, po_id: po?.id || grn.po_id || null, vendor_id: grn.vendor_id || po?.vendor_id || null,
      invoice_id: stage === 'AFTER_INVOICE' ? invoice.id : null,
      stage,
      return_date: return_date || new Date().toISOString().slice(0, 10),
      reason: String(reason).trim(),
      total_value: value, gst_amount: gst, total_amount: round2(value + gst),
      status: stage === 'AFTER_INVOICE' ? 'AWAITING_CREDIT_NOTE' : 'RETURNED',
      created_by: req.user?.id || null,
      created_by_name: actor?.user_name || req.user?.name || null
    }, { transaction });
    await PurchaseReturnItem.bulkCreate(picked.map((p) => ({
      client_id: clientId, return_id: ret.id, grn_item_id: p.grn_item_id, po_item_id: p.po_item_id || null,
      item_name: p.item_name, quantity: p.quantity, unit_price: p.unit_price, amount: p.amount
    })), { transaction });
    if (stage === 'AFTER_INVOICE') {
      await invoice.update({ returns_credit: round2(Number(invoice.returns_credit || 0) + value + gst) }, { transaction });
    }
    await transaction.commit();

    const saved = await PurchaseReturn.findByPk(ret.id, { include: [{ model: PurchaseReturnItem, as: 'items' }] });
    return res.status(201).json({
      success: true,
      message: stage === 'AFTER_INVOICE'
        ? `Return ${ret.return_number} recorded. ₹${(value + gst).toLocaleString('en-IN')} comes off invoice ${invoice.invoice_number}; ask the vendor for a credit note.`
        : `Return ${ret.return_number} recorded. The vendor's invoice should be for the quantity kept.`,
      data: saved
    });
  } catch (e) {
    if (!transaction.finished) await transaction.rollback();
    throw e;
  }
};

/** The vendor's credit note for an after-invoice return (needed before the GST credit reduction is final). */
exports.recordCreditNote = async (req, res) => {
  const clientId = clientOf(req);
  const ret = await PurchaseReturn.findOne({ where: { id: req.params.id, client_id: clientId } });
  if (!ret) return fail(res, 404, 'Return not found');
  if (ret.stage !== 'AFTER_INVOICE') return fail(res, 409, 'Only returns made after the invoice need a vendor credit note');
  const number = String(req.body?.credit_note_number || '').trim();
  if (!number) return fail(res, 400, 'Enter the vendor credit note number');
  await ret.update({ credit_note_number: number, credit_note_date: req.body?.credit_note_date || new Date().toISOString().slice(0, 10), status: 'CREDIT_NOTE_RECEIVED' });
  return res.json({ success: true, message: `Credit note ${number} recorded`, data: ret });
};
