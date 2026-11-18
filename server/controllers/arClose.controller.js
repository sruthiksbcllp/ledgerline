'use strict';

/**
 * AR close and reporting (blueprint O2C step 10; "Close AR" in the FDS period-close workflow).
 *
 * Month-end checklist. Must be clear before Accounts Receivable can close the month:
 *   - AR sub-ledger equals ledger 1100, and unapplied cash equals ledger 2060
 *   - no unapplied cash older than 5 days
 *   - the month's credit-loss provision is posted (when there are receivables)
 * To review (shown, and acknowledged by closing):
 *   - goods delivered but not invoiced; deliveries and invoices within 3 days of month end (cut-off)
 *   - credit notes and write-offs waiting for a decision
 *   - customer credits over ₹1,000 (held in 2060, never netted against receivables)
 *   - statements sent for the month; credit reviews due
 * Finance or the Director / CFO (a different person) then signs it off. A closed month accepts no
 * AR posting dated in it; the Director / CFO or an admin can reopen it with a reason.
 *
 * Also here: customer statements of account and the customer's balance confirmation (the FDS
 * vendor reconciliation, mirrored), the GST sales register / GSTR-1 summary, AR KPIs, and the list of
 * AR items waiting for the signed-in person.
 */
const { Op } = require('sequelize');
const {
  sequelize, ArInvoice, ArCustomer, ArReceipt, ArDelivery, ArCreditNote, ArWriteOff, ArUnappliedCash, ArEclRun, ArPeriodClose, ArStatement, Client, User
} = require('../models');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { recordAudit } = require('../utils/financeAudit');
const { normalizeDate, toNumber } = require('../services/invoiceExtraction.service');
const { outstandingOf, OPEN_INVOICE } = require('../services/arCredit.service');
const { isAdmin } = require('../services/billApproval.service');
const arJournal = require('../services/arJournal.service');
const arPeriod = require('../services/arPeriod.service');
const approvals = require('../services/arApproval.service');
const notificationEmail = require('../services/notificationEmail.service');
const { calculate: eclCalculate, settingsOf } = require('./arCreditLoss.controller');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((new Date(to) - new Date(from)) / 86400000);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const text = (v, max = 255) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);
const clientOf = (req) => buildAdminWhere(req).client_id || getClientId(req);
const periodParam = (v) => (/^\d{4}-\d{2}$/.test(String(v || '')) ? String(v) : arPeriod.periodOf(today()));
const UNAPPLIED_CLEAR_DAYS = 5;
const CREDIT_BALANCE_REVIEW = 1000;
const CUTOFF_DAYS = 3;
const INVOICE_ATTRS = ['id', 'customer_id', 'invoice_number', 'invoice_date', 'due_date', 'total_amount', 'amount_received', 'tds_deducted', 'credited_amount', 'discount_allowed', 'written_off_amount', 'status', 'delivery_id'];

async function userNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const users = await User.findAll({ where: { id: { [Op.in]: list } }, attributes: ['id', 'first_name', 'last_name', 'email'] });
  return Object.fromEntries(users.map((u) => [u.id, nameOf(u)]));
}

// ── KPIs (blueprint O2C targets) ────────────────────────────────────────────

