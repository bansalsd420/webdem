import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID);

/**
 * GET /api/filters
 * Query: q, categoryId, subCategoryId
 * Returns: { brands[], categories[], subcategories[] } each with {id,name,count}
 */
router.get('/', async (req, res) => {
  try {
    const { q = '', categoryId, subCategoryId } = req.query;

    const whereParts = [
      'p.business_id = :bid',
      'p.is_inactive = 0',
      'p.not_for_selling = 0',
    ];
    const params = { bid: BIZ };

    if (typeof q === 'string' && q.trim() !== '') {
      whereParts.push('(p.name LIKE :q OR p.sku LIKE :q)');
      params.q = `%${q.trim()}%`;
    }

    const cat = Number(categoryId);
    const hasCat = Number.isFinite(cat);
    if (hasCat) {
      whereParts.push('p.category_id = :cat');
      params.cat = cat;
    }

    const sub = Number(subCategoryId);
    const hasSub = Number.isFinite(sub);
    if (hasSub) {
      whereParts.push('p.sub_category_id = :sub');
      params.sub = sub;
    }

    const where = whereParts.join(' AND ');

    const [brands] = await pool.query(
      `
      SELECT b.id, b.name, COUNT(*) AS count
        FROM products p
        JOIN brands b ON b.id = p.brand_id
       WHERE ${where}
       GROUP BY b.id, b.name
       ORDER BY b.name
      `,
      params
    );

    const [categories] = await pool.query(
      `
      SELECT c.id, c.name, COUNT(*) AS count
        FROM products p
        JOIN categories c ON c.id = p.category_id
       WHERE ${where}
       GROUP BY c.id, c.name
       ORDER BY c.name
      `,
      params
    );

    const [subcats] = await pool.query(
      `
      SELECT sc.id, sc.name, COUNT(*) AS count
        FROM products p
        JOIN categories sc ON sc.id = p.sub_category_id
       WHERE ${where}
       GROUP BY sc.id, sc.name
       ORDER BY sc.name
      `,
      params
    );

    res.json({ brands, categories, subcategories: subcats });
  } catch (err) {
    console.error('filters error', err);
    res.status(500).json({ error: 'filters_failed' });
  }
});

export default router;
