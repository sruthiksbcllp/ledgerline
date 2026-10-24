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

export const TIER_STYLE = {
  SUPER_ADMIN: { color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', label: 'Super Admin' },
  COMPANY_ADMIN: { color: '#2563eb', bg: 'rgba(37,99,235,0.10)', label: 'Company Admin' },
  MANAGER: { color: '#0f766e', bg: 'rgba(15,118,110,0.10)', label: 'Manager' },
  EMPLOYEE: { color: '#475569', bg: 'rgba(71,85,105,0.10)', label: 'Employee' },
};
