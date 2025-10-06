// src/pages/Cart/CartPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "../../api/axios.js";
import { useDispatch, useSelector } from "react-redux";
import { setServer, add as addLocal, remove as removeLocal } from "../../redux/slices/cartSlice.js";
import { useAuth } from "../../state/auth.jsx";
import SmartImage from "../../components/SmartImage.jsx";

export default function CartPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const dispatch = useDispatch();
  const cart = useSelector((s) => s.cart);
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const items = cart.items || [];

  const safePrice = (p) => (Number.isFinite(Number(p)) ? Number(p) : 0);
  const labelFrom = (it) =>
    it.variant_label || it.variation_label || it.variant || it.variation_name || "";
  const composedName = (it) => {
    const v = labelFrom(it);
    return v ? `${it.name} — ${v}` : it.name;
  };

  // robust product id resolver for links
  const productIdFor = (it) =>
    it.product_id ?? it.productId ?? it.productID ?? it.pid ?? null;

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

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-5 py-8">
      <h1 className="text-2xl font-semibold mb-5">Shopping Cart</h1>

      {loading ? (
        <div>Loading…</div>
      ) : items.length === 0 ? (
        <div
          className="rounded-xl p-6"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
        >
          Your cart is empty.{" "}
          <a href="/products" className="underline">
            Browse products
          </a>
        </div>
      ) : (
        <div
          className="rounded-2xl p-5"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
          }}
        >
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Items list — first on mobile, left on desktop */}
            <div className="lg:col-span-8 order-1">
              <div className="space-y-3">
                {items.map((it) => {
                  const qty = Math.floor(it.qty || 0);
                  const price = safePrice(it.price);
                  const lineTotal = price * qty;
                  const pid = productIdFor(it);
                  const nameText = composedName(it);

                  return (
                    <div
                      key={`${it.id}-${it.variationId ?? "v0"}`}
                      className="flex gap-3 rounded-xl p-3"
                      style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}
                    >
                      {/* Image → link if we can resolve product id */}
                      {pid ? (
                        <Link
                          to={`/products/${pid}`}
                          className="w-20 h-20 rounded-lg overflow-hidden ring-1 ring-transparent transition hover:ring-zinc-500/50"
                          aria-label={`View ${nameText}`}
                          title={nameText}
                          style={{ background: "var(--thumb-surface)" }}
                        >
                          <SmartImage
                            image={it.image}
                            alt={it.name}
                            width={100}
                            height={120}
                            className="w-full h-full object-contain"
                          />
                        </Link>
                      ) : (
                        <div
                          className="w-20 h-20 rounded-lg overflow-hidden"
                          style={{ background: "var(--thumb-surface)" }}
                        >
                          <SmartImage
                            image={it.image}
                            alt={it.name}
                            width={100}
                            height={120}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        {/* Name → link if pid exists */}
                        {pid ? (
                          <Link
                            to={`/products/${pid}`}
                            className="font-medium truncate hover:underline focus-visible:underline outline-none"
                            title={nameText}
                            aria-label={`View ${nameText}`}
                          >
                            {nameText}
                          </Link>
                        ) : (
                          <div className="font-medium truncate" title={nameText}>
                            {nameText}
                          </div>
                        )}

                        <div className="mt-1 text-sm">$ {price.toFixed(2)}</div>

                        <div className="mt-2 flex items-center gap-2">
                          <button
                            className="rounded-md border px-2"
                            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                            onClick={() => changeQty(it, qty - 1)}
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm">{qty}</span>
                          <button
                            className="rounded-md border px-2"
                            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                            onClick={() => changeQty(it, qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-between">
                        <div className="text-sm">$ {lineTotal.toFixed(2)}</div>
                        <button
                          className="text-sm underline opacity-80 hover:opacity-100"
                          onClick={() => removeLine(it)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary — second on mobile (bottom), right on desktop */}
            <div className="lg:col-span-4 order-2">
              <div
                className="rounded-xl p-4 space-y-3 sticky lg:top-20"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}
              >
                <div className="flex items-center justify-between text-sm">
                  <span>Subtotal</span>
                  <span>$ {subTotal.toFixed(2)}</span>
                </div>

                <button
                  onClick={() => nav("/checkout")}
                  className="w-full px-4 py-2 rounded-lg text-sm font-medium transition"
                  style={{
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                  }}
                >
                  Proceed to checkout
                </button>

                <Link to="/products" className="block text-center text-sm underline opacity-80 hover:opacity-100">
                  Continue shopping
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
