'use strict';
/**
 * Goods Inspection Report (GIR) against a GRN. The GRN already holds what arrived (ordered, received,
 * accepted, rejected per line); the GIR adds the inspection itself: a checklist, a remark per line,
 * the overall result and the inspector's note. One GIR per GRN; saving again updates it. Each save is
 * recorded on the GRN's activity trail.
 */
const models = require('../models');
const { GoodsInspectionReport, GRN, GRNItem, PurchaseOrder, Vendor, sequelize } = models;
const { getClientId } = require('../utils/tenantFilter');
const { getNextNumber } = require('../services/documentNumbering');
const trail = require('../services/workflowTrail.service');

const clientOf = (req) => getClientId(req) || req.user?.client_id || null;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

const CHECKLIST = [
  { key: 'quantity_matches', label: 'Quantity matches the delivery challan / invoice' },
  { key: 'specification_matches', label: 'Make, model and specification match the PO' },
  { key: 'packaging_intact', label: 'Packaging and seals intact' },
  { key: 'no_physical_damage', label: 'No physical damage' },
  { key: 'documents_received', label: 'Warranty, test certificate or manuals received' },
  { key: 'batch_expiry_ok', label: 'Batch / expiry date acceptable' }
];
const ANSWERS = ['YES', 'NO', 'NA'];
const RESULTS = { ACCEPTED: 'Accepted', PARTIALLY_ACCEPTED: 'Partially accepted', REJECTED: 'Rejected' };

/** The GRN (scoped to the company) with its lines, PO and vendor, plus its GIR if one exists. */
async function loadGrn(grnId, clientId) {
  const grn = await GRN.findOne({ where: { id: grnId, client_id: clientId } });
  if (!grn) return null;
  const [items, po, vendor, gir] = await Promise.all([
    GRNItem.findAll({ where: { grn_id: grn.id }, order: [['id', 'ASC']] }),
    grn.po_id ? PurchaseOrder.findByPk(grn.po_id, { attributes: ['id', 'po_number', 'vendor_id'] }) : null,
    grn.vendor_id ? Vendor.findByPk(grn.vendor_id, { attributes: ['id', 'vendor_name'] }) : null,
    GoodsInspectionReport.findOne({ where: { grn_id: grn.id, client_id: clientId } })
  ]);
  return { grn, items, po, vendor, gir };
}

/** Result the quantities point to: everything accepted, nothing accepted, or in between. */
const suggestedResult = (items) => {
  const received = items.reduce((s, i) => s + Number(i.received_quantity || 0), 0);
  const accepted = items.reduce((s, i) => s + Number(i.accepted_quantity || 0), 0);
  if (received > 0 && accepted >= received) return 'ACCEPTED';
  if (accepted <= 0) return 'REJECTED';
  return 'PARTIALLY_ACCEPTED';
};

// GET /api/goods-inspections?grn_ids=1,2 - GIR number and result per GRN, for the GRN register.
exports.list = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const where = { client_id: clientId };
  if (req.query.grn_ids) where.grn_id = String(req.query.grn_ids).split(',').map(Number).filter(Boolean);
  const rows = await GoodsInspectionReport.findAll({
    where,
    attributes: ['id', 'gir_number', 'grn_id', 'result', 'inspection_date', 'inspected_by_name'],
    order: [['id', 'DESC']]
  });
  res.json({ success: true, data: rows });
};

// GET /api/goods-inspections/grn/:grnId - what the inspection form needs.
exports.forGrn = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const found = await loadGrn(Number(req.params.grnId), clientId);
  if (!found) return fail(res, 404, 'GRN not found');
  const { grn, items, po, vendor, gir } = found;
  res.json({
    success: true,
    data: {
      grn: { id: grn.id, grn_number: grn.grn_number, received_date: grn.received_date, status: grn.status, invoice_number: grn.invoice_number, remarks: grn.remarks },
      po, vendor, gir,
      lines: items.map((i) => ({
        grn_item_id: i.id, item_name: i.item_name,
        ordered_quantity: Number(i.ordered_quantity || 0), received_quantity: Number(i.received_quantity || 0),
        accepted_quantity: Number(i.accepted_quantity || 0), rejected_quantity: Number(i.rejected_quantity || 0),
        qc_status: i.qc_status, condition: i.condition, qc_remarks: i.qc_remarks
      })),
      checklist: CHECKLIST,
      results: RESULTS,
      suggested_result: suggestedResult(items)
    }
  });
};

// POST /api/goods-inspections - create or update the GIR for a GRN.
exports.save = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const body = req.body || {};
  const found = await loadGrn(Number(body.grn_id), clientId);
  if (!found) return fail(res, 404, 'GRN not found');
  const { grn, items, po, gir: existing } = found;

  const note = String(body.inspection_note || '').trim();
  if (note.length < 5) return fail(res, 400, 'Write an inspection note (at least a few words) before saving');
  if (note.length > 5000) return fail(res, 400, 'Inspection note is too long (5000 characters at most)');
  const result = String(body.result || '').toUpperCase();
  if (!RESULTS[result]) return fail(res, 400, 'Choose the inspection result');
  const date = body.inspection_date ? new Date(body.inspection_date) : new Date();
  if (Number.isNaN(date.getTime())) return fail(res, 400, 'Inspection date is not valid');
  if (date.getTime() > Date.now() + 24 * 3600 * 1000) return fail(res, 400, 'Inspection date cannot be in the future');

  const answers = body.checklist || {};
  const checklist = {};
  for (const c of CHECKLIST) {
    const a = String(answers[c.key] || '').toUpperCase();
    checklist[c.key] = ANSWERS.includes(a) ? a : null;
  }
  const remarkOf = Object.fromEntries((Array.isArray(body.line_findings) ? body.line_findings : [])
    .map((l) => [Number(l.grn_item_id), String(l.remark || '').trim().slice(0, 500)]));
  // Quantities are a snapshot of the GRN at inspection time; only the remark comes from the inspector.
  const line_findings = items.map((i) => ({
    grn_item_id: i.id, item_name: i.item_name,
    ordered_quantity: Number(i.ordered_quantity || 0), received_quantity: Number(i.received_quantity || 0),
    accepted_quantity: Number(i.accepted_quantity || 0), rejected_quantity: Number(i.rejected_quantity || 0),
    remark: remarkOf[i.id] || ''
  }));

  const actor = await trail.resolveActor(models, null, clientId).catch(() => ({}));
  const fields = {
    inspection_date: date.toISOString().slice(0, 10),
    result, checklist, line_findings, inspection_note: note,
    inspected_by: req.user?.id || null,
    inspected_by_name: actor.user_name || req.user?.username || null
  };

  const transaction = await sequelize.transaction();
  let gir;
  try {
    if (existing) {
      gir = await existing.update(fields, { transaction });
    } else {
      gir = await GoodsInspectionReport.create({
        client_id: clientId,
        gir_number: await getNextNumber(clientId, 'GIR', transaction),
        grn_id: grn.id, po_id: po?.id || grn.po_id || null, vendor_id: grn.vendor_id || null,
        ...fields
      }, { transaction });
    }
    await trail.record(models, {
      module: 'GRN',
      reference_id: grn.id,
      reference_no: grn.grn_number,
      client_id: clientId,
      action: `${existing ? 'Inspection report updated' : 'Goods inspected'} (${gir.gir_number}: ${RESULTS[result]})`,
      from_status: grn.status,
      to_status: grn.status,
      comments: note.slice(0, 500),
      priority: 3
    }, transaction);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
  res.status(existing ? 200 : 201).json({ success: true, message: `Inspection report ${gir.gir_number} saved`, data: gir });
};
