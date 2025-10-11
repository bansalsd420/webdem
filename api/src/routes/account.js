// api/account.js
import { Router } from 'express';
import { pool, queryWithRetry } from '../db.js';
import { authRequired, authOptional } from '../middleware/auth.js';
import { streamInvoicePdfHtml } from '../lib/invoicePdf.js';
// at top with other imports



const PROFILE_FIELDS = new Set([
  'prefix', 'first_name', 'middle_name', 'last_name',
  'email', 'mobile', 'alternate_number', 'landline',
  'dob', 'tax_number', 'custom_field1', 'custom_field2', 'custom_field3', 'custom_field4'
]);
const ADDRESS_FIELDS = new Set([
  'address_line_1', 'address_line_2', 'city', 'state', 'country', 'zip_code',
  'shipping_address',
  'shipping_address_line_1', 'shipping_address_line_2', 'shipping_city', 'shipping_state', 'shipping_country', 'shipping_zip_code', 'shipping_zip'
]);
const pick = (src = {}, allow = new Set()) => {
  const out = {};
  for (const k of Object.keys(src)) if (allow.has(k)) out[k] = src[k];
  return out;
};
const router = Router();
const BIZ = Number(process.env.BUSINESS_ID);
const CURRENCY = process.env.CURRENCY || 'USD';

function setPageHeaders(res, total, page, limit) {
  if (Number.isFinite(total)) res.set('X-Total-Count', String(total));
  if (Number.isFinite(page)) res.set('X-Page', String(page));
  if (Number.isFinite(limit)) res.set('X-Limit', String(limit));
}

// small helper to resolve the logged-in contact_id
async function contactIdForUser(uid) {
  try {
    const [[u]] = await pool.query(
      'SELECT contact_id FROM app_auth_users WHERE id=:id',
      { id: uid }
    );
    return u?.contact_id || null;
  } catch (e) {
    console.error('[contactIdForUser] DB error', e && e.message ? e.message : e);
    // Don't throw here — callers may not always catch; return null so caller can respond appropriately
    return null;
  }
}
async function loadContactBits(contactId) {
  if (!contactId) return { contact_code: null, customer_group_id: null };
  const [[c]] = await pool.query(
    `SELECT contact_id AS contact_code, customer_group_id
       FROM contacts
      WHERE id=:cid AND business_id=:bid
      LIMIT 1`,
    { cid: contactId, bid: BIZ }
  );
  return {
    contact_code: c?.contact_code ?? c?.contact_id ?? null,
    customer_group_id: c?.customer_group_id ?? null,
  };
}
/** ---------------- Existing routes (unchanged) ---------------- */
// GET /account/me
// Use optional auth so anonymous sessions don't generate 401 noise on the home page.
router.get('/me', authOptional, async (req, res, next) => {
  try {
    // If no user, return an empty object (anonymous) with 200 OK
    if (!req.user) {
      return res.json({});
    }

    // your JWT should carry uid (app_auth_users.id) & cid (contacts.id)
    const uid = req.user?.uid;
    const cid = req.user?.cid || null;

    // base row from app_auth_users (email etc.)
    const [[u]] = await pool.query(
      `SELECT id, email, contact_id
         FROM app_auth_users
        WHERE id=:id AND business_id=:bid
        LIMIT 1`,
      { id: uid, bid: BIZ }
    );
  if (!u) return res.json({});

    // enrich with contact fields (customer_group_id  human code)
    const bits = await loadContactBits(cid || u.contact_id);

    // assemble payload (add what you already send today)
    return res.json({
      id: u.id,
      email: u.email || null,
      contact_id: cid || u.contact_id || null,          // numeric
      contact_code: bits.contact_code,                  // e.g. "CO0005"
      customer_group_id: bits.customer_group_id,        // used for pricing
      price_group_id: bits.customer_group_id,           // alias your UI expects
      // default_location_id: null, // keep for future, if needed
    });
  } catch (e) {
    next(e);
  }
});


