'use strict';

/**
 * Straight-through processing for AI-read bills (Autopilot autonomy level L2: auto + sampling).
 *
 * 1. Every AI-read bill that becomes an invoice records what the AI read vs what was submitted
 *    (ap_ai_reviews), so accuracy is measured per vendor and per field.
 * 2. Every bill captured by the bill inbox gets the clean-bill test: high-confidence fields, the
 *    arithmetic checks, vendor matched by GSTIN, the PO printed on the bill, enough received and not
 *    yet billed on the PO, no duplicates, under the amount limit, open financial year, and a vendor
 *    whose recent AI-read bills needed no corrections. The result (and every reason it failed) is
 *    stored on the bill.
 * 3. When the company switches auto-submit on (off by default), a clean bill is submitted for
 *    approval without a person, except a random spot check (1 in N) that still goes to a person.
 * 4. A vendor drops back to manual review as soon as one of its recent bills needed a correction,
 *    or an auto-submitted invoice was rejected or edited after submission.
 *
 * Auto-submit only does the data entry. Approval and payment always stay with people.
 */
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  ApAutoSubmitSetting, ApAiReview, BillInboxItem, BillInboxSource, Invoice, Vendor, PurchaseOrder, PurchaseOrderItem,
  GRN, GRNItem, ServiceEntrySheet, PurchaseReturn, PurchaseReturnItem, User
} = require('../models');
const { normalizeDate, toNumber } = require('./invoiceExtraction.service');

const DEFAULTS = { enabled: false, max_amount: 100000, track_record: 5, spot_check_every: 10 };
const OPEN_PO_STATUSES = ['APPROVED', 'ISSUED', 'PARTIAL_RECEIVED', 'RECEIVED'];
const CRITICAL_FIELDS = [
  ['invoice_number', 'Invoice number'], ['invoice_date', 'Invoice date'], ['subtotal', 'Amount before GST'],
  ['tax_amount', 'GST amount'], ['total_amount', 'Total']
];
const FIELD_LABEL = {
  vendor: 'Vendor', po: 'PO', invoice_number: 'Invoice number', invoice_date: 'Invoice date', due_date: 'Due date',
  subtotal: 'Amount before GST', tax_amount: 'GST amount', total_amount: 'Total'
};
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ── Settings ──────────────────────────────────────────────────────────────

async function getSettings(clientId) {
  const row = await ApAutoSubmitSetting.findOne({ where: { client_id: clientId } });
  if (!row) return { ...DEFAULTS };
  return { enabled: row.enabled, max_amount: Number(row.max_amount), track_record: row.track_record, spot_check_every: row.spot_check_every, updated_at: row.updated_at };
}

async function saveSettings(clientId, values, userId) {
  const clean = {
    enabled: Boolean(values.enabled),
    max_amount: Math.max(0, round2(toNumber(values.max_amount) ?? DEFAULTS.max_amount)),
    track_record: Math.min(50, Math.max(1, parseInt(values.track_record, 10) || DEFAULTS.track_record)),
    spot_check_every: Math.min(100, Math.max(1, parseInt(values.spot_check_every, 10) || DEFAULTS.spot_check_every)),
    updated_by: userId
  };
  const row = await ApAutoSubmitSetting.findOne({ where: { client_id: clientId } });
  if (row) await row.update(clean); else await ApAutoSubmitSetting.create({ client_id: clientId, ...clean });
  return getSettings(clientId);
}

// ── Step 1: what the AI read vs what was submitted ────────────────────────

/** The comparable values from an extraction (the shape POST /ap-invoices/extract returns). */
function readValuesFromExtraction(extraction) {
  const h = extraction?.header;
  if (!h) return null;
  const m = extraction.matches || {};
  return cleanReadValues({
    vendor_id: m.vendor?.id ?? null,
    po_id: m.purchase_order?.id ?? null,
    invoice_number: h.invoice_number?.value,
    invoice_date: h.invoice_date?.value,
    due_date: h.due_date?.value,
    subtotal: h.subtotal?.value,
    tax_amount: h.tax_amount?.value,
    total_amount: h.total_amount?.value
  });
}

