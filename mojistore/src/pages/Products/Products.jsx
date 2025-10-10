// src/pages/Products/Products.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../api/axios.js';
import ProductCard from '../../components/ProductCard/ProductCard.jsx';
import '../../styles/filters.css';
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import { withLocation, getLocationId } from "../../utils/locations";


const toUSD = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  try {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  } catch {
    return `$${n.toFixed(2)}`;
  }
};

// Robust in-stock detector: support multiple shapes returned by various APIs/ERPs
function isProductInStock(p) {
  // explicit boolean true
  if (p?.inStock === true) return true;
  // snake_case or alternate boolean-like values
  if (p?.in_stock === true) return true;
  if (p?.inStock === 'true' || p?.inStock === '1' || p?.in_stock === 'true' || p?.in_stock === 1) return true;
  // explicit stock strings
  if (p?.stock === 'in_stock' || p?.stock_status === 'in_stock') return true;
  // numeric quantities
  if (typeof p?.qty === 'number' && p.qty > 0) return true;
  if (typeof p?.available_qty === 'number' && p.available_qty > 0) return true;
  // last-resort: treat numeric truthy values as in-stock
  if (typeof p?.inStock === 'number' && p.inStock > 0) return true;
  return false;
}

export default function Products() {
  const [sp, setSp] = useSearchParams();
  const spStr = sp.toString(); // track URL param changes (incl. ?location=) without extra state

  // ---------- URL filters ----------
  const urlFilters = useMemo(() => {
    const q = sp.get('q') || '';
    const category = sp.get('category') ? Number(sp.get('category')) : undefined;
    const subcategory = sp.get('subcategory')
      ? Number(sp.get('subcategory'))
      : sp.get('sub')
        ? Number(sp.get('sub'))
        : undefined;
    const brand = sp.get('brand') ? Number(sp.get('brand')) : undefined;
    const page = Number(sp.get('page') || 1);
    const limit = Number(sp.get('limit') || 24);
    const instock = sp.get('instock') === '1';
    return { q, category, subcategory, brand, page, limit, instock };
  }, [spStr]); // include spStr so changing ?location= doesn't rebuild filters unnecessarily

  // ---------- search UX (no URL churn while typing) ----------
  const [qInput, setQInput] = useState(urlFilters.q);
  useEffect(() => { setQInput(urlFilters.q); }, [urlFilters.q]);
  const dq = useDebouncedValue(urlFilters.q, 300);
  // product-page local debounced input for suggestions
  const dqInput = useDebouncedValue(qInput, 250);

  const navigate = useNavigate();

  // ---------- suggestions (Products page) ----------
  const [suggestions, setSuggestions] = useState([]);
  const [openSug, setOpenSug] = useState(false);
  const sugRef = useRef(null);
  const inputRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const term = (dqInput || '').trim();
    if (!term) {
      setSuggestions([]);
      setOpenSug(false);
      setActiveIdx(-1);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get('/search/suggest', {
          params: { q: term }, withCredentials: true, signal: ctrl.signal,
        });
        if (!alive) return;
        const arr = Array.isArray(data) ? data : [];
        setSuggestions(arr);
        setActiveIdx(-1);
        setOpenSug(arr.length > 0);
      } catch (e) {
        if (!alive) return;
        setSuggestions([]); setOpenSug(false); setActiveIdx(-1);
      }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, [dqInput]);

  // close suggestions on outside click / escape
  useEffect(() => {
    const onDoc = (e) => { if (sugRef.current && !sugRef.current.contains(e.target)) setOpenSug(false); };
    const onKey = (e) => {
      if (!openSug) return;
      if (e.key === 'Escape') setOpenSug(false);
      if (e.key === 'ArrowDown') setActiveIdx(i => Math.min(suggestions.length - 1, i + 1));
      if (e.key === 'ArrowUp') setActiveIdx(i => Math.max(0, i - 1));
      if (e.key === 'Enter') {
        if (activeIdx >= 0 && suggestions[activeIdx]) {
          e.preventDefault();
          const s = suggestions[activeIdx];
          if (s.type === 'product') navigate(`/products/${s.id}`);
          else if (s.type === 'category') setQuery({ category: s.id, q: undefined, page: 1 });
          else if (s.type === 'brand') setQuery({ brand: s.id, q: undefined, page: 1 });
          else setQuery({ q: s.label || '', page: 1 });
          setOpenSug(false);
        }
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [openSug, suggestions, activeIdx]);

  // unified URL setter
  const setQuery = (updates, replace = false) => {
    const next = new URLSearchParams(sp.toString());
    const setOrDel = (k, v) =>
      v === undefined || v === null || v === '' ? next.delete(k) : next.set(k, String(v));
    if ('q' in updates) setOrDel('q', updates.q);
    if ('category' in updates) setOrDel('category', updates.category);
    if ('subcategory' in updates) {
      setOrDel('subcategory', updates.subcategory);
      next.delete('sub'); // legacy param
    }
    if ('brand' in updates) setOrDel('brand', updates.brand);
    if ('page' in updates) setOrDel('page', updates.page);
    if ('limit' in updates) setOrDel('limit', updates.limit);
    if ('instock' in updates) setOrDel('instock', updates.instock ? 1 : undefined);
    setSp(next, { replace });
  };

  // ---------- filters panel state ----------
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [catQuery, setCatQuery] = useState('');
  const [subQuery, setSubQuery] = useState('');
  const [brandQuery, setBrandQuery] = useState('');

  // ---------- list state ----------
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [total, setTotal] = useState(undefined);
  const totalPages = total ? Math.max(1, Math.ceil(total / urlFilters.limit)) : undefined;

  // ---------- location awareness ----------
  const [locVersion, setLocVersion] = useState(0);
  const lastLocRef = useRef(getLocationId());

  // fire when Navbar changes the location (support both event names)
  useEffect(() => {
    const bumpIfChanged = () => {
      const cur = getLocationId();
      if (cur !== lastLocRef.current) {
        lastLocRef.current = cur;
        setLocVersion((v) => v + 1);
      }
    };
    const onMoji = () => bumpIfChanged();
    const onLegacy = () => bumpIfChanged();

    const onFocus = () => bumpIfChanged();

    window.addEventListener('moji:location-change', onMoji);
    window.addEventListener('location:changed', onLegacy);

    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('moji:location-change', onMoji);
      window.removeEventListener('location:changed', onLegacy);

      window.removeEventListener('focus', onFocus);
    };
  }, [spStr]);

  // ---------- fetch filters (server-side lists) ----------
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const { data } = await api.get('/filters', {
          params: { q: dq || '', categoryId: urlFilters.category, subCategoryId: urlFilters.subcategory },
          signal: ctrl.signal,
        });
        if (!alive) return;
        setCategories(data?.categories || []);
        setSubcategories(data?.subcategories || []);
        setBrands(data?.brands || []);
      } catch {
        if (!alive) return;
        setCategories([]); setSubcategories([]); setBrands([]);
      }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, [dq, urlFilters.category, urlFilters.subcategory]);

  // visual loading state when page or filters change
  useEffect(() => {
    setPageLoading(true);
    setItems([]);
    window.scrollTo(0, 0);
  }, [
    urlFilters.page,
    urlFilters.limit,
    urlFilters.q,
    urlFilters.category,
    urlFilters.subcategory,
    urlFilters.brand,
    urlFilters.instock,
    locVersion,   // refetch page when location changes
    spStr         // also refetch if ?location= changed directly in URL
  ]);

  // ---------- fetch products ----------
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      // Debugging: surface the URL-derived filters so we can trace why the UI shows no products
      // debug logs removed
      try {
        // Build base params from URL-derived filters
        const baseParams = {
          q: dq || '',
          category: urlFilters.category,
          subcategory: urlFilters.subcategory,
          brand: urlFilters.brand,
          page: urlFilters.page,
          limit: urlFilters.limit,
          instock: urlFilters.instock ? 1 : undefined,
        };

        // If the legacy `location` query param is present in the URL (Navbar sets this when navigating),
        // use it as a fallback for attaching to API requests when the in-memory location store hasn't
        // been bootstrapped yet. withLocation() will prefer the store value when available.
        const urlLoc = sp.get('location');
        if (urlLoc) {
          try {
            const n = Number(urlLoc);
            if (Number.isFinite(n)) {
              baseParams.locationId = n;
              baseParams.location_id = n;
              // debug log removed
            }
          } catch (e) { /* ignore parse errors */ }
        }

        const params = withLocation(baseParams);
  // removed debug logging
        const resp = await api.get('/products', { params, withCredentials: true, signal: ctrl.signal });
        const data = resp.data;

        let arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        if (!alive) return;

        // normalize price fields for the card: backend may return minPrice or price_display
        const normalized = arr.map(p => ({
          ...p,
          minPrice: p.minPrice ?? p.price_display ?? null,
          _priceText: (p.minPrice ?? p.price_display) != null ? toUSD(p.minPrice ?? p.price_display) : null,
        }));

  setItems(normalized);
  // removed debug logging

        if (typeof data?.total === 'number') setTotal(data.total);
        else {
          const hdr = Number(resp.headers?.['x-total-count'] || resp.headers?.['x-total'] || NaN);
          setTotal(Number.isFinite(hdr) ? hdr : undefined);
        }
      } catch (e) {
        if (!alive) return;
        setItems([]); setTotal(undefined);
        console.error('Products fetch failed', e);
      } finally {
        if (alive) { setLoading(false); setPageLoading(false); }
      }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, [
    dq,
    urlFilters.category,
    urlFilters.subcategory,
    urlFilters.brand,
    urlFilters.page,
    urlFilters.limit,
    urlFilters.instock,
    locVersion,
    spStr // ensure we react if ?location= changes without an event
  ]);

  // client-side search in filter lists
  const filteredCats = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, catQuery]);
  const filteredSubs = useMemo(() => {
    const q = subQuery.trim().toLowerCase();
    return q ? subcategories.filter((s) => s.name.toLowerCase().includes(q)) : subcategories;
  }, [subcategories, subQuery]);
  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    return q ? brands.filter((b) => b.name.toLowerCase().includes(q)) : brands;
  }, [brands, brandQuery]);

  const OptionRow = ({ active, label, count, onClick }) => (
    <button type="button" onClick={onClick} className={`filter-option ${active ? 'is-active' : ''}`} title={label}>
      <span className="truncate">{label}</span>
      {typeof count === 'number' && <span className="count">{count}</span>}
    </button>
  );

  const clearAll = () => {
    setQInput('');
    setQuery({ q: undefined, category: undefined, subcategory: undefined, brand: undefined, instock: undefined, page: 1 });
  };

  const hasNext = total ? urlFilters.page * urlFilters.limit < total : items.length === urlFilters.limit;
  const hasPrev = urlFilters.page > 1;

  return (
    <div className="mx-auto max-w-7xl 2xl:max-w-[100rem] uw:max-w-120rem px-3 sm:px-6 py-6 grid grid-cols-12 gap-5">
      {/* LEFT: filters */}
      <aside className="col-span-12 md:col-span-3 lg:col-span-2 space-y-4 filters">
        {/* category */}
        <div className="filters-panel">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Categories</div>
            {urlFilters.category && (
              <button
                className="text-xs underline"
                onClick={() => { setQInput(''); setQuery({ q: undefined, category: undefined, subcategory: undefined, page: 1 }); }}
              >
                Clear
              </button>
            )}
          </div>
          <input
            className="filters-input mb-2 w-full"
            placeholder="Search categories…"
            value={catQuery}
            onChange={(e) => setCatQuery(e.target.value)}
          />
          <div className="filters-scroll space-y-1">
            {filteredCats.map((c) => (
              <OptionRow
                key={c.id}
                active={urlFilters.category === c.id}
                label={c.name}
                count={c.count}
                onClick={() => { setQInput(''); setQuery({ q: undefined, category: c.id, subcategory: undefined, page: 1 }); }}
              />
            ))}
          </div>
        </div>

        {/* subcategory */}
        <div className="filters-panel">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Subcategories</div>
            {urlFilters.subcategory && (
              <button className="text-xs underline" onClick={() => { setQInput(''); setQuery({ q: undefined, subcategory: undefined, page: 1 }); }}>
                Clear
              </button>
            )}
          </div>
          <input
            className="filters-input mb-2 w-full"
            placeholder="Search subcategories…"
            value={subQuery}
            onChange={(e) => setSubQuery(e.target.value)}
          />
          <div className="filters-scroll space-y-1">
            {filteredSubs.map((s) => (
              <OptionRow
                key={s.id}
                active={urlFilters.subcategory === s.id}
                label={s.name}
                count={s.count}
                onClick={() => { setQInput(''); setQuery({ q: undefined, subcategory: s.id, page: 1 }); }}
              />
            ))}
          </div>
        </div>

        {/* brand */}
        <div className="filters-panel">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Brands</div>
            {urlFilters.brand && (
              <button className="text-xs underline" onClick={() => { setQInput(''); setQuery({ q: undefined, brand: undefined, page: 1 }); }}>
                Clear
              </button>
            )}
          </div>
          <input
            className="filters-input mb-2 w-full"
            placeholder="Search brands…"
            value={brandQuery}
            onChange={(e) => setBrandQuery(e.target.value)}
          />
          <div className="filters-scroll space-y-1">
            {filteredBrands.map((b) => (
              <OptionRow
                key={b.id}
                active={urlFilters.brand === b.id}
                label={b.name}
                count={b.count}
                onClick={() => { setQInput(''); setQuery({ q: undefined, brand: b.id, page: 1 }); }}
              />
            ))}
          </div>
        </div>

        <button onClick={() => clearAll()} className="filters-clear w-full">
          Clear all
        </button>
      </aside>

      {/* RIGHT: grid */}
      <section className="col-span-12 md:col-span-9 lg:col-span-10">
        {/* top controls */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Products</h1>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <form
              onSubmit={(e) => { e.preventDefault(); setQuery({ q: qInput, page: 1 }); }}
              className="w-full sm:w-80 md:w-96"
            >
              <div className="relative">
                <div ref={sugRef} className="relative">
                  <input
                    ref={inputRef}
                    placeholder="Search products…"
                    className="filters-input w-full h-8 pr-8"
                    value={qInput}
                    onChange={(e) => setQInput(e.target.value)}
                    onFocus={() => { if (suggestions.length) setOpenSug(true); }}
                  />

                  <div className={`absolute left-0 right-0 mt-1 z-50`}>
                    {openSug && suggestions.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="rounded-lg border bg-zinc-900 border-zinc-800 overflow-hidden" role="listbox" aria-label="Product suggestions">
                        {suggestions.map((s, idx) => (
                          <button
                            key={`${s.type}:${s.id}:${idx}`}
                            type="button"
                            className={`w-full text-left px-3 py-2 hover:bg-zinc-800 ${idx === activeIdx ? 'bg-zinc-800' : ''} sug-grid`}
                            role="option"
                            aria-selected={idx === activeIdx}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              if (s.type === 'product') navigate(`/products/${s.id}`);
                              else if (s.type === 'category') setQuery({ category: s.id, q: undefined, page: 1 });
                              else if (s.type === 'brand') setQuery({ brand: s.id, q: undefined, page: 1 });
                              else setQuery({ q: s.label || '', page: 1 });
                              setOpenSug(false);
                            }}
                            onMouseEnter={() => setActiveIdx(idx)}
                          >
                            {s.thumbUrl ? (
                              <img className="sug-thumb" src={s.thumbUrl} alt="" loading="eager" decoding="async" />
                            ) : (
                              <div className="sug-thumb sug-thumb--empty" aria-hidden="true" />
                            )}
                            <div className="sug-text truncate">{s.label}</div>
                            <div style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>
                              <span className="inline-block px-2 py-0.5 rounded bg-zinc-800">{s.type}</span>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </div>
                {qInput && (
                  <button
                    type="button"
                    title="Clear"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                    onClick={() => { setQInput(''); setQuery({ q: undefined, page: 1 }); }}
                  >
                    ×
                  </button>
                )}
              </div>
            </form>

            <label className="inline-flex items-center gap-2 text-sm opacity-80">
              <input
                type="checkbox"
                checked={!!urlFilters.instock}
                onChange={(e) => { setQInput(''); setQuery({ q: undefined, instock: e.target.checked ? 1 : undefined, page: 1 }); }}
              />
              In stock
            </label>

            <label className="inline-flex items-center gap-2 text-sm opacity-80">
              Per page
              <select
                className="filters-input h-8 px-2"
                value={urlFilters.limit}
                onChange={(e) => setQuery({ limit: Number(e.target.value), page: 1 })}
              >
                <option value={24}>24</option>
                <option value={48}>48</option>
                <option value={96}>96</option>
              </select>
            </label>
          </div>
        </div>

        {/* grid */}
        <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-4 uw:grid-cols-5">
          {(pageLoading || (loading && items.length === 0))
            ? Array.from({ length: urlFilters.limit }).map((_, i) => (
              <div
                key={`s-${i}`}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 animate-pulse"
                style={{ aspectRatio: '2 / 3' }}
              />
            ))
            : items.map((p) => (
              <ProductCard
                key={p.id}
                p={{
                  id: p.id,
                  name: p.name,
                  sku: p.sku,
                  image: p.image || null,
                  inStock: isProductInStock(p),
                  // price fields (support both old and new card props)
                  minPrice: p.minPrice ?? null,            // numeric for logic
                  priceText: p._priceText ?? null,         // formatted USD for display (if your card uses it)
                  // additive meta
                  brand: p.brand_name ?? null,
                  brand_id: p.brand_id ?? null,
                  category: p.category_name ?? null,
                  sub_category: p.sub_category_name ?? null,
                  category_id: p.category_id ?? null,
                  sub_category_id: p.sub_category_id ?? null,
                }}
              />
            ))}
        </div>

        {/* empty state */}
        {!pageLoading && !loading && items.length === 0 && (
          <div className="p-6">No products found.</div>
        )}

        {/* pagination */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            disabled={!hasPrev}
            onClick={() => { window.scrollTo(0, 0); setQuery({ page: urlFilters.page - 1 }); }}
            className="rounded-xl border border-zinc-700 px-3 py-2 disabled:opacity-50"
          >
            Prev
          </button>

          {totalPages ? (
            <span className="text-sm opacity-70">Page {urlFilters.page} / {totalPages}</span>
          ) : (
            <span className="text-sm opacity-70">Page {urlFilters.page}</span>
          )}

          <button
            disabled={!hasNext}
            onClick={() => { window.scrollTo(0, 0); setQuery({ page: urlFilters.page + 1 }); }}
            className="rounded-xl border border-zinc-700 px-3 py-2 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
