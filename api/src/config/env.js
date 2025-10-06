// api/src/config/env.js
import dotenv from 'dotenv';
dotenv.config();

// small helper so we fail fast if a must-have var is missing
const must = (name) => {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`[env] Required env var ${name} is missing/empty`);
  }
  return v;
};

export const BUSINESS_ID = Number(must('BUSINESS_ID'));

// Optional exports if you want them available in code (not required for this fix):
export const JWT_SECRET   = must('JWT_SECRET');
export const JWT_EXPIRES  = process.env.JWT_EXPIRES || '7d';

export const CONNECTOR_ENV = {
  BASE_URL: must('CONNECTOR_BASE_URL'),
  TOKEN_PATH: process.env.CONNECTOR_TOKEN_PATH || '/oauth/token',
  PREFIX: process.env.CONNECTOR_PREFIX || process.env.CONNECTOR_API_PREFIX || '/connector/api',
  CLIENT_ID: must('CONNECTOR_CLIENT_ID'),
  CLIENT_SECRET: must('CONNECTOR_CLIENT_SECRET'),
  USERNAME: must('CONNECTOR_USERNAME'),
  PASSWORD: must('CONNECTOR_PASSWORD'),
  SCOPE: process.env.CONNECTOR_SCOPE || '*',
  BEARER: process.env.CONNECTOR_BEARER || '',
};
