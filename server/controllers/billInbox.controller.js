'use strict';

/**
 * Bill inbox API: the documents captured from email, the mailboxes being checked, and what a
 * person does with each document. Accepting an invoice goes through POST /procurement/ap-invoices
 * with bill_inbox_id, so it gets the same checks as any other bill.
 */
const { Op } = require('sequelize');
const { BillInboxSource, BillInboxItem, Vendor, PurchaseOrder, Department, User, PurchaseReturn, sequelize } = require('../models');
const { getClientId } = require('../utils/tenantFilter');
const { MailboxError } = require('../services/userMailbox.service');
const inbox = require('../services/billInbox.service');
const { recordAudit } = require('../utils/financeAudit');

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const clientOf = (req) => getClientId(req) || req.user?.client_id || null;
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'PROVIDER_ADMIN'];

// Which documents each tab shows.
const VIEWS = {
  review: { status: { [Op.in]: ['NEW', 'FAILED'] }, document_type: { [Op.or]: [{ [Op.notIn]: ['CREDIT_NOTE', 'STATEMENT'] }, { [Op.is]: null }] } },
  credit: { status: 'NEW', document_type: 'CREDIT_NOTE' },
  statement: { status: 'NEW', document_type: 'STATEMENT' },
  aside: { status: { [Op.in]: ['SET_ASIDE', 'DUPLICATE'] } },
  done: { status: { [Op.in]: ['ACCEPTED', 'DONE', 'REJECTED'] } }
};

const personName = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);

const sourceJson = (s, req, checking) => ({
  id: s.id,
  user_id: s.user_id,
  owner_name: personName(s.owner),
  mine: Number(s.user_id) === Number(req.user.id),
  mailbox_email: s.mailbox_email,
  mode: s.mode,
  enabled: s.enabled,
  last_checked_at: s.last_checked_at,
  checked_until: s.checked_until,
  last_error: s.last_error,
  checking
});

const itemJson = (i) => ({
  id: i.id,
  status: i.status,
  status_reason: i.status_reason,
  error: i.error,
  document_type: i.document_type,
  email_from: i.email_from,
  email_from_name: i.email_from_name,
  email_subject: i.email_subject,
  received_at: i.received_at,
  web_link: i.web_link,
  file_name: i.file_name,
  content_type: i.content_type,
  file_size: i.file_size,
  party_name: i.party_name,
  invoice_number: i.invoice_number,
  invoice_date: i.invoice_date,
  total_amount: i.total_amount,
  vendor: i.vendor ? { id: i.vendor.id, vendor_name: i.vendor.vendor_name } : null,
  vendor_matched_by: i.vendor_matched_by,
  purchase_order: i.purchaseOrder ? { id: i.purchaseOrder.id, po_number: i.purchaseOrder.po_number } : null,
  po_matched_by: i.po_matched_by,
  department: i.department ? { id: i.department.id, name: i.department.dept_name } : null,
  requested_by: personName(i.requester),
  duplicate_invoice_id: i.duplicate_invoice_id,
  possible_duplicate_invoice_id: i.possible_duplicate_invoice_id,
  purchase_return: i.purchaseReturn ? { id: i.purchaseReturn.id, return_number: i.purchaseReturn.return_number, total_amount: i.purchaseReturn.total_amount, status: i.purchaseReturn.status } : null,
  invoice_id: i.invoice_id,
  reviewed_at: i.reviewed_at,
  auto_check: i.auto_check,
  auto_submitted: i.auto_submitted,
  spot_check: i.spot_check
});

const includes = () => [
  { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
  { model: PurchaseOrder, as: 'purchaseOrder', attributes: ['id', 'po_number'] },
  { model: Department, as: 'department', attributes: ['id', 'dept_name'] },
  { model: User, as: 'requester', attributes: ['id', 'first_name', 'last_name', 'email'] },
  { model: PurchaseReturn, as: 'purchaseReturn', attributes: ['id', 'return_number', 'total_amount', 'status'] }
];

async function sourcesOf(req, clientId) {
  const sources = await BillInboxSource.findAll({
    where: { client_id: clientId },
    include: [{ model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'email'] }],
    order: [['id', 'ASC']]
  });
  return sources;
}

