// src/utils/locations.js
import api from "../api/axios";

// localStorage key
const KEY = "locId";

// Internal store
const store = {
  list: [],              // [{ id, name }]
  id: null,              // selected location id
  loaded: false,
};

// Emit a global event for listeners (Account pages already listen)
function broadcast() {
  window.dispatchEvent(
    new CustomEvent("location:changed", { detail: { id: store.id, list: store.list } })
  );
}

// Load allowed locations for the current user, pick a valid default, persist
export async function bootstrapLocations() {
  const res = await api.get("/locations", { withCredentials: true, validateStatus: () => true });
  const list = Array.isArray(res.data) ? res.data.filter(x => x && x.id != null) : [];
  store.list = list;
  store.loaded = true;

  // Resolve previously saved id, else first available
  const persisted = Number(localStorage.getItem(KEY));
  const valid = list.find(l => Number(l.id) === persisted)?.id;
  store.id = valid ?? (list[0]?.id ?? null);

  if (store.id != null) {
    localStorage.setItem(KEY, String(store.id));
  } else {
    localStorage.removeItem(KEY);
  }

  broadcast();
  return { id: store.id, list: store.list };
}

// Getters
export const getLocationId = () => store.id;
export const getLocations = () => store.list;
export const isLocationLoaded = () => store.loaded;

// Setter
export function setLocationId(nextId) {
  if (nextId == null) return;
  const loc = store.list.find(l => Number(l.id) === Number(nextId));
  if (!loc) return; // ignore invalid

  store.id = Number(loc.id);
  localStorage.setItem(KEY, String(store.id));
  broadcast();
}

// Helper to ensure every request gets location_id
export function withLocation(params = {}) {
  const id = getLocationId();
  // Send both styles so FE & BE (and any ERP proxy) are happy
  return id != null ? { ...params, locationId: id, location_id: id } : params;
}
 // --- NEW: tiny attachment policy ---
 const LOCATION_SCOPED = [
   /^\/products\b/i,
   /^\/product\b/i,
   /^\/cart\b/i,
   /^\/checkout\b/i,
   /^\/search\b/i,
   /^\/filters\b/i
 ];

 export function shouldAttachLocationTo(urlPath) {
   return LOCATION_SCOPED.some(rx => rx.test(urlPath || ''));
 }

 /**
  * Attach current location to params ONLY if:
  *  - explicit === true, OR
  *  - the URL is location-scoped by policy.
  * Never invent/guess a location here.
  */
 export function attachLocation(params = {}, urlPath = '', { explicit = false } = {}) {
   const id = getLocationId(); // your existing getter for the current selected location
   if (!id) return params;
   if (explicit || shouldAttachLocationTo(urlPath)) {
     return { ...params, locationId: id, location_id: id };
   }
   return params;
 }