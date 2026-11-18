'use strict';

/**
 * LedgerLine role catalogue. Names and order match the product role list.
 * Approval ceilings are read from the environment so they stay configurable.
 */

const PRIVILEGED_CODES = ['SUPER_ADMIN', 'PROVIDER_ADMIN', 'CLIENT_ADMIN', 'DEV_ADMIN'];

const ROLES = [
  { code: 'ADMIN', name: 'Admin', order: 1, level: 90, publicAssignable: true, description: 'Manage users, configuration, and every module.' },
  { code: 'REQUESTER', name: 'Requester', order: 2, level: 10, publicAssignable: true, description: 'Create and track own purchase requisitions.' },
  { code: 'PROCUREMENT', name: 'Procurement', order: 3, level: 30, publicAssignable: true, description: 'Source vendors, RFQs, quotations, and purchase orders.' },
  { code: 'MANAGER', name: 'Manager', order: 4, level: 40, publicAssignable: true, description: 'Approve requisitions within the configured limit.' },
  { code: 'DIRECTOR_CFO', name: 'Director / CFO', order: 5, level: 70, publicAssignable: true, description: 'Approve high-value orders and financial transactions.' },
  { code: 'COMPLIANCE', name: 'Compliance', order: 6, level: 35, publicAssignable: true, description: 'Review vendor compliance and audit trails.' },
  { code: 'WAREHOUSE', name: 'Warehouse', order: 7, level: 20, publicAssignable: true, description: 'Record goods receipts. Cannot authorise payment.' },
  { code: 'FINANCE', name: 'Finance', order: 8, level: 60, publicAssignable: true, description: 'Review journals, reconciliations, and payment approvals.' },
  { code: 'ACCOUNTS_PAYABLE', name: 'Accounts Payable', order: 9, level: 45, publicAssignable: true, description: 'Process invoices, matching, ageing, and payment proposals.' },
  { code: 'ACCOUNTS_RECEIVABLE', name: 'Accounts Receivable', order: 10, level: 45, publicAssignable: true, description: 'Manage customer invoices, collections, and AR ageing.' },
  { code: 'MANAGEMENT', name: 'Management', order: 11, level: 50, publicAssignable: true, description: 'Read-only dashboards, KPIs, and financial summaries.' },
  { code: 'VENDOR', name: 'Vendor', order: 12, level: 5, publicAssignable: true, description: 'View only this vendor’s orders, invoices, and payment status.' }
];

/**
 * The four access tiers people see (Super Admin, Company Admin, Manager, Employee). Each role code
 * above belongs to one tier; the role code still decides the exact module permissions.
 *   Super Admin   - platform owner: every company, company management (PROVIDER_ADMIN)
 *   Company Admin - full control of one company, its members and access requests (ADMIN)
 *   Manager       - approves and oversees work in the company (MANAGER, DIRECTOR_CFO, FINANCE, MANAGEMENT)
 *   Employee      - does day-to-day work within their function (REQUESTER, PROCUREMENT, AP, ...)
 */
const TIERS = [
  { code: 'SUPER_ADMIN', name: 'Super Admin', rank: 4, description: 'Owns the platform: every company and company management.' },
  { code: 'COMPANY_ADMIN', name: 'Company Admin', rank: 3, description: 'Full control of this company, its members and access requests.' },
  { code: 'MANAGER', name: 'Manager', rank: 2, description: 'Approves and oversees work in this company.' },
  { code: 'EMPLOYEE', name: 'Employee', rank: 1, description: 'Day-to-day work within their function.' }
];
const TIER_OF_ROLE = {
  PROVIDER_ADMIN: 'SUPER_ADMIN', DEV_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'COMPANY_ADMIN', SUPER_ADMIN: 'COMPANY_ADMIN', CLIENT_ADMIN: 'COMPANY_ADMIN',
  MANAGER: 'MANAGER', DIRECTOR_CFO: 'MANAGER', FINANCE: 'MANAGER', MANAGEMENT: 'MANAGER'
};
/** Tier code for a role code; anything not listed is an Employee role. */
const tierOf = (role) => TIER_OF_ROLE[String(role || '').toUpperCase().replace(/\s+/g, '_')] || 'EMPLOYEE';
/** Role given to someone whose request to join is approved without choosing a role. */
const DEFAULT_MEMBER_ROLE = 'REQUESTER';

