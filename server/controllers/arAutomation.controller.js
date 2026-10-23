'use strict';

/**
 * Accounts Receivable: extract customer invoices / POs / payment advices with AI, review,
 * post invoices, record partial and full receipts, track outstanding balances and send
 * overdue reminders. Every query is scoped to the caller's company.
 */
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const { sequelize, ArCustomer, ArInvoice, ArReceipt, ArReminder } = require('../models');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { extractInvoice, checkInvoiceNumbers, normalizeDate, toNumber } = require('../services/invoiceExtraction.service');
const { ExtractionError, GSTIN_RE } = require('../services/vendorExtraction.service');
const { recordAudit, documentHistory } = require('../utils/financeAudit');
const { sendReminder, remindOverdue } = require('../services/arReminder.service');

const STATUS_LABEL = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid', CANCELLED: 'Cancelled' };
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const decorate = (row) => {
  const j = row.toJSON ? row.toJSON() : row;
  const outstanding = round2(Number(j.total_amount) - Number(j.amount_received || 0));
  const open = ['UNPAID', 'PARTIALLY_PAID'].includes(j.status);
  const daysOverdue = open && j.due_date && j.due_date < today()
    ? Math.floor((new Date(today()) - new Date(j.due_date)) / 86400000) : 0;
  return { ...j, outstanding, overdue: daysOverdue > 0, days_overdue: daysOverdue, status_label: STATUS_LABEL[j.status] || j.status };
};

async function matchCustomer(tenantWhere, { gst_number, name }) {
  if (gst_number) {
    const byGstin = await ArCustomer.findOne({ where: { ...tenantWhere, gst_number: String(gst_number).toUpperCase() } });
    if (byGstin) return { customer: byGstin, matched_by: 'GSTIN' };
  }
  const clean = String(name || '').trim().toLowerCase();
  if (!clean) return { customer: null, matched_by: null };
  const byName = await ArCustomer.findOne({ where: { ...tenantWhere, [Op.and]: [sqlWhere(fn('LOWER', col('customer_name')), clean)] } });
  return byName ? { customer: byName, matched_by: 'NAME' } : { customer: null, matched_by: null };
}

const findDuplicate = (tenantWhere, invoiceNumber, excludeId = null) => (invoiceNumber
  ? ArInvoice.findOne({
    where: {
      ...tenantWhere,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
      [Op.and]: [sqlWhere(fn('LOWER', col('invoice_number')), String(invoiceNumber).trim().toLowerCase())]
    }
  })
  : null);

/** Reviewed payload -> normalised values + checks (arithmetic, customer, duplicate, receipt). */
async function reviewInvoice(req, body) {
  const tenantWhere = buildAdminWhere(req);
  const c = body.customer || {};
  const data = {
    customer_id: body.customer_id ? Number(body.customer_id) : null,
    customer: {
      customer_name: String(c.customer_name || c.name || '').trim(),
      gst_number: c.gst_number ? String(c.gst_number).replace(/[\s-]/g, '').toUpperCase() : null,
      email: c.email ? String(c.email).trim() : null,
      phone: c.phone ? String(c.phone).trim() : null,
      address: c.address ? String(c.address).trim() : null
    },
    invoice_number: String(body.invoice_number || '').trim(),
    invoice_date: normalizeDate(body.invoice_date),
    due_date: normalizeDate(body.due_date),
    customer_po_number: body.customer_po_number ? String(body.customer_po_number).trim() : null,
    subtotal: toNumber(body.subtotal),
    tax_amount: toNumber(body.tax_amount) ?? 0,
    tax_rate_percent: toNumber(body.tax_rate_percent),
    total_amount: toNumber(body.total_amount),
    amount_received: toNumber(body.amount_received) ?? 0,
    notes: body.notes ? String(body.notes) : null
  };
  const existing = data.customer_id ? await ArCustomer.findOne({ where: { ...tenantWhere, id: data.customer_id } }) : null;
  const checks = checkInvoiceNumbers({ ...data, party_name: existing?.customer_name || data.customer.customer_name, line_items: [] });
  const add = (field, severity, message) => checks.push({ field, severity, message });
  if (data.customer_id && !existing) add('customer_id', 'error', 'Customer not found in your company');
  if (data.customer.gst_number && !GSTIN_RE.test(data.customer.gst_number)) add('customer.gst_number', 'warning', 'Customer GSTIN does not look valid');
  if (data.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.customer.email)) add('customer.email', 'warning', 'Customer email does not look valid');
  if (data.amount_received < 0) add('amount_received', 'error', 'Amount received cannot be negative');
  if (data.total_amount && data.amount_received > data.total_amount) add('amount_received', 'error', 'Amount received is more than the invoice total');
  const duplicate = await findDuplicate(tenantWhere, data.invoice_number);
  if (duplicate) add('invoice_number', 'error', `Duplicate: invoice ${duplicate.invoice_number} is already recorded (#${duplicate.id})`);
  return { data, existing, checks, duplicate };
}

