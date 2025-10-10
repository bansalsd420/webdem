
# MojiStore Full‑Stack System Blueprint

> Version: 2025‑10‑06 · Scope: **frontend (`/mojistore`) + backend (`/api`) + DB + UltimatePOS connector**  
> Audience: developers making **surgical edits** to pages/components, routes, and data flows.

---

## 1) High‑Level Architecture

---
# MojiStore System Blueprint (concise & current)

Purpose
- A concise reference that explains how the storefront (React), API (Express), database (MySQL) and UltimatePOS connector interact today.

High level
- Frontend: `mojistore/` (React + Vite). Talks to backend at `/api/*`.
- Backend: `api/` (Node + Express). Routes in `api/src/routes/*.js`.
- Connector: `api/src/lib/erp.js` centralizes UltimatePOS HTTP calls.
- DB: MySQL (UltimatePOS schema + `app_` tables for web-only data).

Operational principles
- Prices and stock authority remain with the server/ERP. The frontend does not calculate or send final prices.
- Auth uses cookie-based JWT. Frontend warms session via `GET /api/account/me`.
- Local in-process cache is used for performance. DB-based cross-process invalidation is optional (off by default).

How to run (quick)
1) Backend: from `api/` run `npm install` then `npm run dev` (or `node src/server.js`). Set `PORT` or `ADMIN_COMMANDS_FILE` in env if needed.
2) Frontend: from `mojistore/` run `npm install` then `npm run dev`.
3) Use browser for simple GETs; use curl/PowerShell/Postman for POST/PATCH/DELETE that need headers/JSON bodies.

Admin / operator options (simple language)
- Prefer HTTP admin endpoints when you can send a header:
  - `GET /api/admin/cache/stats` — returns in-process cache stats (requires `x-admin-cache-secret` header).
  - `POST /api/admin/cache/flush` — delete a cache key (requires admin secret).
- Prefer file-based admin if you can't or don't want to send headers:
  - Set `ADMIN_COMMANDS_FILE` env to a path (e.g. `admin_cache_commands.json`) and restart server.
  - Write commands there (`flush` array of keys; `stats: true`) and the server will process them and (for `stats`) write `admin_cache_stats.json` next to it.

Broadcasts & Home modal behaviour
- The Home payload (`GET /api/home`) can include a `broadcast` object when an active `app_home_broadcasts` row exists. The frontend will show a Broadcast modal (after the Age Verification modal) when `broadcast` is present in the payload.
- The Age Verification modal and Broadcast modal are per-tab only: the frontend uses `sessionStorage` to persist seen flags so the modals show once per tab (they reappear on a new tab or private window).
- Manage broadcasts in development via the Test UI (`/__test`) or the dev endpoints under `/api/test/broadcasts`. Apply the SQL migration `api/migrations/20251010_create_app_home_broadcasts.sql` to enable the table in your DB.

Key code locations
- Server entry: `api/src/server.js`
- Cache & invalidation: `api/src/lib/cache.js`
- File admin helper: `api/src/lib/fileAdmin.js`
- ERP connector: `api/src/lib/erp.js`
- Product routes: `api/src/routes/products.js`

Additional routes of note
- Home route: `api/src/routes/home.js` (aggregates banners, brand logos, rails and includes an optional `broadcast` field in the payload)
- Dev/test endpoints: `api/src/routes/test.js` (contains broadcast management endpoints under `/api/test/broadcasts`)

Common flows (short)
- Listing: frontend → `GET /api/products` (supports page/perPage, q, category, brand, locationId). Non-`inStock` pages are cached per-page.
- PDP: frontend → `GET /api/products/:id?locationId` → server shapes connector data (variants, qty per location, images).
- Cart: guests use Redux/localStorage; logged-in users use server cart (`/api/cart`). Merge occurs on login.
- Checkout: frontend → `POST /api/checkout/create` (sends product ids/variation ids/qty + location). Server resolves price group and posts `/sell` to connector.

Next steps (recommended)
- Wire write-path invalidations: ensure inventory/product writes call `cache.invalidateByKey(...)` (or insert rows into `cache_invalidation` if `CACHE_USE_DB_INVALIDATION=true`).
- Add lightweight telemetry for ERP scans and cache effectiveness (X-ERP-Scan headers already present in product listing when multi-page scans occur).

If you'd like, I will now rewrite the schema cheat sheet and OpenAPI spec to match the current code exactly. Confirm and I'll replace `mj_web_schema_cheatsheet.md` and `mj_web_openapi.yaml`.
- **PDP**: hydrates from router state → `GET /products/:id` (+ `/related`), debounced on location changes.
