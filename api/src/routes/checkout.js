import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { erpFetch } from '../lib/erp.js';
import { priceGroupIdForContact, priceForVariation } from '../lib/price.js';
import cache from '../lib/cache.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 0);
const DEFAULT_LOCATION_ID = Number(process.env.POS_LOCATION_ID || 1);

/* ---------------------------- helpers ---------------------------- */

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

async function listLocations() {
  const [rows] = await pool.query(
    `SELECT id, name
       FROM business_locations
      WHERE business_id = :bid
      ORDER BY name`,
    { bid: BIZ }
  );
  return rows || [];
}

async function resolveContactId(req, bodyOverrideContactId) {
  const override = n(bodyOverrideContactId);
  if (override) return override;

  const fromJwt = n(req.user?.cid);
  if (fromJwt) return fromJwt;

  const uid = n(req.user?.uid);
  if (!uid) return null;

  const [[u]] = await pool.query(
    'SELECT contact_id FROM app_auth_users WHERE id = :id LIMIT 1',
    { id: uid }
  );
  return n(u?.contact_id);
}

async function loadServerCartItems(uid) {
  const [[cart]] = await pool.query(
    'SELECT id FROM app_carts WHERE user_id=:u LIMIT 1',
    { u: uid }
  );
  if (!cart?.id) return { id: null, items: [] };

  const [rows] = await pool.query(
    `SELECT i.id, i.product_id, i.variation_id, i.qty
       FROM app_cart_items i
      WHERE i.cart_id = :c
      ORDER BY i.id`,
    { c: cart.id }
  );
  const items = rows.map(r => ({
    product_id: n(r.product_id),
    variation_id: n(r.variation_id),
    quantity: Math.max(1, Number(r.qty || 1)),
  }));
  return { id: cart.id, items };
}

async function clearUserCart(uid) {
  // Best-effort cart cleanup; do not throw outward.
  try {
    const [[cart]] = await pool.query(
      'SELECT id FROM app_carts WHERE user_id=:u LIMIT 1',
      { u: uid }
    );
    if (!cart?.id) return { ok: true, cleared: 0 };

    const [del] = await pool.query(
      'DELETE FROM app_cart_items WHERE cart_id=:c',
      { c: cart.id }
    );
    return { ok: true, cleared: del?.affectedRows ?? 0 };
  } catch (e) {
    console.error('[checkout] clearUserCart failed', e);
    return { ok: false, cleared: 0, error: String(e) };
  }
}

/** Extract {id, invoice_no} from many possible ERP response shapes */
function extractSell(resp) {
  // 1) { data: [ {...} ] }
  if (resp && Array.isArray(resp.data) && resp.data[0]) {
    const f = resp.data[0];
    return { id: f.id ?? null, invoice_no: f.invoice_no ?? null };
  }
  // 2) { data: {...} }
  if (resp && resp.data && !Array.isArray(resp.data) && typeof resp.data === 'object') {
    const f = resp.data;
    return { id: f.id ?? null, invoice_no: f.invoice_no ?? null };
  }
  // 3) [ {...} ]  ← live connector sometimes returns this
  if (Array.isArray(resp) && resp[0] && typeof resp[0] === 'object') {
    const f = resp[0];
    return { id: f.id ?? null, invoice_no: f.invoice_no ?? null };
  }
  // 4) { id, invoice_no, ... }
  if (resp && typeof resp === 'object') {
    return { id: resp.id ?? null, invoice_no: resp.invoice_no ?? null };
  }
  return { id: null, invoice_no: null };
}

/* ----------------------------- bootstrap ----------------------------- */

