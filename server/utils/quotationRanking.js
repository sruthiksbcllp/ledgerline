'use strict';
/**
 * CR-P02 — pure quotation ranking. Ranks by all-in net_amount ascending (L1 = lowest).
 * Dense ranking: equal net_amount share the same label. Read-only; no persistence.
 * @param {Array} quotations  Sequelize instances or plain objects (need net_amount, currency, vendor_id)
 * @returns {{ ranked: Array, meta: { lowest_vendor_id: number|null, mixed_currency: boolean, count: number } }}
 */
function rankQuotations(quotations) {
  const list = (quotations || []).map(q => (typeof q.toJSON === 'function' ? q.toJSON() : { ...q }));
  const sorted = list.slice().sort((a, b) => Number(a.net_amount || 0) - Number(b.net_amount || 0));
  let rank = 0; let prevNet = null;
  for (const q of sorted) {
    const net = Number(q.net_amount || 0);
    if (prevNet === null || net !== prevNet) { rank += 1; prevNet = net; }
    q.rank = rank;
    q.rank_label = `L${rank}`;
    q.is_lowest = rank === 1;
  }
  const currencies = new Set(sorted.map(q => q.currency || 'INR'));
  return {
    ranked: sorted,
    meta: {
      lowest_vendor_id: sorted.length ? (sorted[0].vendor_id ?? null) : null,
      mixed_currency: currencies.size > 1,
      count: sorted.length
    }
  };
}
module.exports = { rankQuotations };
