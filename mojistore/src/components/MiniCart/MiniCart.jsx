/* src/components/MiniCart/MiniCart.jsx */
import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";              // ✅ added
import axios from "../../api/axios.js";
import { useDispatch, useSelector } from "react-redux";
import { setServer, add as addLocal, remove as removeLocal } from "../../redux/slices/cartSlice.js";
import { useAuth } from "../../state/auth.jsx";
import SmartImage from "../SmartImage.jsx";
import { X, Trash2 } from "lucide-react";
import { getLocationId, withLocation } from "../../utils/locations";
export default function MiniCart({ onClose }) {
  const { user } = useAuth();
  const dispatch = useDispatch();
  const clientCart = useSelector((s) => s.cart);
  const [loading, setLoading] = useState(true);
  const [updatingLines, setUpdatingLines] = useState({});
  const [lineErrors, setLineErrors] = useState({});
  const pendingTimers = useRef({});
  const pendingDesired = useRef({});
  const pendingSnapshot = useRef({});
  const DEBOUNCE_MS = 200; // tuned
  const animTimers = useRef({});
  const [recentUpdated, setRecentUpdated] = useState({});
  const locationId = getLocationId();
  const load = async () => {
    // If we already have items in the client cart, avoid refetching immediately
    if (user && Array.isArray(clientCart.items) && clientCart.items.length > 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (user) {
        const { data } = await axios.get("/cart", {
          withCredentials: true,
          params: withLocation({}),
        });
        dispatch(setServer(data?.items || []));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onLoc = () => load();
    window.addEventListener('location:changed', onLoc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener('location:changed', onLoc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const items = clientCart.items || [];
  const safePrice = (p) => (Number.isFinite(Number(p)) ? Number(p) : 0);
  const labelFrom = (it) =>
    it.variant_label || it.variation_label || it.variant || it.variation_name || "";

  const composedName = (it) => {
    const v = labelFrom(it);
    return v ? `${it.name} — ${v}` : it.name;
  };

  const subTotal = useMemo(
    () => items.reduce((s, it) => s + safePrice(it.price) * Math.floor(it.qty || 0), 0),
    [items]
  );

  const changeQty = (line, nextQty) => {
    const newQty = Math.max(0, Math.floor(nextQty || 0));
    if (!user) {
      const delta = newQty - Math.floor(line.qty || 0);
      if (delta !== 0) {
        dispatch(
          addLocal({
            id: line.id,
            variationId: line.variationId,
            name: line.name,
            variant_label: labelFrom(line),
            price: safePrice(line.price),
            image: line.image,
            qty: delta,
          })
        );
      }
      return;
    }

    const lineId = line.id;
    if (Math.floor(line.qty || 0) === newQty) return;

    if (!pendingSnapshot.current[lineId]) {
      pendingSnapshot.current[lineId] = items.map((it) => ({ ...it }));
    }
    pendingDesired.current[lineId] = newQty;

    const optimistic = items.map((it) => (it.id === lineId ? { ...it, qty: newQty } : it));
    dispatch(setServer(optimistic));
    // trigger pulse animation
    setRecentUpdated((p) => ({ ...p, [lineId]: true }));
    if (animTimers.current[lineId]) {
      try { clearTimeout(animTimers.current[lineId]); } catch {}
    }
    animTimers.current[lineId] = setTimeout(() => {
      setRecentUpdated((p) => { const n = { ...p }; delete n[lineId]; return n; });
      delete animTimers.current[lineId];
    }, 560);
    setLineErrors((p) => { const n = { ...p }; delete n[lineId]; return n; });

    if (pendingTimers.current[lineId]) {
      try { clearTimeout(pendingTimers.current[lineId]); } catch {}
    }

    pendingTimers.current[lineId] = setTimeout(async () => {
      setUpdatingLines((p) => ({ ...p, [lineId]: true }));
      try {
        const { data } = await axios.patch(
          "/cart/update",
          { id: lineId, qty: pendingDesired.current[lineId], location_id: locationId },
          { withCredentials: true }
        );
        if (data?.items) dispatch(setServer(data.items || []));
        else dispatch(setServer(items.map((it) => (it.id === lineId ? { ...it, qty: pendingDesired.current[lineId] } : it))));
      } catch (err) {
        const snap = pendingSnapshot.current[lineId] ?? items.map((it) => ({ ...it }));
        dispatch(setServer(snap));
        const available = Number(err?.response?.data?.available);
        if (!Number.isNaN(available) && available >= 0) {
          setLineErrors((p) => ({ ...p, [lineId]: available === 0 ? 'Out of stock' : `Only ${available} available` }));
        } else {
          setLineErrors((p) => ({ ...p, [lineId]: 'Could not update quantity' }));
        }
      } finally {
        setUpdatingLines((p) => { const n = { ...p }; delete n[lineId]; return n; });
        try { clearTimeout(pendingTimers.current[lineId]); } catch {}
        delete pendingTimers.current[lineId];
        delete pendingDesired.current[lineId];
        delete pendingSnapshot.current[lineId];
      }
    }, DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      Object.values(pendingTimers.current).forEach((t) => {
        try { clearTimeout(t); } catch {};
      });
      pendingTimers.current = {};
      pendingDesired.current = {};
      pendingSnapshot.current = {};
      Object.values(animTimers.current).forEach((t) => {
        try { clearTimeout(t); } catch {};
      });
      animTimers.current = {};
    };
  }, []);

  const removeLine = async (line) => {
    if (!user) {
      dispatch(removeLocal(line.id));
      return;
    }
    const { data } = await axios.delete(`/cart/remove/${line.id}`, {
      withCredentials: true,
      params: { location_id: locationId },
    });
    dispatch(setServer(data?.items || []));
  };

  return createPortal(
    <div aria-modal="true" role="dialog" className="fixed inset-0 z-[9999] pointer-events-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="mini-cart-panel absolute right-0 top-0 h-full w-[360px] max-w-[90vw] will-change-transform translate-x-0 animate-slideIn border-l overflow-x-hidden"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="font-semibold">Your cart</div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 mini-hover"
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Lines */}
  <div className="mini-cart-lines h-[calc(100%-148px)] overflow-y-auto overflow-x-hidden px-3 py-2 space-y-3">
                {loading && <div className="text-sm opacity-80">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="text-sm opacity-80">Your cart is empty.</div>
          )}

        {!loading &&
      items.map((it) => {
              const qty = Math.floor(it.qty || 0);
              const price = safePrice(it.price);

              // ✅ Resolve a product id for deep-linking (supports multiple possible keys)
              const pid =
                it.productId ??
                it.product_id ??
                it.productID ??
                it.pid ??
                null;

              const nameText = composedName(it);

              return (
                <div
                  key={`${it.id}-${it.variationId ?? "v0"}`}
                  className={`flex gap-3 rounded-xl border p-2 ${recentUpdated[it.id] ? 'optimistic-pulse' : ''}`}
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {/* ✅ Image → Link if pid resolved */}
                  {pid ? (
                    <Link
                      to={`/products/${pid}`}
                      onClick={onClose}
                      state={locationId ? { locationId } : null}
                      className="w-16 h-16 rounded-lg overflow-hidden ring-1 ring-transparent hover:ring-zinc-600/60 transition"
                      style={{ background: "var(--thumb-surface)" }}
                      aria-label={`View details for ${nameText}`}
                    >
                      <SmartImage
                        image={it.image}
                        alt={it.name}
                        width={80}
                        height={100}
                        className="w-full h-full object-contain"
                      />
                    </Link>
                  ) : (
                    <div
                      className="w-16 h-16 rounded-lg overflow-hidden"
                      style={{ background: "var(--thumb-surface)" }}
                    >
                      <SmartImage
                        image={it.image}
                        alt={it.name}
                        width={80}
                        height={100}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {/* ✅ Name → Link if pid resolved */}
                    {pid ? (
                      <Link
                        to={`/products/${pid}`}
                        onClick={onClose}
                        state={locationId ? { locationId } : null}
                        className="text-sm break-words whitespace-normal leading-snug hover:underline hover:text-sky-400 focus-visible:underline outline-none transition"
                        aria-label={`View details for ${nameText}`}
                      >
                        {nameText}
                      </Link>
                    ) : (
                      <div className="text-sm break-words whitespace-normal leading-snug">{nameText}</div>
                    )}

                    <div className="mt-1 text-sm">$ {price.toFixed(2)}</div>
                    <div className="mt-1">
                      {(() => {
                        const isUpdating = !!updatingLines[it.id];
                        const err = lineErrors[it.id];
                        return (
                          <>
                            <div className="flex items-center gap-2">
                              <button className="icon-btn" onClick={() => changeQty(it, qty - 1)} disabled={isUpdating}>-</button>
                              <span className="w-8 text-center text-sm">{isUpdating ? <span className="opacity-70">…</span> : qty}</span>
                              <button className="icon-btn" onClick={() => changeQty(it, qty + 1)} disabled={isUpdating}>+</button>
                              {/* pending (debounced) indicator: small dot when an update is scheduled but not yet sent */}
                              {(!isUpdating && pendingTimers.current[it.id]) && (
                                <span className="ml-2 text-xs text-muted">•</span>
                              )}
                              {isUpdating && <span className="text-xs text-muted ml-2">Updating…</span>}
                            </div>
                            {err && <div className="text-xs mt-1 text-red-500">{err}</div>}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <button className="icon-btn" onClick={() => removeLine(it)} title="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="border-t p-3" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between text-sm mb-3">
            <span>Subtotal</span>
            <span>$ {subTotal.toFixed(2)}</span>
          </div>
          <a
            href="/cart"
            onClick={onClose}
            className="block text-center rounded-xl border px-3 py-2 hover:bg-[var(--color-neon)]/10"
            style={{ borderColor: "var(--color-neon)" }}
          >
            View cart & checkout
          </a>
        </div>
      </div>

      {/* Component-scoped theme-aware styles */}
      <style>{`
        @keyframes slideIn { from { transform: translateX(24px); opacity: .0; } to { transform: translateX(0); opacity: 1; } }
  .animate-slideIn { animation: slideIn .18s ease-out; }

  /* Prevent horizontal scrollbars */
  .mini-cart-panel { box-sizing: border-box; }
  .mini-cart-lines { box-sizing: border-box; }
  .mini-cart-lines::-webkit-scrollbar { width: 10px; }
  .mini-cart-lines::-webkit-scrollbar-horizontal { display: none; }
  .mini-cart-lines { scrollbar-width: thin; }

  /* Allow long unbroken tokens (e.g., huge variant names / SKUs) to wrap */
  .mini-cart-panel a, .mini-cart-panel div { word-break: break-word; }

        /* Light defaults */
        :root, [data-theme="light"] {
          --btn-surface: #f3f4f6;          /* subtle gray for buttons */
          --btn-surface-hover: #e5e7eb;    /* slightly darker on hover */
          --thumb-surface: #f8fafc;        /* image thumb bg */
        }

        /* Dark overrides (works for .dark class OR data-theme) */
        .dark, [data-theme="dark"] {
          --btn-surface: #0b0b0d;
          --btn-surface-hover: #141417;
          --thumb-surface: #0f1012;
        }

        /* Icon buttons (± and trash) */
        .icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: .35rem .5rem;
          border-radius: .5rem;
          border: 1px solid var(--color-border);
          background: var(--btn-surface);
          line-height: 1;
        }
        .icon-btn:hover { background: var(--btn-surface-hover); }

        /* Close button hover surface */
        .mini-hover:hover { background: var(--btn-surface-hover); }
      `}</style>
    </div>,
    document.body
  );
  
}
