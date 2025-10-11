// src/utils/getProductImage.js
// Return the runtime public path for the placeholder image.
// Files placed in Vite's `public/` directory are served from the site root
// (e.g. /placeholder.jpg) both in dev and after build.
export function placeholder() {
  // Respect Vite's base URL so the placeholder resolves correctly after build
  // (import.meta.env.BASE_URL is set by Vite at build time, defaults to '/')
  const base = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
    ? import.meta.env.BASE_URL
    : '/';
  return `${base.endsWith('/') ? base : base + '/'}placeholder.jpg`;
}

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
