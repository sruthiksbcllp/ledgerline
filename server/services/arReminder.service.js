'use strict';

/**
 * Overdue payment reminders for Accounts Receivable. Each reminder is stored (so the
 * history shows what was sent and when) and emailed to the customer when email is
 * configured and the customer has an address; otherwise it is recorded as NOT_SENT.
 */
const { Op } = require('sequelize');
const { ArInvoice, ArCustomer, ArReminder, Client } = require('../models');
const notificationEmail = require('./notificationEmail.service');

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((new Date(to) - new Date(from)) / 86400000);

/** Sends (or records) one reminder for an overdue invoice. `invoice` must include `customer`. */
async function sendReminder(invoice, { userId = null } = {}) {
  const outstanding = Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_received || 0));
  const company = await Client.findByPk(invoice.client_id, { attributes: ['client_name'] });
  const companyName = company?.client_name || 'our company';
  const daysOverdue = invoice.due_date ? Math.max(0, daysBetween(invoice.due_date, today())) : 0;
  const subject = `Payment reminder: invoice ${invoice.invoice_number} (${inr(outstanding)} outstanding)`;
  const message = `Dear ${invoice.customer?.customer_name || 'Customer'},\n\n`
    + `This is a reminder that invoice ${invoice.invoice_number} dated ${invoice.invoice_date} `
    + `for ${inr(invoice.total_amount)} was due on ${invoice.due_date || '—'}`
    + `${daysOverdue ? ` (${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue)` : ''}. `
    + `The outstanding balance is ${inr(outstanding)}.\n\n`
    + 'Please arrange payment at the earliest, or let us know if it has already been made.\n\n'
    + `Regards,\n${companyName}`;

  const to = invoice.customer?.email || null;
  let delivery = 'NOT_SENT';
  let deliveryNote = null;
  if (!to) {
    deliveryNote = 'Customer has no email address';
  } else if (!notificationEmail.isConfigured()) {
    deliveryNote = 'Email is not configured on the server';
  } else {
    const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:14px;line-height:1.6">${escapeHtml(message).replace(/\n/g, '<br>')}</div>`;
    const result = await notificationEmail.sendEmail({ to, subject, html });
    if (result?.success) delivery = 'EMAILED';
    else deliveryNote = result?.error || result?.reason || 'Email could not be sent';
  }

  const reminder = await ArReminder.create({
    client_id: invoice.client_id, invoice_id: invoice.id, to_email: to, subject, message,
    delivery, delivery_note: deliveryNote, created_by: userId
  });
  await invoice.update({ last_reminder_at: new Date() });
  return reminder;
}

/**
 * Reminds every overdue, unpaid invoice that has not been reminded in `minDaysBetween` days.
 * @param {{ clientId?: number|null, userId?: number|null, minDaysBetween?: number }} opts clientId null = all companies (scheduler)
 */
async function remindOverdue({ clientId = null, userId = null, minDaysBetween = 3 } = {}) {
  const cutoff = new Date(Date.now() - minDaysBetween * 86400000);
  const invoices = await ArInvoice.findAll({
    where: {
      ...(clientId ? { client_id: clientId } : {}),
      status: ['UNPAID', 'PARTIALLY_PAID'],
      due_date: { [Op.lt]: today() },
      [Op.or]: [{ last_reminder_at: null }, { last_reminder_at: { [Op.lt]: cutoff } }]
    },
    include: [{ model: ArCustomer, as: 'customer' }],
    limit: 500
  });
  const results = [];
  for (const invoice of invoices) {
    const reminder = await sendReminder(invoice, { userId });
    results.push({ invoice_id: invoice.id, invoice_number: invoice.invoice_number, delivery: reminder.delivery, note: reminder.delivery_note });
  }
  return results;
}

module.exports = { sendReminder, remindOverdue };
