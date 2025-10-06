// src/pages/Cart/CartPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "../../api/axios.js";
import { useDispatch, useSelector } from "react-redux";
import {
  setServer,
  add as addLocal,
  remove as removeLocal,
  setValidation,
  expireValidation,
  invalidateValidation,
} from "../../redux/slices/cartSlice.js";
import { useAuth } from "../../state/auth.jsx";
import SmartImage from "../../components/SmartImage.jsx";
import { getLocationId } from "../../utils/locations";

export default function CartPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const dispatch = useDispatch();
  const cart = useSelector((s) => s.cart);
  const validation = useSelector((s) => s.cart.validation);

  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const locationId = getLocationId();

  const load = async () => {
    setLoading(true);
    try {
      if (user) {
        const { data } = await axios.get("/cart", {
          withCredentials: true,
          params: { location_id: locationId },
        });
        dispatch(setServer(data?.items || []));
      }
    } finally {
      setLoading(false);
    }
  };

  // Load cart (logged-in) — when user or location changes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, locationId]);

  // Expire validation pass after validThrough
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!validation?.validThrough) return;
    if (Date.now() > new Date(validation.validThrough).getTime()) {
      dispatch(expireValidation());
    }
  }, [nowTick, validation?.validThrough, dispatch]);

  const items = Array.isArray(cart.items) ? cart.items : [];

  const safePrice = (p) => (Number.isFinite(Number(p)) ? Number(p) : 0);
  const labelFrom = (it) =>
    it.variant_label || it.variation_label || it.variant || it.variation_name || "";
  const composedName = (it) => {
    const v = labelFrom(it);
    return v ? `${it.name} — ${v}` : it.name;
  };

  // robust product id resolver for links (works with server or local)
  const productIdFor = (it) =>
    it.product_id ?? it.productId ?? it.productID ?? it.pid ?? null;

  const subTotal = useMemo(
    () => items.reduce((s, it) => s + safePrice(it.price) * Math.floor(it.qty || 0), 0),
    [items]
  );

  const changeQty = async (line, nextQty) => {
    const newQty = Math.max(0, Math.floor(nextQty || 0));
    dispatch(invalidateValidation());

    if (!user) {
      // local (guest) — delta add
      const delta = newQty - Math.floor(line.qty || 0);
      if (delta !== 0) {
        dispatch(
          addLocal({
            id: line.id ?? line.product_id,
            product_id: line.product_id ?? line.id,
            variationId: line.variationId ?? line.variation_id ?? null,
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

    // logged-in — server handles, returns updated cart
    const { data } = await axios.patch(
      "/cart/update",
      { id: line.id, qty: newQty, location_id: locationId },
      { withCredentials: true }
    );
    dispatch(setServer(data?.items || []));
  };

  const removeLine = async (line) => {
    dispatch(invalidateValidation());

    if (!user) {
      // local (guest)
      dispatch(removeLocal(line.id ?? line.product_id));
      return;
    }

    const { data } = await axios.delete(`/cart/remove/${line.id}`, {
      withCredentials: true,
      params: { location_id: locationId },
    });
    dispatch(setServer(data?.items || []));
  };

  const validateAndMaybeProceed = async () => {
    // still valid within 5 min?
    if (
      validation.status === "ok" &&
      validation.validThrough &&
      Date.now() < new Date(validation.validThrough).getTime()
    ) {
      nav("/checkout");
      return;
    }

    setValidating(true);
    try {
      const { data } = await axios.post(
        "/cart/validate",
        { location_id: locationId },
        { withCredentials: true }
      );
      dispatch(
        setValidation({
          ok: !!data?.ok,
          checkedAt: data?.checked_at,
          lines: data?.lines,
          ttlMs: 5 * 60 * 1000,
        })
      );
      if (data?.ok) {
        nav("/checkout");
      }
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-3 sm:px-5 py-8">
        <div>Loading…</div>
      </div>
    );
  }

  const empty = items.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-5 py-8">
      <h1 className="text-2xl font-semibold mb-5">Shopping Cart</h1>

      {empty ? (
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
                  const issue = validation?.issuesByLine?.[it.id];

                  return (
                    <div
                      key={`${it.id}-${it.variationId ?? it.variation_id ?? "v0"}`}
                      className="flex gap-3 rounded-xl p-3"
                      style={{
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface-2)",
                      }}
                    >
                      {/* Image → link if we can resolve product id */}
                      {pid ? (
                        <Link
                          to={`/products/${pid}`}
                          state={locationId ? { locationId } : null}
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
                            state={locationId ? { locationId } : null}
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

                        {/* Inline stock issue warning from last validation */}
                        {issue && (
                          <div className="text-xs mt-1 text-amber-500">
                            {issue.status === "oos"
                              ? "This item is out of stock at your selected location."
                              : `Only ${issue.available} available at your selected location. Reduce quantity to proceed.`}
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-2">
                          <button
                            className="rounded-md border px-2"
                            style={{
                              borderColor: "var(--color-border)",
                              background: "var(--color-surface)",
                            }}
                            onClick={() => changeQty(it, qty - 1)}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm">
                            {qty}
                          </span>
                          <button
                            className="rounded-md border px-2"
                            style={{
                              borderColor: "var(--color-border)",
                              background: "var(--color-surface)",
                            }}
                            onClick={() => changeQty(it, qty + 1)}
                            aria-label="Increase quantity"
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
                          title="Remove item"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="lg:col-span-4 order-2">
              <div
                className="rounded-xl p-4 space-y-3 sticky lg:top-20"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-2)",
                }}
              >
                <div className="flex items-center justify-between text-sm">
                  <span>Subtotal</span>
                  <span>$ {subTotal.toFixed(2)}</span>
                </div>

                <div className="text-xs muted">
                  {validation.status === "ok" &&
                  validation.validThrough &&
                  Date.now() < new Date(validation.validThrough).getTime()
                    ? `Validated • expires ${new Date(
                        validation.validThrough
                      ).toLocaleTimeString()}`
                    : validation.status === "blocking"
                    ? "Stock changed — adjust items to continue"
                    : "Validation required before checkout"}
                </div>

                <button
                  onClick={validateAndMaybeProceed}
                  className="w-full px-4 py-2 rounded-lg text-sm font-medium transition"
                  style={{
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    opacity: validating || validation.status === "blocking" ? 0.7 : 1,
                  }}
                  disabled={validating || validation.status === "blocking"}
                  title={
                    validation.status === "blocking"
                      ? "Some items exceed current stock"
                      : ""
                  }
                >
                  {validating ? "Checking…" : "Proceed to checkout"}
                </button>

                <Link
                  to="/products"
                  className="block text-center text-sm underline opacity-80 hover:opacity-100"
                >
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
