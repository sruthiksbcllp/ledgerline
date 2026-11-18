'use strict';
/**
 * Who may approve what in Accounts Receivable, who is told, and what is waiting for whom (the FDS
 * workflow engine: maker-checker, multi-level approval, escalation matrix, email notifications).
 *
 *   Customer verification / credit limit   approval limit (Manager ₹1,00,000, Finance ₹5,00,000, Director none)
 *   Order released from credit hold        approval limit covering the order value
 *   Credit note                            approval limit covering the credit note total
 *   Write-off                              Finance up to ₹1,00,000, Director / CFO above (AR_WRITE_OFF_LIMIT_*)
 *   ECL provision, AR month close          Finance or Director / CFO
 *   Manual journal                         Finance or Director / CFO
 * In every case the person who raised the item may not approve it. Approvers are emailed when an item
 * arrives; anything still waiting after ESCALATE_AFTER_DAYS days is sent to them again, daily.
 */
const { Op } = require('sequelize');
const { limitOf, neededLabel, isAdmin } = require('./billApproval.service');
const notificationEmail = require('./notificationEmail.service');

let models = null;
const m = () => models || (models = require('../models'));

const ESCALATE_AFTER_DAYS = 2;
const roleCode = (role) => String(role || '').toUpperCase().replace(/\s+/g, '_');
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const envLimit = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Write-off limits by role (blueprint O2C step 9). null = no ceiling. */
const WRITE_OFF_LIMITS = {
  FINANCE: envLimit('AR_WRITE_OFF_LIMIT_FINANCE', 100000),
  DIRECTOR_CFO: envLimit('AR_WRITE_OFF_LIMIT_DIRECTOR_CFO', null)
};
const writeOffLimitOf = (role) => {
  if (isAdmin(role)) return Infinity;
  const code = roleCode(role);
  if (!Object.prototype.hasOwnProperty.call(WRITE_OFF_LIMITS, code)) return 0;
  return WRITE_OFF_LIMITS[code] === null ? Infinity : Number(WRITE_OFF_LIMITS[code]);
};
const writeOffNeeds = (amount) => (Number(amount) <= writeOffLimitOf('FINANCE') ? `Finance (up to ${inr(writeOffLimitOf('FINANCE'))}) or the Director / CFO` : 'the Director / CFO');

/** Finance or the Director / CFO (and admins): ECL provision, AR close sign-off, manual journals. */
const CONTROLLER_ROLES = ['FINANCE', 'DIRECTOR_CFO'];
const isController = (role) => isAdmin(role) || CONTROLLER_ROLES.includes(roleCode(role));
const sameUser = (a, b) => a && b && Number(a) === Number(b);

function creditNoteBlock(note, user) {
  if (sameUser(note.requested_by, user.id)) return 'You raised this credit note, so someone else must approve it';
  const limit = limitOf(user.role);
  if (limit === 0) return `Your role does not approve credit notes. It needs ${neededLabel(note.total_amount)}`;
  if (Number(note.total_amount) > limit) return `${inr(note.total_amount)} is above your approval limit of ${inr(limit)}. It needs ${neededLabel(note.total_amount)}`;
  return null;
}
function writeOffBlock(wo, user) {
  if (sameUser(wo.requested_by, user.id)) return 'You requested this write-off, so someone else must approve it';
  const limit = writeOffLimitOf(user.role);
  if (limit === 0) return `Your role does not approve write-offs. It needs ${writeOffNeeds(wo.amount)}`;
  if (Number(wo.amount) > limit) return `${inr(wo.amount)} is above your write-off limit of ${inr(limit)}. It needs ${writeOffNeeds(wo.amount)}`;
  return null;
}
function controllerBlock(item, user, preparedField, what) {
  if (sameUser(item[preparedField], user.id)) return `You prepared this ${what}, so someone else must approve it`;
  if (!isController(user.role)) return `Approving the ${what} needs Finance or the Director / CFO`;
  return null;
}

// ── Who is told ───────────────────────────────────────────────────────────────

