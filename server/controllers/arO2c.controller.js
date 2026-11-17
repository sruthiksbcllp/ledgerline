'use strict';

/**
 * Accounts Receivable, order to cash: customer onboarding, quotations and sales orders with a
 * credit check, deliveries with proof of delivery, and the customer invoice raised from a
 * delivery. The AR mirror of vendor onboarding -> PR/PO -> approval -> GRN -> vendor invoice.
 * Every query is scoped to the caller's company.
 */
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const {
  sequelize, ArCustomer, ArInvoice, ArSalesOrder, ArSalesOrderItem, ArDelivery, ArDeliveryItem, User
} = require('../models');
const { buildAdminWhere, getClientId } = require('../utils/tenantFilter');
const { recordAudit, documentHistory } = require('../utils/financeAudit');
const { getNextNumber } = require('../services/documentNumbering');
const { extractInvoice, normalizeDate, toNumber } = require('../services/invoiceExtraction.service');
const { ExtractionError, GSTIN_RE, PAN_RE } = require('../services/vendorExtraction.service');
const { limitOf } = require('../services/billApproval.service');
const credit = require('../services/arCredit.service');
const arJournal = require('../services/arJournal.service');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const round3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000).toISOString().slice(0, 10);
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const text = (v, max = 255) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const nameOf = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);

async function userNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const users = await User.findAll({ where: { id: { [Op.in]: list } }, attributes: ['id', 'first_name', 'last_name', 'email'] });
  return Object.fromEntries(users.map((u) => [u.id, nameOf(u)]));
}

// ── Customers ────────────────────────────────────────────────────────────────

function customerInput(body) {
  const out = {
    customer_name: text(body.customer_name),
    gst_number: body.gst_number ? String(body.gst_number).replace(/[\s-]/g, '').toUpperCase() : null,
    pan: body.pan ? String(body.pan).replace(/\s/g, '').toUpperCase() : null,
    email: text(body.email), phone: text(body.phone, 50), contact_person: text(body.contact_person, 150),
    address: text(body.address, 2000), shipping_address: text(body.shipping_address, 2000),
    payment_terms_days: body.payment_terms_days === undefined || body.payment_terms_days === null || body.payment_terms_days === '' ? 30 : Number(body.payment_terms_days),
    credit_limit: body.credit_limit === undefined || body.credit_limit === null || body.credit_limit === '' ? null : round2(body.credit_limit)
  };
  let problem = null;
  if (!out.customer_name) problem = 'Enter the customer name';
  else if (out.gst_number && !GSTIN_RE.test(out.gst_number)) problem = 'The GSTIN is not valid (15 characters, e.g. 29ABCDE1234F1Z5)';
  else if (out.pan && !PAN_RE.test(out.pan)) problem = 'The PAN is not valid (10 characters, e.g. ABCDE1234F)';
  else if (out.gst_number && out.pan && out.gst_number.slice(2, 12) !== out.pan) problem = 'The PAN does not match the PAN inside the GSTIN';
  else if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) problem = 'The email address is not valid';
  else if (!Number.isInteger(out.payment_terms_days) || out.payment_terms_days < 0 || out.payment_terms_days > 365) problem = 'Payment terms must be between 0 and 365 days';
  else if (out.credit_limit !== null && !(out.credit_limit >= 0)) problem = 'The credit limit cannot be negative';
  if (out.gst_number && !out.pan) out.pan = out.gst_number.slice(2, 12);
  return { data: out, problem };
}

/** Why this user may not verify this customer / set this credit limit, or null if they may. */
function verifyBlock(customer, user, creditLimit) {
  const limit = limitOf(user.role);
  if (limit === 0) return 'Your role does not verify customers or approve credit limits';
  if (creditLimit !== null && creditLimit !== undefined && Number(creditLimit) > limit) return `A credit limit of ${inr(creditLimit)} is above your approval limit of ${inr(limit)}`;
  if (customer && customer.created_by && Number(customer.created_by) === Number(user.id) && customer.status === 'PENDING') return 'You added this customer, so someone else must verify it';
  return null;
}

exports.listCustomers = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const [customers, invoices] = await Promise.all([
    ArCustomer.findAll({ where: tenantWhere, order: [['customer_name', 'ASC']], limit: 2000 }),
    ArInvoice.findAll({ where: { ...tenantWhere, status: credit.OPEN_INVOICE }, attributes: ['customer_id', 'total_amount', 'amount_received', 'tds_deducted', 'due_date'] })
  ]);
  const now = today();
  const byCustomer = {};
  for (const inv of invoices) {
    const s = byCustomer[inv.customer_id] || (byCustomer[inv.customer_id] = { outstanding: 0, overdue: 0, oldest_overdue_days: 0, open_invoices: 0 });
    const due = credit.outstandingOf(inv);
    s.outstanding += due;
    s.open_invoices += 1;
    if (inv.due_date && inv.due_date < now) {
      s.overdue += due;
      s.oldest_overdue_days = Math.max(s.oldest_overdue_days, Math.floor((new Date(now) - new Date(inv.due_date)) / 86400000));
    }
  }
  const myLimit = limitOf(req.user.role);
  const data = customers.map((c) => {
    const s = byCustomer[c.id] || { outstanding: 0, overdue: 0, oldest_overdue_days: 0, open_invoices: 0 };
    const limit = c.credit_limit === null ? null : Number(c.credit_limit);
    return {
      ...c.toJSON(), outstanding: round2(s.outstanding), overdue: round2(s.overdue), oldest_overdue_days: s.oldest_overdue_days,
      open_invoices: s.open_invoices, credit_used_percent: limit ? Math.round((s.outstanding / limit) * 100) : null,
      can_verify: c.status === 'PENDING' && !verifyBlock(c, req.user, limit)
    };
  });
  return res.json({ success: true, data, meta: { my_limit: Number.isFinite(myLimit) ? myLimit : null, can_approve: myLimit > 0 } });
};

