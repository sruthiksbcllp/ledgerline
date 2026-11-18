'use strict';

/**
 * Collections for Accounts Receivable: the reminder ladder, promises to pay and AI-drafted
 * reminders. Each reminder is stored (so the history shows what was sent and when) and emailed
 * to the customer when email is configured and the customer has an address; otherwise it is
 * recorded as NOT_SENT.
 *
 * Ladder (blueprint O2C step 6: a friendly reminder before the due date, then a dunning sequence
 * and escalation). An invoice gets one reminder per step, and one every 7 days once escalated:
 *   UPCOMING   due within 3 days        friendly heads-up
 *   FIRST      1-7 days overdue         polite reminder
 *   SECOND     8-15 days overdue        firm reminder
 *   FINAL      16-30 days overdue       final notice
 *   ESCALATED  more than 30 days        escalation; shown to the manager on the worklist
 * No reminder goes out while the customer has an open promise to pay that has not fallen due, nor
 * while the invoice is in dispute (a credit note request waiting for a decision, blueprint step 5).
 */
const { Op } = require('sequelize');
const { ArInvoice, ArCustomer, ArReminder, ArPromise, ArCreditNote, Client } = require('../models');
const notificationEmail = require('./notificationEmail.service');
const { outstandingOf } = require('./arCredit.service');

const LADDER = [
  { stage: 'UPCOMING', label: 'Due soon', from: -3, to: 0, tone: 'a friendly heads-up that the invoice falls due shortly' },
  { stage: 'FIRST', label: 'First reminder', from: 1, to: 7, tone: 'a polite reminder that the invoice is now overdue' },
  { stage: 'SECOND', label: 'Second reminder', from: 8, to: 15, tone: 'a firm reminder asking for a payment date' },
  { stage: 'FINAL', label: 'Final notice', from: 16, to: 30, tone: 'a final notice before the account is escalated and put on credit hold' },
  { stage: 'ESCALATED', label: 'Escalated', from: 31, to: Infinity, tone: 'an escalation: the account is seriously overdue and further supplies may be held' }
];
const ESCALATED_REPEAT_DAYS = 7;
const OPEN = ['UNPAID', 'PARTIALLY_PAID'];

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((new Date(to) - new Date(from)) / 86400000);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A date as the rest of the app shows it: 11 Oct 2026 (not 2026-10-11). */
const fmtDate = (d) => {
  if (!d) return '—';
  const s = d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return MONTHS[Number(m) - 1] ? `${day} ${MONTHS[Number(m) - 1]} ${y}` : String(d);
};

/** Invoices in dispute: a credit note request is waiting for a decision. Reminders pause for them. */
async function disputedInvoiceIds(clientId = null) {
  const rows = await ArCreditNote.findAll({ where: { ...(clientId ? { client_id: clientId } : {}), status: 'PENDING_APPROVAL' }, attributes: ['invoice_id'] });
  return new Set(rows.map((r) => r.invoice_id));
}

/** Days past the due date (negative before it); null when the invoice has no due date. */
const daysOverdueOf = (invoice) => (invoice.due_date ? daysBetween(invoice.due_date, today()) : null);

/** The ladder step an open invoice is on today, or null (not due within 3 days, or no due date). */
function stageOf(invoice) {
  const days = daysOverdueOf(invoice);
  if (days === null) return null;
  return LADDER.find((s) => days >= s.from && days <= s.to) || null;
}

const WORDING = {
  UPCOMING: (d) => `This is a friendly reminder that invoice ${d.number} dated ${d.date} for ${d.total} falls due on ${d.due}. The balance payable is ${d.outstanding}.\n\nIf payment is already scheduled, please ignore this note.`,
  FIRST: (d) => `This is a reminder that invoice ${d.number} dated ${d.date} for ${d.total} was due on ${d.due} (${d.overdue}). The outstanding balance is ${d.outstanding}.\n\nPlease arrange payment at the earliest, or let us know if it has already been made.`,
  // "Written to you before" / "earlier reminders" only when a reminder for this invoice was actually emailed.
  SECOND: (d) => `Invoice ${d.number} dated ${d.date} is now ${d.overdue}, and ${d.outstanding} remains unpaid.${d.emailedBefore ? ' We have written to you about this before.' : ''}\n\nPlease confirm the date on which payment will be made.`,
  FINAL: (d) => `Final notice: invoice ${d.number} dated ${d.date} is ${d.overdue}, with ${d.outstanding} unpaid.\n\nPlease pay within 7 days. If we do not hear from you, the account will be escalated and new orders may be put on hold.`,
  ESCALATED: (d) => `Invoice ${d.number} dated ${d.date} is ${d.overdue} and ${d.outstanding} is still unpaid${d.emailedBefore ? ' despite our earlier reminders' : ''}.\n\nThe account has been escalated and further supplies may be held until it is settled. Please contact us today to resolve this.`
};

