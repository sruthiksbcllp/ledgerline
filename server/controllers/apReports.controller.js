'use strict';

/**
 * AP reports (Accounts Payable Management):
 *
 *   Cycle time  - for bills entered in a date range: received (email arrived) -> entered ->
 *                 approved -> paid, in hours per step; paid on time vs late against the due
 *                 date; by vendor and property; "touchless" share of inbox bills; bills stuck
 *                 waiting for approval.
 *   Exceptions  - open three-way-match exceptions now (how many, amount on hold, type, team, how
 *                 old); why (what went wrong, what the reviewer found); resolved in the range
 *                 (accepted, rejected, cleared by a later receipt, days to resolve); vendors with
 *                 the most exceptions raised in the range.
 *
 * Read-only. Dates the bill does not carry (old bills) come from the activity trail.
 */
const { Op } = require('sequelize');
const { Invoice, Vendor, Property, BillInboxItem, ApPayment, WorkflowEvent } = require('../models');
const { getClientId } = require('../utils/tenantFilter');
const rules = require('../services/billApproval.service');

const HOUR = 3600000;
const DAY = 86400000;
const TERMS_DAYS = 30; // due date when the bill has none: same default as the AP ledger
const LIMIT = 2000;
const APPROVED_STATUSES = ['APPROVED_FOR_PAYMENT', 'WAITING_FOR_PAYMENT'];

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const clientOf = (req) => getClientId(req) || req.user?.client_id || null;
const toDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const round = (n, dp = 1) => (n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp);
const money = (n) => Math.round(Number(n || 0) * 100) / 100;
/** Hours from a to b (never negative: a payment dated earlier the same day counts as 0). */
const hoursBetween = (a, b) => (a && b ? Math.max(0, (b.getTime() - a.getTime()) / HOUR) : null);

/** count, average and median of a list of hours (nulls skipped). */
function summarize(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return { count: 0, avg_hours: null, median_hours: null };
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { count: v.length, avg_hours: round(v.reduce((s, x) => s + x, 0) / v.length), median_hours: round(median) };
}

/** from / to (ISO timestamps from the browser); default the last 90 days. */
function rangeOf(query) {
  const to = toDate(query.to) || new Date();
  const from = toDate(query.from) || new Date(to.getTime() - 90 * DAY);
  if (from > to) return { error: 'The start date is after the end date' };
  return { from, to };
}

const idOf = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
function scopeOf(query) {
  const where = {};
  if (idOf(query.vendor_id)) where.vendor_id = idOf(query.vendor_id);
  if (idOf(query.property_id)) where.property_id = idOf(query.property_id);
  return where;
}

const include = [
  { model: Vendor, attributes: ['id', 'vendor_name'] },
  { model: Property, attributes: ['id', 'property_name'] }
];

async function filterOptions(clientId) {
  const [vendors, properties] = await Promise.all([
    Vendor.findAll({ where: { client_id: clientId }, attributes: ['id', 'vendor_name'], order: [['vendor_name', 'ASC']], limit: 2000 }).catch(() => []),
    Property.findAll({ where: { client_id: clientId }, attributes: ['id', 'property_name'], order: [['property_name', 'ASC']], limit: 500 }).catch(() => [])
  ]);
  return {
    vendors: vendors.map((v) => ({ id: v.id, name: v.vendor_name })),
    properties: properties.map((p) => ({ id: p.id, name: p.property_name }))
  };
}

/** First time each bill reached one of `statuses`, from the activity trail. Map id -> Date. */
async function trailTimes(ids, statuses, pick = 'first') {
  const out = new Map();
  if (!ids.length || !WorkflowEvent) return out;
  const rows = await WorkflowEvent.findAll({
    where: { module: 'INVOICE', reference_id: { [Op.in]: ids }, to_status: { [Op.in]: statuses } },
    attributes: ['reference_id', 'occurred_at'],
    order: [['occurred_at', 'ASC']],
    raw: true
  }).catch(() => []);
  rows.forEach((r) => {
    if (pick === 'first' && out.has(r.reference_id)) return;
    out.set(r.reference_id, toDate(r.occurred_at));
  });
  return out;
}

function dueOf(inv) {
  const printed = toDate(inv.due_date);
  if (printed) return printed;
  const billed = toDate(inv.invoice_date) || toDate(inv.createdAt);
  return billed ? new Date(billed.getTime() + TERMS_DAYS * DAY) : null;
}

function whereNow(inv, approvedAt) {
  if (inv.status === 'PAID') return 'Paid';
  if (inv.status === 'PARTIAL') return 'Part paid';
  if (inv.status === 'EXCEPTION') return `Exception: ${rules.STAGES[rules.stageOf(inv)]?.label || 'Finance review'}`;
  if (approvedAt || APPROVED_STATUSES.includes(inv.status)) return 'Approved, waiting for payment';
  return 'Waiting for approval';
}

