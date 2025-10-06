import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import auth from './routes/auth.js';
import products from './routes/products.js';
import search from './routes/search.js';
import wishlist from './routes/wishlist.js';
import filters from './routes/filters.js';
import home from './routes/home.js';
import cart from './routes/cart.js';
import imageRouter from './routes/image.js';   // sharp images
import checkout from './routes/checkout.js';
import locations from './routes/locations.js';
import account from './routes/account.js';
import brandsRouter from './routes/brands.js';
import cmsRouter from './routes/cms.js';
import accountProfile from "./routes/accountProfile.js";
import trySell from './routes/try-sell.js';
import testRouter from './routes/test.js';
import { pool } from './db.js';
import './config/env.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());

// CORS driven by env (comma-separated)
if (process.env.CORS_ORIGIN) {
  const allow = process.env.CORS_ORIGIN.split(',').map(s => s.trim());
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allow.includes(origin)),
    credentials: true,
    methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
  }));
  app.options('*', cors({ origin: allow, credentials: true }));
}

// Health + DB info (handy for probing)
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/_dbinfo', async (_req, res) => {
  try {
    const [[row]] = await pool.query('SELECT DATABASE() AS db');
    const [[cnt]] = await pool.query(`
      SELECT COUNT(*) AS tables_count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `);
    res.json({ ok: true, db: row?.db, tables: Number(cnt?.tables_count || 0) });
  } catch (e) {
    console.error('_dbinfo error', e);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
});

// API routes
app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/search', search);
app.use('/api/wishlist', wishlist);
app.use('/api/filters', filters);
app.use('/api/home', home);
app.use('/api/cart', cart);
app.use('/api/checkout', checkout);
app.use('/api/test', testRouter);
app.use('/img', imageRouter);
app.use('/api/locations', locations);
app.use('/api/account', account);
app.use('/api/brands', brandsRouter);
app.use('/api/cms', cmsRouter);
app.use('/api/account',accountProfile);
app.use('/api/try-sell', trySell);
// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[server] error:', err);
  res.status(500).json({ error: 'internal' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log('API listening on', port));
