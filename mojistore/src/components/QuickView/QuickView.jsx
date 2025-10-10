/* src/components/QuickView/QuickView.jsx
   - Accepts optional `product` for instant paint (no initial fetch delay)
   - Still fetches /products/:id in background to hydrate details
*/
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import SmartImage from "../SmartImage";
import api from "../../api/axios.js";
import { withLocation } from "../../utils/locations";
import { useAuth } from "../../state/auth.jsx";
import "../../styles/quickview.css";

export default function QuickView({ productId, product = null, onClose }) {
  const { user } = (typeof useAuth === "function" ? useAuth() : { user: null });

  // Prime with product (from card) for instant render
  const [data, setData] = useState(product || null);
  const [busy, setBusy] = useState(false);

  // Hydrate from API in background (keeps UI instant)
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const { data } = await api.get(`/products/${productId}`, { signal: ctrl.signal, withCredentials: true });
        if (!alive) return;
        setData(Array.isArray(data) ? data[0] : data);
      } catch {
        /* keep primed data */
      }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, [productId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const toPdp = `/products/${productId}`;

  const hero = useMemo(() => {
    const d = data || product || {};
    return (
      d.image
      ?? (Array.isArray(d.images) ? (d.images[0]?.url ?? d.images[0]) : null)
      ?? (Array.isArray(d.media) ? (d.media[0]?.url ?? d.media[0]) : null)
      ?? (Array.isArray(d.variations) ? (d.variations.find(v => v?.image)?.image ?? null) : null)
      ?? null
    );
  }, [data, product]);

  const singleVariationId = useMemo(() => {
    const v = Array.isArray(data?.variations) ? data.variations : null;
    return v && v.length === 1 ? (v[0].id || v[0].variation_id) : null;
  }, [data]);

  const showPrice = user && (data?.minPrice != null ? data.minPrice : null);

  const addToCart = async () => {
    if (!user || !singleVariationId) return;
    setBusy(true);
    try {
      const body = withLocation({ product_id: productId, variation_id: singleVariationId, quantity: 1 });
      const resp = await api.post("/cart/add", body, { withCredentials: true });
      // If API returns updated cart, sync it to Redux (server authoritative)
      if (resp?.data?.items) {
        try { window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: resp.data.items } })); } catch {}
      }
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="qv-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="qv-modal" onClick={(e) => e.stopPropagation()}>
        <button className="qv-close" aria-label="Close" onClick={onClose}><X size={18} /></button>

        <div className="qv-grid">
          <div className="qv-media">
            <div className="product-img">
              <SmartImage image={hero} alt={data?.name || product?.name || "Product image"} fit="contain" />
            </div>
          </div>

          <div className="qv-body">
            <h3 className="qv-title">{data?.name || product?.name || "Product"}</h3>
            {(data?.sku || product?.sku) && <div className="qv-sku">SKU: {data?.sku || product?.sku}</div>}

            {(data?.brand || data?.category || data?.sub_category || product?.brand || product?.category || product?.sub_category) && (
              <div className="qv-meta">
                {(data?.brand || product?.brand) && <span className="pill">{data?.brand || product?.brand}</span>}
                {(data?.category || product?.category) && <span className="qv-cat">{data?.category || product?.category}</span>}
                {(data?.sub_category || product?.sub_category) && <span className="qv-sub">› {data?.sub_category || product?.sub_category}</span>}
              </div>
            )}

            <div className="qv-price-row">
              {!user && <Link to="/login" className="card-price-link">Login to see price</Link>}
              {user && showPrice != null && <div className="card-price">₹ {Number(showPrice).toFixed(2)}</div>}
            </div>

            <div className="qv-actions">
              {(!user) && (
                <Link to="/login" className="btn-outline">Login to purchase</Link>
              )}

              {(user && singleVariationId) && (
                <button
                  className="btn-success"
                  disabled={busy}
                  onClick={addToCart}
                >
                  {busy ? "Adding…" : "Add to cart"}
                </button>
              )}

              {(user && !singleVariationId) && (
                <Link to={toPdp} className="btn-outline">View details</Link>
              )}
            </div>

            <div className="qv-desc">
              {data?.description
                ? String(data.description).slice(0, 240)
                : (product?.description ? String(product.description).slice(0, 240) : "No description available.")
              }
              {(data?.description || product?.description) &&
                (String(data?.description || product?.description).length > 240) && "…"}
            </div>

            <div className="qv-links">
              <Link to={toPdp} className="link">Go to product page →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