const ATTRS = ['id', 'invoice_number', 'invoice_date', 'due_date', 'total_amount', 'status', 'source', 'vendor_id', 'property_id',
  'approved_at', 'payment_date', 'exception_stage', 'createdAt'];

/** Per-bill dates and step durations. `now` is passed in for testing. */
function billTimeline(inv, { inbox, lastPayment, approvedEvent, paidEvent }, now = new Date()) {
  const received = toDate(inbox?.received_at);
  const entered = toDate(inv.createdAt);
  const approved = toDate(inv.approved_at) || approvedEvent || null;
  const paid = inv.status === 'PAID' ? (toDate(inv.payment_date) || lastPayment || paidEvent || null) : null;
  const start = received || entered;
  const due = dueOf(inv);
  const daysLate = paid && due ? Math.round((paid.getTime() - due.getTime()) / DAY) : null;
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    vendor: inv.Vendor ? { id: inv.Vendor.id, name: inv.Vendor.vendor_name } : null,
    property: inv.Property ? { id: inv.Property.id, name: inv.Property.property_name } : null,
    amount: money(inv.total_amount),
    status: inv.status,
    where: whereNow(inv, approved),
    from_inbox: Boolean(inbox),
    touchless: Boolean(inbox?.auto_submitted),
    received_at: received,
    entered_at: entered,
    approved_at: approved,
    paid_at: paid,
    due_date: due,
    hours: {
      receive: received ? hoursBetween(received, entered) : null,
      approve: hoursBetween(entered, approved),
      pay: approved ? hoursBetween(approved, paid) : null,
      total: hoursBetween(start, paid),
      so_far: paid ? null : hoursBetween(start, now)
    },
    on_time: daysLate == null ? null : daysLate <= 0,
    days_late: daysLate != null && daysLate > 0 ? daysLate : 0
  };
}

function groupBy(rows, keyOf) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyOf(r);
    if (!k) return;
    if (!map.has(k.id)) map.set(k.id, { id: k.id, name: k.name, rows: [] });
    map.get(k.id).rows.push(r);
  });
  return [...map.values()].map((g) => ({
    id: g.id,
    name: g.name,
    bills: g.rows.length,
    amount: money(g.rows.reduce((s, r) => s + r.amount, 0)),
    approve_avg_hours: summarize(g.rows.map((r) => r.hours.approve)).avg_hours,
    pay_avg_hours: summarize(g.rows.map((r) => r.hours.pay)).avg_hours,
    total_avg_hours: summarize(g.rows.map((r) => r.hours.total)).avg_hours,
    paid: g.rows.filter((r) => r.paid_at).length,
    late: g.rows.filter((r) => r.on_time === false).length
  })).sort((a, b) => (b.total_avg_hours ?? -1) - (a.total_avg_hours ?? -1) || b.bills - a.bills);
}

async function timelinesFor(invoices, now) {
  const ids = invoices.map((i) => i.id);
  if (!ids.length) return [];
  const [inbox, payments, approvedEvents, paidEvents] = await Promise.all([
    BillInboxItem.findAll({ where: { invoice_id: { [Op.in]: ids } }, attributes: ['invoice_id', 'received_at', 'auto_submitted'], raw: true }).catch(() => []),
    ApPayment.findAll({ where: { invoice_id: { [Op.in]: ids } }, attributes: ['invoice_id', 'payment_date'], raw: true }).catch(() => []),
    trailTimes(ids, APPROVED_STATUSES, 'first'),
    trailTimes(ids, ['PAID'], 'last')
  ]);
  const inboxBy = new Map(inbox.map((r) => [r.invoice_id, r]));
  const lastPaymentBy = new Map();
  payments.forEach((p) => {
    const d = toDate(p.payment_date);
    if (d && (!lastPaymentBy.has(p.invoice_id) || d > lastPaymentBy.get(p.invoice_id))) lastPaymentBy.set(p.invoice_id, d);
  });
  return invoices.map((inv) => billTimeline(inv, {
    inbox: inboxBy.get(inv.id),
    lastPayment: lastPaymentBy.get(inv.id),
    approvedEvent: approvedEvents.get(inv.id),
    paidEvent: paidEvents.get(inv.id)
  }, now));
}

