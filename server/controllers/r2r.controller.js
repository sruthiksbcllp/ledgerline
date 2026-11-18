'use strict';

/**
 * Record to Report on the real ledger (FDS sections 15-28). The Chart of Accounts, General Ledger,
 * Trial Balance and Financial Statements read the posted journals (journal_entries / journal_lines),
 * never the transaction tables: Transaction -> Sub-ledger -> Journal -> GL -> Trial Balance ->
 * Statements. They show every posted journal, AR and AP alike, read-only; nothing here changes an
 * Accounts Payable posting.
 *
 * Manual journals are maker-checker: one person prepares, another (Finance or the Director / CFO)
 * approves, and only then are they posted. They must balance and may not touch control accounts,
 * which only their sub-ledgers post. Reconciliations (bank, GST, customer) and the FDS section 25
 * period-close checklist are kept on the server with who did what; once "Period closed" is ticked,
 * no manual journal dated in that month is accepted.
 */
const { Op } = require('sequelize');
const {
  GlAccount, JournalEntry, JournalLine, R2rManualJournal, R2rCloseTask, R2rReconciliation, ArStatement, User, sequelize
} = require('../models');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { recordAudit } = require('../utils/financeAudit');
const { getNextNumber } = require('../services/documentNumbering');
const { normalizeDate, toNumber } = require('../services/invoiceExtraction.service');
const { isAdmin } = require('../services/billApproval.service');
const apJournal = require('../services/apJournal.service');
const arJournal = require('../services/arJournal.service');
const arPeriod = require('../services/arPeriod.service');
const approvals = require('../services/arApproval.service');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const text = (v, max = 255) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nameOf = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);
const clientOf = (req) => buildAdminWhere(req).client_id || getClientId(req);
const periodParam = (v) => (/^\d{4}-\d{2}$/.test(String(v || '')) ? String(v) : arPeriod.periodOf(today()));
const roleCode = (role) => String(role || '').toUpperCase().replace(/\s+/g, '_');

/** Sub-ledger control accounts: posted only by their sub-ledger, never by a manual journal. */
const CONTROL_ACCOUNTS = {
  1100: 'Accounts receivable (AR sub-ledger)', 1105: 'Allowance for credit losses (AR credit-loss provision)', 2060: 'Unapplied cash (AR cash application)',
  2010: 'Accounts payable (AP sub-ledger)', 2015: 'GR/IR clearing (AP goods receipt)', 1300: 'Advances to vendors (AP)', 2160: 'TDS payable (AP)'
};
const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const typeFromCode = (code) => ({ 1: 'ASSET', 2: 'LIABILITY', 3: 'EQUITY', 4: 'INCOME' }[String(code)[0]] || 'EXPENSE');

async function userNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const users = await User.findAll({ where: { id: { [Op.in]: list } }, attributes: ['id', 'first_name', 'last_name', 'email'] });
  return Object.fromEntries(users.map((u) => [u.id, nameOf(u)]));
}

/** Debit and credit per account for posted journals in [from, to] (either may be null). */
async function sums(clientId, { from = null, to = null } = {}) {
  const dateWhere = from || to ? { entry_date: { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) } } : {};
  const rows = await JournalLine.findAll({
    where: { client_id: clientId },
    attributes: ['account_code', [sequelize.fn('MAX', sequelize.col('account_name')), 'account_name'], [sequelize.fn('SUM', sequelize.col('debit')), 'debit'], [sequelize.fn('SUM', sequelize.col('credit')), 'credit']],
    include: [{ model: JournalEntry, as: 'entry', attributes: [], where: { client_id: clientId, status: 'POSTED', ...dateWhere }, required: true }],
    group: ['account_code'], raw: true
  });
  return rows.map((r) => ({ code: r.account_code, name: r.account_name, debit: round2(r.debit), credit: round2(r.credit) }));
}

async function chart(clientId) {
  const accounts = await GlAccount.findAll({ where: { client_id: clientId }, order: [['code', 'ASC']] });
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
  return { accounts, byCode, typeOf: (code) => byCode[code]?.type || typeFromCode(code), nameOf: (code, fallback) => byCode[code]?.name || fallback || code };
}

