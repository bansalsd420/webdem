// src/App.jsx
import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './layouts/Layout.jsx';
import './pages/Account/account.css'; // <-- add this so the skeleton styles apply

// Auth pages
import Login from './pages/Auth/Login.jsx';
import Register from './pages/Auth/Register.jsx';
import ResetPassword from './pages/Auth/ResetPassword.jsx';

// Global state
import { FiltersProvider } from './state/filtersStore';
import TestPanel from './pages/Test.jsx';
// Account tabs
import Account from './pages/Account/Account.jsx';
import Profile from './pages/Account/tabs/Profile.jsx';
import Orders from './pages/Account/tabs/Orders.jsx';
import Invoices from './pages/Account/tabs/Invoices.jsx';
import Payments from './pages/Account/tabs/Payments.jsx';
import Ledger from './pages/Account/tabs/Ledger.jsx';
import Addresses from './pages/Account/tabs/Addresses.jsx';
import Documents from './pages/Account/tabs/Documents.jsx';

// Shared
import ScrollToTop from './components/ScrollToTop.jsx';

// Pages
import Home from './pages/Home/Home.jsx';
import Products from './pages/Products/Products.jsx';
import ProductDetail from './pages/ProductDetail/ProductDetail.jsx';
import CartPage from './pages/Cart/CartPage.jsx';
import WishlistPage from './pages/Wishlist/WishlistPage.jsx';
import Checkout from './pages/Checkout/Checkout.jsx';
import OrderComplete from './pages/OrderComplete/OrderComplete.jsx';
import About from './pages/Company/About.jsx';
import Contact from './pages/Company/Contact.jsx';
import FAQ from './pages/Company/FAQ.jsx';
import ShippingPolicy from './pages/Company/ShippingPolicy.jsx';
import ReturnsRefunds from './pages/Company/ReturnsRefunds.jsx';
import TermsPrivacy from './pages/Company/TermsPrivacy.jsx';

import api from './api/axios.js';
import { useAuth } from './state/auth.jsx';

/** Account-shaped skeleton so the page never collapses while checking auth */
function AccountSkeleton() {
  return (
    <div className="account-page account-root">
      <header className="account-header">
        <h1 className="account-title">Hi, there</h1>
        <nav className="account-tabs">
          <span className="skel skel-bar" style={{ width: 72 }} />
          <span className="skel skel-bar" style={{ width: 72 }} />
          <span className="skel skel-bar" style={{ width: 98 }} />
          <span className="skel skel-bar" style={{ width: 96 }} />
          <span className="skel skel-bar" style={{ width: 88 }} />
          <span className="skel skel-bar" style={{ width: 72 }} />
        </nav>
      </header>
      <div className="account-grid">
        <section className="account-content">
          <div className="summary-grid">
            <div className="summary-card skel skel-tile" />
            <div className="summary-card skel skel-tile" />
            <div className="summary-card skel skel-tile" />
            <div className="summary-card skel skel-tile" />
            <div className="summary-card skel skel-tile" />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Don’t redirect until cookie session is probed once */
function RequireAuth({ children }) {
  const { user } = (typeof useAuth === 'function' ? useAuth() : { user: null });
  const loc = useLocation();

  const [state, setState] = useState(user ? 'ready' : 'checking');

  useEffect(() => {
    let alive = true;
    if (user) {
      setState('ready');
      return () => { };
    }
    (async () => {
      try {
        const resp = await api.get('/account/me', {
          withCredentials: true,
          validateStatus: () => true,
        });
        if (!alive) return;
        setState(resp.status === 200 ? 'ready' : 'denied');
      } catch {
        if (alive) setState('denied');
      }
    })();
    return () => { alive = false; };
  }, [user]);

  if (state === 'checking') return <AccountSkeleton />; // <— previously `null`
  if (state === 'ready') return children;

  const next = encodeURIComponent(loc.pathname + loc.search);
  return <Navigate to={`/login?next=${next}`} replace />;
}

/** Hide /login, /register, /reset when already authenticated */
function RedirectIfAuthed({ children }) {
  const { user } = (typeof useAuth === 'function' ? useAuth() : { user: null });
  const [isAuthed, setIsAuthed] = useState(user ? true : null);

  useEffect(() => {
    let alive = true;
    if (user) {
      setIsAuthed(true);
      return () => { };
    }
    (async () => {
      try {
        const resp = await api.get('/account/me', {
          withCredentials: true,
          validateStatus: () => true,
        });
        if (!alive) return;
        setIsAuthed(resp.status === 200);
      } catch {
        if (alive) setIsAuthed(false);
      }
    })();
    return () => { alive = false; };
  }, [user]);

  if (isAuthed === null) return null;
  if (isAuthed === true) return <Navigate to="/account?tab=profile" replace />; // landing -> Profile
  return children;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <FiltersProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Public */}
            <Route index element={<Home />} />
            <Route path="products" element={<Products />} />
            <Route path="products/:id" element={<ProductDetail />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="order-complete" element={<OrderComplete />} />

            {/* Auth – hidden if already signed in */}
            <Route path="login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
            <Route path="register" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
            <Route path="reset" element={<RedirectIfAuthed><ResetPassword /></RedirectIfAuthed>} />
            // in your App.jsx / router file
            <Route path="/__test" element={<TestPanel />} />

            {/* Company / Legal */}
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
            <Route path="faq" element={<FAQ />} />
            <Route path="shipping" element={<ShippingPolicy />} />
            <Route path="returns" element={<ReturnsRefunds />} />
            <Route path="terms" element={<TermsPrivacy />} />

            {/* Account (gated) */}
            <Route
              path="account"
              element={
                <RequireAuth>
                  <Account />
                </RequireAuth>
              }
            >
              <Route index element={<Profile />} />
              <Route path="profile" element={<Profile />} />
              <Route path="orders" element={<Orders />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="payments" element={<Payments />} />
              <Route path="ledger" element={<Ledger />} />
              <Route path="addresses" element={<Addresses />} />
              <Route path="documents" element={<Documents />} />
              <Route path="*" element={<Navigate to="." replace />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </FiltersProvider>
    </>
  );
}
