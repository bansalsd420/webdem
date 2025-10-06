import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { priceGroupIdForContact, priceForVariation } from '../lib/price.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 0);

/* ---------------------------- helpers ---------------------------- */

function getUid(req) {
  const uid = Number(req.user?.uid);
  return Number.isFinite(uid) ? uid : null;
}
function getCid(req) {
  const cid = Number(req.user?.cid);
  return Number.isFinite(cid) ? cid : null;
}

async function ensureCart(uid) {
  const [[row]] = await pool.query(
    'SELECT id FROM app_carts WHERE user_id = :u LIMIT 1',
    { u: uid }
  );
  if (row?.id) return row.id;
  const [ins] = await pool.query(
    'INSERT INTO app_carts (user_id) VALUES (:u)',
    { u: uid }
  );
  return ins.insertId;
}

async function findLine(cartId, productId, variationId) {
  const [[row]] = await pool.query(
    `SELECT id, qty
       FROM app_cart_items
      WHERE cart_id=:c AND product_id=:p AND variation_id=:v
      LIMIT 1`,
    { c: cartId, p: productId, v: variationId }
  );
  return row || null;
}

function labelFromVariation(v) {
  return v?.name || v?.variant_name || v?.sub_sku || v?.sku || v?.product_variation_name || null;
}

/* ------------------------------ GET ------------------------------ */
/* Price-group aware list (server is the source of truth) */
router.get('/', authRequired, async (req, res) => {
  try {
    const uid = getUid(req);
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const cid = getCid(req);
    const cartId = await ensureCart(uid);

    const [rows] = await pool.query(
      `SELECT i.id, i.product_id, i.variation_id, i.qty,
              p.name AS product_name, p.image AS product_image, p.sku AS product_sku,
              v.sub_sku AS variation_sku, v.name AS variation_name, v.id AS v_id
         FROM app_cart_items i
         JOIN products   p ON p.id = i.product_id
         JOIN variations v ON v.id = i.variation_id
        WHERE i.cart_id = :c
        ORDER BY i.id DESC`,
      { c: cartId }
    );

    const pgId = cid ? await priceGroupIdForContact(cid, BIZ) : null;

    const items = await Promise.all(rows.map(async r => {
      const price = await priceForVariation(r.v_id, pgId ?? null);
      return {
        id: r.id,
        product_id: r.product_id,
        variation_id: r.variation_id,
        qty: Number(r.qty),
        name: r.product_name,
        image: r.product_image,
        sku: r.product_sku || r.variation_sku || null,
        variant_label: labelFromVariation({ name: r.variation_name, sub_sku: r.variation_sku }),
        variant_sku: r.variation_sku || null,
        price: price != null ? Number(price) : 0
      };
    }));

    res.json({ id: cartId, items });
  } catch (e) {
    console.error('GET /api/cart failed', e);
    res.status(500).json({ error: 'failed_to_load_cart' });
  }
});

/* ------------------------------ ADD ------------------------------ */
router.post('/add', authRequired, async (req, res) => {
  try {
    const uid = getUid(req);
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const productId = Number(req.body?.productId);
    const variationId = Number(req.body?.variationId);
    let qty = Math.max(1, Math.floor(Number(req.body?.qty || 1)));
    if (!Number.isFinite(productId) || !Number.isFinite(variationId)) {
      return res.status(400).json({ error: 'productId_and_variationId_required' });
    }

    const cartId = await ensureCart(uid);

    const [[own]] = await pool.query(
      'SELECT id FROM variations WHERE id=:v AND product_id=:p LIMIT 1',
      { v: variationId, p: productId }
    );
    if (!own) return res.status(400).json({ error: 'variation_not_for_product' });

    const existing = await findLine(cartId, productId, variationId);
    if (existing) {
      await pool.query('UPDATE app_cart_items SET qty = qty + :q WHERE id = :id', { q: qty, id: existing.id });
    } else {
      await pool.query(
        `INSERT INTO app_cart_items (cart_id, product_id, variation_id, qty)
         VALUES (:c, :p, :v, :q)`,
        { c: cartId, p: productId, v: variationId, q: qty }
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/cart/add failed', e);
    res.status(500).json({ error: 'add_to_cart_failed' });
  }
});

/* ---------------------------- UPDATE QTY ---------------------------- */
router.patch('/update', authRequired, async (req, res) => {
  try {
    const uid = getUid(req);
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const lineId = Number(req.body?.id);
    let qty = Math.floor(Number(req.body?.qty));
    if (!Number.isFinite(lineId)) return res.status(400).json({ error: 'line_id_required' });
    if (!Number.isFinite(qty)) return res.status(400).json({ error: 'qty_required' });

    if (qty <= 0) {
      await pool.query('DELETE FROM app_cart_items WHERE id=:id', { id: lineId });
    } else {
      await pool.query('UPDATE app_cart_items SET qty=:q WHERE id=:id', { q: qty, id: lineId });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/cart/update failed', e);
    res.status(500).json({ error: 'update_qty_failed' });
  }
});

/* ----------------------------- REMOVE ----------------------------- */
router.delete('/remove/:id', authRequired, async (req, res) => {
  try {
    const uid = getUid(req);
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const id = Number(req.params?.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'line_id_required' });

    await pool.query('DELETE FROM app_cart_items WHERE id=:id', { id });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/cart/remove/:id failed', e);
    res.status(500).json({ error: 'remove_line_failed' });
  }
});

export default router;