/** Users of the company holding one of `roles` (company membership first, then the user's own role). */
async function usersWithRoles(clientId, roles) {
  const { CompanyMembership, User, Role } = m();
  const codes = roles.map(roleCode);
  const ids = new Set();
  const memberships = await CompanyMembership.findAll({ where: { client_id: clientId, status: 'ACTIVE', role_code: codes }, attributes: ['user_id'] }).catch(() => []);
  memberships.forEach((x) => ids.add(x.user_id));
  const direct = await User.findAll({
    where: { client_id: clientId, status: 'ACTIVE' }, attributes: ['id'],
    include: [{ model: Role, as: 'Role', attributes: ['code'], where: { code: codes }, required: true }]
  }).catch(() => []);
  direct.forEach((u) => ids.add(u.id));
  if (!ids.size) return [];
  return User.findAll({ where: { id: [...ids], status: 'ACTIVE' }, attributes: ['id', 'email', 'first_name', 'last_name'] });
}

/**
 * Emails the approvers of an item (never blocks the caller). Returns how many were emailed.
 * `except` is the user who raised it, who is not told to approve their own item.
 */
async function notify({ clientId, roles, subject, lines = [], except = null }) {
  try {
    if (!clientId || !notificationEmail.isConfigured()) return 0;
    const users = (await usersWithRoles(clientId, roles)).filter((u) => u.email && !sameUser(u.id, except));
    const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:14px;line-height:1.6">${lines.map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`).join('')}<p style="color:#64748b;font-size:12px">LedgerLine · Accounts Receivable</p></div>`;
    let sent = 0;
    for (const u of users) {
      const r = await notificationEmail.sendEmail({ to: u.email, subject, html }).catch(() => null);
      if (r?.success) sent += 1;
    }
    return sent;
  } catch (e) {
    console.error('[arApproval] notify failed:', e.message);
    return 0;
  }
}

/** Roles whose approval limit covers `amount` (for credit holds, credit notes, customer limits). */
const rolesCovering = (amount) => ['MANAGER', 'FINANCE', 'DIRECTOR_CFO'].filter((r) => limitOf(r) >= Number(amount || 0));
const writeOffRoles = (amount) => ['FINANCE', 'DIRECTOR_CFO'].filter((r) => writeOffLimitOf(r) >= Number(amount || 0));

// ── What is waiting for whom ──────────────────────────────────────────────────

const ageDays = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

/**
 * Items waiting for a decision in a company. With `user`, only those this user may decide.
 * Each: { kind, id, title, detail, amount, since, age_days, escalated, path }.
 */