exports.cycleTime = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const range = rangeOf(req.query);
  if (range.error) return fail(res, 400, range.error);
  const stuckDays = Math.min(365, Math.max(1, Number.parseInt(req.query.stuck_days, 10) || 7));
  const scope = scopeOf(req.query);
  const now = new Date();

  const [bills, stuckBills, options] = await Promise.all([
    Invoice.findAll({
      where: { client_id: clientId, ...scope, status: { [Op.ne]: 'REJECTED' }, createdAt: { [Op.between]: [range.from, range.to] } },
      attributes: ATTRS, include, order: [['createdAt', 'DESC']], limit: LIMIT
    }),
    // Not approved yet, entered more than stuckDays ago (any date range)
    Invoice.findAll({
      where: { client_id: clientId, ...scope, status: { [Op.in]: ['UNPAID', 'EXCEPTION'] }, approved_at: null, createdAt: { [Op.lt]: new Date(now.getTime() - stuckDays * DAY) } },
      attributes: ATTRS, include, order: [['createdAt', 'ASC']], limit: 500
    }),
    filterOptions(clientId)
  ]);

  const rows = await timelinesFor(bills, now);
  const stuck = (await timelinesFor(stuckBills, now)).map((r) => ({ ...r, waiting_days: Math.floor((r.hours.so_far || 0) / 24) }));
  const inbox = rows.filter((r) => r.from_inbox);
  const paidWithDue = rows.filter((r) => r.on_time != null);
  const late = paidWithDue.filter((r) => r.on_time === false);

  return res.json({
    success: true,
    data: {
      range: { from: range.from, to: range.to },
      truncated: bills.length >= LIMIT,
      summary: {
        bills: rows.length,
        amount: money(rows.reduce((s, r) => s + r.amount, 0)),
        paid: rows.filter((r) => r.paid_at).length,
        steps: {
          receive: summarize(rows.map((r) => r.hours.receive)),
          approve: summarize(rows.map((r) => r.hours.approve)),
          pay: summarize(rows.map((r) => r.hours.pay)),
          total: summarize(rows.map((r) => r.hours.total))
        },
        on_time: {
          paid_with_due: paidWithDue.length,
          on_time: paidWithDue.length - late.length,
          late: late.length,
          avg_days_late: late.length ? round(late.reduce((s, r) => s + r.days_late, 0) / late.length) : null
        },
        touchless: { inbox_bills: inbox.length, auto_submitted: inbox.filter((r) => r.touchless).length }
      },
      by_vendor: groupBy(rows, (r) => r.vendor),
      by_property: groupBy(rows, (r) => r.property),
      bills: rows,
      stuck_days: stuckDays,
      stuck,
      filters: options
    }
  });
};

// ---------------------------------------------------------------- exceptions

const TYPE_LABELS = {
  PRICE: 'Price higher than the PO',
  QUANTITY: 'Billed more than received',
  OTHER: 'Other (total, PO or receipt)'
};
const AGE_BUCKETS = [
  { key: '0-2', label: '0–2 days', max: 2 },
  { key: '3-7', label: '3–7 days', max: 7 },
  { key: '8-15', label: '8–15 days', max: 15 },
  { key: '15+', label: 'Over 15 days', max: Infinity }
];
const bucketOf = (days) => AGE_BUCKETS.find((b) => days <= b.max).key;

const typeOf = (inv) => inv.exception_type || rules.exceptionTypeOf({ blocked_reason: inv.matching_exception_details || inv.payment_block_reason || '' });

/** How an ended exception ended. */
function outcomeOf(inv) {
  if (inv.status === 'REJECTED' || inv.exception_status === 'REJECTED') return 'REJECTED';
  if (inv.exception_status === 'MANUAL_APPROVED') return 'ACCEPTED';
  return 'CLEARED';
}
const OUTCOME_LABELS = { ACCEPTED: 'Accepted by Finance', REJECTED: 'Rejected', CLEARED: 'Cleared by itself (receipt or PO updated)' };

function tally(rows, keyOf, labelOf) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyOf(r);
    const cur = map.get(k) || { key: k, label: labelOf(k), count: 0, amount: 0 };
    cur.count += 1;
    cur.amount = money(cur.amount + r.amount);
    map.set(k, cur);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}

const EX_ATTRS = ['id', 'invoice_number', 'total_amount', 'status', 'vendor_id', 'property_id', 'exception_status', 'exception_type',
  'exception_stage', 'exception_reason_code', 'exception_review_note', 'exception_reviewed_at', 'exception_raised_at',
  'exception_resolved_at', 'matching_exception_details', 'payment_block_reason', 'createdAt'];

