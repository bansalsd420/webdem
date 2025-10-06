# CODEPACK for mojistore — Part 02

> Files included in this part (7):
- `mojistore/src/styles/static.css`
- `mojistore/src/styles/subnavbar.css`
- `mojistore/src/styles/theme.css`
- `mojistore/src/utils/cartMerge.js`
- `mojistore/src/utils/getProductImage.js`
- `mojistore/src/utils/locations.js`
- `mojistore/vite.config.js`

---
### FILE: mojistore/src/styles/static.css
```css
/* src/styles/static.css */
.static-page {
  color: var(--color-text);
  max-width: 80rem;
  margin: 0 auto;
  padding: 1.25rem 1rem 3rem;
}
.static-hero {
  padding: 2.5rem 0 1rem;
  display: grid;
  gap: .5rem;
  border-bottom: 1px solid var(--color-border);
}
.static-title { font-weight: 800; font-size: clamp(1.4rem, 1.6vw, 2rem); }
.static-sub { color: var(--color-muted); max-width: 60ch; }

.static-section {
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--color-border);
}
.static-section:last-child { border-bottom: 0; }
.static-head { font-weight: 700; margin-bottom: .5rem; }
.static-text { color: var(--color-muted); line-height: 1.6; }
.static-list { padding-left: 1rem; display: grid; gap: .4rem; color: var(--color-muted); }
.static-kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(255,255,255,.04); padding: 0 .35rem; border-radius: .35rem; }

.faq-item { border: 1px solid var(--color-border); border-radius: .75rem; background: rgba(255,255,255,.02); }
.faq-q { cursor: pointer; padding: .8rem 1rem; font-weight: 600; display: flex; align-items: center; justify-content: space-between; }
.faq-a { padding: .8rem 1rem .95rem; color: var(--color-muted); border-top: 1px dashed var(--color-border); }
.faq-q:hover { background: rgba(255,255,255,.03); }

.contact-grid { display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; }
@media (max-width: 900px) { .contact-grid { grid-template-columns: 1fr; } }
.contact-card { border: 1px solid var(--color-border); border-radius: .75rem; padding: 1rem; background: rgba(255,255,255,.02); }
.contact-form { border: 1px solid var(--color-border); border-radius: .75rem; padding: 1rem; display: grid; gap: .6rem; background: rgba(255,255,255,.02); }
.input, .textarea {
  width: 100%; border: 1px solid var(--color-border); border-radius: .6rem;
  background: var(--color-surface); color: var(--color-text); padding: .6rem .7rem;
}
.textarea { min-height: 140px; resize: vertical; }
.btn {
  display: inline-flex; align-items: center; gap: .4rem;
  border: 1px solid var(--color-neon); padding: .55rem .9rem; border-radius: .6rem;
  background: rgba(0,255,225,.08); color: var(--color-text);
}
.btn:hover { background: rgba(0,255,225,.14); transform: translateY(-1px); }
.note { color: var(--color-muted); font-size: .92rem; }

```