async function pending(clientId, user = null) {
  const { ArCustomer, ArSalesOrder, ArCreditNote, ArWriteOff, ArEclRun, ArPeriodClose, R2rManualJournal } = m();
  const { releaseBlock } = require('./arCredit.service');
  const where = { client_id: clientId };
  const [customers, orders, notes, writeOffs, ecl, closes, journals] = await Promise.all([
    ArCustomer.findAll({ where: { ...where, status: 'PENDING' }, limit: 200 }),
    ArSalesOrder.findAll({ where: { ...where, status: 'CREDIT_HOLD' }, include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }], limit: 200 }),
    ArCreditNote.findAll({ where: { ...where, status: 'PENDING_APPROVAL' }, include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }], limit: 200 }),
    ArWriteOff.findAll({ where: { ...where, status: 'PENDING_APPROVAL' }, include: [{ model: ArCustomer, as: 'customer', attributes: ['customer_name'] }], limit: 200 }),
    ArEclRun.findAll({ where: { ...where, status: 'PENDING_APPROVAL' }, limit: 50 }),
    ArPeriodClose.findAll({ where: { ...where, status: 'CLOSED' }, limit: 50 }),
    R2rManualJournal.findAll({ where: { ...where, status: 'PENDING_APPROVAL' }, limit: 200 })
  ]);
  const items = [];
  const push = (item, allowed) => {
    if (user && !allowed) return;
    const age = ageDays(item.since);
    items.push({ ...item, age_days: age, escalated: age >= ESCALATE_AFTER_DAYS });
  };
  for (const c of customers) {
    const limitOk = limitOf(user?.role) > 0 && !sameUser(c.created_by, user?.id);
    push({ kind: 'CUSTOMER', id: c.id, title: `Verify customer ${c.customer_name}`, detail: c.credit_limit === null ? 'No credit limit proposed yet' : `Credit limit ${inr(c.credit_limit)} proposed`, amount: c.credit_limit === null ? null : Number(c.credit_limit), since: c.updatedAt, path: '/finance/ar/customers', roles: rolesCovering(c.credit_limit || 0) }, user ? limitOk : true);
  }
  for (const o of orders) push({ kind: 'ORDER', id: o.id, title: `Release ${o.order_number} from credit hold`, detail: o.customer?.customer_name, amount: Number(o.total_amount), since: o.updatedAt, path: '/finance/ar/sales-orders', roles: rolesCovering(o.total_amount) }, user ? !releaseBlock(o, user) : true);
  for (const n of notes) push({ kind: 'CREDIT_NOTE', id: n.id, title: `Approve credit note request #${n.id}`, detail: `${n.customer?.customer_name || ''} · ${n.reason_code}`, amount: Number(n.total_amount), since: n.createdAt, path: '/finance/ar/credit-notes', roles: rolesCovering(n.total_amount) }, user ? !creditNoteBlock(n, user) : true);
  for (const w of writeOffs) push({ kind: 'WRITE_OFF', id: w.id, title: `Approve write-off request #${w.id}`, detail: w.customer?.customer_name, amount: Number(w.amount), since: w.createdAt, path: '/finance/ar/credit-loss?tab=writeoffs', roles: writeOffRoles(w.amount) }, user ? !writeOffBlock(w, user) : true);
  for (const r of ecl) push({ kind: 'ECL', id: r.id, title: `Approve credit-loss provision for ${r.period}`, detail: `${Number(r.adjustment) >= 0 ? 'Top-up' : 'Release'} ${inr(Math.abs(r.adjustment))}`, amount: Math.abs(Number(r.adjustment)), since: r.createdAt, path: '/finance/ar/credit-loss', roles: CONTROLLER_ROLES }, user ? !controllerBlock(r, user, 'prepared_by', 'provision') : true);
  for (const p of closes) push({ kind: 'AR_CLOSE', id: p.id, title: `Sign off the AR close for ${p.period}`, detail: 'Closed by Accounts Receivable', amount: null, since: p.closed_at || p.updatedAt, path: `/finance/ar/ar-close?period=${p.period}`, roles: CONTROLLER_ROLES }, user ? !controllerBlock(p, user, 'closed_by', 'AR close') : true);
  for (const j of journals) push({ kind: 'MANUAL_JOURNAL', id: j.id, title: `Approve manual journal #${j.id}`, detail: j.narration, amount: Number(j.total), since: j.createdAt, path: '/finance/ar/journal-entry', roles: CONTROLLER_ROLES }, user ? !controllerBlock(j, user, 'prepared_by', 'journal') : true);
  return items.sort((a, b) => b.age_days - a.age_days);
}

/** Daily: anything waiting ESCALATE_AFTER_DAYS days or more is sent to its approvers again. */
async function escalate() {
  const { Client } = m();
  const clients = await Client.findAll({ attributes: ['id'] }).catch(() => []);
  let sent = 0;
  for (const c of clients) {
    const items = (await pending(c.id)).filter((i) => i.escalated);
    for (const i of items) {
      sent += await notify({
        clientId: c.id, roles: i.roles, subject: `Waiting ${i.age_days} days: ${i.title}`,
        lines: [`${i.title}${i.detail ? ` (${i.detail})` : ''}${i.amount ? ` for ${inr(i.amount)}` : ''} has been waiting ${i.age_days} days for a decision.`, 'Open LedgerLine, Accounts Receivable, to approve or reject it.']
      });
    }
  }
  return sent;
}

module.exports = {
  ESCALATE_AFTER_DAYS, WRITE_OFF_LIMITS, CONTROLLER_ROLES, writeOffLimitOf, writeOffNeeds, isController,
  creditNoteBlock, writeOffBlock, controllerBlock, rolesCovering, writeOffRoles, usersWithRoles, notify, pending, escalate
};
