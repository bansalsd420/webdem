/* src/pages/Company/ReturnsRefunds.jsx */
import { useEffect } from "react";
import "../../styles/static.css";

export default function ReturnsRefunds() {
  useEffect(() => { window.scrollTo(0,0); }, []);
  return (
    <div className="static-page">
      <div className="static-hero">
        <h1 className="static-title">Returns & Refunds</h1>
        <p className="static-sub">Our policy for returns, damages, and credits.</p>
      </div>

      <section className="static-section">
        <h2 className="static-head">Return Window</h2>
        <p className="static-text">Report issues within 3 days of delivery. Include photos and batch numbers where relevant.</p>
      </section>

      <section className="static-section">
        <h2 className="static-head">Eligibility</h2>
        <ul className="static-list">
          <li>Damaged or short-shipped items.</li>
          <li>Incorrect items received vs invoice.</li>
          <li>Expired goods (if applicable; batch-based).</li>
        </ul>
      </section>

      <section className="static-section">
        <h2 className="static-head">Refunds</h2>
        <p className="static-text">Approved cases are refunded to the original payment method or credited to your account ledger.</p>
      </section>
    </div>
  );
}
