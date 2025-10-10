

// api/src/routes/home.js
import { Router } from "express";
import { pool } from "../db.js";
import { authOptional } from "../middleware/auth.js";
import crypto from "crypto";
import cache from "../lib/cache.js";
import catVis from "../lib/categoryVisibility.js";

const router = Router();

const BUSINESS_ID = Number(process.env.BUSINESS_ID) || 9;
const MEDIA_FILES_ORIGIN =
  (process.env.MEDIA_FILES_ORIGIN || "https://backoffice.mojiwholesale.com/media/").replace(/\/+$/, "") + "/";

const HOME_CACHE_TTL_MS = Number(process.env.HOME_CACHE_TTL_MS || 5 * 60 * 1000); // 5m
const HOME_CACHE_MAX = Number(process.env.HOME_CACHE_MAX || 64);
const HOME_DB_CONCURRENCY = Math.max(1, Number(process.env.HOME_DB_CONCURRENCY || 3));
const HOME_DB_RETRIES = Math.max(0, Number(process.env.HOME_DB_RETRIES || 1)); // tiny retry for transient errors

// Use shared cache module (in-process LRU + DB invalidation)
// cache.set/get/del/wrap are available from api/src/lib/cache.js

// -----------------------------
// Gentle DB access: semaphore + retry
// -----------------------------
class Semaphore {
  constructor(max) { this.max = max; this.cur = 0; this.q = []; }
  async acquire() {
    if (this.cur < this.max) { this.cur++; return; }
    await new Promise(res => this.q.push(res));
    this.cur++;
  }
  release() {
    this.cur--;
    const next = this.q.shift();
    if (next) next();
  }
}
const sem = new Semaphore(HOME_DB_CONCURRENCY);

async function q(sql, params = []) {
  // Retry only for brief, transient transport errors
  const transient = new Set([
    "PROTOCOL_CONNECTION_LOST",
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
    "ER_LOCK_DEADLOCK",
  ]);

  let attempt = 0, lastErr;
  while (attempt <= HOME_DB_RETRIES) {
    await sem.acquire();
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.query(sql, params);
      conn.release();
      sem.release();
      return rows;
    } catch (err) {
      lastErr = err;
      if (conn) { try { conn.release(); } catch {} }
      sem.release();
      const code = err?.code || err?.errno || err?.sqlState;
      if (!transient.has(code)) break;
      // tiny backoff: 100ms, 250ms
      const delay = Math.min(100 * (attempt ? 2.5 : 1), 400);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

// -----------------------------
// helpers
// -----------------------------
function safeJoinMedia(href) {
  const raw = String(href || "").replace(/^(\.+\/)+/, "").replace(/^\/+/, "");
  return `${MEDIA_FILES_ORIGIN}${encodeURI(raw)}`;
}

// BANNERS
async function getBanners(slot) {
  const rows = await q(
    `SELECT id, href, alt_text, is_gif, slot, sort_order, updated_at
       FROM app_home_banners
      WHERE active=1 AND slot=?
      ORDER BY sort_order ASC, id ASC`,
    [slot]
  );
  return rows.map((r) => ({
    id: r.id,
    href: r.click_href || r.href_to || "#", // safe fallback until DB has link fields
    img: safeJoinMedia(r.href),
    alt: r.alt_text || "",
    isGif: !!r.is_gif,
    slot: r.slot,
    sort: r.sort_order ?? 0,
    updated_at: r.updated_at,
  }));
}

// BRANDS (kept as-is; index friendly)
async function getFeaturedBrands(limit = 20) {
  const rows = await q(
    `
    SELECT b.id, b.name, aba.logo AS logo_file
      FROM brands b
      LEFT JOIN (
        SELECT p.brand_id,
               SUM(CASE WHEN t.id IS NOT NULL THEN COALESCE(tsl.quantity,0) ELSE 0 END) AS sold_30d,
               COUNT(*) AS product_count
          FROM products p
          LEFT JOIN transaction_sell_lines tsl ON tsl.product_id = p.id
          LEFT JOIN transactions t
                 ON t.id = tsl.transaction_id
                AND t.type='sell' AND t.status='final'
                AND t.business_id = ?
                AND t.transaction_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         WHERE p.business_id = ? AND p.is_inactive=0 AND p.not_for_selling=0
         GROUP BY p.brand_id
      ) s ON s.brand_id = b.id
      LEFT JOIN app_brand_assets aba ON aba.brand_id=b.id AND aba.active=1
     WHERE b.business_id = ?
     ORDER BY s.sold_30d DESC, s.product_count DESC, b.name ASC
     LIMIT ?
    `,
    [BUSINESS_ID, BUSINESS_ID, BUSINESS_ID, Number(limit)]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    image: r.logo_file || null,
    href: `/products?brand=${r.id}`,
  }));
}

const mapBase = (r) => ({
  id: r.id,
  name: r.name,
  sku: r.sku,
  image: r.image || null,
  minPrice: null,
  inStock: true,
  category_name: r.category_name || null,
  sub_category_name: r.sub_category_name || null,
});

