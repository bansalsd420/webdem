/* src/pages/Company/ShippingPolicy.jsx */
import { useEffect } from "react";
import "../../styles/static.css";

export default function ShippingPolicy() {
  useEffect(() => { window.scrollTo(0,0); }, []);
  return (
    <div className="static-page">
      <div className="static-hero">
        <h1 className="static-title">Shipping Policy</h1>
        <p className="static-sub">How we pick, pack, and ship your B2B orders.</p>
      </div>

      <section className="static-section">
        <h2 className="static-head">Processing Times</h2>
        <p className="static-text">Orders placed before 2:00 PM local time are typically processed the same day. Orders after cut-off are processed next business day.</p>
      </section>

      <section className="static-section">
        <h2 className="static-head">Shipping Methods</h2>
        <ul className="static-list">
          <li>Surface cargo for bulk shipments within region.</li>
          <li>Air express for urgent small-volume orders (additional charges apply).</li>
          <li>Free delivery thresholds may apply by location.</li>
        </ul>
      </section>

      <section className="static-section">
        <h2 className="static-head">Tracking</h2>
        <p className="static-text">You’ll receive tracking updates once your order leaves the warehouse. Track orders from <span className="static-kbd">My Account → Orders</span>.</p>
      </section>
    </div>
  );
}
