'use strict';

/**
 * Credit-loss provision and write-offs (blueprint O2C steps 8 and 9; Ind AS 109 expected credit loss).
 *
 * ECL: at month end the open receivables are aged; each bucket's balance x its loss rate, plus any
 * specific reserve for a named problem customer (which replaces the bucket rates for that customer),
 * gives the required allowance. The difference from the allowance account (1105) is the top-up or
 * release. Accounts Receivable prepares it; Finance or the Director / CFO (not the preparer)
 * approves, and only then is it posted. Loss rates are reviewed by Finance / the Director.
 *
 * Write-off: requested on an invoice with a reason, evidence and the collection history; approved
 * within the write-off limit (Finance up to ₹1,00,000, Director / CFO above) by someone other than
 * the requester. Posted against the allowance; anything the allowance does not cover goes to credit
 * loss expense. A later recovery reinstates the receivable and the cash is then received normally.
 */
const { Op } = require('sequelize');
const {
  sequelize, ArInvoice, ArCustomer, ArWriteOff, ArEclSetting, ArEclRun, ArReminder, ArPromise, User, JournalEntry, JournalLine
} = require('../models');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { recordAudit, documentHistory } = require('../utils/financeAudit');
const { getNextNumber } = require('../services/documentNumbering');
const { toNumber } = require('../services/invoiceExtraction.service');
const { outstandingOf, settledStatus, OPEN_INVOICE } = require('../services/arCredit.service');
const arJournal = require('../services/arJournal.service');
const arPeriod = require('../services/arPeriod.service');
const approvals = require('../services/arApproval.service');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((new Date(to) - new Date(from)) / 86400000);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const text = (v, max = 255) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nameOf = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);
const clientOf = (req) => buildAdminWhere(req).client_id || getClientId(req);

async function userNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const users = await User.findAll({ where: { id: { [Op.in]: list } }, attributes: ['id', 'first_name', 'last_name', 'email'] });
  return Object.fromEntries(users.map((u) => [u.id, nameOf(u)]));
}

// ── Settings: loss rates, specific reserves, e-invoicing ─────────────────────

const BUCKETS = [
  { key: 'not_due', label: 'Not yet due', from: -Infinity, to: 0 },
  { key: 'd0_30', label: '1–30 days', from: 1, to: 30 },
  { key: 'd31_60', label: '31–60 days', from: 31, to: 60 },
  { key: 'd61_90', label: '61–90 days', from: 61, to: 90 },
  { key: 'd90', label: 'Over 90 days', from: 91, to: Infinity }
];
const DEFAULT_RATES = { not_due: 0.4, d0_30: 1, d31_60: 3, d61_90: 8, d90: 25 };
const bucketOf = (days) => BUCKETS.find((b) => days >= b.from && days <= b.to) || BUCKETS[0];

async function settingsOf(clientId) {
  const row = await ArEclSetting.findOne({ where: { client_id: clientId } });
  return {
    rates: { ...DEFAULT_RATES, ...(row?.rates || {}) },
    specific: Array.isArray(row?.specific) ? row.specific : [],
    einvoice_applies: !!row?.einvoice_applies,
    updated_by: row?.updated_by || null, reviewed_at: row?.reviewed_at || null, saved: !!row
  };
}

exports.getSettings = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const s = await settingsOf(clientId);
  const names = await userNames([s.updated_by]);
  const customers = s.specific.length ? await ArCustomer.findAll({ where: { client_id: clientId, id: s.specific.map((x) => x.customer_id) }, attributes: ['id', 'customer_name'] }) : [];
  const byId = Object.fromEntries(customers.map((c) => [c.id, c.customer_name]));
  return res.json({
    success: true,
    data: {
      ...s, specific: s.specific.map((x) => ({ ...x, customer_name: byId[x.customer_id] || null })), updated_by_name: names[s.updated_by] || null,
      buckets: BUCKETS.map((b) => ({ key: b.key, label: b.label })), can_edit: approvals.isController(req.user.role)
    }
  });
};