exports.createCustomer = async (req, res) => {
  const clientId = getClientId(req);
  if (!clientId) return fail(res, 400, 'Select a company before adding customers');
  const { data, problem } = customerInput(req.body || {});
  if (problem) return fail(res, 422, problem);
  const clash = await ArCustomer.findOne({
    where: {
      client_id: clientId,
      [Op.or]: [
        ...(data.gst_number ? [{ gst_number: data.gst_number }] : []),
        sqlWhere(fn('LOWER', col('customer_name')), data.customer_name.toLowerCase())
      ]
    }
  });
  if (clash) return fail(res, 409, `${clash.customer_name} is already a customer${clash.gst_number === data.gst_number && data.gst_number ? ' with this GSTIN' : ''}`);
  // A new customer waits for a second person to verify it and approve the credit limit.
  const customer = await ArCustomer.create({ client_id: clientId, ...data, status: 'PENDING', created_by: req.user.id });
  await recordAudit(req, { module: 'AR', entityType: 'AR_CUSTOMER', entityId: customer.id, action: 'AR_CUSTOMER_CREATED', after: customer, note: 'Added; waiting for verification' });
  return res.status(201).json({ success: true, message: 'Customer added. It needs to be verified before orders can be confirmed.', data: customer });
};

exports.updateCustomer = async (req, res) => {
  const customer = await ArCustomer.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!customer) return fail(res, 404, 'Customer not found');
  const { data, problem } = customerInput({ ...customer.toJSON(), ...(req.body || {}) });
  if (problem) return fail(res, 422, problem);
  const before = customer.toJSON();
  const identityChanged = ['customer_name', 'gst_number', 'pan'].some((k) => (before[k] || null) !== (data[k] || null));
  const limitChanged = (before.credit_limit === null ? null : Number(before.credit_limit)) !== data.credit_limit;
  // Name, GSTIN, PAN and the credit limit are maker-checker: a change by someone who cannot
  // approve it sends the customer back for verification.
  const needsCheck = (identityChanged || limitChanged) && customer.status === 'ACTIVE' && !!verifyBlock(null, req.user, data.credit_limit);
  try {
    await customer.update({ ...data, ...(needsCheck ? { status: 'PENDING', verified_by: null, verified_at: null, created_by: req.user.id } : {}) });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return fail(res, 409, 'Another customer already has this GSTIN');
    throw error;
  }
  await recordAudit(req, { module: 'AR', entityType: 'AR_CUSTOMER', entityId: customer.id, action: 'AR_CUSTOMER_UPDATED', before, after: customer, note: needsCheck ? 'Changed; sent for verification' : null });
  return res.json({ success: true, message: needsCheck ? 'Saved. The change needs to be verified by an approver.' : 'Customer saved', data: customer });
};

exports.verifyCustomer = async (req, res) => {
  const customer = await ArCustomer.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!customer) return fail(res, 404, 'Customer not found');
  if (customer.status !== 'PENDING') return fail(res, 409, 'This customer is not waiting for verification');
  const approve = req.body?.action !== 'reject';
  const creditLimit = req.body?.credit_limit === undefined ? (customer.credit_limit === null ? null : Number(customer.credit_limit))
    : (req.body.credit_limit === null || req.body.credit_limit === '' ? null : round2(req.body.credit_limit));
  const block = verifyBlock(customer, req.user, approve ? creditLimit : null);
  if (block) return fail(res, 403, block);
  const before = customer.toJSON();
  if (!approve) {
    const reason = text(req.body?.reason);
    if (!reason) return fail(res, 400, 'Give a reason for rejecting the customer');
    await customer.update({ status: 'REJECTED', hold_reason: reason, verified_by: req.user.id, verified_at: new Date() });
  } else {
    const terms = req.body?.payment_terms_days === undefined ? customer.payment_terms_days : Number(req.body.payment_terms_days);
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) return fail(res, 422, 'Payment terms must be between 0 and 365 days');
    await customer.update({ status: 'ACTIVE', hold_reason: null, credit_limit: creditLimit, payment_terms_days: terms, verified_by: req.user.id, verified_at: new Date() });
  }
  await recordAudit(req, {
    module: 'AR', entityType: 'AR_CUSTOMER', entityId: customer.id, action: approve ? 'AR_CUSTOMER_VERIFIED' : 'AR_CUSTOMER_REJECTED', before, after: customer,
    note: approve ? `Verified; credit limit ${creditLimit === null ? 'not set' : inr(creditLimit)}, ${customer.payment_terms_days}-day terms` : req.body.reason
  });
  return res.json({ success: true, message: approve ? 'Customer verified' : 'Customer rejected', data: customer });
};

