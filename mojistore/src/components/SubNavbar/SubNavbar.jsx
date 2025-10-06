/* src/components/SubNavbar/SubNavbar.jsx
   Preload all subcategories once (concurrency-limited), no browser storage.
   Hover never refetches once a category's subs are loaded.

   Features kept:
   - First-row collapse/expand with overflow detection (ResizeObserver).
   - ▼/▲ toggle button that appears only when pills wrap to a 2nd row.
   - Exact clamp edge + "is-below" tagging so hidden pills never show/steal hover.
   - data-single="1" when all categories fit on one line (for even spacing).
*/
import { Link, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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

  // ---- collapse/expand for the pill row
  const rowRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [firstRowH, setFirstRowH] = useState(0);        // height of row-1 + visual gap
  const [firstRowTop, setFirstRowTop] = useState(0);    // offsetTop of first row (container-relative)
  const [firstRowEdge, setFirstRowEdge] = useState(0);  // bottom of row-1 + row-gap (exact clamp)

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
    if (Array.isArray(subsByCat[k]) || inflightRef.current.get(k)) return;
    inflightRef.current.set(k, true);
    setLoadingCatId(catId);
    try {
      const { data } = await api.get('/filters', { params: { categoryId: catId } });
      const raw = Array.isArray(data?.subcategories) ? data.subcategories : [];
      const normalized = raw
        .map((s) => ({
          id: s.id ?? s.subcategory_id ?? s.sub_id ?? s.subCategoryId,
          name: s.name ?? s.title ?? s.label,
        }))
        .filter((s) => s.id != null && String(s.name || '').trim().length > 0)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setSubsByCat((prev) => ({ ...prev, [k]: normalized }));
    } catch {
      setSubsByCat((prev) => ({ ...prev, [k]: [] }));
    } finally {
      inflightRef.current.delete(k);
      setLoadingCatId(null);
    }
  }, [subsByCat]);

  // preload subcats (small concurrency)
  useEffect(() => {
    if (!Array.isArray(cats) || cats.length === 0) return;
    let cancelled = false;
    const ids = cats.map((c) => Number(c.id)).filter(Number.isFinite);
    const queue = ids.filter((id) => {
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
    mega.dataset.align = pillLeft + desired > vw - pad ? 'end' : 'start';
  }, []);

  useEffect(() => {
    if (openCatId == null) return;
    const raf = requestAnimationFrame(() => recalcFor(openCatId));
    const onResize = () => recalcFor(openCatId);
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [openCatId, subsByCat, recalcFor]);

  // detect overflow (whether pills wrap to a 2nd row) and compute exact clamp edge
  const measureOverflow = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;

    const items = Array.from(row.querySelectorAll('.ms-cat'));
    if (items.length === 0) {
      setHasOverflow(false);
      setFirstRowH(0);
      setFirstRowTop(0);
      setFirstRowEdge(0);
      return;
    }

    const top0 = Math.min(...items.map((el) => el.offsetTop));
    let firstRowBottom = 0;
    let maxTop = top0;

    for (const el of items) {
      const t = el.offsetTop;
      if (t > maxTop) maxTop = t;
      if (t === top0) {
        const h = el.offsetHeight;
        const bottom = t + h;
        if (bottom > firstRowBottom) firstRowBottom = bottom;
      }
    }

    const styles = getComputedStyle(row);
    const rowGap = parseFloat(styles.rowGap || '0') || 0;

    const overflow = maxTop > top0;
    setHasOverflow(overflow);

    const relTop = row.offsetTop || 0; // container-relative
    const firstRowHeight = Math.max(0, firstRowBottom - top0);
    const edge = firstRowHeight + rowGap; // bottom of row-1 + gap

    setFirstRowTop(top0 - relTop);
    setFirstRowH(firstRowHeight + rowGap);
    setFirstRowEdge(edge);
  }, []);

  // Observe the row for size changes (initial + whenever content wraps)
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(() => measureOverflow());
    ro.observe(row);
    const id = requestAnimationFrame(measureOverflow);
    return () => { ro.disconnect(); cancelAnimationFrame(id); };
  }, [cats, measureOverflow]);

  // Re-measure on viewport resize/zoom so clamp & "is-below" stay correct
  useEffect(() => {
    const onResize = () => {
      requestAnimationFrame(measureOverflow);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureOverflow]);

  // mark 2nd+ row items when collapsed so CSS can fully hide/disable them
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const collapsed = !expanded && hasOverflow;
    const items = Array.from(row.querySelectorAll('.ms-cat'));
    for (const el of items) {
      // compare against first row top in the same coordinate space
      const isBelow = el.offsetTop > (row.offsetTop + firstRowTop);
      if (collapsed && isBelow) el.classList.add('is-below');
      else el.classList.remove('is-below');
    }
  }, [expanded, hasOverflow, firstRowTop]);

  return (
    <nav className="ms-subnav" aria-label="Categories">
      <div
        className="row"
        ref={rowRef}
        data-collapsed={!expanded && hasOverflow ? '1' : '0'}
        data-single={!hasOverflow ? '1' : '0'}
        /* expose first-row metrics to CSS; used for clamp mask & arrow height */
        style={{
          ['--first-row-h']: `${firstRowH || 0}px`,
          ['--first-row-edge']: `${firstRowEdge || 0}px`,
        }}
      >
        {cats.map((c) => {
          const subs = subsByCat[keyOf(c.id)];
          const isOpen = openCatId === c.id;
          const isLoading = loadingCatId === c.id;
          const isActive = activeCatId === Number(c.id);

        return (
            <div key={c.id} className="ms-cat" onMouseEnter={() => onEnter(c.id)} onMouseLeave={onLeave}>
              <Link
                className={`ms-pill${isActive ? ' is-active' : ''}`}
                to={`/products?category=${c.id}&page=1`}
                onFocus={() => onEnter(c.id)}
                onBlur={onLeave}
              >
                {c.name}
              </Link>

              {isOpen && (
                <div
                  className="ms-mega"
                  ref={(el) => {
                    if (el) megaRefs.current.set(c.id, el);
                    else megaRefs.current.delete(c.id);
                  }}
                >
                  <div className="ms-mega-card">
                    <div className="ms-mega-title">{String(c.name || '').toUpperCase()}</div>
                    {subs === undefined && isLoading && <div className="ms-mega-grid">Loading…</div>}
                    {Array.isArray(subs) && subs.length === 0 && !isLoading && (
                      <div className="ms-mega-grid">No subcategories</div>
                    )}
                    {Array.isArray(subs) && subs.length > 0 && (
                      <div className="ms-mega-grid">
                        {subs.map((s) => (
                          <Link
                            key={s.id}
                            className="ms-mega-item"
                            to={`/products?category=${c.id}&sub=${s.id}&page=1`}
                          >
                            {s.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ▼ / ▲ toggle — only if there is overflow */}
        {hasOverflow && (
          <div className="ms-row-toggle" style={{ height: firstRowH ? `${firstRowH}px` : undefined }}>
            <button
              type="button"
              className="ms-row-toggle-btn"
              aria-expanded={expanded ? 'true' : 'false'}
              aria-label={expanded ? 'Collapse categories' : 'Show more categories'}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