const limitFromEnv = (name) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

/** null means no ceiling. Override with APPROVAL_LIMIT_<ROLE> in the environment. */
const APPROVAL_LIMITS = {
  MANAGER: limitFromEnv('APPROVAL_LIMIT_MANAGER') ?? 100000,
  FINANCE: limitFromEnv('APPROVAL_LIMIT_FINANCE') ?? 500000,
  DIRECTOR_CFO: limitFromEnv('APPROVAL_LIMIT_DIRECTOR_CFO'),
  ADMIN: null
};

/**
 * section -> { view, add, edit, delete }
 * checkPermission maps CREATE->add and APPROVE->edit.
 *
 * Accounts Receivable is split by order-to-cash step, so each login gets the step that mirrors its
 * AP job (routes/ar.routes.js):
 *   AR_CUSTOMER - customers (step 1). Verifying a customer needs view plus an approval limit.
 *   AR_ORDER    - quotations, sales orders, credit check (steps 2-3). Releasing a credit hold needs
 *                 view plus an approval limit covering the order (Manager / Finance / Director).
 *   AR_DELIVERY - dispatch and proof of delivery (step 4), done by Warehouse as it does GRNs.
 *   AR          - customer invoices, receipts, collections, accounting entries (steps 5-9).
 *   AR_APPROVE  - decides AR items within the person's limit: credit notes (approval limit), write-offs
 *                 (write-off limit), credit-loss provision and AR close sign-off (Finance / Director).
 *                 The controller always checks the limit and that the requester is someone else.
 *   R2R         - record to report on the ledger: view the GL, trial balance and statements; add =
 *                 prepare manual journals, reconciliations and close steps; edit = approve / review.
 */
