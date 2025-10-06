// src/redux/slices/cartSlice.js
import { createSlice } from "@reduxjs/toolkit";

/**
 * We support two shapes:
 * - Logged-in (server): items come from API as-is (line `id`, `product_id`, `variation_id`, `price`, `qty`, etc.)
 * - Guest (local): items we store have product-level identity (id=product id, variationId)
 *
 * To avoid breaking server flows (remove line needs line id), we DO NOT normalize
 * server payload on setServer/setCart. We only normalize inputs for local add/setQty.
 */

const initialState = {
  items: [],
  count: 0,
  subtotal: 0.0,
  // validation pass (5 minutes) before checkout
  validation: {
    status: "idle",          // 'idle' | 'ok' | 'blocking' | 'expired'
    checkedAt: null,         // ISO string
    validThrough: null,      // ISO string (checkedAt + 5min)
    issuesByLine: {},        // line_id -> { available, wanted, status }
  },
};

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const recalc = (state) => {
  state.count = state.items.reduce((s, it) => s + n(it.qty), 0);
  state.subtotal = state.items.reduce((s, it) => s + n(it.price) * n(it.qty), 0);
};

// Normalize only for LOCAL (guest) operations
const normalizeIncoming = (raw) => ({
  id: raw.id ?? raw.product_id ?? raw.productId, // product id for local items
  product_id: raw.product_id ?? raw.productId ?? null, // keep if caller sent it
  variationId: raw.variationId ?? raw.variation_id ?? raw.variant_id ?? null,
  name: raw.name ?? raw.product_name ?? "",
  variant_label:
    raw.variant_label ??
    raw.variation_label ??
    raw.variant ??
    raw.variation_name ??
    "",
  price: raw.price != null ? Number(raw.price) : null,
  image: raw.image ?? raw.product_image ?? "",
  qty: n(raw.qty ?? 0),
});

export const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    // Overwrite from server (logged-in). Keep server fields as-is
    setCart(state, action) {
      const arr = Array.isArray(action.payload) ? action.payload : [];
      state.items = arr;
      recalc(state);
      // any structural change invalidates the validation pass
      state.validation = {
        status: "idle",
        checkedAt: null,
        validThrough: null,
        issuesByLine: {},
      };
    },

    // Add or delta-add (guest/local only)
    addToCart(state, action) {
      const incoming = normalizeIncoming(action.payload);
      if (incoming.qty === 0) return;

      // merge by (product id + variationId) for local items
      const idx = state.items.findIndex(
        (x) =>
          (x.id ?? x.product_id) === (incoming.id ?? incoming.product_id) &&
          (x.variationId ?? x.variation_id ?? null) ===
            (incoming.variationId ?? null)
      );

      if (idx >= 0) {
        const existing = state.items[idx];
        existing.qty = n(existing.qty) + n(incoming.qty);
        if (incoming.price != null) existing.price = n(incoming.price);
        if (incoming.variant_label) existing.variant_label = incoming.variant_label;
        if (incoming.image) existing.image = incoming.image;
        if (incoming.name) existing.name = incoming.name;
        if (incoming.product_id != null) existing.product_id = incoming.product_id;
      } else {
        state.items.push({
          id: incoming.id,
          product_id: incoming.product_id ?? null,
          variationId: incoming.variationId ?? null,
          name: incoming.name,
          variant_label: incoming.variant_label,
          price: incoming.price != null ? n(incoming.price) : null,
          image: incoming.image,
          qty: n(incoming.qty),
        });
      }
      recalc(state);
      state.validation = {
        status: "idle",
        checkedAt: null,
        validThrough: null,
        issuesByLine: {},
      };
    },

    // Set exact qty (guest/local)
    setQty(state, action) {
      const { id, product_id = null, variationId = null, qty } =
        action.payload || {};
      const idx = state.items.findIndex(
        (x) =>
          (x.id ?? x.product_id) === (id ?? product_id) &&
          (x.variationId ?? x.variation_id ?? null) ===
            (variationId ?? null)
      );
      if (idx >= 0) {
        if (n(qty) <= 0) state.items.splice(idx, 1);
        else state.items[idx].qty = n(qty);
        recalc(state);
        state.validation = {
          status: "idle",
          checkedAt: null,
          validThrough: null,
          issuesByLine: {},
        };
      }
    },

    // Remove single line (guest/local)
    removeFromCart(state, action) {
      const { id, product_id = null, variationId = null } = action.payload || {};
      state.items = state.items.filter(
        (x) =>
          !(
            (x.id ?? x.product_id) === (id ?? product_id) &&
            (x.variationId ?? x.variation_id ?? null) ===
              (variationId ?? null)
          )
      );
      recalc(state);
      state.validation = {
        status: "idle",
        checkedAt: null,
        validThrough: null,
        issuesByLine: {},
      };
    },

    // Aliases you already import in the app
    setServer(state, action) {
      cartSlice.caseReducers.setCart(state, action);
    },
    add(state, action) {
      cartSlice.caseReducers.addToCart(state, action);
    },
    remove(state, action) {
      cartSlice.caseReducers.removeFromCart(state, action);
    },
    clear(state) {
      state.items = [];
      recalc(state);
      state.validation = {
        status: "idle",
        checkedAt: null,
        validThrough: null,
        issuesByLine: {},
      };
    },

    // Validation state (5-minute pass)
    setValidation(state, action) {
      const { ok, checkedAt, ttlMs = 5 * 60 * 1000, lines = [] } =
        action.payload || {};
      const until = checkedAt
        ? new Date(new Date(checkedAt).getTime() + ttlMs)
        : null;
      state.validation.status = ok ? "ok" : "blocking";
      state.validation.checkedAt = checkedAt || new Date().toISOString();
      state.validation.validThrough = until ? until.toISOString() : null;
      const issues = {};
      for (const r of lines) {
        if (r.status !== "ok") {
          issues[r.line_id] = {
            available: r.available,
            wanted: r.wanted,
            status: r.status,
          };
        }
      }
      state.validation.issuesByLine = issues;
    },
    expireValidation(state) {
      if (state.validation.status === "ok") {
        state.validation.status = "expired";
      }
    },
    invalidateValidation(state) {
      state.validation = {
        status: "idle",
        checkedAt: null,
        validThrough: null,
        issuesByLine: {},
      };
    },
  },
});

export const {
  setCart,
  addToCart,
  setQty,
  removeFromCart,
  setServer,
  add,
  remove,
  clear,
  setValidation,
  expireValidation,
  invalidateValidation,
} = cartSlice.actions;

export default cartSlice.reducer;
