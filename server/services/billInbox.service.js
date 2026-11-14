'use strict';

/**
 * Bill inbox: captures vendor bills from a connected Outlook mailbox, reads them with the same AI
 * reader as "Upload bill (AI)", sorts them (invoice / credit note / statement / other), matches the
 * vendor and PO, flags duplicates, and keeps them for a person to review. Nothing is posted or
 * paid here: an invoice is created only when someone accepts it on the Invoices page.
 *
 * Mail is read with the mailbox owner's delegated Outlook permission (Mail.Read), Inbox folder only.
 * In LIKELY_BILLS mode only emails from known vendors, or that look like bills, are opened.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const {
  BillInboxSource, BillInboxItem, UserMailAccount, Vendor, PurchaseOrder, PurchaseOrderItem, PurchaseRequisition, PurchaseReturn
} = require('../models');
const { extractInvoice, normalizeDate, toNumber } = require('./invoiceExtraction.service');
const { ExtractionError, sniffType } = require('./vendorExtraction.service');
const { MailboxError } = require('./userMailbox.service');
const fileStore = require('../utils/fileStore');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const FIRST_LOOKBACK_DAYS = 7;
const MAX_FILES_PER_RUN = 20; // AI reads per mailbox per check, to keep cost and run time bounded
const MAX_PAGES = 4; // 50 emails per page
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIN_IMAGE_BYTES = 15 * 1024; // smaller images are logos and signature icons
const FILE_EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const NAME_EXT = /\.(pdf|jpe?g|png|gif|webp)$/i;
const PUBLIC_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'rediffmail.com', 'aol.com', 'protonmail.com', 'proton.me', 'zohomail.in', 'zoho.com']);
const BILL_WORDS = /\b(invoices?|inv|bills?|billing|tax\s*invoice|credit\s*note|debit\s*note|statement|soa|ledger|proforma|payment\s*due|dues|outstanding)\b|\binv[-_#\s]?\d/i;
const OPEN_PO_STATUSES = ['APPROVED', 'ISSUED', 'PARTIAL_RECEIVED', 'RECEIVED'];
const SET_ASIDE_REASON = {
  PAYMENT_RECEIPT: 'Looks like a payment receipt or remittance advice, not a bill',
  PURCHASE_ORDER: 'Looks like a purchase order, not a bill',
  OTHER: 'Does not look like a bill, credit note or statement'
};

const lower = (v) => String(v || '').trim().toLowerCase();
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const domainOf = (email) => lower(email).split('@')[1] || '';
const running = new Set(); // source ids being checked right now

// ── Outlook ────────────────────────────────────────────────────────────────

/** The source owner's Outlook connection, if it can read mail; otherwise a MailboxError the UI understands. */
async function mailboxFor(userId) {
  const account = await UserMailAccount.findOne({ where: { user_id: userId } });
  if (!account) throw new MailboxError('Connect your Outlook so LedgerLine can check it for bills.', 412, 'NO_MAILBOX');
  if (account.provider !== 'MICROSOFT') throw new MailboxError('Checking email for bills works with an Outlook (Microsoft 365) connection.', 409, 'NOT_OUTLOOK');
  if (!lower(account.oauth_scopes).split(/\s+/).includes('mail.read')) {
    throw new MailboxError('Allow LedgerLine to read your Outlook mail (the "Read your mail" permission) so it can pick up bills.', 409, 'NEEDS_MAIL_READ');
  }
  return account;
}

async function graph(account, pathOrUrl, { raw = false } = {}) {
  const { accessTokenFor } = require('./mailOAuth.service');
  const token = await accessTokenFor(account);
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) throw new MailboxError('Outlook did not allow reading the mailbox. Reconnect Outlook.', 409, 'NEEDS_MAIL_READ');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new MailboxError(`Outlook error: ${data.error?.message || res.status}`, 502, 'GRAPH_ERROR');
  }
  return raw ? res : res.json();
}

// ── Matching and sorting ───────────────────────────────────────────────────

async function vendorByEmail(clientId, email) {
  if (!email) return null;
  return Vendor.findOne({ where: { client_id: clientId, [Op.and]: [sqlWhere(fn('LOWER', fn('TRIM', col('email'))), lower(email))] } });
}

/** A credit note's return: the vendor's after-invoice return waiting for one, closest in amount. */
async function returnForCreditNote(clientId, vendorId, total) {
  if (!vendorId) return null;
  const open = await PurchaseReturn.findAll({ where: { client_id: clientId, vendor_id: vendorId, stage: 'AFTER_INVOICE', status: 'AWAITING_CREDIT_NOTE' }, order: [['id', 'DESC']] });
  if (!open.length) return null;
  const byAmount = total ? open.find((r) => Math.abs(Number(r.total_amount) - total) <= 1) : null;
  return byAmount || (open.length === 1 ? open[0] : null);
}

