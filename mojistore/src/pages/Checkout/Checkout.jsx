import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axios';

const usd = (n) => Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export default function Checkout() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);

  const [locations, setLocations] = useState([]);
  const [locId, setLocId] = useState(null);

  // Server cart (authoritative)
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [boot, crt] = await Promise.all([
          axios.get('/checkout/bootstrap', { withCredentials: true, validateStatus: () => true }),
          axios.get('/cart', { withCredentials: true, validateStatus: () => true }),
        ]);

        if (!alive) return;

        // Locations
        if (boot.status === 200 && Array.isArray(boot.data?.locations)) {
          setLocations(boot.data.locations);
          setLocId(boot.data.default_location_id || boot.data.locations[0]?.id || 1);
        } else {
          setLocations([]);
          setLocId(1);
        }

        // Cart
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

      const payload = {
        location_id: Number(locId || 1),
        status: 'final',
        payment_status: 'due',
        products,
        // Optional: shipping fields (uncomment when you wire UI)
        // shipping_address: '...',
        // shipping_details: '...',
      };

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
