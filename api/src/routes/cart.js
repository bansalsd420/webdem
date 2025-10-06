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
  throw new Error('ensureCart(uid) requires location_id — use ensureCartForLocation(uid, loc)');
}

async function ensureCartForLocation(uid, locationId) {
  const [[row]] = await pool.query(
    'SELECT id FROM app_carts WHERE user_id = :u AND location_id = :l LIMIT 1',
    { u: uid, l: locationId }
  );
  if (row?.id) return row.id;
  const [ins] = await pool.query(
    'INSERT INTO app_carts (user_id, location_id) VALUES (:u, :l)',
    { u: uid, l: locationId }
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
async function loadCartDTO(cartId, cid, locationId) {
  // Load lines
  const [rows] = await pool.query(
    `SELECT i.id, i.product_id, i.variation_id, i.qty,
            p.name AS product_name, p.image AS product_image, p.sku AS product_sku,
            v.sub_sku AS variation_sku, v.name AS variation_name, v.id AS v_id,
            s.qty_available AS qty_here
       FROM app_cart_items i
       JOIN products   p ON p.id = i.product_id
       JOIN variations v ON v.id = i.variation_id
  LEFT JOIN variation_location_details s
         ON s.variation_id = i.variation_id AND s.location_id = :loc
      WHERE i.cart_id = :c
      ORDER BY i.id DESC`,
    { c: cartId, loc: locationId }
  );

  const pgId = cid ? await priceGroupIdForContact(cid, BIZ) : null;

  const items = await Promise.all(
    rows.map(async (r) => {
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
        price: price != null ? Number(price) : 0,
        stock: {
          in_stock: (Number(r.qty_here) || 0) > 0,
          qty_available: Number(r.qty_here) || 0,
          location_id: locationId
        }
      };
    })
  );
  return { id: cartId, items };
}
/* ------------------------------ GET ------------------------------ */
/* Price-group aware list (server is the source of truth) */
router.get('/', authRequired, async (req, res) => {
  try {
    const uid = getUid(req);
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const cid = getCid(req);
    const locationId = Number(req.query?.location_id);
    if (!Number.isFinite(locationId)) return res.status(400).json({ error: 'location_id_required' });

    const cartId = await ensureCartForLocation(uid, locationId);
    const dto = await loadCartDTO(cartId, cid, locationId);
    res.json(dto);
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
    const locationId = Number(req.body?.location_id);
    let qty = Math.max(1, Math.floor(Number(req.body?.qty || 1)));
    if (!Number.isFinite(productId) || !Number.isFinite(variationId)) {
      return res.status(400).json({ error: 'productId_and_variationId_required' });
    }
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: 'location_id_required' });
    }
    const cartId = await ensureCartForLocation(uid, locationId);

    const [[own]] = await pool.query(
      'SELECT id FROM variations WHERE id=:v AND product_id=:p LIMIT 1',
      { v: variationId, p: productId }
    );
    if (!own) return res.status(400).json({ error: 'variation_not_for_product' });

    // stock at this location
    const [[stock]] = await pool.query(
      `SELECT qty_available FROM variation_location_details
        WHERE variation_id=:v AND location_id=:l LIMIT 1`,
      { v: variationId, l: locationId }
    );
    const qtyHere = Number(stock?.qty_available) || 0;
    if (qtyHere <= 0) {
      return res.status(409).json({ error: 'oos', variation_id: variationId, location_id: locationId, available: 0 });
    }

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

    // return updated cart
    const cid = getCid(req);
    const dto = await loadCartDTO(cartId, cid, locationId);
    res.json(dto);
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
    const locationId = Number(req.body?.location_id);
    if (!Number.isFinite(lineId)) return res.status(400).json({ error: 'line_id_required' });
    if (!Number.isFinite(qty)) return res.status(400).json({ error: 'qty_required' });
    if (!Number.isFinite(locationId)) return res.status(400).json({ error: 'location_id_required' });
    if (qty <= 0) {
      await pool.query('DELETE FROM app_cart_items WHERE id=:id', { id: lineId });
    } else {
      await pool.query('UPDATE app_cart_items SET qty=:q WHERE id=:id', { q: qty, id: lineId });
    }
    const cartId = await ensureCartForLocation(uid, locationId);
    const cid = getCid(req);
    const dto = await loadCartDTO(cartId, cid, locationId);
    res.json(dto);
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
    const locationId = Number(req.query?.location_id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'line_id_required' });
    if (!Number.isFinite(locationId)) return res.status(400).json({ error: 'location_id_required' });
    await pool.query('DELETE FROM app_cart_items WHERE id=:id', { id });
    const cartId = await ensureCartForLocation(uid, locationId);
    const cid = getCid(req);
    const dto = await loadCartDTO(cartId, cid, locationId);
    res.json(dto);
  } catch (e) {
    console.error('DELETE /api/cart/remove/:id failed', e);
    res.status(500).json({ error: 'remove_line_failed' });
  }
});

router.post('/validate', authRequired, async (req, res) => {
  try {
    const uid = getUid(req);
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const locationId = Number(req.body?.location_id ?? req.query?.location_id);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: 'location_id_required' });
    }

    const cartId = await ensureCartForLocation(uid, locationId);

    // Load all lines for this cart
    const [lines] = await pool.query(
      `SELECT i.id AS line_id, i.variation_id, i.qty
         FROM app_cart_items i
        WHERE i.cart_id = :c`,
      { c: cartId }
    );

    if (!lines.length) {
      return res.json({ ok: true, checked_at: new Date().toISOString(), lines: [] });
    }

    // Fetch stock for all variations at this location in one round-trip
    const ids = lines.map(l => Number(l.variation_id)).filter(Boolean);
    const [stockRows] = await pool.query(
      `SELECT variation_id, qty_available
         FROM variation_location_details
        WHERE location_id = :l AND variation_id IN (${ids.map(() => '?').join(',')})`,
      [locationId, ...ids]
    );
    const stockMap = new Map(stockRows.map(r => [Number(r.variation_id), Number(r.qty_available) || 0]));

    const report = lines.map(l => {
      const available = stockMap.get(Number(l.variation_id)) ?? 0;
      const wanted = Math.max(0, Number(l.qty) || 0);
      const status = available <= 0 ? 'oos' : (wanted <= available ? 'ok' : 'insufficient');
      return {
        line_id: Number(l.line_id),
        variation_id: Number(l.variation_id),
        wanted,
        available,
        status
      };
    });

    const ok = report.every(r => r.status === 'ok');
    return res.json({
      ok,
      checked_at: new Date().toISOString(),
      lines: report
    });
  } catch (e) {
    console.error('POST /api/cart/validate failed', e);
    return res.status(500).json({ error: 'validate_failed' });
  }
});

export default router;
