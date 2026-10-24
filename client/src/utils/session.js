// Session helpers shared by the login flow, the company picker and the API client.
// A session is bound to one company: user.client_id (null = no company chosen / none available).

const TOKEN_KEYS = ['token', 'accessToken', 'authToken'];

export const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
};

/** Saves the token and the session user (company name included) for the rest of the app. */
export const storeSession = (token, user) => {
  if (token) TOKEN_KEYS.forEach((k) => localStorage.setItem(k, token));
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
    const name = user.client_name || '';
    if (name) {
      localStorage.setItem('client_name', name);
      localStorage.setItem('tenant_name', name);
    } else {
      localStorage.removeItem('client_name');
      localStorage.removeItem('tenant_name');
    }
  }
};

/** True when the session is inside a company, or a Super Admin is in the platform view. */
export const hasWorkspace = (user) => Boolean(user && (user.client_id || user.platform_view));

/** Leaves the current company so no data from it stays in memory, then opens the target page. */
export const reloadInto = (path = '/') => {
  // Company-specific selections from the previous company must not leak into the next one.
  localStorage.removeItem('fixtag_company_id');
  window.location.assign(path);
};

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'];
const isAdminRole = (user) => ADMIN_ROLES.includes(String(user?.role || '').toUpperCase());

/**
 * May this session see a kind of data? resource: PR, PO, GRN, INVOICE, RFQ, AR, VENDOR, USERS.
 * Mirrors server/config/dataAccess.js (the server enforces it; this only hides what would be refused).
 * Sessions from before permissions were sent (no data_access) keep the old behaviour.
 */
export const canSee = (user, resource) => {
  if (!user) return false;
  if (isAdminRole(user) || !user.data_access) return true;
  return (user.data_access[resource] || 'none') !== 'none';
};

/** 'all' | 'own' | 'vendor' | 'none' */
export const seeScope = (user, resource) => {
  if (isAdminRole(user) || !user?.data_access) return 'all';
  return user.data_access[resource] || 'none';
};

/** May this session perform an action (VIEW / ADD / EDIT / DELETE) in a module? */
export const hasPerm = (user, module, action = 'VIEW') => {
  if (!user) return false;
  if (isAdminRole(user)) return true;
  if (!Array.isArray(user.permissions)) return false;
  return user.permissions.some((p) => p.module === String(module).toUpperCase() && p.action === String(action).toUpperCase());
};

export const TIER_STYLE = {
  SUPER_ADMIN: { color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', label: 'Super Admin' },
  COMPANY_ADMIN: { color: '#2563eb', bg: 'rgba(37,99,235,0.10)', label: 'Company Admin' },
  MANAGER: { color: '#0f766e', bg: 'rgba(15,118,110,0.10)', label: 'Manager' },
  EMPLOYEE: { color: '#475569', bg: 'rgba(71,85,105,0.10)', label: 'Employee' },
};