exports.extract = async (req, res) => {
  try {
    const result = await extractInvoice(req.file, 'AR');
    const tenantWhere = buildAdminWhere(req);
    const match = await matchCustomer(tenantWhere, { gst_number: result.party.gst_number.value, name: result.party.name.value });
    const duplicate = await findDuplicate(tenantWhere, result.header.invoice_number.value);
    // A payment advice usually refers to an invoice we already raised: offer to record a receipt on it.
    const openInvoice = result.document_type === 'PAYMENT_RECEIPT' && duplicate && ['UNPAID', 'PARTIALLY_PAID'].includes(duplicate.status)
      ? decorate(duplicate) : null;
    return res.json({
      success: true,
      data: {
        ...result,
        matches: {
          customer: match.customer ? { id: match.customer.id, customer_name: match.customer.customer_name, matched_by: match.matched_by } : null,
          duplicate: duplicate && !openInvoice ? decorate(duplicate) : null,
          receipt_for_invoice: openInvoice
        }
      }
    });
  } catch (error) {
    if (error instanceof ExtractionError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return fail(res, 500, 'Document extraction failed. Enter the details manually.');
  }
};

exports.validate = async (req, res) => {
  const { checks } = await reviewInvoice(req, req.body || {});
  return res.json({ success: true, data: { checks } });
};

exports.create = async (req, res) => {
  const { data, existing, checks } = await reviewInvoice(req, req.body || {});
  const errors = checks.filter((x) => x.severity === 'error');
  if (errors.length) return fail(res, errors.some((e) => e.message.startsWith('Duplicate')) ? 409 : 422, errors[0].message, { checks });
  const clientId = getClientId(req);
  if (!clientId) return fail(res, 400, 'Select a company before recording customer invoices');
  try {
    const { invoice, customer, createdCustomer } = await sequelize.transaction(async (transaction) => {
      let cust = existing;
      let created = false;
      if (!cust) {
        cust = await ArCustomer.findOne({
          where: data.customer.gst_number
            ? { client_id: clientId, gst_number: data.customer.gst_number }
            : { client_id: clientId, [Op.and]: [sqlWhere(fn('LOWER', col('customer_name')), data.customer.customer_name.toLowerCase())] },
          transaction
        });
        if (!cust) {
          cust = await ArCustomer.create({ client_id: clientId, ...data.customer, created_by: req.user.id }, { transaction });
          created = true;
        }
      }
      const subtotal = data.subtotal ?? round2(data.total_amount - data.tax_amount);
      const inv = await ArInvoice.create({
        client_id: clientId, customer_id: cust.id, invoice_number: data.invoice_number, invoice_date: data.invoice_date,
        due_date: data.due_date, customer_po_number: data.customer_po_number, subtotal, tax_amount: data.tax_amount,
        total_amount: round2(subtotal + data.tax_amount), amount_received: 0, status: 'UNPAID', notes: data.notes,
        source: req.body.source === 'AI_EXTRACTED' ? 'AI_EXTRACTED' : 'MANUAL',
        source_file_name: req.body.source_file_name ? String(req.body.source_file_name).slice(0, 255) : null,
        created_by: req.user.id
      }, { transaction });
      if (data.amount_received > 0) {
        await ArReceipt.create({
          client_id: clientId, invoice_id: inv.id, amount: data.amount_received, received_date: data.invoice_date || today(),
          payment_mode: req.body.payment_mode || null, reference: req.body.payment_reference || null,
          notes: 'Recorded with the invoice', created_by: req.user.id
        }, { transaction });
        const received = round2(data.amount_received);
        await inv.update({ amount_received: received, status: received >= Number(inv.total_amount) ? 'PAID' : 'PARTIALLY_PAID' }, { transaction });
      }
      return { invoice: inv, customer: cust, createdCustomer: created };
    });
    if (createdCustomer) {
      await recordAudit(req, { module: 'AR', entityType: 'AR_CUSTOMER', entityId: customer.id, action: 'AR_CUSTOMER_CREATED', after: customer });
    }
    await recordAudit(req, {
      module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_INVOICE_POSTED', after: invoice,
      note: `${invoice.source === 'AI_EXTRACTED' ? 'Extracted by AI, reviewed and posted' : 'Entered manually'}${data.amount_received > 0 ? `; ${data.amount_received} received` : ''}`
    });
    return res.status(201).json({ success: true, message: 'Customer invoice posted', data: decorate(invoice), checks });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return fail(res, 409, 'This invoice number or customer GSTIN is already recorded.');
    return fail(res, 500, error.message || 'Could not post the invoice');
  }
};

exports.list = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.status) where.status = String(req.query.status).split(',');
  const rows = await ArInvoice.findAll({
    where,
    include: [{ model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name', 'gst_number', 'email'] }],
    order: [['invoice_date', 'DESC'], ['id', 'DESC']],
    limit: 1000
  });
  const data = rows.map(decorate);
  const open = data.filter((r) => ['UNPAID', 'PARTIALLY_PAID'].includes(r.status));
  return res.json({
    success: true,
    data,
    summary: {
      outstanding: round2(open.reduce((s, r) => s + r.outstanding, 0)),
      overdue: round2(open.filter((r) => r.overdue).reduce((s, r) => s + r.outstanding, 0)),
      overdue_count: open.filter((r) => r.overdue).length,
      open_count: open.length
    }
  });
};

exports.customers = async (req, res) => {
  const rows = await ArCustomer.findAll({ where: buildAdminWhere(req), order: [['customer_name', 'ASC']], limit: 2000 });
  return res.json({ success: true, data: rows });
};

exports.detail = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const invoice = await ArInvoice.findOne({
    where: { ...tenantWhere, id: req.params.id },
    include: [
      { model: ArCustomer, as: 'customer' },
      { model: ArReceipt, as: 'receipts' },
      { model: ArReminder, as: 'reminders' }
    ],
    order: [[{ model: ArReceipt, as: 'receipts' }, 'id', 'ASC'], [{ model: ArReminder, as: 'reminders' }, 'id', 'DESC']]
  });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  const history = await documentHistory(tenantWhere, 'AR_INVOICE', invoice.id);
  return res.json({ success: true, data: { ...decorate(invoice), history } });
};