// GET /api/account/orders  (draft/final sells for this contact)
// GET /api/account/orders  (draft/final sells for this contact)
// GET /api/account/orders  (sell transactions for this contact, paginated)
router.get('/orders', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const cid = await contactIdForUser(uid);
  if (!cid) return res.status(404).json({ error: 'user not found' });

  // pagination + optional location filter
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * limit;
  const locId = Number(req.query.locationId) || null;

  let where = `t.business_id=:bid AND t.contact_id=:cid AND t.type='sell'`;
  const p = { bid: BIZ, cid, limit, offset };

  if (locId) { where += ` AND t.location_id=:loc`; p.loc = locId; }

  try {
    const [rows] = await pool.query(
      `SELECT
         t.id,
         t.invoice_no,
         t.final_total,
         t.payment_status,
         t.transaction_date
       FROM transactions t
       WHERE ${where}
       ORDER BY t.transaction_date DESC, t.id DESC
       LIMIT :limit OFFSET :offset`,
      p
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM transactions t
        WHERE ${where}`,
      p
    );

    setPageHeaders(res, Number(total || 0), page, limit);
    return res.json(rows);
  } catch (e) {
    console.error('orders error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});


// Build one DTO for the PDF generator (company from env only)
async function loadInvoiceBundle({ businessId, contactId, invoiceNo }) {
  // transaction
  const [[t]] = await pool.query(
    `SELECT id, invoice_no, final_total, discount_amount, tax_amount, shipping_charges,
            transaction_date, status, payment_status, location_id, additional_notes
     FROM transactions
     WHERE business_id=:bid AND contact_id=:cid AND invoice_no=:inv AND type='sell'
     LIMIT 1`,
    { bid: businessId, cid: contactId, inv: invoiceNo }
  );
  if (!t) return null;

  // contact
  const [[c]] = await pool.query(
    `SELECT name, email, mobile,
            address_line_1, address_line_2, city, state, country, zip_code,
            tax_number
     FROM contacts WHERE id=:cid LIMIT 1`,
    { cid: contactId }
  );

  // location
  const [[bl]] = await pool.query(
    `SELECT name FROM business_locations WHERE id=:lid LIMIT 1`,
    { lid: t.location_id || 0 }
  );

  // items
  const [lines] = await pool.query(
    `SELECT
       tsl.quantity                                   AS qty,
       tsl.unit_price_inc_tax                         AS unit_price,
       (tsl.quantity * tsl.unit_price_inc_tax)        AS subtotal,
       p.name                                         AS product_name,
       p.sku                                          AS sku,
       v.name                                         AS variation_name
     FROM transaction_sell_lines tsl
     LEFT JOIN products   p ON p.id = tsl.product_id
     LEFT JOIN variations v ON v.id = tsl.variation_id
     WHERE tsl.transaction_id = :tid
     ORDER BY tsl.id`,
    { tid: t.id }
  );

  // payments
  const [pays] = await pool.query(
    `SELECT amount, method, paid_on, created_at
       FROM transaction_payments
      WHERE transaction_id=:tid
      ORDER BY COALESCE(paid_on, created_at)`,
    { tid: t.id }
  );

  // totals
  const subtotal = lines.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const discount = Number(t.discount_amount || 0);
  const tax = Number(t.tax_amount || 0);
  const shipping = Number(t.shipping_charges || 0);
  const grand = Number(t.final_total || (subtotal - discount + tax + shipping));
  const totalPaid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(grand - totalPaid, 0);

  // company from env
  const company = {
    name: process.env.COMPANY_NAME || 'MOJI WHOLESALE',
    brand: process.env.COMPANY_BRAND || process.env.COMPANY_NAME || 'MOJI WHOLESALE',
    logo_url: process.env.COMPANY_LOGO_URL || null,
    address1: process.env.COMPANY_ADDRESS1 || '',
    address2: process.env.COMPANY_ADDRESS2 || '',
    city_state_zip: process.env.COMPANY_CITY_STATE_ZIP || '',
    country: process.env.COMPANY_COUNTRY || '',
    phone: process.env.COMPANY_PHONE || '',
    website: process.env.COMPANY_WEBSITE || '',
    return_policy: process.env.RETURN_POLICY || ''
  };

  return {
    company,
    invoice: {
      id: t.id,
      invoice_no: t.invoice_no,
      date_display: t.transaction_date ? new Date(t.transaction_date).toLocaleString() : '',
      term_text: t.status || '—',
      status_text: [t.status || '—', (t.payment_status || '').toUpperCase()].filter(Boolean).join(' | '),
      rep: null,
      notes: t.additional_notes || ''
    },
    contact: {
      name: c?.name || '',
      email: c?.email || '',
      phone: c?.mobile || '',
      tax_id: c?.tax_number || '',
      address: {
        line1: c?.address_line_1 || '',
        line2: c?.address_line_2 || '',
        city: c?.city || '',
        state: c?.state || '',
        country: c?.country || '',
        zip: c?.zip_code || ''
      }
    },
    location: { name: bl?.name || '-' },
    items: lines.map(r => ({
      sku: r.sku || '',
      product_name: r.product_name || '',
      variation_name: r.variation_name || '',
      qty: Number(r.qty || 0),
      unit_price: Number(r.unit_price || 0),
      subtotal: Number(r.subtotal || 0)
    })),
    payments: pays.map(p => ({
      amount: Number(p.amount || 0),
      method: p.method || '',
      paid_on_display: p.paid_on ? new Date(p.paid_on).toLocaleString() : null,
      created_at_display: p.created_at ? new Date(p.created_at).toLocaleString() : null
    })),
    totals: {
      subtotal,
      discount,
      tax,
      shipping,
      grand_total: grand,
      total_paid: totalPaid,
      customer_balance: balance
    },
    currency: CURRENCY
  };
}

// Inline preview in the browser
// Inline preview in the browser (by invoice number)
router.get('/orders/:invoiceNo/preview', authRequired, async (req, res) => {
  try {
    const { invoiceNo } = req.params;
    const businessId = req.user?.bid; // from your JWT
    // resolve sell id by invoice number
    const [rows] = await pool.query(
      `SELECT id FROM transactions WHERE business_id=? AND invoice_no=? AND type='sell' LIMIT 1`,
      [businessId, invoiceNo]
    );
    const sell = rows?.[0];
    if (!sell) return res.status(404).send('not_found');

    await streamInvoicePdfHtml({ res, sellId: sell.id, businessId, disposition: 'inline' });
  } catch (e) {
    console.error('preview error', e);
    res.status(500).send('server_error');
  }
});

// GET /api/account/orders/:invoiceNo/pdf
router.get('/orders/:invoiceNo/pdf', authRequired, async (req, res) => {
  try {
    const { invoiceNo } = req.params;
    const businessId = req.user?.bid;
    const [rows] = await pool.query(
      `SELECT id FROM transactions WHERE business_id=? AND invoice_no=? AND type='sell' LIMIT 1`,
      [businessId, invoiceNo]
    );
    const sell = rows?.[0];
    if (!sell) return res.status(404).send('not_found');

    await streamInvoicePdfHtml({ res, sellId: sell.id, businessId, disposition: 'attachment' });
  } catch (e) {
    console.error('pdf error', e);
    res.status(500).send('server_error');
  }
});

// GET /api/account/invoices (same list; UI may treat as "invoices")
// GET /api/account/invoices (same list; UI may treat as "invoices")
router.get('/invoices', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const cid = await contactIdForUser(uid);
  if (!cid) return res.status(404).json({ error: 'user not found' });

  // pagination + optional location filter to mirror /orders
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * limit;
  const loc = (req.query.locationId || req.query.location_id || '').trim();

  let where = `t.business_id=:bid AND t.contact_id=:cid AND t.type='sell'`;
  const p = { bid: BIZ, cid, limit, offset };
  if (loc) { where += ` AND t.location_id=:loc`; p.loc = loc; }

  const [rows] = await pool.query(
    `SELECT t.id AS transaction_id, t.invoice_no, t.final_total, t.transaction_date
       FROM transactions t
      WHERE ${where}
      ORDER BY t.transaction_date DESC
      LIMIT :limit OFFSET :offset`,
    p
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM transactions t
      WHERE ${where}`,
    p
  );

  setPageHeaders(res, Number(total || 0), page, limit);
  res.json(rows);
});

