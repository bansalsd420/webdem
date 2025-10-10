import { verifyToken } from '../utils/jwt.js';

export function authOptional(req, _res, next) {
  // Safely read token from cookie or Authorization header. Avoid calling
  // replace() on undefined which would throw and surface as a 500.
  const cookieToken = req.cookies?.token;
  const headerToken = req.headers?.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null;
  const raw = cookieToken || headerToken || null;
  if (!raw) return next();
  try { req.user = verifyToken(raw); } catch { /* ignore - optional auth */ }
  next();
}

export function authRequired(req, res, next) {
  // Safely read token and validate. Return 401 when missing/invalid.
  const cookieToken = req.cookies?.token;
  const headerToken = req.headers?.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null;
  const raw = cookieToken || headerToken || null;
  try {
    if (!raw) throw new Error('missing_token');
    req.user = verifyToken(raw);
    return next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
