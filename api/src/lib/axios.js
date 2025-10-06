// api/src/lib/axios.js
import axios from 'axios';
import { getConnectorToken, clearConnectorToken } from './connector.js';

const baseURL =
  process.env.CONNECTOR_BASE_URL ||
  process.env.POS_BASE_URL || // fallback for your earlier naming
  '';

const http = axios.create({
  baseURL,
  timeout: 15000,
});

// Attach Authorization on each request
http.interceptors.request.use(async (config) => {
  // Skip if caller already provided Authorization
  if (!config.headers?.Authorization) {
    const token = await getConnectorToken();
    if (token) {
      config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
    }
  }
  return config;
});

// If we get 401, clear token and retry once
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const cfg = error?.config || {};
    if (error?.response?.status === 401 && !cfg._retry) {
      cfg._retry = true;
      clearConnectorToken();
      const token = await getConnectorToken();
      if (token) {
        cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` };
      } else {
        // No token available, propagate original error
        throw error;
      }
      return http(cfg);
    }
    throw error;
  }
);

export default http;