exports.holdCustomer = async (req, res) => {
  const customer = await ArCustomer.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!customer) return fail(res, 404, 'Customer not found');
  const hold = !!req.body?.hold;
  const before = customer.toJSON();
  if (hold) {
    if (customer.status !== 'ACTIVE') return fail(res, 409, 'Only an active customer can be put on hold');
    const reason = text(req.body?.reason);
    if (!reason) return fail(res, 400, 'Give a reason for the hold');
    await customer.update({ status: 'ON_HOLD', hold_reason: reason });
  } else {
    if (customer.status !== 'ON_HOLD') return fail(res, 409, 'This customer is not on hold');
    if (limitOf(req.user.role) === 0) return fail(res, 403, 'Taking a customer off hold needs Finance or the Director / CFO');
    await customer.update({ status: 'ACTIVE', hold_reason: null });
  }
  await recordAudit(req, { module: 'AR', entityType: 'AR_CUSTOMER', entityId: customer.id, action: hold ? 'AR_CUSTOMER_ON_HOLD' : 'AR_CUSTOMER_HOLD_RELEASED', before, after: customer, note: hold ? req.body.reason : null });
  return res.json({ success: true, message: hold ? 'Customer put on hold. New orders will stop at the credit check.' : 'Hold removed', data: customer });
};

/** What the customer owes and has on order, with a credit limit suggested from payment history. */
exports.customerCredit = async (req, res) => {
  const customer = await ArCustomer.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!customer) return fail(res, 404, 'Customer not found');
  const [exposure, suggestion, history] = await Promise.all([
    credit.exposure(customer.client_id, customer.id),
    credit.suggestLimit(customer.client_id, customer),
    documentHistory(buildAdminWhere(req), 'AR_CUSTOMER', customer.id)
  ]);
  return res.json({ success: true, data: { customer, exposure, suggestion, history } });
};

// ── Quotations and sales orders ──────────────────────────────────────────────

function orderLines(raw) {
  const lines = (Array.isArray(raw) ? raw : []).map((l, i) => {
    const quantity = round3(toNumber(l.quantity));
    const rate = round2(toNumber(l.rate));
    const gst = toNumber(l.gst_percent);
    return {
      line_no: i + 1, description: text(l.description, 500), hsn_code: text(l.hsn_code, 20), unit: text(l.unit, 20),
      quantity, rate, gst_percent: gst === null ? 0 : gst, amount: round2(quantity * rate)
    };
  });
  let problem = null;
  if (!lines.length) problem = 'Add at least one item';
  else if (lines.some((l) => !l.description)) problem = 'Every item needs a description';
  else if (lines.some((l) => !(l.quantity > 0))) problem = 'Every item needs a quantity above zero';
  else if (lines.some((l) => !(l.rate >= 0))) problem = 'Every item needs a rate';
  else if (lines.some((l) => l.gst_percent < 0 || l.gst_percent > 100)) problem = 'GST % must be between 0 and 100';
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round2(lines.reduce((s, l) => s + (l.amount * l.gst_percent) / 100, 0));
  return { lines, problem, totals: { subtotal, tax_amount: tax, total_amount: round2(subtotal + tax) } };
}

