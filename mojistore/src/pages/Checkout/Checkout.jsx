import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axios';
import '../../styles/address-modal.css';

const usd = (n) => Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export default function Checkout() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);

  const [locations, setLocations] = useState([]);
  const [locId, setLocId] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedShippingId, setSelectedShippingId] = useState(null);
  const [selectedBillingId, setSelectedBillingId] = useState(null);
  const [useBillingAsShipping, setUseBillingAsShipping] = useState(true);
  const [theme, setTheme] = useState(() => (localStorage.getItem('theme') === 'light' ? 'light' : 'dark'));
  // Inline address editor state
  const [editingAddress, setEditingAddress] = useState(null);
  const [editForm, setEditForm] = useState({ line1: '', line2: '', city: '', state: '', country: '', zip: '', building: '', street: '', landmark: '', secondary: '' });
  const [editShippingLine, setEditShippingLine] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState(null);
  const [editSaveSuccess, setEditSaveSuccess] = useState(false);

  // Server cart (authoritative)
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // Load bootstrap first to determine locations and default location
        const boot = await axios.get('/checkout/bootstrap', { withCredentials: true, validateStatus: () => true });
        if (!alive) return;

        if (boot.status === 200 && Array.isArray(boot.data?.locations)) {
          setLocations(boot.data.locations);
          setLocId(boot.data.default_location_id || boot.data.locations[0]?.id || 1);
        } else {
          setLocations([]);
          setLocId(1);
        }

        const chosenLoc = boot.status === 200 ? (boot.data.default_location_id || boot.data.locations[0]?.id || 1) : 1;

        // Load account addresses (if authenticated) so user can pick shipping/billing
        try {
          const ar = await axios.get('/account/addresses', { withCredentials: true, validateStatus: () => true });
          if (Array.isArray(ar.data)) {
            setAddresses(ar.data);
            // pick sensible defaults
            const shippingDefault = ar.data.find(a => (a.type || '').toLowerCase().includes('shipping') || a.is_default) || ar.data[0];
            const billingDefault = ar.data.find(a => (a.type || '').toLowerCase().includes('billing')) || ar.data[0] || null;
            setSelectedShippingId(shippingDefault?.id ?? shippingDefault?.type ?? null);
            setSelectedBillingId(billingDefault?.id ?? billingDefault?.type ?? null);
            setUseBillingAsShipping(Boolean(shippingDefault && billingDefault && shippingDefault?.id === billingDefault?.id));
          }
        } catch (e) {
          // ignore
        }

        // Then fetch the server cart with the chosen location so API returns priced items
        const crt = await axios.get('/cart', {
          withCredentials: true,
          validateStatus: () => true,
          params: { location_id: chosenLoc },
        });
        if (!alive) return;

        const arr = Array.isArray(crt.data?.items) ? crt.data.items : [];
        setItems(arr);
      } catch (e) {
        if (!alive) return;
        setErr('Failed to load checkout data.');
        setLocations([]); setLocId(1);
        setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const total = useMemo(
    () => items.reduce((s, it) => s + Number(it.price || 0) * Math.floor(it.qty || 0), 0),
    [items]
  );

  async function placeOrder() {
    setPlacing(true);
    setErr(null);
    setOk(null);

    try {
      if (!items.length) {
        setErr('Your cart is empty.');
        setPlacing(false);
        return;
      }

      // We only send IDs & quantities; server will compute price + pg
      const products = items.map(it => ({
        product_id: it.product_id ?? null,
        variation_id: it.variation_id ?? it.variationId,
        quantity: Math.max(1, Math.floor(it.qty || 1)),
      }));

      // Compose payload, including shipping address if selected
      const payload = {
        location_id: Number(locId || 1),
        status: 'final',
        payment_status: 'due',
        products,
      };

      // If addresses were loaded and user selected a shipping address, attach it
      try {
        let shipAddr = null;
        if (useBillingAsShipping && selectedBillingId) {
          shipAddr = addresses.find(a => String(a.id || a.type) === String(selectedBillingId));
        } else if (selectedShippingId) {
          shipAddr = addresses.find(a => String(a.id || a.type) === String(selectedShippingId));
        }
        if (shipAddr) {
          // Prefer explicit shipping_address fields from server; fall back to raw/full
          const sa = shipAddr.shipping_address || shipAddr.raw?.shipping_address || shipAddr.raw?.full || shipAddr.full || '';
          if (sa) payload.shipping_address = String(sa);
          // additional details (contact/phone/name) can be passed as shipping_details
          const details = [];
          if (shipAddr.name) details.push(String(shipAddr.name));
          if (shipAddr.phone) details.push(String(shipAddr.phone));
          if (details.length) payload.shipping_details = details.join(' — ');
        }
      } catch (e) { /* ignore */ }


      // TIP while JWT is flaky: you can TEMP hardcode contact_id to test end-to-end:
      // payload.contact_id = 753;

      console.log('[Checkout.jsx] POST /checkout/create payload', payload);

      const r = await axios.post('/checkout/create', payload, {
        withCredentials: true,
        validateStatus: () => true
      });

      console.log('[Checkout.jsx] ERP proxy response', r.status, r.data);

      if (r.status !== 200 || !r.data?.ok) {
        setErr(r.data?.connector_body?.error?.message || r.data?.error || 'Checkout failed.');
        setPlacing(false);
        return;
      }

      setOk('Order placed successfully.');
      const invoice = r.data?.invoice_no || null;
      const tid = r.data?.id || null;

      if (invoice) {
        nav(`/order-complete?invoice=${encodeURIComponent(invoice)}`);
      } else if (tid) {
        nav(`/order-complete?tid=${encodeURIComponent(String(tid))}`);
      } else {
        nav('/account/orders');
      }
    } catch (e) {
      console.error('[Checkout.jsx] placeOrder error', e);
      setErr('Network error. Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  function openAddressEditor(id) {
    const a = addresses.find(x => String(x.id || x.type) === String(id));
    if (!a) return;
    setEditingAddress(a);
    setEditForm({
      line1: a.raw?.line1 || a.line1 || '',
      line2: a.raw?.line2 || a.line2 || '',
      city: a.raw?.city || a.city || '',
      state: a.raw?.state || a.state || '',
      country: a.raw?.country || a.country || '',
      zip: a.raw?.zip || a.zip || '',
      building: a.raw?.building || '',
      street: a.raw?.street || '',
      landmark: a.raw?.landmark || '',
      secondary: a.raw?.secondary || ''
    });
    setEditShippingLine(a.raw?.shipping_address || a.shipping_address || a.raw?.full || a.full || '');
    setEditErr(null);
  }

  async function submitAddressEdit(e) {
    e?.preventDefault();
    if (!editingAddress) return;
    setEditSaving(true); setEditErr(null);
    try {
      // Snapshot for rollback if server call fails
      const prevAddresses = Array.isArray(addresses) ? addresses.slice() : [];

      // Build an optimistic address object with the edits applied so UI updates immediately
      const optimisticAddress = {
        ...editingAddress,
        raw: {
          ...(editingAddress.raw || {}),
          line1: editForm.line1 || null,
          line2: editForm.line2 || null,
          city: editForm.city || null,
          state: editForm.state || null,
          country: editForm.country || null,
          zip: editForm.zip || null,
          // if shipping type, update single-line shipping address
          ...( ((editingAddress.type || '').toLowerCase() === 'shipping' || (editingAddress.type || '').toLowerCase() === 'both')
            ? { shipping_address: (editShippingLine || editForm.line1 || '').trim() || null }
            : {} ),
        },
        // convenience full field for display
        full: (editShippingLine && String(editShippingLine).trim()) || (
          `${(editForm.line1 || '').trim()}${editForm.city ? ', ' + (editForm.city || '') : ''}`.trim()
        )
      };

      // Apply optimistic update locally so the UI feels snappy
      setAddresses((prev = []) => prev.map(a => (String(a.id || a.type) === String(editingAddress.id || editingAddress.type) ? optimisticAddress : a)));

      const payload = { type: editingAddress.type };
      const typ = (editingAddress.type || '').toLowerCase();
      if (typ === 'billing' || typ === 'both') {
        payload.billing = {
          line1: editForm.line1 || null,
          line2: editForm.line2 || null,
          city: editForm.city || null,
          state: editForm.state || null,
          country: editForm.country || null,
          zip: editForm.zip || null
        };
      }
      if (typ === 'shipping' || typ === 'both') {
        payload.shipping = { line1: (editShippingLine || editForm.line1 || '').trim() || null };
      }
      const r = await axios.patch('/account/addresses', payload, { withCredentials: true, validateStatus: () => true });
      if (r.status !== 200) throw new Error(r.data?.error || 'update_failed');
      // Refresh authoritative addresses from server to keep canonical
      try {
        const ar = await axios.get('/account/addresses', { withCredentials: true, validateStatus: () => true });
        if (Array.isArray(ar.data)) setAddresses(ar.data);
      } catch (e) {
        // If refresh fails, keep optimistic state (we already applied it)
      }

      // show temporary success state then close modal
      setEditSaveSuccess(true);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', msg: 'Address updated' } }));
      const ann = document.getElementById('addr-live-announce');
      if (ann) ann.textContent = 'Address updated successfully.';
      setTimeout(() => {
        setEditSaveSuccess(false);
        setEditingAddress(null);
      }, 400);
    } catch (err) {
      const msg = err.message || 'Failed to update';
      // Rollback optimistic change and show error using snapshot
      try { if (Array.isArray(prevAddresses)) setAddresses(prevAddresses); } catch (e) { /* ignore rollback errors */ }
      setEditErr(msg);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', msg } }));
      const ann = document.getElementById('addr-live-announce');
      if (ann) ann.textContent = 'Failed to update address.';
    } finally { setEditSaving(false); }
  }

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-5 py-8">
      <h1 className="text-2xl font-semibold mb-5">Checkout</h1>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <>
          {/* Location */}
          <section className="rounded-2xl p-5 mb-5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <h2 className="text-lg font-medium mb-3">Location</h2>
            {locations.length <= 1 ? (
              <div className="tb-input" aria-readonly="true">
                {locations[0]?.name || 'Default'}
              </div>
            ) : (
              <select
                className="tb-input"
                value={locId ?? ''}
                onChange={(e) => setLocId(Number(e.target.value))}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name || `Location ${l.id}`}
                  </option>
                ))}
              </select>
            )}
          </section>

          {/* Inline Address Editor Modal */}
          {editingAddress && (
            <div className="addr-modal" role="dialog" aria-modal="true">
              <div className="addr-modal-backdrop" onClick={() => !editSaving && setEditingAddress(null)} />
              <form className="addr-modal-body" onSubmit={submitAddressEdit}>
                <h3 className="addr-modal-title">Edit {editingAddress.type} Address</h3>
                {/* Show structured fields only when editing Billing (not shipping or both). Shipping uses a single-line input. */}
                {(!(editingAddress && ['shipping','both'].includes(((editingAddress.type || '').toLowerCase())))) && (
                  <div className="addr-form-grid">
                    <label>
                      <span>Address line 1 *</span>
                      <input required value={editForm.line1} onChange={(e) => setEditForm({ ...editForm, line1: e.target.value })} />
                    </label>
                    <label>
                      <span>Address line 2</span>
                      <input value={editForm.line2} onChange={(e) => setEditForm({ ...editForm, line2: e.target.value })} />
                    </label>
                    <label>
                      <span>Building #</span>
                      <input value={editForm.building} onChange={(e) => setEditForm({ ...editForm, building: e.target.value })} />
                    </label>
                    <label>
                      <span>Street name</span>
                      <input value={editForm.street} onChange={(e) => setEditForm({ ...editForm, street: e.target.value })} />
                    </label>
                    <label>
                      <span>City</span>
                      <input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                    </label>
                    <label>
                      <span>State</span>
                      <input value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
                    </label>
                    <label>
                      <span>Country *</span>
                      <input required value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
                    </label>
                    <label>
                      <span>ZIP</span>
                      <input value={editForm.zip} onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })} />
                    </label>
                  </div>
                )}

                {(editingAddress && ['shipping','both'].includes(((editingAddress.type || '').toLowerCase()))) && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      <span style={{ display: 'block', marginBottom: '4px' }}>Shipping address (single line)</span>
                      <input type="text" value={editShippingLine} onChange={(e) => setEditShippingLine(e.target.value)} style={{ padding: '.55rem .6rem', border: '1px solid var(--color-border)', borderRadius: '8px', width: '100%' }} />
                      <small style={{ color: 'var(--color-muted)', display: 'block', marginTop: '6px' }}>This replaces the stored shipping address as a single line.</small>
                    </label>
                  </div>
                )}
                {editErr && <div className="addr-form-error">{editErr}</div>}
                <div className="addr-modal-actions">
                  <button type="button" disabled={editSaving} onClick={() => setEditingAddress(null)}>Cancel</button>
                  <button type="submit" className={"btn-slim " + (editSaving ? 'btn-spin' : (editSaveSuccess ? 'btn-success btn-success-animate' : ''))} disabled={editSaving}>
                    {editSaving ? (<><span className="spinner" aria-hidden="true" /> Saving…</>) : (editSaveSuccess ? (<><span>Saved</span><span className="btn-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span></>) : 'Save')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* aria-live region for screen reader announcements about address save */}
          <div id="addr-live-announce" className="sr-only" aria-live="polite" aria-atomic="true"></div>

          {/* Addresses */}
          <section className="rounded-2xl p-5 mb-5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <h2 className="text-lg font-medium mb-3">Addresses</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 6 }}>Shipping address</div>
                <select value={selectedShippingId ?? ''} onChange={(e) => { setSelectedShippingId(e.target.value); setUseBillingAsShipping(false); }} className="tb-input">
                  <option value="">Select shipping address</option>
                  {addresses.map(a => (
                    <option key={String(a.id || a.type)} value={String(a.id || a.type)}>{a.type} — {a.raw?.full || a.full || a.name || ''}</option>
                  ))}
                </select>
                {selectedShippingId ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontSize: 13, opacity: .85 }}>{(addresses.find(x => String(x.id || x.type) === String(selectedShippingId))?.raw?.full) || (addresses.find(x => String(x.id || x.type) === String(selectedShippingId))?.full) || ''}</div>
                      <button type="button" className="btn-slim" onClick={() => openAddressEditor(selectedShippingId)}>Edit</button>
                    </div>
                ) : null}
              </div>

              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 6 }}>Billing address</div>
                <select value={selectedBillingId ?? ''} onChange={(e) => { setSelectedBillingId(e.target.value); setUseBillingAsShipping(false); }} className="tb-input">
                  <option value="">Select billing address</option>
                  {addresses.map(a => (
                    <option key={String(a.id || a.type)} value={String(a.id || a.type)}>{a.type} — {a.raw?.full || a.full || a.name || ''}</option>
                  ))}
                </select>
                {selectedBillingId ? (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, opacity: .85 }}>{(addresses.find(x => String(x.id || x.type) === String(selectedBillingId))?.raw?.full) || (addresses.find(x => String(x.id || x.type) === String(selectedBillingId))?.full) || ''}</div>
                    <button type="button" className="btn-slim" onClick={() => openAddressEditor(selectedBillingId)}>Edit</button>
                  </div>
                ) : null}
              </div>

              <div style={{ alignSelf: 'center' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={useBillingAsShipping} onChange={(e) => setUseBillingAsShipping(e.target.checked)} />
                  <span style={{ fontSize: 13 }}>Use billing as shipping</span>
                </label>
                <div style={{ marginTop: 8 }}>
                  <a href="/account?tab=addresses">Manage addresses</a>
                </div>
              </div>

              <div style={{ marginLeft: 'auto' }}>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 6 }}>Theme</div>
                <div>
                  <button className="btn-slim" onClick={() => { setTheme('dark'); localStorage.setItem('theme', 'dark'); document.documentElement.classList.add('dark'); }}>Dark</button>
                  <button style={{ marginLeft: 8 }} className="btn-slim" onClick={() => { setTheme('light'); localStorage.setItem('theme', 'light'); document.documentElement.classList.remove('dark'); }}>Light</button>
                </div>
              </div>
            </div>
          </section>

          {/* Summary */}
          <section className="rounded-2xl p-5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <h2 className="text-lg font-medium mb-3">Review & place order</h2>

            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {items.map((it) => {
                const qty = Math.floor(it.qty || 0);
                const line = Number(it.price || 0) * qty;
                return (
                  <div key={`${it.id}-${it.variation_id}`} className="py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {it.name}{it.variant_label ? ` — ${it.variant_label}` : ''}
                      </div>
                      <div className="text-sm opacity-70">Qty: {qty}</div>
                    </div>
                    <div className="text-sm">{usd(line)}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span>Estimated total</span>
              <span>{usd(total)}</span>
            </div>

            {err && <div className="mt-2" style={{ color: 'var(--color-danger)' }}>{String(err)}</div>}
            {ok && <div className="mt-2" style={{ color: 'var(--color-neon)' }}>{ok}</div>}

            <div className="mt-4">
              <button
                type="button"
                className="btn-slim"
                onClick={placeOrder}
                disabled={placing || !items.length}
              >
                {placing ? 'Placing…' : 'Place order'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
