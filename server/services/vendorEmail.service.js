'use strict';

/**
 * Admin-approved vendor emails for awarded RFQ quotations.
 *
 * - RFQ_AWARD: the quotation was awarded but no approved PO exists yet. Contains RFQ and
 *   quotation details only, never PO details.
 * - PO_CONFIRMATION: an approved (issued) PO exists for the awarded quotation. Contains the
 *   PO number, items, prices, tax, total, delivery and payment terms, plus the PO PDF.
 *
 * Nothing is ever sent without an admin clicking Approve & Send. The details block is
 * always rebuilt from current records (the admin edits only subject and message), and
 * dedupe keys plus an atomic DRAFT -> SENDING transition stop duplicate emails.
 */
const { Op } = require('sequelize');
const {
  sequelize, VendorEmailDraft, UserMailAccount, User, Vendor, Quotation, QuotationItem, Rfq, RfqVendor,
  PurchaseOrder, PurchaseOrderItem, Property, PurchaseRequisition, Client
} = require('../models');
const { resolveConfig, resolvePoTerms, generatePoPdf } = require('./poPrint.service');
const { sendFromMailbox, MailboxError } = require('./userMailbox.service');

const APPROVED_PO_STATUSES = ['ISSUED', 'APPROVED', 'PARTIAL_RECEIVED', 'RECEIVED', 'CLOSED'];
const AWARDED_QUOTATION_STATUSES = ['APPROVED', 'PO_CREATED'];
const STALE_SENDING_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class VendorEmailError extends Error {
  constructor(message, status = 400, code = 'VENDOR_EMAIL_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const num = (v) => Number(v || 0);
const round2 = (n) => Math.round(num(n) * 100) / 100;
const inr = (n) => `₹${num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Everything the email can say, read from the records (scoped to the company). */
async function loadContext(quotationId, clientId) {
  const scope = clientId ? { client_id: clientId } : {};
  const quotation = await Quotation.findOne({
    where: { id: quotationId, ...scope },
    include: [{ model: QuotationItem, as: 'items' }]
  });
  if (!quotation) throw new VendorEmailError('Quotation not found', 404, 'NOT_FOUND');
  const companyId = quotation.client_id;
  const vendor = await Vendor.findOne({ where: { id: quotation.vendor_id, client_id: companyId } })
    || await Vendor.findByPk(quotation.vendor_id);
  const rfqVendor = await RfqVendor.findOne({ where: { response_quotation_id: quotation.id, client_id: companyId } });
  const rfq = rfqVendor ? await Rfq.findOne({ where: { id: rfqVendor.rfq_id, client_id: companyId } }) : null;
  const pr = quotation.pr_id ? await PurchaseRequisition.findOne({ where: { id: quotation.pr_id }, attributes: ['id', 'pr_number'] }) : null;
  const po = await PurchaseOrder.findOne({
    where: { quotation_id: quotation.id, client_id: companyId, status: { [Op.notIn]: ['CANCELLED', 'REJECTED'] } },
    include: [{ model: PurchaseOrderItem, as: 'items' }, { model: Property }],
    order: [['id', 'DESC']]
  });
  const cfg = await resolveConfig(companyId, po?.entity_id || null).catch(() => ({}));
  const client = await Client.findByPk(companyId, { attributes: ['client_name'] });
  const companyName = cfg.company_name || client?.client_name || 'Our company';
  return { quotation, vendor, rfq, pr, po, cfg, companyName, companyId };
}

const isApprovedPo = (po) => Boolean(po && (APPROVED_PO_STATUSES.includes(po.status) || po.is_fully_approved));

/** The non-editable details block, built only from real records. */
async function buildDetails(ctx) {
  const { quotation, rfq, pr, po, cfg, companyId } = ctx;
  const base = {
    rfq_number: rfq?.rfq_number || null,
    rfq_title: rfq?.title || null,
    pr_number: pr?.pr_number || null,
    quotation_number: quotation.quotation_number || `#${quotation.id}`,
    currency: quotation.currency || 'INR'
  };
  if (isApprovedPo(po)) {
    const items = (po.items || []).map((i) => ({
      item_name: i.item_name || 'Item',
      quantity: num(i.quantity),
      unit_price: round2(i.unit_price),
      line_total: round2(num(i.total_price) || num(i.quantity) * num(i.unit_price))
    }));
    const subtotal = round2(items.reduce((s, i) => s + i.line_total, 0) || po.total_amount);
    // POs store the pre-tax value; tax comes from the awarded quotation it was raised from.
    const tax = round2(quotation.tax_amount);
    const terms = await resolvePoTerms(po, companyId, cfg).catch(() => ({}));
    const property = po.Property;
    return {
      kind: 'PO_CONFIRMATION',
      ...base,
      po_id: po.id,
      po_number: po.po_number,
      po_status: po.status,
      po_date: po.order_date || po.created_at || po.createdAt || null,
      items,
      subtotal,
      tax_amount: tax,
      tax_note: tax ? 'Tax as per the awarded quotation' : 'No tax quoted',
      total_amount: round2(subtotal + tax),
      delivery_location: property ? [property.property_name, property.address].filter(Boolean).join(', ') : null,
      delivery_date: po.required_date || null,
      payment_terms: terms.payment || null,
      warranty: terms.warranty || null
    };
  }
  const items = (quotation.items || []).map((i) => ({
    item_name: i.item_name || 'Item',
    quantity: num(i.quantity),
    unit_price: round2(i.unit_price),
    line_total: round2(num(i.total_amount) || num(i.quantity) * num(i.unit_price))
  }));
  return {
    kind: 'RFQ_AWARD',
    ...base,
    items,
    subtotal: round2(quotation.total_amount),
    tax_amount: round2(quotation.tax_amount),
    discount_amount: round2(quotation.discount_amount),
    shipping_charges: round2(quotation.shipping_charges),
    net_amount: round2(quotation.net_amount),
    valid_until: quotation.valid_until || null,
    po_pending: Boolean(po), // a PO exists but is not approved yet
    note: po
      ? 'A purchase order has been raised and is awaiting internal approval. It will be sent separately once approved.'
      : 'A formal purchase order will follow separately.'
  };
}