exports.list = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const view = VIEWS[req.query.view] ? req.query.view : 'review';
  const [rows, counts, sources] = await Promise.all([
    BillInboxItem.findAll({
      where: { client_id: clientId, ...VIEWS[view] },
      include: includes(),
      order: view === 'done' ? [['reviewed_at', 'DESC'], ['id', 'DESC']] : [['received_at', 'DESC'], ['id', 'DESC']],
      limit: 300
    }),
    Promise.all(Object.entries(VIEWS).map(async ([key, where]) => [key, key === 'done' ? null : await BillInboxItem.count({ where: { client_id: clientId, ...where } })])),
    sourcesOf(req, clientId)
  ]);
  return res.json({
    success: true,
    data: {
      view,
      items: rows.map(itemJson),
      counts: Object.fromEntries(counts),
      sources: sources.map((s) => sourceJson(s, req, inbox.isChecking([s]))),
      checking: inbox.isChecking(sources),
      auto_enabled: (await require('../services/apAutoSubmit.service').getSettings(clientId)).enabled
    }
  });
};

/** Just the number to show on the tab. */
exports.count = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return res.json({ success: true, data: { open: 0 } });
  const open = await BillInboxItem.count({ where: { client_id: clientId, status: { [Op.in]: ['NEW', 'FAILED'] } } });
  return res.json({ success: true, data: { open } });
};

const loadItem = (req) => BillInboxItem.findOne({ where: { client_id: clientOf(req), id: req.params.id }, include: includes() });

/** One document with everything the AI read, for the review form. */
exports.detail = async (req, res) => {
  const item = await loadItem(req);
  if (!item) return fail(res, 404, 'Not found in the bill inbox');
  return res.json({ success: true, data: { ...itemJson(item), extraction: item.extraction } });
};

/** The captured file itself (shown in the review form and attached to the invoice on accept). */
exports.file = async (req, res) => {
  const item = await BillInboxItem.findOne({ where: { client_id: clientOf(req), id: req.params.id } });
  if (!item) return fail(res, 404, 'Not found in the bill inbox');
  const file = await inbox.readFile(item);
  if (!file) return fail(res, 404, 'The file is no longer available');
  res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader('Content-Disposition', `inline; filename="${String(item.file_name || 'bill').replace(/["\r\n]/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.end(file.buffer);
};

/** Read the file with AI again (after a failure, or to refresh the vendor / PO match). */
exports.reread = async (req, res) => {
  const item = await BillInboxItem.findOne({ where: { client_id: clientOf(req), id: req.params.id } });
  if (!item) return fail(res, 404, 'Not found in the bill inbox');
  if (['ACCEPTED', 'DONE'].includes(item.status)) return fail(res, 409, 'This document has already been dealt with');
  await inbox.readItem(item, { allowSubmit: false }); // a person is looking at it: never auto-submit here
  const fresh = await loadItem(req);
  return res.json({ success: true, message: fresh.status === 'FAILED' ? fresh.error : 'Read again', data: { ...itemJson(fresh), extraction: fresh.extraction } });
};

/**
 * Status changes a person makes: REJECTED (with reason), SET_ASIDE ("not a bill"), DONE (statement
 * reconciled, credit note handled), NEW (treat as a bill again; document_type may be corrected).
 */
exports.setStatus = async (req, res) => {
  const item = await BillInboxItem.findOne({ where: { client_id: clientOf(req), id: req.params.id } });
  if (!item) return fail(res, 404, 'Not found in the bill inbox');
  if (item.status === 'ACCEPTED') return fail(res, 409, `This bill was accepted as invoice #${item.invoice_id} and cannot be changed here`);
  const status = String(req.body?.status || '').toUpperCase();
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!['REJECTED', 'SET_ASIDE', 'DONE', 'NEW'].includes(status)) return fail(res, 400, 'Unknown action');
  if (status === 'REJECTED' && !reason) return fail(res, 400, 'Give a reason for rejecting it');
  const changes = { status, status_reason: reason || null };
  if (status === 'NEW') {
    const type = String(req.body?.document_type || '').toUpperCase();
    changes.document_type = ['INVOICE', 'CREDIT_NOTE', 'STATEMENT'].includes(type) ? type : (item.document_type && !['PAYMENT_RECEIPT', 'PURCHASE_ORDER', 'OTHER'].includes(item.document_type) ? item.document_type : 'INVOICE');
    changes.reviewed_by = null;
    changes.reviewed_at = null;
  } else {
    changes.reviewed_by = req.user.id;
    changes.reviewed_at = new Date();
  }
  await item.update(changes);
  if (status === 'NEW') await require('../services/apAutoSubmit.service').evaluate(item, { allowSubmit: false }).catch(() => {});
  return res.json({ success: true, message: { REJECTED: 'Rejected', SET_ASIDE: 'Set aside', DONE: 'Marked done', NEW: 'Moved back to review' }[status] });
};

