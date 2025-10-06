
# MojiStore Full‑Stack System Blueprint

> Version: 2025‑10‑06 · Scope: **frontend (`/mojistore`) + backend (`/api`) + DB + UltimatePOS connector**  
> Audience: developers making **surgical edits** to pages/components, routes, and data flows.

---

## 1) High‑Level Architecture

```
[React SPA (Vite) - /mojistore]
   │
   │  Axios (withCredentials)  ───────────────────────────────────────────────┐
   ▼                                                                          │
[Express API - /api]                                                          │
   │   ├── Auth / Account / Cart / Checkout / Products / Filters / Home / ... │
   │   └── Image proxy (/img) + PDF service                                   │
   │
   ├── Local MySQL (mirror + app tables)                                      │
   │       ├── products, variations, media                                    │
   │       ├── contacts, customer_groups                                      │
   │       ├── transactions, transaction_sell_lines, transaction_payments     │
   │       ├── app_carts, app_cart_items, app_wishlists, app_home_banners     │
   │       └── app_auth_users, app_category_*                                  │
   │
   └── UltimatePOS Connector (OAuth password)  →  /connector/api/*
           ├── product(s), contact(s), business‑locations
           └── sell (create)  — authoritative posting of orders
```

**Principle:** Prices are **computed server‑side** using price groups; the client never sets price authority. Authentication is **cookie‑based JWT**; UI learns session via `/account/me` to prevent flicker.

---

## 2) ID & Context Model

- **JWT claims**: `uid` (app user id), `cid` (contacts.id), `bid` (business id), `cgid` (customer_group_id), `pgid` (selling_price_group_id).
- **Contact identifiers**: human **code** (e.g., `CO0005`) resolved → numeric **id** for connector.
- **Location**: selected via Navbar; persisted in URL `?location=` and `localStorage(ms_location_id|locationId)`; broadcast as events.
- **Price Group**: derived from `contacts.customer_group_id → customer_groups.selling_price_group_id` and added to JWT; used by server when pricing cart/checkout lines.

---

## 3) Frontend Structure & Responsibilities

### App shell
- **`main.jsx`** mounts app, providers (Auth, Redux) and CSS.
- **`App.jsx`** routes; `RequireAuth` probes `/account/me` before rendering gated pages.

### Navigation & discovery
- **Navbar**: session warm‑up, search (`/search/suggest`), location picker (`/locations`).
- **SubNavbar**: preloads categories → subcategories (cache & concurrency‑limited).
- **SideNav**: mobile drawer with ESC/outside‑click handling.

### Pages
- **Home**: single `GET /home` → hero banners + rails (Trending, Fresh, Best Sellers, Brands).
- **Products**: URL‑driven filters + pagination → `GET /filters` + `GET /products` (with `locationId`).
- **PDP**: hydrates from router state → `GET /products/:id` (+ `/related`), debounced on location changes.
- **Cart**: guest (Redux) vs logged‑in (server `/cart`); merge on login.
- **Checkout**: `GET /checkout/bootstrap` + `POST /checkout/create` (server computes prices, posts `/sell` to connector).
- **Account tabs**: `/account/*` and `/accountProfile/*` (documents, orders, payments, ledger, profile, addresses).

### Components
- **ProductCard**: schema‑tolerant; login‑gate to PDP; wishlist; opens **QuickView**.
- **QuickView**: minimal PDP; one‑click add when single variation.
- **Carousels**: Embla‑based (`HeroCarousel`, `RowCarousel`).

---

## 4) Backend Route Map (contract surface)

| Route | Purpose | Data Source |
|---|---|---|
| **/auth/login** / **/auth/logout** / **/account/me** | Session cookie JWT lifecycle | Local DB |
| **/products** | Listing with filters, location‑aware stock | Connector + shaping |
| **/products/:id** | Product detail (variations, stock, images) | Connector + shaping |
| **/products/:id/related** | Related listing by category/brand | Connector |
| **/filters** | Counts (brands, categories, subcategories) | Local DB |
| **/home** | Banners + rails + brands | Local DB |
| **/locations** | Business locations (normalized) | Connector |
| **/cart** (GET/POST/PATCH/DELETE) | Server cart for authed users | Local DB |
| **/checkout/bootstrap** | Locations + defaults | Local DB |
| **/checkout/create** | Compute price‑groups, post `/sell` | Connector + Local DB |
| **/account/orders** / **/invoices** | Sell transactions | Local DB |
| **/account/payments** | Payments for sells | Local DB |
| **/account/ledger** | Combined sells + payments + summaries | Local DB |
| **/account/documents** | Media by contact | Local DB |
| **/accountProfile/profile** / **/addresses** | Profile & addresses | Connector (read) + Local DB (write profile) |
| **/img/:file** | Sharp transformer / cache | Remote media origin |

**Response headers:** pagination via `X‑Total‑Count` where relevant (orders, payments, ledger, products).

---

## 5) Sequence Diagrams (key flows)

### 5.1 Login → Price‑aware browsing
```
User → Frontend: POST /auth/login (email, password)
Frontend → API: /auth/login  → sets cookie (jwt)
Frontend → API: GET /account/me
API → DB: app_auth_users + contacts + customer_groups
API → Frontend: { id, contact_id, cgid, pgid }  (session warm)
Frontend: shows prices on listings/PDP for authed users
```