router.get('/bootstrap', authRequired, async (_req, res) => {
  try {
    const locations = await listLocations();
    const defId = locations.find(Boolean)?.id || DEFAULT_LOCATION_ID;
    res.json({ locations, default_location_id: defId, business_id: BIZ });
  } catch (e) {
    console.error('[checkout/bootstrap]', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ----------------------------- create sell ----------------------------- */

router.post('/create', authRequired, async (req, res) => {
  const startedAt = Date.now();
  try {
    const uid = n(req.user?.uid);
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const contact_id = await resolveContactId(req, req.body?.contact_id);
    if (!contact_id) return res.status(400).json({ error: 'no_contact_id' });

    let location_id = n(req.body?.location_id ?? req.body?.location ?? req.body?.locationId);
    if (!location_id) {
      const locations = await listLocations();
      location_id = locations.find(Boolean)?.id || DEFAULT_LOCATION_ID;
    }

    // Source lines: prefer body.products; else server cart
    let rawLines = [];
    if (Array.isArray(req.body?.products) && req.body.products.length) {
      rawLines = req.body.products.map(p => ({
        product_id: n(p.product_id ?? p.productId ?? p.pid) || null,
        variation_id: n(p.variation_id ?? p.variationId),
        quantity: Math.max(1, Number(p.quantity ?? p.qty ?? 1))
      }));
    } else {
      const { items } = await loadServerCartItems(uid);
      rawLines = items;
    }
    if (!rawLines.length) return res.status(400).json({ error: 'products_required' });

    // Price group & server-side price calc
    const pgId = await priceGroupIdForContact(contact_id, BIZ);

    const products = [];
    for (const line of rawLines) {
      const vid = n(line.variation_id);
      const pid = n(line.product_id);
      const qty = Math.max(1, Number(line.quantity || 1));
      if (!vid || !qty) continue;

      const unit = await priceForVariation(vid, pgId ?? null);
      const out = { variation_id: vid, quantity: qty };
      if (pid) out.product_id = pid;
      if (unit != null) out.unit_price = Number(unit); // connector accepts plain unit_price
      products.push(out);
    }
    if (!products.length) return res.status(400).json({ error: 'no_valid_lines' });

    // Visibility pre-check: ensure none of the products are hidden for this requester
    try {
      // Build shaped items. Some lines may lack product_id (only variation present)
      const shaped = rawLines.map(l => ({ id: n(l.product_id) || null, variation_id: n(l.variation_id) || null, category_id: null, sub_category_id: null }));

      // Resolve product_id for lines that only have a variation_id
      const missingPidVids = shaped.filter(s => !s.id && Number.isFinite(s.variation_id)).map(s => s.variation_id);
      if (missingPidVids.length) {
        const placeholders = missingPidVids.map(() => '?').join(',');
        const [vrows] = await pool.query(
          `SELECT id, product_id FROM variations WHERE id IN (${placeholders})`,
          missingPidVids
        );
        const vidToPid = new Map(vrows.map(r => [Number(r.id), Number(r.product_id)]));
        for (const s of shaped) {
          if (!s.id && Number.isFinite(s.variation_id) && vidToPid.has(s.variation_id)) {
            s.id = vidToPid.get(s.variation_id) || null;
          }
        }
      }

      // Fetch category/subcategory for all resolved product ids
      const finalPids = Array.from(new Set(shaped.map(s => Number(s.id)).filter(Boolean)));
      if (finalPids.length) {
        const placeholders = finalPids.map(() => '?').join(',');
        const [prows] = await pool.query(
          `SELECT id, category_id, sub_category_id FROM products WHERE id IN (${placeholders})`,
          finalPids
        );
        const byId = new Map(prows.map(r => [Number(r.id), r]));
        for (const s of shaped) {
          const pid = Number(s.id);
          if (pid && byId.has(pid)) {
            s.category_id = byId.get(pid).category_id;
            s.sub_category_id = byId.get(pid).sub_category_id;
          }
        }
      }

      // Perform visibility filter (treat checkout as user view)
      const allowed = await categoryVisibility.filterProducts(shaped, false, BIZ);
      const allowedIds = new Set(allowed.map(x => Number(x.id)));
      const blocked = shaped.filter(s => s.id && !allowedIds.has(Number(s.id))).map(s => s.id);
      if (blocked.length) {
        return res.status(404).json({ error: 'product_not_found', blocked });
      }
    } catch (e) {
      console.warn('[checkout] visibility pre-check failed', e && e.message ? e.message : e);
      // proceed best-effort
    }

    const sell = {
      business_id: BIZ,
      location_id,
      type: 'sell',
      status: req.body?.status || 'final',
      is_quotation: 0,
      payment_status: req.body?.payment_status || 'due',
      contact_id,
      selling_price_group_id: pgId ?? undefined,
      // optional envelope
      shipping_details: req.body?.shipping_details || undefined,
      shipping_address: req.body?.shipping_address || undefined,
      discount_type: req.body?.discount_type || undefined,
      discount_amount: req.body?.discount_amount ?? undefined,
      // lines & optional payments
      products,
      payments: Array.isArray(req.body?.payments) ? req.body.payments : undefined,
    };

    const payload = { sells: [sell] };

    console.log('[checkout/create] payload summary', {
      contact_id, location_id, price_group_id: pgId ?? null, lines: products.length,
      tookMs_prepare: Date.now() - startedAt
    });

    const resp = await erpFetch('/sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      query: { business_id: BIZ },
      body: JSON.stringify(payload)
    });

    const { id, invoice_no } = extractSell(resp);
    console.log('[checkout/create] ERP extract', { id, invoice_no, type: Array.isArray(resp) ? 'array' : typeof resp });

    if (!id && !invoice_no) {
      return res.status(502).json({
        error: 'sell_not_created',
        connector_body: resp
      });
    }

    // ---- Best-effort cart cleanup (does NOT affect success) ----
    const clear = await clearUserCart(uid);
    console.log('[checkout/create] cart cleared', clear);
    // Best-effort invalidate product list caches since stock/availability may have changed
    try {
      await cache.invalidateByKey('products:v1:*');
    } catch (e) { console.error('[checkout] invalidate products after create failed', e && e.message ? e.message : e); }

    return res.json({ ok: true, id, invoice_no, data: resp });
  } catch (e) {
    console.error('[checkout/create] error', e);
    const status = Number.isInteger(e?.status) ? e.status : 502;
    return res.status(status).json({ error: 'connector_unavailable', detail: e?.body || e?.message || String(e) });
  }
});

export default router;
