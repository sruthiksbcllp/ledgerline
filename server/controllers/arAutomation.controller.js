'use strict';

/**
 * Accounts Receivable: extract customer invoices / POs / payment advices with AI, review,
 * post invoices, record partial and full receipts, track outstanding balances and send
 * overdue reminders. Every query is scoped to the caller's company.
 */
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const {
  sequelize, ArCustomer, ArInvoice, ArReceipt, ArReminder, ArPromise, ArSalesOrder, ArSalesOrderItem, ArDelivery, ArDeliveryItem,
  ArCreditNote, ArWriteOff, JournalEntry, JournalLine
} = require('../models');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { extractInvoice, checkInvoiceNumbers, normalizeDate, toNumber } = require('../services/invoiceExtraction.service');
const { ExtractionError, GSTIN_RE } = require('../services/vendorExtraction.service');
const { recordAudit, documentHistory } = require('../utils/financeAudit');
const { sendReminder, remindOverdue, stageOf, disputedInvoiceIds } = require('../services/arReminder.service');
const credit = require('../services/arCredit.service');
const arJournal = require('../services/arJournal.service');
const arPeriod = require('../services/arPeriod.service');

const { outstandingOf, gstSplit, settledStatus } = credit;
const STATUS_LABEL = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid', CANCELLED: 'Cancelled', WRITTEN_OFF: 'Written off' };
/** Why an invoice with no sales order / delivery was raised (blueprint: invoice against a confirmed delivery). */
const DIRECT_REASONS = {
  SERVICE: 'Service billing with no delivery',
  OPENING_BALANCE: 'Opening balance from the previous system',
  OUTSIDE_SYSTEM: 'Invoice already issued outside LedgerLine',
  OTHER: 'Other'
};
const IRN_RE = /^[0-9a-f]{64}$/i;
const EWAY_RE = /^\d{12}$/;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const decorate = (row) => {
  const j = row.toJSON ? row.toJSON() : row;
  const outstanding = outstandingOf(j);
  const open = ['UNPAID', 'PARTIALLY_PAID'].includes(j.status);
  const daysOverdue = open && j.due_date && j.due_date < today()
    ? Math.floor((new Date(today()) - new Date(j.due_date)) / 86400000) : 0;
  const stage = open ? stageOf(j) : null;
  // Fully settled by a credit note or discount with no cash is "Settled", not "Paid".
  const label = j.status === 'PAID' && Number(j.amount_received || 0) + Number(j.tds_deducted || 0) <= 0.005 ? 'Settled' : STATUS_LABEL[j.status] || j.status;
  return {
    ...j, outstanding, overdue: daysOverdue > 0, days_overdue: daysOverdue, status_label: label,
    reminder_stage: stage?.stage || null, reminder_stage_label: stage?.label || null,
    no_delivery: !j.delivery_id, direct_reason_label: j.direct_reason ? (DIRECT_REASONS[j.direct_reason.split(':')[0]] || j.direct_reason) : null
  };
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
    notes: body.notes ? String(body.notes) : null,
    direct_reason: body.direct_reason ? String(body.direct_reason).trim().slice(0, 255) : null,
    irn: body.irn ? String(body.irn).trim() : null,
    irn_ack_number: body.irn_ack_number ? String(body.irn_ack_number).trim().slice(0, 30) : null,
    irn_ack_date: normalizeDate(body.irn_ack_date),
    eway_bill_number: body.eway_bill_number ? String(body.eway_bill_number).replace(/\s/g, '') : null
  };
  const existing = data.customer_id ? await ArCustomer.findOne({ where: { ...tenantWhere, id: data.customer_id } }) : null;
  const checks = checkInvoiceNumbers({ ...data, party_name: existing?.customer_name || data.customer.customer_name, line_items: [] });
  const add = (field, severity, message) => checks.push({ field, severity, message });
  // Customers are added and verified in Customers (maker-checker); an invoice cannot create one.
  if (!data.customer_id) add('customer_id', 'error', 'Choose a customer. A new customer is added in Accounts Receivable → Customers and verified there first.');
  else if (!existing) add('customer_id', 'error', 'Customer not found in your company');
  else if (existing.status === 'PENDING') add('customer_id', 'error', `${existing.customer_name} is not verified yet. Have the customer verified in Customers before invoicing.`);
  else if (existing.status === 'REJECTED') add('customer_id', 'error', `${existing.customer_name} was rejected at verification and cannot be invoiced`);
  else if (existing.status === 'ON_HOLD') add('customer_id', 'error', `${existing.customer_name} is on hold${existing.hold_reason ? `: ${existing.hold_reason}` : ''}. Finance must remove the hold first.`);
  // An invoice with no sales order or delivery must say why.
  const reasonKey = data.direct_reason ? data.direct_reason.split(':')[0] : null;
  if (!data.direct_reason) add('direct_reason', 'error', 'Say why this invoice has no sales order or delivery (service billing, opening balance, issued outside LedgerLine, or other)');
  else if (!DIRECT_REASONS[reasonKey]) add('direct_reason', 'error', 'Choose a reason for the invoice without a delivery');
  else if (reasonKey === 'OTHER' && data.direct_reason.length < 8) add('direct_reason', 'error', 'Describe the other reason');
  if (data.invoice_date && data.invoice_date > today()) add('invoice_date', 'error', 'The invoice date cannot be in the future');
  if (data.invoice_date) {
    const locked = await arPeriod.lockMessage(existing?.client_id || getClientId(req), data.invoice_date);
    if (locked) add('invoice_date', 'error', locked);
  }
  if (data.irn && !IRN_RE.test(data.irn)) add('irn', 'error', 'The IRN is 64 characters (letters a-f and digits) from the e-invoice portal');
  if (data.eway_bill_number && !EWAY_RE.test(data.eway_bill_number)) add('eway_bill_number', 'error', 'The e-way bill number is 12 digits');
  // The credit check runs as a warning: the invoice may already have been issued.
  if (existing && existing.status === 'ACTIVE' && data.total_amount) {
    const result = await credit.check(existing, { client_id: existing.client_id, id: null, total_amount: data.total_amount, items: [] }).catch(() => null);
    if (result && !result.passed) add('credit', 'warning', `Credit check: ${result.reasons.join('; ')}`);
  }
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
    const { invoice } = await sequelize.transaction(async (transaction) => {
      const cust = existing;
      const subtotal = data.subtotal ?? round2(data.total_amount - data.tax_amount);
      const split = await gstSplit(clientId, cust.gst_number, data.tax_amount);
      // No due date given: the customer's payment terms decide it.
      const dueDate = data.due_date || (data.invoice_date
        ? new Date(new Date(data.invoice_date).getTime() + Number(cust.payment_terms_days ?? 30) * 86400000).toISOString().slice(0, 10) : null);
      const inv = await ArInvoice.create({
        client_id: clientId, customer_id: cust.id, invoice_number: data.invoice_number, invoice_date: data.invoice_date,
        due_date: dueDate, customer_po_number: data.customer_po_number, subtotal, tax_amount: data.tax_amount,
        igst_amount: split.igst_amount, cgst_amount: split.cgst_amount, sgst_amount: split.sgst_amount,
        total_amount: round2(subtotal + data.tax_amount), amount_received: 0, status: 'UNPAID', notes: data.notes,
        source: req.body.source === 'AI_EXTRACTED' ? 'AI_EXTRACTED' : 'MANUAL',
        source_file_name: req.body.source_file_name ? String(req.body.source_file_name).slice(0, 255) : null,
        direct_reason: data.direct_reason, irn: data.irn, irn_ack_number: data.irn_ack_number, irn_ack_date: data.irn_ack_date,
        eway_bill_number: data.eway_bill_number, created_by: req.user.id
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
      return { invoice: inv };
    });
    // Accounting entry: Dr Receivable, Cr Sales and Output GST (and the receipt, if one came with it).
    await arJournal.safely(`invoice ${invoice.id}`, async () => {
      await arJournal.postInvoice(invoice.id);
      for (const r of await ArReceipt.findAll({ where: { invoice_id: invoice.id }, attributes: ['id'] })) await arJournal.postReceipt(r.id);
    });
    await recordAudit(req, {
      module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_INVOICE_POSTED', after: invoice,
      note: `${invoice.source === 'AI_EXTRACTED' ? 'Extracted by AI, reviewed and posted' : 'Entered manually'}; no delivery: ${DIRECT_REASONS[data.direct_reason.split(':')[0]] || data.direct_reason}${data.amount_received > 0 ? `; ${data.amount_received} received` : ''}`
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
  const disputed = await disputedInvoiceIds(where.client_id || null);
  const data = rows.map((r) => ({ ...decorate(r), in_dispute: disputed.has(r.id) }));
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
      { model: ArReminder, as: 'reminders' },
      { model: ArPromise, as: 'promises' },
      { model: ArSalesOrder, as: 'salesOrder', attributes: ['id', 'order_number'], required: false },
      { model: ArCreditNote, as: 'creditNotes', required: false },
      { model: ArWriteOff, as: 'writeOffs', required: false }
    ],
    order: [[{ model: ArReceipt, as: 'receipts' }, 'id', 'ASC'], [{ model: ArReminder, as: 'reminders' }, 'id', 'DESC'], [{ model: ArPromise, as: 'promises' }, 'id', 'DESC']]
  });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  const ids = (list) => (list.length ? list.map((x) => x.id) : 0);
  const [history, journals] = await Promise.all([
    documentHistory(tenantWhere, 'AR_INVOICE', invoice.id),
    JournalEntry.findAll({
      where: {
        client_id: invoice.client_id,
        [Op.or]: [
          { source_module: 'AR_INVOICE', source_id: invoice.id },
          { source_module: 'AR_RECEIPT', source_id: ids(invoice.receipts) },
          { source_module: 'AR_CREDIT_NOTE', source_id: ids(invoice.creditNotes) },
          { source_module: 'AR_WRITE_OFF', source_id: ids(invoice.writeOffs) }
        ]
      },
      include: [{ model: JournalLine, as: 'lines' }],
      order: [['id', 'ASC'], [{ model: JournalLine, as: 'lines' }, 'line_no', 'ASC']]
    })
  ]);
  const inDispute = invoice.creditNotes.some((c) => c.status === 'PENDING_APPROVAL');
  return res.json({ success: true, data: { ...decorate(invoice), in_dispute: inDispute, history, journals } });
};

