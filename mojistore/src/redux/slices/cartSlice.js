// src/redux/slices/cartSlice.js
import { createSlice } from "@reduxjs/toolkit";

/**
 * Item shape we keep in state:
 * {
 *   id: number,               // product id
 *   variationId: number|null, // variant id (null for products without variants)
 *   name: string,             // product name
 *   variant_label?: string,   // e.g. "BLUE RAZZ 5CT"
 *   price?: number|null,      // numeric price if known, else null (guest no-price)
 *   image?: string,           // image url
 *   qty: number               // integer qty
 * }
 *
 * We merge by (id + variationId) so variants stay distinct.
 */

const initialState = {
  items: [],
  count: 0,      // total quantity
  subtotal: 0.0, // sum(price * qty) where price is known; missing price treated as 0
};

const keyOf = (it) => `${it.id}|${it.variationId ?? "v0"}`;
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const recalc = (state) => {
  state.count = state.items.reduce((s, it) => s + n(it.qty), 0);
  state.subtotal = state.items.reduce((s, it) => s + n(it.price) * n(it.qty), 0);
};

const normalizeIncoming = (raw) => {
  // Map server item or client payload to our shape
  return {
    id: raw.id ?? raw.product_id ?? raw.productId,
    variationId:
      raw.variationId ?? raw.variation_id ?? raw.variant_id ?? null,
    name: raw.name ?? raw.product_name ?? "",
    variant_label:
      raw.variant_label ?? raw.variation_label ?? raw.variant ?? raw.variation_name ?? "",
    price: raw.price != null ? Number(raw.price) : null,
    image: raw.image ?? raw.product_image ?? "",
    qty: n(raw.qty ?? 0),
  };
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    // Overwrite from server (logged-in)
    setCart(state, action) {
      const arr = Array.isArray(action.payload) ? action.payload : [];
      const mapped = arr.map(normalizeIncoming);
      // Combine any duplicate server lines (rare, but safe)
      const map = new Map();
      for (const it of mapped) {
        const k = keyOf(it);
        const existing = map.get(k);
        if (existing) existing.qty += it.qty;
        else map.set(k, { ...it });
      }
      state.items = Array.from(map.values());
      recalc(state);
    },

    // Add or delta-add (used by guests too)
    addToCart(state, action) {
      const incoming = normalizeIncoming(action.payload);
      if (incoming.qty === 0) return;

      const idx = state.items.findIndex(
        (x) => x.id === incoming.id && (x.variationId ?? null) === (incoming.variationId ?? null)
      );

      if (idx >= 0) {
        // Merge quantities; keep most recent meta if provided
        const existing = state.items[idx];
        existing.qty = n(existing.qty) + n(incoming.qty);
        if (incoming.price != null) existing.price = n(incoming.price);
        if (incoming.variant_label) existing.variant_label = incoming.variant_label;
        if (incoming.image) existing.image = incoming.image;
        if (incoming.name) existing.name = incoming.name;
      } else {
        state.items.push({
          id: incoming.id,
          variationId: incoming.variationId ?? null,
          name: incoming.name,
          variant_label: incoming.variant_label,
          price: incoming.price != null ? n(incoming.price) : null,
          image: incoming.image,
          qty: n(incoming.qty),
        });
      }
      recalc(state);
    },
    clear(state) {
      state.items = [];
      state.count = 0;
      state.subtotal = 0;
    },


    // Set exact qty (guest)
    setQty(state, action) {
      const { id, variationId = null, qty } = action.payload || {};
      const idx = state.items.findIndex(
        (x) => x.id === id && (x.variationId ?? null) === (variationId ?? null)
      );
      if (idx >= 0) {
        if (n(qty) <= 0) state.items.splice(idx, 1);
        else state.items[idx].qty = n(qty);
        recalc(state);
      }
    },

    // Remove single line (guest)
    removeFromCart(state, action) {
      const { id, variationId = null } = action.payload || {};
      state.items = state.items.filter(
        (x) => !(x.id === id && (x.variationId ?? null) === (variationId ?? null))
      );
      recalc(state);
    },

    // Keep old names for backward imports if they exist in your codebase
    setServer(state, action) {
      cartSlice.caseReducers.setCart(state, action);
    },
    add(state, action) {
      cartSlice.caseReducers.addToCart(state, action);
    },
    remove(state, action) {
      cartSlice.caseReducers.removeFromCart(state, action);
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
} = cartSlice.actions;

export default cartSlice.reducer;