/** Loss rates and specific reserves are set by Finance or the Director / CFO (reviewed by the controller). */
exports.saveSettings = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  if (!approvals.isController(req.user.role)) return fail(res, 403, 'Loss rates and specific reserves are set by Finance or the Director / CFO');
  const body = req.body || {};
  const current = await settingsOf(clientId);
  const rates = { ...current.rates };
  if (body.rates) {
    for (const b of BUCKETS) {
      if (body.rates[b.key] === undefined) continue;
      const v = toNumber(body.rates[b.key]);
      if (v === null || v < 0 || v > 100) return fail(res, 422, `The loss rate for ${b.label} must be between 0 and 100%`);
      rates[b.key] = round2(v);
    }
  }
  let specific = current.specific;
  if (Array.isArray(body.specific)) {
    specific = [];
    for (const x of body.specific) {
      const customerId = Number(x.customer_id);
      const amount = round2(toNumber(x.amount));
      const reason = text(x.reason, 255);
      if (!customerId) continue;
      if (!(amount >= 0)) return fail(res, 422, 'A specific reserve cannot be negative');
      if (!reason) return fail(res, 422, 'Give the reason for each specific reserve');
      if (!(await ArCustomer.findOne({ where: { client_id: clientId, id: customerId } }))) return fail(res, 404, 'A customer in the specific reserves was not found');
      if (specific.some((s) => s.customer_id === customerId)) return fail(res, 422, 'A customer appears twice in the specific reserves');
      specific.push({ customer_id: customerId, amount, reason });
    }
  }
  const einvoice = body.einvoice_applies === undefined ? current.einvoice_applies : !!body.einvoice_applies;
  const [row] = await ArEclSetting.findOrCreate({ where: { client_id: clientId }, defaults: { client_id: clientId } });
  const before = row.toJSON();
  await row.update({ rates, specific, einvoice_applies: einvoice, updated_by: req.user.id, reviewed_at: new Date() });
  await recordAudit(req, { module: 'AR', entityType: 'AR_SETTINGS', entityId: row.id, action: 'AR_ECL_SETTINGS_SAVED', before, after: row, note: 'Loss rates / specific reserves / e-invoicing reviewed' });
  return res.json({ success: true, message: 'Saved. The next credit-loss calculation uses these rates.', data: await settingsOf(clientId) });
};

// ── ECL calculation and runs ────────────────────────────────────────────────

