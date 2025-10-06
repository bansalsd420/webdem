import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
const BIZ = Number(process.env.BUSINESS_ID);

// simple auth gate: behind reverse proxy or add JWT role check later

router.put('/categories/:id/hide', async (req, res) => {
  const id = Number(req.params.id);
  const { hide_for_all_users = 0, hide_for_guests = 0 } = req.body;
  await pool.query(
    `INSERT INTO app_category_visibility (business_id, category_id, hide_for_all_users, hide_for_guests)
     VALUES (:bid,:cid,:all,:guest)
     ON DUPLICATE KEY UPDATE hide_for_all_users=:all, hide_for_guests=:guest`,
    { bid: BIZ, cid: id, all: hide_for_all_users ? 1 : 0, guest: hide_for_guests ? 1 : 0 }
  );
  res.json({ ok: true });
});

router.post('/categories/:id/restrict', async (req, res) => {
  const id = Number(req.params.id);
  const { contact_ids = [] } = req.body;
  if (!Array.isArray(contact_ids)) return res.status(400).json({ error: 'contact_ids array required' });

  const values = contact_ids.map(cid => [id, Number(cid)]);
  if (values.length) {
    await pool.query('DELETE FROM app_category_hidden_for_contacts WHERE category_id = :cid', { cid: id });
    await pool.query('INSERT INTO app_category_hidden_for_contacts (category_id, contact_id) VALUES ?', [values]);
  }
  res.json({ ok: true });
});

export default router;
