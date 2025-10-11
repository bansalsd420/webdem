// src/pages/Wishlist/WishlistPage.jsx
import { useEffect, useMemo, useState } from "react";
import axios from "../../api/axios.js";
import ProductCard from "../../components/ProductCard/ProductCard.jsx";
import { useAuth } from "../../state/auth.jsx";
import { useWishlist } from "../../state/Wishlist.jsx";
import { attachLocation, getLocationId } from '../../utils/locations';

const CONCURRENCY = 8; // polite parallelism

export default function WishlistPage() {
  const { user } = useAuth();
  const { ids: wishIds, remove } = useWishlist();

  const [items, setItems] = useState([]);     // array of Product | null (null = skeleton)
  const [loading, setLoading] = useState(true);
  const [locId, setLocId] = useState(() => getLocationId());

  // Normalize -> array of ids in the order we want to show
  const orderedIds = useMemo(() => {
    if (user) return null; // server decides order for logged-in
    const arr = Array.isArray(wishIds) ? wishIds : Array.from(wishIds || []);
    return arr.filter((n) => Number.isFinite(n));
  }, [user, wishIds]);

  // Listen for global location changes and update local state to trigger refetch
  useEffect(() => {
    const onLoc = (e) => setLocId(e.detail?.id ?? null);
    window.addEventListener('location:changed', onLoc);
    return () => window.removeEventListener('location:changed', onLoc);
  }, []);

  useEffect(() => {
    let alive = true;
    const aborters = new Set();

    const normalizeCard = (p) => ({
      id: p.product_id || p.id,
      name: p.name,
      sku: p.sku,
      image: p.image || p.thumbnail || p.images?.[0] || null,
      inStock: p.inStock ?? p.in_stock ?? true,
      minPrice: p.minPrice ?? p.price ?? p.price_display ?? null,
      brand: p.brand ?? p.brand_name ?? null,
      category: p.category ?? p.category_name ?? null,
      sub_category: p.sub_category ?? p.sub_category_name ?? null,
    });

    const runWithConcurrency = async (jobs, onResult) => {
      let idx = 0;
      const runners = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
        while (idx < jobs.length && alive) {
          const my = idx++;
          try {
            const res = await jobs[my]();
            if (!alive) return;
            onResult(my, res);
          } catch {
            if (!alive) return;
            onResult(my, null);
          }
        }
      });
      await Promise.allSettled(runners);
    };

    (async () => {
      setLoading(true);

      if (user) {
        // Logged-in: 1) get wishlist IDs+basic fields (ordered by backend)
        let base = [];
        try {
          const { data } = await axios.get("/wishlist", { withCredentials: true });
          if (!alive) return;
          const rows = Array.isArray(data) ? data : [];
          base = rows.map(normalizeCard);
          // Paint immediately (fast)
          setItems(base);
        } catch {
          if (alive) { setItems([]); setLoading(false); }
          return;
        }

        // 2) Hydrate missing price/stock in a single batch request (preserves order)
        const needIds = base
          .map((it) => it.id)
          .filter(Boolean);
        if (needIds.length) {
            const params = attachLocation({ ids: needIds.join(',') }, '/products', { explicit: true });
          try {
            const { data } = await axios.get(`/products`, { params, withCredentials: true });
            const rows = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            // merge back into base preserving server order
            const byId = new Map(rows.map(r => [r.id ?? r.product_id, r]));
            const merged = base.map(it => ({ ...it, ...(byId.get(it.id) ? normalizeCard(byId.get(it.id)) : {}) }));
            setItems(merged);
          } catch (e) {
            // ignore batch failure; keep base
          }
        }

        if (alive) setLoading(false);
        return;
      }

      // Guest: fetch products in batch (ordered)
      const idsArr = orderedIds || [];
      if (idsArr.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }
    // Batch fetch with location attached
    const params = attachLocation({ ids: idsArr.join(',') }, '/products', { explicit: true });
      try {
        const { data } = await axios.get('/products', { params });
        const rows = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
        const cards = rows.map(r => normalizeCard(r));
        // If backend preserved order (server-side ordered for logged-out?), otherwise align by idsArr
        const byId = new Map(cards.map(c => [c.id, c]));
        const ordered = idsArr.map(id => byId.get(id) || null);
        setItems(ordered);
      } catch (e) {
        // fallback: clear
        setItems([]);
      }

      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
      aborters.forEach((c) => c.abort?.());
      aborters.clear();
    };
  }, [user, orderedIds, locId]);

  const onWishlistChange = async (productId, nowSaved) => {
    if (!nowSaved) {
      await remove(productId);
      setItems((prev) => prev.filter((x) => x && x.id !== productId));
    }
  };

  // --- RENDER --------------------------------------------------------------

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
      <h1 className="text-2xl font-semibold mb-4">Wishlist</h1>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.length === 0 && !loading && (
          <div className="col-span-full text-sm opacity-75">No items saved yet.</div>
        )}

        {items.map((p, i) =>
          p ? (
            <ProductCard
              key={p.id}
              p={p}
              isWishlisted={wishIds?.has ? wishIds.has(p.id) : true}
              onWishlistChange={onWishlistChange}
            />
          ) : (
            // Skeleton card (simple, eager-safe)
            <div
              key={`s-${i}`}
              className="card card--product animate-pulse"
              style={{
                borderRadius: 12,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
              }}
            >
              <div
                className="product-img"
                style={{
                  height: 220,
                  background: "color-mix(in oklab, var(--color-border) 20%, var(--color-surface) 80%)",
                }}
              />
              <div className="p-3 space-y-2">
                <div
                  style={{
                    height: 14,
                    width: "70%",
                    borderRadius: 6,
                    background: "color-mix(in oklab, var(--color-border) 24%, var(--color-surface) 76%)",
                  }}
                />
                <div
                  style={{
                    height: 12,
                    width: "45%",
                    borderRadius: 6,
                    background: "color-mix(in oklab, var(--color-border) 24%, var(--color-surface) 76%)",
                  }}
                />
                <div
                  style={{
                    marginTop: 8,
                    height: 28,
                    width: "55%",
                    borderRadius: 8,
                    background: "color-mix(in oklab, var(--color-border) 28%, var(--color-surface) 72%)",
                  }}
                />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
