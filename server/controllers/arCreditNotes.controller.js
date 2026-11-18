'use strict';

/**
 * Disputes and credit notes (blueprint O2C step 5). A dispute is raised on an invoice with a reason
 * code, the lines being credited and optional evidence; it is the credit note request. While it is
 * open the invoice is "In dispute" and reminders pause. Someone other than the requester, with an
 * approval limit covering the total, approves it: only then does it get its sequential CN- number,
 * reduce what the customer owes and post Dr Sales returns & allowances + Dr Output GST, Cr Receivable.
 * Rejecting it resolves the dispute with no credit. Credit notes are reported in GSTR-1.
 */
const { Op } = require('sequelize');
const { sequelize, ArCreditNote, ArInvoice, ArCustomer, User, JournalEntry, JournalLine } = require('../models');
const { buildAdminWhere } = require('../utils/tenantFilter');
const { recordAudit, documentHistory } = require('../utils/financeAudit');
const { getNextNumber } = require('../services/documentNumbering');
const { normalizeDate, toNumber } = require('../services/invoiceExtraction.service');
const { outstandingOf, settledStatus, OPEN_INVOICE } = require('../services/arCredit.service');
const arJournal = require('../services/arJournal.service');
const arPeriod = require('../services/arPeriod.service');
const approvals = require('../services/arApproval.service');
const { neededLabel } = require('../services/billApproval.service');

const REASONS = {
  DAMAGED: 'Damaged in transit',
  PRICING: 'Pricing difference',
  SHORT_SHIPMENT: 'Short shipment',
  RETURN: 'Goods returned',
  OTHER: 'Other'
};
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const round3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;
const today = () => new Date().toISOString().slice(0, 10);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const text = (v, max = 255) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nameOf = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);

async function userNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const users = await User.findAll({ where: { id: { [Op.in]: list } }, attributes: ['id', 'first_name', 'last_name', 'email'] });
  return Object.fromEntries(users.map((u) => [u.id, nameOf(u)]));
}

const parseLines = (raw) => {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

/**
 * Lines of the credit note, with the GST split the original invoice used: IGST if the invoice
 * charged IGST, otherwise CGST + SGST in halves. Quantities may not exceed the invoice line.
 */
function creditLines(rawLines, invoice) {
  const invoiceLines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const lines = parseLines(rawLines).map((l) => {
    const quantity = round3(toNumber(l.quantity) ?? 1);
    const rate = round2(toNumber(l.rate));
    const gst = toNumber(l.gst_percent);
    const index = l.line_index === undefined || l.line_index === null || l.line_index === '' ? null : Number(l.line_index);
    const amount = round2(quantity * rate);
    return { description: text(l.description, 500), line_index: index, quantity, rate, gst_percent: gst === null ? 0 : gst, amount, gst_amount: round2((amount * (gst || 0)) / 100) };
  });
  let problem = null;
  if (!lines.length) problem = 'Add at least one line to credit';
  else if (lines.some((l) => !l.description)) problem = 'Every line needs a description';
  else if (lines.some((l) => !(l.quantity > 0) || !(l.rate > 0))) problem = 'Every line needs a quantity and a rate above zero';
  else if (lines.some((l) => l.gst_percent < 0 || l.gst_percent > 100)) problem = 'GST % must be between 0 and 100';
  else {
    for (const l of lines) {
      if (l.line_index === null) continue;
      const src = invoiceLines[l.line_index];
      if (!src) { problem = 'A line does not belong to this invoice'; break; }
      if (l.quantity > Number(src.quantity) + 0.0005) { problem = `${src.description}: ${l.quantity} is more than the ${Number(src.quantity)} invoiced`; break; }
      if (l.rate > Number(src.rate) + 0.005) { problem = `${src.description}: the credit rate is more than the invoiced rate of ${inr(src.rate)}`; break; }
    }
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round2(lines.reduce((s, l) => s + l.gst_amount, 0));
  const interState = Number(invoice.igst_amount || 0) > 0 && Number(invoice.cgst_amount || 0) === 0;
  const half = round2(tax / 2);
  const split = interState ? { igst_amount: tax, cgst_amount: 0, sgst_amount: 0 } : { igst_amount: 0, cgst_amount: half, sgst_amount: round2(tax - half) };
  return { lines, problem, totals: { subtotal, tax_amount: tax, total_amount: round2(subtotal + tax), ...split } };
}

const include = [
  { model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name', 'gst_number'] },
  { model: ArInvoice, as: 'invoice', attributes: ['id', 'invoice_number', 'invoice_date', 'total_amount', 'status', 'line_items', 'delivery_id'] }
];

const decorate = (note, user, names = {}) => {
  const j = note.toJSON ? note.toJSON() : note;
  const block = j.status === 'PENDING_APPROVAL' ? approvals.creditNoteBlock(j, user) : null;
  return {
    ...j, reason_label: REASONS[j.reason_code] || j.reason_code,
    can_approve: j.status === 'PENDING_APPROVAL' && !block, approve_block: block,
    approval_needs: j.status === 'PENDING_APPROVAL' ? neededLabel(j.total_amount) : null,
    requested_by_name: names[j.requested_by] || null, approved_by_name: names[j.approved_by] || null
  };
};

exports.reasons = (_req, res) => res.json({ success: true, data: Object.entries(REASONS).map(([value, label]) => ({ value, label })) });

exports.list = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.status) where.status = String(req.query.status).split(',');
  if (req.query.invoice_id) where.invoice_id = Number(req.query.invoice_id);
  const rows = await ArCreditNote.findAll({ where, include, order: [['id', 'DESC']], limit: 1000 });
  const names = await userNames(rows.flatMap((r) => [r.requested_by, r.approved_by]));
  const data = rows.map((r) => decorate(r, req.user, names));
  const pending = data.filter((r) => r.status === 'PENDING_APPROVAL');
  const approved = data.filter((r) => r.status === 'APPROVED');
  return res.json({
    success: true, data,
    summary: {
      in_dispute: pending.length, in_dispute_value: round2(pending.reduce((s, r) => s + Number(r.total_amount), 0)),
      waiting_for_me: pending.filter((r) => r.can_approve).length,
      credited: approved.length, credited_value: round2(approved.reduce((s, r) => s + Number(r.total_amount), 0))
    }
  });
};

exports.detail = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const note = await ArCreditNote.findOne({ where: { ...tenantWhere, id: req.params.id }, include });
  if (!note) return fail(res, 404, 'Credit note not found');
  const [names, history, journals] = await Promise.all([
    userNames([note.requested_by, note.approved_by]),
    documentHistory(tenantWhere, 'AR_CREDIT_NOTE', note.id),
    JournalEntry.findAll({
      where: { client_id: note.client_id, source_module: 'AR_CREDIT_NOTE', source_id: note.id },
      include: [{ model: JournalLine, as: 'lines' }], order: [['id', 'ASC'], [{ model: JournalLine, as: 'lines' }, 'line_no', 'ASC']]
    })
  ]);
  let preview = null;
  if (note.status === 'PENDING_APPROVAL') {
    const accountNames = await arJournal.accountNames(note.client_id);
    preview = arJournal.creditNoteLines(accountNames, note, note.customer?.customer_name).filter((l) => l.debit > 0 || l.credit > 0);
  }
  return res.json({ success: true, data: { ...decorate(note, req.user, names), history, journals, journal_preview: preview } });
};

