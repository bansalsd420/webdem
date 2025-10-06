// src/pages/Account/tabs/Payments.jsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from '../../../api/axios.js';

// ---------- formatting helpers ----------
function money(v) {
  const n = Number(v) || 0;
  try {
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function fdate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

// ---- cache (same pattern as Orders) ----
const CACHE_PREFIX = 'payments|';
const CACHE_TTL_MS = 60_000; // 1 minute

export default function Payments() {
  const [sp, setSp] = useSearchParams();

  // URL state (same style as Orders)
  const page = Number(sp.get('page') || 1);
  const limit = Number(sp.get('limit') || 20);
  const q = (sp.get('q') || '').trim();
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  const method = sp.get('method') || '';
  const locationId = sp.get('locationId') || localStorage.getItem('locationId') || '';

  // server data
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [reloadTick, setReloadTick] = useState(0); // manual refresh knob

  // Build the query string used for the API *and* cache key.
  // (Like Orders: include page/limit/q and locationId. Date/method filters are client-side.)
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (q) p.set('q', q);
    if (locationId) p.set('locationId', locationId);
    return p.toString();
  }, [page, limit, q, locationId]);

  const cacheKey = `${CACHE_PREFIX}${queryString}`;

  // Fetch with cache-hydrate + background refresh (exactly like Orders)
  useEffect(() => {
    let alive = true;

    // 1) hydrate from cache instantly to avoid flashing/loading on tab revisit
    const cachedRaw = sessionStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const j = JSON.parse(cachedRaw);
        if (Array.isArray(j.rows)) {
          setRows(j.rows);
          setTotal(Number(j.total || j.rows.length || 0));
        }
      } catch { }
    } else {
      setRows([]);
      setTotal(0);
    }

    // 2) refresh in background (and only show loader if no cache)
    const stale =
      !cachedRaw ||
      (() => {
        try {
          const j = JSON.parse(cachedRaw);
          return Date.now() - Number(j.ts || 0) > CACHE_TTL_MS;
        } catch {
          return true;
        }
      })();

    setLoading(!cachedRaw);
    setErr(null);

    if (stale || reloadTick > 0) {
      (async () => {
        try {
          const resp = await axios.get(`/account/payments?${queryString}`, {
            withCredentials: true,
            validateStatus: () => true,
          });
          if (!alive) return;

          if (resp.status !== 200) {
            setErr('server_error');
            if (!cachedRaw) { setRows([]); setTotal(0); }
          } else {
            const list = Array.isArray(resp.data) ? resp.data : resp.data?.rows || [];
            const headerTotal = Number(resp.headers['x-total-count'] ?? resp.headers['X-Total-Count']);
            const tot = Number.isFinite(headerTotal) ? headerTotal : list.length;

            setRows(list);
            setTotal(tot);
            sessionStorage.setItem(cacheKey, JSON.stringify({ rows: list, total: tot, ts: Date.now() }));
          }
        } catch {
          if (!alive) return;
          setErr('network_error');
          if (!cachedRaw) { setRows([]); setTotal(0); }
        } finally {
          if (alive) setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }

    return () => { alive = false; };
    // Re-run when the actual server query changes or a manual refresh is triggered
  }, [cacheKey, queryString, reloadTick]);

  // React to global location change like Orders
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

  // Persist tab/page/limit/filters in URL (so refresh restores the same view)
  useEffect(() => {
    const next = new URLSearchParams(sp);
    next.set('tab', 'payments');
    next.set('page', String(page));
    next.set('limit', String(limit));
    if (q) next.set('q', q); else next.delete('q');
    if (from) next.set('from', from); else next.delete('from');
    if (to) next.set('to', to); else next.delete('to');
    if (method) next.set('method', method); else next.delete('method');
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, q, from, to, method]);

  const totalPages = Math.max(1, Math.ceil((total || 0) / limit));

  // Method options from the **current page** (quick filter choices)
  const methodOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach(r => { if (r?.method) set.add(String(r.method)); });
    return Array.from(set).sort();
  }, [rows]);

  // Client-side filter within the loaded page
  const filteredRows = useMemo(() => {
    const ql = q.toLowerCase();
    const fromD = from ? new Date(from + 'T00:00:00') : null;
    const toD = to ? new Date(to + 'T23:59:59') : null;
    const m = method.toLowerCase();

    return (rows || []).filter(r => {
      const when = r?.paid_on || r?.created_at || r?.date || null;
      const d = when ? new Date(when) : null;

      if (fromD && d && d < fromD) return false;
      if (toD && d && d > toD) return false;
      if (m && String(r?.method || '').toLowerCase() !== m) return false;

      if (ql) {
        const hay = [
          r?.invoice, r?.invoice_no, r?.transaction_id,
          r?.method, r?.location, r?.amount
        ].map(x => String(x ?? '').toLowerCase()).join(' ');
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, q, from, to, method]);

  return (
    <div className="payments-wrap">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-3 text-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const next = new URLSearchParams(sp);
            const nq = String(fd.get('q') || '').trim();
            const nfrom = String(fd.get('from') || '').trim();
            const nto = String(fd.get('to') || '').trim();
            const nm = String(fd.get('method') || '').trim();

            if (nq) next.set('q', nq); else next.delete('q');
            if (nfrom) next.set('from', nfrom); else next.delete('from');
            if (nto) next.set('to', nto); else next.delete('to');
            if (nm) next.set('method', nm); else next.delete('method');

            next.set('page', '1');
            setSp(next, { replace: true });
          }}
          className="flex items-center gap-2"
        >
          <input
            name="q"
            defaultValue={q}
            className="input input-sm"
            placeholder="Search payments…"
            autoComplete="off"
          />
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="input input-sm"
            aria-label="From date"
          />
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="input input-sm"
            aria-label="To date"
          />
          <select
            name="method"
            defaultValue={method}
            className="input input-sm"
            aria-label="Payment method"
          >
            <option value="">All methods</option>
            {methodOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <button className="btn btn-sm btn-outline" type="submit">Apply</button>
          {(q || from || to || method) && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const next = new URLSearchParams(sp);
                ['q', 'from', 'to', 'method'].forEach(k => next.delete(k));
                next.set('page', '1');
                setSp(next, { replace: true });
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setReloadTick(t => t + 1)}
            title="Refresh"
            aria-label="Refresh payments"
          >
            Refresh
          </button>

          <select
            className="input input-sm"
            value={limit}
            onChange={(e) => {
              const v = Number(e.target.value) || 20;
              const next = new URLSearchParams(sp);
              next.set('limit', String(v));
              next.set('page', '1');
              setSp(next, { replace: true });
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-neutral-900 border-y">
            <tr className="text-left">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Location</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && rows.length === 0 && (
              <tr><td className="px-3 py-6" colSpan={5}>Loading…</td></tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr><td className="px-3 py-8 text-center opacity-70" colSpan={5}>
                {err ? 'No data / server error' : 'No payments found.'}
              </td></tr>
            )}
            {filteredRows.map((r, idx) => {
              const inv = r?.invoice ?? r?.invoice_no ?? r?.transaction_id ?? idx;
              const dateVal = r?.paid_on || r?.created_at || r?.date || null;
              return (
                <tr key={r.id ?? String(inv) + idx}>
                  <td className="px-3 py-2">{fdate(dateVal)}</td>
                  <td className="px-3 py-2">{inv || '—'}</td>
                  <td className="px-3 py-2">{r?.method || '—'}</td>
                  <td className="px-3 py-2">{money(r?.amount)}</td>
                  <td className="px-3 py-2">{r?.location || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom pager */}
      <div className="flex items-center justify-between mt-3 text-sm">
        <div>Page {page} of {totalPages} ({total} total)</div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm btn-outline"
            disabled={page <= 1}
            onClick={() => {
              const np = Math.max(1, page - 1);
              const next = new URLSearchParams(sp);
              next.set('page', String(np));
              setSp(next, { replace: true });
            }}
          >
            Prev
          </button>
          <button
            className="btn btn-sm btn-outline"
            disabled={page >= Math.max(1, Math.ceil((total || 0) / limit))}
            onClick={() => {
              const np = Math.min(Math.max(1, Math.ceil((total || 0) / limit)), page + 1);
              const next = new URLSearchParams(sp);
              next.set('page', String(np));
              setSp(next, { replace: true });
            }}
          >
            Next
          </button>

        </div>
      </div>
    </div>
  );
}
