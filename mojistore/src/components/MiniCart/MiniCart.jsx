/* src/components/MiniCart/MiniCart.jsx */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";              // ✅ added
import axios from "../../api/axios.js";
import { useDispatch, useSelector } from "react-redux";
import { setServer, add as addLocal, remove as removeLocal } from "../../redux/slices/cartSlice.js";
import { useAuth } from "../../state/auth.jsx";
import SmartImage from "../SmartImage.jsx";
import { X, Trash2 } from "lucide-react";

export default function MiniCart({ onClose }) {
  const { user } = useAuth();
  const dispatch = useDispatch();
  const clientCart = useSelector((s) => s.cart);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      if (user) {
        const { data } = await axios.get("/cart", { withCredentials: true });
        dispatch(setServer(data?.items || []));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
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

  const changeQty = async (line, nextQty) => {
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
    await axios.patch("/cart/update", { id: line.id, qty: newQty }, { withCredentials: true });
    const { data } = await axios.get("/cart", { withCredentials: true });
    dispatch(setServer(data?.items || []));
  };

  const removeLine = async (line) => {
    if (!user) {
      dispatch(removeLocal(line.id));
      return;
    }
    await axios.delete(`/cart/remove/${line.id}`, { withCredentials: true });
    const { data } = await axios.get("/cart", { withCredentials: true });
    dispatch(setServer(data?.items || []));
  };

  return createPortal(
    <div aria-modal="true" role="dialog" className="fixed inset-0 z-[9999] pointer-events-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="absolute right-0 top-0 h-full w-[360px] max-w-[90vw] will-change-transform translate-x-0 animate-slideIn border-l"
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
        <div className="h-[calc(100%-148px)] overflow-auto px-3 py-2 space-y-3">
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
                  className="flex gap-3 rounded-xl border p-2"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {/* ✅ Image → Link if pid resolved */}
                  {pid ? (
                    <Link
                      to={`/products/${pid}`}
                      onClick={onClose}
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
                        className="truncate text-sm hover:underline hover:text-sky-400 focus-visible:underline outline-none transition"
                        aria-label={`View details for ${nameText}`}
                      >
                        {nameText}
                      </Link>
                    ) : (
                      <div className="truncate text-sm">{nameText}</div>
                    )}

                    <div className="mt-1 text-sm">$ {price.toFixed(2)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <button className="icon-btn" onClick={() => changeQty(it, qty - 1)}>-</button>
                      <span className="w-8 text-center text-sm">{qty}</span>
                      <button className="icon-btn" onClick={() => changeQty(it, qty + 1)}>+</button>
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
