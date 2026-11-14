'use strict';

/**
 * Bill approval by amount, and routing of three-way-match exceptions to the right people.
 *
 * Approval: a bill can be approved only by someone whose approval limit covers its total (the
 * same limits as PRs, POs and service entry sheets: config/rbac.js APPROVAL_LIMITS, e.g. Manager
 * Rs 1,00,000, Finance Rs 5,00,000, Director/CFO no ceiling), and never by the person who
 * submitted it.
 *
 * Exceptions (P2P spec: Procurement review -> Finance review -> approve / reject):
 *   rate above the PO price          -> PROCUREMENT_REVIEW (the buyers)
 *   billed more than received / none -> RECEIPT_REVIEW     (Warehouse, who record receipts; Procurement)
 *   anything else                    -> FINANCE_REVIEW
 * The reviewer records a reason code and sends it on to Finance, who accepts it (the bill then
 * goes for approval by amount) or rejects the bill. Finance may decide before the review if needed.
 */
const { APPROVAL_LIMITS, isPrivilegedCode, normalize } = require('../config/rbac');

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const isAdmin = (role) => normalize(role) === 'ADMIN' || isPrivilegedCode(role);

const ROLE_LABEL = { MANAGER: 'Manager', FINANCE: 'Finance', DIRECTOR_CFO: 'Director / CFO' };

/** The approval limit of a role: Infinity for no ceiling, 0 when the role does not approve bills. */
function limitOf(role) {
  if (isAdmin(role)) return Infinity;
  const code = normalize(role);
  if (!Object.prototype.hasOwnProperty.call(APPROVAL_LIMITS, code) || code === 'ADMIN') return 0;
  const limit = APPROVAL_LIMITS[code];
  return limit === null || limit === undefined ? Infinity : Number(limit);
}

/** Approver levels, lowest limit first: [{ role, label, limit }]. */
function levels() {
  return Object.keys(APPROVAL_LIMITS)
    .filter((code) => code !== 'ADMIN')
    .map((code) => ({ role: code, label: ROLE_LABEL[code] || code, limit: limitOf(code) }))
    .sort((a, b) => a.limit - b.limit);
}

/** Who can approve a bill of this total, e.g. "Finance (up to ₹5,00,000) or above". */
function neededLabel(total) {
  const level = levels().find((l) => Number(total || 0) <= l.limit);
  if (!level) return 'an admin';
  return level.limit === Infinity ? level.label : `${level.label} (up to ${inr(level.limit)}) or above`;
}

/** Why this user may not approve this bill, or null if they may. */
function approvalBlock(invoice, user) {
  if (invoice.submitted_by && Number(invoice.submitted_by) === Number(user.id)) {
    return 'You submitted this bill, so someone else must approve it';
  }
  const limit = limitOf(user.role);
  const total = Number(invoice.total_amount || 0);
  if (limit === 0) return `Your role does not approve bills. It needs ${neededLabel(total)}`;
  if (total > limit) return `${inr(total)} is above your approval limit of ${inr(limit)}. It needs ${neededLabel(total)}`;
  return null;
}

// ── Exceptions ────────────────────────────────────────────────────────────

const STAGES = {
  PROCUREMENT_REVIEW: { label: 'Procurement review', roles: ['PROCUREMENT'] },
  RECEIPT_REVIEW: { label: 'Receipt check (Warehouse)', roles: ['WAREHOUSE', 'PROCUREMENT'] },
  FINANCE_REVIEW: { label: 'Finance review', roles: ['FINANCE', 'DIRECTOR_CFO'] }
};
const DECIDERS = ['FINANCE', 'DIRECTOR_CFO'];

const REASONS = {
  PROCUREMENT_REVIEW: [
    { code: 'AMEND_PO', label: 'Price was agreed: the PO will be amended' },
    { code: 'VENDOR_CREDIT_NOTE', label: 'Vendor to send a credit note for the difference' },
    { code: 'SHORT_PAY', label: 'Pay the PO price only (short-pay, debit note to vendor)' },
    { code: 'ACCEPT_VARIANCE', label: 'Accept the difference' },
    { code: 'REJECT_BILL', label: 'Reject: vendor to reissue the bill' }
  ],
  RECEIPT_REVIEW: [
    { code: 'NOT_RECEIVED', label: 'Goods / service not received' },
    { code: 'SHORT_RECEIVED', label: 'Fewer received than billed' },
    { code: 'RETURNED', label: 'Goods were returned to the vendor' },
    { code: 'RECEIVED_OK', label: 'Received in full (the receipt will be recorded)' }
  ],
  FINANCE_REVIEW: [
    { code: 'ACCEPT', label: 'Accept: send the bill for approval' },
    { code: 'REJECT', label: 'Reject the bill' }
  ]
};
const reasonLabel = (code) => Object.values(REASONS).flat().find((r) => r.code === code)?.label || code;

/** PRICE when a line's rate is above the PO price, QUANTITY when more is billed than received, else OTHER. */
function exceptionTypeOf(match) {
  const issues = Array.isArray(match?.issues) ? match.issues : String(match?.blocked_reason || '').split('; ');
  if (issues.some((i) => /rate .* vs PO/i.test(i))) return 'PRICE';
  if (issues.some((i) => /received/i.test(i))) return 'QUANTITY';
  return 'OTHER';
}

const STAGE_FOR = { PRICE: 'PROCUREMENT_REVIEW', QUANTITY: 'RECEIPT_REVIEW', OTHER: 'FINANCE_REVIEW' };

/** Routing fields for a match result (cleared when the bill matches). */
function routingFor(match) {
  const matched = match && match.status === 'MATCHED';
  const type = matched ? null : exceptionTypeOf(match);
  return {
    exception_type: type,
    exception_stage: type ? STAGE_FOR[type] : null,
    exception_reason_code: null,
    exception_review_note: null,
    exception_reviewed_by: null,
    exception_reviewed_at: null
  };
}

/** The stage an open exception is at (older exceptions, from before routing, are with Finance). */
const stageOf = (invoice) => invoice.exception_stage || 'FINANCE_REVIEW';

/** Whether this user reviews the exception at its current stage. */
const reviewsStage = (invoice, user) => isAdmin(user.role) || STAGES[stageOf(invoice)].roles.includes(normalize(user.role));

/** Whether this user may take Finance's decision (accept / reject) on an exception. */
const decides = (user) => isAdmin(user.role) || DECIDERS.includes(normalize(user.role));

module.exports = {
  limitOf, levels, neededLabel, approvalBlock, isAdmin,
  STAGES, REASONS, reasonLabel, exceptionTypeOf, routingFor, stageOf, reviewsStage, decides
};