async function facts(invoice) {
  const [company, emailedBefore] = await Promise.all([
    Client.findByPk(invoice.client_id, { attributes: ['client_name'] }),
    invoice.id ? ArReminder.count({ where: { invoice_id: invoice.id, delivery: 'EMAILED' } }) : 0
  ]);
  const days = daysOverdueOf(invoice);
  const overdueDays = days && days > 0 ? days : 0;
  return {
    companyName: company?.client_name || 'our company',
    customerName: invoice.customer?.customer_name || 'Customer',
    number: invoice.invoice_number, date: fmtDate(invoice.invoice_date), due: fmtDate(invoice.due_date),
    total: inr(invoice.total_amount), outstanding: inr(outstandingOf(invoice)), emailedBefore: emailedBefore > 0,
    overdueDays, overdue: overdueDays ? `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue` : 'not yet overdue'
  };
}

/** The standard reminder for the invoice's ladder step. `invoice` must include `customer`. */
async function templateReminder(invoice) {
  const d = await facts(invoice);
  const stage = stageOf(invoice)?.stage || (d.overdueDays ? 'FIRST' : 'UPCOMING');
  const lead = { UPCOMING: 'Payment due soon', FIRST: 'Payment reminder', SECOND: 'Second reminder', FINAL: 'Final notice', ESCALATED: 'Overdue account' }[stage];
  return {
    stage,
    subject: `${lead}: invoice ${d.number} (${d.outstanding} outstanding)`,
    message: `Dear ${d.customerName},\n\n${WORDING[stage](d)}\n\nRegards,\n${d.companyName}`,
    drafted_by_ai: false
  };
}

/**
 * A reminder written by AI for this customer: the ladder step sets how firm it is, and the
 * customer's history (earlier reminders, promises kept or broken, part payments) shapes the tone.
 * Falls back to the standard wording when AI is not configured or the call fails. Never sends.
 */
async function draftReminder(invoice) {
  const base = await templateReminder(invoice);
  if (!process.env.OPENAI_API_KEY) return { ...base, ai_note: 'AI drafting is not configured on the server, so this is the standard wording.' };
  const d = await facts(invoice);
  const [reminders, promises, paidCount] = await Promise.all([
    ArReminder.count({ where: { invoice_id: invoice.id } }),
    ArPromise.findAll({ where: { invoice_id: invoice.id }, order: [['id', 'DESC']], limit: 5 }),
    ArInvoice.count({ where: { client_id: invoice.client_id, customer_id: invoice.customer_id, status: 'PAID' } })
  ]);
  const step = LADDER.find((s) => s.stage === base.stage);
  const context = [
    `Our company: ${d.companyName}`, `Customer: ${d.customerName}`,
    `Invoice ${d.number} dated ${d.date}, total ${d.total}, due ${d.due}, ${d.overdue}, balance ${d.outstanding}`,
    Number(invoice.amount_received) > 0 ? `Part payment already received: ${inr(invoice.amount_received)}` : 'No payment received yet',
    `Reminders already sent for this invoice: ${reminders}`,
    `Invoices this customer has paid in full before: ${paidCount}`,
    promises.length ? `Promises to pay: ${promises.map((p) => `${inr(p.amount)} by ${fmtDate(p.promised_date)} (${p.status.toLowerCase()})`).join('; ')}` : 'No promises to pay recorded',
    `This message should be: ${step?.tone || 'a polite reminder'}`
  ].join('\n');
  try {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60000, maxRetries: 1 });
    const response = await client.responses.create({
      model: process.env.AR_REMINDER_MODEL || process.env.VENDOR_EXTRACTION_MODEL || 'gpt-5.5',
      max_output_tokens: 2000,
      instructions: 'You write payment reminder emails for the accounts receivable team of an Indian company. Write a short, courteous, plain-English email body (under 140 words) addressed to the customer and signed with our company name. Use only the facts given: never invent amounts, dates, bank details, penalties or legal threats. Acknowledge a part payment or a good payment record when there is one, and mention a broken promise to pay factually when there is one. Amounts are in Indian rupees. Return JSON.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: context }] }],
      text: { format: { type: 'json_schema', name: 'reminder', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['subject', 'message'],
        properties: { subject: { type: 'string' }, message: { type: 'string' } }
      } } }
    });
    const parsed = JSON.parse(response.output_text);
    if (!parsed?.message?.trim()) throw new Error('empty draft');
    return { stage: base.stage, subject: String(parsed.subject || base.subject).slice(0, 255), message: String(parsed.message), drafted_by_ai: true };
  } catch (e) {
    return { ...base, ai_note: 'AI drafting failed, so this is the standard wording.' };
  }
}

/**
 * Sends (or records) one reminder. `invoice` must include `customer`. Pass `subject` and
 * `message` to send a reviewed draft; otherwise the standard wording for the ladder step is used.
 */
