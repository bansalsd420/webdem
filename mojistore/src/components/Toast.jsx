import React, { useEffect, useState } from 'react';

export default function Toasts() {
  const [toasts, setToasts] = useState([]);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    const onToast = (e) => {
      const t = e?.detail || {};
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const timeout = typeof t.timeout === 'number' ? t.timeout : 2400;
      const item = { id, type: t.type || 'info', title: t.title || '', msg: t.msg || '' };
      setToasts((s) => [...s, item]);
      // Also politely announce the toast message for screen readers
      if (item.msg) {
        setAnnounce(item.msg);
      }
      setTimeout(() => {
        setToasts((s) => s.filter(x => x.id !== id));
      }, timeout);
    };

    const onAnn = (e) => {
      const m = e?.detail?.message || e?.detail?.msg || '';
      if (m) setAnnounce(m);
    };

    window.addEventListener('app:toast', onToast);
    window.addEventListener('app:announce', onAnn);
    return () => {
      window.removeEventListener('app:toast', onToast);
      window.removeEventListener('app:announce', onAnn);
    };
  }, []);

  useEffect(() => {
    if (!announce) return;
    const id = setTimeout(() => setAnnounce(''), 1500);
    return () => clearTimeout(id);
  }, [announce]);

  if (toasts.length === 0 && !announce) return null;
  return (
    <div aria-live="polite" aria-atomic="true">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type === 'success' ? 'success' : t.type === 'error' ? 'error' : ''}`} role="status">
          {t.title ? <div className="title">{t.title}</div> : null}
          <div className="msg">{t.msg}</div>
        </div>
      ))}

      {/* Hidden, screen-reader-only live region for explicit announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(1px, 1px, 1px, 1px)' }}
      >
        {announce}
      </div>
    </div>
  );
}