const orderInclude = [
  { model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name', 'gst_number', 'status', 'credit_limit', 'payment_terms_days', 'hold_reason'] },
  { model: ArSalesOrderItem, as: 'items' }
];

const decorateOrder = (order) => {
  const j = order.toJSON ? order.toJSON() : order;
  const items = (j.items || []).sort((a, b) => a.line_no - b.line_no).map((it) => ({
    ...it, to_deliver: round3(Number(it.quantity) - Number(it.delivered_qty)), to_invoice: round3(Number(it.delivered_qty) - Number(it.invoiced_qty))
  }));
  return { ...j, items, number: j.order_number || j.quotation_number };
};

/** Where the order stands from its lines: CONFIRMED -> PARTIALLY_DELIVERED -> DELIVERED -> CLOSED. */
async function refreshOrderStatus(orderId, transaction) {
  const order = await ArSalesOrder.findByPk(orderId, { include: [{ model: ArSalesOrderItem, as: 'items' }], transaction });
  if (!order || !['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CLOSED'].includes(order.status)) return order;
  const all = (key) => order.items.every((it) => Number(it[key]) >= Number(it.quantity));
  const any = (key) => order.items.some((it) => Number(it[key]) > 0);
  const status = all('invoiced_qty') ? 'CLOSED' : all('delivered_qty') ? 'DELIVERED' : any('delivered_qty') ? 'PARTIALLY_DELIVERED' : 'CONFIRMED';
  if (status !== order.status) await order.update({ status }, { transaction });
  return order;
}

exports.listOrders = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.status) where.status = String(req.query.status).split(',');
  const rows = await ArSalesOrder.findAll({ where, include: orderInclude, order: [['id', 'DESC']], limit: 1000 });
  const data = rows.map((o) => {
    const d = decorateOrder(o);
    return { ...d, can_release: d.status === 'CREDIT_HOLD' && !credit.releaseBlock(d, req.user) };
  });
  const sum = (list) => round2(list.reduce((s, o) => s + Number(o.total_amount), 0));
  const inStatus = (...s) => data.filter((o) => s.includes(o.status));
  return res.json({
    success: true, data,
    summary: {
      quotations: inStatus('QUOTATION').length, quotation_value: sum(inStatus('QUOTATION')),
      on_hold: inStatus('CREDIT_HOLD').length, on_hold_value: sum(inStatus('CREDIT_HOLD')),
      to_deliver: inStatus('CONFIRMED', 'PARTIALLY_DELIVERED').length, to_deliver_value: sum(inStatus('CONFIRMED', 'PARTIALLY_DELIVERED')),
      to_invoice: data.filter((o) => o.items.some((it) => it.to_invoice > 0)).length
    }
  });
};

exports.getOrder = async (req, res) => {
  const tenantWhere = buildAdminWhere(req);
  const order = await ArSalesOrder.findOne({ where: { ...tenantWhere, id: req.params.id }, include: orderInclude });
  if (!order) return fail(res, 404, 'Order not found');
  const [deliveries, invoices, history, names] = await Promise.all([
    ArDelivery.findAll({ where: { order_id: order.id }, include: [{ model: ArDeliveryItem, as: 'items' }], order: [['id', 'ASC']] }),
    ArInvoice.findAll({ where: { sales_order_id: order.id }, attributes: ['id', 'invoice_number', 'invoice_date', 'total_amount', 'status', 'delivery_id'], order: [['id', 'ASC']] }),
    documentHistory(tenantWhere, 'AR_SALES_ORDER', order.id),
    userNames([order.created_by, order.credit_released_by])
  ]);
  // A quotation shows what the credit check would say if it were confirmed now.
  const preview = order.status === 'QUOTATION' && order.customer ? await credit.check(order.customer, order) : null;
  const data = decorateOrder(order);
  return res.json({
    success: true,
    data: {
      ...data, deliveries, invoices, history, credit_preview: preview,
      created_by_name: names[order.created_by] || null, credit_released_by_name: names[order.credit_released_by] || null,
      can_release: data.status === 'CREDIT_HOLD' && !credit.releaseBlock(data, req.user),
      release_block: data.status === 'CREDIT_HOLD' ? credit.releaseBlock(data, req.user) : null
    }
  });
};