/** ---------------- New routes for Account tabs ---------------- */

// GET /api/account/addresses
// maps from contacts: address_line_1/2, city, state, country, zip_code (+ name, mobile)
// --- Addresses: return Billing + Shipping cards ---
// ...keep your existing imports at top of file


// ------------------- Address normalizer -------------------
function normalizeAddress(obj) {
  const v = (k) =>
    obj?.[k] ??
    obj?.[k.toLowerCase()] ??
    obj?.[k.replace(/_/g, '')];

  const line1 =
    v('address_line_1') ?? v('address1') ?? v('address_1') ?? v('address_line1') ?? v('address_line') ?? '';
  const line2 =
    v('address_line_2') ?? v('address2') ?? v('address_2') ?? v('address_line2') ?? '';
  const blob = v('address') ?? v('shipping_address') ?? '';
  const city = v('city') ?? '';
  const state = v('state') ?? '';
  const country = v('country') ?? '';
  const zip = v('zip_code') ?? v('zipcode') ?? v('zip') ?? '';

  const parts = [
    line1 || null,
    line2 || null,
    [city, state].filter(Boolean).join(', ') || null,
    [country, zip].filter(Boolean).join(' ') || null,
  ].filter(Boolean);

  const full = parts.length ? parts.join('\n') : (typeof blob === 'string' ? blob : '');

  return { line1, line2, city, state, country, zip, full };
}