// ── Chart of accounts ───────────────────────────────────────────────────────

exports.accounts = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  await arJournal.accountNames(clientId); // AR accounts exist even before the first AR posting
  const [{ accounts }, totals] = await Promise.all([chart(clientId), sums(clientId)]);
  const byCode = Object.fromEntries(totals.map((t) => [t.code, t]));
  const seen = new Set(accounts.map((a) => a.code));
  const rows = accounts.map((a) => {
    const t = byCode[a.code] || { debit: 0, credit: 0 };
    return { code: a.code, name: a.name, type: a.type, description: a.description, is_active: a.is_active, debit: t.debit, credit: t.credit, balance: round2(t.debit - t.credit), control: CONTROL_ACCOUNTS[a.code] || null };
  });
  // Accounts used in journals but missing from the chart still show, so nothing is hidden.
  for (const t of totals) if (!seen.has(t.code)) rows.push({ code: t.code, name: t.name, type: typeFromCode(t.code), description: 'Used in journals, not in the chart', is_active: true, debit: t.debit, credit: t.credit, balance: round2(t.debit - t.credit), control: CONTROL_ACCOUNTS[t.code] || null });
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return res.json({ success: true, data: rows, meta: { types: TYPES, can_add: approvals.isController(req.user.role) } });
};

exports.addAccount = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  if (!approvals.isController(req.user.role)) return fail(res, 403, 'New ledger accounts are added by Finance or the Director / CFO');
  const code = String(req.body?.code || '').trim();
  const name = text(req.body?.name, 150);
  const type = String(req.body?.type || '').toUpperCase();
  if (!/^\d{4,6}$/.test(code)) return fail(res, 422, 'The account code is 4 to 6 digits');
  if (!name) return fail(res, 422, 'Enter the account name');
  if (!TYPES.includes(type)) return fail(res, 422, `The type is one of ${TYPES.join(', ')}`);
  if (await GlAccount.findOne({ where: { client_id: clientId, code } })) return fail(res, 409, `Account ${code} already exists`);
  const account = await GlAccount.create({ client_id: clientId, code, name, type, description: text(req.body?.description, 255), is_active: true });
  await recordAudit(req, { module: 'R2R', entityType: 'GL_ACCOUNT', entityId: account.id, action: 'GL_ACCOUNT_ADDED', after: account });
  return res.status(201).json({ success: true, message: `Account ${code} ${name} added`, data: account });
};

// ── General ledger, trial balance, statements ───────────────────────────────

exports.ledger = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const from = normalizeDate(req.query.from);
  const to = normalizeDate(req.query.to);
  const entryWhere = { client_id: clientId, status: 'POSTED' };
  if (from || to) entryWhere.entry_date = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  if (req.query.source) entryWhere.source_module = String(req.query.source).split(',');
  if (req.query.q) entryWhere[Op.or] = [{ je_number: { [Op.like]: `%${req.query.q}%` } }, { source_ref: { [Op.like]: `%${req.query.q}%` } }, { narration: { [Op.like]: `%${req.query.q}%` } }];
  const lineWhere = { client_id: clientId };
  if (req.query.account) lineWhere.account_code = String(req.query.account);
  const rows = await JournalLine.findAll({
    where: lineWhere,
    include: [{ model: JournalEntry, as: 'entry', attributes: ['id', 'je_number', 'entry_date', 'source_module', 'source_ref', 'narration', 'event_type', 'source'], where: entryWhere, required: true }],
    order: [[{ model: JournalEntry, as: 'entry' }, 'entry_date', 'ASC'], [{ model: JournalEntry, as: 'entry' }, 'id', 'ASC'], ['line_no', 'ASC']],
    limit: 3000
  });
  // With one account chosen, show its opening balance and a running balance.
  let opening = 0;
  if (req.query.account && from) {
    const before = await sums(clientId, { to: new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10) });
    const t = before.find((b) => b.code === String(req.query.account));
    opening = t ? round2(t.debit - t.credit) : 0;
  }
  let running = opening;
  const data = rows.map((l) => {
    running = round2(running + Number(l.debit) - Number(l.credit));
    return {
      id: l.id, je_number: l.entry.je_number, entry_date: l.entry.entry_date, source_module: l.entry.source_module, source: l.entry.source,
      reference: l.entry.source_ref, narration: l.entry.narration, account_code: l.account_code, account_name: l.account_name,
      debit: Number(l.debit), credit: Number(l.credit), memo: l.memo, ...(req.query.account ? { balance: running } : {})
    };
  });
  const sources = await JournalEntry.findAll({ where: { client_id: clientId }, attributes: [[sequelize.fn('DISTINCT', sequelize.col('source_module')), 'source_module']], raw: true });
  return res.json({
    success: true, data,
    totals: { debit: round2(data.reduce((s, l) => s + l.debit, 0)), credit: round2(data.reduce((s, l) => s + l.credit, 0)), opening, closing: req.query.account ? running : null, truncated: rows.length >= 3000 },
    sources: sources.map((s) => s.source_module).filter(Boolean).sort()
  });
};

