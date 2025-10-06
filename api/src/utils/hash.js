import bcrypt from 'bcryptjs';
export const hash = (s) => bcrypt.hash(s, 10);
export const verify = (s, h) => bcrypt.compare(s, h);
