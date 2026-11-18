'use strict';
/**
 * Customer credit for Accounts Receivable: what a customer owes and has on order (exposure), the
 * credit check run on every sales order (the AR mirror of the PO approval matrix), the GST split
 * of a sale, and a suggested credit limit worked out from the customer's payment history.
 *
 * Credit check (blueprint O2C step 2): an order goes on hold when
 *   - the customer is on hold, or
 *   - open receivables + other confirmed orders not yet invoiced + this order exceed the credit limit, or
 *   - the customer has an invoice more than OVERDUE_BLOCK_DAYS days overdue, or
 *   - a line carries a discount above DISCOUNT_APPROVAL_PERCENT (prices from the agreed rate; bigger
 *     discounts need approval).
 * A held order is released by someone whose approval limit covers the order value (the same
 * limits as PRs, POs and bills) and who did not raise the order.
 */
const { Op } = require('sequelize');
const { ArInvoice, ArReceipt, ArSalesOrder, ArSalesOrderItem } = require('../models');
const { companyGstins } = require('./billGstChecks.service');
const { limitOf, neededLabel } = require('./billApproval.service');

const OVERDUE_BLOCK_DAYS = 60;
const DISCOUNT_APPROVAL_PERCENT = 10;
const OPEN_INVOICE = ['UNPAID', 'PARTIALLY_PAID'];
const OPEN_ORDER = ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((new Date(to) - new Date(from)) / 86400000);
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * What is still owed on an invoice: total less cash received, TDS the customer withheld, approved
 * credit notes, early-payment discount allowed and amounts written off. The one place this is worked
 * out, so the customer ledger, ageing, reminders and the ledger tie-out always agree.
 */
const outstandingOf = (inv) => Math.max(0, round2(
  Number(inv.total_amount || 0) - Number(inv.amount_received || 0) - Number(inv.tds_deducted || 0)
  - Number(inv.credited_amount || 0) - Number(inv.discount_allowed || 0) - Number(inv.written_off_amount || 0)
));

/** Status an invoice should have after a settlement: PAID once nothing is left, else PARTIALLY_PAID / UNPAID. */
const settledStatus = (inv) => {
  // Nothing left: written off if a write-off closed it (tracked for recovery), otherwise paid.
  if (outstandingOf(inv) <= 0.005) return Number(inv.written_off_amount || 0) > 0.005 ? 'WRITTEN_OFF' : 'PAID';
  const settled = Number(inv.amount_received || 0) + Number(inv.tds_deducted || 0) + Number(inv.credited_amount || 0)
    + Number(inv.discount_allowed || 0) + Number(inv.written_off_amount || 0);
  return settled > 0.005 ? 'PARTIALLY_PAID' : 'UNPAID';
};

/** Rate after the line discount. */
const netRate = (item) => round2(Number(item.rate) * (1 - Number(item.discount_percent || 0) / 100));

/** Value of an order line that is not invoiced yet, after discount, with GST. */
const uninvoicedValue = (item) => {
  const open = Math.max(0, Number(item.quantity) - Number(item.invoiced_qty || 0));
  return round2(open * netRate(item) * (1 + Number(item.gst_percent || 0) / 100));
};

async function exposure(clientId, customerId, { excludeOrderId = null, transaction } = {}) {
  const invoices = await ArInvoice.findAll({ where: { client_id: clientId, customer_id: customerId, status: OPEN_INVOICE }, transaction });
  const orders = await ArSalesOrder.findAll({
    where: { client_id: clientId, customer_id: customerId, status: OPEN_ORDER, ...(excludeOrderId ? { id: { [Op.ne]: excludeOrderId } } : {}) },
    include: [{ model: ArSalesOrderItem, as: 'items' }],
    transaction
  });
  const now = today();
  let outstanding = 0;
  let overdue = 0;
  let oldest = 0;
  for (const inv of invoices) {
    const due = outstandingOf(inv);
    outstanding += due;
    if (inv.due_date && inv.due_date < now && due > 0) {
      overdue += due;
      oldest = Math.max(oldest, daysBetween(inv.due_date, now));
    }
  }
  const openOrders = orders.reduce((s, o) => s + o.items.reduce((x, it) => x + uninvoicedValue(it), 0), 0);
  return { outstanding: round2(outstanding), overdue: round2(overdue), oldest_overdue_days: oldest, open_orders: round2(openOrders), open_invoice_count: invoices.length };
}