async function trialBalanceOf(clientId, asOf) {
  const [{ typeOf, nameOf: nm }, totals] = await Promise.all([chart(clientId), sums(clientId, { to: asOf })]);
  const rows = totals.map((t) => {
    const net = round2(t.debit - t.credit);
    return { code: t.code, name: nm(t.code, t.name), type: typeOf(t.code), debit: t.debit, credit: t.credit, balance_dr: net > 0 ? net : 0, balance_cr: net < 0 ? -net : 0 };
  }).filter((r) => r.debit || r.credit).sort((a, b) => a.code.localeCompare(b.code));
  const totalDr = round2(rows.reduce((s, r) => s + r.balance_dr, 0));
  const totalCr = round2(rows.reduce((s, r) => s + r.balance_cr, 0));
  return { as_of: asOf, rows, total_dr: totalDr, total_cr: totalCr, balanced: Math.abs(totalDr - totalCr) < 0.01 };
}

exports.trialBalance = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  return res.json({ success: true, data: await trialBalanceOf(clientId, normalizeDate(req.query.as_of) || today()) });
};

/** Profit and loss for [from, to], balance sheet at `to`, and cash movements on the bank account. */
exports.statements = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const to = normalizeDate(req.query.to) || today();
  // Default period: the Indian financial year to date (from 1 April).
  const fyStartYear = Number(to.slice(5, 7)) >= 4 ? Number(to.slice(0, 4)) : Number(to.slice(0, 4)) - 1;
  const from = normalizeDate(req.query.from) || `${fyStartYear}-04-01`;
  const { typeOf, nameOf: nm } = await chart(clientId);
  const [period, cumulative] = await Promise.all([sums(clientId, { from, to }), sums(clientId, { to })]);
  const line = (t, sign) => ({ code: t.code, name: nm(t.code, t.name), amount: round2(sign * (t.debit - t.credit)) });
  const income = period.filter((t) => typeOf(t.code) === 'INCOME').map((t) => line(t, -1)).filter((l) => l.amount);
  const expenses = period.filter((t) => typeOf(t.code) === 'EXPENSE').map((t) => line(t, 1)).filter((l) => l.amount);
  const totalIncome = round2(income.reduce((s, l) => s + l.amount, 0));
  const totalExpenses = round2(expenses.reduce((s, l) => s + l.amount, 0));
  const assets = cumulative.filter((t) => typeOf(t.code) === 'ASSET').map((t) => line(t, 1)).filter((l) => l.amount);
  const liabilities = cumulative.filter((t) => typeOf(t.code) === 'LIABILITY').map((t) => line(t, -1)).filter((l) => l.amount);
  const equity = cumulative.filter((t) => typeOf(t.code) === 'EQUITY').map((t) => line(t, -1)).filter((l) => l.amount);
  const retained = round2(cumulative.filter((t) => ['INCOME', 'EXPENSE'].includes(typeOf(t.code))).reduce((s, t) => s - (t.debit - t.credit), 0));
  const totalAssets = round2(assets.reduce((s, l) => s + l.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, l) => s + l.amount, 0));
  const totalEquity = round2(equity.reduce((s, l) => s + l.amount, 0) + retained);
  // Cash flow (direct, operating): movements on the bank account 1010 by the sub-ledger that posted them.
  const bank = await JournalLine.findAll({
    where: { client_id: clientId, account_code: '1010' }, attributes: ['debit', 'credit'],
    include: [{ model: JournalEntry, as: 'entry', attributes: ['source_module'], where: { client_id: clientId, status: 'POSTED', entry_date: { [Op.between]: [from, to] } }, required: true }]
  });
  const LABEL = { AR_RECEIPT: 'Received from customers', AR_UNAPPLIED: 'Received from customers (on account)', PAYMENT: 'Paid to vendors', PO: 'Advances paid to vendors', TDS: 'TDS deposited', MANUAL: 'Manual journals' };
  const flow = {};
  for (const b of bank) {
    const k = LABEL[b.entry.source_module] || `Other (${b.entry.source_module})`;
    flow[k] = round2((flow[k] || 0) + Number(b.debit) - Number(b.credit));
  }
  return res.json({
    success: true,
    data: {
      from, to,
      profit_and_loss: { income, expenses, total_income: totalIncome, total_expenses: totalExpenses, profit: round2(totalIncome - totalExpenses) },
      balance_sheet: { assets, liabilities, equity, retained_earnings: retained, total_assets: totalAssets, total_liabilities: totalLiabilities, total_equity: totalEquity, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01 },
      cash_flow: { operating: Object.entries(flow).map(([label, amount]) => ({ label, amount })), net: round2(Object.values(flow).reduce((s, v) => s + v, 0)) },
      note: 'Built from posted journals only (FDS: never from transaction tables). Includes every sub-ledger that posts to the ledger.'
    }
  });
};