/** The allowance the receivables need on `asOf`, and the allowance in the ledger now. */
async function calculate(clientId, period) {
  const asOf = period >= arPeriod.periodOf(today()) ? today() : arPeriod.monthEnd(period);
  const settings = await settingsOf(clientId);
  const open = await ArInvoice.findAll({
    where: { client_id: clientId, status: OPEN_INVOICE, invoice_date: { [Op.lte]: asOf } },
    include: [{ model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name'] }]
  });
  const specificBy = Object.fromEntries(settings.specific.map((s) => [s.customer_id, s]));
  const rows = Object.fromEntries(BUCKETS.map((b) => [b.key, { key: b.key, label: b.label, balance: 0, rate: Number(settings.rates[b.key] || 0), allowance: 0 }]));
  const specificRows = {};
  for (const inv of open) {
    const amount = outstandingOf(inv);
    if (!(amount > 0)) continue;
    if (specificBy[inv.customer_id]) {
      const s = specificRows[inv.customer_id] || (specificRows[inv.customer_id] = { customer_id: inv.customer_id, customer_name: inv.customer?.customer_name, balance: 0, reserve: Number(specificBy[inv.customer_id].amount), reason: specificBy[inv.customer_id].reason });
      s.balance = round2(s.balance + amount);
      continue;
    }
    const days = inv.due_date ? daysBetween(inv.due_date, asOf) : 0;
    rows[bucketOf(days).key].balance = round2(rows[bucketOf(days).key].balance + amount);
  }
  for (const r of Object.values(rows)) r.allowance = round2((r.balance * r.rate) / 100);
  // A specific reserve is capped at what the customer owes.
  const specific = Object.values(specificRows).map((s) => ({ ...s, allowance: round2(Math.min(s.reserve, s.balance)) }));
  const required = round2(Object.values(rows).reduce((s, r) => s + r.allowance, 0) + specific.reduce((s, r) => s + r.allowance, 0));
  const existing = round2(-(await arJournal.accountBalance(clientId, '1105')));
  return {
    period, as_of: asOf, buckets: Object.values(rows), specific, required, existing, adjustment: round2(required - existing),
    receivables: round2(Object.values(rows).reduce((s, r) => s + r.balance, 0) + specific.reduce((s, r) => s + r.balance, 0))
  };
}

const decorateRun = (run, user, names = {}) => {
  const j = run.toJSON ? run.toJSON() : run;
  const block = j.status === 'PENDING_APPROVAL' ? approvals.controllerBlock(j, user, 'prepared_by', 'provision') : null;
  return { ...j, can_approve: j.status === 'PENDING_APPROVAL' && !block, approve_block: block, prepared_by_name: names[j.prepared_by] || null, approved_by_name: names[j.approved_by] || null };
};

exports.eclPreview = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const period = /^\d{4}-\d{2}$/.test(String(req.query.period || '')) ? req.query.period : arPeriod.periodOf(today());
  return res.json({ success: true, data: await calculate(clientId, period) });
};

exports.listRuns = async (req, res) => {
  const runs = await ArEclRun.findAll({ where: { ...buildAdminWhere(req) }, order: [['id', 'DESC']], limit: 100 });
  const names = await userNames(runs.flatMap((r) => [r.prepared_by, r.approved_by]));
  return res.json({ success: true, data: runs.map((r) => decorateRun(r, req.user, names)) });
};

/** Accounts Receivable prepares the month's provision; it waits for Finance / the Director. */
exports.createRun = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const period = String(req.body?.period || '');
  if (!/^\d{4}-\d{2}$/.test(period)) return fail(res, 422, 'Choose the month (YYYY-MM)');
  if (period > arPeriod.periodOf(today())) return fail(res, 422, 'A provision cannot be prepared for a future month');
  const calc = await calculate(clientId, period);
  const locked = await arPeriod.lockMessage(clientId, calc.as_of);
  if (locked) return fail(res, 423, locked);
  const existing = await ArEclRun.findOne({ where: { client_id: clientId, period, status: ['PENDING_APPROVAL', 'POSTED'] } });
  if (existing?.status === 'PENDING_APPROVAL') return fail(res, 409, `The ${period} provision is already waiting for approval`);
  if (existing?.status === 'POSTED') return fail(res, 409, `The ${period} provision is already posted. Next month's run adjusts the allowance again.`);
  if (Math.abs(calc.adjustment) < 0.01) return fail(res, 409, `The allowance already equals the ${inr(calc.required)} required; nothing to post for ${period}`);
  const run = await ArEclRun.create({
    client_id: clientId, period, as_of: calc.as_of, buckets: { buckets: calc.buckets, specific: calc.specific, receivables: calc.receivables },
    required: calc.required, existing: calc.existing, adjustment: calc.adjustment, status: 'PENDING_APPROVAL', prepared_by: req.user.id
  });
  await recordAudit(req, { module: 'AR', entityType: 'AR_ECL_RUN', entityId: run.id, action: 'AR_ECL_PREPARED', after: run, note: `${period}: required ${inr(calc.required)}, ${calc.adjustment >= 0 ? 'top-up' : 'release'} ${inr(Math.abs(calc.adjustment))}` });
  approvals.notify({
    clientId, roles: approvals.CONTROLLER_ROLES, except: req.user.id, subject: `Credit-loss provision to approve: ${period}`,
    lines: [`The expected credit loss for ${period} needs an allowance of ${inr(calc.required)}; the ledger holds ${inr(calc.existing)}.`, `${calc.adjustment >= 0 ? 'Top-up' : 'Release'} of ${inr(Math.abs(calc.adjustment))} is waiting for Finance or the Director / CFO.`]
  });
  return res.status(201).json({ success: true, message: `Provision for ${period} prepared and sent to Finance / the Director / CFO for approval`, data: decorateRun(run, req.user) });
};

