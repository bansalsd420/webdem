// /api/src/routes/auth.js
import { Router } from 'express';
import { pool } from '../db.js';
import { hash, verify as verifyPw } from '../utils/hash.js';
import { sign } from '../utils/jwt.js';
import crypto from 'crypto';

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 0);

// ----------------- helpers -----------------
const normalizeEmail = (raw) => (raw || '').trim().toLowerCase();

function setAuthCookie(res, jwt) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  });
}

/**
 * Find an ERP contact (in local DB mirror) by email where a non-null contact_id
 * exists for this business. Returns { id, email, business_id, contact_id } or null.
 */
async function findContactWithNonNullContactIdByEmail(email) {
  const [[row]] = await pool.query(
    `SELECT id, email, business_id, contact_id
       FROM contacts
      WHERE business_id = :bid
        AND contact_id IS NOT NULL
        AND LOWER(email) = :email
      ORDER BY id
      LIMIT 1`,
    { email, bid: BIZ }
  );
  return row || null;
}

/**
 * Get the customer_group_id and its mapped selling_price_group_id (price group)
 * for a given contact (by numeric PK).
 */
async function groupIdsForContact(contactId) {
  if (!contactId || !BIZ) return { cgid: null, pgid: null };

  const [[row]] = await pool.query(
    `SELECT c.customer_group_id AS cgid, cg.selling_price_group_id AS pgid
       FROM contacts c
       LEFT JOIN customer_groups cg ON cg.id = c.customer_group_id
      WHERE c.id = :cid AND c.business_id = :bid
      LIMIT 1`,
    { cid: contactId, bid: BIZ }
  );
  return {
    cgid: row?.cgid ?? null,
    pgid: row?.pgid ?? null,
  };
}

/**
 * Ensure there is an app_auth_users row for reset/bootstrap flows.
 * - Uses email + business_id uniqueness.
 * - Associates to the resolved ERP contact_id (non-null).
 * Returns the auth user row { id, business_id, contact_id, email }.
 */
async function ensureAuthUserForEmail(email, contactId) {
  // Try to find an existing row
  const [[existing]] = await pool.query(
    `SELECT id, business_id, contact_id, email
       FROM app_auth_users
      WHERE business_id = :bid AND email = :email
      LIMIT 1`,
    { bid: BIZ, email }
  );
  if (existing) {
    // If somehow contact_id differs or was not set historically, align it.
    if (existing.contact_id !== contactId) {
      await pool.query(
        `UPDATE app_auth_users
            SET contact_id = :cid
          WHERE id = :id`,
        { cid: contactId, id: existing.id }
      );
    }
    return { ...existing, contact_id: contactId };
  }

  // Otherwise insert
  const [res] = await pool.query(
    `INSERT INTO app_auth_users (business_id, contact_id, email)
          VALUES (:bid, :cid, :email)`,
    { bid: BIZ, cid: contactId, email }
  );
  return { id: res.insertId, business_id: BIZ, contact_id: contactId, email };
}

// ----------------- routes -----------------

// 1) request reset (and bootstrap first-time password if user exists only in ERP)
// Always 200 to avoid account enumeration.
router.post('/request-reset', async (req, res, next) => {
  try {
    if (!BIZ) return res.status(500).json({ error: 'server_misconfigured', message: 'Missing BUSINESS_ID' });

    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'missing_fields', message: 'Email is required.' });

    // Find the ERP contact (must have contact_id)
    const contact = await findContactWithNonNullContactIdByEmail(email);
    if (!contact) {
      // No leak: pretend success
      return res.json({ ok: true });
    }

    // Ensure local auth user row exists/aligns to contact
    let user;
    try {
      user = await ensureAuthUserForEmail(email, contact.id);
    } catch (e) {
      // Keep response stable to avoid leaking existence
      console.error('[auth][request-reset] ensure error', e);
      return res.json({ ok: true });
    }

    // Create a single-use reset token
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    await pool.query(
      `UPDATE app_auth_users
          SET reset_token = :t,
              reset_token_expires = :e
        WHERE id = :id`,
      { t: token, e: expires, id: user.id }
    );

     const isProd = process.env.NODE_ENV === 'production';
    // New: allow explicit override via env for local testing
    const showDevToken = process.env.AUTH_DEBUG_TOKENS === 'true' || !isProd;
    return res.json(showDevToken ? { ok: true, token } : { ok: true });
  } catch (err) {
    next(err);
  }
});

// 2) complete reset -> set password & login
router.post('/reset', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'missing_fields', message: 'Token and password are required.' });
    }

    const [[user]] = await pool.query(
      `SELECT id, business_id, contact_id, email
         FROM app_auth_users
        WHERE reset_token = :t
          AND reset_token_expires > NOW()
        LIMIT 1`,
      { t: token }
    );
    if (!user) {
      return res.status(400).json({ error: 'invalid_token', message: 'Invalid or expired reset code.' });
    }

    const pwHash = await hash(password);
    await pool.query(
      `UPDATE app_auth_users
          SET password_hash = :p,
              reset_token = NULL,
              reset_token_expires = NULL
        WHERE id = :id`,
      { p: pwHash, id: user.id }
    );

    // Enrich JWT with group + price group
    const { cgid, pgid } = await groupIdsForContact(user.contact_id);
    const jwt = sign({ uid: user.id, cid: user.contact_id, bid: user.business_id, cgid, pgid });
    setAuthCookie(res, jwt);
    return res.json({ ok: true, cgid, pgid });
  } catch (err) {
    next(err);
  }
});

// 3) login
router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || !password) {
      return res.status(400).json({ error: 'missing_fields', message: 'Email and password are required.' });
    }

    const [[user]] = await pool.query(
      `SELECT id, business_id, contact_id, email, password_hash
         FROM app_auth_users
        WHERE business_id = :bid
          AND email = :email
        LIMIT 1`,
      { bid: BIZ, email }
    );
    if (!user) {
      return res.status(404).json({ error: 'not_found', message: 'User not found; use reset to bootstrap.' });
    }
    if (!user.password_hash) {
      return res.status(423).json({ error: 'password_not_set', message: 'Use reset to set a password.' });
    }

    const ok = await verifyPw(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Wrong email or password.' });
    }

    // Enrich JWT with group + price group
    const { cgid, pgid } = await groupIdsForContact(user.contact_id);
    const jwt = sign({ uid: user.id, cid: user.contact_id, bid: user.business_id, cgid, pgid });
    setAuthCookie(res, jwt);
    return res.json({ ok: true, cgid, pgid });
  } catch (err) {
    next(err);
  }
});

// 4) logout
router.post('/logout', async (_req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  });
  return res.json({ ok: true });
});

export default router;
