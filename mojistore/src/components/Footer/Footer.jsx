/* src/components/Footer/Footer.jsx */
import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios.js";
import {
  Mail, Phone, MapPin, Twitter, Instagram, Facebook, Youtube, Shield, Truck, Clock
} from "lucide-react";
import "./footer.css";

/**
 * HardLink: always scrolls to top and forces a page reload.
 */
function HardLink({ to, children, className, title }) {
  return (
    <a
      href={to}
      title={title}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        window.location.assign(to);
      }}
    >
      {children}
    </a>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();

  const [brands, setBrands] = useState([]);
  const [settings, setSettings] = useState({
    email: "sales@mojistore.com",
    phone: "+1 (000) 000-0000",
    locations: "Phoenix • Seattle • Austin",
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ data: brandsData }, { data: settingsData }] = await Promise.all([
          api.get("/brands", { params: { limit: 4 } }),
          api.get("/cms/settings", {
            params: { keys: "company.support_email,company.support_phone,company.locations" },
          }),
        ]);
        if (!alive) return;

        setBrands(Array.isArray(brandsData) ? brandsData : []);
        const kv = Object.fromEntries((settingsData || []).map((r) => [r.k, r.v]));
        setSettings((prev) => ({
          email: kv["company.support_email"] || prev.email,
          phone: kv["company.support_phone"] || prev.phone,
          locations: kv["company.locations"] || prev.locations,
        }));
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const brandLinks = useMemo(
    () => (brands || []).slice(0, 4).map((b) => ({
      id: b.id,
      name: b.name,
      to: `/products?brand=${encodeURIComponent(b.id)}&page=1`,
    })),
    [brands]
  );

  return (
    <footer className="ms-footer">
      {/* Top neon accent */}
      <div className="msf-accent" />

      {/* Promo / CTA strip */}
      <div className="msf-cta">
        <div className="msf-cta-item">
          <Truck size={18} />
          <span>Fast wholesale delivery</span>
        </div>
        <div className="msf-cta-item">
          <Shield size={18} />
          <span>Secure payments</span>
        </div>
        <div className="msf-cta-item">
          <Clock size={18} />
          <span>24×7 order tracking</span>
        </div>
      </div>

      {/* Main grid */}
      <div className="msf-grid">
        {/* Brand / About */}
        <div className="msf-col">
          <div className="msf-brand">Moji Store</div>
          <p className="msf-desc">
            B2B wholesale platform for fast-moving consumer goods. Bulk pricing, live stock by
            location, and instant re-ordering.
          </p>

          {/* Social */}
          <div className="msf-social">
            <a href="#" aria-label="Twitter" className="msf-social-btn"><Twitter size={16} /></a>
            <a href="#" aria-label="Instagram" className="msf-social-btn"><Instagram size={16} /></a>
            <a href="#" aria-label="Facebook" className="msf-social-btn"><Facebook size={16} /></a>
            <a href="#" aria-label="YouTube" className="msf-social-btn"><Youtube size={16} /></a>
          </div>

          {/* Contact */}
          <div className="msf-contact">
            <a href={`mailto:${settings.email}`} className="msf-contact-row">
              <Mail size={16} /><span>{settings.email}</span>
            </a>
            <a href={`tel:${settings.phone}`} className="msf-contact-row">
              <Phone size={16} /><span>{settings.phone}</span>
            </a>
            <div className="msf-contact-row">
              <MapPin size={16} /><span>{settings.locations}</span>
            </div>
          </div>
        </div>

        {/* Shop (real brands) */}
        <div className="msf-col">
          <div className="msf-head">Shop</div>
          <nav className="msf-list">
            <HardLink to="/products?page=1" className="msf-link">All Products</HardLink>
            {brandLinks.length > 0 && <div className="msf-head mt-2">Brands</div>}
            {brandLinks.map((b) => (
              <HardLink key={b.id} to={b.to} className="msf-link">{b.name}</HardLink>
            ))}
            <HardLink to="/wishlist" className="msf-link">Wishlist</HardLink>
          </nav>
        </div>

        {/* Company pages */}
        <div className="msf-col">
          <div className="msf-head">Company</div>
          <nav className="msf-list">
            <HardLink to="/about" className="msf-link">About</HardLink>
            <HardLink to="/contact" className="msf-link">Contact</HardLink>
            <HardLink to="/faq" className="msf-link">FAQ</HardLink>
            <HardLink to="/shipping" className="msf-link">Shipping Policy</HardLink>
            <HardLink to="/returns" className="msf-link">Returns & Refunds</HardLink>
            <HardLink to="/terms" className="msf-link">Terms & Privacy</HardLink>
          </nav>
        </div>

        {/* Account */}
        <div className="msf-col">
          <div className="msf-head">Account</div>
          <nav className="msf-list">
            <HardLink to="/login" className="msf-link">Login</HardLink>
            <HardLink to="/account" className="msf-link">My Account</HardLink>
            <HardLink to="/account/orders" className="msf-link">Orders</HardLink>
            <HardLink to="/account/invoices" className="msf-link">Invoices</HardLink>
            <HardLink to="/cart" className="msf-link">Cart</HardLink>
          </nav>
        </div>
      </div>

      {/* Legal bar */}
      <div className="msf-legal">
        <div>© {year} Moji Store. All rights reserved.</div>
        <div className="msf-legal-links">
          <HardLink to="/terms" className="msf-mini">Terms</HardLink>
          <HardLink to="/terms#privacy" className="msf-mini">Privacy</HardLink>
          <HardLink to="/terms#cookies" className="msf-mini">Cookies</HardLink>
        </div>
      </div>
    </footer>
  );
}
