// src/pages/ProductDetail/ProductDetail.jsx
// PDP with per-variant quantity display, stock guard, and Amazon-style alert.
// Location method is left untouched (uses your existing utils + axios setup).

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "../../api/axios.js";
import { useDispatch } from "react-redux";
import { setServer } from "../../redux/slices/cartSlice.js";
import { useAuth } from "../../state/auth.jsx";
import ProductCard from "../../components/ProductCard/ProductCard.jsx";
import SmartImage from "../../components/SmartImage.jsx";
import "../../styles/product-detail.css";
import { getLocationId, withLocation } from "../../utils/locations";

export default function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const dispatch = useDispatch();

  // Instant paint from Products page
  const quick = (loc.state && loc.state.product) || null;

  const [data, setData] = useState(quick || null);
  const [related, setRelated] = useState([]);
  const [variantId, setVariantId] = useState(quick?.variants?.[0]?.id ?? null);
  // --- Image gallery (moved here so we can safely reference data/quick) ---
  const [gallery, setGallery] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0); // NEW: which gallery image is selected
  const [heroLoading, setHeroLoading] = useState(false);   // NEW: spinner while hero swaps
  // compute cache key so we don't refetch on tab back/forward
  const galleryKey = useMemo(() => {
    const lid = localStorage.getItem('locationId') || '';
    const pid = (data?.id ?? quick?.id ?? id);
    return `pd.gallery|${pid}|${lid}`;
  }, [id, data?.id, quick?.id]);
  useEffect(() => {
    let alive = true;
    // serve from session cache instantly
    const cached = sessionStorage.getItem(galleryKey);
    if (cached) {
      try { const j = JSON.parse(cached); if (Array.isArray(j?.images)) setGallery(j); } catch { }
    }
    (async () => {
      try {
        const lid = localStorage.getItem('locationId') || '';
        const resp = await axios.get(`/products/${id}/media`, { params: lid ? { locationId: lid } : undefined });
        if (!alive) return;
        if (resp?.status === 200 && Array.isArray(resp.data?.images)) {
          const pack = { images: resp.data.images, primary: resp.data.primary || null };
          setGallery(pack);
          sessionStorage.setItem(galleryKey, JSON.stringify(pack));
        }
      } catch {
        // ignore; PDP will keep working with product.image
      }
    })();
    return () => { alive = false; };
  }, [id, galleryKey]);

  // Location (unchanged policy)
  const [locationId, setLocationId] = useState(() => getLocationId());
  const refetchTimer = useRef(null);

  // Quantities & UI
  const [qty, setQty] = useState(0);
  const [rowQty, setRowQty] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(!quick);
  const [loadingVariants, setLoadingVariants] = useState(!quick);
  const [addedTick, setAddedTick] = useState(false);
  const [adding, setAdding] = useState(false);
  const [rowAdding, setRowAdding] = useState({});
  const [addingAll, setAddingAll] = useState(false);
  const [wishMsg, setWishMsg] = useState("");
  // addAllToast moved to global app:toast events
  const [alertMsg, setAlertMsg] = useState("");

  // Sync location
  useEffect(() => {
    const sync = () => setLocationId(getLocationId());
    window.addEventListener("location:changed", sync);
    sync();
    return () => window.removeEventListener("location:changed", sync);
  }, []);

  // Fetch product detail (location-aware)
  useEffect(() => {
    let alive = true;
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    setLoadingDetail(true);
    setLoadingVariants(true);
    refetchTimer.current = setTimeout(async () => {
      try {
        if (!alive) return;
        const { data: full } = await axios.get(
          `/products/${id}`,
          { withCredentials: true, params: withLocation({}) } // leave your location method intact
        );
        if (!alive) return;
        setData(full);
        const firstVar = Array.isArray(full?.variants) ? (full.variants[0]?.id ?? null) : null;
        setVariantId((prev) => (full?.variants?.some(v => v.id === prev) ? prev : firstVar));
        setLoadingDetail(false);
        setLoadingVariants(false);
      } catch {
        if (alive) {
          setData(null);
          setLoadingDetail(false);
          setLoadingVariants(false);
        }
      }
    }, 120);
    return () => { alive = false; clearTimeout(refetchTimer.current); };
  }, [id, locationId]);

  // Fetch related (location-aware)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(
          `/products/${id}/related`,
          { withCredentials: true, params: withLocation({}) }
        );
        if (alive) setRelated(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setRelated([]);
      }
    })();
    return () => { alive = false; };
  }, [id, locationId]);

  // Variants list (filter out dummy)
  const realVariants = useMemo(() => {
    const arr = Array.isArray(data?.variants) ? data.variants : [];
    return arr.filter((v) => {
      const label = String(v?.label ?? v?.name ?? "").trim().toLowerCase();
      return label && label !== "dummy" && label !== "default";
    });
  }, [data]);

  const showTable = realVariants.length >= 2;

  const activeVariant = useMemo(
    () => data?.variants?.find((v) => v.id === variantId) || null,
    [data, variantId]
  );

  // Location-aware stock tri-state for header pill
  const anyInStockHere = useMemo(() => {
    if (realVariants.length) {
      let sawKnown = false;
      let any = false;
      for (const v of realVariants) {
        if (v.in_stock === true) { any = true; sawKnown = true; break; }
        if (v.in_stock === false) { sawKnown = true; }
      }
      return sawKnown ? any : null;
    }
    if (data?.in_stock === true) return true;
    if (data?.in_stock === false) return false;
    return null;
  }, [realVariants, data]);

  const singleInStock = useMemo(() => {
    if (showTable) return anyInStockHere ?? false;
    if (activeVariant?.in_stock === true) return true;
    if (activeVariant?.in_stock === false) return false;
    if (data?.in_stock === true) return true;
    if (data?.in_stock === false) return false;
    return false;
  }, [showTable, anyInStockHere, activeVariant, data]);

  // Price (auth-gated)
  const priceDisplay = useMemo(() => {
    if (!user) return null;
    return activeVariant?.price ?? data?.minPrice ?? null;
  }, [activeVariant, data, user]);

  // Helper: find available qty for a given variant id
  const getAvailableFor = (vid) => {
    const v = (data?.variants || []).find(x => x.id === vid);
    const raw = Number(v?.qty);
    return Number.isFinite(raw) ? Math.max(0, raw) : null;
  };

  // Alerts
  const showAmazonAlert = (msg) => {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(""), 1600);
  };

  const uiConfirm = () => {
    setAddedTick(true);
    setTimeout(() => setAddedTick(false), 900);
  };

  // Add to cart (snake_case body) + stock guard
  const addToCart = async (variationId, quantity, scope) => {
    if (!variationId || quantity <= 0) return;

    if (!user) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      nav(`/login?next=${next}`);
      return;
    }

    // Pre-check against available qty when known
    const available = getAvailableFor(variationId);
    if (available != null && quantity > available) {
      showAmazonAlert("Quantity not available");
      return;
    }

    if (scope?.type === "main") setAdding(true);
    if (scope?.type === "row" && scope.id) setRowAdding((p) => ({ ...p, [scope.id]: true }));

    try {
      // Attach current location to the request body so the API can validate/route the cart
      const body = withLocation({ product_id: Number(id), variation_id: variationId, quantity });
      const resp = await axios.post("/cart/add", body, { withCredentials: true });

      // If API returned the updated cart, sync it (avoid an extra GET)
      if (resp?.data?.items) {
        try { window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: resp.data.items } })); } catch {}
      } else {
        // Defensive fallback: fetch cart for current location
        const { data: cart } = await axios.get("/cart", { withCredentials: true, params: withLocation({}) });
        dispatch(setServer(cart?.items || []));
      }
      uiConfirm();
    } catch (e) {
      // If API returns 409 with {error:'insufficient_stock', available}
      const available = Number(e?.response?.data?.available);
      if (!Number.isNaN(available) && available >= 0) {
        showAmazonAlert(available === 0 ? "Out of stock" : `Only ${available} available`);
      } else {
        console.error("Add to cart failed", e);
        showAmazonAlert("Could not add to cart");
      }
    } finally {
      if (scope?.type === "main") setAdding(false);
      if (scope?.type === "row" && scope.id) setRowAdding((p) => ({ ...p, [scope.id]: false }));
    }
  };

  const addAll = async () => {
    const list = Array.isArray(data?.variants) ? data.variants : [];
    if (!list.length) return;
    const toAdd = list.filter((v) => (rowQty[v.id] || 0) > 0 && v.in_stock !== false);
    if (!toAdd.length) return;

    // Pre-scan for any impossible quantities
    for (const v of toAdd) {
      const want = Math.max(0, Math.floor(rowQty[v.id] || 0));
      const avail = getAvailableFor(v.id);
      if (avail != null && want > avail) {
        showAmazonAlert(`Only ${avail} available for "${v.label || v.name}"`);
        return;
      }
    }

    setAddingAll(true);
    let success = 0;
    for (const v of toAdd) {
      try {
        await addToCart(v.id, Math.max(0, Math.floor(rowQty[v.id] || 0)), { type: "row", id: v.id });
        success++;
      } catch { /* already handled */ }
    }
    // reset all row qty to 0 after attempt
    setRowQty((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => (next[k] = 0));
      return next;
    });
    setAddingAll(false);
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', msg: success ? `Added ${success} item(s) to your cart` : 'Nothing added' } }));
  };

  const anyRowQty = useMemo(
    () => Object.values(rowQty).some((n) => (Number(n) || 0) > 0),
    [rowQty]
  );

  const pickHeroImage = (prod) => {
    if (!prod) return null;
    return (
      prod.image ??
      (Array.isArray(prod.images) ? prod.images[0]?.url ?? prod.images[0] : null) ??
      (Array.isArray(prod.media) ? prod.media[0]?.url ?? prod.media[0] : null) ??
      (Array.isArray(prod.variants) ? prod.variants.find((v) => v?.image)?.image ?? null : null) ??
      null
    );
  };

  // Build a flat list of gallery urls once (if any)
  const galleryList = useMemo(() => {
    if (!Array.isArray(gallery?.images)) return [];
    // Map to strings and discard empties / whitespace-only
    const raw = gallery.images.map((x) => (x && (x.url ?? x)) || "").filter((u) => {
      return typeof u === "string" && u.trim().length > 0;
    });
    return raw;
  }, [gallery]);
  const activeAlt = useMemo(
    () => (Array.isArray(gallery?.images) ? gallery.images[Math.min(activeIdx, gallery.images.length - 1)]?.alt : '') || '',
    [gallery, activeIdx]
  );
  const heroSrc = useMemo(() => {
    const fallback = pickHeroImage(data || quick || {});
    if (galleryList.length === 0) return fallback;
    const i = Math.min(activeIdx, galleryList.length - 1);
    const url = galleryList[i];
    // If somehow empty after filtering, still fall back
    return (typeof url === "string" && url.trim()) ? url : fallback;
  }, [galleryList, activeIdx, data, quick]);
  // Preload hero image and stop spinner when it's ready
  useEffect(() => {
    if (!heroSrc) { setHeroLoading(false); return; }
    setHeroLoading(true);
    const img = new Image();
    img.onload = () => setHeroLoading(false);
    img.onerror = () => setHeroLoading(false);
    img.src = heroSrc;
    return () => { img.onload = null; img.onerror = null; };
  }, [heroSrc]);
  const handleWishlistToggle = async () => {
    if (!data) return;
    try {
      const resp = await axios.post(`/wishlist/${data.id}`, null, { withCredentials: true, validateStatus: () => true });
      if (resp.status === 200 || resp.status === 201) setWishMsg("Added to wishlist");
      else if (resp.status === 409) {
        await axios.delete(`/wishlist/${data.id}`, { withCredentials: true, validateStatus: () => true });
        setWishMsg("Removed from wishlist");
      } else {
        // guest fallback
        const key = "wishlist";
        const raw = localStorage.getItem(key);
        const arr = raw ? JSON.parse(raw) : [];
        if (!arr.includes(data.id)) arr.push(data.id);
        localStorage.setItem(key, JSON.stringify(arr));
        setWishMsg("Added to wishlist");
      }
    } catch {
      try {
        const key = "wishlist";
        const raw = localStorage.getItem(key);
        const arr = raw ? JSON.parse(raw) : [];
        if (!arr.includes(data.id)) arr.push(data.id);
        localStorage.setItem(key, JSON.stringify(arr));
        setWishMsg("Added to wishlist");
      } catch { }
    } finally {
      setTimeout(() => setWishMsg(""), 1200);
    }
  };

  // Inline minimal CSS for the Amazon-style alert
  const AlertStyle = () => (
    <style>{`
      .pdp-alert{
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        background: #FEF2F2;
        color: #991B1B;
        border: 1px solid #FCA5A5;
        border-radius: 8px;
        padding: 10px 14px;
        box-shadow: 0 8px 30px rgba(0,0,0,.18);
        z-index: 2000;
        animation: alertIn .2s ease-out, alertOut .2s ease-in 1.4s forwards;
      }
      @keyframes alertIn{ from{ opacity:0; transform: translateX(-50%) translateY(6px) } to{ opacity:1; transform: translateX(-50%) } }
      @keyframes alertOut{ to{ opacity:0; transform: translateX(-50%) translateY(4px) } }
    `}</style>
  );

  // Shimmer CSS
  const ShimmerStyle = () => (
    <style>{`
      @keyframes pdpShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
      .pdp-shimmer{
        background: linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%);
        animation: pdpShimmer 1.4s infinite linear;
        background-size: 200% 100%;
      }
      .dark .pdp-shimmer{
        background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.06) 63%);
      }
      .pdp-vars-wrap{ border:1px solid var(--border-subtle); border-radius:12px; padding:6px 8px; }
      .pdp-vars{ width:100%; border-collapse:separate; border-spacing:0 6px; }
      .pdp-vars th{ text-align:left; color:var(--text-muted); font-weight:600; padding:.5rem .75rem; white-space:nowrap; }
      .pdp-vars td{ padding:.6rem .75rem; vertical-align:middle; }
      .pdp-vars th.col-price, .pdp-vars td.num{ text-align:right; }
      .pdp-vars th.col-stock, .pdp-vars td.text-center{ text-align:center; }
      .pdp-vars .badge{ white-space:nowrap; }
      .pdp-vars .row-actions{ display:flex; gap:.6rem; align-items:center; }
      .pdp-vars .qty-box.sm{ height:36px; }
      .pdp-vars .qty-input{ width:46px; text-align:center; }
      .pdp-vars .variant-pill{ display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.2; }
    `}</style>
  );
  
  useEffect(() => {
    if (activeIdx >= (galleryList?.length || 0)) setActiveIdx(0);
  }, [galleryList]);
  // ---- RENDER
  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 space-y-8">
      <AlertStyle />
      <ShimmerStyle />

      {/* Header: image + info */}
      <section className="w-full">
        <div className="grid grid-cols-12 gap-6 items-start">
          <div className="col-span-12 lg:col-span-4">
            <div className="pdp-image-box relative group">
              <SmartImage
              key={heroSrc}
                src={heroSrc}
                image={heroSrc}
                alt={(data || quick)?.name || ""}
                ratio={4 / 3}
                fit="contain"
                className="w-full h-auto"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                sizes="(min-width:1024px) 33vw, 90vw"

              // SmartImage needs onLoad to clear its own placeholder/blur
                onLoad={() => setHeroLoading(false)}
              />
              {/* loading mask when swapping hero */}
              {heroLoading && (
                <div className="pdp-hero-mask">
                  <div className="spinner" />
                </div>
              )}
              {/* badge with product/variant name from gallery (if present) */}
              {activeAlt ? <span className="pd-img-badge">{activeAlt}</span> : null}
              <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
              <button
                aria-label="Add to wishlist"
                onClick={handleWishlistToggle}
                className="pointer-events-auto absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Add to wishlist"
              >
                <span className="rounded-full bg-white/90 px-3 py-2 shadow text-gray-900 text-sm font-medium">
                  ❤ Wishlist
                </span>
              </button>
              {wishMsg && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                  {wishMsg}
                </div>
              )}
            </div>

            {/* THUMBNAILS */}
            {galleryList.length > 1 && (
              <div className="pdp-thumbs mt-2">
                {galleryList.map((u, i) => (
                  !u ? null : (
                    <button
                      key={`${u}-${i}`}
                      type="button"
                      className={`pdp-thumb ${i === activeIdx ? 'is-active' : ''}`}
                       onClick={() => {
                        // 1) prime the cache so the swap is snappy
                        try {
                          const raw = String(u).split('?')[0];
                          const pre = new Image();
                          pre.decoding = 'async';
                          pre.src = raw;
                        } catch {}
                        // 2) select the thumb; spinner starts in the heroSrc effect
                        setActiveIdx(i);
                      }}
                      title={Array.isArray(gallery?.images) ? (gallery.images[i]?.alt || 'Image') : 'Image'}
                    >
                      <img
                        src={u}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          // If a CDN param ever sneaks in elsewhere, fall back to the raw URL
                          try {
                            const raw = String(u).split('?')[0];
                            if (e.currentTarget.src !== raw) e.currentTarget.src = raw;
                          } catch { }
                        }}
                      />
                    </button>)
                ))}
              </div>
            )}
          </div>

          <div className="col-span-12 lg:col-span-8">
            <h1 className="pdp-title">{(data || quick)?.name}</h1>

            <div className="pdp-meta-left" style={{ marginTop: 20 }}>
              {anyInStockHere === null ? (
                <div className="pill pill-lg pill--muted">Checking stock…</div>
              ) : anyInStockHere ? (
                <div className="pill pill-lg pill--ok">In stock</div>
              ) : (
                <div className="pill pill-lg pill--bad">Out of stock</div>
              )}

              {(data || quick)?.sku && (
                <div className="meta-line">
                  <span className="meta-label">SKU</span>
                  <span className="meta-value">{(data || quick)?.sku}</span>
                </div>
              )}
              {(data || quick)?.category && (
                <div className="meta-line">
                  <span className="meta-label">Category</span>
                  <span className="meta-value">
                    {(data || quick)?.category}
                    {(data || quick)?.sub_category ? ` / ${(data || quick)?.sub_category}` : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Single buy block (only if no table) */}
            {!showTable && (
              <div className="pdp-actions relative">
                <div className="pdp-price">
                  {priceDisplay != null ? (
                    <span>${Number(priceDisplay).toFixed(2)}</span>
                  ) : (
                    <span className="muted">Login to see prices</span>
                  )}
                </div>

                {/* Show available qty if we know it for the active variant */}
                {activeVariant?.qty != null && (
                  <div className="text-sm text-gray-500 mb-1">{activeVariant.qty} available</div>
                )}

                <div className="qty-box">
                  <button className="qty-btn" onClick={() => setQty((q) => Math.max(0, q - 1))} disabled={qty <= 0}>
                    −
                  </button>
                  <input
                    className="qty-input"
                    value={qty}
                    onChange={(e) => {
                      const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      setQty(n);
                    }}
                  />
                  <button
                    className="qty-btn"
                    onClick={() => setQty((q) => q + 1)}
                    disabled={!singleInStock}
                  >
                    +
                  </button>
                </div>

                <span
                  className="disabled-tip tt"
                  data-tt={
                    (!singleInStock && "Can't add") ||
                    (qty <= 0 && "Increase quantity") ||
                    (!variantId && "Select a variation") ||
                    null  // remove attribute when enabled → no empty tooltip
                  }
                >
                  <button
                    disabled={qty <= 0 || !variantId || !singleInStock || adding}
                    onClick={() => addToCart(variantId, qty, { type: "main" })}
                    className="primary-cta"
                  >
                    {adding ? (
                      <span className="btn-spin"><span className="spinner" /> Adding…</span>
                    ) : (
                      "Add to Cart"
                    )}
                  </button>
                </span>

                {addedTick && <div className="added-toast">Added to cart</div>}
              </div>
            )}

            {/* Variations table */}
            {(showTable || (loadingVariants && Array.isArray(data?.variants) && data.variants.length >= 2)) && (
              <div className="mt-6">
                <div className="text-sm font-semibold mb-2">All variations</div>

                {loadingVariants && (
                  <div className="pdp-vars-wrap">
                    <table className="pdp-vars">
                      <colgroup>
                        {[undefined, { width: 120 }, { width: 150 }, { width: 280 }].map((style, i) => <col key={i} style={style} />)}
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Variation</th>
                          <th className="col-price">Price</th>
                          <th className="col-stock">Stock</th>
                          <th className="col-actions">Add to cart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 4 }).map((_, i) => (
                          <tr key={i}>
                            <td><div className="pdp-shimmer h-6 rounded" /></td>
                            <td><div className="pdp-shimmer h-6 rounded w-20 ml-auto" /></td>
                            <td className="text-center"><div className="pdp-shimmer h-6 rounded inline-block w-24" /></td>
                            <td>
                              <div className="flex items-center gap-3 justify-end">
                                <div className="pdp-shimmer h-9 w-28 rounded" />
                                <div className="pdp-shimmer h-9 w-28 rounded" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!loadingVariants && showTable && (
                  <>
                    <div className="pdp-vars-wrap">
                      <table className="pdp-vars" style={{ tableLayout: "fixed" }}>
                        <colgroup>
                          {[undefined, { width: 120 }, { width: 150 }, { width: 280 }].map((style, i) => <col key={i} style={style} />)}
                        </colgroup>
                        <thead>
                          <tr>
                            <th scope="col">Variation</th>
                            <th scope="col" className="col-price">Price</th>
                            <th scope="col" className="col-stock">Stock</th>
                            <th scope="col" className="col-actions">Add to cart</th>
                          </tr>
                        </thead>
                        <tbody>
                          {realVariants.map((v) => {
                            const showPrice = !!user && v.price != null;
                            const rowDisabled = v?.in_stock === false;
                            const val = Math.max(0, Math.floor(rowQty?.[v.id] ?? 0));
                            const available = (v.qty != null ? Math.max(0, Number(v.qty) || 0) : null);
                            const exceeds = available != null && val > available;
                            const addDisabled =
                              (val <= 0) || rowDisabled || (!!user && !showPrice) || !!rowAdding?.[v.id] || exceeds;

                            return (
                              <tr key={v.id} className={`${rowDisabled ? "is-disabled" : ""}`}>
                                <td>
                                  <span className="variant-pill" title={v.label || v.name || ""}>
                                    {v.label || v.name || "—"}
                                  </span>
                                </td>

                                <td className="num">
                                  {showPrice ? `$${Number(v.price).toFixed(2)}` : <span className="muted">Login to see</span>}
                                </td>

                                <td className="text-center">
                                  <span className={`badge ${rowDisabled ? "bad" : "ok"}`} style={{ whiteSpace: "nowrap" }}>
                                    {rowDisabled ? "Out of stock" : "In stock"}
                                  </span>
                                  {available != null && !rowDisabled && (
                                    <div className="text-xs mt-1 opacity-80">{available} available</div>
                                  )}
                                  {exceeds && (
                                    <div className="text-xs mt-1 text-rose-600">Only {available} available</div>
                                  )}
                                </td>

                                <td>
                                  <div className="row-actions justify-end">
                                    <div className="qty-box sm">
                                      <button
                                        className="qty-btn"
                                        onClick={() =>
                                          setRowQty((prev) => ({ ...prev, [v.id]: Math.max(0, (prev[v.id] || 0) - 1) }))
                                        }
                                        aria-label="Decrease"
                                        disabled={val <= 0}
                                      >
                                        −
                                      </button>
                                      <input
                                        className="qty-input"
                                        value={val}
                                        onChange={(e) =>
                                          setRowQty((prev) => ({
                                            ...prev,
                                            [v.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                          }))
                                        }
                                      />
                                      <button
                                        className="qty-btn"
                                        onClick={() =>
                                          setRowQty((prev) => ({ ...prev, [v.id]: Math.floor((prev[v.id] || 0) + 1) }))
                                        }
                                        aria-label="Increase"
                                      >
                                        +
                                      </button>
                                    </div>

                                    <span
                                      className="disabled-tip tt"
                                      data-tt={
                                        addDisabled
                                          ? (rowDisabled
                                            ? "Out of stock"
                                            : (val <= 0
                                              ? "Increase quantity"
                                              : (!!user && !showPrice
                                                ? "Login to see prices"
                                                : (exceeds ? `Only ${available} available` : ""))))
                                          : null
                                      }
                                    >
                                      <button
                                        disabled={addDisabled}
                                        onClick={() => addToCart(v.id, val, { type: "row", id: v.id })}
                                        className="primary-cta sm"
                                      >
                                        {rowAdding?.[v.id] ? (
                                          <span className="btn-spin"><span className="spinner" /> Adding…</span>
                                        ) : (
                                          "Add To Cart"
                                        )}
                                      </button>
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        className="primary-cta"
                        onClick={addAll}
                        disabled={!anyRowQty || addingAll}
                        title={!anyRowQty ? "Select quantities to add" : ""}
                      >
                        {addingAll ? "Adding…" : "Add All to Cart"}
                      </button>
                    </div>

                    {/* toasts are global via window 'app:toast' events */}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Description placeholder */}
      <section className="mt-2">
        <h3 className="text-lg font-semibold mb-2">Description</h3>
        <div
          className="rounded-xl shadow-sm px-5 py-5 text-sm"
          style={{
            minHeight: 180,
            background: "var(--surface)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        />
      </section>

      {/* Related */}
      <RelatedRow items={related} />

      {/* Amazon-style alert */}
      {!!alertMsg && <div className="pdp-alert">{alertMsg}</div>}
    </div>
  );
}

/** Related rail */
function RelatedRow({ items }) {
  const outerRef = useRef(null);
  const tickRef = useRef(null);
  const paused = useRef(false);
  const metricsRef = useRef({ step: 0, baseWidth: 0, startOffset: 0 });

  const renderItems = useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) return [];
    return [...items, ...items, ...items];
  }, [items]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || renderItems.length === 0) return;

    const measure = () => {
      const card = el.querySelector(".rel-card");
      if (!card) return;
      const cardW = card.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || "24") || 24;
      const step = cardW + gap;
      const baseWidth = step * (items?.length || 1);
      const startOffset = baseWidth;
      metricsRef.current = { step, baseWidth, startOffset };

      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto";
      el.scrollLeft = startOffset;
      el.style.scrollBehavior = prev || "smooth";
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderItems, items]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || renderItems.length === 0) return;

    const TICK_MS = 2200;

    const stepOnce = () => {
      const { step, baseWidth, startOffset } = metricsRef.current;
      if (!step) return;
      if (el.scrollLeft >= startOffset + baseWidth - step * 0.5) {
        const prev = el.style.scrollBehavior;
        el.style.scrollBehavior = "auto";
        el.scrollLeft -= baseWidth;
        el.style.scrollBehavior = prev || "smooth";
      }
      el.scrollTo({ left: el.scrollLeft + step, behavior: "smooth" });
    };

    tickRef.current = setInterval(() => { if (!paused.current) stepOnce(); }, TICK_MS);
    const onEnter = () => (paused.current = true);
    const onLeave = () => (paused.current = false);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      clearInterval(tickRef.current);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [renderItems]);

  if (!items?.length) return null;

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Related products</h3>
      </div>

      <div ref={outerRef} className="rel-rail">
        {renderItems.map((p, i) => (
          <div key={`${p.id}-${i}`} className="rel-card">
            <ProductCard p={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
