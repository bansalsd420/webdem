import { Router } from 'express';

const router = Router();

/* ---------- ENV ---------- */
const BIZ = Number(process.env.BUSINESS_ID);
const BASE = (process.env.CONNECTOR_BASE_URL || '').replace(/\/+$/, '');
const PREFIX = process.env.CONNECTOR_PREFIX || '/connector/api';
const TOKEN_PATH_ENV = process.env.CONNECTOR_TOKEN_PATH || '/oauth/token';
const STATIC_BEARER = (process.env.CONNECTOR_BEARER || '').trim();

const OAUTH = {
  client_id: process.env.CONNECTOR_CLIENT_ID || '',
  client_secret: process.env.CONNECTOR_CLIENT_SECRET || '',
  proj_username: process.env.CONNECTOR_USERNAME || '',
  proj_password: process.env.CONNECTOR_PASSWORD || '',
  scope: process.env.CONNECTOR_SCOPE || '*',
};

/* ---------- utils ---------- */
function joinUrl(...parts) {
  return parts
    .map((p, i) => (i === 0 ? String(p || '').replace(/\/+$/, '') : String(p || '').replace(/^\/+|\/+$/g, '')))
    .filter(Boolean)
    .join('/');
}
const num = (x) => (x == null ? null : (Number.isFinite(Number(x)) ? Number(x) : null));
async function safeJson(resp) { try { return await resp.json(); } catch { return null; } }

/* ---------- OAuth / Bearer ---------- */
let tokenCache = { access_token: null, expires_at: 0 };

async function fetchAccessTokenVia(path) {
  const url = joinUrl(BASE, path);
  const form = new URLSearchParams({
    grant_type: 'password',
    client_id: OAUTH.client_id,
    client_secret: OAUTH.client_secret,
    username: OAUTH.proj_username,
    password: OAUTH.proj_password,
    scope: OAUTH.scope,
  });
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
  });
}

async function fetchAccessToken() {
  if (STATIC_BEARER) return STATIC_BEARER;
  const candidates = [TOKEN_PATH_ENV, '/connector/oauth/token', '/connector/api/oauth/token'];
  let last = { status: 0, body: null };
  for (const p of candidates) {
    const r = await fetchAccessTokenVia(p);
    if (r.ok) {
      const j = await r.json();
      const ttl = Number(j.expires_in || 3600);
      tokenCache = { access_token: j.access_token, expires_at: Date.now() + Math.max(30_000, (ttl - 15) * 1000) };
      return tokenCache.access_token;
    }
    last = { status: r.status, body: await safeJson(r) };
    if (![404, 405].includes(r.status)) break;
  }
  const err = new Error(`oauth_failed ${last.status}`);
  err.status = last.status || 500;
  err.body = last.body;
  throw err;
}

async function getAccessToken() {
  if (STATIC_BEARER) return STATIC_BEARER;
  if (tokenCache.access_token && Date.now() < tokenCache.expires_at) return tokenCache.access_token;
  return fetchAccessToken();
}

/* ---------- connector helpers ---------- */
async function connectorGet(path, { query } = {}) {
  const url = new URL(joinUrl(BASE, PREFIX, path));
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      Array.isArray(v) ? v.forEach(val => url.searchParams.append(k, String(val)))
                       : url.searchParams.set(k, String(v));
    }
  }
  let token = await getAccessToken();
  let resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (resp.status === 401 && !STATIC_BEARER) {
    token = await fetchAccessToken();
    resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  }
  if (!resp.ok) {
    const body = await safeJson(resp);
    const err = new Error(`connector_error ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }
  return resp.json();
}

async function connectorGetAny(paths, { query } = {}) {
  let lastErr = null;
  for (const p of paths) {
    try {
      const data = await connectorGet(p, { query });
      return { path: p, data };
    } catch (e) {
      lastErr = e;
      if (e?.status && ![404, 405].includes(e.status)) break;
    }
  }
  throw lastErr || new Error('all_paths_failed');
}

/* ---------- normalizer ---------- */
function normalizeLocation(row) {
  if (!row || typeof row !== 'object') return null;
  const id =
    num(row.id) ??
    num(row.location_id) ??
    num(row.business_location_id) ??
    num(row.location?.id) ??
    null;
  const name = String(
    row.name ??
    row.location_name ??
    row.display_name ??
    row.location?.name ??
    ''
  ).trim();
  if (id == null || !name) return null;
  return { id, name };
}

/* ---------- Route ---------- */
router.get('/', async (_req, res) => {
  try {
    const { data } = await connectorGetAny(
      ['/business-location', '/location', '/locations', '/business-locations'],
      { query: { business_id: Number.isFinite(BIZ) ? BIZ : undefined, per_page: 200, status: 1 } }
    );

    const arr =
      (Array.isArray(data?.data) && data.data) ||
      (Array.isArray(data?.items) && data.items) ||
      (Array.isArray(data?.locations) && data.locations) ||
      (Array.isArray(data) && data) ||
      [];

    const out = [];
    const seen = new Set();
    for (const row of arr) {
      const loc = normalizeLocation(row);
      if (loc && !seen.has(loc.id)) { seen.add(loc.id); out.push(loc); }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));

    // Prepend the virtual "All locations" entry
    const withAll = [{ id: null, name: 'All locations' }, ...out];

    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min
    return res.json(withAll);
  } catch (e) {
    console.error('locations (connector) error', e?.status || '', e?.body || e);
    // Still provide the virtual default so UI can function
    return res.json([{ id: null, name: 'All locations' }]);
  }
});

export default router;