// ── Manual journals (maker-checker) ─────────────────────────────────────────

async function r2rLocked(clientId, date) {
  const period = arPeriod.periodOf(date);
  const task = await R2rCloseTask.findOne({ where: { client_id: clientId, period, task_key: 'period_closed', done: true } });
  return task ? `${arPeriod.monthLabel(period)} is closed in Period Close, so no manual journal dated in it can be posted` : null;
}

const decorateMj = (j, user, names = {}) => {
  const o = j.toJSON ? j.toJSON() : j;
  const block = o.status === 'PENDING_APPROVAL' ? approvals.controllerBlock(o, user, 'prepared_by', 'journal') : null;
  return { ...o, can_approve: o.status === 'PENDING_APPROVAL' && !block, approve_block: block, prepared_by_name: names[o.prepared_by] || null, approved_by_name: names[o.approved_by] || null };
};

exports.listJournals = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.status) where.status = String(req.query.status).split(',');
  const rows = await R2rManualJournal.findAll({ where, order: [['id', 'DESC']], limit: 500 });
  const names = await userNames(rows.flatMap((r) => [r.prepared_by, r.approved_by]));
  return res.json({ success: true, data: rows.map((r) => decorateMj(r, req.user, names)), meta: { control_accounts: CONTROL_ACCOUNTS } });
};