async function baseTrending(limit = 12) {
  const rows = await q(
    `
    SELECT p.id, p.name, p.sku, p.image,
           c.name AS category_name, sc.name AS sub_category_name,
           COALESCE(s.qty,0) AS sold_30d
      FROM products p
      LEFT JOIN categories c  ON c.id = p.category_id
      LEFT JOIN categories sc ON sc.id = p.sub_category_id
      LEFT JOIN (
        SELECT tsl.product_id, SUM(COALESCE(tsl.quantity,0)) AS qty
          FROM transaction_sell_lines tsl
          JOIN transactions t
            ON t.id=tsl.transaction_id
           AND t.type='sell' AND t.status='final'
           AND t.business_id=?
           AND t.transaction_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY tsl.product_id
      ) s ON s.product_id = p.id
     WHERE p.business_id=? AND p.is_inactive=0 AND p.not_for_selling=0
     ORDER BY COALESCE(s.qty,0) DESC, p.id DESC
     LIMIT ?
    `,
    [BUSINESS_ID, BUSINESS_ID, Number(limit)]
  );
  const mapped = rows.map(mapBase);
  try {
    const hidden = await catVis.hiddenCategorySet(BUSINESS_ID, null);
    if (!hidden || hidden.size === 0) return mapped;
    return mapped.filter(r => !catVis.isHiddenByCategoryIds(hidden, r.category_id, r.sub_category_id));
  } catch (e) {
    console.error('[home] trending visibility filter failed', e && e.message ? e.message : e);
    return mapped;
  }
}

async function baseFresh(limit = 10) {
  const rows = await q(
    `
    SELECT p.id, p.name, p.sku, p.image,
           c.name AS category_name, sc.name AS sub_category_name, p.created_at
      FROM products p
      LEFT JOIN categories c  ON c.id = p.category_id
      LEFT JOIN categories sc ON sc.id = p.sub_category_id
     WHERE p.business_id=? AND p.is_inactive=0 AND p.not_for_selling=0
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ?
    `,
    [BUSINESS_ID, Number(limit)]
  );
  const mapped = rows.map(mapBase);
  try {
    const hidden = await catVis.hiddenCategorySet(BUSINESS_ID, null);
    if (!hidden || hidden.size === 0) return mapped;
    return mapped.filter(r => !catVis.isHiddenByCategoryIds(hidden, r.category_id, r.sub_category_id));
  } catch (e) {
    console.error('[home] fresh visibility filter failed', e && e.message ? e.message : e);
    return mapped;
  }
}

async function baseBest(limit = 16) {
  const rows = await q(
    `
    SELECT p.id, p.name, p.sku, p.image,
           c.name AS category_name, sc.name AS sub_category_name,
           COALESCE(s.qty,0) AS sold_90d
      FROM products p
      LEFT JOIN categories c  ON c.id = p.category_id
      LEFT JOIN categories sc ON sc.id = p.sub_category_id
      LEFT JOIN (
        SELECT tsl.product_id, SUM(COALESCE(tsl.quantity,0)) AS qty
          FROM transaction_sell_lines tsl
          JOIN transactions t
            ON t.id=tsl.transaction_id
           AND t.type='sell' AND t.status='final'
           AND t.business_id=?
           AND t.transaction_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         GROUP BY tsl.product_id
      ) s ON s.product_id = p.id
     WHERE p.business_id=? AND p.is_inactive=0 AND p.not_for_selling=0
     ORDER BY COALESCE(s.qty,0) DESC, p.id DESC
     LIMIT ?
    `,
    [BUSINESS_ID, BUSINESS_ID, Number(limit)]
  );
  const mapped = rows.map(mapBase);
  try {
    const hidden = await catVis.hiddenCategorySet(BUSINESS_ID, null);
    if (!hidden || hidden.size === 0) return mapped;
    return mapped.filter(r => !catVis.isHiddenByCategoryIds(hidden, r.category_id, r.sub_category_id));
  } catch (e) {
    console.error('[home] best visibility filter failed', e && e.message ? e.message : e);
    return mapped;
  }
}

// -----------------------------
// GET / (home)
// -----------------------------
router.get("/", authOptional, async (req, res) => {
  const cacheKey = "home:v1";
  const hit = cache.get(cacheKey);
  if (hit) {
    res.setHeader("ETag", hit.etag);
    if (req.headers["if-none-match"] === hit.etag) return res.status(304).end();
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    return res.json(hit.payload);
  }

  try {
    // With semaphore, these won't exceed HOME_DB_CONCURRENCY at the DB.
    const [hero, wall, brands, trending, fresh, bestSellers] = await Promise.all([
      getBanners("hero"),
      getBanners("wall"),
      getFeaturedBrands(20),
      baseTrending(12),
      baseFresh(10),
      baseBest(16),
    ]);

    const payload = { hero, wall, brands, trending, fresh, bestSellers };

    // Build a stable ETag from list lengths + last banner updates (fast to compute)
    const sig = JSON.stringify({
      h: hero.length, w: wall.length, b: brands.length,
      t: trending.length, f: fresh.length, bs: bestSellers.length,
      hu: hero[hero.length - 1]?.updated_at || null,
      wu: wall[wall.length - 1]?.updated_at || null,
    });
    const etag = '"' + crypto.createHash("sha1").update(sig).digest("base64") + '"';

  cache.set(cacheKey, { payload, etag }, HOME_CACHE_TTL_MS);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    res.json(payload);
  } catch (e) {
    console.error("home error", e);
    res.status(500).json({ error: "home_failed" });
  }
});

export default router;