/** Raises a dispute / credit note request on an invoice (multipart: fields + optional evidence file). */
exports.create = async (req, res) => {
  const body = req.body || {};
  const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (!OPEN_INVOICE.includes(invoice.status)) return fail(res, 409, 'A credit note can only be raised on an invoice with an amount still owed');
  const reason = String(body.reason_code || '').toUpperCase();
  if (!REASONS[reason]) return fail(res, 422, 'Choose the reason for the credit (damaged, pricing, short shipment, return or other)');
  const description = text(body.description, 2000);
  if (!description) return fail(res, 422, 'Describe what the customer reported');
  const { lines, problem, totals } = creditLines(body.lines, invoice);
  if (problem) return fail(res, 422, problem);
  // Open requests on the same invoice count against what is still owed.
  const pendingTotal = Number(await ArCreditNote.sum('total_amount', { where: { invoice_id: invoice.id, status: 'PENDING_APPROVAL' } }) || 0);
  const room = round2(outstandingOf(invoice) - pendingTotal);
  if (totals.total_amount > room + 0.005) {
    return fail(res, 422, `The credit of ${inr(totals.total_amount)} is more than the ${inr(room)} still owed on ${invoice.invoice_number}${pendingTotal ? ` after the ${inr(pendingTotal)} already in dispute` : ''}`);
  }
  const note = await ArCreditNote.create({
    client_id: invoice.client_id, customer_id: invoice.customer_id, invoice_id: invoice.id, delivery_id: invoice.delivery_id || null,
    reason_code: reason, description, lines, ...totals, status: 'PENDING_APPROVAL',
    evidence_url: req.evidence?.url || null, evidence_name: req.evidence?.name || null, requested_by: req.user.id
  });
  await recordAudit(req, { module: 'AR', entityType: 'AR_CREDIT_NOTE', entityId: note.id, action: 'AR_CREDIT_NOTE_REQUESTED', after: note, note: `${REASONS[reason]}: ${inr(note.total_amount)}` });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_DISPUTE_OPENED', note: `${REASONS[reason]}; credit of ${inr(note.total_amount)} requested (request #${note.id}). Reminders paused.` });
  const customer = await ArCustomer.findByPk(invoice.customer_id, { attributes: ['customer_name'] });
  approvals.notify({
    clientId: invoice.client_id, roles: approvals.rolesCovering(note.total_amount), except: req.user.id, subject: `Credit note to approve: ${invoice.invoice_number}`,
    lines: [`${customer?.customer_name || 'A customer'} disputes invoice ${invoice.invoice_number}: ${REASONS[reason]}.`, description, `A credit of ${inr(note.total_amount)} is requested. It needs ${neededLabel(note.total_amount)}, and not the person who raised it.`]
  });
  return res.status(201).json({ success: true, message: `Dispute opened and a credit of ${inr(note.total_amount)} sent for approval. Reminders on ${invoice.invoice_number} are paused.`, data: decorate(note, req.user) });
};

