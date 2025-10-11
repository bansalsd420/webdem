import { Router } from 'express';

// Admin route placeholder. Specific admin handlers were removed per project cleanup.
// This file remains to avoid changing the admin route mountpoint.
const router = Router();

// placeholder ping so route remains valid
router.get('/ping', (_req, res) => res.json({ ok: true, note: 'admin endpoints placeholder' }));

export default router;