### FILE: mojistore/src/styles/subnavbar.css
```css
/* ==========================================================================
   MojiStore — SubNavbar (dropdown list: boxes, up to 3 cols, no inner scroll)
   ========================================================================== */

.ms-subnav{
  position: relative;
  z-index: var(--z-subnav);
  width: 100%;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(10px) saturate(120%);
  /* absolutely-positioned menus can’t create sideways scroll */
  overflow-x: clip;
  overflow-y: visible;
}

.ms-subnav .row{
  display:flex;
  flex-wrap:wrap;
  gap:.6rem;
  padding:.55rem 0;                 /* slimmer row */
  align-items:center;
  position:relative;
}

.ms-subnav .ms-cat{ position:relative; display:inline-block; }

/* Pill */
.ms-subnav .ms-pill{
  display:inline-flex; align-items:center; white-space:nowrap;
  border:1px solid var(--color-border);
  background:var(--color-surface);
  color:var(--color-text);
  padding:.42rem .8rem;              /* sleeker pill */
  border-radius:var(--r-btn);
  font-size:.9rem;
  text-decoration:none;
  transition: border-color .15s ease, background-color .15s ease, color .15s ease, transform .15s ease;
}
.ms-subnav .ms-pill:hover{
  transform: translateY(-1px);
  border-color: color-mix(in oklab, var(--color-border) 60%, var(--color-accent));
  background: var(--color-surface-2);
}

/* Active pill (when on /products?category=ID) */
.ms-subnav .ms-pill.is-active,
.ms-subnav .ms-pill[aria-current="page"]{
  border-color: var(--color-accent);
  background: color-mix(in oklab, var(--color-surface) 75%, var(--color-accent));
  color: var(--color-text);
}

/* Dropdown anchor (directly below) */
.ms-subnav .ms-mega{
  position:absolute;
  top: calc(100% + 6px); /* no gap → no flicker */
  left:0;                /* default: align under start of pill */
  display:none;
  z-index: var(--z-dropdown);
  pointer-events:none;
  max-width: 100vw;
}

/* Hover bridge to keep :hover alive while moving to menu */
.ms-subnav .ms-mega::before{
  content:"";
  position:absolute;
  left:0; right:0; top:-8px;
  height:8px;
}

/* Open states */
.ms-subnav .ms-cat:hover > .ms-mega,
.ms-subnav .ms-cat:focus-within > .ms-mega,
.ms-subnav .ms-cat[data-open="1"] > .ms-mega,
.ms-subnav .ms-mega.is-open{
  display:block !important;
  pointer-events:auto;
}

/* Alignment control (toggled by JS to avoid right overflow) */
.ms-subnav .ms-mega[data-align="end"]{ left:auto; right:0; }
.ms-subnav .ms-mega[data-align="center"]{ left:50%; transform: translateX(-50%); }

/* Menu card — width derives from column count; no inner scrollbar */
.ms-subnav .ms-mega-card{
  --cols: 1;                          /* JS sets 1..3 */
  --rows: 7;                          /* JS bumps if > 21 items */
  --col-min: 210px;
  --gap-x: 12px;
  --gap-y: 8px;

  inline-size: fit-content;           /* shrink to fit content */
  min-inline-size: calc(var(--cols) * var(--col-min) + (var(--cols) - 1) * var(--gap-x));
  max-inline-size: min(96vw, calc(var(--cols) * 280px + (var(--cols) - 1) * var(--gap-x)));
  /* no max-height and no overflow → no inner scrollbar */
  overflow: visible;

  padding:.75rem;
  background:var(--color-surface);
  border:1px solid var(--color-border);
  border-radius:var(--r-card);
  box-shadow: var(--shadow-1);
  will-change: transform, opacity;
  animation: msMegaIn .14s ease-out both;
}

/* Title */
.ms-subnav .ms-mega-title{
  font-size:.72rem; font-weight:700; letter-spacing:.08em;
  color:var(--color-muted);
  padding:.2rem .25rem .55rem;
}

/* List grid: fill down first, then across; max 3 columns */
.ms-subnav .ms-mega-grid{
  display:grid;
  grid-auto-flow: column;  /* fill rows first */
  grid-template-rows: repeat(var(--rows), auto);
  grid-template-columns: repeat(var(--cols), minmax(var(--col-min), 1fr));
  gap: var(--gap-y) var(--gap-x);
  align-items:start;
}

/* Item boxes (boxed even without hover) */
.ms-subnav .ms-mega-item{
  display:block;
  padding:.55rem .7rem;
  border-radius:12px;
  border:1px solid var(--color-border);
  background: var(--color-surface-2);
  color:var(--color-text);
  text-decoration:none;
  transition: background-color .12s ease, border-color .12s ease, color .12s ease, transform .12s ease;
}
.ms-subnav .ms-mega-item:hover,
.ms-subnav .ms-mega-item:focus{
  background: color-mix(in oklab, var(--color-surface-2) 70%, var(--color-accent));
  border-color: var(--color-accent);
  transform: translateY(-1px);
  outline:none;
}

/* Subtle intro */
@keyframes msMegaIn{
  from{ opacity:0; transform: translateY(-6px) scale(.985); }
  to{   opacity:1; transform: translateY(0)    scale(1); }
}
@media (prefers-reduced-motion: reduce){
  .ms-subnav .ms-mega-card{ animation:none; }
}

```