// ------------------- GET /api/account/addresses ------------------
// --- Documents: list and secure download/inline preview ---
// Your DB has a `media` table with file_name, model_type, model_id, created_at, description.  :contentReference[oaicite:3]{index=3}
import path from 'node:path';
import fs from 'node:fs';
import mime from 'mime-types';

router.get('/documents', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const cid = await contactIdForUser(uid);
  if (!cid) return res.status(404).json({ error: 'user not found' });

  const modelTypes = [
    'App\\Contact',
    'App\\Models\\Contact',
    'contacts',
    'contact'
  ];

  try {
    const [rows] = await pool.query(
      `SELECT id, file_name, description, created_at
         FROM media
        WHERE business_id=:bid
          AND model_id=:cid
          AND model_type IN (${modelTypes.map((_, i) => `:t${i}`).join(',')})
        ORDER BY id DESC`,
      { bid: BIZ, cid, ...Object.fromEntries(modelTypes.map((t, i) => [`t${i}`, t])) }
    );

    const data = rows.map(r => ({
      id: r.id,
      name: r.file_name,
      description: r.description || '',
      created_at: r.created_at,
      // URLs your UI will call:
      view_url: `/api/account/documents/${r.id}/inline`,
      download_url: `/api/account/documents/${r.id}/download`
    }));

    res.json(data);
  } catch (e) {
    console.error('documents list error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// resolve file path; adjust MEDIA_DIR to match deploy (public/uploads/media)
function resolveMediaPath(fileName) {
  const base = process.env.MEDIA_DIR || path.join(process.cwd(), 'public', 'uploads', 'media');
  return path.join(base, fileName);
}

async function readContactFileFor(req, res) {
  const uid = req.user.uid;
  const cid = await contactIdForUser(uid);
  if (!cid) return { status: 404, msg: 'user not found' };

  const [[row]] = await pool.query(
    `SELECT id, file_name
       FROM media
      WHERE id=:id AND business_id=:bid AND model_id=:cid`,
    { id: Number(req.params.id), bid: BIZ, cid }
  );
  if (!row) return { status: 404, msg: 'not found' };

  const fp = resolveMediaPath(row.file_name);
  if (!fs.existsSync(fp)) return { status: 404, msg: 'file missing' };

  return { status: 200, file: fp, name: row.file_name };
}

router.get('/documents/:id/inline', authRequired, async (req, res) => {
  try {
    const r = await readContactFileFor(req, res);
    if (r.status !== 200) return res.status(r.status).send(r.msg);
    const ctype = mime.lookup(r.file) || 'application/octet-stream';
    res.setHeader('Content-Type', ctype);
    res.sendFile(r.file);
  } catch (e) {
    console.error('documents inline error', e);
    res.status(500).send('server_error');
  }
});

router.get('/documents/:id/download', authRequired, async (req, res) => {
  try {
    const r = await readContactFileFor(req, res);
    if (r.status !== 200) return res.status(r.status).send(r.msg);
    res.download(r.file, r.name);
  } catch (e) {
    console.error('documents download error', e);
    res.status(500).send('server_error');
  }
});

// GET /api/account/payments
// lists payments linked to this contact's sell transactions
// ---- payment methods (both dash + underscore paths) ----
router.get('/payment-methods', authRequired, async (req, res) => {
  const cid = await contactIdForUser(req.user.uid);
  if (!cid) return res.status(404).json({ error: 'user not found' });
  const [rows] = await pool.query(`
    SELECT DISTINCT COALESCE(tp.method,'') AS method
      FROM transaction_payments tp
      JOIN transactions t ON t.id = tp.transaction_id
     WHERE t.business_id=:bid AND t.contact_id=:cid AND t.type='sell'
  `, { bid: BIZ, cid });
  res.json(rows.map(r => r.method).filter(Boolean).sort());
});
// alias to match older frontend call
router.get('/payment_methods', authRequired, (req, res) =>
  router.handle({ ...req, url: '/payment-methods' }, res)
);

// ---- payments list (filters + invoice_no) ----
router.get('/payments', authRequired, async (req, res) => {
  try {
    const uid = req.user.uid;
    const cid = await contactIdForUser(uid);
    if (!cid) return res.status(404).json({ error: 'user not found' });

    // filters
    const q = (req.query.q || '').trim();
    const method = (req.query.method || '').trim();
    const start = (req.query.start || req.query.from || '').trim();
    const end = (req.query.end || req.query.to || '').trim();

    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const p = { bid: BIZ, cid, limit, offset };
    const where = [
      `t.business_id=:bid`,
      `t.contact_id=:cid`,
      `t.type='sell'`
    ];

    if (method) { where.push(`COALESCE(tp.method,'') = :method`); p.method = method; }
    if (start) { where.push(`DATE(COALESCE(tp.paid_on,tp.created_at)) >= :start`); p.start = start; }
    if (end) { where.push(`DATE(COALESCE(tp.paid_on,tp.created_at)) <= :end`); p.end = end; }
    if (q) {
      where.push(`(
        COALESCE(tp.method,'') LIKE :likeQ OR
        COALESCE(t.invoice_no,'') LIKE :likeQ OR
        COALESCE(bl.name,'') LIKE :likeQ
      )`);
      p.likeQ = `%${q}%`;
    }

    const sqlBase = `
      FROM transaction_payments tp
      JOIN transactions t   ON t.id = tp.transaction_id
      LEFT JOIN business_locations bl ON bl.id = t.location_id
     WHERE ${where.join(' AND ')}
    `;

    const [rows] = await pool.query(
      `
      SELECT
        tp.id,
        COALESCE(tp.paid_on, tp.created_at) AS paid_on,
        tp.amount,
        tp.method AS payment_method,
        t.invoice_no,
        bl.name AS location
      ${sqlBase}
      ORDER BY COALESCE(tp.paid_on,tp.created_at) DESC, tp.id DESC
      LIMIT :limit OFFSET :offset
      `,
      p
    );

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${sqlBase}`, p);

    setPageHeaders(res, Number(total || 0), page, limit);
    res.json(rows.map(r => ({
      id: r.id,
      date: r.paid_on,
      amount: Number(r.amount || 0),
      method: r.payment_method || '',
      invoice_no: r.invoice_no || '',
      location: r.location || ''
    })));
  } catch (e) {
    console.error('payments error', e);
    res.status(500).json({ error: 'server_error' });
  }
});


// locationId|location_id, q (search), page, limit
router.get('/ledger', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const cid = await contactIdForUser(uid);
  if (!cid) return res.status(404).json({ error: 'user not found' });

  // ---- normalize query params ----
  const start = (req.query.start || req.query.from || '').trim();
  const end = (req.query.end || req.query.to || '').trim();
  const loc = (req.query.location_id || req.query.locationId || '').trim();
  const q = (req.query.q || '').trim();

  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * limit;

  // ---- dynamic detection of payment reference / status columns (robust to schema diffs) ----
  // We cache the detection result across calls.
  let tpColumnCache = router._tpColumnCache;
  if (!tpColumnCache) {
    try {
      const [[{ db }]] = await pool.query('SELECT DATABASE() AS db');
      const [refCols] = await pool.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA=:db AND TABLE_NAME='transaction_payments'
            AND COLUMN_NAME IN ('payment_ref_no','ref_no','reference_no','payment_ref')`,
        { db }
      );
      const [statusCols] = await pool.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA=:db AND TABLE_NAME='transaction_payments'
            AND COLUMN_NAME IN ('status')`,
        { db }
      );
      const preferred = ['payment_ref_no', 'ref_no', 'reference_no', 'payment_ref'];
      const refCol = preferred.find(n => refCols.some(r => r.COLUMN_NAME === n)) || null;
      const statusCol = statusCols.length ? statusCols[0].COLUMN_NAME : null;
      tpColumnCache = { refCol, statusCol };
      router._tpColumnCache = tpColumnCache;
    } catch {
      tpColumnCache = { refCol: null, statusCol: null };
      router._tpColumnCache = tpColumnCache;
    }
  }
  const { refCol, statusCol } = tpColumnCache;

  // ---- WHERE builders ----
  const p = { bid: BIZ, cid, limit, offset };
  const sellWhere = [
    `t.business_id=:bid`,
    `t.contact_id=:cid`,
    `t.type='sell'`,
    `t.status NOT IN ('draft','cancelled')`,
  ];
  const payWhere = [
    `t2.business_id=:bid`,
    `t2.contact_id=:cid`,
    `t2.type='sell'`,
  ];

  if (start) { sellWhere.push(`DATE(t.transaction_date) >= :start`); payWhere.push(`DATE(COALESCE(tp.paid_on,tp.created_at)) >= :start`); p.start = start; }
  if (end) { sellWhere.push(`DATE(t.transaction_date) <= :end`); payWhere.push(`DATE(COALESCE(tp.paid_on,tp.created_at)) <= :end`); p.end = end; }
  if (loc) { sellWhere.push(`t.location_id = :loc`); payWhere.push(`t2.location_id = :loc`); p.loc = loc; }

  // free-text search (optional)
  const likeQ = `%${q}%`;
  const sellSearch = q
    ? ` AND (t.invoice_no LIKE :likeQ OR COALESCE(t.payment_status,'') LIKE :likeQ OR COALESCE(bl.name,'') LIKE :likeQ)`
    : '';
  const paySearch = q
    ? ` AND (COALESCE(tp.method,'') LIKE :likeQ OR COALESCE(bl.name,'') LIKE :likeQ${statusCol ? ` OR COALESCE(tp.\`${statusCol}\`,'') LIKE :likeQ` : ''
    }${refCol ? ` OR COALESCE(tp.\`${refCol}\`,'') LIKE :likeQ` : ''
    })`
    : '';
  if (q) p.likeQ = likeQ;

  // columns for payments that may or may not exist
  const payStatusSel = statusCol ? `tp.\`${statusCol}\`` : `NULL`;
  const payOthersSel = refCol ? `tp.\`${refCol}\`` : `CONCAT('PMT/', tp.id)`;

  // ---- rows (newest first to match UI screenshots) ----
  const sqlRows = `
    SELECT *
    FROM (
      SELECT
        t.transaction_date                 AS date,
        t.invoice_no                       AS reference_no,
        'sell'                             AS type,
        bl.name                            AS location,
        t.payment_status                   AS payment_status,
        t.final_total                      AS debit,
        0                                  AS credit,
        NULL                               AS payment_method,
        NULL                               AS others,
        t.additional_notes                 AS note
      FROM transactions t
      LEFT JOIN business_locations bl ON bl.id = t.location_id
      WHERE ${sellWhere.join(' AND ')}
      ${sellSearch}

      UNION ALL

      SELECT
        COALESCE(tp.paid_on, tp.created_at) AS date,
        ''                                  AS reference_no,
        'payment'                           AS type,
        bl.name                             AS location,
        ${payStatusSel}                     AS payment_status,
        0                                   AS debit,
        tp.amount                           AS credit,
        tp.method                           AS payment_method,
        ${payOthersSel}                     AS others,
        tp.note                             AS note
      FROM transaction_payments tp
      INNER JOIN transactions t2 ON t2.id = tp.transaction_id
      LEFT JOIN business_locations bl ON bl.id = t2.location_id
      WHERE ${payWhere.join(' AND ')}
      ${paySearch}
    ) u
    ORDER BY u.date DESC, u.type DESC
    LIMIT :limit OFFSET :offset
  `;

  // ---- counts for pagination (respect q) ----
  const sqlCountSell = `
    SELECT COUNT(*) AS c
    FROM transactions t
    LEFT JOIN business_locations bl ON bl.id = t.location_id
    WHERE ${sellWhere.join(' AND ')}${sellSearch}
  `;
  const sqlCountPay = `
    SELECT COUNT(*) AS c
    FROM transaction_payments tp
    INNER JOIN transactions t2 ON t2.id = tp.transaction_id
    LEFT JOIN business_locations bl ON bl.id = t2.location_id
    WHERE ${payWhere.join(' AND ')}${paySearch}
  `;

  // ---- range summary (date/location filters only; NOT the text search) ----
  const sqlRangeInv = `
    SELECT COALESCE(SUM(t.final_total),0) AS s
    FROM transactions t
    WHERE ${sellWhere.join(' AND ')}
  `;
  const sqlRangePay = `
    SELECT COALESCE(SUM(tp.amount),0) AS s
    FROM transaction_payments tp
    INNER JOIN transactions t2 ON t2.id = tp.transaction_id
    WHERE ${payWhere.join(' AND ')}
  `;

  // ---- overall summary (all time for this contact) ----
  const sqlOverallInv = `
    SELECT COALESCE(SUM(t.final_total),0) AS s
    FROM transactions t
    WHERE t.business_id=:bid AND t.contact_id=:cid AND t.type='sell' AND t.status NOT IN ('draft','cancelled')
  `;
  const sqlOverallPay = `
    SELECT COALESCE(SUM(tp.amount),0) AS s
    FROM transaction_payments tp
    INNER JOIN transactions t2 ON t2.id = tp.transaction_id
    WHERE t2.business_id=:bid AND t2.contact_id=:cid AND t2.type='sell'
  `;

  try {
    const [rows] = await pool.query(sqlRows, p);

    const [[cs]] = await pool.query(sqlCountSell, p);
    const [[cp]] = await pool.query(sqlCountPay, p);
    const totalRows = Number(cs?.c || 0) + Number(cp?.c || 0);
    setPageHeaders(res, totalRows, page, limit);

    const [[rinv]] = await pool.query(sqlRangeInv, p);
    const [[rpay]] = await pool.query(sqlRangePay, p);
    const rangeInv = Number(rinv?.s || 0);
    const rangePay = Number(rpay?.s || 0);

    const [[oinv]] = await pool.query(sqlOverallInv, { bid: BIZ, cid });
    const [[opay]] = await pool.query(sqlOverallPay, { bid: BIZ, cid });
    const overallInv = Number(oinv?.s || 0);
    const overallPay = Number(opay?.s || 0);

    res.set('Cache-Control', 'no-store');
    return res.json({
      summary: {
        range: { total_invoice: rangeInv, total_paid: rangePay, balance_due: Math.max(rangeInv - rangePay, 0) },
        overall: { total_invoice: overallInv, total_paid: overallPay, balance_due: Math.max(overallInv - overallPay, 0) },
      },
      rows: rows.map(r => ({
        date: r.date,
        reference_no: r.reference_no || '',     // invoice_no for sells; blank for payments (matches your UI)
        type: r.type,                           // 'sell' | 'payment' (UI capitalizes)
        location: r.location || '-',
        payment_status: r.payment_status || '',
        debit: Number(r.debit || 0),
        credit: Number(r.credit || 0),
        payment_method: r.payment_method || '',
        others: r.others || '',                 // SP code if column exists, else PMT/<id>
        note: r.note || ''
      }))
    });
  } catch (e) {
    console.error('ledger error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});
// --- Profile (read-only) -----------------------------------------------
// ------------------- GET /api/account/profile -------------------

export default router;
