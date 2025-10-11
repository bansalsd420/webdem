import { Router } from 'express';
import { pool } from '../db.js';
import { erpGetAny, listFrom } from '../lib/erp.js';
import categoryVisibility from '../lib/categoryVisibility.js';

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
  // Try ERP connector first (best-effort). If the connector is available and
  // returns product matches, prefer those results (they're fresher & richer).
  try {
    const qobj = { business_id: BIZ, per_page: 8, page: 1, name: q, search: q };
    const { data: erpData } = await erpGetAny(['/new_product', '/product', '/productapi', '/products'], { query: qobj });
    const list = listFrom(erpData || []);
    if (Array.isArray(list) && list.length) {
      // Prepare suggestions and run visibility filter to avoid leaking hidden items
      const mapped = list.slice(0, 8).map(p => {
        const id = p?.id ?? p?.product_id ?? null;
        const name = p?.name ?? p?.product_name ?? '';
        const sku = p?.sku ?? p?.product_sku ?? p?.code ?? '';
        const thumb = p?.image ?? p?.product_image ?? (Array.isArray(p?.images) ? p.images[0] : null) ?? null;
        return { raw: p, suggestion: { type: 'product', id, label: `${name} \u00b7 ${sku}`.trim(), thumbUrl: thumb || null } };
      }).filter(x => x.suggestion.id && x.suggestion.label);

      try {
        const shaped = mapped.map(m => ({ id: m.suggestion.id, category_id: m.raw?.category_id ?? m.raw?.category?.id, sub_category_id: m.raw?.sub_category_id ?? m.raw?.sub_category?.id }));
        const allowed = await categoryVisibility.filterProducts(shaped, true, BIZ);
        const allowedIds = new Set(allowed.map(x => x.id));
        const out = mapped.filter(m => allowedIds.has(m.suggestion.id)).map(m => m.suggestion);
        if (out.length) return res.json(out);
      } catch (e) {
        console.warn('[search] ERP suggestion visibility filter failed', e && e.message ? e.message : e);
        // fall through to DB fallback
      }
    }
  } catch (erpErr) {
    // If ERP fails, we'll silently fall back to local DB queries below.
    // Log at debug level so operators can inspect later.
    console.error('[search] ERP suggest failed, falling back to DB', erpErr?.status || erpErr?.message || erpErr);
  }

  // DB fallback: return mixed suggestions (products, categories, brands)
  const [products] = await pool.query(
    `SELECT id, name, sku, image, category_id, sub_category_id FROM products
     WHERE business_id=:bid AND is_inactive=0 AND not_for_selling=0
       AND (name LIKE :like OR sku LIKE :like)
     ORDER BY name LIMIT 12`,
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

  try {
    const shaped = products.map(p => ({ id: p.id, category_id: p.category_id, sub_category_id: p.sub_category_id }));
    const allowed = await categoryVisibility.filterProducts(shaped, true, BIZ);
    const allowedIds = new Set(allowed.map(x => x.id));
    return res.json([
      ...products.filter(p => allowedIds.has(p.id)).map(p => ({ type: 'product', id: p.id, label: `${p.name} \u00b7 ${p.sku}`, thumbUrl: p.image || null })),
      ...cats.map(c => ({ type: 'category', id: c.id, label: c.name })),
      ...brands.map(b => ({ type: 'brand', id: b.id, label: b.name }))
    ]);
  } catch (e) {
    console.warn('search suggest visibility filter failed', e && e.message ? e.message : e);
  }

  // Fallback: return unfiltered results if visibility check fails
  return res.json([
    ...products.map(p => ({ type: 'product', id: p.id, label: `${p.name} \u00b7 ${p.sku}`, thumbUrl: p.image || null })),
    ...cats.map(c => ({ type: 'category', id: c.id, label: c.name })),
    ...brands.map(b => ({ type: 'brand', id: b.id, label: b.name }))
  ]);
});

export default router;