exports.approveRun = async (req, res) => {
  const run = await ArEclRun.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!run) return fail(res, 404, 'Provision not found');
  if (run.status !== 'PENDING_APPROVAL') return fail(res, 409, 'This provision is not waiting for approval');
  const block = approvals.controllerBlock(run, req.user, 'prepared_by', 'provision');
  if (block) return fail(res, 403, block);
  const locked = await arPeriod.lockMessage(run.client_id, run.as_of);
  if (locked) return fail(res, 423, locked);
  // Write-offs since it was prepared change the allowance: post exactly what is needed now.
  const existing = round2(-(await arJournal.accountBalance(run.client_id, '1105')));
  const adjustment = round2(Number(run.required) - existing);
  const before = run.toJSON();
  await run.update({ existing, adjustment, status: 'POSTED', approved_by: req.user.id, approved_at: new Date(), decision_note: text(req.body?.note, 500) });
  const entry = Math.abs(adjustment) >= 0.01 ? await arJournal.safely(`ecl ${run.id}`, () => arJournal.postEcl(run.id)) : null;
  if (entry) await run.update({ journal_entry_id: entry.id });
  await recordAudit(req, { module: 'AR', entityType: 'AR_ECL_RUN', entityId: run.id, action: 'AR_ECL_POSTED', before, after: run, note: `${adjustment >= 0 ? 'Top-up' : 'Release'} ${inr(Math.abs(adjustment))}; allowance now ${inr(run.required)}` });
  return res.json({ success: true, message: `Provision posted: allowance now ${inr(run.required)} (${adjustment >= 0 ? 'top-up' : 'release'} ${inr(Math.abs(adjustment))})`, data: decorateRun(run, req.user) });
};

exports.rejectRun = async (req, res) => {
  const run = await ArEclRun.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!run) return fail(res, 404, 'Provision not found');
  if (run.status !== 'PENDING_APPROVAL') return fail(res, 409, 'This provision is not waiting for approval');
  const block = approvals.controllerBlock(run, req.user, 'prepared_by', 'provision');
  if (block) return fail(res, 403, block);
  const reason = text(req.body?.note, 500);
  if (!reason) return fail(res, 400, 'Say why the provision is rejected');
  const before = run.toJSON();
  await run.update({ status: 'REJECTED', approved_by: req.user.id, approved_at: new Date(), decision_note: reason });
  await recordAudit(req, { module: 'AR', entityType: 'AR_ECL_RUN', entityId: run.id, action: 'AR_ECL_REJECTED', before, after: run, note: reason });
  return res.json({ success: true, message: 'Provision rejected', data: decorateRun(run, req.user) });
};

// ── Write-offs ──────────────────────────────────────────────────────────────

