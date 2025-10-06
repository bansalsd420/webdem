// src/pages/ProductDetail/ProductDetail.jsx
// Fast hero image, instant paint from Products → Link state, 3–4 row shimmer
// table while variants load, fixed column widths, Add All footer + toast,
// qty=0 defaults, proper enabling rules, location-aware refetch.

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

  // ----- Instant paint from Products page (Link state) -----
  const quick = (loc.state && loc.state.product) || null;

  const [data, setData] = useState(quick || null);
  const [related, setRelated] = useState([]);
  const [variantId, setVariantId] = useState(quick?.variants?.[0]?.id ?? null);


  // Location-aware: centralized selection (no "All" sentinel anymore)
  const [locationId, setLocationId] = useState(() => getLocationId());
  const refetchTimer = useRef(null);
  // qty defaults to 0
  const [qty, setQty] = useState(0);
  const [rowQty, setRowQty] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(!quick);           // detail fetch
  const [loadingVariants, setLoadingVariants] = useState(!quick);       // table shimmer trigger      // table shimmer trigger
  const [addedTick, setAddedTick] = useState(false);
  const [adding, setAdding] = useState(false);
  const [rowAdding, setRowAdding] = useState({});
  const [addingAll, setAddingAll] = useState(false);
  const [wishMsg, setWishMsg] = useState("");
  const [addAllToast, setAddAllToast] = useState("");

  // Keep local locationId in sync with global changes
  useEffect(() => {
    const sync = () => setLocationId(getLocationId());
    window.addEventListener("location:changed", sync);
    // pick up initial value (e.g., after boot)
    sync();
    return () => {
      window.removeEventListener("location:changed", sync);
    };
  }, []);

  // Fetch product detail (debounced on location change)
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
          { withCredentials: true, params: withLocation({}) }
        );
        if (!alive) return;
        setData(full);                            // ✅ correct setter
        // ensure a valid default variant is selected
        const firstVar = Array.isArray(full?.variants) ? (full.variants[0]?.id ?? null) : null;
        setVariantId((prev) =>
          full?.variants?.some(v => v.id === prev) ? prev : firstVar
        );
        setLoadingDetail(false);
        setLoadingVariants(false);
      } catch {
        if (alive) {
          setData(null);                         // ✅ correct setter
          setLoadingDetail(false);
          setLoadingVariants(false);
        }
      }
    }, 150);
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
    return () => {
      alive = false;
    };
  }, [id, locationId]);

  // ---------- helpers ----------
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

  // Single-card stock logic
  // Location-aware stock (tri-state):
  // - null   → unknown (don't claim "In stock" yet)
  // - true   → in stock
  // - false  → out of stock
  const anyInStockHere = useMemo(() => {
    if (realVariants.length) {
      // if any row explicitly says out-of-stock === false, otherwise unknown rows are ignored
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
    return false; // unknown -> don't claim true
  }, [showTable, anyInStockHere, activeVariant, data]);

  // Price view (only when logged in)
  const priceDisplay = useMemo(() => {
    if (!user) return null;
    return activeVariant?.price ?? data?.minPrice ?? null;
  }, [activeVariant, data, user]);

  const uiConfirm = () => {
    setAddedTick(true);
    setTimeout(() => setAddedTick(false), 900);
  };

  const addToCart = async (variationId, quantity, scope) => {
    if (!variationId || quantity <= 0) return;

    if (!user) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      nav(`/login?next=${next}`);
      return;
    }

    if (scope?.type === "main") setAdding(true);
    if (scope?.type === "row" && scope.id) setRowAdding((p) => ({ ...p, [scope.id]: true }));

    try {
      await axios.post(
        "/cart/add",
        { productId: Number(id), variationId, qty: quantity },
        { withCredentials: true }
      );
      const { data: cart } = await axios.get("/cart", { withCredentials: true });
      dispatch(setServer(cart?.items || []));
      uiConfirm();
    } catch (e) {
      console.error("Add to cart failed", e);
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

    setAddingAll(true);
    let success = 0;
    for (const v of toAdd) {
      try {
        await addToCart(v.id, rowQty[v.id], { type: "row", id: v.id });
        success++;
      } catch {
        // continue
      }
    }
    // reset all row qty to 0 after attempt
    setRowQty((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => (next[k] = 0));
      return next;
    });
    setAddingAll(false);
    setAddAllToast(success ? `Added ${success} item(s) to your cart` : `Nothing added`);
    setTimeout(() => setAddAllToast(""), 1600);
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

  const heroSrc = pickHeroImage(data || quick || {});

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

  // --------------- RENDER ----------------
  // Tiny CSS for shimmer (scoped)
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
        
         /* ---------- PDP table tweaks ---------- */
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
      .pdp-vars .variant-pill{
        display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
        overflow:hidden; line-height:1.2;
      }
      
    `}</style>
  );

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 space-y-8">
      <ShimmerStyle />

      {/* Header: image + info */}
      <section className="w-full">
        <div className="grid grid-cols-12 gap-6 items-start">
          <div className="col-span-12 lg:col-span-4">
            <div className="pdp-image-box relative group">
              {/* Fast image: provide src + responsive hints */}
              <SmartImage
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
                srcSet={
                  heroSrc
                    ? `${heroSrc}?w=480 480w, ${heroSrc}?w=768 768w, ${heroSrc}?w=1024 1024w, ${heroSrc}?w=1440 1440w`
                    : undefined
                }
              />
              {/* Hover overlay + wishlist */}
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

            {/* Single buy block — ONLY when table is hidden */}
            {!showTable && (
              <div className="pdp-actions relative">
                <div className="pdp-price">
                  {priceDisplay != null ? (
                    <span>${Number(priceDisplay).toFixed(2)}</span>
                  ) : (
                    <span className="muted">Login to see prices</span>
                  )}
                </div>

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
                    !singleInStock
                      ? "Can't add"
                      : (qty <= 0
                        ? "Increase quantity"
                        : (!variantId ? "Select a variation" : ""))
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

            {/* Variations — only show when a table is (or will be) rendered */}
            {(showTable || (loadingVariants && Array.isArray(data?.variants) && data.variants.length >= 2)) && (
              <div className="mt-6">
                <div className="text-sm font-semibold mb-2">All variations</div>

                {/* Shimmer skeleton while variants load */}
                {loadingVariants && (
                  <div className="pdp-vars-wrap">
                    <table className="pdp-vars">
                      <colgroup>
                        {[
                          undefined,                    // Variation
                          { width: 120 },               // Price
                          { width: 110 },               // Stock
                          { width: 280 },               // Actions
                        ].map((style, i) => <col key={i} style={style} />)}
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
                            <td className="text-center"><div className="pdp-shimmer h-6 rounded inline-block w-20" /></td>
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

                {/* Real table (only when 2+ real variants) */}
                {!loadingVariants && showTable && (
                  <>
                    <div className="pdp-vars-wrap">
                      <table className="pdp-vars" style={{ tableLayout: "fixed" }}>
                        <colgroup>
                          {[
                            undefined,                    // Variation
                            { width: 120 },               // Price
                            { width: 110 },               // Stock
                            { width: 280 },               // Actions
                          ].map((style, i) => <col key={i} style={style} />)}
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
                            const addDisabled = (val <= 0) || rowDisabled || (!!user && !showPrice) || !!rowAdding?.[v.id];

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
                                        /* allow increment even when OOS; add-to-cart stays disabled */
                                        disabled={false}
                                      >
                                        +
                                      </button>
                                    </div>

                                    {/* Wrap the disabled button so title tooltip still shows */}
                                    <span
                                      className="disabled-tip tt"
                                      data-tt={
                                        addDisabled
                                          ? (rowDisabled
                                            ? "Out of stock"
                                            : (val <= 0
                                              ? "Increase quantity"
                                              : (!!user && !showPrice ? "Login to see prices" : "")))
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

                    {/* Add All — footer, prominent */}
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

                    {addAllToast && (
                      <div className="mt-3 flex justify-end">
                        <div className="rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-2 text-sm shadow-sm">
                          {addAllToast}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

        </div >
      </section >

      {/* Description — theme-aware, pretty */}
      < section className="mt-2" >
        <h3 className="text-lg font-semibold mb-2">Description</h3>
        <div
          className="rounded-xl shadow-sm px-5 py-5 text-sm"
          style={{
            minHeight: 180,
            background: "var(--surface)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {/* blank placeholder for now */}
        </div>
      </section >

      {/* Related */}
      < RelatedRow items={related} />
    </div >
  );
}

/** Related rail — one-card tick, endless */
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
