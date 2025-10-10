// api/src/lib/categoryVisibility.js
// Centralized helpers to enforce category visibility rules across routes.
// Data sources:
//   - app_category_visibility(business_id, category_id, hide_for_guests, hide_for_all_users)
//   - app_category_hidden_for_contacts(category_id, contact_id)
// Behavior:
//   - For guests: hidden = hide_for_all_users ∪ hide_for_guests
//   - For logged-in users: hidden = hide_for_all_users ∪ per-contact overrides
//   - Enforcement applies to both category_id and sub_category_id on products

import { pool } from '../db.js';
import cache from './cache.js';

const TTL_MS = Number(process.env.CAT_VIS_TTL_MS || 5 * 60 * 1000); // 5 minutes

function toSet(rows, field = 'category_id') {
  const s = new Set();
  for (const r of rows || []) {
    const id = Number(r?.[field]);
    if (Number.isFinite(id)) s.add(id);
  }
  return s;
}

/**
 * Load business-wide visibility config: two sets
 *  - allUsers: categories hidden for everyone (hide_for_all_users=1)
 *  - guests:  categories hidden for guests specifically (hide_for_guests=1)
 */
async function loadBizVisibility(businessId) {
  const key = `catvis:v1:biz:${businessId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const [rows] = await pool.query(
    `SELECT category_id, hide_for_guests, hide_for_all_users
       FROM app_category_visibility
      WHERE business_id = :bid`,
    { bid: Number(businessId) }
  );
  const allUsers = new Set();
  const guests = new Set();
  for (const r of rows) {
    const cid = Number(r?.category_id);
    if (!Number.isFinite(cid)) continue;
    if (Number(r?.hide_for_all_users) === 1) allUsers.add(cid);
    if (Number(r?.hide_for_guests) === 1) guests.add(cid);
  }
  const out = { allUsers, guests };
  cache.set(key, out, TTL_MS);
  return out;
}

/** Load per-contact hidden categories */
async function loadContactHidden(contactId) {
  // contact-level hidden categories are per-business; cache key includes bid
  const key = (biz) => `catvis:v1:contact:${biz}:${contactId}`;
  // We'll return a function-like behavior: caller should call with businessId
  return async function forBiz(businessId) {
    const k = key(businessId);
    const hit = cache.get(k);
    if (hit) return hit;
    const [rows] = await pool.query(
      `SELECT category_id FROM app_category_hidden_for_contacts WHERE contact_id=:cid AND business_id = :bid`,
      { cid: Number(contactId), bid: Number(businessId) }
    );
    const set = toSet(rows, 'category_id');
    cache.set(k, set, TTL_MS);
    return set;
  };
}

/**
 * Compute the effective hidden set for a request.
 * If contactId is provided (logged-in), hidden = allUsers ∪ contactHidden.
 * Else (guest), hidden = allUsers ∪ guests.
 */
export async function hiddenCategorySet(businessId, contactId) {
  const biz = await loadBizVisibility(businessId);
  const base = new Set(biz.allUsers);
  if (Number.isFinite(Number(contactId))) {
    // loadContactHidden returns a function for biz-specific loads
    const perLoader = await loadContactHidden(Number(contactId));
    const per = await perLoader(businessId);
    for (const id of per) base.add(id);
  } else {
    for (const id of biz.guests) base.add(id);
  }

  // Expand hidden set to include descendant categories (parent -> child)
  try {
    const expanded = await expandDescendants(Array.from(base), businessId);
    for (const id of expanded) base.add(id);
  } catch (e) {
    console.error('[catvis] failed to expand descendants', e && e.message ? e.message : e);
  }

  return base;
}

// Load all categories for a business and compute descendant closure for given category ids
async function expandDescendants(categoryIds, businessId) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return new Set();
  // fetch category id and parent_id for the business
  const [rows] = await pool.query(
    `SELECT id, parent_id FROM categories WHERE business_id = :bid`,
    { bid: Number(businessId) }
  );
  const childrenMap = new Map();
  for (const r of rows) {
    const id = Number(r.id);
    const p = Number(r.parent_id);
    if (!childrenMap.has(p)) childrenMap.set(p, []);
    childrenMap.get(p).push(id);
  }

  const out = new Set();
  const q = [...new Set(categoryIds.map(x => Number(x)).filter(Number.isFinite))];
  while (q.length) {
    const c = q.shift();
    if (out.has(c)) continue;
    out.add(c);
    const kids = childrenMap.get(c) || [];
    for (const kid of kids) {
      if (!out.has(kid)) q.push(kid);
    }
  }
  return out;
}

/** True if the product/category should be hidden given the hidden set */
export function isHiddenByCategoryIds(hiddenSet, categoryId, subCategoryId) {
  const c = Number(categoryId);
  const s = Number(subCategoryId);
  return (Number.isFinite(c) && hiddenSet.has(c)) || (Number.isFinite(s) && hiddenSet.has(s));
}

/** Filter an array of product-like items by category visibility */
export function filterItemsByVisibility(items, hiddenSet) {
  if (!hiddenSet || hiddenSet.size === 0) return items;
  return items.filter(it => !isHiddenByCategoryIds(hiddenSet, it?.category_id, it?.sub_category_id));
}

/** Invalidate caches (call from admin ops if needed) */
export function invalidateVisibilityCache({ businessId, contactId } = {}) {
  if (businessId != null) cache.del(`catvis:v1:biz:${businessId}`);
  if (contactId != null) cache.del(`catvis:v1:contact:${businessId}:${contactId}`);
}

export default {
  hiddenCategorySet,
  isHiddenByCategoryIds,
  filterItemsByVisibility,
  invalidateVisibilityCache,
  expandDescendants,
};

export { expandDescendants };