exports.createJournal = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const date = normalizeDate(req.body?.entry_date) || today();
  const narration = text(req.body?.narration, 500);
  if (!narration) return fail(res, 422, 'Enter the narration (what the journal is for)');
  if (date > today()) return fail(res, 422, 'The journal date cannot be in the future');
  const { byCode } = await chart(clientId);
  const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).map((l) => ({
    account_code: String(l.account_code || '').trim(), debit: round2(toNumber(l.debit)), credit: round2(toNumber(l.credit)), memo: text(l.memo, 255)
  })).filter((l) => l.account_code && (l.debit || l.credit));
  if (lines.length < 2) return fail(res, 422, 'A journal needs at least two lines');
  for (const l of lines) {
    if (l.debit < 0 || l.credit < 0) return fail(res, 422, 'Amounts cannot be negative');
    if (l.debit && l.credit) return fail(res, 422, `Account ${l.account_code}: a line is either a debit or a credit`);
    if (!byCode[l.account_code]) return fail(res, 422, `Account ${l.account_code} is not in the chart of accounts`);
    if (CONTROL_ACCOUNTS[l.account_code]) return fail(res, 422, `Account ${l.account_code} is a control account (${CONTROL_ACCOUNTS[l.account_code]}); only its sub-ledger posts to it`);
    l.account_name = byCode[l.account_code].name;
  }
  const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(dr - cr) > 0.009) return fail(res, 422, `Debits (${inr(dr)}) must equal credits (${inr(cr)})`);
  const locked = await r2rLocked(clientId, date);
  if (locked) return fail(res, 423, locked);
  const mj = await R2rManualJournal.create({ client_id: clientId, entry_date: date, narration, lines, total: dr, status: 'PENDING_APPROVAL', prepared_by: req.user.id });
  await recordAudit(req, { module: 'R2R', entityType: 'MANUAL_JOURNAL', entityId: mj.id, action: 'MANUAL_JOURNAL_PREPARED', after: mj, note: `${inr(dr)}: ${narration}` });
  approvals.notify({ clientId, roles: approvals.CONTROLLER_ROLES, except: req.user.id, subject: `Manual journal to approve: ${inr(dr)}`, lines: [`A manual journal dated ${date} for ${inr(dr)} is waiting for approval: ${narration}`] });
  return res.status(201).json({ success: true, message: 'Journal prepared. Finance or the Director / CFO approves it before it posts.', data: decorateMj(mj, req.user) });
};

exports.approveJournal = async (req, res) => {
  const mj = await R2rManualJournal.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!mj) return fail(res, 404, 'Journal not found');
  if (mj.status !== 'PENDING_APPROVAL') return fail(res, 409, 'This journal is not waiting for approval');
  const block = approvals.controllerBlock(mj, req.user, 'prepared_by', 'journal');
  if (block) return fail(res, 403, block);
  const locked = await r2rLocked(mj.client_id, mj.entry_date);
  if (locked) return fail(res, 423, locked);
  const before = mj.toJSON();
  const number = await sequelize.transaction(async (transaction) => getNextNumber(mj.client_id, 'MANUAL_JOURNAL', transaction));
  const entry = await apJournal.post({
    clientId: mj.client_id, key: `MJ:${mj.id}`, eventType: 'MANUAL_JOURNAL', sourceModule: 'MANUAL', sourceId: mj.id, sourceRef: number,
    date: mj.entry_date, narration: mj.narration, source: 'MANUAL',
    lines: mj.lines.map((l) => ({ account: l.account_code, accountName: l.account_name, debit: l.debit, credit: l.credit, memo: l.memo }))
  });
  await mj.update({ status: 'POSTED', mj_number: number, approved_by: req.user.id, approved_at: new Date(), decision_note: text(req.body?.note, 500), journal_entry_id: entry?.id || null });
  await recordAudit(req, { module: 'R2R', entityType: 'MANUAL_JOURNAL', entityId: mj.id, action: 'MANUAL_JOURNAL_POSTED', before, after: mj, note: `${number} posted${entry ? ` as ${entry.je_number}` : ''}` });
  return res.json({ success: true, message: `Journal ${number} approved and posted`, data: decorateMj(mj, req.user) });
};