const defaultContent = (details, ctx, senderName) => {
  const vendorName = ctx.vendor?.contact_person || ctx.vendor?.vendor_name || 'Sir/Madam';
  // RFQ numbers already read "RFQ-…", so don't prefix them again.
  const ref = details.rfq_number ? (/^rfq/i.test(details.rfq_number) ? details.rfq_number : `RFQ ${details.rfq_number}`) : `quotation ${details.quotation_number}`;
  const sign = `Regards,\n${senderName || 'Procurement Team'}\n${ctx.companyName}`;
  if (details.kind === 'PO_CONFIRMATION') {
    return {
      subject: `Purchase Order ${details.po_number} — ${ctx.companyName}`,
      message: `Dear ${vendorName},\n\nFurther to your quotation ${details.quotation_number}${details.rfq_number ? ` against ${ref}` : ''}, we are pleased to confirm Purchase Order ${details.po_number}. The order details are below and the approved purchase order is attached.\n\nPlease acknowledge receipt of this order and confirm the delivery schedule.\n\n${sign}`
    };
  }
  return {
    subject: `Quotation accepted — ${ref}${details.rfq_title ? ` (${details.rfq_title})` : ''}`,
    message: `Dear ${vendorName},\n\nWe are pleased to inform you that your quotation ${details.quotation_number}${details.rfq_number ? ` for ${ref}` : ''} has been accepted. The accepted items and amounts are summarised below.\n\n${details.note}\n\n${sign}`
  };
};