### FILE: mojistore/src/styles/theme.css
```css
@import "tailwindcss";

/* ============================== DARK (default) ============================== */
/* Neutral blacks (no blue cast) + a clear layer scale for z-index. */
:root {
  /* Neutral surfaces */
  --color-bg: #0a0a0b;
  /* page */
  --color-surface: #101012;
  /* cards/nav bars */
  --color-surface-2: #151517;
  /* tiles, hovers */
  --color-border: #242426;

  --color-text: #e8edf5;
  --color-muted: #99a1af;

  /* Accents */
  --color-neon: #22d3ee;
  /* cyber blue */
  --color-magenta: #ff4d8d;
  --color-gold: #f3c64b;
  --color-accent: var(--color-neon);
  --color-success: #16a34a;
  --color-danger: #ef4444;

  /* Wishlist colors (Navbar uses these semantics in JS) */
  --wishlist-stroke-dark: #ffffff;
  --wishlist-fill-dark: #ffffff;
  --wishlist-stroke-light: #111827;
  --wishlist-fill-light: #e11d48;

  /* Radii */
  --r-card: 16px;
  --r-btn: 8px;
  --r-chip: 8px;

  /* Site clamp */
  --site-max: 1760px;
  --site-pad: 10px;

  /* Cards */
  --card-img-h: 280px;

  /* Shadows */
  --shadow-1: 0 10px 30px rgba(0, 0, 0, .40);
  --shadow-2: 0 22px 60px rgba(0, 0, 0, .48);

  /* Layer scale */
  --z-subnav: 40;
  --z-navbar: 60;
  --z-dropdown: 75;
  --z-popover: 70;
  /* nav menus, search suggest */
  --z-overlay: 900;
  /* scrims */
  --z-modal: 1000;
  /* dialogs, quick view */

  color-scheme: dark;
}

/* ============================== LIGHT (white) =============================== */
html[data-theme="light"] {
  --color-bg: #ffffff;
  --color-surface: #ffffff;
  --color-surface-2: #f6f7fb;
  --color-border: #e6e8ee;

  --color-text: #111827;
  --color-muted: #657084;

  --color-neon: #06b6d4;
  --color-magenta: #db2777;
  --color-gold: #e2b23b;
  --color-accent: var(--color-neon);
  --color-success: #16a34a;
  --color-danger: #ef4444;

  --site-max: 1760px;
  --site-pad: 10px;

  --shadow-1: 0 8px 24px rgba(16, 24, 40, .10);
  --shadow-2: 0 18px 42px rgba(16, 24, 40, .14);

  /* Same layer scale in light mode */
  --z-subnav: 40;
  --z-navbar: 60;
  --z-popover: 70;
  --z-dropdown: 75;
  --z-overlay: 900;
  --z-modal: 1000;

  color-scheme: light;
}

/* Ultra-wide bump */
@media (min-width: 1920px) {
  :root {
    --site-max: 1920px;
  }
}

/* ============================== Minimal Base ================================ */
html,
body {
  background: var(--color-bg);
  color: var(--color-text);
}

::selection {
  background: color-mix(in oklab, var(--color-neon) 25%, transparent);
  color: var(--color-text);
}

/* Cyber-blue hover for all links/text marked as links */
a,
.link {
  color: var(--color-text);
  transition: color .15s ease, border-color .15s ease, text-shadow .15s ease;
}

a:hover,
.link:hover {
  color: var(--color-neon);
  text-shadow: 0 0 0 transparent;
}

/* Slim scrollbars */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

*::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 999px;
}


/* --- Instant theme swap guard ------------------------------------------- */
/* When Navbar adds .theme-instant on <html>, kill all transitions/animations
   for a single paint so the dark<->light flip is truly instantaneous. */
html.theme-instant, html.theme-instant * , html.theme-instant *::before, html.theme-instant *::after{
  transition: none !important;
  animation: none !important;
}

/* Container clamp helpers used by app wrappers */
.max-w-7xl {
  max-width: var(--site-max) !important;
}

.px-3 {
  padding-left: var(--site-pad) !important;
  padding-right: var(--site-pad) !important;
}

.sm\:px-6 {
  padding-left: calc(var(--site-pad) + 8px) !important;
  padding-right: calc(var(--site-pad) + 8px) !important;
}
/* Make common dark Tailwind utilities adapt in light mode */
html:not(.dark) .bg-zinc-900 { background-color: var(--color-surface-2) !important; }
html:not(.dark) .border-zinc-800 { border-color: var(--color-border) !important; }
html:not(.dark) .text-zinc-400 { color: var(--color-muted) !important; }

/* In-stock / out-of-stock pills: outline-only, readable in light mode */
.pill--ok  { background: transparent; border-color: rgba(16,185,129,.55); color: rgb(5,150,105); }
.pill--bad { background: transparent; border-color: rgba(248,113,113,.6);  color: rgb(185,28,28); }
/* --- Footer breathing room (all pages) --- */
main, .page-shell, .account-page, .products-page, .pdp-page {
  padding-bottom: clamp(32px, 4vw, 56px);
}

/* Remove any harsh footer top borders and rely on a soft divider */
.site-footer {
  border-top: 0;
  box-shadow: 0 -1px 0 rgba(0,0,0,.06);            /* light mode */
}
:root.dark .site-footer {
  box-shadow: 0 -1px 0 rgba(255,255,255,.06);      /* dark mode */
}
/* Products page title: slimmer weight, better scale */
.products-title {
  font-size: clamp(22px, 2.2vw, 28px);
  font-weight: 600;
  letter-spacing: .2px;
  margin: 14px 0 10px;
}

/* Search bar: sleeker height and spacing */
.products-toolbar .search input {
  height: 38px;
  border-radius: 12px;
}
.products-toolbar { margin-bottom: 14px; }
/* --- MiniCart theme fixes ------------------------------------------ */
.mini-cart, .miniCart, [data-mini-cart] {
  --mc-surface: var(--card, #ffffff);
  --mc-text: var(--text, #1f2328);
  --mc-border: var(--border, rgba(0,0,0,.12));
  --mc-btn-bg: #fff;
  --mc-btn-fg: #1f2328;
  --mc-btn-border: rgba(0,0,0,.14);
  --mc-qty-bg: #fff;
  --mc-qty-fg: #1f2328;
}

:root.dark .mini-cart,
:root.dark .miniCart,
:root.dark [data-mini-cart] {
  --mc-surface: var(--card, #0f172a);
  --mc-text: var(--text, #e5e7eb);
  --mc-border: var(--border, rgba(255,255,255,.12));
  --mc-btn-bg: #111827;
  --mc-btn-fg: #e5e7eb;
  --mc-btn-border: rgba(255,255,255,.14);
  --mc-qty-bg: #0b1220;
  --mc-qty-fg: #e5e7eb;
}

/* Icon buttons, remove black-on-light */
.mini-cart .icon-btn,
.miniCart .icon-btn,
[data-mini-cart] .icon-btn {
  background: var(--mc-btn-bg);
  color: var(--mc-btn-fg);
  border: 1px solid var(--mc-btn-border);
}

/* Qty control */
.mini-cart .qty, .miniCart .qty, [data-mini-cart] .qty {
  background: var(--mc-qty-bg);
  color: var(--mc-qty-fg);
  border: 1px solid var(--mc-border);
}
.mini-cart .qty button, .miniCart .qty button, [data-mini-cart] .qty button {
  background: transparent;
  color: inherit;
}

```