exports.rejectJournal = async (req, res) => {
  const mj = await R2rManualJournal.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!mj) return fail(res, 404, 'Journal not found');
  if (mj.status !== 'PENDING_APPROVAL') return fail(res, 409, 'This journal is not waiting for approval');
  const own = Number(mj.prepared_by) === Number(req.user.id);
  const block = own ? null : approvals.controllerBlock(mj, req.user, 'prepared_by', 'journal');
  if (block) return fail(res, 403, block);
  const reason = text(req.body?.note, 500);
  if (!reason) return fail(res, 400, 'Say why the journal is rejected');
  const before = mj.toJSON();
  await mj.update({ status: own ? 'CANCELLED' : 'REJECTED', approved_by: req.user.id, approved_at: new Date(), decision_note: reason });
  await recordAudit(req, { module: 'R2R', entityType: 'MANUAL_JOURNAL', entityId: mj.id, action: own ? 'MANUAL_JOURNAL_WITHDRAWN' : 'MANUAL_JOURNAL_REJECTED', before, after: mj, note: reason });
  return res.json({ success: true, message: own ? 'Journal withdrawn' : 'Journal rejected', data: decorateMj(mj, req.user) });
};

// ── Reconciliations (FDS section 22) ────────────────────────────────────────

exports.reconciliations = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const period = periodParam(req.query.period);
  const end = period === arPeriod.periodOf(today()) ? today() : arPeriod.monthEnd(period);
  const { salesRegister } = require('./arClose.controller');
  const [saved, bankBook, register, statements] = await Promise.all([
    R2rReconciliation.findAll({ where: { client_id: clientId, period } }),
    arJournal.accountBalance(clientId, '1010', { upTo: end }),
    salesRegister(clientId, period),
    ArStatement.findAll({ where: { client_id: clientId, period_to: { [Op.between]: [arPeriod.monthStart(period), arPeriod.monthEnd(period)] } }, attributes: ['response', 'difference'] })
  ]);
  const names = await userNames(saved.flatMap((s) => [s.prepared_by, s.reviewed_by]));
  const savedOf = (t) => saved.find((s) => s.rec_type === t);
  const rec = (type, name, compare, against, book) => {
    const s = savedOf(type);
    const statement = s && s.statement_amount !== null ? Number(s.statement_amount) : null;
    const difference = statement === null ? null : round2(book - statement);
    const block = s && !s.reviewed_by ? approvals.controllerBlock(s, req.user, 'prepared_by', 'reconciliation') : null;
    return {
      rec_type: type, name, compare, against, book_amount: round2(book), statement_amount: statement, difference, reconciled: difference !== null && Math.abs(difference) < 0.01,
      id: s?.id || null, note: s?.note || null, prepared_by_name: names[s?.prepared_by] || null, prepared_at: s?.prepared_at || null,
      reviewed_by_name: names[s?.reviewed_by] || null, reviewed_at: s?.reviewed_at || null, can_review: !!s && !s.reviewed_by && !block, review_block: s && !s.reviewed_by ? block : null
    };
  };
  const agreed = statements.filter((s) => s.response === 'AGREED').length;
  const disputed = statements.filter((s) => s.response === 'DISPUTED');
  return res.json({
    success: true,
    data: {
      period, as_of: end,
      items: [
        rec('BANK', 'Bank reconciliation', 'Bank ledger (account 1010)', 'Bank statement closing balance', bankBook),
        rec('GST', 'GST reconciliation (output tax)', 'Sales register: output GST less credit notes', 'GSTR-1 filed for the month', register.net_tax),
        {
          rec_type: 'CUSTOMER', name: 'Customer reconciliation', compare: 'Customer statements sent', against: 'Customer confirmations', managed: 'From AR Close → Customer statements',
          sent: statements.length, agreed, disputed: disputed.length, pending: statements.length - agreed - disputed.length,
          difference: round2(disputed.reduce((s, x) => s + Number(x.difference || 0), 0)), reconciled: statements.length > 0 && disputed.length === 0 && agreed === statements.length
        },
        { rec_type: 'VENDOR', name: 'Vendor reconciliation', compare: 'Vendor statement', against: 'Accounts Payable ledger', managed: 'Managed in Accounts Payable' }
      ]
    }
  });
};