async function kpis(clientId) {
  const since90 = addDays(today(), -90);
  const [open, billed90, receipts90, deliveredInvoices] = await Promise.all([
    ArInvoice.findAll({ where: { client_id: clientId, status: OPEN_INVOICE }, attributes: INVOICE_ATTRS }),
    ArInvoice.sum('total_amount', { where: { client_id: clientId, status: { [Op.ne]: 'CANCELLED' }, invoice_date: { [Op.gte]: since90 } } }),
    ArReceipt.findAll({ where: { client_id: clientId, received_date: { [Op.gte]: since90 }, unapplied_id: null }, attributes: ['amount', 'applied_by_ai'] }),
    ArInvoice.findAll({ where: { client_id: clientId, status: { [Op.ne]: 'CANCELLED' }, invoice_date: { [Op.gte]: since90 }, delivery_id: { [Op.ne]: null } }, attributes: ['invoice_date', 'delivery_id'] })
  ]);
  const total = round2(open.reduce((s, i) => s + outstandingOf(i), 0));
  const over90 = round2(open.filter((i) => i.due_date && daysBetween(i.due_date, today()) > 90).reduce((s, i) => s + outstandingOf(i), 0));
  const billed = Number(billed90 || 0);
  const cash = receipts90.reduce((s, r) => s + Number(r.amount), 0);
  const cashAi = receipts90.filter((r) => r.applied_by_ai).reduce((s, r) => s + Number(r.amount), 0);
  const deliveries = deliveredInvoices.length
    ? await ArDelivery.findAll({ where: { id: deliveredInvoices.map((i) => i.delivery_id) }, attributes: ['id', 'delivered_date'] }) : [];
  const deliveredOn = Object.fromEntries(deliveries.map((d) => [d.id, d.delivered_date]));
  const sameDay = deliveredInvoices.filter((i) => deliveredOn[i.delivery_id] && i.invoice_date === deliveredOn[i.delivery_id]).length;
  const control = await arJournal.accountBalance(clientId, '1100');
  return [
    { key: 'dso', label: 'Days sales outstanding', value: billed > 0 ? Math.round((total / billed) * 90) : null, unit: 'days', target: '< 40 days', good: billed > 0 ? (total / billed) * 90 < 40 : null },
    { key: 'auto_applied', label: 'Cash applied from a remittance advice', value: cash > 0 ? Math.round((cashAi / cash) * 100) : null, unit: '%', target: '95%+', good: cash > 0 ? cashAi / cash >= 0.95 : null },
    { key: 'over_90', label: 'AR over 90 days', value: total > 0 ? Math.round((over90 / total) * 1000) / 10 : 0, unit: '%', target: '< 2%', good: total > 0 ? over90 / total < 0.02 : true },
    { key: 'same_day', label: 'Invoiced the day of delivery', value: deliveredInvoices.length ? Math.round((sameDay / deliveredInvoices.length) * 100) : null, unit: '%', target: 'Same day', good: deliveredInvoices.length ? sameDay === deliveredInvoices.length : null },
    { key: 'unreconciled', label: 'Unreconciled AR (ledger 1100 − customer ledger)', value: round2(control - total), unit: '₹', target: '0', good: Math.abs(control - total) < 0.01 }
  ];
}

// ── Month-end checklist ─────────────────────────────────────────────────────

