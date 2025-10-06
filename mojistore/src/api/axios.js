// mojistore/src/api/axios.js
import axios from "axios";

/**
 * We normalize all request URLs so they hit /api/... on the same origin,
 * regardless of how individual calls were written in the app.
 *
 * Examples handled:
 *   "filters"           -> "/api/filters"
 *   "/filters"          -> "/api/filters"
 *   "api/filters"       -> "/api/filters"
 *   "/api/filters"      -> "/api/filters"
 *   "http(s)://..."     -> left as-is (absolute URL)
 */
const api = axios.create({
  // baseURL left blank; we rewrite config.url in the interceptor below.
  withCredentials: true,
  // You can keep timeout etc. here if you want
});

api.interceptors.request.use((config) => {
  let u = config.url || "";

  // don't touch absolute URLs
  if (/^https?:\/\//i.test(u)) return config;

  // make sure there's exactly one leading slash
  if (!u.startsWith("/")) u = "/" + u;

  // if it already starts with /api/, keep it
  if (u.startsWith("/api/")) {
    config.url = u;
    return config;
  }

  // otherwise prefix /api
  config.url = "/api" + u;
  return config;
});

export default api;
// Auto-broadcast logout if the server says we're unauthorized.
// This keeps Navbar/SideNav in sync even on stale sessions.
api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      try { window.dispatchEvent(new CustomEvent('auth:logout')); } catch {}
    }
    return Promise.reject(err);
  }
);