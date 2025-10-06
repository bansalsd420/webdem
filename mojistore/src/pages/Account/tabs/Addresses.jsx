// src/pages/Account/tabs/Addresses.jsx
import { useEffect, useMemo, useState } from 'react';
import axios from '../../../api/axios';

const CACHE = (window.__accountCache ||= {});
const KEY = 'account:addresses';
const TTL = 2 * 60 * 1000; // 2 minutes

function AddressCard({ a, skeleton = false }) {
  if (skeleton) {
    return (
      <article className="addr-card skeleton">
        <header className="addr-head">
          <div className="skel skel-title" />
        </header>
        <div className="skel skel-lines" />
      </article>
    );
  }
  return (
    <article className="addr-card">
      <header className="addr-head">
        <h3 className="addr-title">{a.type}</h3>
        {a.is_default ? <span className="addr-badge">Default</span> : null}
      </header>

      <dl className="addr-meta">
        {a.name ? (
          <>
            <dt>Contact</dt>
            <dd>{a.name}</dd>
          </>
        ) : null}
        {a.phone ? (
          <>
            <dt>Phone</dt>
            <dd>{a.phone}</dd>
          </>
        ) : null}
      </dl>

      <div className="addr-body" style={{ whiteSpace: 'pre-line' }}>
        {a.raw?.full || a.full || '—'}
      </div>
    </article>
  );
}

export default function Addresses() {
  const cached = CACHE[KEY];
  const [rows, setRows] = useState(Array.isArray(cached?.value) ? cached.value : []);
  const [loading, setLoading] = useState(!cached);
  const [err, setErr] = useState(null);

  const lastUpdatedText = useMemo(
    () => (cached?.t ? new Date(cached.t).toLocaleTimeString() : '—'),
    [cached?.t, rows.length]
  );

  async function fetchNow({ force = false } = {}) {
    const fresh = CACHE[KEY] && Date.now() - CACHE[KEY].t < TTL;
    if (fresh && !force) return;

    setErr(null);
    if (!CACHE[KEY]) setLoading(true);

    try {
      const r = await axios.get('/account/addresses', {
        withCredentials: true,
        validateStatus: () => true,
      });
      if (r.status !== 200) throw new Error('server_error');
      const list = Array.isArray(r.data) ? r.data : [];
      CACHE[KEY] = { t: Date.now(), value: list };
      setRows(list);
    } catch {
      setErr("Couldn't load addresses.");
      if (!CACHE[KEY]) setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!CACHE[KEY]) {
      fetchNow({ force: true });
      return;
    }
    const isStale = Date.now() - CACHE[KEY].t >= TTL;
    if (isStale) fetchNow({ force: true });
  }, []);

  return (
    <div className="addresses-wrap">
      <div className="flex items-center justify-between mb-2">
        <div className="addr-status">
          {err ? <span className="is-error">{err}</span> : `Updated: ${lastUpdatedText}`}
        </div>
        <button className="btn-slim" onClick={() => fetchNow({ force: true })}>
          Refresh
        </button>
      </div>

      {/* ONE loading state: show two skeleton cards instead of two “Loading…” blocks */}
      {loading ? (
        <div className="addr-grid">
          <AddressCard skeleton />
          <AddressCard skeleton />
        </div>
      ) : rows.length ? (
        <div className="addr-grid">
          {rows.map((a, i) => (
            <AddressCard key={`${a.type || 'addr'}-${i}`} a={a} />
          ))}
        </div>
      ) : (
        <div className="addr-status">No addresses on file yet.</div>
      )}
    </div>
  );
}
