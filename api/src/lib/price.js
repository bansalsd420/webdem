// src/lib/price.js
import { pool } from '../db.js';

export async function priceGroupIdForContact(contactId, businessId) {
  // find customer's group and its selling price group id
  const [[row]] = await pool.query(
    `SELECT cg.selling_price_group_id AS pg_id
     FROM contacts c
     LEFT JOIN customer_groups cg ON cg.id = c.customer_group_id
     WHERE c.id = :cid AND c.business_id = :bid
     LIMIT 1`,
    { cid: contactId, bid: businessId }
  );
  return row?.pg_id || null; // can be null
}

/**
 * Return a price for a variation:
 * - If pgId provided & match exists → variation_group_prices.price_inc_tax
 * - Else → variations.sell_price_inc_tax
 * - Else → variations.default_sell_price
 * - Else → null (rare)
 */
export async function priceForVariation(variationId, pgId = null) {
  // Try group price if we have a price group id
  if (pgId) {
    const [[g]] = await pool.query(
      `SELECT price_inc_tax
       FROM variation_group_prices
       WHERE variation_id = :vid AND price_group_id = :pg
       LIMIT 1`,
      { vid: variationId, pg: pgId }
    );
    if (g?.price_inc_tax != null) return Number(g.price_inc_tax);
  }

  // Fallback to base sell price, then default sell price
  const [[v]] = await pool.query(
    `SELECT sell_price_inc_tax, default_sell_price
     FROM variations
     WHERE id = :vid
     LIMIT 1`,
    { vid: variationId }
  );
  if (!v) return null;

  if (v.sell_price_inc_tax != null) return Number(v.sell_price_inc_tax);
  if (v.default_sell_price != null) return Number(v.default_sell_price);
  return null;
}

/**
 * Minimum price across all variations for a product
 * - If pgId set → try group prices first, but still fallback to base prices.
 */
export async function minPriceForProduct(productId, pgId = null) {
  // pull the product's variation ids
  const [rows] = await pool.query(
    `SELECT id FROM variations WHERE product_id = :pid`,
    { pid: productId }
  );
  if (!rows.length) return null;

  let min = null;
  for (const r of rows) {
    const p = await priceForVariation(r.id, pgId);
    if (p != null) min = (min == null) ? p : Math.min(min, p);
  }
  return min;
}
