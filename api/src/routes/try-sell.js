// api/src/routes/try-sell.js
import { Router } from 'express';
import { pool } from '../db.js';
import { erpFetch } from '../lib/erp.js';
import { priceGroupIdForContact, priceForVariation } from '../lib/price.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 0);

/* ------------------------- helpers ------------------------- */

async function resolveContactId(req, explicitCid) {
  // 1) explicit query wins
  if (explicitCid && Number.isFinite(Number(explicitCid))) return Number(explicitCid);

  // 2) JWT (auth middleware populates req.user)
  const jwtCid = Number(req.user?.cid);
  if (Number.isFinite(jwtCid)) return jwtCid;

  // 3) app_auth_users mapping (uid -> contact_id)
  const uid = Number(req.user?.uid);
  if (Number.isFinite(uid)) {
    const [[row]] = await pool.query(
      'SELECT contact_id FROM app_auth_users WHERE id = :uid LIMIT 1',
      { uid }
    );
    if (row?.contact_id) return Number(row.contact_id);
  }

  return 753;
}

function pickNumber(n, fallback = null) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function shortBody(x) {
  try {
    if (!x) return x;
    const s = typeof x === 'string' ? x : JSON.stringify(x);
    return s.length > 1200 ? s.slice(0, 1200) + '…(trunc)' : s;
  } catch {
    return x;
  }
}

// Build the JSON body the ERP accepts (sells[0] with products[])
function buildJsonBody({ business_id, contact_id, location_id, price_group_id, lines }) {
  return {
    sells: [
      {
        business_id,
        contact_id,
        location_id,
        type: 'sell',
        status: 'final',
        payment_status: 'due',
        // The connector accepted unit_price with zero tax, so pg-only pricing is OK.
        selling_price_group_id: price_group_id ?? undefined,
        products: lines.map((l) => ({
          product_id: l.product_id,
          variation_id: l.variation_id,
          quantity: l.quantity,
          unit_price: l.unit_price, // use ERP price (ex-tax) we resolved
        })),
      },
    ],
  };
}

// Build the form-encoded equivalent for the same structure
function buildFormBody({ business_id, contact_id, location_id, price_group_id, lines }) {
  const qp = new URLSearchParams();
  const s = (k, v) => qp.set(k, String(v));

  s('sells[0][business_id]', business_id);
  s('sells[0][contact_id]', contact_id);
  s('sells[0][location_id]', location_id);
  s('sells[0][type]', 'sell');
  s('sells[0][status]', 'final');
  s('sells[0][payment_status]', 'due');
  if (price_group_id != null) s('sells[0][selling_price_group_id]', price_group_id);

  lines.forEach((l, i) => {
    if (l.product_id != null) s(`sells[0][products][${i}][product_id]`, l.product_id);
    s(`sells[0][products][${i}][variation_id]`, l.variation_id);
    s(`sells[0][products][${i}][quantity]`, l.quantity);
    s(`sells[0][products][${i}][unit_price]`, l.unit_price);
  });

  return qp.toString();
}

// Try one POST; extract id/invoice_no regardless of array/object shapes
function extractIdInvoice(body) {
  // common patterns
  const candidates = [
    body,
    body?.data,
    Array.isArray(body) ? body[0] : null,
    Array.isArray(body?.data) ? body.data[0] : null,
  ].filter(Boolean);

  for (const c of candidates) {
    const id = c?.id ?? null;
    const inv = c?.invoice_no ?? null;
    if (id || inv) return { id, invoice_no: inv };
  }
  return { id: null, invoice_no: null };
}

async function attemptJson(payload) {
  const res = await erpFetch('/sell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    query: { business_id: BIZ },
  });
  const { id, invoice_no } = extractIdInvoice(res);
  return { ok: Boolean(id || invoice_no), status: 200, body: res, id, invoice_no };
}

async function attemptForm(payload) {
  const body = buildFormBody(payload);
  const res = await erpFetch('/sell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    query: { business_id: BIZ },
  });
  const { id, invoice_no } = extractIdInvoice(res);
  return { ok: Boolean(id || invoice_no), status: 200, body: res, id, invoice_no };
}