/** Customer PO (or any order document) read by AI: the customer and the order lines. */
exports.extractOrder = async (req, res) => {
  try {
    const result = await extractInvoice(req.file, 'AR');
    const tenantWhere = buildAdminWhere(req);
    const gstin = result.party.gst_number.value;
    const name = String(result.party.name.value || '').trim().toLowerCase();
    let customer = gstin ? await ArCustomer.findOne({ where: { ...tenantWhere, gst_number: gstin } }) : null;
    let matchedBy = customer ? 'GSTIN' : null;
    if (!customer && name) {
      customer = await ArCustomer.findOne({ where: { ...tenantWhere, [Op.and]: [sqlWhere(fn('LOWER', col('customer_name')), name)] } });
      matchedBy = customer ? 'NAME' : null;
    }
    const headerRate = toNumber(result.header.tax_rate_percent.value);
    return res.json({
      success: true,
      data: {
        document_type: result.document_type, party: result.party,
        customer_po_number: result.header.po_number.value || (result.document_type === 'PURCHASE_ORDER' ? result.header.invoice_number.value : null) || null,
        order_date: result.header.invoice_date.value || null,
        items: result.line_items.map((l) => ({
          description: l.description, quantity: l.quantity ?? 1,
          rate: l.unit_price ?? (l.amount !== null && l.quantity ? round2(l.amount / l.quantity) : l.amount ?? 0),
          gst_percent: l.tax_rate_percent ?? headerRate ?? 0
        })),
        matches: { customer: customer ? { id: customer.id, customer_name: customer.customer_name, status: customer.status, matched_by: matchedBy } : null }
      }
    });
  } catch (error) {
    if (error instanceof ExtractionError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return fail(res, 500, 'Could not read the document. Enter the details manually.');
  }
};

/** Runs the credit check and moves a quotation (or a held order) to CONFIRMED or CREDIT_HOLD. */
async function confirm(order, customer, transaction) {
  if (!order.order_number) order.order_number = await getNextNumber(order.client_id, 'SALES_ORDER', transaction);
  const result = await credit.check(customer, order, { transaction });
  await order.update({
    order_number: order.order_number, credit_check: result, status: result.passed ? 'CONFIRMED' : 'CREDIT_HOLD',
    confirmed_at: result.passed ? new Date() : null
  }, { transaction });
  return result;
}

exports.createOrder = async (req, res) => {
  const clientId = getClientId(req);
  if (!clientId) return fail(res, 400, 'Select a company before raising orders');
  const body = req.body || {};
  const customer = await ArCustomer.findOne({ where: { ...buildAdminWhere(req), id: body.customer_id || 0 } });
  if (!customer) return fail(res, 422, 'Choose a customer');
  if (customer.status === 'REJECTED') return fail(res, 409, 'This customer was rejected at verification');
  const { lines, problem, totals } = orderLines(body.items);
  if (problem) return fail(res, 422, problem);
  const asOrder = body.as === 'ORDER';
  if (asOrder && customer.status === 'PENDING') return fail(res, 409, `${customer.customer_name} is not verified yet. Save this as a quotation, or have the customer verified first.`);
  const orderDate = normalizeDate(body.order_date) || today();
  const { order, result } = await sequelize.transaction(async (transaction) => {
    const created = await ArSalesOrder.create({
      client_id: clientId, customer_id: customer.id, quotation_number: await getNextNumber(clientId, 'SALES_QUOTE', transaction),
      status: 'QUOTATION', order_date: orderDate, valid_until: normalizeDate(body.valid_until) || addDays(orderDate, 30),
      customer_po_number: text(body.customer_po_number, 100), ...totals, notes: text(body.notes, 5000),
      source: body.source === 'AI_EXTRACTED' ? 'AI_EXTRACTED' : 'MANUAL', source_file_name: text(body.source_file_name), created_by: req.user.id
    }, { transaction });
    await ArSalesOrderItem.bulkCreate(lines.map((l) => ({ ...l, client_id: clientId, order_id: created.id })), { transaction });
    return { order: created, result: asOrder ? await confirm(created, customer, transaction) : null };
  });
  await recordAudit(req, {
    module: 'AR', entityType: 'AR_SALES_ORDER', entityId: order.id, action: asOrder ? (result.passed ? 'AR_ORDER_CONFIRMED' : 'AR_ORDER_CREDIT_HOLD') : 'AR_QUOTATION_CREATED', after: order,
    note: asOrder ? (result.passed ? 'Credit check passed' : result.reasons.join('; ')) : `Quotation for ${inr(order.total_amount)}`
  });
  const message = !asOrder ? `Quotation ${order.quotation_number} saved`
    : result.passed ? `Order ${order.order_number} confirmed. Credit check passed.` : `Order ${order.order_number} is on credit hold: ${result.reasons[0]}`;
  return res.status(201).json({ success: true, message, data: decorateOrder(await ArSalesOrder.findByPk(order.id, { include: orderInclude })) });
};

exports.updateOrder = async (req, res) => {
  const order = await ArSalesOrder.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!order) return fail(res, 404, 'Order not found');
  if (order.status !== 'QUOTATION') return fail(res, 409, 'Only a quotation can be edited');
  const body = req.body || {};
  const { lines, problem, totals } = orderLines(body.items);
  if (problem) return fail(res, 422, problem);
  const before = order.toJSON();
  await sequelize.transaction(async (transaction) => {
    await ArSalesOrderItem.destroy({ where: { order_id: order.id }, transaction });
    await ArSalesOrderItem.bulkCreate(lines.map((l) => ({ ...l, client_id: order.client_id, order_id: order.id })), { transaction });
    await order.update({
      ...totals, order_date: normalizeDate(body.order_date) || order.order_date, valid_until: normalizeDate(body.valid_until) || order.valid_until,
      customer_po_number: text(body.customer_po_number, 100), notes: text(body.notes, 5000)
    }, { transaction });
  });
  await recordAudit(req, { module: 'AR', entityType: 'AR_SALES_ORDER', entityId: order.id, action: 'AR_QUOTATION_UPDATED', before, after: order });
  return res.json({ success: true, message: 'Quotation saved', data: decorateOrder(await ArSalesOrder.findByPk(order.id, { include: orderInclude })) });
};

/** Quotation accepted by the customer -> sales order, through the credit check. Also re-checks a held order. */
exports.confirmOrder = async (req, res) => {
  const order = await ArSalesOrder.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: orderInclude });
  if (!order) return fail(res, 404, 'Order not found');
  if (!['QUOTATION', 'CREDIT_HOLD'].includes(order.status)) return fail(res, 409, 'This order is already confirmed');
  const customer = await ArCustomer.findByPk(order.customer_id);
  if (customer.status === 'PENDING') return fail(res, 409, `${customer.customer_name} is not verified yet. Have the customer verified before confirming the order.`);
  if (customer.status === 'REJECTED') return fail(res, 409, 'This customer was rejected at verification');
  const before = order.toJSON();
  const result = await sequelize.transaction(async (transaction) => {
    if (req.body?.customer_po_number) await order.update({ customer_po_number: text(req.body.customer_po_number, 100) }, { transaction });
    return confirm(order, customer, transaction);
  });
  await recordAudit(req, {
    module: 'AR', entityType: 'AR_SALES_ORDER', entityId: order.id, action: result.passed ? 'AR_ORDER_CONFIRMED' : 'AR_ORDER_CREDIT_HOLD', before, after: order,
    note: result.passed ? 'Credit check passed' : result.reasons.join('; ')
  });
  return res.json({
    success: true, message: result.passed ? `Order ${order.order_number} confirmed. Credit check passed.` : `Order ${order.order_number} is on credit hold: ${result.reasons[0]}`,
    data: decorateOrder(order)
  });
};