/** Normalises read values (also those the browser sends for "Upload bill (AI)"). Null if none. */
function cleanReadValues(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    vendor_id: raw.vendor_id ? Number(raw.vendor_id) : null,
    po_id: raw.po_id ? Number(raw.po_id) : null,
    invoice_number: String(raw.invoice_number || '').trim() || null,
    invoice_date: normalizeDate(raw.invoice_date),
    due_date: normalizeDate(raw.due_date),
    subtotal: toNumber(raw.subtotal),
    tax_amount: toNumber(raw.tax_amount),
    total_amount: toNumber(raw.total_amount)
  };
}

/**
 * Fields a person changed. A field the AI left blank and the person filled in counts too, except the
 * due date and the PO (often simply not printed; the clean-bill test catches a missing PO anyway).
 */
function correctedFields(read, submitted) {
  const out = [];
  const num = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) <= 1);
  const str = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  if (Number(read.vendor_id || 0) !== Number(submitted.vendor_id || 0)) out.push('vendor');
  if (read.po_id && Number(read.po_id) !== Number(submitted.po_id || 0)) out.push('po');
  if (!str(read.invoice_number, submitted.invoice_number)) out.push('invoice_number');
  if (!str(read.invoice_date, submitted.invoice_date)) out.push('invoice_date');
  if (read.due_date && !str(read.due_date, submitted.due_date)) out.push('due_date');
  if (!num(read.subtotal, submitted.subtotal)) out.push('subtotal');
  if (!num(read.tax_amount ?? 0, submitted.tax_amount ?? 0)) out.push('tax_amount');
  if (!num(read.total_amount, submitted.total_amount)) out.push('total_amount');
  return out;
}

/** The invoice as it was saved, to notice later edits of an auto-submitted invoice. */
const invoiceSnapshot = (inv) => ({
  invoice_number: inv.invoice_number, invoice_date: normalizeDate(inv.invoice_date), vendor_id: inv.vendor_id, po_id: inv.po_id,
  base_amount: round2(inv.base_amount), total_amount: round2(inv.total_amount)
});

async function recordReview({ clientId, invoice, read, submitted, inboxItemId, channel, auto }) {
  const corrected = auto ? [] : correctedFields(read, submitted);
  return ApAiReview.create({
    client_id: clientId,
    vendor_id: invoice.vendor_id,
    invoice_id: invoice.id,
    bill_inbox_id: inboxItemId,
    channel,
    auto_submitted: Boolean(auto),
    read_values: read,
    submitted_values: { ...submitted, saved: invoiceSnapshot(invoice) },
    corrected_fields: corrected
  });
}

/** Why one review row counts against the vendor's track record, or null if it was clean. */
function reviewIssue(row) {
  const corrected = Array.isArray(row.corrected_fields) ? row.corrected_fields : [];
  if (corrected.length) return `a person corrected ${corrected.map((f) => FIELD_LABEL[f] || f).join(', ')}`;
  if (row.auto_submitted && row.invoice) {
    if (row.invoice.status === 'REJECTED') return 'an auto-submitted invoice was rejected';
    const saved = row.submitted_values?.saved;
    if (saved) {
      const now = invoiceSnapshot(row.invoice);
      const changed = Object.keys(saved).some((k) => String(saved[k] ?? '').toLowerCase() !== String(now[k] ?? '').toLowerCase());
      if (changed) return 'an auto-submitted invoice was edited after submission';
    }
  }
  return null;
}

/** Step 4: the vendor's last N AI-read bills must all be clean. */
async function trackRecord(clientId, vendorId, needed) {
  if (!vendorId) return { qualified: false, clean: 0, needed, issue: null };
  const rows = await ApAiReview.findAll({
    where: { client_id: clientId, vendor_id: vendorId },
    include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'status', 'invoice_number', 'invoice_date', 'vendor_id', 'po_id', 'base_amount', 'total_amount'] }],
    order: [['id', 'DESC']],
    limit: needed
  });
  let clean = 0;
  for (const row of rows) {
    const issue = reviewIssue(row);
    if (issue) return { qualified: false, clean, needed, issue };
    clean += 1;
  }
  return { qualified: clean >= needed, clean, needed, issue: null };
}

// ── Step 2: the clean-bill test ───────────────────────────────────────────

/**
 * Received on the PO (goods accepted less returns, at PO prices, plus approved service entries)
 * that is not billed yet, with the company's three-way-match tolerance.
 */
