// /api/src/routes/test.js
// Dev-only: manage app_category_visibility and app_home_banners.
// Safe, parameterized queries. Mounted at /api/test.

import express from "express";
import { pool } from "../db.js";

const router = express.Router();
const BID = Number(process.env.BUSINESS_ID || 0);

// ---------- per-contact hidden visibility helpers (dev/test) ----------
// GET /visibility/effective?business_id=&contact_id=
router.get('/visibility/effective', async (req, res) => {
  try {
    const businessId = Number(req.query.business_id || BID || 0);
    const contactId = req.query.contact_id ? Number(req.query.contact_id) : null;
    const catVis = await import('../lib/categoryVisibility.js');
    const set = await catVis.hiddenCategorySet(businessId, contactId);
    res.json({ business_id: businessId, contact_id: contactId, hidden: Array.from(set || []) });
  } catch (e) {
    console.error('test visibility effective error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /visibility/for-contact  body: { category_id, contact_ids:[], recursive, business_id }
router.post('/visibility/for-contact', async (req, res) => {
  try {
    const body = req.body || {};
    const categoryId = Number(body.category_id || 0);
    const contactIds = Array.isArray(body.contact_ids) ? body.contact_ids.map(Number).filter(Boolean) : [];
    const recursive = !!body.recursive;
    const businessId = Number(body.business_id || BID || 0);
    if (!categoryId || !contactIds.length) return res.status(400).json({ error: 'category_id_and_contact_ids_required' });

    // compute categories (descendants if recursive)
    const { expandDescendants } = await import('../lib/categoryVisibility.js');
    let categories = [categoryId];
    if (recursive && typeof expandDescendants === 'function') {
      try { categories = Array.from(await expandDescendants([categoryId], businessId)); } catch { /* fallback to single */ }
    }

    // delete existing for these cats/contact/biz then insert
    await pool.query('DELETE FROM app_category_hidden_for_contacts WHERE business_id = :bid AND category_id IN (:cats) AND contact_id IN (:cids)', { bid: businessId, cats: categories, cids: contactIds });
    const values = [];
    for (const c of categories) for (const cid of contactIds) values.push([c, cid, businessId]);
    if (values.length) await pool.query('INSERT INTO app_category_hidden_for_contacts (category_id, contact_id, business_id) VALUES ?', [values]);

    // invalidate cache
    const catvis = await import('../lib/categoryVisibility.js');
    try { catvis.invalidateVisibilityCache({ businessId }); } catch (e) { console.error('invalidate vis cache failed', e); }

    res.json({ ok: true, categories, contact_ids: contactIds });
  } catch (e) {
    console.error('test visibility for-contact error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /visibility/for-contact body: { category_id, contact_ids:[], recursive, business_id }
router.delete('/visibility/for-contact', async (req, res) => {
  try {
    const body = req.body || {};
    const categoryId = Number(body.category_id || 0);
    const contactIds = Array.isArray(body.contact_ids) ? body.contact_ids.map(Number).filter(Boolean) : [];
    const recursive = !!body.recursive;
    const businessId = Number(body.business_id || BID || 0);
    if (!categoryId || !contactIds.length) return res.status(400).json({ error: 'category_id_and_contact_ids_required' });

    const { expandDescendants } = await import('../lib/categoryVisibility.js');
    let categories = [categoryId];
    if (recursive && typeof expandDescendants === 'function') {
      try { categories = Array.from(await expandDescendants([categoryId], businessId)); } catch { }
    }

    await pool.query('DELETE FROM app_category_hidden_for_contacts WHERE business_id = :bid AND category_id IN (:cats) AND contact_id IN (:cids)', { bid: businessId, cats: categories, cids: contactIds });
    const catvis = await import('../lib/categoryVisibility.js');
    try { catvis.invalidateVisibilityCache({ businessId }); } catch (e) { console.error('invalidate vis cache failed', e); }
    res.json({ ok: true, removed: categories, contact_ids: contactIds });
  } catch (e) {
    console.error('test visibility for-contact delete error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /categories/descendants?category_id=...&business_id=...
router.get('/categories/descendants', async (req, res) => {
  try {
    const categoryId = Number(req.query.category_id || 0);
    const businessId = Number(req.query.business_id || BID || 0);
    if (!categoryId) return res.status(400).json({ error: 'category_id_required' });
    const { expandDescendants } = await import('../lib/categoryVisibility.js');
    let ids = [categoryId];
    try {
      if (typeof expandDescendants === 'function') {
        ids = Array.from(await expandDescendants([categoryId], businessId));
      }
    } catch (e) {
      // fallback: scan categories table
      const [rows] = await pool.query('SELECT id, parent_id, name FROM categories WHERE business_id = ?', [businessId]);
      const map = new Map();
      for (const r of rows) { map.set(Number(r.id), { parent: Number(r.parent_id), name: r.name }); }
      const out = new Set(); const q = [categoryId];
      while (q.length) {
        const c = q.shift(); if (out.has(c)) continue; out.add(c);
        for (const [id, v] of map.entries()) if (v.parent === c) q.push(id);
      }
      ids = Array.from(out);
    }
    // fetch names for ids
    const [rows] = await pool.query('SELECT id, name FROM categories WHERE id IN (?)', [ids]);
    res.json({ ids: ids, categories: rows });
  } catch (e) {
    console.error('test categories descendants error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /visibility/flush  body: { business_id?, contact_id? }
router.post('/visibility/flush', async (req, res) => {
  try {
    const businessId = Number(req.body.business_id || BID || 0);
    const contactId = req.body.contact_id ? Number(req.body.contact_id) : undefined;
    const catvis = await import('../lib/categoryVisibility.js');
    try { catvis.invalidateVisibilityCache({ businessId, contactId }); } catch (e) { console.error('invalidate vis cache failed', e); }
    res.json({ ok: true });
  } catch (e) {
    console.error('test visibility flush error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// ---------- utils ----------
const normBool = (v, def = 0) =>
  v === true || v === 1 || v === "1" || v === "true"
    ? 1
    : v === false || v === 0 || v === "0" || v === "false"
    ? 0
    : def
    ? 1
    : 0;

const pick = (o, f) => f.reduce((a, k) => (o[k] !== undefined ? ((a[k] = o[k]), a) : a), {});

// ---------- reference: ALL categories for this business ----------
router.get("/categories", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name
         FROM categories
        WHERE business_id = ? AND (deleted_at IS NULL OR deleted_at = 0)
        ORDER BY name ASC`,
      [BID || 1]
    );
    res.json(rows);
  } catch (e) {
    console.error("test categories error", e);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------- visibility: get ALL categories + joined visibility flags ----------
router.get("/visibility/all", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         c.id AS category_id,
         c.name AS category_name,
         COALESCE(v.hide_for_guests, 0) AS hide_for_guests,
         COALESCE(v.hide_for_all_users, 0) AS hide_for_all_users
       FROM categories c
       LEFT JOIN app_category_visibility v
         ON v.category_id = c.id AND v.business_id = ?
      WHERE c.business_id = ? AND (c.deleted_at IS NULL OR c.deleted_at = 0)
      ORDER BY c.name ASC`,
      [BID, BID]
    );
    res.json(rows);
  } catch (e) {
    console.error("test visibility all error", e);
    res.status(500).json({ error: "server_error" });
  }
});

// existing: get only rows that exist in app_category_visibility (optionally for one category)
router.get("/visibility", async (req, res) => {
  try {
    const categoryId = Number(req.query.category_id || req.query.categoryId || 0) || null;
    const sql = `
      SELECT v.id, v.business_id, v.category_id,
             v.hide_for_guests, v.hide_for_all_users,
             c.name AS category_name
        FROM app_category_visibility v
        JOIN categories c ON c.id = v.category_id
       WHERE v.business_id = ?
         ${categoryId ? "AND v.category_id = ?" : ""}
       ORDER BY c.name ASC`;
    const params = categoryId ? [BID, categoryId] : [BID];
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error("test visibility get error", e);
    res.status(500).json({ error: "server_error" });
  }
});

// upsert one (business_id, category_id)
router.post("/visibility", async (req, res) => {
  try {
    const category_id = Number(req.body.category_id || req.body.categoryId);
    if (!category_id) return res.status(400).json({ error: "category_id_required" });

    const hide_for_guests = normBool(req.body.hide_for_guests ?? req.body.hideForGuests, 0);
    const hide_for_all_users = normBool(req.body.hide_for_all_users ?? req.body.hideForAllUsers, 0);

    await pool.query(
      `INSERT INTO app_category_visibility
         (business_id, category_id, hide_for_guests, hide_for_all_users)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         hide_for_guests = VALUES(hide_for_guests),
         hide_for_all_users = VALUES(hide_for_all_users)`,
      [BID, category_id, hide_for_guests, hide_for_all_users]
    );

    const [[row]] = await pool.query(
      `SELECT v.*, c.name AS category_name
         FROM app_category_visibility v
         JOIN categories c ON c.id = v.category_id
        WHERE v.business_id = ? AND v.category_id = ?`,
      [BID, category_id]
    );
    res.json(
      row || {
        business_id: BID,
        category_id,
        hide_for_guests,
        hide_for_all_users,
      }
    );
  } catch (e) {
    console.error("test visibility upsert error", e);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------- banners: list ----------
router.get("/banners", async (req, res) => {
  try {
    const slot = (req.query.slot || "hero").toString().toLowerCase();
    if (!["hero", "wall"].includes(slot)) return res.status(400).json({ error: "invalid_slot" });

    const [rows] = await pool.query(
      `SELECT id, slot, sort_order, href, file_name, alt_text, is_gif, active,
              created_at, updated_at
         FROM app_home_banners
        WHERE slot = ?
        ORDER BY sort_order ASC, id ASC`,
      [slot]
    );
    res.json(rows);
  } catch (e) {
    console.error("test banners list error", e);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------- banners: create or update (auto sort when creating) ----------
router.post("/banners", async (req, res) => {
  try {
    const body = pick(req.body || {}, [
      "id",
      "slot",
      "sort_order",
      "href",
      "file_name",
      "alt_text",
      "is_gif",
      "active",
    ]);

    const slot = (body.slot || "hero").toString().toLowerCase();
    if (!["hero", "wall"].includes(slot)) return res.status(400).json({ error: "invalid_slot" });

    let sort_order = Number(body.sort_order || 0);
    const href = body.href || "";
    const file_name = body.file_name || "";
    const alt_text = body.alt_text || "";
    const is_gif = normBool(body.is_gif, 0);
    const active = normBool(body.active, 1);

    if (Number(body.id || 0) > 0) {
      const id = Number(body.id);
      await pool.query(
        `UPDATE app_home_banners
            SET slot=?, sort_order=?, href=?, file_name=?, alt_text=?, is_gif=?, active=?
          WHERE id=?`,
        [slot, sort_order || 0, href, file_name, alt_text, is_gif, active, id]
      );
      const [[row]] = await pool.query(`SELECT * FROM app_home_banners WHERE id=?`, [id]);
      return res.json(row);
    } else {
      // Auto-assign next sort if not provided or <= 0
      if (!sort_order || sort_order <= 0) {
        const [[m]] = await pool.query(
          `SELECT COALESCE(MAX(sort_order), 0) AS max_sort
             FROM app_home_banners
            WHERE slot = ?`,
          [slot]
        );
        sort_order = Number(m?.max_sort || 0) + 1;
      }
      const [ins] = await pool.query(
        `INSERT INTO app_home_banners
           (slot, sort_order, href, file_name, alt_text, is_gif, active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [slot, sort_order, href, file_name, alt_text, is_gif, active]
      );
      const [[row]] = await pool.query(`SELECT * FROM app_home_banners WHERE id=?`, [ins.insertId]);
      return res.status(201).json(row);
    }
  } catch (e) {
    console.error("test banners upsert error", e);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------- banners: swap order with neighbour (up/down) ----------
router.post("/banners/reorder", async (req, res) => {
  try {
    const id = Number(req.body.id || 0);
    const dir = (req.body.dir || "").toLowerCase(); // 'up' | 'down'
    if (!id || !["up", "down"].includes(dir))
      return res.status(400).json({ error: "invalid_args" });

    // find current row
    const [[row]] = await pool.query(
      `SELECT id, slot, sort_order FROM app_home_banners WHERE id=?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: "not_found" });

    const cmp = dir === "up" ? "<" : ">";
    const ord = dir === "up" ? "DESC" : "ASC";

    // neighbour in same slot
    const [[nbr]] = await pool.query(
      `SELECT id, sort_order
         FROM app_home_banners
        WHERE slot = ? AND sort_order ${cmp} ?
        ORDER BY sort_order ${ord}
        LIMIT 1`,
      [row.slot, row.sort_order]
    );
    if (!nbr) return res.status(200).json({ changed: false });

    // swap
    await pool.query(`UPDATE app_home_banners SET sort_order=? WHERE id=?`, [
      nbr.sort_order,
      row.id,
    ]);
    await pool.query(`UPDATE app_home_banners SET sort_order=? WHERE id=?`, [
      row.sort_order,
      nbr.id,
    ]);

    // return fresh ordered list
    const [list] = await pool.query(
      `SELECT id, slot, sort_order, href, file_name, alt_text, is_gif, active
         FROM app_home_banners
        WHERE slot=?
        ORDER BY sort_order ASC, id ASC`,
      [row.slot]
    );
    res.json({ changed: true, items: list });
  } catch (e) {
    console.error("test banners reorder error", e);
    res.status(500).json({ error: "server_error" });
  }
});

// delete banner
router.delete("/banners/:id", async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: "invalid_id" });
    await pool.query(`DELETE FROM app_home_banners WHERE id=?`, [id]);
    res.status(204).end();
  } catch (e) {
    console.error("test banners delete error", e);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------- broadcasts: list (active ones) ----------
router.get('/broadcasts', async (req, res) => {
  try {
    const businessId = Number(req.query.business_id || BID || 0);
    const [rows] = await pool.query(
      `SELECT id, business_id, title, body, active, created_at, updated_at
         FROM app_home_broadcasts
        WHERE business_id = ?
        ORDER BY created_at DESC`,
      [businessId]
    );
    res.json(rows);
  } catch (e) {
    console.error('test broadcasts list error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// upsert broadcast
router.post('/broadcasts', async (req, res) => {
  try {
    const body = req.body || {};
    const id = Number(body.id || 0);
    const businessId = Number(body.business_id || BID || 0);
    const title = body.title || null;
    const text = body.body || null;
    const active = normBool(body.active, 1);

    if (id > 0) {
      await pool.query(`UPDATE app_home_broadcasts SET title=?, body=?, active=? WHERE id=?`, [title, text, active, id]);
      const [[row]] = await pool.query(`SELECT * FROM app_home_broadcasts WHERE id=?`, [id]);
      return res.json(row);
    }

    const [ins] = await pool.query(`INSERT INTO app_home_broadcasts (business_id, title, body, active) VALUES (?, ?, ?, ?)`, [businessId, title, text, active]);
    const [[row]] = await pool.query(`SELECT * FROM app_home_broadcasts WHERE id=?`, [ins.insertId]);
    res.status(201).json(row);
  } catch (e) {
    console.error('test broadcasts upsert error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// delete broadcast
router.delete('/broadcasts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    await pool.query(`DELETE FROM app_home_broadcasts WHERE id=?`, [id]);
    res.status(204).end();
  } catch (e) {
    console.error('test broadcasts delete error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