### 5.2 Products → PDP (location‑aware) → Cart
```
Navbar: select location (id,name)
Navbar → localStorage + URL + Events: write + broadcast (moji:location-change)

Products Page:
  listens to event → refetch
  Frontend → API: GET /products?q,category,brand,locationId,page,limit
  API → Connector: product list + variation_location_details
  API → Frontend: shaped items (no price for guests)

PDP:
  Frontend → API: GET /products/:id?locationId
  API → Connector: product detail
  API: normalize stock/price, hide price for guests
  Add to cart:
    Guest → Redux only
    Authed → API: POST /cart/add (server authoritative)
```

### 5.3 Checkout (server computes prices)
```
Frontend → API: GET /checkout/bootstrap → { locations, default_location_id }
Frontend (authed) → API: POST /checkout/create { products:[{product_id, variation_id, quantity}], location_id }
API:
  → DB: resolve contact_id, price group (pgid)
  → DB: compute unit_price per variation (price groups)
  → Connector: POST /sell (single sell with lines, status, payment_status)
  ← Connector: { id, invoice_no, ... }
API: clear server cart (best effort), return result
```

### 5.4 Account › Ledger
```
Frontend → API: GET /account/ledger?from&to&locationId&q&page&limit
API → DB: transactions + transaction_payments (+dynamic optional columns)
API → Frontend: rows[], summary; headers: X‑Total‑Count
```

---

## 6) Data Model (operational subset)

```
contacts(id, business_id, contact_id(code), email, customer_group_id, ...)
customer_groups(id, selling_price_group_id, ...)

products(id, business_id, brand_id, category_id, sub_category_id, name, sku, image, ...)
variations(id, product_id, name, sub_sku, ...)
media(id, model_type, model_id, file_name, description, created_at, ...)

transactions(id, business_id, contact_id, type='sell', status, location_id, final_total, invoice_no, payment_status, ...)
transaction_sell_lines(id, transaction_id, product_id, variation_id, quantity, unit_price, ...)
transaction_payments(id, transaction_id, amount, method, paid_on, reference_no?, ...)

app_auth_users(id, business_id, contact_id, email, password_hash, reset_token, reset_token_expires, ...)
app_carts(id, user_id), app_cart_items(id, cart_id, product_id, variation_id, qty)
app_wishlists(user_id, product_id)
app_home_banners(...)
app_category_visibility(...), app_category_hidden_for_contacts(...)
```

---

## 7) Events & Caching

**Global events**
- `auth:login` / `auth:logout` — emitted by AuthProvider and axios interceptor; components (Navbar, ProductCard) listen to react.
- `moji:location-change` (alias `location:changed`) — emitted by Navbar/locations util; Products, PDP, Ledger listen and refetch.

**Caches**
- Account profile: in‑memory TTL 2 minutes (`window.__accountCache`).
- Orders/Payments/Ledger: `sessionStorage` with 1–2 minute TTL; hydrated instantly, refreshed in background.

---

## 8) Known Good Patterns & Safe Improvements

**Strong patterns**
- URL‑driven filters & pagination (shareable links)
- Debounced, location‑aware PDP refetch
- Schema‑tolerant cart & ProductCard (robust to backend field drift)
- Single `/home` call with resilient image fallbacks

**Recommended improvements (non‑breaking)**
1. **Unify cart payload shape** in UI to `{ productId, variationId, qty }` (or normalize in axios request interceptor).
2. **AbortController** in PDP/QuickView fetches to cancel stale requests on rapid location/page changes.
3. **Consistent price field** consumption (`minPrice` + formatted text) across Cards, PDP, QuickView.
4. **Post‑checkout client clear** of Redux cart to avoid UI flicker when user revisits Cart.

---

## 9) Endpoint Quick Reference (for frontend devs)

- **Auth**: `POST /auth/login`, `POST /auth/logout`, `GET /account/me`
- **Products**: `GET /products`, `GET /products/:id`, `GET /products/:id/related`
- **Filters**: `GET /filters`
- **Home**: `GET /home`
- **Locations**: `GET /locations`
- **Cart**: `GET /cart`, `POST /cart/add`, `PATCH /cart/update`, `DELETE /cart/remove/:id`
- **Checkout**: `GET /checkout/bootstrap`, `POST /checkout/create`
- **Account**: `GET /account/orders`, `GET /account/invoices`, `GET /account/ledger`, `GET /account/payments`, `GET /account/documents`
- **Profile**: `GET /account/profile`, `PUT /account/profile`, `GET /account/addresses`
- **Images**: `GET /img/:file?w=&h=&fit=&format=&q=`

---

## 10) Non‑Goals / Explicit Boundaries

- Client never sets authoritative prices; server computes via **price groups**.
- Frontend shows **no price for guests** (server enforces).
- Category visibility and per‑contact restrictions are enforced on the server (admin routes).

---

### Appendix A — Request Payload Shapes (canonical)

- **Add to cart** (authed):  
  `{ productId: number, variationId: number|null, qty: number }`

- **Checkout.create**:  
  `{ products: [{ product_id, variation_id, quantity }...], location_id, status?, payment_status?, payments? }`

- **Profile.update**:  
  `{ name?, email?, phone?, company? }` (writes to local `contacts` + sync email to `app_auth_users`)
