// web/src/pages/Home/Home.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios.js";
import ProductCard from "../../components/ProductCard/ProductCard.jsx";
import "./home-hero-wall.css";
import "./brand-rail.css";
import "./product-sections.css";

/** Read real brands from /home */
const BRANDS_FROM_DB = true;

/* -------- helpers -------- */
const isUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s);
const toSrc = (img) => (isUrl(img) || (img && img.startsWith("/img/")) ? img : img);

function readSelectedLocationId() {
  const keys = ["ms_location_id", "locationId"];
  for (const k of keys) {
    const n = Number(localStorage.getItem(k));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/* =========================================================
   PAGE
========================================================= */
export default function Home() {
  const navigate = useNavigate();

  // hero + wall (no placeholders; render only what API returns)
  const [hero, setHero] = useState([]);
  const [wall, setWall] = useState([]);

  // data sections
  const [brands, setBrands] = useState([]);
  const [trending, setTrending] = useState([]);
  const [fresh, setFresh] = useState([]);
  const [best, setBest] = useState([]);
  const [loading, setLoading] = useState(true);

  // refetch when location changes
  const [locVersion, setLocVersion] = useState(0);
  const lastLocRef = useRef(readSelectedLocationId());
  useEffect(() => {
    const bumpIfChanged = () => {
      const cur = readSelectedLocationId();
      if (cur !== lastLocRef.current) {
        lastLocRef.current = cur;
        setLocVersion((v) => v + 1);
      }
    };
    const onStorage = (e) => {
      if (e.key === "ms_location_id" || e.key === "locationId") bumpIfChanged();
    };
    const onFocus = () => bumpIfChanged();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    window.addEventListener("moji:location-change", bumpIfChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("moji:location-change", bumpIfChanged);
    };
  }, []);

  // ONE fetch for entire home payload (no waterfalls)
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      const params = { locationId: readSelectedLocationId() };
      try {
        const { data } = await api.get("/home", {
          params,
          withCredentials: true,
          signal: ctrl.signal,
        });
        if (cancelled) return;

        // hero + wall (render exactly what API returns)
        const apiHero = (Array.isArray(data?.hero) ? data.hero : data?.banners || [])
          .map((b) => ({
            id: b.id,
            href: b.href || "#",
            alt: b.alt || b.alt_text || "Banner",
            img: toSrc(b.img),
            isGif: !!b.isGif,
          }))
          .filter((b) => b.img);

        const apiWall = (Array.isArray(data?.wall) ? data.wall : [])
          .map((b) => ({
            id: b.id,
            href: b.href || "#",
            alt: b.alt || b.alt_text || "Banner",
            img: toSrc(b.img),
            isGif: !!b.isGif,
          }))
          .filter((b) => b.img);

        setHero(apiHero);
        setWall(apiWall);

        // rails + brands
        if (BRANDS_FROM_DB) {
          const apiBrands = (Array.isArray(data?.brands) ? data.brands : []).map((b) => ({
            id: b.id,
            name: b.name,
            href: b.href || `/products?brand=${b.id}&page=1`,
            image: toSrc(b.image) || "",
          }));
          setBrands(apiBrands);
        }
        setTrending(Array.isArray(data?.trending) ? data.trending : []);
        setFresh(Array.isArray(data?.fresh) ? data.fresh : []);
        setBest(Array.isArray(data?.bestSellers) ? data.bestSellers : []);
      } catch (err) {
        if (cancelled) return;
        console.error("Home fetch failed", err);
        // leave hero/wall as empty arrays on error (no placeholders)
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [locVersion]);

  // Discovery-only click → Products search (so price/stock show there)
  const goToProductsFor = (p) => {
    const q = p?.name || p?.sku || "";
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : `/products`);
  };

  return (
    <main className="home">
      {/* HERO (55vh) */}
      <HeroCarousel slides={hero} />

      {/* WALL: render exactly the count from API (no placeholders, no cap) */}
      {wall.length > 0 && (
        <section className="home-wall">
          {wall.map((b, i) => (
            <BannerLink key={`wall-${b.id ?? i}`} href={b.href} className="wall-row">
              <div className="wall-media">
                <img
                  src={b.img}
                  alt={b.alt || ""}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </BannerLink>
          ))}
        </section>
      )}

      {/* BRANDS */}
      <BrandsSection items={brands} loading={loading} />

      {/* TRENDING */}
      <ProductsRail
        title="Trending Now"
        items={trending}
        loading={loading}
        discovery
        onCardClick={goToProductsFor}
      />

      {/* NEW ARRIVALS */}
      <NewArrivals
        items={fresh}
        loading={loading}
        discovery
        onCardClick={goToProductsFor}
      />

      {/* BEST SELLERS */}
      <ProductsRail
        title="Best Sellers"
        items={best}
        loading={loading}
        discovery
        onCardClick={goToProductsFor}
      />
    </main>
  );
}

/* =========================================================
   HERO CAROUSEL (auto, arrows, dots) — uses .hero-media wrapper
========================================================= */
function HeroCarousel({ slides = [] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length || 1;

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      if (!paused) setIdx((i) => (i + 1) % count);
    }, 4500);
    return () => clearInterval(id);
  }, [count, paused]);

  const go = (next) => setIdx((i) => (i + (next ? 1 : -1) + count) % count);
  const translateX = count > 1 ? `translate3d(${-idx * 100}%, 0, 0)` : "none";

  if (!slides.length) return null;

  return (
    <section
      className="home-hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="hero-track" style={{ transform: translateX }} aria-live="polite">
        {slides.map((s, i) => (
          <BannerLink key={`hero-${s.id ?? i}`} href={s.href} className="hero-slide">
            {/* IMPORTANT: this wrapper is required by your CSS */}
            <div className="hero-media">
              <img
                src={s.img}
                alt={s.alt || ""}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </div>
          </BannerLink>
        ))}
      </div>

      {count > 1 && (
        <>
          <button className="hero-nav prev" aria-label="Previous" onClick={() => go(false)}>
            ‹
          </button>
          <button className="hero-nav next" aria-label="Next" onClick={() => go(true)}>
            ›
          </button>
          <div className="hero-dots" role="tablist" aria-label="Carousel Pagination">
            {slides.map((_, i) => (
              <button
                key={`dot-${i}`}
                className={`dot ${i === idx ? "active" : ""}`}
                onClick={() => setIdx(i)}
                aria-selected={i === idx ? "true" : "false"}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* =========================================================
   BRANDS (image-free, smooth auto-loop)
========================================================= */
function BrandsSection({ items = [], loading }) {
  const outerRef = useRef(null);
  const rafRef = useRef(null);
  const paused = useRef(false);
  const railRef = useRef(null);

  const renderItems = useMemo(
    () => (items?.length ? items.concat(items) : []),
    [items]
  );

  useEffect(() => {
    const el = outerRef.current;
    if (!el || loading || renderItems.length === 0) return;
    const speed = 0.6; // ~36px/s
    const loop = () => {
      if (!paused.current) {
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half) el.scrollLeft = 0;
        el.scrollLeft += speed;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loading, renderItems]);

  const scrollBrands = (dir = 1) => {
    const el = railRef.current || outerRef.current;
    if (!el) return;
    const delta = (el.firstElementChild ? el.firstElementChild.getBoundingClientRect().width : 160) + 12;
    el.scrollBy({ left: dir * delta, behavior: 'smooth' });
  };

  return (
    <section className="home-brands">
      <div className="brands-head">
        <h2>Featured Brands</h2>
      </div>

      <div
        className="brand-rail-wrap"
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
      >
        <button className="rail-nav prev" aria-label="Scroll brands left" onClick={() => scrollBrands(-1)}>‹</button>
        <div
          ref={(el) => { outerRef.current = el; railRef.current = el; }}
          className="brand-rail no-scrollbar"
          role="list"
          aria-label="Brand logos"
        >
          {renderItems.length
            ? renderItems.map((b, i) => (
                <Link
                  key={`${b.id}-${i}`}
                  role="listitem"
                  className="brand-item"
                  to={b.href || `/products?brand=${b.id}`}
                  title={b.name}
                >
                  <span className="brand-label">{b.name}</span>
                </Link>
              ))
            : Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="brand-item brand-skel" />
              ))}
        </div>
        <div className="brand-fade left" />
        <div className="brand-fade right" />
        <button className="rail-nav next" aria-label="Scroll brands right" onClick={() => scrollBrands(1)}>›</button>
      </div>
    </section>
  );
}

/* =========================================================
   PRODUCT RAILS (Trending / Best Sellers)
   discovery=true => hide price/stock on cards & route to products search
========================================================= */
function ProductsRail({ title, items = [], loading, discovery = false, onCardClick }) {
  const railRef = useRef(null);
  const timer = useRef(null);
  const paused = useRef(false);

  const renderItems = useMemo(() => {
    if (!items?.length) return [];
    const tail = items.slice(0, Math.min(6, items.length));
    return items.concat(tail);
  }, [items]);

  useEffect(() => {
    if (loading || renderItems.length === 0) return;
    const el = railRef.current;
    if (!el) return;

    function step() {
      if (paused.current) return;
      const first = el.querySelector(".rail-card");
      const gap = parseFloat(getComputedStyle(el).columnGap || "16");
      const w = first ? first.getBoundingClientRect().width : 260;
      const delta = w + (isNaN(gap) ? 16 : gap);
      const originalWidth = delta * (items.length || 1);
      if (el.scrollLeft + el.clientWidth >= originalWidth + delta * 2) {
        el.scrollLeft = 0;
      } else {
        el.scrollTo({ left: el.scrollLeft + delta, behavior: "smooth" });
      }
    }

    timer.current = setInterval(step, 3200);
    return () => clearInterval(timer.current);
  }, [loading, renderItems, items.length]);

  const scrollByOne = (dir = 1) => {
    const el = railRef.current;
    if (!el) return;
    const first = el.querySelector(".rail-card");
    const gap = parseFloat(getComputedStyle(el).columnGap || "16");
    const w = first ? first.getBoundingClientRect().width : 260;
    el.scrollBy({
      left: dir * (w + (isNaN(gap) ? 16 : gap)),
      behavior: "smooth",
    });
  };

  return (
    <section className="home-block">
      <div className="section-head">
        <div className="section-title-wrap">
          <h2 className="section-title">{title}</h2>
          <span className="section-underline" />
        </div>
        <Link to="/products" className="link-more">
          View all →
        </Link>
      </div>

      <div
        className="rail-wrap"
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
      >
        <button
          type="button"
          className="rail-nav prev"
          aria-label="Scroll left"
          onClick={() => scrollByOne(-1)}
        >
          ‹
        </button>
        <div
          ref={railRef}
          className="prod-rail no-scrollbar"
          style={{ gridAutoColumns: "clamp(200px, 23vw, 260px)" }}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rail-skel" />
              ))
            : renderItems.map((raw, i) => (
                <div key={`${raw.id}-${i}`} className="rail-card"
                     role={discovery ? "button" : undefined}
                     tabIndex={discovery ? 0 : undefined}
                     onClick={discovery ? () => onCardClick?.(raw) : undefined}
                     onKeyDown={
                       discovery
                         ? (e) => (e.key === "Enter" ? onCardClick?.(raw) : null)
                         : undefined
                     }>
                  <ProductCard
                    p={normalizeCard(raw)}
                    showPriceStock={!discovery}
                    onCardClick={discovery ? () => onCardClick?.(raw) : undefined}
                  />
                </div>
              ))}
        </div>
        <button
          type="button"
          className="rail-nav next"
          aria-label="Scroll right"
          onClick={() => scrollByOne(1)}
        >
          ›
        </button>
      </div>
    </section>
  );
}

/* =========================================================
   NEW ARRIVALS (5 x 2 grid on wide screens)
========================================================= */
function NewArrivals({ items = [], loading, discovery = false, onCardClick }) {
  const list = Array.isArray(items) ? items.slice(0, 10) : [];
  return (
    <section className="home-block">
      <div className="section-head center">
        <div className="section-title-wrap">
          <h2 className="section-title">New Arrivals</h2>
          <span className="section-underline" />
        </div>
        <Link to="/products" className="link-more">
          Browse catalogue →
        </Link>
      </div>

      {loading ? (
        <div className="fresh-grid">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="fresh-skel" />
          ))}
        </div>
      ) : list.length ? (
        <div className="fresh-grid">
          {list.map((raw) => (
            <div key={raw.id}
                 role={discovery ? "button" : undefined}
                 tabIndex={discovery ? 0 : undefined}
                 onClick={discovery ? () => onCardClick?.(raw) : undefined}
                 onKeyDown={discovery ? (e) => (e.key === "Enter" ? onCardClick?.(raw) : null) : undefined}>
              <ProductCard
                p={normalizeCard(raw)}
                showPriceStock={!discovery}
                onCardClick={discovery ? () => onCardClick?.(raw) : undefined}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* =========================================================
   small bits
========================================================= */
function BannerLink({ href, className, children }) {
  const isExternal = /^https?:\/\//i.test(href || "");
  if (isExternal) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-bannerlink
      >
        {children}
      </a>
    );
  }
  return (
    <Link className={className} to={href || "/products?page=1"} data-bannerlink>
      {children}
    </Link>
  );
}

function normalizeCard(p) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    image: p.image || null,
    // in discovery mode we hide this anyway; still normalize for other pages
    inStock: isProductInStock(p),
    minPrice: p.minPrice ?? null,
    category: p.category,
    sub_category: p.sub_category,
    category_id: p.category_id,
    sub_category_id: p.sub_category_id,
    category_name: p.category_name,
    sub_category_name: p.sub_category_name,
  };
}

// Reuse the same robust in-stock detector used elsewhere
function isProductInStock(p) {
  if (p?.inStock === true) return true;
  if (p?.in_stock === true) return true;
  if (p?.inStock === 'true' || p?.inStock === '1' || p?.in_stock === 'true' || p?.in_stock === 1) return true;
  if (p?.stock === 'in_stock' || p?.stock_status === 'in_stock') return true;
  if (typeof p?.qty === 'number' && p.qty > 0) return true;
  if (typeof p?.available_qty === 'number' && p.available_qty > 0) return true;
  if (typeof p?.inStock === 'number' && p.inStock > 0) return true;
  return false;
}




