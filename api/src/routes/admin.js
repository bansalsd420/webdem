import { Router } from 'express';
import { pool } from '../db.js';
import catVis from '../lib/categoryVisibility.js';
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
  // Invalidate cached visibility for this business
  try { catVis.invalidateVisibilityCache({ businessId: BIZ }); } catch (e) { console.error('[admin] invalidate vis cache failed', e); }
  res.json({ ok: true });
});

router.post('/categories/:id/restrict', async (req, res) => {
  const id = Number(req.params.id);
  const { contact_ids = [] } = req.body;
  if (!Array.isArray(contact_ids)) return res.status(400).json({ error: 'contact_ids array required' });
  const recursive = !!req.body.recursive;

  // If recursive, compute descendants and expand the category ids to insert
  let catIds = [id];
  if (recursive) {
    try {
      const desc = await catVis.expandDescendants ? await catVis.expandDescendants([id], BIZ) : new Set([id]);
      catIds = Array.from(desc);
    } catch (e) {
      console.error('[admin] failed to expand descendants for recursive restrict', e);
    }
  }

  const values = [];
  for (const cidCat of catIds) {
    for (const c of contact_ids) values.push([Number(cidCat), Number(c), BIZ]);
  }
  if (values.length) {
    // Use named placeholders; mysql2 expands arrays for IN when using namedPlaceholders
    await pool.query('DELETE FROM app_category_hidden_for_contacts WHERE category_id IN (:ids) AND business_id = :bid', { ids: catIds, bid: BIZ });
    // Insert expects (category_id, contact_id, business_id)
    await pool.query('INSERT INTO app_category_hidden_for_contacts (category_id, contact_id, business_id) VALUES ?', [values]);
  }
  try { catVis.invalidateVisibilityCache({ businessId: BIZ }); } catch (e) { console.error('[admin] invalidate vis cache failed', e); }
  res.json({ ok: true });
});

export default router;
