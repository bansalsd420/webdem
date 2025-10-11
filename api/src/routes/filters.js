import { Router } from 'express';
import { pool, queryWithRetry } from '../db.js';
import categoryVisibility from '../lib/categoryVisibility.js';

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

  // Legacy category-visibility removed -- no hidden params required.

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

    // Exclude hidden categories/subcategories for guests (filters are public)
    try {
      const rules = await categoryVisibility.loadRules(BIZ);
      const hiddenCats = Array.from(rules.guests.byCategory || []);
      if (hiddenCats.length) {
        const names = hiddenCats.map((_, i) => `:hid_cat_${i}`);
        whereParts.push(`p.category_id NOT IN (${names.join(',')})`);
        hiddenCats.forEach((v, i) => { params[`hid_cat_${i}`] = v; });
      }
      // For hidden subs, build a conditional excluding those ids
      const hiddenSubPairs = [];
      for (const [cid, sset] of (rules.guests.bySub || new Map())) {
        for (const sid of sset) hiddenSubPairs.push(sid);
      }
      if (hiddenSubPairs.length) {
        const names = hiddenSubPairs.map((_, i) => `:hid_sub_${i}`);
        whereParts.push(`(p.sub_category_id IS NULL OR p.sub_category_id NOT IN (${names.join(',')}))`);
        hiddenSubPairs.forEach((v, i) => { params[`hid_sub_${i}`] = v; });
      }
    } catch (e) {
      // ignore visibility failure
      console.warn('filters visibility load failed', e && e.message ? e.message : e);
    }

    const where = whereParts.join(' AND ');

      const [brands] = await queryWithRetry(
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

      const [categories] = await queryWithRetry(
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

      const [subcats] = await queryWithRetry(
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
    const code = err?.code;
    if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
      return res.status(502).json({ error: 'db_unreachable' });
    }
    if (code === 'ER_ACCESS_DENIED_ERROR') {
      return res.status(500).json({ error: 'db_auth_failed' });
    }
    return res.status(500).json({ error: 'filters_failed' });
  }
});

export default router;