/** A credit note: record it on the purchase return that is waiting for it. */
exports.recordCreditNote = async (req, res) => {
  const clientId = clientOf(req);
  const item = await BillInboxItem.findOne({ where: { client_id: clientId, id: req.params.id } });
  if (!item) return fail(res, 404, 'Not found in the bill inbox');
  if (item.status !== 'NEW') return fail(res, 409, 'This document has already been dealt with');
  const number = String(req.body?.credit_note_number || item.invoice_number || '').trim();
  if (!number) return fail(res, 400, 'Enter the vendor credit note number');
  const date = req.body?.credit_note_date || item.invoice_date || new Date().toISOString().slice(0, 10);
  const ret = await PurchaseReturn.findOne({ where: { client_id: clientId, id: Number(req.body?.purchase_return_id || item.purchase_return_id) } });
  if (!ret) return fail(res, 404, 'Choose the purchase return this credit note is for');
  if (ret.stage !== 'AFTER_INVOICE' || ret.status !== 'AWAITING_CREDIT_NOTE') return fail(res, 409, `Return ${ret.return_number} is not waiting for a credit note`);
  await sequelize.transaction(async (transaction) => {
    await ret.update({ credit_note_number: number.slice(0, 100), credit_note_date: date, status: 'CREDIT_NOTE_RECEIVED' }, { transaction });
    await item.update({ status: 'ACCEPTED', purchase_return_id: ret.id, status_reason: `Recorded on return ${ret.return_number}`, reviewed_by: req.user.id, reviewed_at: new Date() }, { transaction });
  });
  await recordAudit(req, { module: 'AP', entityType: 'PURCHASE_RETURN', entityId: ret.id, action: 'AP_CREDIT_NOTE_RECORDED', note: `Vendor credit note ${number} recorded from the bill inbox (email from ${item.email_from})` }).catch(() => {});
  return res.json({ success: true, message: `Credit note ${number} recorded on return ${ret.return_number}` });
};

/** Purchase returns of the item's vendor still waiting for a credit note (to pick from). */
exports.openReturns = async (req, res) => {
  const clientId = clientOf(req);
  const item = await BillInboxItem.findOne({ where: { client_id: clientId, id: req.params.id } });
  if (!item) return fail(res, 404, 'Not found in the bill inbox');
  const where = { client_id: clientId, stage: 'AFTER_INVOICE', status: 'AWAITING_CREDIT_NOTE', ...(item.vendor_id ? { vendor_id: item.vendor_id } : {}) };
  const rows = await PurchaseReturn.findAll({ where, include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] }], order: [['id', 'DESC']], limit: 50 });
  return res.json({ success: true, data: rows.map((r) => ({ id: r.id, return_number: r.return_number, total_amount: r.total_amount, vendor_name: r.vendor?.vendor_name || null, created_at: r.created_at || r.createdAt })) });
};

// ── Mailboxes ─────────────────────────────────────────────────────────────

/** Start checking my Outlook for bills (or change how). Needs Outlook connected with Mail.Read. */
exports.watchMyMailbox = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  let account;
  try {
    account = await inbox.mailboxFor(req.user.id);
  } catch (error) {
    if (error instanceof MailboxError) return fail(res, error.status, error.message, { code: error.code });
    throw error;
  }
  const mode = req.body?.mode === 'ALL_ATTACHMENTS' ? 'ALL_ATTACHMENTS' : 'LIKELY_BILLS';
  const existing = await BillInboxSource.findOne({ where: { client_id: clientId, user_id: req.user.id } });
  const source = existing
    ? await existing.update({ mode, enabled: true, mailbox_email: account.from_email, last_error: null })
    : await BillInboxSource.create({ client_id: clientId, user_id: req.user.id, mailbox_email: account.from_email, mode, enabled: true });
  inbox.checkClientNow(clientId);
  return res.json({ success: true, message: `LedgerLine will check ${account.from_email} for bills every 15 minutes. Checking now.`, data: { id: source.id } });
};