exports.saveReconciliation = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const period = periodParam(req.body?.period);
  const type = String(req.body?.rec_type || '').toUpperCase();
  if (!['BANK', 'GST'].includes(type)) return fail(res, 422, 'Choose the bank or GST reconciliation');
  const statement = toNumber(req.body?.statement_amount);
  if (statement === null) return fail(res, 422, type === 'BANK' ? 'Enter the bank statement closing balance' : 'Enter the output tax filed in GSTR-1');
  const end = period === arPeriod.periodOf(today()) ? today() : arPeriod.monthEnd(period);
  const book = type === 'BANK' ? await arJournal.accountBalance(clientId, '1010', { upTo: end }) : (await require('./arClose.controller').salesRegister(clientId, period)).net_tax;
  const difference = round2(book - statement);
  const note = text(req.body?.note, 500);
  // Differences must be explained before review (blueprint R2R step 10).
  if (Math.abs(difference) >= 0.01 && !note) return fail(res, 422, `There is a difference of ${inr(difference)}. Explain it in the note (timing items, charges not yet booked, etc.).`);
  const [row] = await R2rReconciliation.findOrCreate({ where: { client_id: clientId, period, rec_type: type }, defaults: { client_id: clientId, period, rec_type: type } });
  const before = row.toJSON();
  await row.update({ book_amount: round2(book), statement_amount: round2(statement), difference, note, prepared_by: req.user.id, prepared_at: new Date(), reviewed_by: null, reviewed_at: null });
  await recordAudit(req, { module: 'R2R', entityType: 'RECONCILIATION', entityId: row.id, action: 'RECONCILIATION_PREPARED', before, after: row, note: `${type} ${period}: difference ${inr(difference)}` });
  return res.json({ success: true, message: Math.abs(difference) < 0.01 ? 'Reconciled: no difference. Send it for review.' : `Saved with a difference of ${inr(difference)} (explained)`, data: row });
};

exports.reviewReconciliation = async (req, res) => {
  const row = await R2rReconciliation.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!row) return fail(res, 404, 'Reconciliation not found');
  if (row.reviewed_by) return fail(res, 409, 'Already reviewed');
  const block = approvals.controllerBlock(row, req.user, 'prepared_by', 'reconciliation');
  if (block) return fail(res, 403, block.replace('approve', 'review'));
  const before = row.toJSON();
  await row.update({ reviewed_by: req.user.id, reviewed_at: new Date() });
  await recordAudit(req, { module: 'R2R', entityType: 'RECONCILIATION', entityId: row.id, action: 'RECONCILIATION_REVIEWED', before, after: row });
  return res.json({ success: true, message: 'Reconciliation reviewed and signed', data: row });
};

// ── Period close checklist (FDS section 25) ─────────────────────────────────

const CLOSE_TASKS = [
  { key: 'close_ap', n: 1, label: 'Close AP', who: 'Finance', auto: false, note: 'Accounts Payable confirms its month-end (done in Accounts Payable; recorded here).' },
  { key: 'close_ar', n: 2, label: 'Close AR', who: 'Accounts Receivable, then Finance / Director sign-off', auto: true },
  { key: 'bank_rec', n: 3, label: 'Bank reconciliations', who: 'Finance, reviewed by another person', auto: true },
  { key: 'accruals', n: 4, label: 'Accrual entries', who: 'Finance', auto: false },
  { key: 'depreciation', n: 5, label: 'Depreciation', who: 'Finance', auto: false },
  { key: 'management_review', n: 6, label: 'Management review', who: 'Finance or Director / CFO', auto: false, controller: true },
  { key: 'tb_freeze', n: 7, label: 'Trial balance freeze', who: 'Finance or Director / CFO', auto: false, controller: true },
  { key: 'financial_statements', n: 8, label: 'Financial statements', who: 'Finance', auto: false },
  { key: 'period_closed', n: 9, label: 'Period closed', who: 'Director / CFO', auto: false, director: true }
];

