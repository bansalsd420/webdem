import { Router } from 'express';
import { authOptional } from '../middleware/auth.js';
import { erpGetAny, listFrom, totalFrom, qtyAtLocation, n, s, biz, resolveNumericContactId } from '../lib/erp.js';

const router = Router();

/** Helper: get min price from nested variations (optionally honoring a price group id) */
function minPriceFromVariations(p, priceGroupId) {
  // Accept both shapes: product_variations[*].variations[*] or plain variations[*]
  const pv = Array.isArray(p?.product_variations) ? p.product_variations : [];
  const flatV =
    Array.isArray(p?.variations) ? p.variations :
    pv.flatMap(v => Array.isArray(v?.variations) ? v.variations : []);

  let best = null;
  for (const v of flatV) {
    let px = null;

    // Prefer a matching selling price group if present
    const spg = Array.isArray(v?.selling_price_group) ? v.selling_price_group : [];
    if (priceGroupId && spg.length) {
      const m = spg.find(g => Number(g?.price_group_id) === Number(priceGroupId));
      if (m) px = n(m?.price_inc_tax);
    }

    // Fallbacks on the variation itself
    if (px == null) {
      px = n(v?.sell_price_inc_tax) ??
           n(v?.default_sell_price) ??
           n(v?.price) ?? null;
    }
    if (px != null) {
      best = best == null ? px : Math.min(best, px);
    }
  }
  return best;
}

/**
 * Stock check from variations for a specific location.
 * Returns:
 *   - true  : found at least one row for that location with qty > 0
 *   - false : found at least one row for that location, but none had qty > 0
 *   - null  : no location rows were present (unknown; let caller fall back)
 */
function inStockFromVariations(p, locationId) {
  if (locationId == null) return null;

  const pv = Array.isArray(p?.product_variations) ? p.product_variations : [];
  const flatV =
    Array.isArray(p?.variations) ? p.variations :
    pv.flatMap(v => Array.isArray(v?.variations) ? v.variations : []);

  let sawThisLocation = false;
  for (const v of flatV) {
    const locs = Array.isArray(v?.variation_location_details) ? v.variation_location_details : [];
    for (const d of locs) {
      const lid = n(d?.location_id);
      if (lid !== n(locationId)) continue;
      sawThisLocation = true;
      const raw = n(d?.qty_available ?? d?.available_qty ?? d?.current_stock ?? d?.stock ?? d?.qty ?? d?.quantity);
      const qty = Number.isFinite(raw) ? Math.max(0, raw) : 0; // clamp negatives to 0
      if (qty > 0) return true;
    }
  }
  return sawThisLocation ? false : null;
}

/* ---------- Any-location stock helpers (Option B) ---------- */
function _num(v) {
  const n2 = Number(v);
  return Number.isFinite(n2) ? n2 : 0;
}

// Clamp negatives to 0 and sum across ALL locations for a single variation
function variantQtyAny(variation) {
  const arr = Array.isArray(variation?.variation_location_details)
    ? variation.variation_location_details
    : [];
  if (arr.length === 0) return 0;
  let total = 0;
  for (const d of arr) {
    const q = Math.max(0, _num(d?.qty_available ?? d?.available_qty ?? d?.current_stock ?? d?.stock ?? d?.qty ?? d?.quantity));
    total += q;
  }
  return total;
}

// true if ANY variation in the product has qty > 0 at ANY location
function productInStockAny(product) {
  const pv = Array.isArray(product?.product_variations) ? product.product_variations : [];
  const flatV =
    Array.isArray(product?.variations) ? product.variations :
    pv.flatMap(v => Array.isArray(v?.variations) ? v.variations : []);
  for (const v of flatV) {
    if (variantQtyAny(v) > 0) return true;
  }
  return false;
}

/**
 * GET /api/products
 * Query: page, perPage|limit, q, category, subcategory, brand, locationId
 */
