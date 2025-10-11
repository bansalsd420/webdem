import { useEffect } from 'react';
import './HomeModals.css';

export function Modal({ children, onClose, className = '', theme = 'light' }) {
  // lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className={`hm-overlay hm-${theme}`} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`hm-dialog hm-${theme} ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="hm-body">{children}</div>
      </div>
    </div>
  );
}

export function AgeModal({ companyName, companyLogo, onAccept, onUnderage, visible }) {
  if (!visible) return null;
  return (
    <Modal onClose={onUnderage} theme="light" className="hm-age-dialog">
      <div className="hm-age">
        {companyLogo ? (
          <div className="hm-brand-logo"><img src={companyLogo} alt={companyName} /></div>
        ) : (
          <div className="hm-brand-name">{companyName}</div>
        )}
        <div className="hm-divider" />
        <h3 className="hm-title">Age Verification</h3>
        <p className="hm-copy">You must be 21 years of age or older to view this website. By entering this website, you agree that you are 21 years of age or older. Falsifying your age for the purpose of purchasing products from this web site is illegal and punishable by law.</p>
        <div className="hm-actions">
          <button className="hm-btn hm-btn-danger hm-btn-wide" onClick={onAccept}>ENTER</button>
          <button className="hm-btn hm-btn-danger hm-btn-wide" onClick={onUnderage}>UNDERAGE</button>
        </div>
      </div>
    </Modal>
  );
}

export function BroadcastModal({ broadcast, onClose, visible }) {
  if (!visible || !broadcast) return null;
  // Format body: if no HTML tags, treat as plain text and support real newlines, "\\n" and literal "/n" as line breaks
  const raw = String(broadcast.body || '');
  let txt = raw.replace(/\r\n?/g, '\n');         // CRLF/CR -> LF
  txt = txt.replace(/\\n/g, '\n');               // literal backslash-n -> LF
  txt = txt.replace(/\/[nN]/g, '\n');            // literal "/n" -> LF
  const looksHtml = /<[^>]+>/.test(txt);
  const esc = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const html = looksHtml ? txt : esc(txt).replace(/\n/g, '<br />');
  return (
    <Modal onClose={onClose} theme="light" className="hm-broadcast-dialog">
      <h3 className="hm-title">{broadcast.title}</h3>
      <div className="hm-broadcast" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="hm-actions" style={{marginTop: 18}}>
        <button className="hm-btn hm-btn-danger hm-btn-wide" onClick={onClose}>OKAY</button>
      </div>
    </Modal>
  );
}