async function receivedNotBilled(po, excludeInvoiceId = null) {
  const items = await PurchaseOrderItem.findAll({ where: { po_id: po.id }, attributes: ['id', 'unit_price'] });
  const price = new Map(items.map((i) => [i.id, Number(i.unit_price || 0)]));
  const grns = await GRN.findAll({ where: { po_id: po.id, client_id: po.client_id, status: { [Op.ne]: 'REJECTED' } }, attributes: ['id'] });
  let goods = 0;
  if (grns.length) {
    const grnItems = await GRNItem.findAll({ where: { grn_id: { [Op.in]: grns.map((g) => g.id) } }, attributes: ['id', 'po_item_id', 'accepted_quantity', 'received_quantity'] });
    grnItems.forEach((gi) => { goods += Number(gi.accepted_quantity ?? gi.received_quantity ?? 0) * (price.get(gi.po_item_id) || 0); });
    const returned = await PurchaseReturnItem.findAll({
      attributes: ['amount'],
      include: [{ model: PurchaseReturn, as: 'purchaseReturn', attributes: [], where: { grn_id: { [Op.in]: grns.map((g) => g.id) } } }]
    }).catch(() => []);
    goods -= returned.reduce((s, r) => s + Number(r.amount || 0), 0);
  }
  const services = Number(await ServiceEntrySheet.sum('total_value', { where: { po_id: po.id, client_id: po.client_id, status: 'APPROVED' } }) || 0);
  const billed = Number(await Invoice.sum('base_amount', {
    where: { po_id: po.id, client_id: po.client_id, status: { [Op.ne]: 'REJECTED' }, ...(excludeInvoiceId ? { id: { [Op.ne]: excludeInvoiceId } } : {}) }
  }) || 0);
  const ThreeWayMatchService = require('./ThreeWayMatchService');
  const rule = await ThreeWayMatchService.getActiveRule(po.client_id);
  return { received: round2(goods + services), billed: round2(billed), rule };
}

/**
 * The clean-bill test for one captured bill. Returns { clean, reasons }. Reasons are written for the
 * person who will review the bill ("why it needs you").
 */