const PERMISSIONS = {
  ADMIN: { '*': { view: true, add: true, edit: true, delete: true } },
  REQUESTER: {
    PR: { view: true, add: true, edit: true, delete: false },
    SES: { view: true, add: true, edit: false, delete: false },
    // AR mirror of raising a requisition: looks customers up and raises quotations, seeing only their
    // own (config/dataAccess.js). Accounts Receivable confirms a quotation as an order (AR_ORDER edit).
    AR_CUSTOMER: { view: true, add: false, edit: false, delete: false },
    AR_ORDER: { view: true, add: true, edit: false, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  PROCUREMENT: {
    PR: { view: true, add: false, edit: false, delete: false },
    RFQ: { view: true, add: true, edit: true, delete: false },
    PO: { view: true, add: true, edit: true, delete: false },
    SES: { view: true, add: true, edit: false, delete: false },
    VENDOR: { view: true, add: true, edit: true, delete: false },
    // Read-only customers, e.g. to spot a vendor that is also a customer
    AR_CUSTOMER: { view: true, add: false, edit: false, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  MANAGER: {
    PR: { view: true, add: false, edit: true, delete: false },
    SES: { view: true, add: false, edit: true, delete: false },
    // Approves within ₹1,00,000, as for requisitions: verifies customers and releases credit holds
    AR_CUSTOMER: { view: true, add: false, edit: false, delete: false },
    AR_ORDER: { view: true, add: false, edit: false, delete: false },
    AR_DELIVERY: { view: true, add: false, edit: false, delete: false },
    AR_APPROVE: { view: true, add: false, edit: false, delete: false }, // credit notes up to ₹1,00,000
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  DIRECTOR_CFO: {
    PR: { view: true, add: false, edit: true, delete: false },
    PO: { view: true, add: false, edit: true, delete: false },
    SES: { view: true, add: false, edit: true, delete: false },
    PAYMENT: { view: true, add: false, edit: true, delete: false },
    // Verifies customers and releases credit holds with no ceiling; puts customers on hold and takes them off
    AR_CUSTOMER: { view: true, add: false, edit: true, delete: false },
    AR_ORDER: { view: true, add: false, edit: false, delete: false },
    AR_DELIVERY: { view: true, add: false, edit: false, delete: false },
    AR: { view: true, add: false, edit: false, delete: false }, // read-only receivables for the AR & AP dashboard (config/dataAccess.js AR scope)
    // Approves credit notes and write-offs with no ceiling, the credit-loss provision, signs off the AR close
    AR_APPROVE: { view: true, add: false, edit: false, delete: false },
    R2R: { view: true, add: false, edit: true, delete: false }, // approves manual journals, reviews reconciliations, closes the period
    REPORT: { view: true, add: false, edit: false, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  COMPLIANCE: {
    // Onboards vendors (Add Vendor) and verifies their submitted details (Vendor Master → Approve)
    VENDOR: { view: true, add: true, edit: true, delete: false },
    // Reviews customers' GSTIN / PAN and their history, read-only
    AR_CUSTOMER: { view: true, add: false, edit: false, delete: false },
    AUDIT: { view: true, add: false, edit: false, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  WAREHOUSE: {
    PO: { view: true, add: false, edit: false, delete: false },
    GRN: { view: true, add: true, edit: true, delete: false },
    // Outward goods, as GRN is inward: dispatches against sales orders and records proof of delivery
    AR_ORDER: { view: true, add: false, edit: false, delete: false },
    AR_DELIVERY: { view: true, add: true, edit: true, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  FINANCE: {
    PR: { view: true, add: false, edit: true, delete: false },
    FINANCE: { view: true, add: true, edit: true, delete: false },
    SES: { view: true, add: false, edit: true, delete: false },
    PAYMENT: { view: true, add: false, edit: true, delete: false },
    AR_CUSTOMER: { view: true, add: true, edit: true, delete: false },
    AR_ORDER: { view: true, add: true, edit: true, delete: false },
    AR_DELIVERY: { view: true, add: false, edit: false, delete: false },
    AR: { view: true, add: true, edit: true, delete: false },
    // Credit notes up to ₹5,00,000, write-offs up to ₹1,00,000, credit-loss provision, AR close sign-off
    AR_APPROVE: { view: true, add: false, edit: false, delete: false },
    R2R: { view: true, add: true, edit: true, delete: false },
    REPORT: { view: true, add: false, edit: false, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  ACCOUNTS_PAYABLE: {
    PR: { view: true, add: false, edit: false, delete: false },
    PO: { view: true, add: false, edit: false, delete: false },
    GRN: { view: true, add: false, edit: false, delete: false },
    SES: { view: true, add: true, edit: false, delete: false },
    INVOICE: { view: true, add: true, edit: true, delete: false },
    PAYMENT: { view: true, add: true, edit: false, delete: false },
    VENDOR: { view: true, add: false, edit: false, delete: false },
    // Read-only customer invoices, e.g. when a vendor is also a customer and balances are netted
    AR: { view: true, add: false, edit: false, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  ACCOUNTS_RECEIVABLE: {
    AR_CUSTOMER: { view: true, add: true, edit: true, delete: false },
    AR_ORDER: { view: true, add: true, edit: true, delete: false },
    // Sees deliveries to invoice them; Warehouse records dispatch and proof of delivery (as AP cannot make GRNs)
    AR_DELIVERY: { view: true, add: false, edit: false, delete: false },
    AR: { view: true, add: true, edit: true, delete: false },
    // Prepares manual journals, reconciliations and close steps; never approves its own
    R2R: { view: true, add: true, edit: false, delete: false },
    REPORT: { view: true, add: false, edit: false, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  },
  MANAGEMENT: {
    DASHBOARD: { view: true, add: false, edit: false, delete: false },
    REPORT: { view: true, add: false, edit: false, delete: false },
    PR: { view: true, add: false, edit: false, delete: false },
    AR_CUSTOMER: { view: true, add: false, edit: false, delete: false },
    AR_ORDER: { view: true, add: false, edit: false, delete: false },
    AR_DELIVERY: { view: true, add: false, edit: false, delete: false },
    AR: { view: true, add: false, edit: false, delete: false },
    R2R: { view: true, add: false, edit: false, delete: false }, // reads the ledger, trial balance and statements
    FINANCE: { view: true, add: false, edit: false, delete: false }
  },
  VENDOR: {
    PO: { view: true, add: false, edit: false, delete: false },
    INVOICE: { view: true, add: true, edit: false, delete: false },
    DASHBOARD: { view: true, add: false, edit: false, delete: false }
  }
};

const normalize = (role) => String(role || '').toUpperCase().replace(/\s+/g, '_');

const findRole = (codeOrName) => {
  const key = normalize(codeOrName);
  return ROLES.find((role) => role.code === key || normalize(role.name) === key) || null;
};

const isPrivilegedCode = (role) => PRIVILEGED_CODES.includes(normalize(role));

const isReadOnlyRole = (role) => normalize(role) === 'MANAGEMENT';

const publicRoles = () => ROLES.filter((role) => role.publicAssignable);

const orderedRoles = () => ROLES.slice().sort((a, b) => a.order - b.order);

const roleAllows = (role, section, action) => {
  const code = normalize(role);
  if (isPrivilegedCode(code) || code === 'ADMIN') return true;
  const grants = PERMISSIONS[code];
  if (!grants) return false;
  const flags = grants['*'] || grants[String(section || '').toUpperCase()];
  if (!flags) return false;
  const key = { create: 'add', add: 'add', update: 'edit', edit: 'edit', approve: 'edit', manage: 'edit', delete: 'delete', remove: 'delete', view: 'view' }[String(action || '').toLowerCase()] || String(action || '').toLowerCase();
  return Boolean(flags[key]);
};

/**
 * Who may assign a target role. Public registration uses actor "PUBLIC".
 * Nobody can grant PROVIDER_ADMIN / DEV_ADMIN / SUPER_ADMIN / CLIENT_ADMIN except those roles.
 * Public registration can grant Admin. It cannot grant platform roles.
 */
const canAssignRole = (actorRole, targetCode) => {
  const actor = normalize(actorRole);
  const target = findRole(targetCode);
  const targetKey = target ? target.code : normalize(targetCode);
  if (actor === 'PUBLIC') return Boolean(target && target.publicAssignable);
  if (PRIVILEGED_CODES.includes(targetKey)) {
    return PRIVILEGED_CODES.includes(actor);
  }
  if (targetKey === 'ADMIN') {
    return actor === 'ADMIN' || PRIVILEGED_CODES.includes(actor);
  }
  if (actor === 'ADMIN' || PRIVILEGED_CODES.includes(actor)) return Boolean(target);
  return false;
};

const approvalLimitFor = (role) => {
  const code = normalize(role);
  if (!Object.prototype.hasOwnProperty.call(APPROVAL_LIMITS, code)) return null;
  return APPROVAL_LIMITS[code];
};

module.exports = {
  ROLES,
  PRIVILEGED_CODES,
  APPROVAL_LIMITS,
  PERMISSIONS,
  normalize,
  findRole,
  isPrivilegedCode,
  isReadOnlyRole,
  publicRoles,
  orderedRoles,
  roleAllows,
  canAssignRole,
  approvalLimitFor,
  TIERS,
  tierOf,
  DEFAULT_MEMBER_ROLE
};
