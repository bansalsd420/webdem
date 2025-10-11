import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom'

import { getLocations, getLocationId, setLocationId } from '../../utils/locations';;
import { ShoppingCart, Heart, Sun, Moon, MapPin, Search, X, Menu, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api/axios.js';
import { useSelector } from 'react-redux';
import { useAuth } from '../../state/auth.jsx';
import MiniCart from '../MiniCart/MiniCart.jsx';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import '../../styles/navbar.css';
import { useSideNav } from '../../layouts/SideNavContext.jsx';


const suggestionsBox = { hidden: { opacity: 0, y: -6 }, visible: { opacity: 1, y: 0 } };


export default function Navbar() {
  const { toggle, closeSideNav } = useSideNav();
  const navigate = useNavigate();
  const route = useLocation();

  // ---------- Auth session (via provider) ----------
  const { user, loading: authLoading } = useAuth() || {};

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
  const [activeIdx, setActiveIdx] = useState(-1);

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
        const arr = Array.isArray(data) ? data : [];
        setSuggestions(arr);
        setActiveIdx(-1);
        setOpenSug(arr.length > 0);
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
      // prevent page scroll when navigating suggestions
      if (openSug && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, []);
  useEffect(() => { setOpenSug(false); setLocOpen(false); setAuthOpen(false); }, [route.pathname, route.search]);



  // ---------- Location picker (no "All") ----------
  // ---------- Location picker (read from central store; no “All”) ----------
  const [locOpen, setLocOpen] = useState(false);
  const [locations, setLocations] = useState(() => getLocations());
  const [selectedLocId, setSelectedLocId] = useState(() => getLocationId());
  const selectedLocName =
    (locations.find((l) => Number(l.id) === Number(selectedLocId))?.name) || '';

  // stay in sync with store updates (emitted by bootstrapLocations & setLocationId)
  useEffect(() => {
    const onChange = () => {
      setLocations(getLocations());
      setSelectedLocId(getLocationId());
    };
    window.addEventListener('location:changed', onChange);
    // pick up the first load too
    onChange();
    return () => window.removeEventListener('location:changed', onChange);
  }, []);

  const pickLocation = (l) => {
    setLocationId(l.id);       // persists + broadcasts + updates everyone
    setLocOpen(false);
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
  const url = `/products?${sp.toString()}`;
  // debug logging removed
  navigate(url);
  };
  const clearSearch = () => { setQ(''); setSuggestions([]); setOpenSug(false); inputRef.current?.focus(); };

  // suggestion keyboard navigation
  const handleSugKeyDown = (e) => {
    if (!openSug || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      setActiveIdx(i => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      setActiveIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        const s = suggestions[activeIdx];
        if (s.type === 'product') navigate(`/products/${s.id}`);
        else if (s.type === 'category') {
          const sp = new URLSearchParams({ category: String(s.id), page: '1' });
          if (selectedLocId != null) sp.set('location', String(selectedLocId));
          // debug logging removed
          navigate(`/products?${sp.toString()}`);
        } else if (s.type === 'brand') {
          const sp = new URLSearchParams({ brand: String(s.id), page: '1' });
          if (selectedLocId != null) sp.set('location', String(selectedLocId));
          // debug logging removed
          navigate(`/products?${sp.toString()}`);
        } else {
          const sp = new URLSearchParams({ q: String(s.label || ''), page: '1' });
          if (selectedLocId != null) sp.set('location', String(selectedLocId));
          // debug logging removed
          navigate(`/products?${sp.toString()}`);
        }
        setOpenSug(false);
      } else {
        submitSearch();
      }
    }
  };

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

        <Link to="/" className="brand">
          <img src={import.meta.env.VITE_MOJISTORE_LOGO_URL || '/placeholder.jpg'} alt="Moji Store" className="brand-logo" />
        </Link>

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
                {locations.length === 0 && (
                  <div className="menu-item" aria-disabled="true">Loading…</div>
                )}
                {locations.map((l) => (
                  <button key={String(l.id)} className="menu-item" onClick={() => pickLocation(l)}>
                    <span>{l.name}</span>
                    {l.id === selectedLocId && <span>✓</span>}
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
            onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); handleSugKeyDown(e); }}
            role="combobox"
            aria-expanded={openSug}
            aria-autocomplete="list"
            aria-controls="nav-suggest-list"
          />
          {q && (
            <button className="search-clear" aria-label="Clear search" onClick={clearSearch}>
              <X size={16} />
            </button>
          )}

          <AnimatePresence>
            {openSug && suggestions.length > 0 && (
              <motion.div className="suggest" variants={suggestionsBox} initial="hidden" animate="visible" exit="hidden">
                <div id="nav-suggest-list" role="listbox">
                {suggestions.map((s, idx) => (
                  <button
                    key={`${s.type}:${s.id}:${idx}`}
                    type="button"
                    className={`item sug-grid ${idx === activeIdx ? 'sug-active' : ''}`}
                    role="option"
                    aria-selected={idx === activeIdx}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIdx(idx)}
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ flex: 1 }} />

        <Link to="/products?page=1" className="pill">Products</Link>

        {/* Auth area */}
        {authLoading && (
          <div className="pill skel skel-bar" style={{ width: 90 }} aria-hidden />
        )}

        {!authLoading && !user && (
          <div className="relative" ref={authRef}>
            <button className="pill" onClick={() => setAuthOpen(v => !v)} aria-haspopup="menu" aria-expanded={authOpen ? 'true' : 'false'} title="Login or Register">
              <LogIn size={18} />
              <span style={{ marginLeft: 6 }}>Login</span>
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

        {!authLoading && user && (
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