async function sendReminder(invoice, { userId = null, subject = null, message = null, draftedByAi = false } = {}) {
  const base = await templateReminder(invoice);
  const finalSubject = String(subject || base.subject).slice(0, 255);
  const finalMessage = String(message || base.message);
  const to = invoice.customer?.email || null;
  let delivery = 'NOT_SENT';
  let deliveryNote = null;
  if (!to) {
    deliveryNote = 'Customer has no email address';
  } else if (!notificationEmail.isConfigured()) {
    deliveryNote = 'Email is not configured on the server';
  } else {
    const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:14px;line-height:1.6">${escapeHtml(finalMessage).replace(/\n/g, '<br>')}</div>`;
    const result = await notificationEmail.sendEmail({ to, subject: finalSubject, html });
    if (result?.success) delivery = 'EMAILED';
    else deliveryNote = result?.error || result?.reason || 'Email could not be sent';
  }

  const reminder = await ArReminder.create({
    client_id: invoice.client_id, invoice_id: invoice.id, to_email: to, subject: finalSubject, message: finalMessage,
    delivery, delivery_note: deliveryNote, stage: base.stage, drafted_by_ai: !!(draftedByAi && message), created_by: userId
  });
  await invoice.update({ last_reminder_at: new Date() });
  return reminder;
}

/**
 * Reminds every overdue, unpaid invoice that has not been reminded in `minDaysBetween` days
 * (the "Send overdue reminders" button).
 * @param {{ clientId?: number|null, userId?: number|null, minDaysBetween?: number }} opts
 */
async function remindOverdue({ clientId = null, userId = null, minDaysBetween = 3 } = {}) {
  const cutoff = new Date(Date.now() - minDaysBetween * 86400000);
  const invoices = await ArInvoice.findAll({
    where: {
      ...(clientId ? { client_id: clientId } : {}),
      status: OPEN,
      due_date: { [Op.lt]: today() },
      [Op.or]: [{ last_reminder_at: null }, { last_reminder_at: { [Op.lt]: cutoff } }]
    },
    include: [{ model: ArCustomer, as: 'customer' }],
    limit: 500
  });
  const disputed = await disputedInvoiceIds(clientId);
  const results = [];
  for (const invoice of invoices) {
    if (disputed.has(invoice.id)) continue;
    const reminder = await sendReminder(invoice, { userId });
    results.push({ invoice_id: invoice.id, invoice_number: invoice.invoice_number, delivery: reminder.delivery, note: reminder.delivery_note });
  }
  return results;
}

/** Marks promises kept (invoice settled) or broken (date passed, still unpaid). Returns the count changed. */
async function sweepPromises({ clientId = null } = {}) {
  const promises = await ArPromise.findAll({
    where: { ...(clientId ? { client_id: clientId } : {}), status: 'OPEN' },
    include: [{ model: ArInvoice, as: 'invoice' }],
    limit: 2000
  });
  let changed = 0;
  for (const p of promises) {
    const settled = !p.invoice || !OPEN.includes(p.invoice.status);
    if (settled) { await p.update({ status: p.invoice?.status === 'PAID' ? 'KEPT' : 'CANCELLED' }); changed += 1; }
    else if (p.promised_date < today()) { await p.update({ status: 'BROKEN' }); changed += 1; }
  }
  return changed;
}

/**
 * The daily run: update promises, then send each open invoice the reminder for its ladder step
 * if it has not had that step yet (escalated invoices repeat every 7 days).
 */
async function runLadder({ clientId = null } = {}) {
  await sweepPromises({ clientId });
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const invoices = await ArInvoice.findAll({
    where: { ...(clientId ? { client_id: clientId } : {}), status: OPEN, due_date: { [Op.lte]: soon } },
    include: [
      { model: ArCustomer, as: 'customer' },
      { model: ArReminder, as: 'reminders', attributes: ['id', 'stage', 'createdAt'] },
      { model: ArPromise, as: 'promises', attributes: ['id', 'status', 'promised_date'] }
    ],
    limit: 1000
  });
  const disputed = await disputedInvoiceIds(clientId);
  const results = [];
  for (const invoice of invoices) {
    const step = stageOf(invoice);
    if (!step) continue;
    if (disputed.has(invoice.id)) continue;
    if (invoice.promises.some((p) => p.status === 'OPEN' && p.promised_date >= today())) continue;
    // Never two reminders for one invoice within 3 days, whatever sent the last one.
    if (invoice.last_reminder_at && Date.now() - new Date(invoice.last_reminder_at).getTime() < 3 * 86400000) continue;
    const atStep = invoice.reminders.filter((r) => r.stage === step.stage);
    const last = atStep.reduce((d, r) => (new Date(r.createdAt) > d ? new Date(r.createdAt) : d), new Date(0));
    const due = !atStep.length || (step.stage === 'ESCALATED' && Date.now() - last.getTime() >= ESCALATED_REPEAT_DAYS * 86400000);
    if (!due) continue;
    const reminder = await sendReminder(invoice, {});
    results.push({ invoice_id: invoice.id, invoice_number: invoice.invoice_number, stage: step.stage, delivery: reminder.delivery, note: reminder.delivery_note });
  }
  return results;
}

module.exports = { LADDER, stageOf, daysOverdueOf, disputedInvoiceIds, templateReminder, draftReminder, sendReminder, remindOverdue, sweepPromises, runLadder, fmtDate };