const woInclude = [
  { model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name'] },
  { model: ArInvoice, as: 'invoice', attributes: ['id', 'invoice_number', 'invoice_date', 'due_date', 'total_amount', 'status'] }
];
const decorateWo = (wo, user, names = {}) => {
  const j = wo.toJSON ? wo.toJSON() : wo;
  const block = j.status === 'PENDING_APPROVAL' ? approvals.writeOffBlock(j, user) : null;
  return {
    ...j, can_approve: j.status === 'PENDING_APPROVAL' && !block, approve_block: block,
    approval_needs: j.status === 'PENDING_APPROVAL' ? approvals.writeOffNeeds(j.amount) : null,
    recoverable: j.status === 'APPROVED' ? round2(Number(j.amount) - Number(j.recovered_amount)) : 0,
    requested_by_name: names[j.requested_by] || null, approved_by_name: names[j.approved_by] || null
  };
};

exports.listWriteOffs = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.status) where.status = String(req.query.status).split(',');
  const rows = await ArWriteOff.findAll({ where, include: woInclude, order: [['id', 'DESC']], limit: 1000 });
  const names = await userNames(rows.flatMap((r) => [r.requested_by, r.approved_by]));
  const data = rows.map((r) => decorateWo(r, req.user, names));
  const approved = data.filter((r) => r.status === 'APPROVED');
  const clientId = clientOf(req);
  return res.json({
    success: true, data,
    summary: {
      pending: data.filter((r) => r.status === 'PENDING_APPROVAL').length, waiting_for_me: data.filter((r) => r.can_approve).length,
      written_off: round2(approved.reduce((s, r) => s + Number(r.amount), 0)), recovered: round2(approved.reduce((s, r) => s + Number(r.recovered_amount), 0)),
      allowance: clientId ? round2(-(await arJournal.accountBalance(clientId, '1105'))) : 0,
      limits: { finance: approvals.writeOffLimitOf('FINANCE'), director: Number.isFinite(approvals.writeOffLimitOf('DIRECTOR_CFO')) ? approvals.writeOffLimitOf('DIRECTOR_CFO') : null }
    }
  });
};

/** The collection history attached to a write-off: evidence that the debt was chased. */
async function collectionSummary(invoice) {
  const [reminders, promises] = await Promise.all([
    ArReminder.findAll({ where: { invoice_id: invoice.id }, attributes: ['stage', 'delivery', 'createdAt'], order: [['id', 'ASC']] }),
    ArPromise.findAll({ where: { invoice_id: invoice.id }, attributes: ['status', 'promised_date', 'amount'] })
  ]);
  const days = invoice.due_date ? Math.max(0, daysBetween(invoice.due_date, today())) : 0;
  const broken = promises.filter((p) => p.status === 'BROKEN').length;
  const last = reminders.length ? new Date(reminders[reminders.length - 1].createdAt).toISOString().slice(0, 10) : null;
  return [
    `${days} days overdue`,
    reminders.length ? `${reminders.length} reminder${reminders.length === 1 ? '' : 's'} (last ${last}, ${[...new Set(reminders.map((r) => r.stage).filter(Boolean))].join(', ').toLowerCase() || 'manual'})` : 'no reminders sent',
    promises.length ? `${promises.length} promise${promises.length === 1 ? '' : 's'} to pay, ${broken} broken` : 'no promises to pay'
  ].join('; ');
}

exports.createWriteOff = async (req, res) => {
  const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (!OPEN_INVOICE.includes(invoice.status)) return fail(res, 409, 'Only an invoice with an amount still owed can be written off');
  const reason = text(req.body?.reason, 500);
  if (!reason) return fail(res, 422, 'Give the reason the debt cannot be collected (e.g. insolvency, customer closed down)');
  if (!req.evidence) return fail(res, 422, 'Attach the evidence (e.g. insolvency notice, legal advice, final demand)');
  const pending = Number(await ArWriteOff.sum('amount', { where: { invoice_id: invoice.id, status: 'PENDING_APPROVAL' } }) || 0);
  const room = round2(outstandingOf(invoice) - pending);
  const amount = round2(toNumber(req.body?.amount) ?? room);
  if (!(amount > 0) || amount > room + 0.005) return fail(res, 422, `The amount must be between 0 and the ${inr(room)} still owed${pending ? ' (after write-offs already requested)' : ''}`);
  const wo = await ArWriteOff.create({
    client_id: invoice.client_id, customer_id: invoice.customer_id, invoice_id: invoice.id, amount, reason,
    evidence_url: req.evidence.url, evidence_name: req.evidence.name, collection_summary: await collectionSummary(invoice),
    status: 'PENDING_APPROVAL', requested_by: req.user.id
  });
  await recordAudit(req, { module: 'AR', entityType: 'AR_WRITE_OFF', entityId: wo.id, action: 'AR_WRITE_OFF_REQUESTED', after: wo, note: `${inr(amount)}: ${reason}` });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_WRITE_OFF_REQUESTED', note: `Write-off of ${inr(amount)} requested (#${wo.id}): ${reason}` });
  const customer = await ArCustomer.findByPk(invoice.customer_id, { attributes: ['customer_name'] });
  approvals.notify({
    clientId: invoice.client_id, roles: approvals.writeOffRoles(amount), except: req.user.id, subject: `Write-off to approve: ${invoice.invoice_number}`,
    lines: [`A write-off of ${inr(amount)} on ${invoice.invoice_number} (${customer?.customer_name || 'customer'}) is requested: ${reason}.`, `Collection history: ${wo.collection_summary}.`, `It needs ${approvals.writeOffNeeds(amount)}.`]
  });
  return res.status(201).json({ success: true, message: `Write-off of ${inr(amount)} sent for approval (needs ${approvals.writeOffNeeds(amount)})`, data: decorateWo(wo, req.user) });
};

