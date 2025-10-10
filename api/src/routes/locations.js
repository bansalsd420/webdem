import { Router } from 'express';
import cache from '../lib/cache.js';

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
    .map((p, i) =>
      i === 0 ? String(p || '').replace(/\/+$/, '') : String(p || '').replace(/^\/+|\/+$/g, '')
    )
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
  const tokenCandidates = [TOKEN_PATH_ENV, '/connector/oauth/token', '/connector/api/oauth/token'];
    let last = { path: null, status: 0, body: null };
    for (const p of tokenCandidates) {
      const r = await fetchAccessTokenVia(p);
      if (r.ok) {
        const j = await r.json();
        const ttl = Number(j.expires_in || 3600);
        tokenCache = {
          access_token: j.access_token,
          expires_at: Date.now() + Math.max(30_000, (ttl - 15) * 1000),
        };
        return tokenCache.access_token;
      }
      last = { path: p, status: r.status, body: await safeJson(r) };
      if (![404, 405].includes(r.status)) break;
    }
    const err = new Error(`oauth_failed ${last.status} (${String(last.path)})`);
    err.status = last.status || 500;
    err.body = last.body;
    throw err;
}

// Lightweight debug helper route: returns the token candidate probe results.
// GET /api/locations/_debug_token
router.get('/_debug_token', async (_req, res) => {
  const results = [];
  for (const p of tokenCandidates) {
    try {
      const r = await fetchAccessTokenVia(p);
      const body = await safeJson(r);
      results.push({ path: p, url: joinUrl(BASE, p), status: r.status, ok: r.ok, body });
    } catch (e) {
      results.push({ path: p, url: joinUrl(BASE, p), status: e?.status || null, ok: false, error: String(e?.message || e) });
    }
  }
  res.json({ base: BASE, prefix: PREFIX, candidates: results });
});

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
      Array.isArray(v)
        ? v.forEach((val) => url.searchParams.append(k, String(val)))
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
    const CACHE_TTL = Number(process.env.LOCATIONS_CACHE_TTL_MS || 5 * 60 * 1000);
    const cacheKey = `locations:v1:biz-${BIZ}`;
    const hit = cache.get(cacheKey);
    if (hit) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min
      return res.json(hit);
    }

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

    // Cache output in-process; TTL configurable via LOCATIONS_CACHE_TTL_MS
    cache.set(cacheKey, out, CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min
    return res.json(out); // <<— ONLY real locations (no "All")
  } catch (e) {
    // Treat 404 from the connector as a graceful 'no route' (fallbacks were tried).
    // Avoid noisy logs for this expected condition; still log other errors.
    if (e?.status === 404) {
      console.debug('locations (connector) route not found, falling back to empty set');
      return res.status(502).json([]);
    }
    console.error('locations (connector) error', e?.status || '', e?.body || e);
    // Return empty so the client can disable picker / show an error state.
    return res.status(502).json([]);
  }
});

export default router;
