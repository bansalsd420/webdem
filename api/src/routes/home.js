// api/src/routes/home.js
import { Router } from "express";
import { pool } from "../db.js";
import { authOptional } from "../middleware/auth.js";

const router = Router();
const BUSINESS_ID = Number(process.env.BUSINESS_ID) || 9;

/* ---------- BANNERS (legacy for now, per your request) ---------- */
async function getBanners(slot) {
  const [rows] = await pool.query(
    `SELECT id, href, file_name, alt_text, is_gif
       FROM app_home_banners
      WHERE active=1 AND slot=?
      ORDER BY sort_order ASC, id ASC`,
    [slot]
  );
  return rows.map((r) => ({
    id: r.id,
    href: r.href || "#",
    img: r.file_name,
    alt: r.alt_text || "",
    isGif: !!r.is_gif,
  }));
}

/* ---------- BRANDS (unchanged rail) ---------- */
async function getFeaturedBrands(limit = 20) {
  const [rows] = await pool.query(
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

/* ---------- Shared row mapper for rails ---------- */
const mapBase = (r) => ({
  id: r.id,
  name: r.name,
  sku: r.sku,
  image: r.image || null,
  // leave price/stock out on Home for speed/privacy
  minPrice: null,
  inStock: true,
  category_name: r.category_name || null,
  sub_category_name: r.sub_category_name || null,
});

/* ---------- Rails: simple, index-friendly queries ---------- */
async function baseTrending(limit = 12) {
  const [rows] = await pool.query(
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
  return rows.map(mapBase);
}

async function baseFresh(limit = 10) {
  const [rows] = await pool.query(
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
  return rows.map(mapBase);
}

async function baseBest(limit = 16) {
  const [rows] = await pool.query(
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
  return rows.map(mapBase);
}

/* ---------- Route ---------- */
router.get("/", authOptional, async (_req, res) => {
  try {
    const [hero, wall, brands, trending, fresh, bestSellers] = await Promise.all([
      getBanners("hero"),
      getBanners("wall"),
      getFeaturedBrands(20),
      baseTrending(12),
      baseFresh(10),
      baseBest(16),
    ]);

    res.set("Cache-Control", "max-age=30, s-maxage=60");
    res.json({ hero, wall, brands, trending, fresh, bestSellers });
  } catch (e) {
    console.error("home error", e);
    res.status(500).json({ error: "home_failed" });
  }
});

export default router;
