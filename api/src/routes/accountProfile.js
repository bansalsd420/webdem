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

  // Connector-first update: update remote ERP contact before committing local DB changes.
  // This keeps upstream as the source-of-truth and avoids drift.
  const remoteContact = await fetchContact(idn).catch(() => null);
  const remoteId = remoteContact && (remoteContact.id || remoteContact.contact_id || idn.cid);

  // Build connector payload with defensive required keys
  const deriveNameParts = (str) => {
    if (!str || typeof str !== 'string') return ['',''];
    const parts = str.trim().split(/\s+/);
    const first = parts.shift() || '';
    const last = parts.length ? parts.join(' ') : '';
    return [first, last];
  };

  const [givenFirst, givenLast] = deriveNameParts(updates.name || remoteContact?.name);
  const connectorPayload = {};
  if ('name' in updates) connectorPayload.name = updates.name;
  if ('company' in updates) connectorPayload.supplier_business_name = updates.company;
  if ('mobile' in updates) connectorPayload.mobile = updates.mobile;

  connectorPayload.first_name = remoteContact?.first_name || givenFirst || '';
  connectorPayload.last_name = remoteContact?.last_name || givenLast || '';
  connectorPayload.type = remoteContact?.type || 'customer';

  if (Object.keys(connectorPayload).length && remoteId) {
    try {
      await erpFetch(`/contactapi/${remoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectorPayload),
        query: { business_id: BIZ },
      });
    } catch (err) {
      console.error('PUT /api/account/profile connector update failed', err);
      return res.status(502).json({ error: 'connector_update_failed', details: err?.body || err?.message });
    }
  }

  // Local DB update (transactional)
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
    cache.addresses.delete(`${BIZ}:${idn.cid}`);
    return res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error('PUT /api/account/profile update_failed', e);
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

// PATCH /api/account/addresses
// Body examples:
// { type: 'Shipping', address: { line1, line2, city, state, country, zip }, name?, phone? }
// { type: 'Billing',  address: { ... } }
// { type: 'Both', billing: { ... }, shipping: { ... } }
// Only provided address objects are validated & updated. Unspecified fields remain unchanged.
router.patch('/addresses', authRequired, async (req, res) => {
  try {
    const idn = await getIdentity(req);
    if (!idn?.cid) return res.status(400).json({ error: 'missing_contact_id' });

    const body = req.body || {};
    const type = String(body.type || '').toLowerCase();

    const wantBilling = type === 'billing' || type === 'both';
    const wantShipping = type === 'shipping' || type === 'both';

    const updates = {};

    function normalizeInputAddress(obj) {
      if (!obj || typeof obj !== 'object') return null;
      const line1 = (obj.line1 || obj.address_line_1 || '').trim();
      const line2 = (obj.line2 || obj.address_line_2 || '').trim();
      const city = (obj.city || '').trim();
      const state = (obj.state || '').trim();
      const country = (obj.country || '').trim();
      const zip = (obj.zip || obj.zip_code || '').trim();
      const has = (v) => typeof v === 'string' && v.length;
      // Basic validation: require line1 + country (city optional but recommended) for a meaningful address.
      if (!has(line1) || !has(country)) return { invalid: true, line1, country };
      return { line1, line2, city, state, country, zip };
    }

    let billingIn = null;
    let shippingIn = null;
    if (wantBilling) billingIn = normalizeInputAddress(body.address || body.billing);
    if (wantShipping) shippingIn = normalizeInputAddress(body.address || body.shipping);

    // Accept a shipping-only single-line update payload like { shipping: { line1: '...' } }
    // Some clients will only edit the single-line `shipping_address` and won't provide
    // country/structured fields. NormalizeInputAddress will mark such payloads as
    // invalid (because country is missing). If that happens and the client did send
    // shipping.line1, override the invalid result with a minimal shipping object so
    // single-line updates are accepted.
    if (wantShipping) {
      const hasSingleLine = body && body.shipping && typeof body.shipping.line1 === 'string' && body.shipping.line1.trim();
      if ((!shippingIn || shippingIn.invalid) && hasSingleLine) {
        shippingIn = {
          line1: body.shipping.line1.trim(),
          line2: (body.shipping.line2 || '').trim(),
          city: '',
          state: '',
          country: '',
          zip: ''
        };
      }
    }

    if (wantBilling && billingIn && billingIn.invalid) return res.status(400).json({ error: 'invalid_billing_address' });
    if (wantShipping && shippingIn && shippingIn.invalid) return res.status(400).json({ error: 'invalid_shipping_address' });
    if (!wantBilling && !wantShipping) return res.status(400).json({ error: 'type_required' });
    if (!billingIn && !shippingIn) return res.status(400).json({ error: 'no_address_payload' });

    // Optional name / phone updates (mirrors profile logic lightly)
    const name = typeof body.name === 'string' ? body.name.trim() : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null;

    // Resolve connector contact and update the remote contact first (connector-first approach)
    const remoteContact = await fetchContact(idn);
    const remoteId = remoteContact && (remoteContact.id || remoteContact.contact_id || idn.cid);

    // Build connector payload (use single-line shipping_address since connector samples use that)
    const connectorPayload = {};
    if (name) connectorPayload.name = name;
    if (phone) connectorPayload.mobile = phone;

    // Ensure connector receives first_name / last_name keys which some connector
    // implementations require. Derive from provided `name` when possible, else
    // fall back to remote contact fields (if available) or empty string.
    const deriveNameParts = (str) => {
      if (!str || typeof str !== 'string') return ['',''];
      const parts = str.trim().split(/\s+/);
      const first = parts.shift() || '';
      const last = parts.length ? parts.join(' ') : '';
      return [first, last];
    };

    const [givenFirst, givenLast] = deriveNameParts(name || remoteContact?.name);
    const firstName = remoteContact?.first_name || givenFirst || '';
    const lastName = remoteContact?.last_name || givenLast || '';
    // Always include the keys so connector-side validation that expects them won't fail.
    connectorPayload.first_name = firstName;
    connectorPayload.last_name = lastName;
  // Some connector implementations require a contact `type` ('customer'|'supplier').
  // Prefer the remoteContact.type if present; otherwise default to 'customer'.
  connectorPayload.type = remoteContact?.type || 'customer';
    if (billingIn && !billingIn.invalid) {
      connectorPayload.address_line_1 = billingIn.line1;
      if (billingIn.line2) connectorPayload.address_line_2 = billingIn.line2;
      if (billingIn.city) connectorPayload.city = billingIn.city;
      if (billingIn.state) connectorPayload.state = billingIn.state;
      if (billingIn.country) connectorPayload.country = billingIn.country;
      if (billingIn.zip) connectorPayload.zip_code = billingIn.zip;
    }
    if (shippingIn && !shippingIn.invalid) {
      const composed = [shippingIn.line1, shippingIn.line2, shippingIn.city, shippingIn.state, shippingIn.country, shippingIn.zip].filter(Boolean).join(', ');
      connectorPayload.shipping_address = composed || shippingIn.line1;
      // Some connectors may accept shipping_* fields but samples primarily show shipping_address; keep payload minimal.
    }

    if (Object.keys(connectorPayload).length) {
      if (!remoteId) {
        console.error('PATCH /api/account/addresses: unable to resolve remote contact id', { idn, remoteContact });
        return res.status(502).json({ error: 'connector_contact_unresolved' });
      }
      try {
        await erpFetch(`/contactapi/${remoteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(connectorPayload),
          query: { business_id: BIZ },
        });
      } catch (err) {
        console.error('PATCH /api/account/addresses connector update failed', err);
        return res.status(502).json({ error: 'connector_update_failed', details: err?.body || err?.message });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const sets = [];
      const params = { cid: idn.cid, bid: BIZ };

      if (name) { sets.push('name = :name'); params.name = name; }
      if (phone) { sets.push('mobile = :phone'); params.phone = phone; }

      if (billingIn && !billingIn.invalid) {
        sets.push('address_line_1 = :b_line1'); params.b_line1 = billingIn.line1;
        sets.push('address_line_2 = :b_line2'); params.b_line2 = billingIn.line2 || null;
        sets.push('city = :b_city'); params.b_city = billingIn.city || null;
        sets.push('state = :b_state'); params.b_state = billingIn.state || null;
        sets.push('country = :b_country'); params.b_country = billingIn.country || null;
        sets.push('zip_code = :b_zip'); params.b_zip = billingIn.zip || null;
      }

      if (shippingIn && !shippingIn.invalid) {
        // Some deployments have different shipping column names (shipping_address_line_1 vs shipping_address_line1)
        // Inspect contacts columns once and set only the existing ones. Always set a composed shipping_address fallback
        const [cols] = await conn.query("SHOW COLUMNS FROM contacts");
        const colSet = new Set((cols || []).map((c) => c.Field));

        const sLine1Col = colSet.has('shipping_address_line_1') ? 'shipping_address_line_1' : (colSet.has('shipping_address_line1') ? 'shipping_address_line1' : null);
        const sLine2Col = colSet.has('shipping_address_line_2') ? 'shipping_address_line_2' : (colSet.has('shipping_address_line2') ? 'shipping_address_line2' : null);
        const sCityCol  = colSet.has('shipping_city') ? 'shipping_city' : null;
        const sStateCol = colSet.has('shipping_state') ? 'shipping_state' : null;
        const sCountryCol = colSet.has('shipping_country') ? 'shipping_country' : null;
        const sZipCol = colSet.has('shipping_zip_code') ? 'shipping_zip_code' : (colSet.has('shipping_zip') ? 'shipping_zip' : null);

        if (sLine1Col) { sets.push(`${sLine1Col} = :s_line1`); params.s_line1 = shippingIn.line1; }
        if (sLine2Col) { sets.push(`${sLine2Col} = :s_line2`); params.s_line2 = shippingIn.line2 || null; }
        if (sCityCol)  { sets.push(`${sCityCol} = :s_city`); params.s_city = shippingIn.city || null; }
        if (sStateCol) { sets.push(`${sStateCol} = :s_state`); params.s_state = shippingIn.state || null; }
        if (sCountryCol){ sets.push(`${sCountryCol} = :s_country`); params.s_country = shippingIn.country || null; }
        if (sZipCol)   { sets.push(`${sZipCol} = :s_zip`); params.s_zip = shippingIn.zip || null; }

        // Compose a single-line fallback shipping_address for legacy consumers and set it when the column exists
        const composed = [shippingIn.line1, shippingIn.line2, shippingIn.city, shippingIn.state, shippingIn.country, shippingIn.zip].filter(Boolean).join(', ');
        if (colSet.has('shipping_address') || !sLine1Col) {
          sets.push('shipping_address = :s_full'); params.s_full = composed || shippingIn.line1;
        }
      }

      if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });

      await conn.query(
        `UPDATE contacts SET ${sets.join(', ')} WHERE id = :cid AND business_id = :bid LIMIT 1`,
        params
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error('PATCH /api/account/addresses failed', e);
      return res.status(500).json({ error: 'update_failed' });
    } finally {
      conn.release();
    }

    // Invalidate address/profile cache for this user
    cache.addresses.delete(`${BIZ}:${idn.cid}`);
    cache.profile.delete(`${BIZ}:${idn.cid}`);

    // Return fresh addresses list
    try {
      req.body = {}; // avoid reusing validation bits
      // Reuse GET logic by manually invoking fetch path
      const [[c]] = await pool.query(
        `SELECT id, name, mobile, phone,
                address_line_1, address_line_2, city, state, country, zip_code, address,
                shipping_address, shipping_address_line_1, shipping_address_line_2,
                shipping_city, shipping_state, shipping_country, shipping_zip_code
           FROM contacts
          WHERE id = :cid AND business_id = :bid
          LIMIT 1`,
        { cid: idn.cid, bid: BIZ }
      );
      if (!c) return res.json([]);

      const bill = normalizeAddress({
        address_line_1: c.address_line_1,
        address_line_2: c.address_line_2,
        city: c.city, state: c.state, country: c.country, zip_code: c.zip_code,
        address: c.address,
      });
      const ship = normalizeAddress({
        address_line_1: c.shipping_address_line_1 ?? c.shipping_address,
        address_line_2: c.shipping_address_line_2 ?? '',
        city: c.shipping_city ?? '', state: c.shipping_state ?? '',
        country: c.shipping_country ?? '', zip_code: c.shipping_zip_code ?? '',
        address: c.shipping_address ?? '',
      });
      const rows = [
        { type: 'Billing',  name: c.name || '', phone: c.mobile || c.phone || '', full: bill.full,  raw: bill },
        { type: 'Shipping', name: c.name || '', phone: c.mobile || c.phone || '', full: ship.full || bill.full, raw: ship.full ? ship : bill, is_default: true },
      ];
      return res.json(rows);
    } catch {
      return res.json([]);
    }
  } catch {
    return res.status(500).json({ error: 'server_error' });
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