/**
 * Sorts and matches what the AI read, in the same shape as POST /ap-invoices/extract, so the review
 * form can be filled exactly as for an uploaded bill. Returns the item fields to save.
 */
async function sortAndMatch(clientId, result, { fromEmail, itemId = null }) {
  const { matchVendor, findDuplicates } = require('../controllers/apAutomation.controller');
  const tenantWhere = { client_id: clientId };
  const type = result.document_type || 'OTHER';
  const h = result.header;
  const invoiceNumber = h.invoice_number.value || null;
  const invoiceDate = normalizeDate(h.invoice_date.value);
  const total = toNumber(h.total_amount.value);

  const match = await matchVendor(tenantWhere, { gst_number: result.party.gst_number.value, name: result.party.name.value });
  let vendor = match.vendor;
  let vendorMatchedBy = match.matched_by;
  if (!vendor) {
    vendor = await vendorByEmail(clientId, fromEmail);
    if (vendor) vendorMatchedBy = 'EMAIL';
  }

  let po = null;
  let poMatchedBy = null;
  if (h.po_number.value) {
    po = await PurchaseOrder.findOne({ where: { ...tenantWhere, po_number: h.po_number.value.trim() } });
    if (po) poMatchedBy = 'NUMBER';
  }
  if (!po && vendor && type === 'INVOICE') {
    const open = await PurchaseOrder.findAll({ where: { ...tenantWhere, vendor_id: vendor.id, status: { [Op.in]: OPEN_PO_STATUSES } }, limit: 2 });
    if (open.length === 1) { po = open[0]; poMatchedBy = 'ONLY_OPEN_PO'; }
  }
  if (po && Array.isArray(result.line_items) && result.line_items.length) {
    const ThreeWayMatchService = require('./ThreeWayMatchService');
    const poItems = await PurchaseOrderItem.findAll({ where: { po_id: po.id }, attributes: ['id', 'item_name', 'unit_price'] });
    ThreeWayMatchService.suggestPoLines(poItems, result.line_items).forEach((id, i) => { result.line_items[i].po_item_id = id; });
  }
  const pr = po?.pr_id ? await PurchaseRequisition.findOne({ where: { id: po.pr_id }, attributes: ['id', 'department_id', 'requested_by_user_id'] }) : null;

  let duplicate = null;
  let possible = null;
  let inboxTwin = null;
  if (type === 'INVOICE' && vendor) {
    const d = await findDuplicates(tenantWhere, { vendor_id: vendor.id, invoice_number: invoiceNumber, total_amount: total, invoice_date: invoiceDate });
    duplicate = d.exact;
    possible = d.similar;
    if (!duplicate && invoiceNumber) {
      // The same bill sent twice as different files (e.g. a reminder with a fresh PDF).
      inboxTwin = await BillInboxItem.findOne({
        where: {
          client_id: clientId, vendor_id: vendor.id, status: { [Op.in]: ['NEW', 'ACCEPTED'] },
          ...(itemId ? { id: { [Op.ne]: itemId } } : {}),
          [Op.and]: [sqlWhere(fn('LOWER', col('invoice_number')), lower(invoiceNumber))]
        }
      });
    }
  }
  const ret = type === 'CREDIT_NOTE' ? await returnForCreditNote(clientId, vendor?.id, total) : null;

  let status = 'NEW';
  let reason = null;
  if (SET_ASIDE_REASON[type]) { status = 'SET_ASIDE'; reason = SET_ASIDE_REASON[type]; }
  if (duplicate) { status = 'DUPLICATE'; reason = `Invoice ${duplicate.invoice_number} from this vendor is already recorded (#${duplicate.id})`; }
  if (inboxTwin) { status = 'DUPLICATE'; reason = `The same invoice ${inboxTwin.invoice_number} is already in the bill inbox (#${inboxTwin.id})`; }

  const brief = (inv) => inv && ({ id: inv.id, invoice_number: inv.invoice_number, total_amount: inv.total_amount, invoice_date: inv.invoice_date, status: inv.status });
  const extraction = {
    ...result,
    matches: {
      vendor: vendor ? { id: vendor.id, vendor_name: vendor.vendor_name, matched_by: vendorMatchedBy } : null,
      vendor_candidates: (match.candidates || []).map((v) => ({ id: v.id, vendor_name: v.vendor_name, gst_number: v.gst_number })),
      purchase_order: po ? { id: po.id, po_number: po.po_number, vendor_id: po.vendor_id, property_id: po.property_id, total_amount: po.total_amount, status: po.status, matched_by: poMatchedBy } : null,
      po_vendor_mismatch: Boolean(po && vendor && Number(po.vendor_id) !== Number(vendor.id)),
      duplicate: brief(duplicate),
      possible_duplicate: brief(possible)
    }
  };

  return {
    document_type: type,
    extraction,
    party_name: (result.party.name.value || '').slice(0, 255) || null,
    invoice_number: invoiceNumber ? invoiceNumber.slice(0, 100) : null,
    invoice_date: invoiceDate,
    total_amount: total != null ? round2(total) : null,
    vendor_id: vendor?.id || null,
    vendor_matched_by: vendorMatchedBy || null,
    po_id: po?.id || null,
    po_matched_by: poMatchedBy,
    department_id: po?.department_id || pr?.department_id || null,
    requested_by_user_id: pr?.requested_by_user_id || null,
    duplicate_invoice_id: duplicate?.id || null,
    possible_duplicate_invoice_id: possible?.id || null,
    purchase_return_id: ret?.id || null,
    status,
    status_reason: reason,
    error: null
  };
}

