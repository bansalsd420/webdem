import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, Heart, Sun, Moon, MapPin, Search, X, LogIn, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api/axios.js';
import { useSelector } from 'react-redux';
import { useAuth } from '../../state/auth.jsx';
import MiniCart from '../MiniCart/MiniCart.jsx';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import '../../styles/navbar.css';
import { useSideNav } from '../../layouts/SideNavContext.jsx';

const suggestionsBox = { hidden: { opacity: 0, y: -6 }, visible: { opacity: 1, y: 0 } };

/** helpers: read/write selected location consistently */
function getLocationParam(search) {
  try {
    const sp = new URLSearchParams(search || '');
    const raw = sp.get('location');
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}
function readStoredLocationId() {
  try {
    const keys = ['ms_location_id', 'locationId'];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw === 'null' || raw === 'undefined' || raw == null) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
      if (raw === '') return null; // explicit "All"
    }
  } catch {}
  return null;
}
function writeStoredLocation(id, name) {
  try {
    const val = id == null ? '' : String(id);
    localStorage.setItem('ms_location_id', val);
    localStorage.setItem('locationId', val);
    if (name != null) {
      localStorage.setItem('ms_location_name', name);
    }
  } catch {}
}
function broadcastLocation(id, name) {
  const detail = { id: id ?? null, name: name ?? '' };
  try {
    window.dispatchEvent(new CustomEvent('moji:location-change', { detail }));
    window.dispatchEvent(new CustomEvent('location:changed', { detail }));
  } catch {}
}