async function checklist(clientId, period) {
  const start = arPeriod.monthStart(period);
  const end = arPeriod.monthEnd(period);
  const cutoffFrom = addDays(end, -(CUTOFF_DAYS - 1));
  const cutoffTo = addDays(end, CUTOFF_DAYS);
  const [deliveredNotInvoiced, cutoffDeliveries, cutoffInvoices, pendingNotes, pendingWo, unapplied, eclRun, openInvoices, statements, customers] = await Promise.all([
    ArDelivery.findAll({ where: { client_id: clientId, status: 'DELIVERED', invoice_id: null, delivered_date: { [Op.lte]: end } }, include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }] }),
    ArDelivery.findAll({ where: { client_id: clientId, status: { [Op.ne]: 'CANCELLED' }, [Op.or]: [{ dispatch_date: { [Op.between]: [cutoffFrom, cutoffTo] } }, { delivered_date: { [Op.between]: [cutoffFrom, cutoffTo] } }] }, attributes: ['id', 'delivery_number', 'dispatch_date', 'delivered_date', 'invoice_id', 'status'] }),
    ArInvoice.findAll({ where: { client_id: clientId, status: { [Op.ne]: 'CANCELLED' }, invoice_date: { [Op.between]: [cutoffFrom, cutoffTo] } }, attributes: ['id', 'invoice_number', 'invoice_date', 'delivery_id', 'total_amount'] }),
    ArCreditNote.findAll({ where: { client_id: clientId, status: 'PENDING_APPROVAL' }, attributes: ['id', 'total_amount', 'createdAt'] }),
    ArWriteOff.findAll({ where: { client_id: clientId, status: 'PENDING_APPROVAL' }, attributes: ['id', 'amount', 'createdAt'] }),
    ArUnappliedCash.findAll({ where: { client_id: clientId, status: 'OPEN' }, include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }] }),
    ArEclRun.findOne({ where: { client_id: clientId, period, status: 'POSTED' } }),
    ArInvoice.findAll({ where: { client_id: clientId, status: OPEN_INVOICE }, attributes: INVOICE_ATTRS }),
    ArStatement.findAll({ where: { client_id: clientId, period_to: { [Op.between]: [start, addDays(end, 10)] } }, attributes: ['customer_id', 'delivery', 'response'] }),
    ArCustomer.findAll({ where: { client_id: clientId, status: 'ACTIVE' }, attributes: ['id', 'customer_name', 'credit_review_date'] })
  ]);
  const subledger = round2(openInvoices.reduce((s, i) => s + outstandingOf(i), 0));
  const gl1100 = await arJournal.accountBalance(clientId, '1100');
  const unappliedSub = round2(unapplied.reduce((s, u) => s + Number(u.amount) - Number(u.applied_amount), 0));
  const gl2060 = round2(-(await arJournal.accountBalance(clientId, '2060')));
  const staleUnapplied = unapplied.filter((u) => daysBetween(u.received_date, today()) > UNAPPLIED_CLEAR_DAYS);
  const credits = {};
  for (const u of unapplied) {
    if (!u.customer_id) continue;
    const c = credits[u.customer_id] || (credits[u.customer_id] = { customer_name: u.customer?.customer_name, amount: 0 });
    c.amount = round2(c.amount + Number(u.amount) - Number(u.applied_amount));
  }
  const bigCredits = Object.values(credits).filter((c) => c.amount > CREDIT_BALANCE_REVIEW);
  // A provision is needed when there are receivables, unless the allowance already equals what is required.
  const eclCalc = subledger > 0 && !eclRun ? await eclCalculate(clientId, period) : null;
  const eclNeeded = subledger > 0 && !eclRun && Math.abs(eclCalc.adjustment) >= 0.01;
  const withBalance = new Set(openInvoices.filter((i) => outstandingOf(i) > 0).map((i) => i.customer_id));
  const sentTo = new Set(statements.map((s) => s.customer_id));
  const notSent = [...withBalance].filter((id) => !sentTo.has(id)).length;
  const reviewsDue = customers.filter((c) => c.credit_review_date && c.credit_review_date < today());
  const items = [
    { key: 'tie_out', group: 'must', label: 'AR sub-ledger equals ledger account 1100', ok: Math.abs(gl1100 - subledger) < 0.01, detail: `Ledger ${inr(gl1100)} · customer ledger ${inr(subledger)} · difference ${inr(gl1100 - subledger)}` },
    { key: 'unapplied_tie', group: 'must', label: 'Unapplied cash equals ledger account 2060', ok: Math.abs(gl2060 - unappliedSub) < 0.01, detail: `Ledger ${inr(gl2060)} · unapplied payments ${inr(unappliedSub)}` },
    { key: 'unapplied_stale', group: 'must', label: `No unapplied cash older than ${UNAPPLIED_CLEAR_DAYS} days`, ok: staleUnapplied.length === 0, detail: staleUnapplied.length ? `${staleUnapplied.length} payment(s), ${inr(staleUnapplied.reduce((s, u) => s + Number(u.amount) - Number(u.applied_amount), 0))}: apply them in Collections → Unapplied cash` : 'None', path: '/finance/ar/collections?tab=unapplied' },
    { key: 'ecl', group: 'must', label: `Credit-loss provision posted for ${period}`, ok: !eclNeeded, detail: eclRun ? `Posted: allowance ${inr(eclRun.required)}` : eclNeeded ? `Allowance should be ${inr(eclCalc.required)} (ledger ${inr(eclCalc.existing)}): prepare and approve it in Credit Loss & Write-offs` : subledger > 0 ? `The allowance already equals the ${inr(eclCalc?.required)} required` : 'No receivables, so no provision is needed', path: '/finance/ar/credit-loss' },
    { key: 'delivered_not_invoiced', group: 'review', label: 'Goods delivered but not invoiced', ok: deliveredNotInvoiced.length === 0, detail: deliveredNotInvoiced.length ? deliveredNotInvoiced.map((d) => `${d.delivery_number} (${d.customer?.customer_name || ''}, delivered ${d.delivered_date})`).join('; ') : 'None', path: '/finance/ar/sales-orders?tab=deliveries' },
    { key: 'cutoff', group: 'review', label: `Cut-off: deliveries and invoices within ${CUTOFF_DAYS} days of month end`, ok: true, detail: `${cutoffDeliveries.length} deliver${cutoffDeliveries.length === 1 ? 'y' : 'ies'} and ${cutoffInvoices.length} invoice(s) between ${cutoffFrom} and ${cutoffTo}: check each is in the right month`, list: { deliveries: cutoffDeliveries, invoices: cutoffInvoices } },
    { key: 'pending_credit', group: 'review', label: 'Credit notes waiting for a decision', ok: pendingNotes.length === 0, detail: pendingNotes.length ? `${pendingNotes.length} request(s), ${inr(pendingNotes.reduce((s, n) => s + Number(n.total_amount), 0))}` : 'None', path: '/finance/ar/credit-notes' },
    { key: 'pending_writeoff', group: 'review', label: 'Write-offs waiting for a decision', ok: pendingWo.length === 0, detail: pendingWo.length ? `${pendingWo.length} request(s), ${inr(pendingWo.reduce((s, w) => s + Number(w.amount), 0))}` : 'None', path: '/finance/ar/credit-loss?tab=writeoffs' },
    { key: 'credit_balances', group: 'review', label: `Customer credits over ${inr(CREDIT_BALANCE_REVIEW)} (shown as a liability in 2060, not netted)`, ok: bigCredits.length === 0, detail: bigCredits.length ? bigCredits.map((c) => `${c.customer_name}: ${inr(c.amount)}`).join('; ') : 'None' },
    { key: 'statements', group: 'review', label: 'Customer statements sent for the month', ok: notSent === 0, detail: withBalance.size ? `${withBalance.size - notSent} of ${withBalance.size} customers with a balance` : 'No customer has a balance', path: '/finance/ar/ar-close?tab=statements' },
    { key: 'credit_reviews', group: 'review', label: 'Credit limit reviews due', ok: reviewsDue.length === 0, detail: reviewsDue.length ? reviewsDue.map((c) => c.customer_name).join(', ') : 'None', path: '/finance/ar/customers' }
  ];
  return { period, from: start, to: end, items, ready: items.filter((i) => i.group === 'must').every((i) => i.ok) };
}