exports.recordReceipt = async (req, res) => {
  const amount = round2(toNumber(req.body?.amount));
  if (!(amount > 0)) return fail(res, 400, 'Enter an amount greater than zero');
  const receivedDate = normalizeDate(req.body?.received_date) || today();
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!invoice) return { status: 404, message: 'Invoice not found' };
      if (!['UNPAID', 'PARTIALLY_PAID'].includes(invoice.status)) return { status: 409, message: `This invoice is ${STATUS_LABEL[invoice.status]}; no payment is due` };
      const outstanding = round2(Number(invoice.total_amount) - Number(invoice.amount_received || 0));
      if (amount > outstanding) return { status: 422, message: `Amount exceeds the outstanding balance of ${outstanding}` };
      const before = invoice.toJSON();
      await ArReceipt.create({
        client_id: invoice.client_id, invoice_id: invoice.id, amount, received_date: receivedDate,
        payment_mode: req.body?.payment_mode || null, reference: req.body?.reference || null, notes: req.body?.notes || null, created_by: req.user.id
      }, { transaction });
      const received = round2(Number(invoice.amount_received || 0) + amount);
      await invoice.update({ amount_received: received, status: received >= Number(invoice.total_amount) ? 'PAID' : 'PARTIALLY_PAID' }, { transaction });
      return { invoice, before };
    });
    if (result.status) return fail(res, result.status, result.message);
    await recordAudit(req, {
      module: 'AR', entityType: 'AR_INVOICE', entityId: result.invoice.id,
      action: result.invoice.status === 'PAID' ? 'AR_INVOICE_PAID' : 'AR_RECEIPT_RECORDED', before: result.before, after: result.invoice,
      note: `Received ${amount}${req.body?.reference ? ` (ref ${req.body.reference})` : ''}`
    });
    return res.json({ success: true, message: result.invoice.status === 'PAID' ? 'Invoice fully paid' : 'Partial payment recorded', data: decorate(result.invoice) });
  } catch (error) {
    return fail(res, 500, error.message || 'Could not record the payment');
  }
};