/** HTML + plain text for the full email (message paragraphs + details table). */
function renderEmail({ subject, message, details }) {
  const paragraphs = String(message || '').split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const rows = (details.items || []).map((i, idx) => `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${idx + 1}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(i.item_name)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${i.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${inr(i.unit_price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${inr(i.line_total)}</td></tr>`).join('');
  const kv = (label, value) => (value ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">${esc(label)}</td><td style="padding:4px 0">${esc(value)}</td></tr>` : '');
  const money = (label, value, bold = false) => `<tr><td style="padding:4px 8px;text-align:right;color:#374151">${esc(label)}</td><td style="padding:4px 8px;text-align:right;${bold ? 'font-weight:700' : ''}">${inr(value)}</td></tr>`;
  const isPo = details.kind === 'PO_CONFIRMATION';
  const refs = isPo
    ? kv('PO number', details.po_number) + kv('PO date', dateText(details.po_date)) + kv('RFQ', details.rfq_number) + kv('Quotation', details.quotation_number)
      + kv('Delivery location', details.delivery_location) + kv('Delivery by', dateText(details.delivery_date)) + kv('Payment terms', details.payment_terms) + kv('Warranty', details.warranty)
    : kv('RFQ', details.rfq_number ? `${details.rfq_number}${details.rfq_title ? ` — ${details.rfq_title}` : ''}` : null) + kv('PR', details.pr_number)
      + kv('Quotation', details.quotation_number) + kv('Quotation valid until', dateText(details.valid_until));
  const totals = isPo
    ? money('Subtotal', details.subtotal) + money(details.tax_note, details.tax_amount) + money('Total amount', details.total_amount, true)
    : money('Subtotal', details.subtotal) + (details.discount_amount ? money('Discount', -details.discount_amount) : '') + money('Tax', details.tax_amount)
      + (details.shipping_charges ? money('Shipping', details.shipping_charges) : '') + money('Accepted amount', details.net_amount, true);
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:680px">
  ${paragraphs}
  <h3 style="font-size:15px;margin:20px 0 8px">${isPo ? 'Purchase order details' : 'Accepted quotation details'}</h3>
  <table style="border-collapse:collapse;font-size:13px">${refs}</table>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px">
    <thead><tr style="background:#f3f4f6">
      <th style="padding:6px 8px;text-align:left">#</th><th style="padding:6px 8px;text-align:left">Item</th>
      <th style="padding:6px 8px;text-align:right">Qty</th><th style="padding:6px 8px;text-align:right">Unit price</th>
      <th style="padding:6px 8px;text-align:right">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="padding:8px;color:#6b7280">No line items recorded</td></tr>'}</tbody>
  </table>
  <table style="border-collapse:collapse;font-size:13px;margin:8px 0 0 auto">${totals}</table>
  ${isPo ? '<p style="margin-top:16px;color:#374151">The approved purchase order is attached as a PDF.</p>' : `<p style="margin-top:16px;color:#6b7280">${esc(details.note)}</p>`}
</div>`;
  const textItems = (details.items || []).map((i, idx) => `${idx + 1}. ${i.item_name} — ${i.quantity} × ${inr(i.unit_price)} = ${inr(i.line_total)}`).join('\n');
  const text = `${message}\n\n${isPo ? `PO ${details.po_number}` : `Quotation ${details.quotation_number}`}\n${textItems}\n${isPo ? `Total: ${inr(details.total_amount)}` : `Accepted amount: ${inr(details.net_amount)}`}`;
  return { subject, html, text };
}

const dedupeKeyFor = (companyId, details, quotationId) => (details.kind === 'PO_CONFIRMATION'
  ? `c${companyId}:po${details.po_id}:PO_CONFIRMATION`
  : `c${companyId}:q${quotationId}:RFQ_AWARD`);

/**
 * Creates (or returns the existing) draft for an awarded quotation.
 * @returns {Promise<{ draft, created: boolean, already_sent: boolean }>}
 */
async function prepareDraft({ quotationId, clientId, userId }) {
  const ctx = await loadContext(quotationId, clientId);
  if (!AWARDED_QUOTATION_STATUSES.includes(ctx.quotation.status)) {
    throw new VendorEmailError('Only awarded (accepted) quotations can be emailed to the vendor', 409, 'NOT_AWARDED');
  }
  if (!ctx.rfq) throw new VendorEmailError('This quotation was not received through an RFQ', 409, 'NOT_RFQ');
  const details = await buildDetails(ctx);
  const key = dedupeKeyFor(ctx.companyId, details, ctx.quotation.id);
  const existing = await VendorEmailDraft.findOne({ where: { dedupe_key: key } });
  if (existing) {
    // Keep the admin's edits; only refresh the record-driven details of an unsent draft.
    if (['DRAFT', 'FAILED'].includes(existing.status)) await existing.update({ details, to_email: ctx.vendor?.email || null });
    return { draft: existing, created: false, already_sent: existing.status === 'SENT' };
  }
  const sender = userId ? await User.findByPk(userId, { attributes: ['first_name', 'last_name'] }) : null;
  const senderName = sender ? `${sender.first_name || ''} ${sender.last_name || ''}`.trim() : null;
  const content = defaultContent(details, ctx, senderName);
  let draft;
  try {
    draft = await VendorEmailDraft.create({
      client_id: ctx.companyId,
      email_type: details.kind,
      rfq_id: ctx.rfq.id,
      quotation_id: ctx.quotation.id,
      vendor_id: ctx.quotation.vendor_id,
      po_id: details.po_id || null,
      to_email: ctx.vendor?.email || null,
      subject: content.subject,
      message: content.message,
      details,
      attach_po_pdf: details.kind === 'PO_CONFIRMATION',
      status: 'DRAFT',
      dedupe_key: key,
      created_by: userId || null
    });
  } catch (error) {
    if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    const raced = await VendorEmailDraft.findOne({ where: { dedupe_key: key } });
    return { draft: raced, created: false, already_sent: raced?.status === 'SENT' };
  }
  // A PO confirmation replaces an unsent award notice for the same quotation.
  let superseded = [];
  if (details.kind === 'PO_CONFIRMATION') {
    superseded = await VendorEmailDraft.findAll({
      where: { client_id: ctx.companyId, quotation_id: ctx.quotation.id, email_type: 'RFQ_AWARD', status: ['DRAFT', 'FAILED'] }
    });
    for (const old of superseded) await old.update({ status: 'CANCELLED', dedupe_key: null, failure_reason: 'Superseded by the PO confirmation email' });
  }
  return { draft, created: true, already_sent: false, superseded: superseded.map((d) => d.id) };
}

// MySQL re-orders JSON object keys on storage, so compare with sorted keys.
const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object' && !(v instanceof Date)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v instanceof Date ? v.toISOString() : v);
};
const sameDetails = (a, b) => stable(a) === stable(b);

/**
 * Approve & Send: only from DRAFT/FAILED, only through the approving admin's own mailbox,
 * only to the vendor's registered email.
 */
async function approveAndSend({ draftId, tenantWhere, userId }) {
  const draft = await VendorEmailDraft.findOne({ where: { ...tenantWhere, id: draftId } });
  if (!draft) throw new VendorEmailError('Email draft not found', 404, 'NOT_FOUND');
  if (draft.status === 'SENT') throw new VendorEmailError(`This email was already sent on ${dateText(draft.sent_at)}`, 409, 'ALREADY_SENT');
  if (draft.status === 'CANCELLED') throw new VendorEmailError('This email was cancelled', 409, 'CANCELLED');
  const staleSending = draft.status === 'SENDING' && Date.now() - new Date(draft.updated_at || draft.updatedAt).getTime() > STALE_SENDING_MS;
  if (draft.status === 'SENDING' && !staleSending) throw new VendorEmailError('This email is already being sent', 409, 'IN_PROGRESS');

  const account = await UserMailAccount.findOne({ where: { user_id: userId } });
  if (!account) throw new VendorEmailError('Connect your email account before sending', 412, 'NO_MAILBOX');

  // Re-check everything against the records right before sending.
  const ctx = await loadContext(draft.quotation_id, draft.client_id);
  const vendorEmail = String(ctx.vendor?.email || '').trim();
  if (!EMAIL_RE.test(vendorEmail)) {
    throw new VendorEmailError(`Vendor ${ctx.vendor?.vendor_name || ''} has no valid registered email. Update it in Vendor Master first.`, 422, 'NO_VENDOR_EMAIL');
  }
  const details = await buildDetails(ctx);
  if (details.kind !== draft.email_type || (details.po_id || null) !== (draft.po_id || null)) {
    await draft.update({ details });
    throw new VendorEmailError(
      draft.email_type === 'PO_CONFIRMATION'
        ? 'The purchase order is no longer approved, so a PO email cannot be sent. Cancel this draft.'
        : 'An approved purchase order now exists for this quotation. Prepare the PO email instead.',
      409, 'STALE_TYPE'
    );
  }
  if (!sameDetails(details, draft.details)) {
    await draft.update({ details, to_email: vendorEmail });
    throw new VendorEmailError('The order details changed since this draft was prepared. Review the refreshed email and approve again.', 409, 'DETAILS_CHANGED');
  }

  // Atomic lock: only one Approve & Send can move the draft to SENDING.
  const [locked] = await VendorEmailDraft.update(
    { status: 'SENDING', approved_by: userId, approved_at: new Date(), to_email: vendorEmail, attempt_count: sequelize.literal('attempt_count + 1') },
    { where: { id: draft.id, [Op.or]: [{ status: ['DRAFT', 'FAILED'] }, ...(staleSending ? [{ status: 'SENDING' }] : [])] } }
  );
  if (!locked) throw new VendorEmailError('This email is already being sent or was sent', 409, 'IN_PROGRESS');

  try {
    const attachments = [];
    if (draft.email_type === 'PO_CONFIRMATION' && draft.attach_po_pdf) {
      const pdf = await generatePoPdf(draft.po_id, draft.client_id);
      attachments.push({ filename: `${details.po_number || `PO-${draft.po_id}`}.pdf`, content: pdf, contentType: 'application/pdf' });
    }
    const { html, text, subject } = renderEmail({ subject: draft.subject, message: draft.message, details });
    // The approving admin is copied, so they receive the same email the vendor gets.
    const result = await sendFromMailbox(account, { to: vendorEmail, cc: account.from_email, subject, html, text, attachments });
    await VendorEmailDraft.update(
      { status: 'SENT', sent_at: new Date(), sent_from: account.from_email, message_id: result.messageId, failure_reason: null },
      { where: { id: draft.id } }
    );
    await account.update({ last_error: null });
    if (draft.email_type === 'PO_CONFIRMATION') {
      await PurchaseOrder.update({ vendor_email_sent_at: new Date(), vendor_email_sent_to: vendorEmail }, { where: { id: draft.po_id, client_id: draft.client_id } }).catch(() => {});
    }
    return { draft: await VendorEmailDraft.findByPk(draft.id), to: vendorEmail, from: account.from_email };
  } catch (error) {
    const reason = error instanceof MailboxError || error instanceof VendorEmailError ? error.message : `Could not send: ${String(error.message || error).slice(0, 250)}`;
    await VendorEmailDraft.update({ status: 'FAILED', failure_reason: reason }, { where: { id: draft.id } });
    if (error instanceof MailboxError) await account.update({ last_error: reason }).catch(() => {});
    throw new VendorEmailError(reason, 502, 'SEND_FAILED');
  }
}

module.exports = { VendorEmailError, prepareDraft, approveAndSend, renderEmail, buildDetails, loadContext, APPROVED_PO_STATUSES };
