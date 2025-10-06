/* src/components/SubNavbar.jsx
   Preload all subcategories once (concurrency-limited), no browser storage.
   Hover never refetches once a category's subs are loaded.
*/
import { Link, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/axios.js';
import '../../styles/subnavbar.css';

const keyOf = (id) => String(id);

export default function SubNavbar() {
  const [cats, setCats] = useState([]);
  const [subsByCat, setSubsByCat] = useState({}); // { [catId:string]: [{id,name}] }
  const [openCatId, setOpenCatId] = useState(null);
  const [loadingCatId, setLoadingCatId] = useState(null);
  const inflightRef = useRef(new Map());
  const blurTimerRef = useRef(null);
  const megaRefs = useRef(new Map()); // catId -> .ms-mega

  // active pill on /products?category=...
  const { pathname, search } = useLocation();
  const activeCatId = pathname.startsWith('/products')
    ? Number(new URLSearchParams(search).get('category')) || null
    : null;

  // load top-level categories once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/filters');
        if (alive) setCats(Array.isArray(data?.categories) ? data.categories : []);
      } catch {
        if (alive) setCats([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // fetch subcategories (cached in state)
  const ensureSubsFor = useCallback(async (catId) => {
    if (!catId) return;
    const k = keyOf(catId);
    if (Array.isArray(subsByCat[k])) return;
    if (inflightRef.current.get(k)) return;

    inflightRef.current.set(k, true);
    setLoadingCatId(catId);
    try {
      const { data } = await api.get('/filters', { params: { categoryId: catId } });
      const raw = Array.isArray(data?.subcategories) ? data.subcategories : [];
      const normalized = raw
        .map(s => ({
          id: s.id ?? s.subcategory_id ?? s.sub_id ?? s.subCategoryId,
          name: s.name ?? s.title ?? s.label
        }))
        .filter(s => s.id != null && String(s.name || '').trim().length > 0)
        .sort((a,b) => String(a.name).localeCompare(String(b.name)));
      setSubsByCat(prev => ({ ...prev, [k]: normalized }));
    } catch {
      setSubsByCat(prev => ({ ...prev, [k]: [] }));
    } finally {
      inflightRef.current.delete(k);
      setLoadingCatId(null);
    }
  }, [subsByCat]);

  // ⬇️ PRELOAD: after categories load, fetch all subcats once (small concurrency)
  useEffect(() => {
    if (!Array.isArray(cats) || cats.length === 0) return;

    let cancelled = false;
    const ids = cats.map(c => Number(c.id)).filter(Number.isFinite);
    const queue = ids.filter(id => {
      const k = keyOf(id);
      return !Array.isArray(subsByCat[k]) && !inflightRef.current.get(k);
    });
    if (queue.length === 0) return;

    const CONCURRENCY = 4;
    let idx = 0;

    const runNext = async () => {
      if (cancelled) return;
      const myIdx = idx++;
      const catId = queue[myIdx];
      if (catId == null) return;
      await ensureSubsFor(catId);
      if (idx < queue.length && !cancelled) await runNext();
    };

    const starters = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => runNext());
    Promise.allSettled(starters);
    return () => { cancelled = true; };
  }, [cats, subsByCat, ensureSubsFor]);

  // open / close
  const onEnter = useCallback(async (id) => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    setOpenCatId(id);
    // If a category slipped through preload (or categories changed), fetch once on first hover.
    await ensureSubsFor(id);
  }, [ensureSubsFor]);

  const onLeave = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => setOpenCatId(null), 60);
  }, []);

  // recalc columns & alignment after open / resize / data change
  const recalcFor = useCallback((id) => {
    const mega = megaRefs.current.get(id);
    if (!mega) return;
    const card = mega.querySelector('.ms-mega-card');
    if (!card) return;

    const count = mega.querySelectorAll('.ms-mega-item').length;
    const cols = Math.min(3, Math.max(1, Math.ceil(count / 7)));
    card.style.setProperty('--cols', String(cols));
    const rows = Math.max(1, Math.ceil(count / cols));
    card.style.setProperty('--rows', String(rows));

    const vw = window.innerWidth;
    const pad = 12;
    const host = mega.parentElement; // .ms-cat
    const pillLeft = host?.getBoundingClientRect().left ?? 0;

    const prevDisp = mega.style.display;
    const prevVis = mega.style.visibility;
    mega.style.display = 'block';
    mega.style.visibility = 'hidden';
    const desired = card.scrollWidth || 0;
    mega.style.display = prevDisp || '';
    mega.style.visibility = prevVis || '';

    mega.dataset.align = (pillLeft + desired > vw - pad) ? 'end' : 'start';
  }, []);

  useEffect(() => {
    if (openCatId == null) return;
    const raf = requestAnimationFrame(() => recalcFor(openCatId));
    const onResize = () => recalcFor(openCatId);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [openCatId, subsByCat, recalcFor]);

  return (
    <nav className="ms-subnav" aria-label="Category navigation">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 row">
        {cats.map(c => {
          const subs = subsByCat[keyOf(c.id)];
          const isOpen = openCatId === c.id;
          const isLoading = loadingCatId === c.id;

          return (
            <div
              key={c.id}
              className="ms-cat"
              data-open={isOpen ? '1' : '0'}
              onMouseEnter={() => onEnter(c.id)}
              onMouseLeave={onLeave}
              onFocus={() => onEnter(c.id)}
              onBlur={onLeave}
              tabIndex={0}
            >
              <Link
                to={`/products?category=${c.id}`}
                className={`ms-pill ${activeCatId === c.id ? 'is-active' : ''}`}
                aria-expanded={isOpen ? 'true' : 'false'}
              >
                {c.name}
              </Link>

              {isOpen && (
                <div
                  className="ms-mega is-open"
                  ref={(el) => {
                    if (el) megaRefs.current.set(c.id, el);
                    else megaRefs.current.delete(c.id);
                  }}
                >
                  <div className="ms-mega-card">
                    <div className="ms-mega-title">{String(c.name || '').toUpperCase()}</div>
                    <div className="ms-mega-grid">
                      {subs === undefined && isLoading && (
                        <div className="ms-mega-item" style={{ opacity: 0.7 }}>Loading…</div>
                      )}

                      {Array.isArray(subs) && subs.length === 0 && !isLoading && (
                        <div className="ms-mega-item" style={{ opacity: 0.7 }}>No subcategories</div>
                      )}

                      {Array.isArray(subs) && subs.length > 0 &&
                        subs.map(s => (
                          <Link
                            key={s.id}
                            to={`/products?category=${c.id}&subcategory=${s.id}`}
                            className="ms-mega-item"
                          >
                            {s.name}
                          </Link>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
