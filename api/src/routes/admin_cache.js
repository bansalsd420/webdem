import { Router } from 'express';
import cache from '../lib/cache.js';

const router = Router();

// POST /api/admin/cache/flush  { key }
// Guarded by ADMIN_CACHE_SECRET env var. If not set, endpoint is disabled.
router.post('/flush', async (req, res) => {
  const secret = process.env.ADMIN_CACHE_SECRET || '';
  if (!secret) return res.status(404).json({ error: 'not_found' });
  const auth = req.headers['x-admin-cache-secret'] || req.body?.secret;
  if (!auth || String(auth) !== String(secret)) return res.status(403).json({ error: 'forbidden' });

  const key = req.body?.key;
  if (!key) return res.status(400).json({ error: 'missing_key' });
  try {
    cache.del(key);
    return res.json({ ok: true, key });
  } catch (e) {
    console.error('admin cache flush error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'flush_failed' });
  }
});

// POST /api/admin/cache/flush-prefix  { prefix }
// Accepts a prefix string (e.g. 'products:v1:' or 'products:v1:abc*').
router.post('/flush-prefix', async (req, res) => {
  const secret = process.env.ADMIN_CACHE_SECRET || '';
  if (!secret) return res.status(404).json({ error: 'not_found' });
  const auth = req.headers['x-admin-cache-secret'] || req.body?.secret;
  if (!auth || String(auth) !== String(secret)) return res.status(403).json({ error: 'forbidden' });

  const prefix = req.body?.prefix;
  if (!prefix) return res.status(400).json({ error: 'missing_prefix' });
  try {
    // support trailing '*' wildcard; cache.invalidateByKey understands both forms
    const key = String(prefix).endsWith('*') ? String(prefix) : String(prefix) + '*';
    await cache.invalidateByKey(key);
    return res.json({ ok: true, prefix });
  } catch (e) {
    console.error('admin cache flush-prefix error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'flush_failed' });
  }
});

// GET /api/admin/cache/stats
router.get('/stats', async (req, res) => {
  const secret = process.env.ADMIN_CACHE_SECRET || '';
  if (!secret) return res.status(404).json({ error: 'not_found' });
  const auth = req.headers['x-admin-cache-secret'] || req.query?.secret;
  if (!auth || String(auth) !== String(secret)) return res.status(403).json({ error: 'forbidden' });
  try {
    const s = cache.stats();
    return res.json({ ok: true, stats: s });
  } catch (e) {
    console.error('admin cache stats error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'stats_failed' });
  }
});

export default router;