### FILE: mojistore/src/utils/cartMerge.js
```javascript

import api from "../api/axios";

export async function mergeGuestCartToServer(items = []) {
  for (const line of items) {
    const { product_id, variation_id, qty } = line || {};
    if (!product_id || !variation_id || !qty) continue;
    await api.post("/cart/add", { product_id, variation_id, qty });
  }
}

```

### FILE: mojistore/src/utils/getProductImage.js
```javascript
// src/utils/getProductImage.js
export function placeholder() { return "/placeholder.jpg"; }

function extractName(input) {
  if (!input) return "";
  if (typeof input === "string") return input;
  const cand = input.url || input.file || input.path || input.image || input.filename || input.file_name || input.name || "";
  return typeof cand === "string" ? cand : "";
}
function basename(str) {
  if (!str) return "";
  const q = str.split("?")[0].split("#")[0];
  if (/^https?:\/\//i.test(q)) return q;
  const seg = q.replace(/^\/+/, "").split("/").pop();
  return seg || "";
}

function getProductImage(input, opts = {}) {
  // support responsive sizing
  const {
    q = 82,
    fit = "contain",
    width = undefined,
    height = undefined,
    format = "auto",
  } = opts;

  const raw = extractName(input);
  if (!raw) return placeholder();
  if (/^https?:\/\//i.test(raw)) return raw;

  const file = basename(raw);
  if (!file) return placeholder();

  const qp = new URLSearchParams();
  qp.set("fit", fit);
  qp.set("format", format);
  if (Number.isFinite(q) && q > 0 && q <= 100) qp.set("q", String(q));
  if (Number.isFinite(width))  qp.set("w", String(Math.round(width)));
  if (Number.isFinite(height)) qp.set("h", String(Math.round(height)));

  return `/img/${encodeURIComponent(file)}?${qp.toString()}`;
}

// back-compat
export const buildImgUrl = getProductImage;
export const imgUrl = getProductImage;
export default getProductImage;

```

