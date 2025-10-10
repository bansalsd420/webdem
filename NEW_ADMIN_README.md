New admin quickstart — Mojistore web (layman language)

Welcome! This document gives a simple, practical guide to the Mojistore web project and the admin options you can use.

Who is this for
- New developers or operators who need to run the site locally, manage caches, or test category visibility and banners.
- Written in plain language with the common tasks you will perform.

Project layout (simple)
- api/ — The backend (Node.js + Express). Talks to the ERP/connector and the MySQL database.
  - src/routes — HTTP routes (APIs). Look here for admin/test endpoints.
  - src/lib — helper code (caching, category visibility helpers, file-admin watcher).
  - tools — small utilities for running admin tasks from the command line.
- mojistore/ — The frontend (React + Vite). Has a developer Test page used to exercise admin/test APIs.

Common tasks and how to do them
1) Start the backend locally
- Make sure .env or your shell provides required environment variables such as DB connection and (optionally) ADMIN_CACHE_SECRET.
- From the api folder:

  npm install   # if you haven't installed packages yet
  npm run dev   # starts the server in dev mode

- The server usually listens on port 4000 by default and logs "API listening on 4000".

2) Start the frontend locally
- From the mojistore folder:

  npm install
  npm run dev

- Vite will serve the frontend; open the app in your browser at the URL it prints (often http://localhost:5173).

Developer Test UI (quick)
- The frontend includes a page used for development and admin tasks: the Test page (file: mojistore/src/pages/Test.jsx).
- It has controls to:
  - Inspect and edit global category visibility (hide categories from guests or all users).
  - Apply per-contact category hides (hide categories only for a specific contact/customer).
  - Manage home banners (list, create, reorder, delete).
  - Manage home broadcast messages (dev panel `/__test`) — these can be used to display sitewide notices on the home page via the admin Test panel or directly via DB table `app_home_broadcasts`.
  - Flush caches and fetch cache stats (admin operations).

Admin cache controls (what you can do)
- There are several ways to flush cache keys. Use the Test UI or directly call the API endpoints.
  - POST /api/admin/cache/flush  { key, secret }
    - Deletes a single exact cache key. Requires the admin secret (or header X-ADMIN-CACHE-SECRET).
  - POST /api/admin/cache/flush-prefix  { prefix, secret }
    - Deletes keys matching a prefix. You can pass a string like "products:v1:" or "products:v1:abc*". Requires the admin secret.
  - GET /api/admin/cache/stats?secret=...  (or send secret in header)
    - Returns basic statistics about the in-memory cache.

File-based admin (watch a JSON file)
- The server can also watch a JSON file for admin commands (this is handy for simple operations on servers that have file access).
- The file's shape looks like:
  {
    "flush": ["products:v1:abcd*", "home:v1:123"],
    "stats": true
  }
- The server will process the flush list and then clear it so commands aren't repeated.
- See: api/ADMIN_FILE_README.md and api/src/lib/fileAdmin.js

Category visibility (what is enforced)
- Global visibility: In the DB table `app_category_visibility` you can set whether a category is hidden for guests or for all users.
- Per-contact visibility: `app_category_hidden_for_contacts` contains rows that hide categories for a particular contact (customer). The Test UI has controls to add/remove these for testing.
- The backend enforces visibility everywhere: products, search, filters, home lists and cart responses are filtered so hidden categories do not appear.

Security notes
- The admin cache endpoints are protected by the environment variable ADMIN_CACHE_SECRET. If that is not set, the endpoints return 404 and cannot be used.
- Do not expose ADMIN_CACHE_SECRET in public repos or UIs.

Quick examples (PowerShell)
- Flush an exact cache key:

  $headers = @{ 'X-ADMIN-CACHE-SECRET' = 'your-secret' }
  $body = '{"key":"products:v1:abcd"}'
  Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/cache/flush' -Headers $headers -Method Post -Body $body -ContentType 'application/json'

- Flush a prefix:

  $body = '{"prefix":"products:v1:"}'
  Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/cache/flush-prefix' -Headers $headers -Method Post -Body $body -ContentType 'application/json'

- Use the file admin (server must be configured to watch the commands file): edit api/admin_cache_commands.json and add commands, or run the helper script in api/tools/admin-file-cli.js (see README inside api folder).

Where to look when things go wrong
- Backend logs: api logs are printed to the console when running `npm run dev`.
- Look at api/src/lib/cache.js and api/src/lib/categoryVisibility.js for caching and visibility logic.
- If you change DB tables directly, flush the visibility cache or restart the server so changes are picked up.

Broadcasts and Home modals (new)
- Database: a new table `app_home_broadcasts` holds admin messages. A migration file was added: `api/migrations/20251010_create_app_home_broadcasts.sql` — run this against your MySQL instance to create the table.
- API: the backend includes dev-only endpoints to manage broadcasts: `GET /api/test/broadcasts`, `POST /api/test/broadcasts`, `DELETE /api/test/broadcasts/:id`. Use the frontend Test page (`/__test`) to exercise these safely in dev.
- Frontend: the Home page fetches `/api/home` and will display an Age Verification modal on first tab open (uses `sessionStorage` key) and then, if `broadcast` exists in the `/api/home` payload and is active, will show the Broadcast modal. The company name shown in the Age modal comes from the Vite env var `VITE_MOJISTORE_NAME` (set in `mojistore/.env` or `.env.local`).

Applying the migration (example PowerShell)
  # from a shell that has mysql client installed, or use your DB GUI tool
  mysql -u youruser -p yourdb < api/migrations/20251010_create_app_home_broadcasts.sql

Using the Test UI to create a broadcast (PowerShell example)
  $body = @{ business_id = 1; title = 'Site notice'; body = 'We are updating prices tonight'; active = $true } | ConvertTo-Json
  Invoke-RestMethod -Uri 'http://localhost:4000/api/test/broadcasts' -Method Post -Body $body -ContentType 'application/json'

Contact and next steps
- If you want UX improvements (confirmation modal when applying recursive hides, toasts, server-side search for large category sets), open an issue or ask here and someone will implement it.

Thanks — this file is intentionally small and practical. If you'd like, I can expand it with diagrams, command snippets for Linux shells, or a checklist for common admin tasks.

Linux / Bash examples
---------------------
Here are the same quick examples in a Unix-like shell (Linux or macOS). They use curl.

- Flush an exact cache key:

  curl -X POST 'http://localhost:4000/api/admin/cache/flush' \
    -H 'Content-Type: application/json' \
    -d '{"key":"products:v1:abcd","secret":"your-secret"}'

- Flush a prefix:

  curl -X POST 'http://localhost:4000/api/admin/cache/flush-prefix' \
    -H 'Content-Type: application/json' \
    -d '{"prefix":"products:v1:","secret":"your-secret"}'

- Get cache stats:

  curl 'http://localhost:4000/api/admin/cache/stats?secret=your-secret'

Step-by-step troubleshooting (quick)
-----------------------------------
If something doesn't work, try these steps in order. They are ordered from least to most intrusive.

1) Is the server running?
  - Backend: in the `api` folder run `npm run dev`. You should see "API listening on 4000".
  - Frontend: in the `mojistore` folder run `npm run dev`. Vite will print a URL like `http://localhost:5173`.

