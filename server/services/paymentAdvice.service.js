'use strict';

/**
 * Payment advice (remittance advice) to the vendor: what was paid against one invoice — each
 * payment with its date, mode and UTR, and the TDS, advance, returns and cash discount that make
 * up the difference from the invoice total.
 *
 * Nothing is sent automatically. The user reviews the email and clicks Send; it goes from their
 * own connected mailbox, copied to them, to the vendor's email in Vendor Master only.
 */
const { Invoice, ApPayment, Vendor, PurchaseOrder, UserMailAccount, Client } = require('../models');
const { sendFromMailbox, MailboxError } = require('./userMailbox.service');
const { tdsOf, netPayableOf, balanceOf } = require('./apJournal.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PAID_STATUSES = ['PAID', 'PARTIAL'];

class PaymentAdviceError extends Error {
  constructor(message, status = 400, code = 'PAYMENT_ADVICE_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const num = (v) => Number(v || 0);
const round2 = (n) => Math.round(num(n) * 100) / 100;
const inr = (n) => `₹${num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The figures in the advice, always read from the records. */
async function loadAdvice(invoiceId, tenantWhere) {
  const invoice = await Invoice.findOne({ where: { ...tenantWhere, id: invoiceId } });
  if (!invoice) throw new PaymentAdviceError('Invoice not found', 404, 'NOT_FOUND');
  if (!PAID_STATUSES.includes(invoice.status)) {
    throw new PaymentAdviceError('A payment advice can be sent once a payment is recorded on the invoice', 409, 'NOT_PAID');
  }
  const [vendor, po, payments, company] = await Promise.all([
    Vendor.findByPk(invoice.vendor_id, { attributes: ['id', 'vendor_name', 'email', 'contact_person'] }),
    invoice.po_id ? PurchaseOrder.findByPk(invoice.po_id, { attributes: ['id', 'po_number'] }) : null,
    ApPayment.findAll({ where: { invoice_id: invoice.id }, order: [['payment_date', 'ASC'], ['id', 'ASC']] }),
    Client.findByPk(invoice.client_id, { attributes: ['id', 'client_name'] }).catch(() => null)
  ]);
  // Invoices marked paid in one step have no payment rows: show that one payment.
  const rows = payments.length
    ? payments.map((p) => ({ date: p.payment_date, amount: round2(p.amount), discount: round2(p.discount_amount), mode: p.payment_mode, reference: p.reference }))
    : [{ date: invoice.payment_date, amount: round2(invoice.paid_amount), discount: round2(invoice.discount_received), mode: null, reference: invoice.external_payment_ref }];
  const tds = tdsOf(invoice);
  const details = {
    company: company?.client_name || null,
    vendor_name: vendor?.vendor_name || '',
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    po_number: po?.po_number || null,
    invoice_total: round2(invoice.total_amount),
    tds,
    tds_section: tds ? invoice.tds_section_code : null,
    advance: round2(invoice.advance_adjusted),
    returns: round2(invoice.returns_credit),
    discount: round2(invoice.discount_received),
    net_payable: netPayableOf(invoice),
    paid: round2(invoice.paid_amount),
    balance: Math.max(0, balanceOf(invoice)),
    payments: rows
  };
  return { invoice, vendor, details };
}

function defaultContent(details) {
  const fully = details.balance <= 0.009;
  return {
    subject: `Payment advice: invoice ${details.invoice_number}${details.company ? ` – ${details.company}` : ''}`,
    message: `Dear ${details.vendor_name || 'Sir/Madam'},\n\n`
      + `We have ${fully ? 'paid' : 'made a part payment on'} your invoice ${details.invoice_number}. The details are below.\n\n`
      + `${details.tds ? 'The TDS deducted will appear in your Form 26AS and the TDS certificate will follow.\n\n' : ''}`
      + `Regards,\n${details.company || 'Accounts Payable'}`
  };
}

function renderAdvice({ subject, message, details }) {
  const paragraphs = String(message || '').split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const kv = (label, value) => (value ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">${esc(label)}</td><td style="padding:4px 0">${esc(value)}</td></tr>` : '');
  const money = (label, value, bold = false) => `<tr><td style="padding:4px 8px;color:#374151">${esc(label)}</td><td style="padding:4px 8px;text-align:right;${bold ? 'font-weight:700' : ''}">${value}</td></tr>`;
  const less = (label, value) => (value ? money(label, `– ${inr(value)}`) : '');
  const payRows = details.payments.map((p) => `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(dateText(p.date))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(p.mode || '—')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(p.reference || '—')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${inr(p.amount)}</td></tr>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:680px">
  ${paragraphs}
  <h3 style="font-size:15px;margin:20px 0 8px">Payment details</h3>
  <table style="border-collapse:collapse;font-size:13px">${kv('Invoice', details.invoice_number)}${kv('Invoice date', dateText(details.invoice_date))}${kv('Purchase order', details.po_number)}</table>
  <table style="border-collapse:collapse;font-size:13px;margin-top:12px;min-width:360px">
    ${money('Invoice total', inr(details.invoice_total))}
    ${less(`TDS deducted${details.tds_section ? ` u/s ${details.tds_section}` : ''}`, details.tds)}
    ${less('Advance already paid', details.advance)}
    ${less('Goods returned', details.returns)}
    ${less('Cash discount', details.discount)}
    ${money('Paid to you', inr(details.paid), true)}
    ${details.balance > 0.009 ? money('Balance still due', inr(details.balance)) : ''}
  </table>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px">
    <thead><tr style="background:#f3f4f6">
      <th style="padding:6px 8px;text-align:left">Date</th><th style="padding:6px 8px;text-align:left">Mode</th>
      <th style="padding:6px 8px;text-align:left">UTR / reference</th><th style="padding:6px 8px;text-align:right">Amount</th></tr></thead>
    <tbody>${payRows}</tbody>
  </table>
</div>`;
  const text = `${message}\n\nInvoice ${details.invoice_number}\nInvoice total: ${inr(details.invoice_total)}`
    + `${details.tds ? `\nTDS deducted: ${inr(details.tds)}` : ''}${details.advance ? `\nAdvance already paid: ${inr(details.advance)}` : ''}`
    + `${details.returns ? `\nGoods returned: ${inr(details.returns)}` : ''}${details.discount ? `\nCash discount: ${inr(details.discount)}` : ''}`
    + `\nPaid to you: ${inr(details.paid)}${details.balance > 0.009 ? `\nBalance still due: ${inr(details.balance)}` : ''}\n\n`
    + details.payments.map((p) => `${dateText(p.date)}  ${p.mode || ''}  ${p.reference || ''}  ${inr(p.amount)}`).join('\n');
  return { subject, html, text };
}

/** What the review screen shows: recipient, default subject and message, the details and a preview. */
async function preview({ invoiceId, tenantWhere, userId }) {
  const { invoice, vendor, details } = await loadAdvice(invoiceId, tenantWhere);
  const content = defaultContent(details);
  const account = await UserMailAccount.findOne({ where: { user_id: userId }, attributes: ['from_email'] });
  const to = String(vendor?.email || '').trim();
  return {
    to: EMAIL_RE.test(to) ? to : null,
    from: account?.from_email || null,
    ...content,
    details,
    html: renderAdvice({ ...content, details }).html,
    sent_at: invoice.payment_advice_sent_at,
    sent_to: invoice.payment_advice_sent_to
  };
}

async function send({ invoiceId, tenantWhere, userId, subject, message }) {
  const { invoice, vendor, details } = await loadAdvice(invoiceId, tenantWhere);
  const to = String(vendor?.email || '').trim();
  if (!EMAIL_RE.test(to)) {
    throw new PaymentAdviceError(`Vendor ${vendor?.vendor_name || ''} has no valid email. Add it in Vendor Master first.`, 422, 'NO_VENDOR_EMAIL');
  }
  const account = await UserMailAccount.findOne({ where: { user_id: userId } });
  if (!account) throw new PaymentAdviceError('Connect your email account before sending', 412, 'NO_MAILBOX');
  const content = defaultContent(details);
  const email = renderAdvice({
    subject: String(subject || '').trim().slice(0, 255) || content.subject,
    message: String(message || '').trim().slice(0, 5000) || content.message,
    details
  });
  let result;
  try {
    result = await sendFromMailbox(account, { to, cc: account.from_email, ...email });
  } catch (error) {
    const reason = error instanceof MailboxError ? error.message : `Could not send: ${String(error.message || error).slice(0, 250)}`;
    if (error instanceof MailboxError) await account.update({ last_error: reason }).catch(() => {});
    throw new PaymentAdviceError(reason, 502, 'SEND_FAILED');
  }
  await account.update({ last_error: null }).catch(() => {});
  await invoice.update({ payment_advice_sent_at: new Date(), payment_advice_sent_to: to });
  return { invoice, to, from: account.from_email, message_id: result.messageId };
}

module.exports = { PaymentAdviceError, preview, send, renderAdvice };
