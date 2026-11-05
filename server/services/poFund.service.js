'use strict';
/**
 * Monthly purchase fund. An admin sets a limit per month (a month without its own limit uses the
 * latest earlier one). A PO uses the fund once it is approved, in the month it was approved; POs
 * still awaiting approval show as "awaiting approval" but do not reduce the balance yet. Unused
 * balance carries forward to the next month; an overspent month carries nothing forward.
 * Going over the limit is a warning only - it never blocks a PO.
 */
const { Op } = require('sequelize');
const { PoFundLimit, PurchaseOrder } = require('../models');

const APPROVED = ['APPROVED', 'ISSUED', 'PARTIAL_RECEIVED', 'RECEIVED', 'FULLY_RECEIVED', 'CLOSED'];
const AWAITING = ['SUBMITTED', 'PENDING_APPROVAL', 'IN_APPROVAL', 'PENDING_CONFIGURATION'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Months follow Indian time, so a PO approved at 1 AM on the 1st counts in the new month.
const monthOf = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 7);
const currentPeriod = () => monthOf(new Date());
const nextPeriod = (p) => {
  const [y, m] = p.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const isPeriod = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ''));

/**
 * Fund position for `period` (YYYY-MM, default this month). With `amount`, also what approving a PO
 * of that amount would leave.
 */
async function summary(clientId, { period, amount } = {}) {
  const target = isPeriod(period) ? period : currentPeriod();
  const limits = await PoFundLimit.findAll({ where: { client_id: clientId }, order: [['period', 'ASC']] });
  if (!limits.length) return { configured: false, period: target };

  const pos = await PurchaseOrder.findAll({
    where: { client_id: clientId, status: { [Op.in]: [...APPROVED, ...AWAITING] } },
    attributes: ['id', 'status', 'total_amount', 'approval_date', 'order_date', 'createdAt']
  });
  const usedBy = {};
  const countBy = {};
  let committed = 0;
  let committedCount = 0;
  for (const po of pos) {
    const amt = Number(po.total_amount || 0);
    if (AWAITING.includes(po.status)) { committed += amt; committedCount += 1; continue; }
    const m = monthOf(po.approval_date || po.order_date || po.createdAt);
    usedBy[m] = (usedBy[m] || 0) + amt;
    countBy[m] = (countBy[m] || 0) + 1;
  }

  const limitFor = (p) => {
    let found = null;
    for (const l of limits) { if (l.period <= p) found = l; else break; }
    return found;
  };

  // Walk month by month from the first limit to the target, carrying unused balance forward.
  const history = [];
  let carried = 0;
  for (let p = limits[0].period; p <= target; p = nextPeriod(p)) {
    const row = limitFor(p);
    const limit = Number(row.limit_amount || 0);
    const available = limit + carried;
    const used = usedBy[p] || 0;
    const balance = available - used;
    history.push({ period: p, limit: round2(limit), carried_in: round2(carried), available: round2(available), used: round2(used), approved_count: countBy[p] || 0, balance: round2(balance) });
    carried = Math.max(0, balance);
  }

  const cur = history[history.length - 1];
  if (!cur) {
    // Target month is before the first limit was set.
    return { configured: true, period: target, before_first_limit: true, first_period: limits[0].period };
  }
  const out = {
    configured: true,
    period: target,
    limit: cur.limit,
    carried_in: cur.carried_in,
    available: cur.available,
    used: cur.used,
    approved_count: cur.approved_count,
    balance: cur.balance,
    over_by: round2(Math.max(0, -cur.balance)),
    utilisation_pct: cur.available > 0 ? Math.round((cur.used / cur.available) * 1000) / 10 : null,
    // Awaiting approval counts only for the current month, since that is when it would be approved.
    awaiting_approval: target === currentPeriod() ? round2(committed) : 0,
    awaiting_count: target === currentPeriod() ? committedCount : 0,
    history: history.slice(-6).reverse(),
    limit_row: (() => { const r = limitFor(target); return r ? { period: r.period, limit_amount: Number(r.limit_amount), set_by_name: r.set_by_name, remarks: r.remarks, updated_at: r.updatedAt } : null; })()
  };
  out.balance_after_awaiting = round2(out.balance - out.awaiting_approval);
  if (amount != null && Number(amount) > 0) {
    const after = round2(out.balance - Number(amount));
    out.impact = { amount: round2(amount), balance_after: after, exceeds_by: round2(Math.max(0, -after)) };
  }
  return out;
}

module.exports = { summary, currentPeriod, isPeriod, APPROVED, AWAITING };