2) Are you using the right port and URL?
  - Backend API defaults to port 4000. If your frontend calls `/api/...` through a proxy, confirm the proxy is configured.

3) Is ADMIN_CACHE_SECRET set (for admin endpoints)?
  - If not set, the admin cache endpoints will return 404/forbidden.
  - On Linux: export ADMIN_CACHE_SECRET="your-secret"
  - On Windows PowerShell: $env:ADMIN_CACHE_SECRET = 'your-secret'

4) Check logs for errors
  - Backend logs appear in the terminal where you ran `npm run dev`.
  - Look for stack traces or messages with the route name (e.g., "test visibility for-contact error").

5) Changes to DB not showing?
  - The visibility results are cached in memory. After changing DB rows directly flush the visibility cache or restart the server.
  - Use the Test UI -> Flush visibility cache or call POST /api/test/visibility/flush.

6) Large category lists slow the browser
  - The Test picker currently does client-side search. If categories are very large (>2000), consider adding server-side search.

Mini architecture diagram (ASCII)

  [Browser / Vite]  <--->  [Frontend (React)]  <--HTTP-->  [Backend (Node/Express)]  <--->  [MySQL]
                                                         |
                                                         +--> [ERP connector / external services]

More help
---------
If you'd like I can add a step-by-step admin checklist, a more detailed runbook, or a short screencast showing the Test UI actions.