exports.cancel = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return fail(res, 400, 'Give a reason for cancelling the invoice');
  const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (Number(invoice.amount_received) > 0 || invoice.status !== 'UNPAID') return fail(res, 409, 'Only unpaid invoices with no receipts can be cancelled');
  const before = invoice.toJSON();
  await invoice.update({ status: 'CANCELLED', notes: [invoice.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_INVOICE_CANCELLED', before, after: invoice, note: reason });
  return res.json({ success: true, message: 'Invoice cancelled', data: decorate(invoice) });
};

exports.remind = async (req, res) => {
  const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: [{ model: ArCustomer, as: 'customer' }] });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (!['UNPAID', 'PARTIALLY_PAID'].includes(invoice.status)) return fail(res, 409, 'This invoice has nothing outstanding');
  const reminder = await sendReminder(invoice, { userId: req.user.id });
  await recordAudit(req, {
    module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_REMINDER_SENT', after: invoice,
    note: reminder.delivery === 'EMAILED' ? `Reminder emailed to ${reminder.to_email}` : `Reminder recorded, not emailed: ${reminder.delivery_note}`
  });
  return res.json({
    success: true,
    message: reminder.delivery === 'EMAILED' ? `Reminder emailed to ${reminder.to_email}` : `Reminder recorded (not emailed: ${reminder.delivery_note})`,
    data: reminder
  });
};

exports.remindAllOverdue = async (req, res) => {
  // Company users remind their own company; provider admins remind the company they belong to.
  const clientId = buildAdminWhere(req).client_id || req.user?.client_id || null;
  if (!clientId) return fail(res, 400, 'Choose a company to send reminders for');
  const results = await remindOverdue({ clientId, userId: req.user.id, minDaysBetween: 0 });
  for (const r of results) {
    await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: r.invoice_id, action: 'AR_REMINDER_SENT', note: r.delivery === 'EMAILED' ? 'Overdue reminder emailed' : `Overdue reminder recorded, not emailed: ${r.note}` });
  }
  const emailed = results.filter((r) => r.delivery === 'EMAILED').length;
  return res.json({ success: true, message: `${results.length} reminder${results.length === 1 ? '' : 's'} generated, ${emailed} emailed`, data: results });
};
