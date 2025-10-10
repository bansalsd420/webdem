// src/pages/Account/tabs/Addresses.jsx
import { useEffect, useMemo, useState } from 'react';
import axios from '../../../api/axios';
import '../../../styles/address-modal.css';

const CACHE = (window.__accountCache ||= {});
const KEY = 'account:addresses';
const TTL = 2 * 60 * 1000; // 2 minutes

function AddressCard({ a, skeleton = false, onEdit }) {
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
        <button
          type="button"
          className="addr-edit-btn"
          onClick={() => onEdit?.(a)}
          aria-label={`Edit ${a.type} address`}
        >
          Edit
        </button>
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

  // Listen for external requests to open the edit modal (e.g. Checkout page inline edit)
  useEffect(() => {
    const handler = (e) => {
      const d = e?.detail;
      if (!d) return;
      // Accept either an id or an address object
      if (d.id != null) {
        const found = (CACHE[KEY]?.value || rows).find(a => String(a.id) === String(d.id));
        if (found) openEdit(found);
      } else if (d.address) {
        openEdit(d.address);
      }
    };
    window.addEventListener('addresses:edit', handler);
    return () => window.removeEventListener('addresses:edit', handler);
  }, [rows]);

  const [editing, setEditing] = useState(null); // {type, raw/full,...}
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // extend form with extra granular address fields
  const [form, setForm] = useState({ line1: '', line2: '', city: '', state: '', country: '', zip: '', building: '', street: '', landmark: '', secondary: '' });
  // single-line shipping address input (simpler UX; backend expects shipping_address single-line)
  const [shippingLine, setShippingLine] = useState('');
  const [formErr, setFormErr] = useState(null);

  function openEdit(a) {
    // Prefill granular fields if available under `raw`; otherwise leave blanks
    setForm({
      line1: a.raw?.line1 || '',
      line2: a.raw?.line2 || '',
      city: a.raw?.city || '',
      state: a.raw?.state || '',
      country: a.raw?.country || '',
      zip: a.raw?.zip || '',
      building: a.raw?.building || '',
      street: a.raw?.street || '',
      landmark: a.raw?.landmark || '',
      secondary: a.raw?.secondary || ''
    });
    // Prefill single-line shipping from various possible fields returned by backend/connector
    const shippingFromRaw = a.raw?.shipping_address || a.raw?.shipping || a.raw?.full || '';
    const shippingFromTop = a.shipping_address || '';
    setShippingLine(shippingFromRaw || shippingFromTop || '');
    setFormErr(null);
    setEditing(a);
  }

  async function submitEdit(e) {
    e?.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormErr(null);
    try {
      // Compose clean address lines from granular inputs so updates replace
      // stored lines instead of appending to them.
      const composedLine1 = (form.building || form.street)
        ? [form.building, form.street].filter(Boolean).join(' ').trim()
        : (form.line1 || '');
      const composedLine2 = [form.secondary, form.line2, form.landmark].filter(Boolean).join(', ').trim();

      const payload = { type: editing.type };
      const typ = (editing.type || '').toLowerCase();
      // Billing (or Both) -> structured billing payload
      if (typ === 'billing' || typ === 'both') {
        payload.billing = {
          line1: composedLine1 || null,
          line2: composedLine2 || null,
          city: form.city || null,
          state: form.state || null,
          country: form.country || null,
          zip: form.zip || null
        };
      }
      // Shipping (or Both) -> single-line shipping payload
      if (typ === 'shipping' || typ === 'both') {
        payload.shipping = { line1: (shippingLine || composedLine1 || '').trim() || null };
      }

      const r = await axios.patch('/account/addresses', payload, { withCredentials: true, validateStatus: () => true });
      if (r.status !== 200) throw new Error(r.data?.error || 'update_failed');
      // Some backends may return an empty array on transient errors; force-refresh
      // the addresses from server to ensure UI shows the current state.
      try {
        await fetchNow({ force: true });
      } catch (e) {
        // If refresh fails, still proceed
        setFormErr('Updated but failed to refresh addresses. Try manual refresh.');
      }
      // show a brief success state on the Save button before closing
      setSaveSuccess(true);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', msg: 'Address updated' } }));
      setTimeout(() => {
        setSaveSuccess(false);
        setEditing(null);
      }, 400);
    } catch (err) {
      const msg = err.message || 'Failed to update';
  setFormErr(msg);
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', msg } }));
    } finally {
      setSaving(false);
    }
  }

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
            <AddressCard key={`${a.type || 'addr'}-${i}`} a={a} onEdit={openEdit} />
          ))}
        </div>
      ) : (
        <div className="addr-status">No addresses on file yet.</div>
      )}

      {editing && (
        <div className="addr-modal" role="dialog" aria-modal="true">
          <div className="addr-modal-backdrop" onClick={() => !saving && setEditing(null)} />
          <form className="addr-modal-body" onSubmit={submitEdit}>
            <h3 className="addr-modal-title">Edit {editing.type} Address</h3>
            {/* toasts are now global via window 'app:toast' events */}
            <div className="addr-form-grid">
              {/* Show structured billing fields only when editing Billing or Both */}
              { (!editing || (editing.type && editing.type.toLowerCase() !== 'shipping')) && (
                <div className="addr-form-grid">
                  <label>
                    <span>Address line 1 *</span>
                    <input
                      required
                      value={form.line1}
                      onChange={(e) => setForm({ ...form, line1: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Address line 2</span>
                    <input
                      value={form.line2}
                      onChange={(e) => setForm({ ...form, line2: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Building #</span>
                    <input
                      value={form.building}
                      onChange={(e) => setForm({ ...form, building: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Street name</span>
                    <input
                      value={form.street}
                      onChange={(e) => setForm({ ...form, street: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Additional / Secondary number</span>
                    <input
                      value={form.secondary}
                      onChange={(e) => setForm({ ...form, secondary: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Landmark</span>
                    <input
                      value={form.landmark}
                      onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>City</span>
                    <input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>State</span>
                    <input
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Country *</span>
                    <input
                      required
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>ZIP</span>
                    <input
                      value={form.zip}
                      onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    />
                  </label>
                </div>
              ) }
            </div>

            {/* Show single-line shipping input for Shipping or Both */}
            { editing && editing.type && (editing.type.toLowerCase() === 'shipping' || editing.type.toLowerCase() === 'both') && (
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  <span style={{ display: 'block', marginBottom: '4px' }}>Shipping address (single line)</span>
                  <input
                    type="text"
                    value={shippingLine}
                    onChange={(e) => setShippingLine(e.target.value)}
                    style={{ padding: '.55rem .6rem', border: '1px solid var(--color-border)', borderRadius: '8px', width: '100%' }}
                  />
                  <small style={{ color: 'var(--color-muted)', display: 'block', marginTop: '6px' }}>This replaces the stored shipping address as a single line.</small>
                </label>
              </div>
            )}
            {formErr && <div className="addr-form-error">{formErr}</div>}
            <div className="addr-modal-actions">
              <button type="button" disabled={saving} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className={"btn-slim " + (saving ? 'btn-spin' : (saveSuccess ? 'btn-success btn-success-animate' : ''))} disabled={saving}>
                {saving ? (<><span className="spinner" aria-hidden="true" /> Saving…</>) : (saveSuccess ? (<><span>Saved</span><span className="btn-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span></>) : 'Save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* shared address modal styles imported from src/styles/address-modal.css */}
    </div>
  );
}
