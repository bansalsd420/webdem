import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET;

export function sign(payload, opts = {}) {
  return jwt.sign(payload, SECRET, {
    jwtid: crypto.randomUUID(),
    expiresIn: process.env.JWT_EXPIRES || '7d',
    ...opts
  });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
