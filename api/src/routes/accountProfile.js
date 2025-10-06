// api/src/routes/accountProfile.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { erpGet, erpFetch } from '../lib/erp.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 0);

// ---------------- micro cache (120s) ----------------
const TTL = 120_000;
const cache = {
  profile: new Map(),   // key: `${BIZ}:${cid}`
  addresses: new Map(),
  summary: new Map(),
};
const now = () => Date.now();
const getC = (m, k) => { const v = m.get(k); if (v && v.exp > now()) return v.data; m.delete(k); return null; };
const setC = (m, k, data) => m.set(k, { data, exp: now() + TTL });

// ---------------- helpers ----------------
async function getIdentity(req) {
  // Prefer JWT claims if present; fall back to DB mapping like before
  const cidClaim = req.user?.cid ?? req.user?.contact_id ?? req.user?.contactId ?? null;
  if (cidClaim) return { cid: Number(cidClaim) || cidClaim, email: req.user?.email ?? null };

  const uid = req.user?.uid ?? req.user?.id;
  if (!uid) return { cid: null, email: null };

  const [[row]] = await pool.query(
    'SELECT contact_id AS cid, email FROM app_auth_users WHERE id = :id LIMIT 1',
    { id: uid }
  );
  return row || { cid: null, email: null };
}

function unwrap(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload.data)) return payload.data[0] || null;
  return payload;
}

async function fetchContact({ cid, email }) {
  // Try by numeric id (common)
  if (cid) {
    try {
      const obj = await erpGet(`/contactapi/${cid}`, { query: { business_id: BIZ } });
      const first = unwrap(obj);
      if (first) return first;
    } catch {/* continue */}
  }
  // Try list endpoint with contact_id filter
  try {
    const obj = await erpGet('/contactapi', { query: { business_id: BIZ, contact_id: cid, per_page: 1 } });
    const first = unwrap(obj);
    if (first) return first;
  } catch {/* continue */}

  // Optional: DB fallback if ERP is down and we at least know cid
  if (cid) {
    try {
      const [[c]] = await pool.query(
        `SELECT id, name, supplier_business_name, email, mobile, phone, tax_number,
                address_line_1, address_line_2, city, state, country, zip_code,
                shipping_address, shipping_address_line_1, shipping_address_line_2,
                shipping_city, shipping_state, shipping_country, shipping_zip_code
           FROM contacts
          WHERE id = :cid AND business_id = :bid
          LIMIT 1`,
        { cid, bid: BIZ }
      );
      if (c) return c; // same shape keys we read below
    } catch {/* ignore */}
  }
  return null;
}

function pick(...vals) { for (const v of vals) if (v != null && v !== '') return v; return ''; }

function normalizeAddress(obj) {
  const line1 = pick(obj.address_line_1, obj.address1);
  const line2 = pick(obj.address_line_2, obj.address2);
  const city = pick(obj.city);
  const state = pick(obj.state);
  const country = pick(obj.country);
  const zip = pick(obj.zip_code, obj.zipcode, obj.zip);
  const blob = typeof obj.address === 'string' ? obj.address : '';

  const parts = [
    line1 || null,
    line2 || null,
    [city, state].filter(Boolean).join(', ') || null,
    [country, zip].filter(Boolean).join(' ') || null
  ].filter(Boolean);

  const full = parts.length ? parts.join('\n') : blob;
  return { line1, line2, city, state, country, zip, full };
}

function allowProfileUpdate(body = {}) {
  const out = {};
  if (typeof body.name === 'string') out.name = body.name.trim();
  if (typeof body.company === 'string') out.company = body.company.trim();
  if (typeof body.phone === 'string') out.mobile = body.phone.trim(); // store as "mobile"
  return out;
}

// ---------------- routes ----------------

