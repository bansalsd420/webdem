import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { erpGet, erpFetch } from '../lib/erp.js';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 0);



// -------- helpers --------

async function getUserIdentity(uid) {
  const [[u]] = await pool.query(
    'SELECT contact_id AS cid, email FROM app_auth_users WHERE id = :id LIMIT 1',
    { id: uid }
  );
  
  return u || { cid: null, email: null };
}

function unwrap(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload.data)) return payload.data[0] || null;
  return payload;
}

async function fetchContact({ cid, email }) {
  // Try /contactapi/:id (works when cid is numeric PK on many installs)
  if (cid) {
    try {
     const obj = await erpGet(`/contactapi/${cid}`, { query: { business_id: BIZ } });
      const first = unwrap(obj);
      if (first) return first;
    } catch {/* continue */ }
  }

  // Try /contactapi?contact_id=<code or id> (docs: contact list supports "contact_id")
  try {
   const obj = await erpGet('/contactapi', { query: { contact_id: cid, business_id: BIZ, per_page: 1 } });
    const first = unwrap(obj);
    if (first) return first;
  } catch {/* continue */ }

  // No more guessing; API doesn't officially support ?email= filter in contact list (per docs).
  return null;
}

function pick(v, ...alts) {
  for (const k of [v, ...alts]) if (k != null && k !== '') return k;
  return '';
}

function normalizeAddress(obj) {
  const line1 = pick(obj.address_line_1, obj.address1);
  const line2 = pick(obj.address_line_2, obj.address2);
  const city = pick(obj.city);
  const state = pick(obj.state);
  const country = pick(obj.country);
  const zip = pick(obj.zip_code, obj.zipcode, obj.zip);
  const blob = typeof obj.address === 'string' ? obj.address : '';

  const parts = [line1 || null, line2 || null, [city, state].filter(Boolean).join(', ') || null, [country, zip].filter(Boolean).join(' ') || null].filter(Boolean);
  const full = parts.length ? parts.join('\n') : blob;
  return { line1, line2, city, state, country, zip, full };
}

// -------- routes --------

// quick probe: confirms token + resource
router.get('/health', authRequired, async (_req, res) => {
  try {
    const url = `/contactapi?business_id=${BIZ}&per_page=1`;
    const r = await erpFetch('/contactapi', { query: { business_id: BIZ, per_page: 1 } });
    const ok = r.ok;
    return res.status(ok ? 200 : 502).json({ ok, url, status: r.status, base: POS_CFG.BASE, prefix: POS_CFG.API_PREFIX });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET /api/account/profile
router.get('/profile', authRequired, async (req, res) => {
  try {
    const idn = await getUserIdentity(req.user.uid);
    if (!idn?.cid && !idn?.email) return res.status(404).json({ error: 'user_not_found' });

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
      source: 'connector', // for the UI badge
      raw: c,
    };

    return res.json(payload);
  } catch (e) {
    
    return res.status(502).json({ error: 'connector_unavailable' });
  }
});

// GET /api/account/addresses
router.get('/addresses', authRequired, async (req, res) => {
  try {
    const idn = await getUserIdentity(req.user.uid);
    if (!idn?.cid && !idn?.email) return res.status(200).json([]);

    const c = await fetchContact(idn);
    if (!c || typeof c !== 'object') return res.status(200).json([]);

    const bill = normalizeAddress({
      address_line_1: c.address_line_1,
      address_line_2: c.address_line_2,
      city: c.city,
      state: c.state,
      country: c.country,
      zip_code: c.zip_code,
      address: c.address,
    });

    const ship = normalizeAddress({
      address_line_1: c.shipping_address_line_1 ?? c.shipping_address_line1 ?? c.shipping_address,
      address_line_2: c.shipping_address_line_2 ?? c.shipping_address_line2 ?? '',
      city: c.shipping_city ?? '',
      state: c.shipping_state ?? '',
      country: c.shipping_country ?? '',
      zip_code: c.shipping_zip_code ?? c.shipping_zip ?? '',
      address: c.shipping_address ?? '',
    });

    return res.json([
      { type: 'Billing', name: c.name || '', phone: c.mobile || c.phone || '', full: bill.full, raw: bill },
      { type: 'Shipping', name: c.name || '', phone: c.mobile || c.phone || '', full: ship.full || bill.full, raw: ship.full ? ship : bill, is_default: true },
    ]);
  } catch (e) {
    
    return res.status(200).json([]); // keep UI calm
  }
});

export default router;