export default function Navbar() {
  const { toggle, closeSideNav } = useSideNav();
  const navigate = useNavigate();
  const route = useLocation();

  // ---------- Auth warmup to avoid "Login" flash ----------
  const { user } = useAuth() || {};
  const [sessionUser, setSessionUser] = useState(null);
  const [authKnown, setAuthKnown] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status, data } = await api.get('/account/me', {
          withCredentials: true,
          validateStatus: () => true,
        });
        if (!alive) return;
        if (status === 200) setSessionUser(data || {});
      } catch {
        /* ignore */
      } finally {
        if (alive) setAuthKnown(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // keep in sync with context when it arrives/changes
  useEffect(() => {
    if (user && !sessionUser) setSessionUser(user);
    if (!user && sessionUser) setSessionUser(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---------- Theme ----------
  const [theme, setTheme] = useState(() => (localStorage.getItem('theme') === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-instant');
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    requestAnimationFrame(() => root.classList.remove('theme-instant'));
  };
  const isLight = theme === 'light';

  // ---------- Cart badge ----------
  const cartState = useSelector((s) => s.cart);
  const cartQty = Array.isArray(cartState?.items)
    ? cartState.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0)
    : Number(cartState?.total || cartState?.count || 0);

  // ---------- Search + suggestions ----------
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 250);
  const [suggestions, setSuggestions] = useState([]);
  const [openSug, setOpenSug] = useState(false);
  const sugRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      const term = (dq || '').trim();
      if (!term) {
        if (alive) setSuggestions([]);
        return;
      }
      try {
        const { data } = await api.get('/search/suggest', {
          params: { q: term },
          withCredentials: true,
          signal: ctrl.signal,
          validateStatus: () => true,
        });
        if (!alive) return;
        setSuggestions(Array.isArray(data) ? data : []);
        setOpenSug(true);
      } catch {
        if (alive) {
          setSuggestions([]);
          setOpenSug(false);
        }
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [dq]);

  // ---------- Close popovers on outside/route/esc ----------
  const locRef = useRef(null);
  const authRef = useRef(null);
  useEffect(() => {
    const onDoc = (e) => {
      if (sugRef.current && !sugRef.current.contains(e.target)) setOpenSug(false);
      if (locRef.current && !locRef.current.contains(e.target)) setLocOpen(false);
      if (authRef.current && !authRef.current.contains(e.target)) setAuthOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        setOpenSug(false); setLocOpen(false); setAuthOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, []);
  useEffect(() => { setOpenSug(false); setLocOpen(false); setAuthOpen(false); }, [route.pathname, route.search]);

  // ---------- Location picker ----------
  const [locOpen, setLocOpen] = useState(false);
  const [locations, setLocations] = useState([]);
  // initialize from URL (?location=) first, then storage
  const initialLocId = (() => {
    const fromUrl = getLocationParam(route.search);
    if (fromUrl !== null) return fromUrl;
    const stored = readStoredLocationId();
    return stored;
  })();
  const [selectedLocId, setSelectedLocId] = useState(initialLocId);
  const [selectedLocName, setSelectedLocName] = useState('All locations');

  // Load location list and sync selected name; react when query param changes
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/locations', { withCredentials: true, validateStatus: () => true });
        if (!alive) return;
        const listRaw = Array.isArray(data) ? data : [];
        // ensure "All locations" is available as first choice (id=null)
        const hasAll = listRaw.some(l => l && (l.id == null));
        const list = hasAll ? listRaw : [{ id: null, name: 'All locations' }, ...listRaw];
        setLocations(list);

        // Re-read current desired id (prefer URL)
        const urlId = getLocationParam(route.search);
        const wantId = urlId !== null ? urlId : selectedLocId;

        const match =
          list.find((l) => (wantId == null && l.id == null) || l.id === wantId) || list[0];
        setSelectedLocId(match?.id ?? null);
        setSelectedLocName(match?.name || 'All locations');

        // Normalize storage + broadcast once so listeners update
        writeStoredLocation(match?.id ?? null, match?.name || 'All locations');
        broadcastLocation(match?.id ?? null, match?.name || 'All locations');
      } catch {
        if (!alive) return;
        const fallback = [{ id: null, name: 'All locations' }];
        setLocations(fallback);
        setSelectedLocId(null);
        setSelectedLocName('All locations');
        writeStoredLocation(null, 'All locations');
        broadcastLocation(null, 'All locations');
      }
    })();
    return () => { alive = false; };
    // include route.search so changing ?location= syncs the picker
  }, [route.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickLocation = (l) => {
    // persist to both keys for compatibility
    writeStoredLocation(l.id ?? null, l.name);
    setSelectedLocId(l.id ?? null);
    setSelectedLocName(l.name);
    setLocOpen(false);

    // Update URL ?location= (preserve other params)
    const sp = new URLSearchParams(route.search || '');
    if (l.id == null) sp.delete('location');
    else sp.set('location', String(l.id));
    navigate({ pathname: route.pathname, search: `?${sp.toString()}` }, { replace: true });

    // Notify listeners (Products page, PDP, etc.)
    broadcastLocation(l.id ?? null, l.name);
  };

  // ---------- Auth menu ----------
  const [authOpen, setAuthOpen] = useState(false);

  // ---------- Search handlers ----------
  const submitSearch = () => {
    const term = (q || '').trim();
    const sp = new URLSearchParams();
    if (term) sp.set('q', term);
    sp.set('page', '1');
    // preserve current location selection in URL
    if (selectedLocId != null) sp.set('location', String(selectedLocId));
    navigate(`/products?${sp.toString()}`);
  };
  const clearSearch = () => { setQ(''); setSuggestions([]); setOpenSug(false); inputRef.current?.focus(); };

  const wishFill = route.pathname.startsWith('/wishlist')
    ? (isLight ? '#e11d48' : '#ffffff')
    : 'none';

  // MiniCart
  const [showMiniCart, setShowMiniCart] = useState(false);

  // ------------------ RENDER ------------------
  return (
    <header className="ms-nav">
      <div className="row max-w-7xl mx-auto px-3 sm:px-6">
        <button className="pill btn-icon hamburger" aria-label="Menu" onClick={toggle} data-sidenav-ignore>
          <Menu size={18} />
        </button>

        <Link to="/" className="brand">Moji Store</Link>

        <div className="relative loc-wrap" ref={locRef}>
          <button
            className="pill"
            onClick={() => setLocOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={locOpen ? 'true' : 'false'}
            title="Choose store location"
          >
            <MapPin size={18} />
            <span className="hidden sm:inline">{selectedLocName}</span>
          </button>
          {locOpen && (
            <div className="menu">
              <div className="menu-list">
                {locations.map((l) => (
                  <button key={String(l.id)} className="menu-item" onClick={() => pickLocation(l)}>
                    <span>{l.name}</span>
                    {((selectedLocId == null && l.id == null) || l.id === selectedLocId) && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="search-wrap" ref={sugRef}>
          <button type="button" className="search-ico" aria-label="Search" onClick={submitSearch}>
            <Search size={18} />
          </button>
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search for products…"
            value={q}
            onFocus={() => setOpenSug(true)}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
          />
          {q && (
            <button className="search-clear" aria-label="Clear search" onClick={clearSearch}>
              <X size={16} />
            </button>
          )}

          <AnimatePresence>
            {openSug && suggestions.length > 0 && (
              <motion.div className="suggest" variants={suggestionsBox} initial="hidden" animate="visible" exit="hidden">
                {suggestions.map((s) => (
                  <button
                    key={`${s.type}:${s.id}`}
                    type="button"
                    className="item sug-grid"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (s.type === 'product') navigate(`/products/${s.id}`);
                      else if (s.type === 'category') {
                        const sp = new URLSearchParams({ category: String(s.id), page: '1' });
                        if (selectedLocId != null) sp.set('location', String(selectedLocId));
                        navigate(`/products?${sp.toString()}`);
                      } else if (s.type === 'brand') {
                        const sp = new URLSearchParams({ brand: String(s.id), page: '1' });
                        if (selectedLocId != null) sp.set('location', String(selectedLocId));
                        navigate(`/products?${sp.toString()}`);
                      } else {
                        const sp = new URLSearchParams({ q: String(s.label || ''), page: '1' });
                        if (selectedLocId != null) sp.set('location', String(selectedLocId));
                        navigate(`/products?${sp.toString()}`);
                      }
                      setOpenSug(false);
                    }}
                  >
                    {s.thumbUrl ? (
                      <img className="sug-thumb" src={s.thumbUrl} alt="" loading="eager" decoding="async" />
                    ) : (
                      <div className="sug-thumb sug-thumb--empty" aria-hidden="true" />
                    )}
                    <span className="sug-text">{s.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ flex: 1 }} />

        <Link to="/products?page=1" className="pill">Products</Link>

        {/* Auth button: render nothing until we know session state */}
        {authKnown && !(user || sessionUser) && (
          <div className="relative" ref={authRef}>
            <button className="pill" onClick={() => setAuthOpen(v => !v)} aria-haspopup="menu" aria-expanded={authOpen ? 'true' : 'false'}>
              <LogIn size={18} /> <span className="hidden sm:inline">Login</span>
            </button>
            {authOpen && (
              <div className="menu">
                <div className="menu-list">
                  <Link to="/login" className="menu-item" onClick={() => setAuthOpen(false)}>Login</Link>
                  <Link to="/register" className="menu-item" onClick={() => setAuthOpen(false)}>Register</Link>
                </div>
              </div>
            )}
          </div>
        )}

        {authKnown && (user || sessionUser) && (
          <div className="relative" ref={authRef}>
            <button className="pill" onClick={() => setAuthOpen(v => !v)} aria-haspopup="menu" aria-expanded={authOpen ? 'true' : 'false'} title="My Account">
              My Account
            </button>
            {authOpen && (
              <div className="menu">
                <div className="menu-list">
                  <Link to="/account?tab=profile" className="menu-item" onClick={() => setAuthOpen(false)}>Profile</Link>
                  <Link to="/account?tab=orders" className="menu-item" onClick={() => setAuthOpen(false)}>Orders</Link>
                  <Link to="/account?tab=ledger" className="menu-item" onClick={() => setAuthOpen(false)}>Ledger</Link>
                  <button
                    type="button"
                    className="menu-item"
                    data-sidenav-ignore
                    onClick={async () => {
                      setAuthOpen(false);
                      try { await api.post('/auth/logout', null, { withCredentials: true }); } catch { /* ignore */ }
                      window.dispatchEvent(new CustomEvent('auth:logout'));
                      try { closeSideNav?.(); } catch { /* ignore */ }
                      navigate('/login', { replace: true });
                    }}
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <Link to="/wishlist" className="pill btn-icon wish" aria-label="Wishlist">
          <Heart size={18} color={isLight ? '#111827' : '#ffffff'} fill={wishFill} />
        </Link>

        <button className="pill btn-icon relative" onClick={() => setShowMiniCart(true)} aria-label="Open cart">
          <ShoppingCart size={18} />
          {cartQty > 0 && <span className="badge">{cartQty}</span>}
        </button>

        <button className="pill btn-icon" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}
        </button>
      </div>

      {showMiniCart && <MiniCart onClose={() => setShowMiniCart(false)} />}
    </header>
  );
}
