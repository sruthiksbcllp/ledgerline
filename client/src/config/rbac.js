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

const NAV = {
  REQUESTER: ['/dashboard', '/procurement/requisition', '/procurement/ses', '/requests/my', '/requests/new', '/my-profile', '/security-settings'],
  PROCUREMENT: ['/dashboard', '/procurement/requisition', '/procurement/rfq', '/procurement/quotations', '/procurement/purchase-orders', '/procurement/ses', '/procurement/vendor-risk', '/procurement/reports', '/vendor-master', '/my-profile', '/security-settings'],
  MANAGER: ['/dashboard', '/procurement/requisition', '/procurement/ses', '/requests', '/my-profile', '/security-settings'],
  DIRECTOR_CFO: ['/dashboard', '/procurement/requisition', '/procurement/purchase-orders', '/procurement/ses', '/procurement/reports', '/finance/payment-processing', '/finance/ap-management', '/finance/ar/financial-statements', '/finance/ar/trial-balance', '/my-profile', '/security-settings'],
  COMPLIANCE: ['/dashboard', '/vendor-master', '/procurement/ses', '/procurement/vendor-risk', '/my-profile', '/security-settings'],
  WAREHOUSE: ['/dashboard', '/procurement/purchase-orders', '/procurement/grn', '/procurement/gate-entry', '/my-profile', '/security-settings'],
  FINANCE: ['/dashboard', '/finance', '/procurement/reports', '/procurement/invoices', '/procurement/ses', '/my-profile', '/security-settings'],
  ACCOUNTS_PAYABLE: ['/dashboard', '/procurement/invoices', '/procurement/purchase-orders', '/procurement/grn', '/procurement/ses', '/finance/three-way-match', '/finance/ap-accounting-entry', '/finance/ap-management', '/finance/payment-processing', '/vendor-master', '/my-profile', '/security-settings'],
  ACCOUNTS_RECEIVABLE: ['/dashboard', '/finance/ar', '/my-profile', '/security-settings'],
  MANAGEMENT: ['/dashboard', '/procurement/reports', '/procurement/ses', '/finance/ap-management', '/finance/ar/financial-statements', '/finance/ar/trial-balance', '/finance/ar/general-ledger', '/my-profile', '/security-settings'],
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