/** Pause / resume / change mode. Only the mailbox owner or a company admin. */
exports.updateSource = async (req, res) => {
  const source = await BillInboxSource.findOne({ where: { client_id: clientOf(req), id: req.params.id } });
  if (!source) return fail(res, 404, 'Mailbox not found');
  if (Number(source.user_id) !== Number(req.user.id) && !ADMIN_ROLES.includes(String(req.user.role || '').toUpperCase())) {
    return fail(res, 403, 'Only the mailbox owner can change this');
  }
  const changes = {};
  if (req.body?.mode) changes.mode = req.body.mode === 'ALL_ATTACHMENTS' ? 'ALL_ATTACHMENTS' : 'LIKELY_BILLS';
  if (typeof req.body?.enabled === 'boolean') changes.enabled = req.body.enabled;
  await source.update(changes);
  return res.json({ success: true, message: source.enabled ? 'Saved' : 'Paused: this mailbox will not be checked until you resume it' });
};

/** Stop checking a mailbox. Documents already captured stay in the inbox. */
exports.removeSource = async (req, res) => {
  const source = await BillInboxSource.findOne({ where: { client_id: clientOf(req), id: req.params.id } });
  if (!source) return fail(res, 404, 'Mailbox not found');
  if (Number(source.user_id) !== Number(req.user.id) && !ADMIN_ROLES.includes(String(req.user.role || '').toUpperCase())) {
    return fail(res, 403, 'Only the mailbox owner can stop this');
  }
  await source.destroy();
  return res.json({ success: true, message: `Stopped checking ${source.mailbox_email || 'this mailbox'} for bills` });
};

/** "Check now": checks this company's mailboxes in the background; the list shows progress. */
exports.checkNow = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const count = await BillInboxSource.count({ where: { client_id: clientId, enabled: true } });
  if (!count) return fail(res, 409, 'No mailbox is being checked yet. Click "Watch my Outlook" first.');
  inbox.checkClientNow(clientId);
  return res.status(202).json({ success: true, message: 'Checking email for new bills…' });
};

// ── Auto-submit (straight-through processing) ─────────────────────────────

const SETTINGS_ROLES = ['FINANCE', 'DIRECTOR_CFO', ...ADMIN_ROLES];

/** Auto-submit settings plus the evidence: AI accuracy over 90 days and which vendors qualify. */
exports.autoSettings = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const autoSubmit = require('../services/apAutoSubmit.service');
  const settings = await autoSubmit.getSettings(clientId);
  const stats = await autoSubmit.stats(clientId, settings);
  return res.json({ success: true, data: { settings, stats, can_edit: SETTINGS_ROLES.includes(String(req.user.role || '').toUpperCase()) } });
};

/** Change the settings (Finance and admins). Open bills are re-checked against them. */
exports.saveAutoSettings = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  if (!SETTINGS_ROLES.includes(String(req.user.role || '').toUpperCase())) return fail(res, 403, 'Only Finance or an admin can change auto-submit');
  const autoSubmit = require('../services/apAutoSubmit.service');
  const before = await autoSubmit.getSettings(clientId);
  const settings = await autoSubmit.saveSettings(clientId, req.body || {}, req.user.id);
  await recordAudit(req, {
    module: 'AP', entityType: 'AP_AUTO_SUBMIT_SETTINGS', entityId: clientId, action: 'AP_AUTO_SUBMIT_SETTINGS_CHANGED', before, after: settings,
    note: `Auto-submit ${settings.enabled ? 'ON' : 'OFF'}, limit ${settings.max_amount}, track record ${settings.track_record}, spot check 1 in ${settings.spot_check_every}`
  }).catch(() => {});
  autoSubmit.recheckOpen(clientId).catch((e) => console.error('[auto-submit] recheck failed:', e.message));
  return res.json({ success: true, message: settings.enabled ? 'Auto-submit is on for new clean bills' : 'Auto-submit is off: every bill goes to a person', data: settings });
};
