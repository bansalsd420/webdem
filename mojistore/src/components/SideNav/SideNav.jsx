import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios.js';
import { getLocations, getLocationId, setLocationId } from '../../utils/locations';
import { useAuth } from '../../state/auth.jsx';
import { useSelector } from 'react-redux';
import { useSideNav } from '../../layouts/SideNavContext.jsx';
import {
  Home, Package, User, ListOrdered, ReceiptText, Heart, ShoppingCart, LogIn, LogOut, MapPin
} from 'lucide-react';

function readStoredLocationId() {
  try {
    const a = localStorage.getItem('ms_location_id');
    const b = localStorage.getItem('locationId');
    const raw = a ?? b;
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export default function SideNav() {
  const { user } = useAuth();
  const isAuthed = !!user && (user.id || user.email || user.name);
  const cart = useSelector(s => s.cart);
  const cartQty = Array.isArray(cart?.items)
    ? cart.items.reduce((n, it) => n + (Number(it.qty) || 0), 0)
    : Number(cart?.total || cart?.count || 0);

  const { open, closeSideNav } = useSideNav();
  const loc = useLocation();
  const navigate = useNavigate();


  // Location picker state (mirror Navbar behavior)
  const [locOpen, setLocOpen] = useState(false);
  const [locations, setLocations] = useState(() => getLocations());
  const [selectedLocId, setSelectedLocId] = useState(() => getLocationId());
  const selectedLocName = (locations.find((l) => Number(l.id) === Number(selectedLocId))?.name) || '';

  useEffect(() => {
    const onChange = () => {
      setLocations(getLocations());
      setSelectedLocId(getLocationId());
    };
    window.addEventListener('location:changed', onChange);
    onChange();
    return () => window.removeEventListener('location:changed', onChange);
  }, []);

  const pickLocation = (l) => {
    setLocationId(l.id);
    setLocOpen(false);
    try { closeSideNav(); } catch {}
  };

  // Close on route change when on small screens
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023.98px)').matches) closeSideNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname, loc.search]);

  const activeKey = useMemo(() => {
    const p = loc.pathname;
    const tab = new URLSearchParams(loc.search).get('tab') || '';
    if (p.startsWith('/account') && tab) return `account:${tab}`;
    if (p === '/' || p.startsWith('/home')) return 'home';
    if (p.startsWith('/products')) return 'products';
    if (p.startsWith('/wishlist')) return 'wishlist';
    if (p.startsWith('/cart')) return 'cart';
    if (p.startsWith('/login')) return 'login';
    return '';
  }, [loc]);

  const logout = async () => {
    try { await api.post('/auth/logout', null, { withCredentials: true }); } catch {}
    window.dispatchEvent(new CustomEvent('auth:logout'));
    navigate('/login', { replace: true });
  };

  // Build Products href preserving current location
  const productsHref = (() => {
    const id = readStoredLocationId();
    const sp = new URLSearchParams({ page: '1' });
    if (id != null) sp.set('location', String(id));
    return `/products?${sp.toString()}`;
  })();

  return (
    <aside className={`ms-sidenav ${open ? 'is-open' : ''}`} data-sidenav-panel aria-label="Main navigation">
      <div className="ms-sidenav-title">Menu</div>

      {/* Location picker (same behaviour as Navbar) */}
      <div className="ms-sidenav-loc">
        <button className="item loc-pill" onClick={() => setLocOpen((v) => !v)} aria-haspopup="menu" aria-expanded={locOpen ? 'true' : 'false'}>
          <MapPin size={16} /> <span>{selectedLocName || 'Select location'}</span>
        </button>
        {locOpen && (
          <div className="loc-menu">
            {locations.length === 0 && <div className="loc-item">Loading…</div>}
            {locations.map((l) => (
              <button key={String(l.id)} className="loc-item" onClick={() => pickLocation(l)}>
                <span>{l.name}</span>
                {l.id === selectedLocId && <span>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="ms-sidenav-list">
        <Link to="/" className={`item ${activeKey === 'home' ? 'active' : ''}`} onClick={closeSideNav}>
          <Home size={18} /> <span>Home</span>
        </Link>

        <Link to={productsHref} className={`item ${activeKey === 'products' ? 'active' : ''}`} onClick={closeSideNav}>
          <Package size={18} /> <span>Products</span>
        </Link>

        <Link to="/wishlist" className={`item ${activeKey === 'wishlist' ? 'active' : ''}`} onClick={closeSideNav}>
          <Heart size={18} /> <span>Wishlist</span>
        </Link>

        <Link to="/cart" className={`item ${activeKey === 'cart' ? 'active' : ''}`} onClick={closeSideNav}>
          <ShoppingCart size={18} />
          <span>Cart</span>
          {cartQty > 0 && <span className="cart-badge">{cartQty}</span>}
        </Link>

        {isAuthed ? (
          <>
            <Link
              to="/account?tab=profile"
              className={`item ${activeKey === 'account:profile' ? 'active' : ''}`}
              onClick={closeSideNav}
            >
              <User size={18} /> <span>Profile</span>
            </Link>

            <Link
              to="/account?tab=orders"
              className={`item ${activeKey === 'account:orders' ? 'active' : ''}`}
              onClick={closeSideNav}
            >
              <ListOrdered size={18} /> <span>Orders</span>
            </Link>

            <Link
              to="/account?tab=ledger"
              className={`item ${activeKey === 'account:ledger' ? 'active' : ''}`}
              onClick={closeSideNav}
            >
              <ReceiptText size={18} /> <span>Ledger</span>
            </Link>

            <button type="button" className="item danger" onClick={logout}>
              <LogOut size={18} /> <span>Logout</span>
            </button>
          </>
        ) : (
          <Link to="/login" className={`item ${activeKey === 'login' ? 'active' : ''}`} onClick={closeSideNav}>
            <LogIn size={18} /> <span>Login</span>
          </Link>
        )}
      </nav>
    </aside>
  );
}