async function closeState(clientId, period, user) {
  const end = arPeriod.monthEnd(period);
  const [tasks, arClose, bank, tb] = await Promise.all([
    R2rCloseTask.findAll({ where: { client_id: clientId, period } }),
    arPeriod.closeOf(clientId, period),
    R2rReconciliation.findOne({ where: { client_id: clientId, period, rec_type: 'BANK' } }),
    trialBalanceOf(clientId, end)
  ]);
  const names = await userNames(tasks.map((t) => t.done_by));
  const byKey = Object.fromEntries(tasks.map((t) => [t.task_key, t]));
  const role = roleCode(user.role);
  const isDirector = isAdmin(user.role) || role === 'DIRECTOR_CFO';
  const closed = !!byKey.period_closed?.done;
  const items = CLOSE_TASKS.map((t) => {
    const row = byKey[t.key];
    let done = !!row?.done;
    let detail = row?.note || t.note || null;
    if (t.key === 'close_ar') {
      done = arClose?.status === 'SIGNED_OFF';
      detail = arClose ? (arClose.status === 'SIGNED_OFF' ? 'AR closed and signed off' : arClose.status === 'CLOSED' ? 'AR closed; waiting for Finance / Director sign-off' : 'Reopened') : 'Not closed yet (Accounts Receivable → AR Close)';
    }
    if (t.key === 'bank_rec') {
      done = !!bank?.reviewed_by && (Math.abs(Number(bank.difference || 0)) < 0.01 || !!bank.note);
      detail = bank ? `Difference ${inr(bank.difference)}${bank.reviewed_by ? ', reviewed' : ', waiting for review'}` : 'Not prepared yet (Reconciliations)';
    }
    if (t.key === 'tb_freeze' && !tb.balanced) detail = `The trial balance does not balance at ${end}`;
    let block = null;
    if (t.auto) block = 'Ticked automatically from its own page';
    else if (closed && t.key !== 'period_closed') block = 'The period is closed';
    else if (t.director && !isDirector) block = 'Closing the period needs the Director / CFO';
    else if (t.controller && !approvals.isController(user.role)) block = 'Needs Finance or the Director / CFO';
    else if (t.key === 'tb_freeze' && !done && !tb.balanced) block = 'The trial balance must balance first';
    return { ...t, done, detail, done_by_name: names[row?.done_by] || null, done_at: row?.done_at || null, can_toggle: !block, block };
  });
  const allBefore = items.filter((i) => i.key !== 'period_closed').every((i) => i.done);
  const last = items.find((i) => i.key === 'period_closed');
  if (!last.done && !allBefore && !last.block) { last.can_toggle = false; last.block = 'Every step above must be done first'; }
  return { period, label: arPeriod.monthLabel(period), items, closed, trial_balance: { balanced: tb.balanced, total_dr: tb.total_dr, total_cr: tb.total_cr } };
}

exports.getPeriodClose = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  return res.json({ success: true, data: await closeState(clientId, periodParam(req.query.period), req.user) });
};

exports.toggleCloseTask = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const period = periodParam(req.params.period);
  const state = await closeState(clientId, period, req.user);
  const item = state.items.find((i) => i.key === req.params.key);
  if (!item) return fail(res, 404, 'Unknown close step');
  if (!item.can_toggle) return fail(res, 403, item.block);
  const done = req.body?.done === undefined ? !item.done : !!req.body.done;
  const [row] = await R2rCloseTask.findOrCreate({ where: { client_id: clientId, period, task_key: item.key }, defaults: { client_id: clientId, period, task_key: item.key } });
  const before = row.toJSON();
  await row.update({ done, done_by: done ? req.user.id : null, done_at: done ? new Date() : null, note: text(req.body?.note, 500) || row.note });
  await recordAudit(req, { module: 'R2R', entityType: 'PERIOD_CLOSE', entityId: row.id, action: done ? 'CLOSE_STEP_DONE' : 'CLOSE_STEP_UNDONE', before, after: row, note: `${period}: ${item.label}` });
  return res.json({ success: true, message: `${item.label} ${done ? 'done' : 'reopened'}`, data: await closeState(clientId, period, req.user) });
};

module.exports.CONTROL_ACCOUNTS = CONTROL_ACCOUNTS;
