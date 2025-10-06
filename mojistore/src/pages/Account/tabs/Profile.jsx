// mojistore/src/pages/Account/tabs/Profile.jsx
import { useEffect, useMemo, useState } from 'react';
import axios from '../../../api/axios';

// lightweight, page-level cache (shared across account tabs)
const CACHE = (window.__accountCache ||= {});
const TTL = 2 * 60 * 1000; // 2 minutes
const KEY = 'account:profile';

function Field({ label, value }) {
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <div style={{ fontSize: '.85rem', color: 'var(--color-muted)' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value || '—'}</div>
    </div>
  );
}

export default function Profile() {
  const [data, setData] = useState(CACHE[KEY]?.value || null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(!CACHE[KEY]);

  // “request change” UI (kept but still soft-disabled)
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', tax_number: '', notes: '' });

  async function fetchNow({ force = false } = {}) {
    const fresh = CACHE[KEY] && Date.now() - CACHE[KEY].t < TTL;
    if (fresh && !force) return;

    setLoading(!CACHE[KEY]); // only show loader if nothing cached
    setErr(null);
    try {
      const r = await axios.get('/account/profile', { validateStatus: () => true, withCredentials: true });
      if (r.status !== 200) throw new Error('server_error');

      const val = r.data || {};
      CACHE[KEY] = { t: Date.now(), value: val };
      setData(val);
      setForm(f => ({
        ...f,
        name: val?.name || '',
        email: val?.email || '',
        phone: val?.phone || '',
        tax_number: val?.tax_number || ''
      }));
    } catch {
      setErr('network_or_server');
    } finally {
      setLoading(false);
    }
  }

  // initial mount: show cached immediately; revalidate in background if stale
  useEffect(() => {
    if (!CACHE[KEY] || Date.now() - CACHE[KEY].t >= TTL) fetchNow({ force: true });
  }, []);

  // small badge telling where the data came from (if your API sets .source)
  const sourceBadge = useMemo(() => {
    const s = (data?.source || '').toLowerCase();
    if (s === 'connector') return { text: 'Synced with back office', neon: true };
    if (s === 'local')     return { text: 'Local copy', neon: false };
    return null;
  }, [data]);

  return (
    <div className="profile-wrap" style={{ display: 'grid', gap: '1rem' }}>
      <div className="table-card" style={{ padding: '1rem', display: 'grid', gap: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem' }}>
          <div style={{ fontWeight: 700, letterSpacing: '.2px' }}>Profile</div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            {sourceBadge && (
              <span
                className="pill"
                style={sourceBadge.neon ? { borderColor: 'var(--color-neon)', color: 'var(--color-neon)' } : {}}
              >
                {sourceBadge.text}
              </span>
            )}
            <button className="btn-slim" onClick={() => fetchNow({ force: true })}>Refresh</button>
          </div>
        </div>

        {loading && <div style={{ color: 'var(--color-muted)' }}>Loading…</div>}
        {!loading && err && <div style={{ color: 'var(--color-muted)' }}>Couldn’t load profile.</div>}

        {!loading && !err && (
          <>
            <div
              className="profile-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
                gap: '0.9rem'
              }}
            >
              <Field label="Name"        value={data?.name} />
              <Field label="Company"     value={data?.company} />
              <Field label="Email"       value={data?.email} />
              <Field label="Phone"       value={data?.phone} />
              <Field label="Tax / VAT"   value={data?.tax_number} />
            </div>

            {(Number.isFinite(data?.credit_limit) || Number.isFinite(data?.opening_balance)) && (
              <div
                className="info-strip"
                style={{
                  marginTop: '.25rem',
                  paddingTop: '.65rem',
                  borderTop: '1px solid var(--color-border)',
                  display: 'flex',
                  gap: '1.25rem',
                  flexWrap: 'wrap',
                  color: 'var(--color-muted)'
                }}
              >
                {Number.isFinite(data?.credit_limit) && (
                  <div><strong>Credit limit:</strong> {data.credit_limit}</div>
                )}
                {Number.isFinite(data?.opening_balance) && (
                  <div><strong>Opening balance:</strong> {data.opening_balance}</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '.6rem', marginTop: '.25rem' }}>
              <button
                type="button"
                className="btn-slim"
                onClick={() => setShowForm(s => !s)}
                aria-expanded={showForm ? 'true' : 'false'}
                aria-controls="profile-request-form"
              >
                {showForm ? 'Close request form' : 'Request a change'}
              </button>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div id="profile-request-form" className="table-card" style={{ padding: '1rem', display: 'grid', gap: '.9rem' }}>
          <div style={{ fontWeight: 700, letterSpacing: '.2px' }}>Request changes</div>

          <div
            className="form-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
              gap: '0.9rem'
            }}
          >
            <label style={{ display: 'grid', gap: '.35rem' }}>
              <span style={{ fontSize: '.9rem', color: 'var(--color-muted)' }}>Name</span>
              <input
                className="tb-input"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., John Appleseed"
              />
            </label>

            <label style={{ display: 'grid', gap: '.35rem' }}>
              <span style={{ fontSize: '.9rem', color: 'var(--color-muted)' }}>Email</span>
              <input
                className="tb-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </label>

            <label style={{ display: 'grid', gap: '.35rem' }}>
              <span style={{ fontSize: '.9rem', color: 'var(--color-muted)' }}>Phone</span>
              <input
                className="tb-input"
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+1 555 123 4567"
              />
            </label>

            <label style={{ display: 'grid', gap: '.35rem' }}>
              <span style={{ fontSize: '.9rem', color: 'var(--color-muted)' }}>Tax / VAT</span>
              <input
                className="tb-input"
                value={form.tax_number}
                onChange={(e) => setForm(f => ({ ...f, tax_number: e.target.value }))}
                placeholder="Tax / VAT number"
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: '.35rem' }}>
            <span style={{ fontSize: '.9rem', color: 'var(--color-muted)' }}>Additional notes (optional)</span>
            <textarea
              className="tb-input"
              rows={4}
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Tell us what needs to change and why…"
              style={{ paddingTop: '.6rem', paddingBottom: '.6rem' }}
            />
          </label>

          <div style={{ display: 'flex', gap: '.6rem' }}>
            <button
              type="button"
              className="btn-slim"
              onClick={() => {
                setForm({
                  name: data?.name || '',
                  email: data?.email || '',
                  phone: data?.phone || '',
                  tax_number: data?.tax_number || '',
                  notes: ''
                });
                setShowForm(false);
              }}
            >
              Cancel
            </button>

            <button type="button" className="btn-slim" disabled title="Disabled for now — wiring pending">
              Submit request
            </button>
          </div>

          <div style={{ color: 'var(--color-muted)', fontSize: '.9rem' }}>
            Submissions are disabled while we finish wiring this to the back office.
          </div>
        </div>
      )}
    </div>
  );
}
