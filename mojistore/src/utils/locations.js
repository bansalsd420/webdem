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