router.get('/', authOptional, async (req, res) => {
  try {
    const page       = Math.max(1, Number(req.query.page || 1) || 1);
    const perPage    = Math.max(1, Math.min(120, Number(req.query.perPage ?? req.query.limit ?? 24) || 24));
    const q          = s(req.query.q) || undefined;
    const category   = n(req.query.category) ?? undefined;
    const subcat     = n(req.query.subcategory) ?? undefined;
    const brand      = n(req.query.brand) ?? undefined;
    const locationId = n(req.query.locationId);

    // Resolve contact for customer-aware pricing
    const cidRaw = req?.user?.cid;
    const contactId = await resolveNumericContactId(cidRaw); // handles numeric or "CO0005" codes
    const loggedIn  = Number.isFinite(contactId);

    // Price-group id may be wired later (env or /account/me). For now, undefined.
    const priceGroupId = undefined;

    // --- fetch ---
    const baseQuery = {
      business_id: biz(),
      page, per_page: perPage, limit: perPage,
      q, name: q, search: q, term: q,
      category_id: category, sub_category_id: subcat, brand_id: brand,
      status: 1, not_for_selling: 0,
      contact_id: loggedIn ? contactId : undefined,     // let POS pick customer pricing where supported
      location_id: locationId || undefined,             // helps some builds hydrate location data
      include_location_details: locationId ? 1 : undefined,
    };

    const { data: baseData } = await erpGetAny(
      // Try new endpoint first, then fallbacks
      ['/new_product', '/product', '/productapi', '/products'],
      { query: baseQuery }
    );
    const baseList = listFrom(baseData);
    const total = totalFrom(baseData, baseList.length);

    // --- shape items ---
    const items = baseList.map(p => {
      const id   = p?.id ?? p?.product_id ?? n(p?.product?.id);
      const name = p?.name ?? p?.product_name ?? p?.title ?? p?.product?.name ?? '';
      const sku  = p?.sku ?? p?.product_sku ?? p?.code ?? null;

      // image: prefer product-level; fallback to 1st media on any variation
      let image =
        p?.image ?? p?.product_image ?? p?.image_url ?? p?.product_image_url ??
        (Array.isArray(p?.images) ? p.images[0] : null) ?? null;

      if (!image) {
        const pv = Array.isArray(p?.product_variations) ? p.product_variations : [];
        const flatV =
          Array.isArray(p?.variations) ? p.variations :
          pv.flatMap(v => Array.isArray(v?.variations) ? v.variations : []);
        for (const v of flatV) {
          const m = Array.isArray(v?.media) ? v.media : [];
          if (m.length && (m[0]?.display_url || m[0]?.url)) {
            image = m[0].display_url || m[0].url;
            break;
          }
        }
      }

      // stock flag
      let inStock = null;
      if (locationId != null) {
        const locResult = inStockFromVariations(p, locationId);
        if (locResult !== null) inStock = locResult; // true/false if we actually saw that location
      }
      if (inStock == null) {
        // "All locations" or unknown: Option B any-location check with clamping
        inStock = productInStockAny(p);
      }

      // min price: top-level → nested variations (w/ optional price group), then gate for guests
      let minPrice =
        n(p?.min_price) ??
        n(p?.min_sell_price) ??
        n(p?.sell_price_inc_tax) ??
        n(p?.default_sell_price) ??
        n(p?.price) ??
        null;

      if (minPrice == null) {
        minPrice = minPriceFromVariations(p, priceGroupId);
      }
      if (!loggedIn) {
        minPrice = null; // never leak prices to guests
      }

      const brand_id          = n(p?.brand_id) ?? n(p?.brand?.id) ?? null;
      const brand_name        = s(p?.brand_name) ?? s(p?.brand?.name);
      const category_id       = n(p?.category_id) ?? n(p?.category?.id) ?? null;
      const category_name     = s(p?.category_name) ?? s(p?.category?.name);
      const sub_category_id   = n(p?.sub_category_id) ?? n(p?.sub_category?.id) ?? null;
      const sub_category_name = s(p?.sub_category_name) ?? s(p?.sub_category?.name);

      return {
        id, name, sku, image,
        minPrice,
        inStock,
        brand_id, brand_name,
        category_id, category_name,
        sub_category_id, sub_category_name,
      };
    });

    res.set('X-Total-Count', String(total));
    res.set('X-Page', String(page));
    res.set('X-Limit', String(perPage));
    return res.json({ items, page, perPage, total });
  } catch (e) {
    console.error('products list error', e?.status || '', e?.body || e);
    const status = Number.isInteger(e?.status) ? e.status : 500;
    return res.status(status).json({ error: 'products_failed' });
  }
});

