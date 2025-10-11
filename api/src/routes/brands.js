/* api/src/routes/brands.js */
import { Router } from 'express';
import { pool, queryWithRetry } from '../db.js';
import { authOptional } from '../middleware/auth.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 1);

/**
 * GET /api/brands?limit=8
 * Returns top brands by active product count for the current business.
 * Shape: [{ id, name, product_count }]
 */
router.get('/', authOptional, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 8)));
    const [rows] = await queryWithRetry(
      `
      SELECT b.id, b.name, COUNT(p.id) AS product_count
      FROM brands b
      JOIN products p ON p.brand_id = b.id
      WHERE p.business_id = :bid
        AND p.is_inactive = 0
        AND p.not_for_selling = 0
      GROUP BY b.id, b.name
      ORDER BY product_count DESC, b.name ASC
      LIMIT :lim
      `,
      { bid: BIZ, lim: limit }
    );
    res.json(rows);
  } catch (e) {
    console.error('brands list error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
