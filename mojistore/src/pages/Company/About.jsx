/* src/pages/Company/About.jsx */
import { useEffect } from "react";
import "../../styles/static.css";

export default function About() {
  useEffect(() => { window.scrollTo(0,0); }, []);
  return (
    <div className="static-page">
      <div className="static-hero">
        <h1 className="static-title">About Moji Store</h1>
        <p className="static-sub">
          We’re a B2B wholesale marketplace built for speed: location-aware stock, negotiated price groups, and one-click reordering.
        </p>
      </div>

      <section className="static-section">
        <h2 className="static-head">Our Promise</h2>
        <p className="static-text">
          Moji Store synchronizes live inventory per location so you only see what’s truly available. We honor your negotiated pricing
          with precise group logic and keep carts & wishlists consistent across devices and sessions.
        </p>
      </section>

      <section className="static-section">
        <h2 className="static-head">What makes us different</h2>
        <ul className="static-list">
          <li>Instant stock by warehouse/location, no surprises at checkout.</li>
          <li>Bulk & group pricing applied at the variant level.</li>
          <li>Guest flows that convert — carts and wishlists merge on login.</li>
          <li>Performance-first UI: image optimization, skeleton-first render.</li>
        </ul>
      </section>
    </div>
  );
}