exports.releaseOrder = async (req, res) => {
  const order = await ArSalesOrder.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: orderInclude });
  if (!order) return fail(res, 404, 'Order not found');
  if (order.status !== 'CREDIT_HOLD') return fail(res, 409, 'This order is not on credit hold');
  const block = credit.releaseBlock(order, req.user);
  if (block) return fail(res, 403, block);
  const note = text(req.body?.note);
  if (!note) return fail(res, 400, 'Say why the order is being released');
  const before = order.toJSON();
  await order.update({ status: 'CONFIRMED', confirmed_at: new Date(), credit_released_by: req.user.id, credit_released_at: new Date(), credit_release_note: note });
  await recordAudit(req, { module: 'AR', entityType: 'AR_SALES_ORDER', entityId: order.id, action: 'AR_ORDER_CREDIT_RELEASED', before, after: order, note });
  return res.json({ success: true, message: `Order ${order.order_number} released from credit hold`, data: decorateOrder(order) });
};

exports.cancelOrder = async (req, res) => {
  const order = await ArSalesOrder.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: orderInclude });
  if (!order) return fail(res, 404, 'Order not found');
  if (!['QUOTATION', 'CREDIT_HOLD', 'CONFIRMED'].includes(order.status)) return fail(res, 409, 'An order with deliveries cannot be cancelled');
  const reason = text(req.body?.reason);
  if (!reason) return fail(res, 400, 'Give a reason for cancelling');
  const before = order.toJSON();
  await order.update({ status: 'CANCELLED', notes: [order.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') });
  await recordAudit(req, { module: 'AR', entityType: 'AR_SALES_ORDER', entityId: order.id, action: 'AR_ORDER_CANCELLED', before, after: order, note: reason });
  return res.json({ success: true, message: 'Cancelled', data: decorateOrder(order) });
};

// ── Deliveries ───────────────────────────────────────────────────────────────

const deliveryInclude = [
  { model: ArCustomer, as: 'customer', attributes: ['id', 'customer_name', 'gst_number', 'payment_terms_days'] },
  { model: ArSalesOrder, as: 'order', attributes: ['id', 'order_number', 'customer_po_number'] },
  { model: ArDeliveryItem, as: 'items', include: [{ model: ArSalesOrderItem, as: 'orderItem' }] },
  { model: ArInvoice, as: 'invoice', attributes: ['id', 'invoice_number', 'status'], required: false }
];

const decorateDelivery = (delivery) => {
  const j = delivery.toJSON ? delivery.toJSON() : delivery;
  const value = round2((j.items || []).reduce((s, it) => s + Number(it.quantity) * Number(it.orderItem?.rate || 0) * (1 + Number(it.orderItem?.gst_percent || 0) / 100), 0));
  return { ...j, value, can_invoice: j.status === 'DELIVERED' && !j.invoice_id };
};

exports.listDeliveries = async (req, res) => {
  const where = { ...buildAdminWhere(req) };
  if (req.query.status) where.status = String(req.query.status).split(',');
  const rows = await ArDelivery.findAll({ where, include: deliveryInclude, order: [['id', 'DESC']], limit: 1000 });
  const data = rows.map(decorateDelivery);
  return res.json({
    success: true, data,
    summary: {
      in_transit: data.filter((d) => d.status === 'DISPATCHED').length,
      to_invoice: data.filter((d) => d.can_invoice).length,
      to_invoice_value: round2(data.filter((d) => d.can_invoice).reduce((s, d) => s + d.value, 0))
    }
  });
};

exports.createDelivery = async (req, res) => {
  const body = req.body || {};
  const wanted = (Array.isArray(body.items) ? body.items : []).map((l) => ({ order_item_id: Number(l.order_item_id), quantity: round3(toNumber(l.quantity)) })).filter((l) => l.quantity > 0);
  if (!wanted.length) return fail(res, 422, 'Enter the quantity dispatched for at least one item');
  const outcome = await sequelize.transaction(async (transaction) => {
    const order = await ArSalesOrder.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) return { status: 404, message: 'Order not found' };
    if (order.status === 'CREDIT_HOLD') return { status: 409, message: 'This order is on credit hold and cannot be delivered until it is released' };
    if (!['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(order.status)) return { status: 409, message: 'Only a confirmed order with items left to deliver can be dispatched' };
    const items = await ArSalesOrderItem.findAll({ where: { order_id: order.id }, transaction, lock: transaction.LOCK.UPDATE });
    const byId = Object.fromEntries(items.map((it) => [it.id, it]));
    for (const l of wanted) {
      const item = byId[l.order_item_id];
      if (!item) return { status: 422, message: 'An item does not belong to this order' };
      const left = round3(Number(item.quantity) - Number(item.delivered_qty));
      if (l.quantity > left) return { status: 422, message: `${item.description}: ${l.quantity} is more than the ${left} left to deliver` };
    }
    const delivery = await ArDelivery.create({
      client_id: order.client_id, order_id: order.id, customer_id: order.customer_id,
      delivery_number: await getNextNumber(order.client_id, 'SALES_DELIVERY', transaction), status: 'DISPATCHED',
      dispatch_date: normalizeDate(body.dispatch_date) || today(), transporter: text(body.transporter, 150),
      vehicle_number: text(body.vehicle_number, 30), tracking_reference: text(body.tracking_reference, 100), created_by: req.user.id
    }, { transaction });
    await ArDeliveryItem.bulkCreate(wanted.map((l) => ({ client_id: order.client_id, delivery_id: delivery.id, ...l })), { transaction });
    for (const l of wanted) await byId[l.order_item_id].update({ delivered_qty: round3(Number(byId[l.order_item_id].delivered_qty) + l.quantity) }, { transaction });
    await refreshOrderStatus(order.id, transaction);
    return { delivery };
  });
  if (outcome.status) return fail(res, outcome.status, outcome.message);
  await recordAudit(req, { module: 'AR', entityType: 'AR_DELIVERY', entityId: outcome.delivery.id, action: 'AR_DELIVERY_DISPATCHED', after: outcome.delivery, note: `Dispatched ${wanted.length} item${wanted.length === 1 ? '' : 's'}` });
  await recordAudit(req, { module: 'AR', entityType: 'AR_SALES_ORDER', entityId: outcome.delivery.order_id, action: 'AR_DELIVERY_DISPATCHED', note: `Delivery ${outcome.delivery.delivery_number} dispatched` });
  return res.status(201).json({ success: true, message: `Delivery ${outcome.delivery.delivery_number} dispatched`, data: outcome.delivery });
};

/** Proof of delivery: who received the goods and when. Only a delivered delivery can be invoiced. */
exports.confirmDelivery = async (req, res) => {
  const delivery = await ArDelivery.findOne({ where: { ...buildAdminWhere(req), id: req.params.id } });
  if (!delivery) return fail(res, 404, 'Delivery not found');
  if (delivery.status !== 'DISPATCHED') return fail(res, 409, 'This delivery is already confirmed or cancelled');
  const receivedBy = text(req.body?.received_by, 150);
  if (!receivedBy) return fail(res, 400, 'Enter who received the goods (proof of delivery)');
  const deliveredDate = normalizeDate(req.body?.delivered_date) || today();
  if (deliveredDate < delivery.dispatch_date) return fail(res, 422, 'The delivery date cannot be before the dispatch date');
  const before = delivery.toJSON();
  await delivery.update({ status: 'DELIVERED', delivered_date: deliveredDate, received_by: receivedBy, delivery_note: text(req.body?.delivery_note) });
  await recordAudit(req, { module: 'AR', entityType: 'AR_DELIVERY', entityId: delivery.id, action: 'AR_DELIVERY_CONFIRMED', before, after: delivery, note: `Received by ${receivedBy}` });
  return res.json({ success: true, message: `Delivery ${delivery.delivery_number} confirmed. It can now be invoiced.`, data: delivery });
};

exports.cancelDelivery = async (req, res) => {
  const reason = text(req.body?.reason);
  if (!reason) return fail(res, 400, 'Give a reason for cancelling the delivery');
  const outcome = await sequelize.transaction(async (transaction) => {
    const delivery = await ArDelivery.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: [{ model: ArDeliveryItem, as: 'items' }], transaction });
    if (!delivery) return { status: 404, message: 'Delivery not found' };
    if (delivery.invoice_id) return { status: 409, message: 'This delivery is already invoiced' };
    if (delivery.status === 'CANCELLED') return { status: 409, message: 'This delivery is already cancelled' };
    for (const it of delivery.items) {
      const item = await ArSalesOrderItem.findByPk(it.order_item_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (item) await item.update({ delivered_qty: Math.max(0, round3(Number(item.delivered_qty) - Number(it.quantity))) }, { transaction });
    }
    await delivery.update({ status: 'CANCELLED', delivery_note: `Cancelled: ${reason}`.slice(0, 255) }, { transaction });
    await refreshOrderStatus(delivery.order_id, transaction);
    return { delivery };
  });
  if (outcome.status) return fail(res, outcome.status, outcome.message);
  await recordAudit(req, { module: 'AR', entityType: 'AR_DELIVERY', entityId: outcome.delivery.id, action: 'AR_DELIVERY_CANCELLED', after: outcome.delivery, note: reason });
  return res.json({ success: true, message: 'Delivery cancelled; the quantities are back on the order', data: outcome.delivery });
};

/** Lines, GST split and totals of the invoice a delivery would raise (also shown before posting). */
async function invoiceDraft(delivery) {
  const lines = delivery.items.map((it) => {
    const o = it.orderItem;
    const amount = round2(Number(it.quantity) * Number(o.rate));
    return { description: o.description, hsn_code: o.hsn_code, unit: o.unit, quantity: Number(it.quantity), rate: Number(o.rate), gst_percent: Number(o.gst_percent), amount, gst_amount: round2((amount * Number(o.gst_percent)) / 100) };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round2(lines.reduce((s, l) => s + l.gst_amount, 0));
  const split = await credit.gstSplit(delivery.client_id, delivery.customer?.gst_number, tax);
  return { lines, subtotal, tax_amount: tax, total_amount: round2(subtotal + tax), ...split };
}

exports.invoicePreview = async (req, res) => {
  const delivery = await ArDelivery.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: deliveryInclude });
  if (!delivery) return fail(res, 404, 'Delivery not found');
  const draft = await invoiceDraft(delivery);
  const invoiceDate = today();
  const names = await arJournal.accountNames(delivery.client_id);
  const journal = arJournal.invoiceLines(names, { ...draft, invoice_number: '(new)' }, delivery.customer?.customer_name).filter((l) => l.debit > 0 || l.credit > 0);
  return res.json({ success: true, data: { ...draft, invoice_date: invoiceDate, due_date: addDays(invoiceDate, delivery.customer?.payment_terms_days ?? 30), journal } });
};

/** Raises the customer invoice from a confirmed delivery: only what was delivered can be billed. */
exports.invoiceDelivery = async (req, res) => {
  const invoiceDate = normalizeDate(req.body?.invoice_date) || today();
  const outcome = await sequelize.transaction(async (transaction) => {
    const delivery = await ArDelivery.findOne({ where: { ...buildAdminWhere(req), id: req.params.id }, include: deliveryInclude, transaction });
    if (!delivery) return { status: 404, message: 'Delivery not found' };
    if (delivery.invoice_id) return { status: 409, message: `This delivery is already invoiced (${delivery.invoice?.invoice_number || 'invoice'})` };
    if (delivery.status !== 'DELIVERED') return { status: 409, message: 'Confirm the delivery (proof of delivery) before invoicing it' };
    if (invoiceDate < delivery.delivered_date) return { status: 422, message: 'The invoice date cannot be before the delivery date' };
    await ArDelivery.findByPk(delivery.id, { transaction, lock: transaction.LOCK.UPDATE });
    const draft = await invoiceDraft(delivery);
    const invoice = await ArInvoice.create({
      client_id: delivery.client_id, customer_id: delivery.customer_id, invoice_number: await getNextNumber(delivery.client_id, 'SALES_INVOICE', transaction),
      invoice_date: invoiceDate, due_date: addDays(invoiceDate, delivery.customer?.payment_terms_days ?? 30),
      customer_po_number: delivery.order?.customer_po_number || null, subtotal: draft.subtotal, tax_amount: draft.tax_amount, total_amount: draft.total_amount,
      igst_amount: draft.igst_amount, cgst_amount: draft.cgst_amount, sgst_amount: draft.sgst_amount, line_items: draft.lines,
      amount_received: 0, status: 'UNPAID', source: 'MANUAL', sales_order_id: delivery.order_id, delivery_id: delivery.id,
      notes: `Raised from delivery ${delivery.delivery_number} against order ${delivery.order?.order_number || ''}`.trim(), created_by: req.user.id
    }, { transaction });
    await delivery.update({ invoice_id: invoice.id }, { transaction });
    for (const it of delivery.items) {
      const item = await ArSalesOrderItem.findByPk(it.order_item_id, { transaction, lock: transaction.LOCK.UPDATE });
      await item.update({ invoiced_qty: round3(Number(item.invoiced_qty) + Number(it.quantity)) }, { transaction });
    }
    await refreshOrderStatus(delivery.order_id, transaction);
    return { invoice, delivery };
  });
  if (outcome.status) return fail(res, outcome.status, outcome.message);
  const { invoice, delivery } = outcome;
  await recordAudit(req, { module: 'AR', entityType: 'AR_INVOICE', entityId: invoice.id, action: 'AR_INVOICE_POSTED', after: invoice, note: `Raised from delivery ${delivery.delivery_number}` });
  await recordAudit(req, { module: 'AR', entityType: 'AR_SALES_ORDER', entityId: delivery.order_id, action: 'AR_INVOICE_POSTED', note: `Invoice ${invoice.invoice_number} raised for delivery ${delivery.delivery_number}` });
  await arJournal.safely(`invoice ${invoice.id}`, () => arJournal.postInvoice(invoice.id));
  return res.status(201).json({ success: true, message: `Invoice ${invoice.invoice_number} posted for ${inr(invoice.total_amount)}`, data: invoice });
};
