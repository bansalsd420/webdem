/* src/pages/Company/TermsPrivacy.jsx */
import { useEffect } from "react";
import "../../styles/static.css";

export default function TermsPrivacy() {
  useEffect(() => { window.scrollTo(0,0); }, []);
  return (
    <div className="static-page">
      <div className="static-hero">
        <h1 className="static-title">Terms & Privacy</h1>
        <p className="static-sub">Legal terms governing Moji Store and how we protect your data.</p>
      </div>

      <section className="static-section" id="terms">
        <h2 className="static-head">Terms of Use</h2>
        <p className="static-text">By accessing or using Moji Store, you agree to be bound by these terms, including fair usage, anti-fraud checks, and compliance with taxation & invoicing norms.</p>
      </section>

      <section className="static-section" id="privacy">
        <h2 className="static-head">Privacy Policy</h2>
        <p className="static-text">We only collect data required to fulfill your orders, manage your account, and improve the service. We do not sell your personal data to third parties.</p>
      </section>

      <section className="static-section" id="cookies">
        <h2 className="static-head">Cookies</h2>
        <p className="static-text">We use strictly necessary and performance cookies (e.g. session, analytics). You may control cookies in your browser settings.</p>
      </section>
    </div>
  );
}
