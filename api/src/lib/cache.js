// api/src/lib/cache.js
import crypto from 'crypto';
import { pool } from '../db.js';

// Small Map-based LRU with TTL (inspired by the earlier home.js implementation)
class LRU {
  constructor({ max = 128, ttlMs = 300000 } = {}) {
    this.max = max; this.ttlMs = ttlMs; this.map = new Map();
  }
  _now() { return Date.now(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return null;
    if (e.exp && this._now() > e.exp) { this.map.delete(k); return null; }
    // refresh LRU order
    this.map.delete(k); this.map.set(k, e);
    return e.value;
  }
  set(k, v, ttlMs) {
    const exp = ttlMs === 0 ? 0 : this._now() + (ttlMs ?? this.ttlMs);
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, { value: v, exp });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  del(k) { this.map.delete(k); }
  keys() { return Array.from(this.map.keys()); }
}

const DEFAULT_MAX = Number(process.env.CACHE_MAX || 256);
const DEFAULT_TTL_MS = Number(process.env.CACHE_DEFAULT_TTL_MS || 5 * 60 * 1000);
const cache = new LRU({ max: DEFAULT_MAX, ttlMs: DEFAULT_TTL_MS });

// Whether to use DB-backed invalidation polling. Default: false (no DB migration required).
const USE_DB_INVALIDATION = String(process.env.CACHE_USE_DB_INVALIDATION || 'false').toLowerCase() === 'true';

// Singleflight in-flight map to prevent duplicate fetches
const inFlight = new Map();
// basic counters for observability
let _hits = 0;
let _misses = 0;

function hashParams(obj) {
  try {
    const s = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
  } catch {
    return String(obj).slice(0, 64);
  }
}

async function wrap(key, { ttlMs, fetcher }) {
  const hit = cache.get(key);
  if (hit !== null) { _hits += 1; return hit; }
  _misses += 1;
  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => {
    try {
      const v = await fetcher();
      cache.set(key, v, ttlMs);
      return v;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

function get(key) { return cache.get(key); }
function set(key, value, ttlMs) { cache.set(key, value, ttlMs); }
function del(key) { cache.del(key); }

function stats() {
  return {
    size: cache.map.size,
    keys: cache.keys(),
    hits: _hits,
    misses: _misses,
    inFlight: inFlight.size,
    max: cache.max,
    ttlMs: cache.ttlMs,
    prefixCounts: aggregatePrefixCounts(),
  };
}

function aggregatePrefixCounts() {
  const counts = Object.create(null);
  for (const k of cache.keys()) {
    // use the first two segments as the prefix for grouping, e.g. 'products:v1:...'
    const parts = String(k).split(':');
    const prefix = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0];
    counts[prefix] = (counts[prefix] || 0) + 1;
  }
  return counts;
}

// Invalidate rows poller (MySQL-backed invalidation table)
let poller = null;
const POLL_MS = Math.max(1000, Number(process.env.CACHE_INVALIDATION_POLL_MS || 3000));
async function processInvalidationsOnce() {
  try {
    const rows = await pool.query(
      'SELECT id, cache_key FROM cache_invalidation WHERE processed=0 ORDER BY id LIMIT 200'
    );
    // pool.query returns [rows] or rows depending on pool lib; normalize
    const raw = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows[0] ? rows[0] : rows;
    if (!raw || raw.length === 0) return;
    const ids = [];
    for (const r of raw) {
      try {
        if (r.cache_key) del(r.cache_key);
        ids.push(r.id);
      } catch (e) {
        // ignore individual failures
        console.error('[cache] invalidation failed for', r.cache_key, e && e.message ? e.message : e);
      }
    }
    if (ids.length) {
      await pool.query('UPDATE cache_invalidation SET processed=1 WHERE id IN (?)', [ids]);
    }
  } catch (e) {
    // If the invalidation table doesn't exist, log one clear message and stop the poller to avoid spam.
    const msg = e && e.message ? e.message : String(e);
    if (/cache_invalidation/i.test(msg) && /(doesn\'t exist|does not exist|ER_NO_SUCH_TABLE|no such table)/i.test(msg)) {
      console.error('[cache] cache_invalidation table not found. Run the migration api/migrations/20251009_create_cache_invalidation.sql to create it. Stopping invalidation poller.');
      if (poller) { clearInterval(poller); poller = null; }
      return;
    }
    // otherwise log and continue
    console.error('[cache] invalidation poller error', msg);
  }
}

function startInvalidationPoller() {
  if (!USE_DB_INVALIDATION) {
    // DB invalidation is disabled; do not start poller.
    return;
  }
  if (poller) return;
  poller = setInterval(() => { processInvalidationsOnce(); }, POLL_MS);
  // run immediately once
  processInvalidationsOnce().catch(() => {});
}

async function invalidateByKey(cacheKey, resource = null) {
  if (USE_DB_INVALIDATION) {
    try {
      await pool.query('INSERT INTO cache_invalidation (cache_key, resource) VALUES (?, ?)', [cacheKey, resource]);
    } catch (e) {
      console.error('[cache] failed to write invalidation', e && e.message ? e.message : e);
    }
  } else {
    // DB invalidation disabled - just clear local cache entry.
    try {
      // Support simple prefix invalidation by using a trailing '*' on the key
      // or by passing resource = { prefix: true } when calling programmatically.
      if (typeof cacheKey === 'string' && cacheKey.endsWith('*')) {
        const prefix = cacheKey.slice(0, -1);
        for (const k of cache.keys()) if (k.startsWith(prefix)) del(k);
      } else if (resource && typeof resource === 'object' && resource.prefix) {
        const prefix = String(cacheKey);
        for (const k of cache.keys()) if (k.startsWith(prefix)) del(k);
      } else {
        del(cacheKey);
      }
    } catch (e) {
      console.error('[cache] local invalidate failed for', cacheKey, e && e.message ? e.message : e);
    }
  }
}

// start poller automatically when configured
if (USE_DB_INVALIDATION) startInvalidationPoller();

// Allow changing defaults at runtime if needed (e.g., tests)
function setDefaults({ max, ttlMs } = {}) {
  if (typeof max === 'number') cache.max = max;
  if (typeof ttlMs === 'number') cache.ttlMs = ttlMs;
}

export default {
  get,
  set,
  del,
  wrap,
  hashParams,
  invalidateByKey,
  stats,
  startInvalidationPoller,
};