// ── Files ──────────────────────────────────────────────────────────────────

async function saveFile(clientId, hash, buffer, mime) {
  const key = `bill-inbox/${clientId}/${hash}${FILE_EXT[mime] || ''}`;
  const abs = path.join(fileStore.uploadRoot(), ...key.split('/'));
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, buffer);
  await fileStore.persistUpload({ path: abs, mimetype: mime, size: buffer.length });
  return key;
}

/** The stored file of an item: { buffer, contentType } or null. */
async function readFile(item) {
  if (!item.storage_key) return null;
  const abs = path.join(fileStore.uploadRoot(), ...item.storage_key.split('/'));
  if (fs.existsSync(abs)) return { buffer: await fs.promises.readFile(abs), contentType: item.content_type };
  if (!fileStore.enabled()) return null;
  const stored = await fileStore.readStored(item.storage_key);
  if (!stored) return null;
  let buffer = stored.body;
  if (!Buffer.isBuffer(buffer)) {
    const chunks = [];
    for await (const chunk of buffer) chunks.push(chunk);
    buffer = Buffer.concat(chunks);
  }
  return { buffer, contentType: stored.contentType || item.content_type };
}

/**
 * Runs the AI reader on an item's file, saves the sorted, matched result (or why it failed), then the
 * clean-bill test, which may auto-submit it when the company has that on (allowSubmit=false: never).
 */
async function readItem(item, { allowSubmit = true } = {}) {
  const file = await readFile(item);
  if (!file) return item.update({ status: 'FAILED', error: 'The file is no longer available.' });
  try {
    const result = await extractInvoice({ buffer: file.buffer }, 'AP');
    const fields = await sortAndMatch(item.client_id, result, { fromEmail: item.email_from, itemId: item.id });
    await item.update({ ...fields, auto_check: null, spot_check: false });
    try {
      await require('./apAutoSubmit.service').evaluate(item, { allowSubmit });
    } catch (e) {
      console.error('[bill-inbox] clean-bill check failed:', e.message);
    }
    return item;
  } catch (error) {
    const msg = error instanceof ExtractionError ? error.message : 'The AI could not read this file.';
    if (!(error instanceof ExtractionError)) console.error('[bill-inbox] read failed:', error.message);
    return item.update({ status: 'FAILED', error: msg.slice(0, 500) });
  }
}

// ── Mailbox check ──────────────────────────────────────────────────────────

/** Known vendor addresses and company domains for this client (used in LIKELY_BILLS mode). */
async function vendorSenders(clientId) {
  const rows = await Vendor.findAll({ where: { client_id: clientId, email: { [Op.ne]: null } }, attributes: ['email'] });
  const emails = new Set();
  const domains = new Set();
  rows.forEach((v) => String(v.email).split(/[;,\s]+/).forEach((e) => {
    const addr = lower(e);
    if (!addr.includes('@')) return;
    emails.add(addr);
    if (!PUBLIC_DOMAINS.has(domainOf(addr))) domains.add(domainOf(addr));
  }));
  return { emails, domains };
}

const usableAttachment = (a) => a['@odata.type'] === '#microsoft.graph.fileAttachment' && !a.isInline
  && a.size <= MAX_FILE_BYTES && (NAME_EXT.test(a.name || '') || FILE_EXT[lower(a.contentType)]);

