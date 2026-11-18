/** Client mirror of the LedgerLine role list. Server enforcement lives in server/config/rbac.js. */

export const LEDGERLINE_ROLES = [
  { code: 'ADMIN', name: 'Admin', order: 1 },
  { code: 'REQUESTER', name: 'Requester', order: 2 },
  { code: 'PROCUREMENT', name: 'Procurement', order: 3 },
  { code: 'MANAGER', name: 'Manager', order: 4 },
  { code: 'DIRECTOR_CFO', name: 'Director / CFO', order: 5 },
  { code: 'COMPLIANCE', name: 'Compliance', order: 6 },
  { code: 'WAREHOUSE', name: 'Warehouse', order: 7 },
  { code: 'FINANCE', name: 'Finance', order: 8 },
  { code: 'ACCOUNTS_PAYABLE', name: 'Accounts Payable', order: 9 },
  { code: 'ACCOUNTS_RECEIVABLE', name: 'Accounts Receivable', order: 10 },
  { code: 'MANAGEMENT', name: 'Management', order: 11 },
  { code: 'VENDOR', name: 'Vendor', order: 12 }
];

const PRIVILEGED = ['SUPER_ADMIN', 'PROVIDER_ADMIN', 'CLIENT_ADMIN', 'DEV_ADMIN', 'ADMIN'];

// AR pages follow the AR permission steps in server/config/rbac.js: Manager verifies customers and
// releases credit holds (Customers, Sales Orders), Warehouse dispatches and records proof of delivery
// (Sales Orders), Compliance reviews customers (Customers), and a Requester raises and follows their
// own quotations (Sales Orders), as with requisitions. Procurement (Customers) and Accounts Payable
// (Customer Invoices) can look but not change, for vendors that are also customers.
// Approvers (server AR_APPROVE): Manager decides credit notes up to ₹1,00,000 (Disputes & Credit
// Notes); the Director / CFO approves credit notes, write-offs and the credit-loss provision, signs off
// the AR close and reviews the ledger pages (R2R). Management reads all of them.
const NAV = {
  REQUESTER: ['/dashboard', '/procurement/requisition', '/procurement/ses', '/requests/my', '/requests/new', '/finance/ar/sales-orders', '/my-profile', '/security-settings'],
  PROCUREMENT: ['/dashboard', '/procurement/requisition', '/procurement/rfq', '/procurement/quotations', '/procurement/purchase-orders', '/procurement/purchase-returns', '/bill-approvals', '/procurement/ses', '/procurement/vendor-risk', '/procurement/reports', '/vendor-master', '/finance/ar/customers', '/my-profile', '/security-settings'],
  MANAGER: ['/dashboard', '/procurement/requisition', '/procurement/ses', '/bill-approvals', '/requests', '/finance/ar/customers', '/finance/ar/sales-orders', '/finance/ar/credit-notes', '/my-profile', '/security-settings'],
  DIRECTOR_CFO: ['/dashboard', '/procurement/requisition', '/procurement/purchase-orders', '/procurement/ses', '/bill-approvals', '/procurement/reports', '/finance/payment-processing', '/finance/msme-payments', '/finance/ap-management', '/finance/ap-accounting-entry', '/finance/ar/customers', '/finance/ar/sales-orders', '/finance/ar/customer-invoices', '/finance/ar/credit-notes', '/finance/ar/collections', '/finance/ar/credit-loss', '/finance/ar/ar-close', '/finance/ar/accounting-entry', '/finance/ar/record-to-report', '/finance/ar/chart-of-accounts', '/finance/ar/journal-entry', '/finance/ar/general-ledger', '/finance/ar/reconciliations', '/finance/ar/financial-statements', '/finance/ar/trial-balance', '/finance/ar/period-close', '/my-profile', '/security-settings'],
  COMPLIANCE: ['/dashboard', '/vendor-master', '/procurement/vendor-approvals', '/procurement/ses', '/procurement/vendor-risk', '/finance/ar/customers', '/my-profile', '/security-settings'],
  WAREHOUSE: ['/dashboard', '/procurement/requisition/in-house-stock', '/procurement/purchase-orders', '/procurement/grn', '/bill-approvals', '/procurement/purchase-returns', '/procurement/gate-entry', '/finance/ar/sales-orders', '/my-profile', '/security-settings'],
  FINANCE: ['/dashboard', '/finance', '/procurement/reports', '/procurement/invoices', '/bill-approvals', '/procurement/purchase-returns', '/procurement/ses', '/my-profile', '/security-settings'],
  ACCOUNTS_PAYABLE: ['/dashboard', '/procurement/invoices', '/bill-approvals', '/procurement/purchase-orders', '/procurement/grn', '/procurement/purchase-returns', '/procurement/ses', '/finance/three-way-match', '/finance/ap-accounting-entry', '/finance/ap-management', '/finance/payment-processing', '/finance/msme-payments', '/vendor-master', '/finance/ar/customer-invoices', '/my-profile', '/security-settings'],
  ACCOUNTS_RECEIVABLE: ['/dashboard', '/finance/ar', '/my-profile', '/security-settings'],
  MANAGEMENT: ['/dashboard', '/procurement/reports', '/procurement/ses', '/finance/ap-management', '/finance/msme-payments', '/finance/ap-accounting-entry', '/finance/ar/customer-invoices', '/finance/ar/customers', '/finance/ar/sales-orders', '/finance/ar/credit-notes', '/finance/ar/collections', '/finance/ar/credit-loss', '/finance/ar/ar-close', '/finance/ar/accounting-entry', '/finance/ar/record-to-report', '/finance/ar/chart-of-accounts', '/finance/ar/journal-entry', '/finance/ar/reconciliations', '/finance/ar/financial-statements', '/finance/ar/trial-balance', '/finance/ar/general-ledger', '/finance/ar/period-close', '/my-profile', '/security-settings'],
  VENDOR: ['/dashboard', '/procurement/purchase-orders', '/procurement/invoices', '/my-profile', '/security-settings']
};

export const roleCodeOf = (role) => String(role || '').toUpperCase().replace(/\s+/g, '_');

export const roleOrder = (role) => {
  const code = roleCodeOf(role?.code || role?.role_code || role?.name || role);
  const match = LEDGERLINE_ROLES.find((item) => item.code === code || item.name === (role?.name || role));
  return match ? match.order : 1000;
};

export const sortRoles = (roles) => (roles || []).slice().sort((a, b) => roleOrder(a) - roleOrder(b) || String(a.name || '').localeCompare(String(b.name || '')));

export const isLedgerRole = (role) => Boolean(NAV[roleCodeOf(role)]);

export const canSeePath = (role, path) => {
  const code = roleCodeOf(role);
  if (PRIVILEGED.includes(code)) return true;
  const prefixes = NAV[code];
  if (!prefixes) return true;
  const value = String(path || '/');
  if (value === '/' || value === '/dashboard') return true;
  return prefixes.some((prefix) => value === prefix || value.startsWith(prefix + '/') || value.startsWith(prefix));
};
