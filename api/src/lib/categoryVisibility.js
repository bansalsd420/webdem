import { pool, queryWithRetry } from '../db.js';
import { n } from './erp.js';

// Simple in-memory cache of visibility rules per business
const CACHE = new Map(); // biz -> { ts, rules }
const DEFAULT_TTL = Number(process.env.CAT_VIS_TTL_MS || 30_000);

async function loadRules(biz) {
  if (!biz) return { guests: { byCategory: new Set(), bySub: new Map() }, users: { byCategory: new Set(), bySub: new Map() }, raw: [] };
  const cached = CACHE.get(biz);
  if (cached && (Date.now() - cached.ts) < (cached.ttl || DEFAULT_TTL)) return cached.rules;

  // read rules from DB
  let rows = [];
  try {
    // Try unscoped read first (older schema without business_id)
    const [r1] = await queryWithRetry(`SELECT id, category_id, subcategory_id, hide_from_guests, hide_from_users FROM app_category_visibility`, {});
    rows = Array.isArray(r1) ? r1 : [];
    if (!rows.length) {
      // If no rows found unscoped, try business-scoped query (newer schema)
      try {
        const sqlBiz = `SELECT id, category_id, subcategory_id, hide_from_guests, hide_from_users
                         FROM app_category_visibility
                        WHERE business_id = :biz`;
        const [r2] = await queryWithRetry(sqlBiz, { biz });
        rows = Array.isArray(r2) ? r2 : [];
      } catch (e) {
        // ignore and keep rows as-is
      }
    }
  } catch (err) {
    // If even the unscoped read fails, log and return empty rules
    console.warn('categoryVisibility: failed to load rules, returning empty set', err && err.message ? err.message : err);
    rows = [];
  }

  const rules = Array.isArray(rows) ? rows : [];
  // Build quick access maps
  const byCategoryGuests = new Set();
  const byCategoryUsers = new Set();
  const bySubGuests = new Map();
  const bySubUsers = new Map();

  for (const r of rules) {
    const cid = n(r.category_id);
    const sid = n(r.subcategory_id);
    if (sid == null) {
      if (r.hide_from_guests) byCategoryGuests.add(cid);
      if (r.hide_from_users)  byCategoryUsers.add(cid);
    } else {
      if (r.hide_from_guests) {
        const s = bySubGuests.get(cid) || new Set(); s.add(sid); bySubGuests.set(cid, s);
      }
      if (r.hide_from_users) {
        const s = bySubUsers.get(cid) || new Set(); s.add(sid); bySubUsers.set(cid, s);
      }
    }
  }

  const assembled = {
    raw: rules,
    guests: { byCategory: byCategoryGuests, bySub: bySubGuests },
    users:  { byCategory: byCategoryUsers,  bySub: bySubUsers }
  };
  CACHE.set(biz, { ts: Date.now(), ttl: DEFAULT_TTL, rules: assembled });
  return assembled;
}

function invalidate(biz) {
  if (!biz) {
    CACHE.clear();
  } else {
    CACHE.delete(biz);
  }
}

function _isHiddenForSets(catId, subId, sets) {
  if (!sets) return false;
  if (sets.byCategory && sets.byCategory.has(catId)) return true;
  if (subId != null && sets.bySub) {
    const s = sets.bySub.get(catId);
    if (s && s.has(subId)) return true;
  }
  return false;
}

async function isHidden({ category_id, sub_category_id } = {}, isGuest = true, biz = undefined) {
  try {
    const rules = await loadRules(biz);
    const sets = isGuest ? rules.guests : rules.users;
    return _isHiddenForSets(n(category_id), n(sub_category_id), sets);
  } catch (e) {
    return false;
  }
}

// filter an array of shaped items { id, category_id, sub_category_id }
async function filterProducts(items = [], isGuest = true, biz = undefined) {
  if (!Array.isArray(items) || !items.length) return [];
  const rules = await loadRules(biz);
  const sets = isGuest ? rules.guests : rules.users;
  return items.filter(it => !_isHiddenForSets(n(it.category_id), n(it.sub_category_id) ?? n(it.subcategory_id), sets));
}

export default { loadRules, invalidate, isHidden, filterProducts };