exports.approveWriteOff = async (req, res) => {
  const wo = await ArWriteOff.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!wo) return fail(res, 404, 'Write-off not found');
  if (wo.status !== 'PENDING_APPROVAL') return fail(res, 409, 'This write-off is not waiting for approval');
  const block = approvals.writeOffBlock(wo, req.user);
  if (block) return fail(res, 403, block);
  const locked = await arPeriod.lockMessage(wo.client_id, today());
  if (locked) return fail(res, 423, locked);
  const before = wo.toJSON();
  const allowance = Math.max(0, round2(-(await arJournal.accountBalance(wo.client_id, '1105'))));
  const outcome = await sequelize.transaction(async (transaction) => {
    const invoice = await ArInvoice.findByPk(wo.invoice_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice || !OPEN_INVOICE.includes(invoice.status)) return { status: 409, message: 'The invoice has nothing left owing' };
    if (Number(wo.amount) > outstandingOf(invoice) + 0.005) return { status: 409, message: `Only ${inr(outstandingOf(invoice))} is still owed; reject this request and raise a smaller one` };
    const used = round2(Math.min(Number(wo.amount), allowance));
    await wo.update({
      status: 'APPROVED', write_off_number: await getNextNumber(wo.client_id, 'AR_WRITE_OFF', transaction), approved_by: req.user.id, approved_at: new Date(),
      decision_note: text(req.body?.note, 500), allowance_used: used, expense_amount: round2(Number(wo.amount) - used)
    }, { transaction });
    const invBefore = invoice.toJSON();
    const next = { written_off_amount: round2(Number(invoice.written_off_amount || 0) + Number(wo.amount)) };
    await invoice.update({ ...next, status: settledStatus({ ...invoice.toJSON(), ...next }) }, { transaction });
    return { invoice, invBefore };
  });
  if (outcome.status) return fail(res, outcome.status, outcome.message);
  await recordAudit(req, { module: 'AR', entityType: 'AR_WRITE_OFF', entityId: wo.id, action: 'AR_WRITE_OFF_APPROVED', before, after: wo, note: `${wo.write_off_number}: ${inr(wo.amount)} (${inr(wo.allowance_used)} from the allowance)` });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: outcome.invoice.id, action: 'AR_WRITE_OFF_APPROVED', before: outcome.invBefore, after: outcome.invoice, note: `${wo.write_off_number}: ${inr(wo.amount)} written off` });
  await arJournal.safely(`write-off ${wo.id}`, () => arJournal.postWriteOff(wo.id));
  return res.json({ success: true, message: `Written off ${inr(wo.amount)} (${wo.write_off_number}); ${inr(wo.allowance_used)} from the allowance${Number(wo.expense_amount) > 0 ? `, ${inr(wo.expense_amount)} to credit-loss expense` : ''}`, data: decorateWo(wo, req.user) });
};