/**
 * Checks one mailbox for new bills. Returns { captured, more } (more: stopped at the per-check limit),
 * or { busy: true } if this mailbox is already being checked, or { error } if the check failed.
 */
async function checkSource(source) {
  if (running.has(source.id)) return { captured: 0, busy: true };
  running.add(source.id);
  let captured = 0;
  let watermark = source.checked_until ? new Date(source.checked_until) : new Date(Date.now() - FIRST_LOOKBACK_DAYS * 86400000);
  try {
    const account = await mailboxFor(source.user_id);
    const own = lower(account.from_email);
    const senders = source.mode === 'ALL_ATTACHMENTS' ? null : await vendorSenders(source.client_id);
    const select = 'id,subject,from,receivedDateTime,bodyPreview,webLink';
    let next = `/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(`receivedDateTime gt ${watermark.toISOString()} and hasAttachments eq true`)}&$orderby=receivedDateTime%20asc&$select=${select}&$top=50`;
    let pages = 0;
    let full = false;

    outer:
    while (next && pages < MAX_PAGES) {
      pages += 1;
      const page = await graph(account, next);
      next = page['@odata.nextLink'] || null;
      for (const m of page.value || []) {
        const from = lower(m.from?.emailAddress?.address);
        const received = new Date(m.receivedDateTime);
        if (!from || from === own) { watermark = received; continue; }

        const att = await graph(account, `/me/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size,isInline`);
        const files = (att.value || []).filter(usableAttachment);
        let relevant = files.length > 0;
        if (relevant && senders) {
          const known = senders.emails.has(from) || senders.domains.has(domainOf(from));
          const text = [m.subject, m.bodyPreview, ...files.map((f) => f.name)].join(' ');
          relevant = known || BILL_WORDS.test(text);
        }
        if (!relevant) { watermark = received; continue; }

        for (const f of files) {
          if (captured >= MAX_FILES_PER_RUN) { full = true; break outer; }
          const res = await graph(account, `/me/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent(f.id)}/$value`, { raw: true });
          const buffer = Buffer.from(await res.arrayBuffer());
          const mime = sniffType(buffer);
          if (!FILE_EXT[mime]) continue;
          if (mime !== 'application/pdf' && buffer.length < MIN_IMAGE_BYTES) continue;
          const hash = crypto.createHash('sha256').update(buffer).digest('hex');
          if (await BillInboxItem.findOne({ where: { client_id: source.client_id, file_hash: hash }, attributes: ['id'] })) continue;

          let item;
          try {
            const storageKey = await saveFile(source.client_id, hash, buffer, mime);
            item = await BillInboxItem.create({
              client_id: source.client_id,
              source_id: source.id,
              channel: 'EMAIL',
              email_from: from.slice(0, 255),
              email_from_name: (m.from?.emailAddress?.name || '').slice(0, 255) || null,
              email_subject: (m.subject || '').slice(0, 500) || null,
              received_at: received,
              web_link: m.webLink || null,
              file_name: (f.name || `attachment${FILE_EXT[mime]}`).slice(0, 255),
              content_type: mime,
              file_size: buffer.length,
              file_hash: hash,
              storage_key: storageKey,
              status: 'NEW'
            });
          } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') continue; // captured by a parallel check
            throw e;
          }
          captured += 1;
          await readItem(item);
        }
        watermark = received;
      }
    }
    await source.update({ checked_until: watermark, last_checked_at: new Date(), last_error: null });
    return { captured, more: full || Boolean(next) };
  } catch (error) {
    const msg = error instanceof MailboxError ? error.message : `Could not check the mailbox: ${error.message}`;
    if (!(error instanceof MailboxError)) console.error('[bill-inbox] check failed:', error.message);
    await source.update({ checked_until: watermark, last_checked_at: new Date(), last_error: msg.slice(0, 500) }).catch(() => {});
    return { captured, error: msg };
  } finally {
    running.delete(source.id);
  }
}

/** Scheduler entry point: checks every enabled mailbox, one after another. */
async function checkAll() {
  const sources = await BillInboxSource.findAll({ where: { enabled: true } });
  for (const s of sources) await checkSource(s);
}

/** Starts a check of this company's enabled mailboxes in the background. */
function checkClientNow(clientId) {
  BillInboxSource.findAll({ where: { client_id: clientId, enabled: true } })
    .then(async (sources) => { for (const s of sources) await checkSource(s); })
    .catch((e) => console.error('[bill-inbox] manual check failed:', e.message));
}

const isChecking = (sources) => sources.some((s) => running.has(s.id));

module.exports = { mailboxFor, checkSource, checkAll, checkClientNow, isChecking, readItem, readFile, sortAndMatch, returnForCreditNote };
