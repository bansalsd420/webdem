// src/pages/Account/tabs/Orders.jsx
import { useEffect, useMemo, useState } from 'react';
import axios from '../../../api/axios.js';
import { useSearchParams } from 'react-router-dom';

function money(v) {
  const n = Number(v) || 0;
  try {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function fdate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function Orders() {
  const [sp, setSp] = useSearchParams();

  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const page  = Number(sp.get('page')  || 1);
  const limit = Number(sp.get('limit') || 20);
  const q     = (sp.get('q') || '').trim();
  const locationId = sp.get('locationId') || localStorage.getItem('locationId') || '';

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (q) p.set('q', q);
    if (locationId) p.set('locationId', locationId);
    return p.toString();
  }, [page, limit, q, locationId]);

  const cacheKey = `orders|${queryString}`;

  useEffect(() => {
    let alive = true;

    // 1) serve from cache instantly (no flashing “Loading…” when revisiting)
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const j = JSON.parse(cached);
        if (Array.isArray(j.rows)) {
          setOrders(j.rows);
          setTotal(Number(j.total || j.rows.length || 0));
        }
      } catch {}
    } else {
      setOrders([]);
    }

    // 2) always refresh in background
    setLoading(!cached);
    setErr(null);
    (async () => {
      try {
        const resp = await axios.get(`/account/orders?${queryString}`, { validateStatus: () => true });
        if (!alive) return;

        if (resp.status !== 200) {
          setErr('server_error');
          if (!cached) { setOrders([]); setTotal(0); }
        } else {
          const rows = Array.isArray(resp.data) ? resp.data : resp.data?.rows || [];
          const headerTotal = Number(resp.headers['x-total-count'] ?? resp.headers['X-Total-Count']);
          const tot = Number.isFinite(headerTotal) ? headerTotal : rows.length;

          setOrders(rows);
          setTotal(tot);
          sessionStorage.setItem(cacheKey, JSON.stringify({ rows, total: tot, ts: Date.now() }));
        }
      } catch {
        if (!alive) return;
        setErr('network_error');
        if (!cached) { setOrders([]); setTotal(0); }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [cacheKey, queryString]); // re-run only if query really changes

  // react to global location change from Navbar
  useEffect(() => {
    function onLocChanged(e) {
      const id = e?.detail?.id;
      const next = new URLSearchParams(sp);
      if (id == null) next.delete('locationId'); else next.set('locationId', String(id));
      next.set('page', '1');
      setSp(next, { replace: true });
    }
    window.addEventListener('location:changed', onLocChanged);
    return () => window.removeEventListener('location:changed', onLocChanged);
  }, [sp, setSp]);

  const totalPages = Math.max(1, Math.ceil((total || 0) / limit));

  return (
    <div className="orders-wrap">
      {/* controls row */}
      <div className="flex items-center justify-between gap-3 mb-3 text-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const term = String(form.get('q') || '').trim();
            const next = new URLSearchParams(sp);
            if (term) next.set('q', term); else next.delete('q');
            next.set('page', '1');
            setSp(next, { replace: true });
          }}
          className="flex items-center gap-2"
        >
          <input
            name="q"
            defaultValue={q}
            className="input input-md"
            placeholder="Search orders (invoice/ref)…"
            autoComplete="off"
          />
          <button className="btn btn-sm btn-outline" type="submit">Search</button>
          {q && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const next = new URLSearchParams(sp);
                next.delete('q'); next.set('page', '1');
                setSp(next, { replace: true });
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <select
            className="input input-sm"
            value={limit}
            onChange={(e) => {
              const v = Number(e.target.value) || 20;
              const next = new URLSearchParams(sp);
              next.set('limit', String(v)); next.set('page', '1');
              setSp(next, { replace: true });
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-neutral-900 border-y">
            <tr className="text-left">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Reference No</th>
              <th className="px-3 py-2">Payment Status</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">View / Download</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && orders.length === 0 && (
              <tr><td className="px-3 py-6" colSpan={5}>Loading…</td></tr>
            )}
            {!loading && (!orders || orders.length === 0) && (
              <tr><td className="px-3 py-8 text-center opacity-70" colSpan={5}>
                {err ? 'No data / server error' : 'No orders yet.'}
              </td></tr>
            )}
            {orders.map((o) => {
              const invoiceNo = o?.invoice_no ?? o?.reference_no ?? o?.ref_no ?? o?.id;
              const viewHref = invoiceNo ? `/api/account/orders/${encodeURIComponent(invoiceNo)}/preview` : null;
              const downloadHref = invoiceNo ? `/api/account/orders/${encodeURIComponent(invoiceNo)}/pdf` : null;
              const dateVal = o?.date ?? o?.transaction_date ?? o?.created_at ?? null;
              const totalVal = o?.total ?? o?.final_total ?? 0;

              return (
                <tr key={o.id || `${invoiceNo}-${dateVal || Math.random()}`}>
                  <td className="px-3 py-2">{fdate(dateVal)}</td>
                  <td className="px-3 py-2">{invoiceNo || '-'}</td>
                  <td className="px-3 py-2">{o?.payment_status || ''}</td>
                  <td className="px-3 py-2">{money(totalVal)}</td>
                  <td className="px-3 py-2">
                    {invoiceNo ? (
                      <div className="flex items-center gap-3">
                        <a href={viewHref} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 hover:underline">View</a>
                        <span className="opacity-50">/</span>
                        <a href={downloadHref} className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 hover:underline">Download</a>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm">
        <div>Page {page} of {Math.max(1, Math.ceil((total || 0) / limit))} ({total} total)</div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm btn-outline"
            disabled={page <= 1}
            onClick={() => {
              const np = Math.max(1, page - 1);
              const next = new URLSearchParams(sp); next.set('page', String(np)); setSp(next, { replace: true });
            }}
          >
            Prev
          </button>
          <button
            className="btn btn-sm btn-outline"
            disabled={page >= Math.max(1, Math.ceil((total || 0) / limit))}
            onClick={() => {
              const np = Math.min(Math.max(1, Math.ceil((total || 0) / limit)), page + 1);
              const next = new URLSearchParams(sp); next.set('page', String(np)); setSp(next, { replace: true });
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