/**
 * GET /api/products/:id
 * PDP detail (includes variant pricing; honors contact & location when available).
 */
router.get('/:id', authOptional, async (req, res) => {
  const pid = n(req.params.id);
  if (!pid) return res.status(400).json({ error: 'bad id' });

  const locationId = n(req.query.locationId);

  // Resolve contact for customer-aware variant pricing
  const cidRaw     = req?.user?.cid;
  const contactId  = await resolveNumericContactId(cidRaw);
  const loggedIn   = Number.isFinite(contactId);

  try {
    const { data } = await erpGetAny(
      [`/product/${pid}`, `/productapi/${pid}`, `/products/${pid}`],
      {
        query: {
          business_id: biz(),
          location_id: locationId || undefined,
          include_location_details: 1,
          contact_id: loggedIn ? contactId : undefined,
        }
      }
    );

    const p = Array.isArray(data?.data) ? data.data[0] : (data?.data || data);
    if (!p) return res.status(404).json({ error: 'not found' });

    // base fields
    const baseId = p?.id ?? p?.product_id ?? n(p?.product?.id);
    const image =
      p?.image ?? p?.product_image ?? p?.image_url ?? p?.product_image_url ??
      (Array.isArray(p?.images) ? p.images[0] : null) ?? null;

    // variations (flatten)
    const pv = Array.isArray(p?.product_variations) ? p.product_variations : [];
    const flatV =
      Array.isArray(p?.variations) ? p.variations :
      pv.flatMap(v => Array.isArray(v?.variations) ? v.variations : []);

    // compute minPrice (from variations if needed)
    let minPrice =
      n(p?.min_price) ??
      n(p?.min_sell_price) ??
      n(p?.sell_price_inc_tax) ??
      n(p?.default_sell_price) ??
      n(p?.price) ??
      null;

    if (minPrice == null) {
      minPrice = minPriceFromVariations(p, /*priceGroupId*/ undefined);
    }
    if (!loggedIn) minPrice = null;

    const shaped = {
      id: baseId,
      name: p?.name ?? p?.product_name ?? p?.title ?? '',
      sku: p?.sku ?? p?.product_sku ?? p?.code ?? null,
      image,
      description: s(p?.product_description) ?? '',
      category: p?.category_name ?? p?.category?.name,
      sub_category: p?.sub_category_name ?? p?.sub_category?.name,
      minPrice,
      in_stock: (function () {
        if (locationId == null) {
          // All locations: Option B any-location aggregation with clamping
          return productInStockAny(p);
        }
        const has = inStockFromVariations(p, locationId);
        if (has != null) return has;
        // fallback if location rows missing
        return productInStockAny(p);
      })(),
      variants: flatV.map(v => {
        // price per variant (login-gated)
        let vx =
          n(v?.sell_price_inc_tax) ??
          n(v?.default_sell_price) ??
          n(v?.price) ?? null;
        if (!loggedIn) vx = null;

        // stock per variant
        const locs = Array.isArray(v?.variation_location_details) ? v.variation_location_details : [];
        let vIn = false;
        if (locationId != null) {
          const row = locs.find(d => n(d?.location_id) === n(locationId));
          const raw = n(row?.qty_available ?? row?.available_qty ?? row?.current_stock ?? row?.stock ?? row?.qty ?? row?.quantity);
          const qty = Number.isFinite(raw) ? Math.max(0, raw) : 0;
          vIn = qty > 0;
        } else {
          // Any location > 0 for this variant (clamped)
          for (const d of locs) {
            const raw = n(d?.qty_available ?? d?.available_qty ?? d?.current_stock ?? d?.stock ?? d?.qty ?? d?.quantity);
            const qty = Number.isFinite(raw) ? Math.max(0, raw) : 0;
            if (qty > 0) { vIn = true; break; }
          }
        }

        // per-variant image if present
        let vImg = image;
        const m = Array.isArray(v?.media) ? v.media : [];
        if (m.length && (m[0]?.display_url || m[0]?.url)) {
          vImg = m[0].display_url || m[0].url;
        }

        return {
          id: n(v?.id) ?? n(v?.variation_id),
          label: s(v?.name) ?? s(v?.variation_name) ?? s(p?.product_variation_name) ?? 'Variant',
          price: vx,
          in_stock: vIn,
          image: vImg,
          sku: s(v?.sub_sku) ?? null,
        };
      }),
    };

    return res.json(shaped);
  } catch (e) {
    console.error('product detail error', e?.status || '', e?.body || e);
    const status = Number.isInteger(e?.status) ? e.status : 500;
    return res.status(status).json({ error: 'product_failed' });
  }
});

