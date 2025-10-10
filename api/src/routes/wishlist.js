import { Router } from 'express';
import { pool } from '../db.js';
import cache from '../lib/cache.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/wishlist
 * Returns the current user's wishlist products
 */
router.get('/', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.sku, p.image
     FROM app_wishlists w
     JOIN app_auth_users u ON u.id = w.user_id
     JOIN products p ON p.id = w.product_id
     WHERE w.user_id = :uid AND p.business_id = u.business_id
     ORDER BY w.created_at DESC`,
    { uid }
  );
  res.json(rows);
});

/**
 * POST /api/wishlist/:productId
 * Adds a product to wishlist (idempotent)
 */
router.post('/:productId', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const pid = Number(req.params.productId);
  await pool.query(
    'INSERT IGNORE INTO app_wishlists (user_id, product_id) VALUES (:u, :p)',
    { u: uid, p: pid }
  );
  try {
    await cache.invalidateByKey(`wishlist:v1:user:${uid}`);
  } catch (e) { console.error('[wishlist] invalidate failed', e && e.message ? e.message : e); }
  res.json({ ok: true });
});

/**
 * DELETE /api/wishlist/:productId
 * Removes a product from wishlist
 */
router.delete('/:productId', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const pid = Number(req.params.productId);
  await pool.query(
    'DELETE FROM app_wishlists WHERE user_id = :u AND product_id = :p',
    { u: uid, p: pid }
  );
  try {
    await cache.invalidateByKey(`wishlist:v1:user:${uid}`);
  } catch (e) { console.error('[wishlist] invalidate failed', e && e.message ? e.message : e); }
  res.json({ ok: true });
});

export default router;
