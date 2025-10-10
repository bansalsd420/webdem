import { useEffect, useState } from 'react';
import './HomeModals.css';

function Overlay({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ms-modal-overlay" role="dialog" aria-modal="true">
      <div className="ms-modal">
        {children}
      </div>
    </div>
  );
}

export function AgeModal({ companyName, onAccept, onUnderage, visible }) {
  if (!visible) return null;
  return (
    <Overlay onClose={onUnderage}>
      <header className="ms-modal-header">
        {/* prefer a static public logo when available */}
        <img src="/placeholder.jpg" alt={companyName} className="ms-modal-logo" />
        <h2 className="ms-modal-title">Age Verification</h2>
        <div className="ms-modal-divider" />
      </header>
      <section className="ms-modal-body">
        <p>
          You must be 21 years of age or older to view this website. By entering this website,
          you confirm that you are at least 21 years old. Falsifying your age is unlawful.
        </p>
      </section>
      <footer className="ms-modal-footer">
        <button className="ms-btn ms-btn-ghost" onClick={onUnderage}>I'm under 21</button>
        <button className="ms-btn ms-btn-primary" onClick={onAccept}>Enter site</button>
      </footer>
    </Overlay>
  );
}

export function BroadcastModal({ broadcast, onClose, visible }) {
  if (!visible || !broadcast) return null;
  return (
    <Overlay onClose={onClose}>
      <header className="ms-modal-header">
        <img src="/placeholder.jpg" alt="logo" className="ms-modal-logo" />
        <h2 className="ms-modal-title">{broadcast.title || 'Announcement'}</h2>
        <div className="ms-modal-divider" />
      </header>
      <section className="ms-modal-body">
        <div className="ms-broadcast-body" dangerouslySetInnerHTML={{ __html: broadcast.body || '' }} />
      </section>
      <footer className="ms-modal-footer">
        <button className="ms-btn ms-btn-primary" onClick={onClose}>Close</button>
      </footer>
    </Overlay>
  );
}