/* --------------------------- route --------------------------- */
/**
 * GET /api/try-sell/run
 * Query:
 *   product_id, variation_id, qty, location_id, [contact_id]
 * Example:
 *   /api/try-sell/run?product_id=8142&variation_id=8635&qty=1&location_id=12
 */
router.get('/run', async (req, res) => {
  try {
    const product_id = pickNumber(req.query.product_id);
    const variation_id = pickNumber(req.query.variation_id);
    const quantity = Math.max(1, pickNumber(req.query.qty, 1));
    const location_id = pickNumber(req.query.location_id);
    const explicitCid = pickNumber(req.query.contact_id);

    if (!product_id || !variation_id || !location_id) {
      return res.status(400).json({
        ok: false,
        reason: 'missing_params',
        need: { product_id: Boolean(product_id), variation_id: Boolean(variation_id), location_id: Boolean(location_id) },
      });
    }

    const contact_id = await resolveContactId(req, explicitCid);
    if (!contact_id) {
      return res.status(400).json({ ok: false, reason: 'no_contact_id', message: 'Could not resolve contact_id from JWT or DB.' });
    }

    // Price group for this contact & price for variation in that group
    const price_group_id = await priceGroupIdForContact(contact_id, BIZ);
    const unit_price_raw = await priceForVariation(variation_id, price_group_id ?? null);
    const unit_price = Number(unit_price_raw ?? 0);

    if (!Number.isFinite(unit_price) || unit_price <= 0) {
      return res.status(400).json({
        ok: false,
        reason: 'no_price_for_variation',
        detail: { variation_id, price_group_id, unit_price_raw },
      });
    }

    // Build common lines & payload
    const lines = [{ product_id, variation_id, quantity, unit_price }];
    const payload = { business_id: BIZ, contact_id, location_id, price_group_id, lines };

    // Log what we will send (concise)
    // eslint-disable-next-line no-console
    console.log('[try-sell] contact:', contact_id, 'location:', location_id, 'pg:', price_group_id, 'variation:', variation_id, 'qty:', quantity, 'unit_price:', unit_price);

    const attempts = {};

    // 1) JSON (sells[]/products[])
    const jsonBody = buildJsonBody(payload);
    // eslint-disable-next-line no-console
    console.log('[try-sell] JSON payload:', shortBody(jsonBody));
    try {
      const r = await attemptJson(jsonBody);
      attempts['json:sells:products'] = {
        ok: r.ok,
        status: r.status,
        body: r.ok ? { id: r.id, invoice_no: r.invoice_no } : shortBody(r.body),
      };
      if (r.ok) return res.json({ ok: true, contact_id, location_id, price_group_id, variation_id, quantity, id: r.id, invoice_no: r.invoice_no, via: 'json' });
    } catch (e) {
      attempts['json:sells:products'] = { ok: false, error: String(e?.message || e) };
    }

    // 2) FORM (same structure)
    // eslint-disable-next-line no-console
    console.log('[try-sell] FORM payload:', shortBody(buildFormBody(payload)));
    try {
      const r = await attemptForm(payload);
      attempts['form:sells:products'] = {
        ok: r.ok,
        status: r.status,
        body: r.ok ? { id: r.id, invoice_no: r.invoice_no } : shortBody(r.body),
      };
      if (r.ok) return res.json({ ok: true, contact_id, location_id, price_group_id, variation_id, quantity, id: r.id, invoice_no: r.invoice_no, via: 'form' });
    } catch (e) {
      attempts['form:sells:products'] = { ok: false, error: String(e?.message || e) };
    }

    return res.status(200).json({
      ok: false,
      reason: 'sell_not_created',
      contact_id,
      location_id,
      price_group_id,
      variation_id,
      quantity,
      attempts,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[try-sell/run] fatal', err);
    return res.status(502).json({ ok: false, reason: 'fatal', error: String(err?.message || err) });
  }
});

export default router;