async function cleanCheck(item, settings) {
  const reasons = [];
  const add = (r) => reasons.push(r);
  const x = item.extraction;
  if (item.document_type !== 'INVOICE') return { clean: false, reasons: ['Only invoices are submitted automatically'] };
  if (!x?.header) return { clean: false, reasons: ['The AI could not read this bill'] };
  if (item.status === 'DUPLICATE') add(item.status_reason || 'Duplicate bill');

  // Fields read with high confidence
  CRITICAL_FIELDS.forEach(([key, label]) => {
    const f = x.header[key];
    if (!f?.value) add(`${label} not found on the bill`);
    else if (f.confidence !== 'high') add(`${label} read with ${f.confidence} confidence${f.note ? ` (${f.note})` : ''}`);
  });
  // Arithmetic: errors, and warnings about the amounts (a missing due date is fine)
  (x.checks || []).forEach((c) => {
    if (c.severity === 'error' || /^(subtotal|tax_amount|total_amount|line_items)/.test(c.field)) add(c.message);
  });

  // Vendor
  const m = x.matches || {};
  const vendor = item.vendor_id ? await Vendor.findOne({ where: { id: item.vendor_id, client_id: item.client_id } }) : null;
  if (!vendor) add('Vendor not found in Vendor Master');
  else {
    if (item.vendor_matched_by !== 'GSTIN') add(`Vendor matched by ${item.vendor_matched_by === 'EMAIL' ? 'sender email' : 'name'}, not GSTIN`);
    if (vendor.status !== 'ACTIVE') add(`Vendor is ${String(vendor.status || 'not active').toLowerCase()}`);
  }

  // PO and what has been received on it
  const po = item.po_id ? await PurchaseOrder.findOne({ where: { id: item.po_id, client_id: item.client_id } }) : null;
  const total = toNumber(x.header.total_amount?.value);
  const tax = toNumber(x.header.tax_amount?.value) ?? 0;
  const preTax = toNumber(x.header.subtotal?.value) ?? (total != null ? total - tax : null);
  if (!po) add('No purchase order linked');
  else {
    if (item.po_matched_by !== 'NUMBER') add('No PO number printed on the bill');
    if (vendor && Number(po.vendor_id) !== Number(vendor.id)) add(`PO ${po.po_number} belongs to another vendor`);
    if (!OPEN_PO_STATUSES.includes(po.status)) add(`PO ${po.po_number} is ${String(po.status).toLowerCase().replace(/_/g, ' ')}`);
    if (!po.property_id) add(`PO ${po.po_number} has no property / site`);
    if (preTax != null && Number(po.total_amount) > 0 && preTax > Number(po.total_amount) * 1.02) add(`Bill is more than the value of PO ${po.po_number}`);
    if (preTax != null) {
      const { received, billed, rule } = await receivedNotBilled(po);
      const open = round2(received - billed);
      const allowance = Math.max(open * (Number(rule.tolerance_pct || 0) / 100), Number(rule.tolerance_amount || 0));
      if (received <= 0) add(`Nothing received yet on PO ${po.po_number} (no goods receipt or approved service entry)`);
      else if (preTax > open + allowance + 1) add(`Bill (${inr(preTax)} before GST) is more than what was received and not yet billed on PO ${po.po_number} (${inr(Math.max(open, 0))})`);
    }
  }

  if (m.possible_duplicate) add(`Possible duplicate of invoice ${m.possible_duplicate.invoice_number} (#${m.possible_duplicate.id})`);
  if (total != null && total > settings.max_amount) add(`Above the auto-submit limit of ${inr(settings.max_amount)}`);

  const invoiceDate = normalizeDate(x.header.invoice_date?.value);
  if (invoiceDate) {
    const { isClosed, toFiscalYear } = require('./financialPeriod.service');
    const year = toFiscalYear(invoiceDate);
    if (await isClosed(year)) add(`Financial year ${year} is closed`);
  }

  if (vendor) {
    const tr = await trackRecord(item.client_id, vendor.id, settings.track_record);
    if (!tr.qualified) {
      add(tr.issue
        ? `Vendor's recent bills needed review: ${tr.issue}`
        : `Vendor has ${tr.clean} of ${tr.needed} AI-read bills accepted without corrections so far`);
    }
  }
  return { clean: reasons.length === 0, reasons };
}

// ── Step 3: auto-submit ───────────────────────────────────────────────────

/**
 * Who the automatic submission is recorded as: the owner of the mailbox the bill came from, acting
 * as Accounts Payable inside the bill's own company (never with an admin's cross-company reach).
 */
async function actorFor(item) {
  const source = item.source_id ? await BillInboxSource.findByPk(item.source_id) : null;
  if (!source) return null;
  const user = await User.findByPk(source.user_id, { attributes: ['id'] });
  if (!user) return null;
  return { id: user.id, role: 'ACCOUNTS_PAYABLE', client_id: item.client_id };
}

/** Copies the captured file to the invoice's documents (as an upload would). */
async function attachFile(item, invoice) {
  const inbox = require('./billInbox.service');
  const fileStore = require('../utils/fileStore');
  const file = await inbox.readFile(item);
  if (!file) return;
  const ext = path.extname(item.storage_key || '') || '.pdf';
  const name = `${Date.now()}-inbox-${item.id}${ext}`;
  const abs = path.join(fileStore.uploadRoot(), 'invoices', name);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, file.buffer);
  await fileStore.persistUpload({ path: abs, mimetype: item.content_type, size: file.buffer.length });
  await invoice.update({ document_url: `/uploads/invoices/${name}` });
}

const bodyFromItem = (item, po) => {
  const h = item.extraction.header;
  const val = (k) => h[k]?.value || null;
  return {
    bill_inbox_id: item.id,
    vendor_id: item.vendor_id,
    po_id: item.po_id,
    property_id: po?.property_id || null,
    invoice_number: val('invoice_number'),
    invoice_date: val('invoice_date'),
    due_date: val('due_date'),
    subtotal: val('subtotal'),
    tax_rate_percent: val('tax_rate_percent'),
    tax_amount: val('tax_amount'),
    total_amount: val('total_amount'),
    line_items: item.extraction.line_items || [],
    source: 'AI_EXTRACTED'
  };
};

