import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID);

/**
 * GET /api/search/suggest?q=...
 * Returns top few products / categories / brands labels for autosuggest
 */
router.get('/suggest', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);

  const like = `%${q.replace(/%/g, '')}%`;

  const [products] = await pool.query(
    `SELECT id, name, sku FROM products
     WHERE business_id=:bid AND is_inactive=0 AND not_for_selling=0
       AND (name LIKE :like OR sku LIKE :like)
     ORDER BY name LIMIT 6`,
    { bid: BIZ, like }
  );

  const [cats] = await pool.query(
    `SELECT id, name FROM categories
     WHERE business_id=:bid AND name LIKE :like
     ORDER BY name LIMIT 4`,
    { bid: BIZ, like }
  );

  const [brands] = await pool.query(
    `SELECT id, name FROM brands
     WHERE name LIKE :like ORDER BY name LIMIT 4`,
    { like }
  );

  res.json([
    ...products.map(p => ({ type: 'product', id: p.id, label: `${p.name} · ${p.sku}` })),
    ...cats.map(c => ({ type: 'category', id: c.id, label: c.name })),
    ...brands.map(b => ({ type: 'brand', id: b.id, label: b.name }))
  ]);
});

export default router;