/** Credit check for one order. Returns { passed, reasons, ...figures } and is stored on the order. */
async function check(customer, order, { transaction } = {}) {
  const exp = await exposure(order.client_id, customer.id, { excludeOrderId: order.id, transaction });
  const limit = customer.credit_limit === null || customer.credit_limit === undefined ? null : Number(customer.credit_limit);
  const total = round2(order.total_amount);
  const after = round2(exp.outstanding + exp.open_orders + total);
  const reasons = [];
  if (customer.status === 'ON_HOLD') reasons.push(`Customer is on hold${customer.hold_reason ? `: ${customer.hold_reason}` : ''}`);
  if (limit !== null && after > limit) {
    reasons.push(`Over the credit limit: ${inr(exp.outstanding)} owed + ${inr(exp.open_orders)} on other orders + this order ${inr(total)} = ${inr(after)}, limit ${inr(limit)}`);
  }
  if (exp.oldest_overdue_days > OVERDUE_BLOCK_DAYS) {
    reasons.push(`An invoice is ${exp.oldest_overdue_days} days overdue (more than ${OVERDUE_BLOCK_DAYS}); ${inr(exp.overdue)} is past due`);
  }
  // Discounts above the agreed level need approval (blueprint O2C step 2).
  const items = order.items || await ArSalesOrderItem.findAll({ where: { order_id: order.id }, transaction });
  const bigDiscounts = items.filter((it) => Number(it.discount_percent || 0) > DISCOUNT_APPROVAL_PERCENT);
  if (bigDiscounts.length) {
    reasons.push(`Discount above ${DISCOUNT_APPROVAL_PERCENT}% needs approval: ${bigDiscounts.map((it) => `${it.description} ${Number(it.discount_percent)}%`).join(', ')}`);
  }
  return {
    passed: reasons.length === 0, reasons, checked_at: new Date().toISOString(), credit_limit: limit,
    outstanding: exp.outstanding, overdue: exp.overdue, oldest_overdue_days: exp.oldest_overdue_days,
    open_orders: exp.open_orders, order_total: total, exposure_after: after,
    available: limit === null ? null : round2(limit - exp.outstanding - exp.open_orders),
    release_needs: reasons.length ? neededLabel(total) : null
  };
}

/** Why this user may not release this held order, or null if they may. */
function releaseBlock(order, user) {
  if (order.created_by && Number(order.created_by) === Number(user.id)) return 'You raised this order, so someone else must release it';
  const limit = limitOf(user.role);
  if (limit === 0) return 'Your role does not release orders from credit hold';
  if (Number(order.total_amount) > limit) return `This order is ${inr(order.total_amount)}; releasing it needs ${neededLabel(order.total_amount)}`;
  return null;
}

/**
 * IGST when the customer's GSTIN is in a different state from every GSTIN of the company;
 * otherwise CGST + SGST in equal halves (also when either side has no GSTIN).
 */
async function gstSplit(clientId, customerGstin, taxAmount) {
  const tax = round2(taxAmount);
  if (!(tax > 0)) return { igst_amount: 0, cgst_amount: 0, sgst_amount: 0, inter_state: false };
  const ours = (await companyGstins(clientId).catch(() => [])).map((g) => g.slice(0, 2));
  const theirs = customerGstin && String(customerGstin).length === 15 ? String(customerGstin).slice(0, 2) : null;
  const interState = !!(theirs && ours.length && !ours.includes(theirs));
  if (interState) return { igst_amount: tax, cgst_amount: 0, sgst_amount: 0, inter_state: true };
  const half = round2(tax / 2);
  return { igst_amount: 0, cgst_amount: half, sgst_amount: round2(tax - half), inter_state: false };
}

/**
 * Suggested credit limit from the last 12 months: average monthly billing for the length of the
 * payment terms, scaled by how the customer has paid. A rule, not a model, so it can be explained.
 */
async function suggestLimit(clientId, customer) {
  const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const invoices = await ArInvoice.findAll({
    where: { client_id: clientId, customer_id: customer.id, status: { [Op.ne]: 'CANCELLED' }, invoice_date: { [Op.gte]: since } },
    include: [{ model: ArReceipt, as: 'receipts', attributes: ['received_date'] }]
  });
  if (!invoices.length) return { suggested: null, basis: 'No invoices in the last 12 months, so there is no history to suggest a limit from.' };
  const billed = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const first = invoices.reduce((d, i) => (i.invoice_date < d ? i.invoice_date : d), today());
  const months = Math.max(1, Math.min(12, Math.ceil(daysBetween(first, today()) / 30)));
  const monthly = billed / months;
  const now = today();
  const lateDays = invoices.filter((i) => i.due_date).map((i) => {
    if (i.status === 'PAID') {
      const last = i.receipts.reduce((d, r) => (r.received_date > d ? r.received_date : d), i.invoice_date);
      return Math.max(0, daysBetween(i.due_date, last));
    }
    return i.due_date < now ? daysBetween(i.due_date, now) : 0;
  });
  const avgLate = lateDays.length ? Math.round(lateDays.reduce((s, d) => s + d, 0) / lateDays.length) : 0;
  const factor = avgLate <= 5 ? 1.5 : avgLate <= 30 ? 1 : 0.5;
  const terms = Number(customer.payment_terms_days || 30);
  const suggested = Math.max(10000, Math.round((monthly * (terms / 30) * factor) / 10000) * 10000);
  const behaviour = avgLate <= 5 ? 'pays on time' : avgLate <= 30 ? `pays about ${avgLate} days late` : `pays about ${avgLate} days late, so the limit is halved`;
  return {
    suggested, monthly_billing: round2(monthly), average_days_late: avgLate, invoices: invoices.length,
    basis: `${invoices.length} invoice${invoices.length === 1 ? '' : 's'} in the last ${months} month${months === 1 ? '' : 's'}, about ${inr(monthly)} a month on ${terms}-day terms; the customer ${behaviour}.`
  };
}

module.exports = {
  OVERDUE_BLOCK_DAYS, DISCOUNT_APPROVAL_PERCENT, OPEN_INVOICE, OPEN_ORDER, outstandingOf, settledStatus, netRate, uninvoicedValue,
  exposure, check, releaseBlock, gstSplit, suggestLimit
};