exports.rejectWriteOff = async (req, res) => {
  const wo = await ArWriteOff.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!wo) return fail(res, 404, 'Write-off not found');
  if (wo.status !== 'PENDING_APPROVAL') return fail(res, 409, 'This write-off is not waiting for approval');
  const reason = text(req.body?.note, 500);
  if (!reason) return fail(res, 400, 'Say why the write-off is rejected');
  const own = Number(wo.requested_by) === Number(req.user.id);
  const block = own ? null : approvals.writeOffBlock(wo, req.user);
  if (block) return fail(res, 403, block.replace('approve', 'decide'));
  const before = wo.toJSON();
  await wo.update({ status: own ? 'CANCELLED' : 'REJECTED', approved_by: req.user.id, approved_at: new Date(), decision_note: reason });
  await recordAudit(req, { module: 'AR', entityType: 'AR_WRITE_OFF', entityId: wo.id, action: own ? 'AR_WRITE_OFF_WITHDRAWN' : 'AR_WRITE_OFF_REJECTED', before, after: wo, note: reason });
  return res.json({ success: true, message: own ? 'Write-off request withdrawn' : 'Write-off rejected; the invoice stays on the collections worklist', data: decorateWo(wo, req.user) });
};

/** Money turns up on a written-off debt: reinstate that much of the receivable, then receive it normally. */
exports.recoverWriteOff = async (req, res) => {
  const wo = await ArWriteOff.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!wo) return fail(res, 404, 'Write-off not found');
  if (wo.status !== 'APPROVED') return fail(res, 409, 'Only an approved write-off can be recovered');
  const left = round2(Number(wo.amount) - Number(wo.recovered_amount));
  const amount = round2(toNumber(req.body?.amount));
  if (!(amount > 0) || amount > left + 0.005) return fail(res, 422, `Enter an amount between 0 and the ${inr(left)} written off and not yet recovered`);
  const locked = await arPeriod.lockMessage(wo.client_id, today());
  if (locked) return fail(res, 423, locked);
  const before = wo.toJSON();
  const seq = (await JournalEntry.count({ where: { client_id: wo.client_id, source_module: 'AR_WRITE_OFF', source_id: wo.id, event_type: 'AR_WRITE_OFF_RECOVERY' } })) + 1;
  const invoice = await sequelize.transaction(async (transaction) => {
    const inv = await ArInvoice.findByPk(wo.invoice_id, { transaction, lock: transaction.LOCK.UPDATE });
    await wo.update({ recovered_amount: round2(Number(wo.recovered_amount) + amount) }, { transaction });
    const next = { written_off_amount: Math.max(0, round2(Number(inv.written_off_amount || 0) - amount)) };
    await inv.update({ ...next, status: settledStatus({ ...inv.toJSON(), ...next }) }, { transaction });
    return inv;
  });
  await arJournal.safely(`write-off recovery ${wo.id}`, () => arJournal.postWriteOffRecovery(wo.id, seq, amount, today()));
  await recordAudit(req, { module: 'AR', entityType: 'AR_WRITE_OFF', entityId: wo.id, action: 'AR_WRITE_OFF_RECOVERED', before, after: wo, note: `${inr(amount)} reinstated` });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_WRITE_OFF_RECOVERED', note: `${inr(amount)} reinstated from ${wo.write_off_number}; record the receipt in Collections` });
  return res.json({ success: true, message: `${inr(amount)} reinstated on ${invoice.invoice_number}. Now record the payment in Collections → Receive payment.`, data: decorateWo(wo, req.user) });
};

exports.writeOffDetail = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const wo = await ArWriteOff.findOne({ where: { ...tenantWhere, id: req.params.id }, include: woInclude });
  if (!wo) return fail(res, 404, 'Write-off not found');
  const [names, history, journals] = await Promise.all([
    userNames([wo.requested_by, wo.approved_by]),
    documentHistory(tenantWhere, 'AR_WRITE_OFF', wo.id),
    JournalEntry.findAll({ where: { client_id: wo.client_id, source_module: 'AR_WRITE_OFF', source_id: wo.id }, include: [{ model: JournalLine, as: 'lines' }], order: [['id', 'ASC']] })
  ]);
  return res.json({ success: true, data: { ...decorateWo(wo, req.user, names), history, journals } });
};

module.exports.calculate = calculate;
module.exports.settingsOf = settingsOf;