exports.approve = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const note = await ArCreditNote.findOne({ where: { ...tenantWhere, id: req.params.id } });
  if (!note) return fail(res, 404, 'Credit note not found');
  if (note.status !== 'PENDING_APPROVAL') return fail(res, 409, 'This credit note is not waiting for approval');
  const block = approvals.creditNoteBlock(note, req.user);
  if (block) return fail(res, 403, block);
  const creditDate = today();
  const locked = await arPeriod.lockMessage(note.client_id, creditDate);
  if (locked) return fail(res, 423, locked);
  const before = note.toJSON();
  const outcome = await sequelize.transaction(async (transaction) => {
    const invoice = await ArInvoice.findByPk(note.invoice_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice || !OPEN_INVOICE.includes(invoice.status)) return { status: 409, message: 'The invoice has nothing left owing, so it cannot be credited' };
    if (Number(note.total_amount) > outstandingOf(invoice) + 0.005) return { status: 409, message: `Only ${inr(outstandingOf(invoice))} is still owed on ${invoice.invoice_number}; reject this request and raise a smaller one` };
    const number = await getNextNumber(note.client_id, 'CREDIT_NOTE', transaction);
    await note.update({
      status: 'APPROVED', credit_note_number: number, credit_date: creditDate, approved_by: req.user.id, approved_at: new Date(), decision_note: text(req.body?.note, 500)
    }, { transaction });
    const next = { credited_amount: round2(Number(invoice.credited_amount || 0) + Number(note.total_amount)) };
    const invBefore = invoice.toJSON();
    await invoice.update({ ...next, status: settledStatus({ ...invoice.toJSON(), ...next }) }, { transaction });
    return { invoice, invBefore };
  });
  if (outcome.status) return fail(res, outcome.status, outcome.message);
  await recordAudit(req, { module: 'AR', entityType: 'AR_CREDIT_NOTE', entityId: note.id, action: 'AR_CREDIT_NOTE_APPROVED', before, after: note, note: `${note.credit_note_number} for ${inr(note.total_amount)}` });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: outcome.invoice.id, action: 'AR_CREDIT_NOTE_APPROVED', before: outcome.invBefore, after: outcome.invoice, note: `Credit note ${note.credit_note_number}: ${inr(note.total_amount)}` });
  await arJournal.safely(`credit note ${note.id}`, () => arJournal.postCreditNote(note.id));
  return res.json({ success: true, message: `Credit note ${note.credit_note_number} approved and posted for ${inr(note.total_amount)}`, data: decorate(note, req.user) });
};

exports.reject = async (req, res) => {
  const note = await ArCreditNote.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!note) return fail(res, 404, 'Credit note not found');
  if (note.status !== 'PENDING_APPROVAL') return fail(res, 409, 'This credit note is not waiting for approval');
  const reason = text(req.body?.note, 500);
  if (!reason) return fail(res, 400, 'Say why the credit is rejected (this resolves the dispute with no credit)');
  // The requester may withdraw their own request; anyone else needs to be able to approve it.
  const own = Number(note.requested_by) === Number(req.user.id);
  const block = own ? null : approvals.creditNoteBlock(note, req.user);
  if (block) return fail(res, 403, block.replace('approve', 'decide'));
  const before = note.toJSON();
  await note.update({ status: own ? 'CANCELLED' : 'REJECTED', approved_by: req.user.id, approved_at: new Date(), decision_note: reason });
  await recordAudit(req, { module: 'AR', entityType: 'AR_CREDIT_NOTE', entityId: note.id, action: own ? 'AR_CREDIT_NOTE_WITHDRAWN' : 'AR_CREDIT_NOTE_REJECTED', before, after: note, note: reason });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: note.invoice_id, action: 'AR_DISPUTE_CLOSED', note: `${own ? 'Withdrawn' : 'Rejected'}: ${reason}. Reminders resume.` });
  return res.json({ success: true, message: own ? 'Request withdrawn; reminders resume' : 'Credit rejected; the dispute is closed and reminders resume', data: decorate(note, req.user) });
};

module.exports.REASONS = REASONS;