/**
 * GET /api/products/:id/related
 */
/* ==== PATCH: replace ONLY this route handler in api/src/routes/products.js ==== */
/**
 * GET /api/products/:id/related
 * - Auth-aware: no price leak for guests (minPrice → null)
 * - Location-aware stock: honors ?locationId=... using inStockFromVariations; falls back to productInStockAny
 * - Reuses existing helpers in this file
 */
router.get('/:id/related', authOptional, async (req, res) => {
  const pid = n(req.params.id);
  if (!pid) return res.json([]);

  const locationId = n(req.query.locationId);

  try {
    // Determine login state like other routes (numeric contact id)
    const contactId = await resolveNumericContactId(req?.user?.cid);
    const loggedIn  = Number.isFinite(contactId);

    // Fetch the base product to infer category/brand for related query
    const { data: pd } = await erpGetAny(
      [`/product/${pid}`, `/productapi/${pid}`, `/products/${pid}`],
      { query: { business_id: biz(), include_location_details: 1 } }
    );
    const base = Array.isArray(pd?.data) ? pd.data[0] : (pd?.data || pd);

    const category_id = n(base?.category_id) ?? n(base?.category?.id);
    const brand_id    = n(base?.brand_id)    ?? n(base?.brand?.id);

    // Build related query (prefer same category; otherwise brand)
    const q = {
      business_id: biz(),
      page: 1, per_page: 20, limit: 20,
      status: 1, not_for_selling: 0,
      category_id: category_id || undefined,
      brand_id: category_id ? undefined : (brand_id || undefined),
      exclude_id: pid,
      include_location_details: 1,
    };

    const { data } = await erpGetAny(
      ['/new_product', '/product', '/productapi', '/products'],
      { query: q }
    );
    const arr = listFrom(data);

    const out = arr.map(p => {
      const id   = p?.id ?? p?.product_id ?? n(p?.product?.id);
      const name = p?.name ?? p?.product_name ?? p?.title ?? '';
      const sku  = p?.sku ?? p?.product_sku ?? p?.code ?? null;

      // image (reuse same heuristics as list/detail)
      let image =
        p?.image ?? p?.product_image ?? p?.image_url ?? p?.product_image_url ??
        (Array.isArray(p?.images) ? p.images[0] : null) ?? null;
      if (!image) {
        // optional: peek variation media
        const pv = Array.isArray(p?.product_variations) ? p.product_variations : [];
        const flatV =
          Array.isArray(p?.variations) ? p.variations :
          pv.flatMap(v => Array.isArray(v?.variations) ? v.variations : []);
        for (const v of flatV) {
          const m = Array.isArray(v?.media) ? v.media : [];
          if (m.length && (m[0]?.display_url || m[0]?.url)) {
            image = m[0].display_url || m[0].url;
            break;
          }
        }
      }

      // Stock: location-aware if a specific location is selected, else any-location
      let inStock = null;
      if (locationId != null) {
        const locResult = inStockFromVariations(p, locationId);
        if (locResult !== null) inStock = locResult; // true/false when we saw this location
      }
      if (inStock == null) {
        inStock = productInStockAny(p);
      }

      // Price: compute from variations, then gate for guests
      let minPrice = minPriceFromVariations(p, /*priceGroupId*/ undefined);
      if (!loggedIn) minPrice = null;

      return {
        id, name, sku, image,
        inStock,
        minPrice
      };
    })
    .filter(x => x.id && x.id !== pid && s(x.name))
    .slice(0, 20);

    // No caching: related should reflect latest auth/location
    res.set('Cache-Control', 'no-store');
    return res.json(out);
  } catch (e) {
    console.error('related products error', e?.status || '', e?.body || e);
    return res.json([]);
  }
});
/* ==== END PATCH ==== */


export default router;