/** e-invoice details from the IRP (IRN, acknowledgement) and the e-way bill, entered after the event. */
exports.updateEinvoice = async (req, res) => {
  const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (invoice.status === 'CANCELLED') return fail(res, 409, 'This invoice is cancelled');
  const body = req.body || {};
  const irn = body.irn ? String(body.irn).trim() : null;
  const eway = body.eway_bill_number ? String(body.eway_bill_number).replace(/\s/g, '') : null;
  if (irn && !IRN_RE.test(irn)) return fail(res, 422, 'The IRN is 64 characters (letters a-f and digits) from the e-invoice portal');
  if (eway && !EWAY_RE.test(eway)) return fail(res, 422, 'The e-way bill number is 12 digits');
  const before = invoice.toJSON();
  await invoice.update({
    irn, irn_ack_number: body.irn_ack_number ? String(body.irn_ack_number).trim().slice(0, 30) : null,
    irn_ack_date: normalizeDate(body.irn_ack_date), eway_bill_number: eway
  });
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_EINVOICE_UPDATED', before, after: invoice, note: irn ? 'IRN recorded' : 'e-invoice details cleared' });
  return res.json({ success: true, message: 'e-invoice details saved', data: decorate(invoice) });
};

exports.recordReceipt = async (req, res) => {
  const amount = round2(toNumber(req.body?.amount));
  // TDS the customer deducted before paying: it settles the invoice like cash but is not banked.
  const tds = round2(toNumber(req.body?.tds_amount));
  if (amount < 0 || tds < 0) return fail(res, 400, 'Amounts cannot be negative');
  if (!(amount > 0) && !(tds > 0)) return fail(res, 400, 'Enter an amount greater than zero');
  const receivedDate = normalizeDate(req.body?.received_date) || today();
  if (receivedDate > today()) return fail(res, 422, 'The receipt date cannot be in the future');
  if (!req.body?.confirm_duplicate_reference) {
    // Same check as Collections → Receive payment: one bank reference is one payment.
    const scope = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, attributes: ['client_id'] });
    const dup = scope ? await require('./arCollections.controller').duplicateReferenceMessage(scope.client_id, req.body?.payment_mode, req.body?.reference) : null;
    if (dup) return res.status(409).json({ success: false, message: dup, code: 'DUPLICATE_REFERENCE' });
  }
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!invoice) return { status: 404, message: 'Invoice not found' };
      if (!['UNPAID', 'PARTIALLY_PAID'].includes(invoice.status)) return { status: 409, message: `This invoice is ${STATUS_LABEL[invoice.status]}; no payment is due` };
      const locked = await arPeriod.lockMessage(invoice.client_id, receivedDate);
      if (locked) return { status: 423, message: locked };
      const outstanding = outstandingOf(invoice);
      if (round2(amount + tds) > outstanding + 0.005) return { status: 422, message: `Amount${tds ? ' plus TDS' : ''} exceeds the outstanding balance of ${outstanding}` };
      const before = invoice.toJSON();
      const receipt = await ArReceipt.create({
        client_id: invoice.client_id, invoice_id: invoice.id, amount, tds_amount: tds, received_date: receivedDate,
        payment_mode: req.body?.payment_mode || null, reference: req.body?.reference || null, notes: req.body?.notes || null, created_by: req.user.id
      }, { transaction });
      const received = round2(Number(invoice.amount_received || 0) + amount);
      const tdsTotal = round2(Number(invoice.tds_deducted || 0) + tds);
      const next = { amount_received: received, tds_deducted: tdsTotal };
      await invoice.update({ ...next, status: settledStatus({ ...invoice.toJSON(), ...next }) }, { transaction });
      return { invoice, before, receipt };
    });
    if (result.status) return fail(res, result.status, result.message);
    await recordAudit(req, {
      module: 'AR', entityType: 'AR_INVOICE', entityId: result.invoice.id,
      action: result.invoice.status === 'PAID' ? 'AR_INVOICE_PAID' : 'AR_RECEIPT_RECORDED', before: result.before, after: result.invoice,
      note: `Received ${amount}${tds ? `, TDS deducted ${tds}` : ''}${req.body?.reference ? ` (ref ${req.body.reference})` : ''}`
    });
    await arJournal.safely(`receipt ${result.receipt.id}`, () => arJournal.postReceipt(result.receipt.id));
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
  if (Number(invoice.amount_received) > 0 || Number(invoice.tds_deducted) > 0 || invoice.status !== 'UNPAID') return fail(res, 409, 'Only unpaid invoices with no receipts can be cancelled');
  const pendingCredit = await ArCreditNote.count({ where: { invoice_id: invoice.id, status: 'PENDING_APPROVAL' } });
  const pendingWriteOff = await ArWriteOff.count({ where: { invoice_id: invoice.id, status: 'PENDING_APPROVAL' } });
  if (pendingCredit || pendingWriteOff) return fail(res, 409, 'This invoice has a credit note or write-off waiting for a decision. Decide that first.');
  const lockedMsg = await arPeriod.lockMessage(invoice.client_id, today());
  if (lockedMsg) return fail(res, 423, lockedMsg);
  const before = invoice.toJSON();
  await sequelize.transaction(async (transaction) => {
    await invoice.update({ status: 'CANCELLED', notes: [invoice.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') }, { transaction });
    // An invoice raised from a delivery frees the delivery, so it can be invoiced again correctly.
    if (invoice.delivery_id) {
      const delivery = await ArDelivery.findByPk(invoice.delivery_id, { include: [{ model: ArDeliveryItem, as: 'items' }], transaction });
      if (delivery && delivery.invoice_id === invoice.id) {
        for (const it of delivery.items) {
          const item = await ArSalesOrderItem.findByPk(it.order_item_id, { transaction, lock: transaction.LOCK.UPDATE });
          if (item) await item.update({ invoiced_qty: Math.max(0, Math.round((Number(item.invoiced_qty) - Number(it.quantity)) * 1000) / 1000) }, { transaction });
        }
        await delivery.update({ invoice_id: null }, { transaction });
        const order = await ArSalesOrder.findByPk(delivery.order_id, { include: [{ model: ArSalesOrderItem, as: 'items' }], transaction });
        if (order && order.status === 'CLOSED') {
          const allDelivered = order.items.every((x) => Number(x.delivered_qty) >= Number(x.quantity));
          await order.update({ status: allDelivered ? 'DELIVERED' : 'PARTIALLY_DELIVERED' }, { transaction });
        }
      }
    }
  });
  await arJournal.safely(`cancel ${invoice.id}`, () => arJournal.reverseInvoice(invoice.id));
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_INVOICE_CANCELLED', before, after: invoice, note: reason });
  return res.json({ success: true, message: 'Invoice cancelled', data: decorate(invoice) });
};

exports.remind = async (req, res) => {
  const invoice = await ArInvoice.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: [{ model: ArCustomer, as: 'customer' }] });
  if (!invoice) return fail(res, 404, 'Invoice not found');
  if (!['UNPAID', 'PARTIALLY_PAID'].includes(invoice.status)) return fail(res, 409, 'This invoice has nothing outstanding');
  // A reviewed draft (standard or written by AI) may be sent in place of the standard wording.
  const message = req.body?.message ? String(req.body.message).slice(0, 5000) : null;
  const reminder = await sendReminder(invoice, { userId: req.user.id, subject: req.body?.subject || null, message, draftedByAi: !!req.body?.drafted_by_ai });
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
