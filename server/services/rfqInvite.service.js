'use strict';

/**
 * The RFQ invitation email: built once for the preview the admin reviews and again,
 * identically, when it is sent. The admin edits only the subject and message text;
 * the header, greeting and items table come from the RFQ.
 */
const { PurchaseRequisition, Entity, Company, Client } = require('../models');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_SUBJECT = 255;
const MAX_MESSAGE = 20000;

/** Buyer branding: PR entity -> company master -> PO print company name -> company account. */
async function buyerBranding(rfq) {
  let name = null;
  let gst = '';
  try {
    if (rfq.pr_id) {
      const pr = await PurchaseRequisition.findByPk(rfq.pr_id);
      if (pr && pr.entity_id && Entity) {
        const ent = await Entity.findByPk(pr.entity_id);
        if (ent) { name = ent.entity_name || null; gst = ent.gst_number || ''; }
      }
    }
    if (!name && Company) {
      const comp = await Company.findOne({ where: { client_id: rfq.client_id } });
      if (comp) { name = comp.company_name || null; gst = gst || comp.gst_registration_number || ''; }
    }
    if (!name) {
      const { resolveConfig } = require('./poPrint.service');
      const cfg = await resolveConfig(rfq.client_id, null).catch(() => ({}));
      const client = cfg.company_name ? null : await Client.findByPk(rfq.client_id, { attributes: ['client_name'] });
      name = cfg.company_name || (client && client.client_name) || null;
      gst = gst || cfg.gst_number || '';
    }
  } catch (_) { /* branding is optional */ }
  return { buyerName: name || 'Procurement', buyerGst: gst };
}

const dueText = (rfq) => (rfq.due_date ? new Date(rfq.due_date).toDateString() : 'the earliest');

const defaultSubject = (rfq, buyerName) => `Request for Quotation ${rfq.rfq_number} - ${buyerName}`;

const defaultMessage = (rfq, buyerName, senderName) => [
  `${buyerName} invites your most competitive quotation for the items below. Kindly submit your quotation by ${dueText(rfq)}.`,
  'Please include in your quotation:\n1. Unit price and total, GST shown separately (HSN/SAC + GST %)\n2. Delivery timeline and terms\n3. Payment terms\n4. Warranty / AMC (if applicable)\n5. Quotation validity (days), and your GSTIN & PAN',
  `How to respond: reply to this email with your quotation as a PDF, keeping the reference ${rfq.rfq_number} in the subject line.`,
  `Regards,\n${senderName || 'Procurement'}\n${buyerName}`
].join('\n\n');

/** Vendor replies are matched by RFQ number, so it must stay in the subject. */
const subjectWithRfq = (subject, rfqNumber) => {
  const s = String(subject || '').trim().slice(0, MAX_SUBJECT);
  return s.toLowerCase().includes(String(rfqNumber).toLowerCase()) ? s : `${s ? `${s} - ` : ''}${rfqNumber}`.slice(0, MAX_SUBJECT);
};

const itemsTable = (items) => {
  const td = 'border:1px solid #ddd;padding:6px;';
  const th = 'border:1px solid #ddd;padding:6px;background:#1F3A5F;color:#fff;';
  const rows = (items || []).map((it, i) => `<tr><td style="${td}">${i + 1}</td><td style="${td}">${esc(it.item_name)}${it.description ? ` - ${esc(it.description)}` : ''}</td><td style="${td}text-align:right;">${Number(it.quantity || 0)}</td><td style="${td}">${esc(it.unit || 'Nos')}</td></tr>`).join('');
  return rows
    ? `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0;"><thead><tr><th style="${th}">#</th><th style="${th}text-align:left;">Item / Description</th><th style="${th}">Qty</th><th style="${th}">Unit</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p>(Item details will be shared separately.)</p>';
};

/** Full HTML for one vendor. The items table goes after the first paragraph of the message. */
function renderInvite({ rfq, buyerName, buyerGst, greetingName, message }) {
  const paragraphs = String(message || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.6;">${esc(p).replace(/\n/g, '<br/>')}</p>`);
  const body = paragraphs.length ? [paragraphs[0], itemsTable(rfq.items), ...paragraphs.slice(1)] : [itemsTable(rfq.items)];
  return `<div style="font-family:Arial,sans-serif;color:#222;max-width:680px;">`
    + `<h2 style="color:#1F3A5F;margin:0 0 4px;">${esc(buyerName)}</h2>`
    + (buyerGst ? `<div style="color:#666;font-size:12px;">GSTIN: ${esc(buyerGst)}</div>` : '')
    + `<h3 style="color:#1F3A5F;">Request for Quotation - ${esc(rfq.rfq_number)}</h3>`
    + `<p>Dear ${esc(greetingName || 'Sir/Madam')},</p>`
    + body.join('')
    + '<p style="color:#999;font-size:11px;">Sent via LedgerLine procurement.</p>'
    + '</div>';
}

/** Which vendors a send/resend goes to, and which are skipped for lack of an email. */
function recipientsFor(rfq, { resend = false, onlyIds = null } = {}) {
  const chosen = (rfq.vendors || []).filter((rv) =>
    (resend ? rv.invite_status === 'SENT' : rv.invite_status === 'PENDING')
    && (!onlyIds || onlyIds.includes(Number(rv.vendor_id))));
  const targets = [];
  const skipped = [];
  for (const rv of chosen) {
    const vendorName = (rv.vendor && rv.vendor.vendor_name) || `Vendor #${rv.vendor_id}`;
    const to = String((rv.vendor && rv.vendor.email) || '').trim();
    if (!EMAIL_RE.test(to)) skipped.push({ vendor_id: rv.vendor_id, vendor: vendorName, reason: 'No valid registered email' });
    else targets.push({ rv, vendor_id: rv.vendor_id, vendor: vendorName, to, greeting: (rv.vendor && rv.vendor.contact_person) || vendorName });
  }
  return { chosen, targets, skipped };
}

/** Admin's edits, validated; falls back to the defaults when not provided. */
function resolveContent({ rfq, buyerName, senderName, subject, message }) {
  const finalSubject = subjectWithRfq(subject && String(subject).trim() ? subject : defaultSubject(rfq, buyerName), rfq.rfq_number);
  const text = message && String(message).trim() ? String(message).trim().slice(0, MAX_MESSAGE) : defaultMessage(rfq, buyerName, senderName);
  return { subject: finalSubject, message: text };
}

module.exports = { buyerBranding, defaultSubject, defaultMessage, renderInvite, recipientsFor, resolveContent, subjectWithRfq };
