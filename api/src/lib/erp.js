// api/src/lib/erp.js
// Single, tiny ERP client used by all routes.

const BIZ = Number(process.env.BUSINESS_ID);
const BASE = (process.env.CONNECTOR_BASE_URL || '').replace(/\/+$/, '');
const PREFIX = process.env.CONNECTOR_PREFIX || '/connector/api';
const TOKEN_PATH = process.env.CONNECTOR_TOKEN_PATH || '/oauth/token';
const STATIC_BEARER = (process.env.CONNECTOR_BEARER || '').trim();

const OAUTH = {
  client_id: process.env.CONNECTOR_CLIENT_ID || '',
  client_secret: process.env.CONNECTOR_CLIENT_SECRET || '',
  username: process.env.CONNECTOR_USERNAME || '',
  password: process.env.CONNECTOR_PASSWORD || '',
  scope: process.env.CONNECTOR_SCOPE || '*',
};

// --- contact code -> numeric id cache ---
const _contactCache = new Map(); // key: string code like "CO0005", val: numeric id

export async function resolveNumericContactId(cidMaybe) {
  const num = Number(cidMaybe);
  if (Number.isFinite(num) && num > 0) return num;

  const code = typeof cidMaybe === 'string' ? cidMaybe.trim() : '';
  if (!code) return null;
  if (_contactCache.has(code)) return _contactCache.get(code);

  try {
    const out = await erpGet('/contactapi', {
      query: { business_id: biz(), contact_id: code, per_page: 1 },
    });
    const arr = (Array.isArray(out?.data) && out.data) || [];
    const id = Number(arr[0]?.id);
    if (Number.isFinite(id) && id > 0) {
      _contactCache.set(code, id);
      return id;
    }
  } catch {}
  return null;
}

// -------- utils ----------
export const n = v => (v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
export const s = v => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
export const biz = () => (Number.isFinite(BIZ) ? BIZ : undefined);

function joinUrl(base, p1 = '', p2 = '') {
  const a = String(base || '').replace(/\/+$/, '');
  const b = String(p1 || '').replace(/^\/+|\/+$/g, '');
  const c = String(p2 || '').replace(/^\/+|\/+$/g, '');
  return [a, b, c].filter(Boolean).join('/');
}
async function safeJson(resp) { try { return await resp.json(); } catch { return null; } }

// -------- OAuth ----------
let tokenCache = { at: null, exp: 0 };

async function fetchToken() {
  if (STATIC_BEARER) return STATIC_BEARER;
  const url = joinUrl(BASE, TOKEN_PATH);
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: OAUTH.client_id,
    client_secret: OAUTH.client_secret,
    username: OAUTH.username,
    password: OAUTH.password,
    scope: OAUTH.scope,
  });
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!r.ok) {
    const e = new Error(`connector_oauth_failed ${r.status}`);
    e.status = r.status; e.body = await safeJson(r);
    throw e;
  }
  const j = await r.json();
  const ttl = Number(j.expires_in || 3600);
  tokenCache = { at: j.access_token, exp: Date.now() + Math.max(30_000, (ttl - 15) * 1000) };
  return tokenCache.at;
}
async function token() {
  if (STATIC_BEARER) return STATIC_BEARER;
  if (tokenCache.at && Date.now() < tokenCache.exp) return tokenCache.at;
  return fetchToken();
}

// -------- GET helpers ----------
export async function erpGet(path, { query } = {}) {
  const url = new URL(joinUrl(BASE, PREFIX, path));
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      Array.isArray(v) ? v.forEach(x => url.searchParams.append(k, String(x)))
                       : url.searchParams.set(k, String(v));
    }
  }
  let t = await token();
  let r = await fetch(url, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } });
  if (r.status === 401 && !STATIC_BEARER) {
    t = await fetchToken();
    r = await fetch(url, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } });
  }
  if (!r.ok) {
    const e = new Error(`connector_error ${r.status}`);
    e.status = r.status; e.body = await safeJson(r);
    throw e;
  }
  return r.json();
}

export async function erpGetAny(paths, opts) {
  let lastErr = null;
  for (const p of paths) {
    try { return { path: p, data: await erpGet(p, opts) }; }
    catch (e) { lastErr = e; if (e?.status && ![404, 405].includes(e.status)) break; }
  }
  throw lastErr || new Error('all_paths_failed');
}

// -------- generic fetch (GET/POST/etc) ----------
export async function erpFetch(path, { method = 'GET', query, headers = {}, body } = {}) {
  const url = new URL(joinUrl(BASE, PREFIX, path));
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, String(v));
    }
  }

  const mkHeaders = async () => {
    const h = { Accept: 'application/json', ...headers };
    const bearer = await token();
    if (bearer) h.Authorization = `Bearer ${bearer}`;
    return h;
  };

  const doReq = async () => fetch(url.toString(), { method, headers: await mkHeaders(), body });

  let resp = await doReq();
  if (resp.status === 401 && !STATIC_BEARER) {
    tokenCache = { at: null, exp: 0 };
    resp = await doReq();
  }

  const asJson = await safeJson(resp);
  if (!resp.ok) {
    const err = new Error(`erp_fetch_failed ${resp.status}`);
    err.status = resp.status;
    err.body = asJson;
    throw err;
  }
  return asJson ?? {};
}

export async function erpPostJSON(path, payload, { query } = {}) {
  return erpFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    query,
  });
}

// -------- normalizers / helpers ----------
export function listFrom(data) {
  return (
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.products) && data.products) ||
    (Array.isArray(data?.result) && data.result) ||
    (Array.isArray(data) && data) || []
  );
}
export function totalFrom(data, fallback) {
  return n(data?.meta?.total) ?? n(data?.total) ?? n(data?.count) ?? n(data?.pagination?.total) ?? fallback;
}

export function qtyAtLocation(prod, locationId) {
  const scalar = n(
    prod?.qty_available ?? prod?.available_qty ?? prod?.current_stock ??
    prod?.stock ?? prod?.qty ?? prod?.quantity
  );

  const arrays =
    prod?.product_location_details || prod?.location_details || prod?.locations || prod?.stock_by_location || null;

  if (Array.isArray(arrays)) {
    if (locationId != null) {
      for (const e of arrays) {
        const lid = n(e?.location_id) ?? n(e?.id) ?? n(e?.location?.id);
        if (lid === locationId) {
          return n(e?.qty_available ?? e?.available_qty ?? e?.current_stock ?? e?.stock ?? e?.qty ?? e?.quantity) ?? 0;
        }
      }
      return 0;
    }
    let sum = 0, saw = false;
    for (const e of arrays) {
      const q = n(e?.qty_available ?? e?.available_qty ?? e?.current_stock ?? e?.stock ?? e?.qty ?? e?.quantity);
      if (q != null) { saw = true; sum += Math.max(0, q); }
    }
    return saw ? sum : (scalar == null ? null : scalar);
  }

  const map = prod?.location_qty_map || prod?.qty_by_location || prod?.by_location || null;
  if (map && typeof map === 'object') {
    if (locationId != null) return n(map[String(locationId)]) ?? 0;
    let sum = 0, saw = false;
    for (const v of Object.values(map)) {
      const q = n(v);
      if (q != null) { saw = true; sum += Math.max(0, q); }
    }
    return saw ? sum : (scalar == null ? null : scalar);
  }

  return scalar;
}
