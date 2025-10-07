// api/src/routes/cart.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { priceGroupIdForContact, priceForVariation } from '../lib/price.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 0);

/* ---------------------------- helpers ---------------------------- */

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function getUid(req) {
  const uid = Number(req.user?.uid);
  return Number.isFinite(uid) ? uid : null;
}
function getCid(req) {
  const cid = Number(req.user?.cid);
  return Number.isFinite(cid) ? cid : null;
}
function getLocationId(req) {
  // accept both query & body, camel & snake
  return n(
    req.body?.location_id ??
    req.body?.locationId ??
    req.query?.location_id ??
    req.query?.locationId
  );
}

function labelFromVariation(v) {
  return (
    v?.name ||
    v?.variant_name ||
    v?.sub_sku ||
    v?.sku ||
    v?.product_variation_name ||
    null
  );
}

/**
 * Return cart id for (user, location), creating it if needed, without race conditions.
 * Requires a composite UNIQUE KEY on app_carts(user_id, location_id).
 */
async function ensureCartForLocation(uid, locationId) {
  // Atomic upsert to avoid SELECT-then-INSERT races
  await pool.query(
    `INSERT INTO app_carts (user_id, location_id, created_at, updated_at)
     VALUES (:u, :l, NOW(), NOW())
     ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
    { u: uid, l: locationId }
  );

  const [[row]] = await pool.query(
    `SELECT id FROM app_carts WHERE user_id = :u AND location_id = :l LIMIT 1`,
    { u: uid, l: locationId }
  );
  if (!row?.id) throw new Error('cart_create_failed');
  return row.id;
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

async function loadCartDTO(cartId, cid, locationId) {
  // Load lines with location-aware stock
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
      const avail = Number(r.qty_here) || 0;
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
          in_stock: avail > 0,
          qty_available: avail,
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
    const locationId = getLocationId(req);
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: 'location_id_required' });
    }

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

    // accept both snake & camel
    const productId  = n(req.body?.product_id  ?? req.body?.productId);
    const variationId= n(req.body?.variation_id?? req.body?.variationId);
    let qty          = n(req.body?.quantity    ?? req.body?.qty);
    const locationId = getLocationId(req);

    if (!Number.isFinite(productId) || !Number.isFinite(variationId)) {
      return res.status(400).json({ error: 'product_and_variation_required' });
    }
    if (!Number.isFinite(locationId)) {
      return res.status(400).json({ error: 'location_id_required' });
    }
    qty = Math.max(1, Math.floor(qty || 1));

    const cartId = await ensureCartForLocation(uid, locationId);

    // Validate variant belongs to product
    const [[own]] = await pool.query(
      'SELECT id FROM variations WHERE id=:v AND product_id=:p LIMIT 1',
      { v: variationId, p: productId }
    );
    if (!own) return res.status(400).json({ error: 'variation_not_for_product' });

    // Stock at this location
    const [[stock]] = await pool.query(
      `SELECT qty_available FROM variation_location_details
        WHERE variation_id=:v AND location_id=:l LIMIT 1`,
      { v: variationId, l: locationId }
    );
    const available = Number(stock?.qty_available) || 0;
    if (available <= 0) {
      return res.status(409).json({ error: 'oos', variation_id: variationId, location_id: locationId, available: 0 });
    }

    // If line exists, make sure new total won't exceed availability
    const existing = await findLine(cartId, productId, variationId);
    const newTotal = (Number(existing?.qty) || 0) + qty;
    if (newTotal > available) {
      return res.status(409).json({ error: 'insufficient_stock', available, wanted: newTotal });
    }

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

    const lineId    = n(req.body?.id);
    let qty         = n(req.body?.qty ?? req.body?.quantity);
    const locationId= getLocationId(req);

    if (!Number.isFinite(lineId)) return res.status(400).json({ error: 'line_id_required' });
    if (!Number.isFinite(qty))     return res.status(400).json({ error: 'qty_required' });
    if (!Number.isFinite(locationId)) return res.status(400).json({ error: 'location_id_required' });

    if (qty <= 0) {
      await pool.query('DELETE FROM app_cart_items WHERE id=:id', { id: lineId });
    } else {
      // verify stock for the target variation at this location
      const [[line]] = await pool.query(
        `SELECT i.product_id, i.variation_id
           FROM app_cart_items i
          WHERE i.id=:id
          LIMIT 1`,
        { id: lineId }
      );
      if (!line) {
        return res.status(404).json({ error: 'line_not_found' });
      }
      const [[stock]] = await pool.query(
        `SELECT qty_available FROM variation_location_details
          WHERE variation_id=:v AND location_id=:l LIMIT 1`,
        { v: line.variation_id, l: locationId }
      );
      const available = Number(stock?.qty_available) || 0;
      if (available <= 0) {
        // deleting is more appropriate, but keep consistent with add: block & inform
        return res.status(409).json({ error: 'oos', available: 0 });
      }
      if (qty > available) {
        return res.status(409).json({ error: 'insufficient_stock', available, wanted: qty });
      }
      await pool.query('UPDATE app_cart_items SET qty=:q WHERE id=:id', { q: Math.max(1, Math.floor(qty)), id: lineId });
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

    const id = n(req.params?.id);
    const locationId = getLocationId(req);
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

/* ----------------------------- VALIDATE ----------------------------- */
router.post('/validate', authRequired, async (req, res) => {
  try {
    const uid = getUid(req);
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const locationId = getLocationId(req);
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
