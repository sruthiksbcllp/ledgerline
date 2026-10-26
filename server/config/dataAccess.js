'use strict';

/**
 * What data each role may SEE inside the company it is working in (tenant isolation between
 * companies is separate and always applies first).
 *
 *   all    - every record of this kind in the company
 *   own    - only records the user raised (e.g. a Requester's own purchase requisitions)
 *   vendor - only records of the vendor the user belongs to (users.vendor_id)
 *   (absent) - none: list and detail requests are refused
 *
 * Company Admins (ADMIN / CLIENT_ADMIN / SUPER_ADMIN) and the platform Super Admin see everything.
 * Keep this in step with config/rbac.js PERMISSIONS (what each role may DO) and the client
 * navigation in client/src/config/rbac.js.
 */
const { isPrivilegedCode } = require('./rbac');

const READ_SCOPES = {
  // Purchase requisitions
  PR: {
    REQUESTER: 'own',
    PROCUREMENT: 'all', MANAGER: 'all', DIRECTOR_CFO: 'all', FINANCE: 'all',
    ACCOUNTS_PAYABLE: 'all', COMPLIANCE: 'all', MANAGEMENT: 'all'
  },
  // Purchase orders (and their print / approval status)
  PO: {
    PROCUREMENT: 'all', DIRECTOR_CFO: 'all', WAREHOUSE: 'all', ACCOUNTS_PAYABLE: 'all',
    FINANCE: 'all', COMPLIANCE: 'all', MANAGEMENT: 'all',
    VENDOR: 'vendor'
  },
  // Goods receipts and gate entries
  GRN: {
    WAREHOUSE: 'all', ACCOUNTS_PAYABLE: 'all', PROCUREMENT: 'all', FINANCE: 'all',
    DIRECTOR_CFO: 'all', MANAGEMENT: 'all'
  },
  // Service entry sheets (service receipts against POs). Requesters (own) see the ones they recorded
  // and those on POs raised from their own requisitions, so they can confirm the service.
  SES: {
    REQUESTER: 'own', PROCUREMENT: 'all', MANAGER: 'all', DIRECTOR_CFO: 'all', FINANCE: 'all',
    ACCOUNTS_PAYABLE: 'all', COMPLIANCE: 'all', MANAGEMENT: 'all',
    VENDOR: 'vendor'
  },
  // Vendor invoices / accounts payable (Invoice Processing, AI invoices, 3-way match, payments)
  INVOICE: {
    ACCOUNTS_PAYABLE: 'all', FINANCE: 'all', DIRECTOR_CFO: 'all', MANAGER: 'all',
    COMPLIANCE: 'all', MANAGEMENT: 'all', PROCUREMENT: 'all',
    VENDOR: 'vendor'
  },
  // RFQs and quotations
  RFQ: {
    PROCUREMENT: 'all', FINANCE: 'all', DIRECTOR_CFO: 'all', COMPLIANCE: 'all', MANAGEMENT: 'all'
  },
  // Customer invoices, receipts, reminders
  AR: {
    ACCOUNTS_RECEIVABLE: 'all', FINANCE: 'all', DIRECTOR_CFO: 'all', MANAGEMENT: 'all'
  },
  // Vendor master. Most roles need to look vendors up (requisitions, invoices, GRNs); a vendor's
  // own login only ever sees its own vendor record.
  VENDOR: {
    REQUESTER: 'all', PROCUREMENT: 'all', MANAGER: 'all', DIRECTOR_CFO: 'all', COMPLIANCE: 'all',
    WAREHOUSE: 'all', FINANCE: 'all', ACCOUNTS_PAYABLE: 'all', ACCOUNTS_RECEIVABLE: 'all', MANAGEMENT: 'all',
    VENDOR: 'vendor'
  },
  // The company's user directory (names for approvers, requestors, assignees)
  USERS: {
    REQUESTER: 'all', PROCUREMENT: 'all', MANAGER: 'all', DIRECTOR_CFO: 'all', COMPLIANCE: 'all',
    WAREHOUSE: 'all', FINANCE: 'all', ACCOUNTS_PAYABLE: 'all', ACCOUNTS_RECEIVABLE: 'all', MANAGEMENT: 'all'
  }
};

const RESOURCES = Object.keys(READ_SCOPES);
const ADMIN_ROLES = ['ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'];

const norm = (v) => String(v || '').toUpperCase().replace(/\s+/g, '_');

/** 'all' | 'own' | 'vendor' | 'none' */
const readScope = (role, resource) => {
  const code = norm(role);
  if (ADMIN_ROLES.includes(code) || isPrivilegedCode(code)) return 'all';
  return (READ_SCOPES[norm(resource)] || {})[code] || 'none';
};

/** Every resource's scope for a role, for the client. */
const readScopesFor = (role) => Object.fromEntries(RESOURCES.map((r) => [r, readScope(role, r)]));

module.exports = { READ_SCOPES, RESOURCES, readScope, readScopesFor };