exports.getClose = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const period = periodParam(req.query.period);
  const [record, check, kpi, history] = await Promise.all([
    arPeriod.closeOf(clientId, period), checklist(clientId, period), kpis(clientId),
    ArPeriodClose.findAll({ where: { client_id: clientId }, order: [['period', 'DESC']], limit: 24 })
  ]);
  const names = await userNames([record?.closed_by, record?.signed_off_by, record?.reopened_by, ...history.flatMap((h) => [h.closed_by, h.signed_off_by])]);
  const status = record?.status || 'OPEN';
  const open = ['OPEN', 'REOPENED'].includes(status);
  const role = String(req.user.role || '').toUpperCase();
  return res.json({
    success: true,
    data: {
      period, label: arPeriod.monthLabel(period), status, record: record ? { ...record.toJSON(), closed_by_name: names[record.closed_by] || null, signed_off_by_name: names[record.signed_off_by] || null, reopened_by_name: names[record.reopened_by] || null } : null,
      checklist: check, kpis: kpi,
      can_close: open && check.ready && period <= arPeriod.periodOf(today()),
      can_sign_off: status === 'CLOSED' && !approvals.controllerBlock(record, req.user, 'closed_by', 'AR close'),
      sign_off_block: status === 'CLOSED' ? approvals.controllerBlock(record, req.user, 'closed_by', 'AR close') : null,
      can_reopen: ['CLOSED', 'SIGNED_OFF'].includes(status) && (isAdmin(req.user.role) || role === 'DIRECTOR_CFO'),
      history: history.map((h) => ({ period: h.period, label: arPeriod.monthLabel(h.period), status: h.status, closed_by_name: names[h.closed_by] || null, signed_off_by_name: names[h.signed_off_by] || null, closed_at: h.closed_at, signed_off_at: h.signed_off_at }))
    }
  });
};

exports.closePeriod = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const period = periodParam(req.params.period);
  if (period > arPeriod.periodOf(today())) return fail(res, 422, 'A future month cannot be closed');
  const check = await checklist(clientId, period);
  if (!check.ready) return fail(res, 409, `The month cannot be closed yet: ${check.items.filter((i) => i.group === 'must' && !i.ok).map((i) => i.label).join('; ')}`, { checklist: check });
  const [record] = await ArPeriodClose.findOrCreate({ where: { client_id: clientId, period }, defaults: { client_id: clientId, period, status: 'OPEN' } });
  if (!['OPEN', 'REOPENED'].includes(record.status)) return fail(res, 409, `${arPeriod.monthLabel(period)} is already ${record.status === 'SIGNED_OFF' ? 'signed off' : 'closed'}`);
  const before = record.toJSON();
  await record.update({ status: 'CLOSED', checklist: check, closed_by: req.user.id, closed_at: new Date() });
  await recordAudit(req, { module: 'AR', entityType: 'AR_PERIOD_CLOSE', entityId: record.id, action: 'AR_PERIOD_CLOSED', before, after: record, note: `${arPeriod.monthLabel(period)} closed; AR postings dated in it are locked` });
  approvals.notify({
    clientId, roles: approvals.CONTROLLER_ROLES, except: req.user.id, subject: `AR close to sign off: ${arPeriod.monthLabel(period)}`,
    lines: [`Accounts Receivable closed ${arPeriod.monthLabel(period)}. The AR sub-ledger ties to the ledger and the checklist is clear.`, 'Finance or the Director / CFO signs it off in Accounts Receivable → AR Close.']
  });
  return res.json({ success: true, message: `${arPeriod.monthLabel(period)} closed. AR postings dated in it are now locked; Finance or the Director / CFO signs it off.` });
};

