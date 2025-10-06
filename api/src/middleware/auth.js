import { verifyToken } from '../utils/jwt.js';

export function authOptional(req, _res, next) {
  const raw = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!raw) return next();
  try { req.user = verifyToken(raw); } catch { /* ignore */ }
  next();
}

export function authRequired(req, res, next) {
  const raw = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  try { req.user = verifyToken(raw); return next(); }
  catch { return res.status(401).json({ error: 'unauthorized' }); }
}
