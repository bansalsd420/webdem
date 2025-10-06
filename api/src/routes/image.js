// api/src/routes/image.js
import { Router } from 'express';
import sharp from 'sharp';
import { Readable } from 'stream';
import crypto from 'crypto';
import os from "os";
// Remote origin where originals live
const ORIGIN_PREFIX = 'https://backoffice.mojiwholesale.com/uploads/img/';
sharp.cache({ memory: 256, files: 1000, items: 500 });
sharp.concurrency(Math.max(2, Math.min(8, os.cpus()?.length || 2)));

const router = Router();

/** very small in-memory cache for transformed outputs */
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ITEMS = 300;
const mem = new Map(); // key -> { buf, type, ts }
function getCache(key) {
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) { mem.delete(key); return null; }
  return hit;
}
function setCache(key, val) {
  mem.set(key, { ...val, ts: Date.now() });
  // crude LRU-ish trim
  if (mem.size > MAX_ITEMS) {
    const nTrim = Math.ceil(MAX_ITEMS / 5);
    const keys = [...mem.keys()].slice(0, nTrim);
    keys.forEach(k => mem.delete(k));
  }
}

/**
 * GET /img/:file
 * Query:
 *   w, h     -> when present, we resize (default fit=contain)
 *   fit      -> 'cover'|'contain'|'inside'|'outside'|'fill' (default 'contain')
 *   format   -> 'auto' | avif | webp | jpeg | png  (default auto)
 *   q        -> 40..100 (default 82)
 */
router.get('/:file', async (req, res) => {
  const file = req.params.file;
  if (!file) return res.status(400).send('missing file');

  // Client cache key (URL + Accept). Also use for our tiny memory cache.
  res.setHeader('Vary', 'Accept');
  const accept = req.headers['accept'] || '';
  const ekey = `${req.originalUrl}|${accept}`;
  const etag = '"' + crypto.createHash('sha1').update(ekey).digest('base64') + '"';
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();

  // Try in-memory cache first
  const memHit = getCache(ekey);
  if (memHit) {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30d
    res.type(memHit.type);
    return res.end(memHit.buf);
  }

  const encoded = encodeURIComponent(file);
  const srcUrl = ORIGIN_PREFIX + encoded;

  // query parsing
  const w = req.query.w ? Math.min(2048, Math.max(16, parseInt(req.query.w, 10))) : null;
  const h = req.query.h ? Math.min(2048, Math.max(16, parseInt(req.query.h, 10))) : null;
  const fit = ['cover', 'contain', 'inside', 'outside', 'fill'].includes(req.query.fit)
    ? req.query.fit
    : 'contain';
  const q = req.query.q ? Math.min(100, Math.max(40, parseInt(req.query.q, 10))) : 82;

  // Format negotiation
  let format = (req.query.format || 'auto').toLowerCase();

  // GIF passthrough (keep animation)
  if (file.toLowerCase().endsWith('.gif')) {
    try {
      const originResp = await fetch(srcUrl); // allow default caching
      if (!originResp.ok) throw new Error(`origin ${originResp.status}`);
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      res.type('gif');
      return Readable.fromWeb(originResp.body).pipe(res);
    } catch {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.type('gif');
      return res.end();
    }
  }

  if (format === 'auto') {
    format = accept.includes('image/avif') ? 'avif'
      : accept.includes('image/webp') ? 'webp'
        : 'jpeg';
  } else if (!['avif', 'webp', 'jpeg', 'jpg', 'png'].includes(format)) {
    format = 'jpeg';
  }

  // fetch original (do NOT force no-store)
  let originResp;
  try {
    originResp = await fetch(srcUrl);
    if (!originResp.ok) throw new Error(`origin ${originResp.status}`);
  } catch {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.type('png');
    const empty1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAH4gMWx+E9GQAAAABJRU5ErkJggg==',
      'base64'
    );
    return res.end(empty1x1);
  }

  try {
    const buf = Buffer.from(await originResp.arrayBuffer());
    let img = sharp(buf, { limitInputPixels: 268435456 });

    // ⬇️ Resize by default when w/h present (no extra flag needed)
    if (w || h) img = img.resize({ width: w || null, height: h || null, fit });

    if (format === 'avif') img = img.avif({ quality: q, effort: 2 }); // effort 2–4 is MUCH faster
    else if (format === 'webp') img = img.webp({ quality: q, smartSubsample: true });
    else if (format === 'png') img = img.png({ compressionLevel: 8 });
    else img = img.jpeg({ quality: q, mozjpeg: true, trellisQuantisation: true });
    const out = await img.toBuffer();

    const type =
      format === 'avif' ? 'image/avif' :
        format === 'webp' ? 'image/webp' :
          format === 'png' ? 'image/png' :
            'image/jpeg';

    // client cache + our tiny memory cache
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.type(type);
    setCache(ekey, { buf: out, type });
    res.end(out);
  } catch (e) {
    res.status(500).send('transform failed');
  }
});

export default router;