exports.signOff = async (req, res) => {
  const clientId = clientOf(req);
  const period = periodParam(req.params.period);
  const record = await arPeriod.closeOf(clientId, period);
  if (!record || record.status !== 'CLOSED') return fail(res, 409, 'This month is not waiting for sign-off');
  const block = approvals.controllerBlock(record, req.user, 'closed_by', 'AR close');
  if (block) return fail(res, 403, block.replace('prepared', 'closed').replace('approve', 'sign off'));
  const before = record.toJSON();
  await record.update({ status: 'SIGNED_OFF', signed_off_by: req.user.id, signed_off_at: new Date() });
  await recordAudit(req, { module: 'AR', entityType: 'AR_PERIOD_CLOSE', entityId: record.id, action: 'AR_PERIOD_SIGNED_OFF', before, after: record, note: `${arPeriod.monthLabel(period)} signed off` });
  return res.json({ success: true, message: `${arPeriod.monthLabel(period)} signed off` });
};

exports.reopen = async (req, res) => {
  const clientId = clientOf(req);
  const period = periodParam(req.params.period);
  if (!(isAdmin(req.user.role) || String(req.user.role || '').toUpperCase() === 'DIRECTOR_CFO')) return fail(res, 403, 'Reopening a closed month needs the Director / CFO');
  const record = await arPeriod.closeOf(clientId, period);
  if (!record || !['CLOSED', 'SIGNED_OFF'].includes(record.status)) return fail(res, 409, 'This month is not closed');
  const reason = text(req.body?.reason, 500);
  if (!reason) return fail(res, 400, 'Give the reason for reopening the month');
  const before = record.toJSON();
  await record.update({ status: 'REOPENED', reopened_by: req.user.id, reopened_at: new Date(), reopen_reason: reason, signed_off_by: null, signed_off_at: null });
  await recordAudit(req, { module: 'AR', entityType: 'AR_PERIOD_CLOSE', entityId: record.id, action: 'AR_PERIOD_REOPENED', before, after: record, note: reason });
  return res.json({ success: true, message: `${arPeriod.monthLabel(period)} reopened. Close it again when the corrections are posted.` });
};

// ── Customer statements of account ──────────────────────────────────────────

/** Every movement on a customer's account up to `to`, oldest first. */
async function movements(clientId, customerId, to) {
  const [invoices, notes, writeOffs, unapplied] = await Promise.all([
    ArInvoice.findAll({ where: { client_id: clientId, customer_id: customerId, status: { [Op.ne]: 'CANCELLED' }, invoice_date: { [Op.lte]: to } }, include: [{ model: ArReceipt, as: 'receipts' }] }),
    ArCreditNote.findAll({ where: { client_id: clientId, customer_id: customerId, status: 'APPROVED', credit_date: { [Op.lte]: to } } }),
    ArWriteOff.findAll({ where: { client_id: clientId, customer_id: customerId, status: 'APPROVED' } }),
    ArUnappliedCash.findAll({ where: { client_id: clientId, customer_id: customerId, received_date: { [Op.lte]: to } } })
  ]);
  const rows = [];
  for (const inv of invoices) {
    rows.push({ date: inv.invoice_date, type: 'Invoice', reference: inv.invoice_number, debit: Number(inv.total_amount), credit: 0 });
    for (const r of inv.receipts) {
      if (r.received_date > to) continue;
      // Money applied from unapplied cash was already shown when it arrived.
      if (!r.unapplied_id) rows.push({ date: r.received_date, type: 'Payment', reference: [inv.invoice_number, r.reference].filter(Boolean).join(' · '), debit: 0, credit: Number(r.amount) });
      if (Number(r.tds_amount) > 0) rows.push({ date: r.received_date, type: 'TDS deducted by you', reference: inv.invoice_number, debit: 0, credit: Number(r.tds_amount) });
      if (Number(r.discount_amount) > 0) rows.push({ date: r.received_date, type: 'Early-payment discount', reference: inv.invoice_number, debit: 0, credit: Number(r.discount_amount) });
    }
  }
  for (const n of notes) rows.push({ date: n.credit_date, type: 'Credit note', reference: n.credit_note_number, debit: 0, credit: Number(n.total_amount) });
  for (const w of writeOffs) {
    const date = new Date(w.approved_at).toISOString().slice(0, 10);
    const net = round2(Number(w.amount) - Number(w.recovered_amount));
    if (date <= to && net > 0) rows.push({ date, type: 'Written off', reference: w.write_off_number, debit: 0, credit: net });
  }
  for (const u of unapplied) rows.push({ date: u.received_date, type: 'Payment on account', reference: u.reference || '', debit: 0, credit: Number(u.amount) });
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.debit - a.debit));
}

