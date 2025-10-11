// /api/src/routes/test.js
// Dev-only: manage app_home_banners and home broadcasts.
// Safe, parameterized queries. Mounted at /api/test.

import express from "express";
import { pool } from "../db.js";

const router = express.Router();
const BID = Number(process.env.BUSINESS_ID || 0);

// Dev/test helpers and banners/broadcasts endpoints.

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

// Category visibility test/admin endpoints removed per project request.

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