### FILE: mojistore/src/utils/locations.js
```javascript
// src/utils/location.js
/** Read a valid selected location id (number) or return undefined.
 * Never returns 0 or NaN.
 */
export function readSelectedLocationId() {
  try {
    const rawUrl = new URLSearchParams(window.location.search || '').get('location');
    const fromUrl = Number(rawUrl);
    if (Number.isFinite(fromUrl) && fromUrl > 0) return fromUrl;
  } catch {
    /* ignore */
  }
  const keys = ['ms_location_id', 'locationId'];
  for (const k of keys) {
    const n = Number(localStorage.getItem(k));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined; // important: do not return 0
}

/** Write selected location id everywhere consistently. */
export function writeSelectedLocationId(id, name) {
  const v = Number(id);
  const ok = Number.isFinite(v) && v > 0 ? String(v) : '';
  localStorage.setItem('ms_location_id', ok);
  localStorage.setItem('locationId', ok);
  if (name != null) localStorage.setItem('ms_location_name', String(name));
}

/** Broadcast a location change event for listeners (Products, PDP, etc.) */
export function broadcastLocation(id, name) {
  const detail = { id: id ?? null, name: name ?? '' };
  window.dispatchEvent(new CustomEvent('moji:location-change', { detail }));
  window.dispatchEvent(new CustomEvent('location:changed', { detail }));
}

```

### FILE: mojistore/vite.config.js
```javascript
// mojistore/vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000'

  return defineConfig({
    plugins: [react(), tailwind()],      // ← add this
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: false },
        '/img': { target: apiTarget, changeOrigin: true, secure: false },
      },
    },
  })
}

```

