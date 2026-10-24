import axios from "axios";
export { safeApiCall } from "./apiUtils";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true
});

const getDirectApiBase = () => {
  const explicitBase = import.meta.env.VITE_API_DIRECT_URL?.trim();
  if (explicitBase) return explicitBase;

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    // Docker compose publishes the backend on 5001 while local Vite dev
    // continues to proxy to 5000.
    const backendPort = port === "8080" ? "5001" : "5000";
    return `${protocol}//${hostname}:${backendPort}/api`;
  }

  return "http://127.0.0.1:5000/api";
};

const getAuthToken = () =>
  localStorage.getItem("token") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("authToken") ||
  "";

const setAuthToken = (token) => {
  if (!token) return;
  localStorage.setItem("token", token);
  localStorage.setItem("accessToken", token);
  localStorage.setItem("authToken", token);
};

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

// Detect subdomain from browser hostname (e.g. abc.fixtag.in → abc)
const getSubdomain = () => {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  // Only treat as subdomain if pattern is X.fixtag.in (3 parts) and not www/app
  if (parts.length === 3 && !['www', 'app', 'stage'].includes(parts[0])) {
    return parts[0];
  }
  return '';
};

// Attach token automatically and enforce auth
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Forward subdomain so backend can resolve tenant before login
  const subdomain = getSubdomain();
  if (subdomain) {
    config.headers['X-Subdomain'] = subdomain;
  }

  // Forward active company for multi-company support
  const companyId = localStorage.getItem('fixtag_company_id');
  if (companyId) {
    config.headers['x-company-id'] = companyId;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error?.response?.status;
    const code = error?.code;

    // Retry once with direct backend URL for proxy/network flake
    if (!original.__retryDirect && (code === "ERR_NETWORK" || code === "ECONNABORTED")) {
      original.__retryDirect = true;
      original.baseURL = getDirectApiBase();
      const token = getAuthToken();
      original.headers = original.headers || {};
      if (token) original.headers.Authorization = `Bearer ${token}`;
      return api.request(original);
    }

    // If auth failed, try refresh-token flow once
    if (status === 401 && !original.__retryAuth) {
      original.__retryAuth = true;

      // Avoid refresh loop for auth endpoints
      if (String(original.url || "").includes("/auth/refresh-token")) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (!newToken) {
              reject(error);
              return;
            }
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(api.request(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const refreshRes = await axios.post(
          `${import.meta.env.VITE_API_URL || "/api"}/auth/refresh-token`,
          {},
          { withCredentials: true }
        );

        const newToken =
          refreshRes?.data?.data?.accessToken ||
          refreshRes?.data?.accessToken ||
          "";

        if (!newToken) {
          onRefreshed(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem("token");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("authToken");
            window.location.href = "/login";
          }
          return Promise.reject(error);
        }

        setAuthToken(newToken);
        // The renewed session can differ from the stored one: a Company Admin changed this
        // person's role, or removed them from the company. Never carry on silently in the old context.
        const renewedUser = refreshRes?.data?.data?.user;
        if (renewedUser && typeof window !== "undefined") {
          let previous = null;
          try { previous = JSON.parse(localStorage.getItem("user") || "null"); } catch { previous = null; }
          localStorage.setItem("user", JSON.stringify(renewedUser));
          if (renewedUser.client_name) localStorage.setItem("client_name", renewedUser.client_name);
          const noWorkspace = !renewedUser.client_id && !renewedUser.platform_view;
          const companyChanged = previous && Number(previous.client_id || 0) !== Number(renewedUser.client_id || 0);
          const roleChanged = previous && String(previous.role || "") !== String(renewedUser.role || "");
          if ((noWorkspace || companyChanged) && !window.location.pathname.startsWith("/select-company")) {
            onRefreshed(null);
            localStorage.removeItem("fixtag_company_id");
            window.location.assign("/select-company?notice=access-changed");
            return Promise.reject(error);
          }
          if (roleChanged) {
            onRefreshed(null);
            window.location.reload(); // menus and screens follow the new role
            return Promise.reject(error);
          }
        }
        onRefreshed(newToken);

        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      } catch (refreshError) {
        onRefreshed(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("authToken");
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
