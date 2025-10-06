/* api/src/routes/cms.js */
import { Router } from 'express';
import { authOptional } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/cms/settings
 * Returns [{k,v}] for footer contact info without DB.
 * Uses ENV if present, falls back to defaults.
 */
router.get('/settings', authOptional, async (_req, res) => {
  try {
    const rows = [
      { k: 'company.support_email', v: process.env.SUPPORT_EMAIL || 'sales@mojistore.com' },
      { k: 'company.support_phone', v: process.env.SUPPORT_PHONE || '+91 99999 99999' },
      { k: 'company.locations',     v: process.env.COMPANY_LOCATIONS || 'Mumbai • Delhi • Vancouver' },
    ];
    res.json(rows);
  } catch (e) {
    console.error('cms settings error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* Optional: accept contact form POST but don't persist (no tables) */
router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ error: 'name email message required' });
    console.log('[contact]', { name, email, phone, subject, message }); // hook to email service later if needed
    res.json({ ok: true });
  } catch (e) {
    console.error('cms contact error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
