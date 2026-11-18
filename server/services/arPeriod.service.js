'use strict';
/**
 * AR month lock (blueprint R2R step 1 "locked periods cannot receive back-dated entries", and the
 * AR close in O2C step 10). Once Accounts Receivable closes a month (CLOSED) or Finance / the
 * Director signs it off (SIGNED_OFF), no AR posting dated in that month is accepted: invoices,
 * receipts, credit notes, write-offs, ECL and unapplied cash. Reopening needs the Director / CFO or
 * an admin, with a reason. Accounts Payable postings are not affected.
 */
let models = null;
const m = () => models || (models = require('../models'));

const LOCKED = ['CLOSED', 'SIGNED_OFF'];
const periodOf = (date) => String(date instanceof Date ? date.toISOString() : date || new Date().toISOString()).slice(0, 7);
const monthLabel = (period) => {
  const [y, mo] = String(period).split('-').map(Number);
  return new Date(Date.UTC(y, (mo || 1) - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
/** Last calendar day of a YYYY-MM period. */
const monthEnd = (period) => {
  const [y, mo] = String(period).split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
};
const monthStart = (period) => `${period}-01`;

/** The close record of a month, or null. */
async function closeOf(clientId, period) {
  if (!clientId) return null;
  return m().ArPeriodClose.findOne({ where: { client_id: clientId, period } });
}

/** Why an AR posting dated `date` cannot be made, or null when the month is open. */
async function lockMessage(clientId, date) {
  const period = periodOf(date);
  const close = await closeOf(clientId, period);
  if (!close || !LOCKED.includes(close.status)) return null;
  const how = close.status === 'SIGNED_OFF' ? 'closed and signed off' : 'closed';
  return `Accounts Receivable for ${monthLabel(period)} is ${how}, so nothing dated in it can be posted. Use a date in an open month, or ask the Director / CFO to reopen ${monthLabel(period)}.`;
}

module.exports = { LOCKED, periodOf, monthLabel, monthStart, monthEnd, closeOf, lockMessage };