/**
 * Runs the clean-bill test on a freshly read bill, stores the result and, when auto-submit is on,
 * submits a clean bill (or picks it as a spot check). allowSubmit=false only re-checks.
 */
async function evaluate(item, { allowSubmit = true } = {}) {
  if (item.status !== 'NEW' || item.document_type !== 'INVOICE') {
    if (item.auto_check) await item.update({ auto_check: null });
    return item;
  }
  const settings = await getSettings(item.client_id);
  const check = await cleanCheck(item, settings);
  const stamp = { ...check, checked_at: new Date().toISOString() };
  if (!check.clean || !settings.enabled || !allowSubmit) return item.update({ auto_check: stamp });

  if (Math.random() < 1 / settings.spot_check_every) {
    return item.update({ auto_check: stamp, spot_check: true, status_reason: `Spot check: every check passed, but 1 in ${settings.spot_check_every} clean bills still goes to a person` });
  }
  const actor = await actorFor(item);
  if (!actor) return item.update({ auto_check: { ...stamp, clean: false, reasons: ['Could not submit automatically: the mailbox owner was not found'] } });

  const po = await PurchaseOrder.findOne({ where: { id: item.po_id, client_id: item.client_id } });
  const { submitApInvoice } = require('../controllers/apAutomation.controller');
  const req = { user: actor, body: {}, headers: {}, ip: null, get: () => '', originalUrl: '/bill-inbox/auto-submit', method: 'POST' };
  const result = await submitApInvoice(req, bodyFromItem(item, po), { auto: true });
  if (result.status !== 201) {
    const reasons = (result.json.checks || []).filter((c) => c.severity === 'error').map((c) => c.message);
    return item.update({ auto_check: { ...stamp, clean: false, reasons: reasons.length ? reasons : [result.json.message] } });
  }
  await item.reload();
  await item.update({ auto_check: stamp });
  await attachFile(item, result.json.data).catch((e) => console.error('[auto-submit] file copy failed:', e.message));
  return item;
}

/** Re-runs the test (without submitting) on open bills, e.g. after the settings change. */
async function recheckOpen(clientId) {
  const items = await BillInboxItem.findAll({ where: { client_id: clientId, status: 'NEW', document_type: 'INVOICE' }, limit: 300 });
  for (const item of items) await evaluate(item, { allowSubmit: false }); // eslint-disable-line no-await-in-loop
}

// ── Figures for the settings screen ───────────────────────────────────────

async function stats(clientId, settings) {
  const since = new Date(Date.now() - 90 * 86400000);
  const rows = await ApAiReview.findAll({
    where: { client_id: clientId, created_at: { [Op.gte]: since } },
    include: [
      { model: Invoice, as: 'invoice', attributes: ['id', 'status', 'invoice_number', 'invoice_date', 'vendor_id', 'po_id', 'base_amount', 'total_amount'] },
      { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] }
    ],
    order: [['id', 'DESC']]
  });
  const fieldCounts = {};
  let clean = 0;
  let auto = 0;
  rows.forEach((r) => {
    const issue = reviewIssue(r);
    if (!issue) clean += 1;
    if (r.auto_submitted) auto += 1;
    (r.corrected_fields || []).forEach((f) => { fieldCounts[f] = (fieldCounts[f] || 0) + 1; });
  });
  const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean))];
  const vendors = [];
  for (const id of vendorIds) {
    const tr = await trackRecord(clientId, id, settings.track_record); // eslint-disable-line no-await-in-loop
    const name = rows.find((r) => r.vendor_id === id)?.vendor?.vendor_name || `Vendor #${id}`;
    vendors.push({ vendor_id: id, vendor_name: name, qualified: tr.qualified, clean: tr.clean, needed: tr.needed, issue: tr.issue });
  }
  vendors.sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.clean - a.clean);
  return {
    days: 90,
    bills: rows.length,
    clean,
    auto_submitted: auto,
    corrected_fields: Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]).map(([field, count]) => ({ field, label: FIELD_LABEL[field] || field, count })),
    vendors
  };
}

module.exports = {
  DEFAULTS, getSettings, saveSettings, readValuesFromExtraction, cleanReadValues, correctedFields, recordReview,
  trackRecord, cleanCheck, evaluate, recheckOpen, stats
};
