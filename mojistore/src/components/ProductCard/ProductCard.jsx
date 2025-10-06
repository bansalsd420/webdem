import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Heart, Eye } from "lucide-react";
import SmartImage from "../SmartImage";
import { useWishlist } from "../../state/Wishlist.jsx";
import { useAuth } from "../../state/auth.jsx";
import QuickView from "../QuickView/QuickView.jsx";
import "./product-card.css";

/**
 * ProductCard
 *
 * Props:
 *  - p: product object (required)
 *  - isWishlisted?: boolean
 *  - onWishlistChange?: (productId: number, saved: boolean) => void
 *  - priority?: boolean (image priority)
 *
 *  - showPriceStock?: boolean (default true)
 *      When false, hides the bottom price/stock row (useful on Home).
 *
 *  - onCardClick?: (p) => void
 *      If provided, clicking image/title will call this instead of navigating to PDP.
 *      Also disables the login-gate prompt for the card click (since the parent controls nav).
 */
export default function ProductCard({
  p,
  isWishlisted = false,
  onWishlistChange,
  priority = false,
  showPriceStock = true,
  onCardClick,
}) {
  const getSelectedLocationId = () => {
    const v = Number(localStorage.getItem("ms_location_id"));
    return Number.isFinite(v) ? v : null;
  };

  const wishlist = useWishlist?.();
  const add = wishlist?.add ?? (async () => {});
  const remove = wishlist?.remove ?? (async () => {});
  const ids = wishlist?.ids ?? new Set();
  const { user } = (typeof useAuth === "function" ? useAuth() : { user: null });
  const loc = useLocation();

  const [saved, setSaved] = useState(isWishlisted || ids.has(p?.id));
  const [busy, setBusy] = useState(false);
  const [openQV, setOpenQV] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // mirror auth so we don’t get stuck on a stale context value
  const [isAuthed, setIsAuthed] = useState(!!user);

  useEffect(() => {
    setSaved(isWishlisted || ids.has(p?.id));
  }, [isWishlisted, ids, p?.id]);

  // reflect auth changes from context
  useEffect(() => {
    setIsAuthed(!!user);
  }, [user]);

  // also listen to global auth events (Navbar/login flow emits these)
  useEffect(() => {
    const onLogin = () => setIsAuthed(true);
    const onLogout = () => setIsAuthed(false);
    window.addEventListener("auth:login", onLogin);
    window.addEventListener("auth:logout", onLogout);
    return () => {
      window.removeEventListener("auth:login", onLogin);
      window.removeEventListener("auth:logout", onLogout);
    };
  }, []);

  // if we just became authed, close any lingering login prompt overlay
  useEffect(() => {
    if (isAuthed && showLoginPrompt) setShowLoginPrompt(false);
  }, [isAuthed, showLoginPrompt]);

  if (!p || !p.id) return null;

  const toPdp = `/products/${p.id}`;
  const toLogin = useMemo(() => {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return `/login?next=${next}`;
  }, [loc.pathname, loc.search]);

  const brand = p.brand ?? p.brand_name ?? null;
  const category = p.category ?? p.category_name ?? null;
  const subCategory = p.sub_category ?? p.sub_category_name ?? null;

  const onToggleWish = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (saved) {
        await remove(p.id);
        setSaved(false);
        onWishlistChange?.(p.id, false);
      } else {
        await add(p.id);
        setSaved(true);
        onWishlistChange?.(p.id, true);
      }
    } finally {
      setBusy(false);
    }
  };

  // single click handler used by image + title links
  const handleCardClick = (e) => {
    // If parent supplied an override, call it instead of PDP/login-gate
    if (typeof onCardClick === "function") {
      e.preventDefault();
      e.stopPropagation();
      onCardClick(p);
      return;
    }
    // Otherwise, gate PDP by auth (your original behavior)
    if (!isAuthed) {
      e.preventDefault();
      e.stopPropagation();
      setShowLoginPrompt(true);
    }
    // If authed, let <Link to={toPdp}> proceed normally
  };

  const priceNode =
    p.minPrice == null ? (
      <Link to={toLogin} className="card-price-link">
        Login to see price
      </Link>
    ) : (
      <span className="card-price">{`$ ${Number(p.minPrice).toFixed(2)}`}</span>
    );

  return (
    <>
      <article className="card card--product">
        {/* IMAGE AREA */}
        <div className="card-media">
          <Link
            to={toPdp}
            state={{
              product: p,
              locationId: getSelectedLocationId(),
            }}
            aria-label={`${p.name} details`}
            className="product-img block relative"
            onClick={handleCardClick}
          >
            <SmartImage
              image={p.image}
              alt={p.name}
              width={480}
              height={360}
              sizes="(max-width: 640px) 50vw, (max-width: 1536px) 20vw, 16vw"
              quality={76}
              fit="cover"
              safeCover={false}
              priority={priority}
            />
          </Link>

          {/* HOVER ACTIONS */}
          <div className="card-actions">
            <button
              type="button"
              aria-label="Quick view"
              className="card-action-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpenQV(true);
              }}
            >
              <Eye size={16} />
              <span>Quick view</span>
            </button>

            <button
              type="button"
              aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
              className={`card-action-btn ${saved ? "is-saved" : ""}`}
              disabled={busy}
              onClick={onToggleWish}
            >
              <Heart size={16} />
              <span>{saved ? "Saved" : "Wishlist"}</span>
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="card-body">
          {brand ? (
            <div className="card-brand">
              <span className="pill">{brand}</span>
            </div>
          ) : (
            <div className="card-brand-spacer" />
          )}

          <h3 className="card-title">
            <Link
              to={toPdp}
              state={{
                product: p,
                locationId: getSelectedLocationId(),
              }}
              onClick={handleCardClick}
            >
              {p.name}
            </Link>
          </h3>

          {p.sku ? <div className="card-sku">SKU: {p.sku}</div> : null}

          {(category || subCategory) && (
            <div className="card-cat">
              {category && (
                <Link to={`/products?category=${p.category_id || ""}`}>{category}</Link>
              )}
              {subCategory && (
                <>
                  <span className="sep">›</span>
                  <Link
                    to={`/products?category=${p.category_id || ""}&subcategory=${p.sub_category_id || ""}`}
                  >
                    {subCategory}
                  </Link>
                </>
              )}
            </div>
          )}

          {/* FOOT: price/stock (toggleable) */}
          {showPriceStock && (
            <div className="card-foot">
              <span className={`pill ${p.inStock ? "pill--ok" : "pill--bad"}`}>
                {p.inStock ? "In stock" : "Out of stock"}
              </span>
              {priceNode}
            </div>
          )}
        </div>
      </article>

      {/* Quick View */}
      {openQV && (
        <QuickView productId={p.id} product={p} onClose={() => setOpenQV(false)} />
      )}

      {/* Login prompt */}
      {showLoginPrompt && (
        <div
          className="fixed inset-0 z-[2000] grid place-items-center"
          style={{ background: "color-mix(in oklab, black 60%, transparent)" }}
          onClick={() => setShowLoginPrompt(false)}
        >
          <div
            className="rounded-2xl shadow-xl max-w-sm w-[92vw]"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="text-lg font-semibold">Please log in</div>
              <div className="text-sm opacity-80 mt-1">
                Log in to view full product details and pricing.
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  className="rounded-lg px-3 py-2 border"
                  onClick={() => setShowLoginPrompt(false)}
                >
                  Not now
                </button>
                <Link
                  to={toLogin}
                  className="rounded-lg px-3 py-2"
                  style={{
                    background: "var(--color-primary)",
                    color: "var(--color-on-primary)",
                  }}
                >
                  Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