async function buildStatement(clientId, customer, from, to) {
  const rows = await movements(clientId, customer.id, to);
  const opening = round2(rows.filter((r) => r.date < from).reduce((s, r) => s + r.debit - r.credit, 0));
  let running = opening;
  const lines = rows.filter((r) => r.date >= from).map((r) => {
    running = round2(running + r.debit - r.credit);
    return { ...r, balance: running };
  });
  const open = await ArInvoice.findAll({ where: { client_id: clientId, customer_id: customer.id, status: OPEN_INVOICE, invoice_date: { [Op.lte]: to } }, attributes: INVOICE_ATTRS });
  const ageing = { not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  for (const inv of open) {
    const d = inv.due_date ? daysBetween(inv.due_date, to) : 0;
    const k = d <= 0 ? 'not_due' : d <= 30 ? 'd0_30' : d <= 60 ? 'd31_60' : d <= 90 ? 'd61_90' : 'd90';
    ageing[k] = round2(ageing[k] + outstandingOf(inv));
  }
  return { customer: { id: customer.id, customer_name: customer.customer_name, customer_code: customer.customer_code, gst_number: customer.gst_number, email: customer.email, address: customer.address }, from, to, opening_balance: opening, lines, closing_balance: running, ageing };
}

function statementHtml(company, s) {
  const row = (l) => `<tr><td>${escapeHtml(l.date)}</td><td>${escapeHtml(l.type)}</td><td>${escapeHtml(l.reference)}</td><td style="text-align:right">${l.debit ? inr(l.debit) : ''}</td><td style="text-align:right">${l.credit ? inr(l.credit) : ''}</td><td style="text-align:right">${inr(l.balance)}</td></tr>`;
  return `<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:13px;line-height:1.5">
<p>Dear ${escapeHtml(s.customer.customer_name)},</p>
<p>Here is your statement of account with ${escapeHtml(company)} from ${escapeHtml(s.from)} to ${escapeHtml(s.to)}. Please check it and reply to confirm the closing balance, or tell us about any difference.</p>
<table style="border-collapse:collapse;width:100%" border="1" cellpadding="4">
<thead><tr style="background:#f1f5f9"><th>Date</th><th>Details</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
<tbody><tr><td>${escapeHtml(s.from)}</td><td colspan="4">Opening balance</td><td style="text-align:right">${inr(s.opening_balance)}</td></tr>${s.lines.map(row).join('')}
<tr style="font-weight:bold"><td>${escapeHtml(s.to)}</td><td colspan="4">Closing balance (amount you owe us)</td><td style="text-align:right">${inr(s.closing_balance)}</td></tr></tbody></table>
<p>Regards,<br>${escapeHtml(company)}</p></div>`;
}

exports.statement = async (req, res) => {
  const customer = await ArCustomer.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!customer) return fail(res, 404, 'Customer not found');
  const to = normalizeDate(req.query.to) || today();
  const from = normalizeDate(req.query.from) || `${to.slice(0, 7)}-01`;
  if (from > to) return fail(res, 422, 'The start date is after the end date');
  return res.json({ success: true, data: await buildStatement(customer.client_id, customer, from, to) });
};

