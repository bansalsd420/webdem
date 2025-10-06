import { pool } from '../db.js';

/** TRUE if any variation of the product has qty_available > 0.
 * If locationId is null → sum across all locations. */
export async function inStockByLocation(productId, locationId = null) {
  const [rows] = await pool.query(
    `SELECT SUM(vld.qty_available) AS qty
     FROM variations v
     JOIN variation_location_details vld ON vld.variation_id = v.id
     WHERE v.product_id = :pid
       AND (:loc IS NULL OR vld.location_id = :loc)`,
    { pid: Number(productId), loc: locationId == null ? null : Number(locationId) }
  );
  return Number(rows?.[0]?.qty ?? 0) > 0;
}

/** TRUE if this specific variation has qty_available > 0 */
export async function inStockForVariation(variationId, locationId = null) {
  const [rows] = await pool.query(
    `SELECT SUM(qty_available) AS qty
     FROM variation_location_details
     WHERE variation_id = :vid
       AND (:loc IS NULL OR location_id = :loc)`,
    { vid: Number(variationId), loc: locationId == null ? null : Number(locationId) }
  );
  return Number(rows?.[0]?.qty ?? 0) > 0;
}