// Probe ERP connectivity quickly
router.get('/health', authRequired, async (_req, res) => {
  try {
    const r = await erpFetch('/contactapi', { query: { business_id: BIZ, per_page: 1 } });
    return res.status(r?.status === 200 ? 200 : 502).json({ ok: r?.status === 200 });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET /api/account/profile
router.get('/profile', authRequired, async (req, res) => {
  try {
    const idn = await getIdentity(req);
    if (!idn?.cid && !idn?.email) return res.status(404).json({ error: 'user_not_found' });

    const key = `${BIZ}:${idn.cid}`;
    const hit = getC(cache.profile, key);
    if (hit) return res.json(hit);

    const c = await fetchContact(idn);
    if (!c) return res.status(404).json({ error: 'contact_not_found' });

    const payload = {
      id: c.id,
      contact_id: c.contact_id,
      name: c.name || '',
      company: c.supplier_business_name || c.company || '',
      email: c.email || '',
      phone: c.mobile || c.contact_no || c.phone || '',
      tax_number: c.tax_number || '',
      credit_limit: Number.isFinite(c.credit_limit) ? Number(c.credit_limit) : undefined,
      opening_balance: Number.isFinite(c.opening_balance) ? Number(c.opening_balance) : undefined,
      source: 'connector',
      raw: undefined, // keep response slim for FE; uncomment if you need raw
    };
    setC(cache.profile, key, payload);
    return res.json(payload);
  } catch {
    return res.status(502).json({ error: 'connector_unavailable' });
  }
});

// PUT /api/account/profile  (local DB write; limited fields)
router.put('/profile', authRequired, async (req, res) => {
  const idn = await getIdentity(req);
  if (!idn?.cid) return res.status(400).json({ error: 'missing_contact_id' });

  const updates = allowProfileUpdate(req.body || {});
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'empty_update' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const fields = [];
    const params = { cid: idn.cid, bid: BIZ };
    if ('name' in updates)   { fields.push('name = :name'); params.name = updates.name; }
    if ('company' in updates){ fields.push('supplier_business_name = :company'); params.company = updates.company; }
    if ('mobile' in updates) { fields.push('mobile = :mobile'); params.mobile = updates.mobile; }

    if (fields.length) {
      await conn.query(
        `UPDATE contacts SET ${fields.join(', ')} WHERE id = :cid AND business_id = :bid`,
        params
      );
    }

    await conn.commit();
    // bust cache
    cache.profile.delete(`${BIZ}:${idn.cid}`);
    return res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({ error: 'update_failed' });
  } finally {
    conn.release();
  }
});

// GET /api/account/addresses  (array; matches old UI)
router.get('/addresses', authRequired, async (req, res) => {
  try {
    const idn = await getIdentity(req);
    if (!idn?.cid && !idn?.email) return res.status(200).json([]);

    const key = `${BIZ}:${idn.cid}`;
    const hit = getC(cache.addresses, key);
    if (hit) return res.json(hit);

    const c = await fetchContact(idn);
    if (!c || typeof c !== 'object') return res.status(200).json([]);

    const bill = normalizeAddress({
      address_line_1: c.address_line_1,
      address_line_2: c.address_line_2,
      city: c.city, state: c.state, country: c.country, zip_code: c.zip_code,
      address: c.address,
    });

    const ship = normalizeAddress({
      address_line_1: c.shipping_address_line_1 ?? c.shipping_address_line1 ?? c.shipping_address,
      address_line_2: c.shipping_address_line_2 ?? c.shipping_address_line2 ?? '',
      city: c.shipping_city ?? '', state: c.shipping_state ?? '',
      country: c.shipping_country ?? '', zip_code: c.shipping_zip_code ?? c.shipping_zip ?? '',
      address: c.shipping_address ?? '',
    });

    const rows = [
      { type: 'Billing',  name: c.name || '', phone: c.mobile || c.phone || '', full: bill.full,  raw: bill },
      { type: 'Shipping', name: c.name || '', phone: c.mobile || c.phone || '', full: ship.full || bill.full, raw: ship.full ? ship : bill, is_default: true },
    ];

    setC(cache.addresses, key, rows);
    return res.json(rows);
  } catch {
    return res.status(200).json([]); // keep UI calm
  }
});

// GET /api/account/summary  (fast DB compute; cached)
router.get('/summary', authRequired, async (req, res) => {
  const idn = await getIdentity(req);
  if (!idn?.cid) return res.status(400).json({ error: 'missing_contact_id' });

  const key = `${BIZ}:${idn.cid}`;
  const hit = getC(cache.summary, key);
  if (hit) return res.json(hit);

  try {
    const [[tot]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN t.type='sell' AND t.status='final' THEN t.final_total ELSE 0 END), 0) AS sum_sell,
         COALESCE(SUM(CASE WHEN t.type='sell_return' AND t.status='final' THEN t.final_total ELSE 0 END), 0) AS sum_return,
         COALESCE(SUM(CASE WHEN t.type='sell' AND t.status='final' THEN 1 ELSE 0 END), 0) AS invoice_count
       FROM transactions t
       WHERE t.business_id = :bid AND t.contact_id = :cid`,
      { bid: BIZ, cid: idn.cid }
    );

    const [[pay]] = await pool.query(
      `SELECT COALESCE(SUM(tp.amount), 0) AS sum_paid
       FROM transaction_payments tp
       JOIN transactions t ON t.id = tp.transaction_id
       WHERE t.business_id = :bid AND t.contact_id = :cid AND t.type IN ('sell','opening_balance')`,
      { bid: BIZ, cid: idn.cid }
    );

    // Try contacts.opening_balance; fallback to OB transactions
    let opening = 0;
    try {
      const [[row]] = await pool.query(
        `SELECT COALESCE(c.opening_balance, 0) AS opening_balance
           FROM contacts c
          WHERE c.id = :cid AND c.business_id = :bid`,
        { cid: idn.cid, bid: BIZ }
      );
      opening = Number(row?.opening_balance || 0);
    } catch {
      const [[row2]] = await pool.query(
        `SELECT COALESCE(SUM(final_total), 0) AS opening_balance
           FROM transactions
          WHERE business_id = :bid AND contact_id = :cid
            AND type = 'opening_balance' AND status='final'`,
        { bid: BIZ, cid: idn.cid }
      );
      opening = Number(row2?.opening_balance || 0);
    }

    const totalSales = Number(tot.sum_sell || 0) - Number(tot.sum_return || 0);
    const totalPaid  = Number(pay.sum_paid || 0);
    const balance    = (opening + totalSales) - totalPaid;

    const resp = {
      opening_balance: opening,
      total_sales: totalSales,
      total_invoices: Number(tot.invoice_count || 0),
      total_paid: totalPaid,
      balance_due: balance > 0 ? balance : 0,
      advance_balance: balance < 0 ? Math.abs(balance) : 0,
    };

    setC(cache.summary, key, resp);
    return res.json(resp);
  } catch (e) {
    return res.status(500).json({ error: 'summary_failed' });
  }
});

export default router;