exports.listStatements = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.period) {
    const p = periodParam(req.query.period);
    where.period_to = { [Op.between]: [arPeriod.monthStart(p), addDays(arPeriod.monthEnd(p), 10)] };
  }
  const rows = await ArStatement.findAll({ where, include: [{ model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name', 'email'] }], order: [['id', 'DESC']], limit: 1000 });
  const agreed = rows.filter((r) => r.response === 'AGREED').length;
  const disputed = rows.filter((r) => r.response === 'DISPUTED');
  return res.json({
    success: true, data: rows,
    summary: { sent: rows.length, emailed: rows.filter((r) => r.delivery === 'EMAILED').length, agreed, disputed: disputed.length, pending: rows.filter((r) => r.response === 'PENDING').length, difference: round2(disputed.reduce((s, r) => s + Number(r.difference || 0), 0)) }
  });
};

/** Sends statements for a period to the chosen customers (default: every customer with a balance or activity). */
exports.sendStatements = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const period = periodParam(req.body?.period);
  const from = normalizeDate(req.body?.from) || arPeriod.monthStart(period);
  const to = normalizeDate(req.body?.to) || (period === arPeriod.periodOf(today()) ? today() : arPeriod.monthEnd(period));
  const ids = Array.isArray(req.body?.customer_ids) ? req.body.customer_ids.map(Number).filter(Boolean) : null;
  const customers = await ArCustomer.findAll({ where: { client_id: clientId, status: { [Op.ne]: 'REJECTED' }, ...(ids ? { id: ids } : {}) } });
  const company = (await Client.findByPk(clientId, { attributes: ['client_name'] }))?.client_name || 'LedgerLine';
  const results = [];
  for (const c of customers) {
    const s = await buildStatement(clientId, c, from, to);
    if (!ids && !s.lines.length && Math.abs(s.closing_balance) < 0.01) continue;
    let delivery = 'NOT_SENT';
    let note = null;
    if (!c.email) note = 'Customer has no email address';
    else if (!notificationEmail.isConfigured()) note = 'Email is not configured on the server';
    else {
      const r = await notificationEmail.sendEmail({ to: c.email, subject: `Statement of account ${from} to ${to}: ${inr(s.closing_balance)}`, html: statementHtml(company, s) }).catch((e) => ({ error: e.message }));
      if (r?.success) delivery = 'EMAILED'; else note = r?.error || r?.reason || 'Email could not be sent';
    }
    const row = await ArStatement.create({
      client_id: clientId, customer_id: c.id, period_from: from, period_to: to, opening_balance: s.opening_balance, closing_balance: s.closing_balance,
      sent_to: c.email || null, delivery, delivery_note: note, response: 'PENDING', created_by: req.user.id
    });
    results.push({ id: row.id, customer_name: c.customer_name, closing_balance: s.closing_balance, delivery, note });
  }
  await recordAudit(req, { module: 'AR', entityType: 'AR_STATEMENT', entityId: 0, action: 'AR_STATEMENTS_SENT', note: `${results.length} statement(s) for ${from} to ${to}; ${results.filter((r) => r.delivery === 'EMAILED').length} emailed` });
  return res.json({ success: true, message: `${results.length} statement${results.length === 1 ? '' : 's'} prepared, ${results.filter((r) => r.delivery === 'EMAILED').length} emailed`, data: results });
};

/** The customer's reply to a statement: agreed, or disputed with the balance as per their books. */
exports.statementResponse = async (req, res) => {
  const row = await ArStatement.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!row) return fail(res, 404, 'Statement not found');
  const response = String(req.body?.response || '').toUpperCase();
  if (!['AGREED', 'DISPUTED'].includes(response)) return fail(res, 422, 'Choose whether the customer agreed or disputed the balance');
  const theirs = response === 'AGREED' ? Number(row.closing_balance) : round2(toNumber(req.body?.customer_balance));
  if (response === 'DISPUTED' && !Number.isFinite(theirs)) return fail(res, 422, 'Enter the balance as per the customer');
  const note = text(req.body?.note, 500);
  if (response === 'DISPUTED' && !note) return fail(res, 422, 'Note what the customer says the difference is');
  const before = row.toJSON();
  await row.update({ response, customer_balance: theirs, difference: round2(theirs - Number(row.closing_balance)), response_note: note, responded_at: new Date(), recorded_by: req.user.id });
  await recordAudit(req, { module: 'AR', entityType: 'AR_STATEMENT', entityId: row.id, action: response === 'AGREED' ? 'AR_STATEMENT_AGREED' : 'AR_STATEMENT_DISPUTED', before, after: row, note });
  return res.json({ success: true, message: response === 'AGREED' ? 'Balance confirmed by the customer' : `Difference of ${inr(row.difference)} recorded for follow-up`, data: row });
};

// ── GST sales register and GSTR-1 summary ───────────────────────────────────

const STATES = { '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', 10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal', 20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat', 26: 'Dadra & Nagar Haveli and Daman & Diu', 27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman & Nicobar', 36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh' };

async function salesRegister(clientId, period) {
  const from = arPeriod.monthStart(period);
  const to = arPeriod.monthEnd(period);
  const [invoices, notes, settings] = await Promise.all([
    ArInvoice.findAll({ where: { client_id: clientId, status: { [Op.ne]: 'CANCELLED' }, invoice_date: { [Op.between]: [from, to] } }, include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name', 'gst_number'] }], order: [['invoice_date', 'ASC'], ['id', 'ASC']] }),
    ArCreditNote.findAll({ where: { client_id: clientId, status: 'APPROVED', credit_date: { [Op.between]: [from, to] } }, include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name', 'gst_number'] }, { model: ArInvoice, as: 'invoice', attributes: ['invoice_number', 'invoice_date'] }] }),
    settingsOf(clientId)
  ]);
  const taxable = (inv) => round2(Number(inv.total_amount) - Number(inv.igst_amount) - Number(inv.cgst_amount) - Number(inv.sgst_amount) - Math.max(0, Number(inv.tax_amount) - Number(inv.igst_amount) - Number(inv.cgst_amount) - Number(inv.sgst_amount)));
  const rows = invoices.map((inv) => {
    const gstin = inv.customer?.gst_number || null;
    const unsplit = Math.max(0, round2(Number(inv.tax_amount) - Number(inv.igst_amount) - Number(inv.cgst_amount) - Number(inv.sgst_amount)));
    return {
      id: inv.id, section: gstin ? 'B2B' : 'B2C', invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, customer_name: inv.customer?.customer_name,
      gstin, place_of_supply: gstin ? `${gstin.slice(0, 2)}-${STATES[gstin.slice(0, 2)] || STATES[Number(gstin.slice(0, 2))] || ''}` : null,
      taxable_value: taxable(inv), igst: round2(Number(inv.igst_amount) + unsplit), cgst: Number(inv.cgst_amount), sgst: Number(inv.sgst_amount), total: Number(inv.total_amount),
      irn: inv.irn || null, irn_missing: settings.einvoice_applies && !!gstin && !inv.irn, no_delivery: !inv.delivery_id
    };
  });
  const cdnr = notes.map((n) => ({
    id: n.id, section: n.customer?.gst_number ? 'CDNR' : 'CDNUR', credit_note_number: n.credit_note_number, credit_date: n.credit_date, customer_name: n.customer?.customer_name,
    gstin: n.customer?.gst_number || null, original_invoice: n.invoice?.invoice_number, original_date: n.invoice?.invoice_date, reason: n.reason_code,
    taxable_value: Number(n.subtotal), igst: Number(n.igst_amount), cgst: Number(n.cgst_amount), sgst: Number(n.sgst_amount), total: Number(n.total_amount)
  }));
  const hsn = {};
  for (const inv of invoices) {
    for (const l of Array.isArray(inv.line_items) ? inv.line_items : []) {
      const key = `${l.hsn_code || 'Not given'}|${Number(l.gst_percent || 0)}`;
      const h = hsn[key] || (hsn[key] = { hsn_code: l.hsn_code || 'Not given', gst_percent: Number(l.gst_percent || 0), quantity: 0, taxable_value: 0, tax: 0 });
      h.quantity = Math.round((h.quantity + Number(l.quantity || 0)) * 1000) / 1000;
      h.taxable_value = round2(h.taxable_value + Number(l.amount || 0));
      h.tax = round2(h.tax + Number(l.gst_amount || 0));
    }
  }
  const sum = (list, k) => round2(list.reduce((s, r) => s + Number(r[k] || 0), 0));
  const section = (name, list) => ({ section: name, count: list.length, taxable_value: sum(list, 'taxable_value'), igst: sum(list, 'igst'), cgst: sum(list, 'cgst'), sgst: sum(list, 'sgst'), total: sum(list, 'total') });
  const b2b = rows.filter((r) => r.section === 'B2B');
  const b2c = rows.filter((r) => r.section === 'B2C');
  const out = section('Net output tax', []);
  for (const k of ['taxable_value', 'igst', 'cgst', 'sgst', 'total']) out[k] = round2(sum(rows, k) - sum(cdnr, k));
  return {
    period, from, to, einvoice_applies: settings.einvoice_applies, invoices: rows, credit_notes: cdnr, hsn: Object.values(hsn),
    summary: [section('B2B invoices', b2b), section('B2C invoices', b2c), section('Credit notes (CDNR / CDNUR)', cdnr), out],
    net_tax: round2(out.igst + out.cgst + out.sgst),
    irn_missing: rows.filter((r) => r.irn_missing).length
  };
}

exports.gstRegister = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  return res.json({ success: true, data: await salesRegister(clientId, periodParam(req.query.period)) });
};

// ── Waiting for me ──────────────────────────────────────────────────────────

exports.tasks = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.json({ success: true, data: [] });
  const items = await approvals.pending(clientId, req.user);
  return res.json({ success: true, data: items.map(({ roles, ...i }) => i) });
};

exports.kpis = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  return res.json({ success: true, data: await kpis(clientId) });
};

module.exports.salesRegister = salesRegister;
module.exports.checklist = checklist;