function exceptionRow(inv, now = new Date()) {
  const raised = toDate(inv.exception_raised_at) || toDate(inv.createdAt);
  const type = typeOf(inv);
  const stage = rules.stageOf(inv);
  const ageDays = raised ? Math.max(0, Math.floor((now.getTime() - raised.getTime()) / DAY)) : 0;
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    vendor: inv.Vendor ? { id: inv.Vendor.id, name: inv.Vendor.vendor_name } : null,
    property: inv.Property ? { id: inv.Property.id, name: inv.Property.property_name } : null,
    amount: money(inv.total_amount),
    type,
    type_label: TYPE_LABELS[type] || type,
    stage,
    stage_label: rules.STAGES[stage]?.label || stage,
    problem: inv.matching_exception_details || inv.payment_block_reason || null,
    reason_code: inv.exception_reason_code || null,
    reason_label: inv.exception_reason_code ? rules.reasonLabel(inv.exception_reason_code) : null,
    review_note: inv.exception_review_note || null,
    raised_at: raised,
    resolved_at: toDate(inv.exception_resolved_at),
    age_days: ageDays,
    bucket: bucketOf(ageDays)
  };
}

exports.exceptions = async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const range = rangeOf(req.query);
  if (range.error) return fail(res, 400, range.error);
  const scope = scopeOf(req.query);
  const now = new Date();
  const base = { client_id: clientId, ...scope };

  const [openInv, resolvedInv, raisedInv, options] = await Promise.all([
    Invoice.findAll({ where: { ...base, status: 'EXCEPTION', exception_status: 'OPEN' }, attributes: EX_ATTRS, include, order: [['exception_raised_at', 'ASC'], ['createdAt', 'ASC']], limit: LIMIT }),
    Invoice.findAll({
      where: { ...base, exception_raised_at: { [Op.ne]: null }, exception_resolved_at: { [Op.between]: [range.from, range.to] }, status: { [Op.ne]: 'EXCEPTION' } },
      attributes: EX_ATTRS, include, order: [['exception_resolved_at', 'DESC']], limit: LIMIT
    }),
    Invoice.findAll({ where: { ...base, exception_raised_at: { [Op.between]: [range.from, range.to] } }, attributes: EX_ATTRS, include, limit: LIMIT }),
    filterOptions(clientId)
  ]);

  const open = openInv.map((i) => exceptionRow(i, now));
  const resolved = resolvedInv.map((i) => {
    const r = exceptionRow(i, now);
    const outcome = outcomeOf(i);
    return { ...r, outcome, outcome_label: OUTCOME_LABELS[outcome], days_to_resolve: r.resolved_at && r.raised_at ? round((r.resolved_at - r.raised_at) / DAY) : null };
  });
  const raised = raisedInv.map((i) => exceptionRow(i, now));
  const openIds = new Set(open.map((r) => r.id));
  const resolveDays = resolved.map((r) => r.days_to_resolve).filter((d) => d != null);

  const vendors = tally(raised.filter((r) => r.vendor), (r) => r.vendor.id, () => null).slice(0, 10).map((t) => {
    const mine = raised.filter((r) => r.vendor?.id === t.key);
    return { id: t.key, name: mine[0].vendor.name, raised: t.count, amount: t.amount, open_now: mine.filter((r) => openIds.has(r.id)).length, price: mine.filter((r) => r.type === 'PRICE').length, quantity: mine.filter((r) => r.type === 'QUANTITY').length };
  });

  return res.json({
    success: true,
    data: {
      range: { from: range.from, to: range.to },
      open: {
        count: open.length,
        amount: money(open.reduce((s, r) => s + r.amount, 0)),
        oldest_days: open.reduce((m, r) => Math.max(m, r.age_days), 0),
        by_type: tally(open, (r) => r.type, (k) => TYPE_LABELS[k] || k),
        by_stage: tally(open, (r) => r.stage, (k) => rules.STAGES[k]?.label || k),
        by_age: AGE_BUCKETS.map((b) => {
          const inB = open.filter((r) => r.bucket === b.key);
          return { key: b.key, label: b.label, count: inB.length, amount: money(inB.reduce((s, r) => s + r.amount, 0)) };
        }),
        by_reason: tally(open, (r) => r.reason_code || 'NOT_REVIEWED', (k) => (k === 'NOT_REVIEWED' ? 'Not reviewed yet' : rules.reasonLabel(k))),
        rows: [...open].sort((a, b) => b.age_days - a.age_days)
      },
      resolved: {
        count: resolved.length,
        by_outcome: tally(resolved, (r) => r.outcome, (k) => OUTCOME_LABELS[k]),
        by_reason: tally(resolved.filter((r) => r.reason_code), (r) => r.reason_code, (k) => rules.reasonLabel(k)),
        avg_days_to_resolve: resolveDays.length ? round(resolveDays.reduce((s, d) => s + d, 0) / resolveDays.length) : null,
        rows: resolved
      },
      raised: {
        count: raised.length,
        by_type: tally(raised, (r) => r.type, (k) => TYPE_LABELS[k] || k),
        top_vendors: vendors
      },
      filters: options
    }
  });
};

// For tests
exports._internal = { summarize, rangeOf, billTimeline, exceptionRow, outcomeOf, bucketOf, groupBy };
