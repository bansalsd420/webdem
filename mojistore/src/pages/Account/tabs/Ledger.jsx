import { useEffect, useMemo, useState } from 'react';
import axios from '../../../api/axios';
import { useSearchParams } from 'react-router-dom';

const CACHE = (window.__accountCache ||= {});
const TTL = 2 * 60 * 1000; // 2 min
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const money = (v) => USD.format(Number(v || 0));
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
};

export default function Ledger() {
  const [searchParams, setSearchParams] = useSearchParams();

  // filters
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const locationId = searchParams.get('locationId') || '';
  // pagination
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [limit, setLimit] = useState(Number(searchParams.get('limit') || 20));

  // data
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    range: { total_invoice: 0, total_paid: 0, balance_due: 0 },
    overall: { total_invoice: 0, total_paid: 0, balance_due: 0 }
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // query + cache key
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (locationId) p.set('locationId', locationId);
    if (q) p.set('q', q.trim());
    return p.toString();
  }, [page, limit, from, to, locationId, q]);

  const KEY = useMemo(() => `account:ledger?${queryString}`, [queryString]);

  async function fetchNow({ force = false } = {}) {
    const fresh = CACHE[KEY] && Date.now() - CACHE[KEY].t < TTL;
    if (fresh && !force) return;

    if (!CACHE[KEY]) setLoading(true);
    setErr(null);

    try {
      const resp = await axios.get(`/account/ledger?${queryString}`, {
        withCredentials: true,
        validateStatus: () => true,
        ...(locationId ? { meta: { location: true } } : {})
      });
      if (resp.status !== 200) throw new Error('server_error');

      const data = resp.data || {};
      const pack = {
        rows: Array.isArray(data.rows) ? data.rows : [],
        summary: data.summary || {
          range: { total_invoice: 0, total_paid: 0, balance_due: 0 },
          overall: { total_invoice: 0, total_paid: 0, balance_due: 0 }
        },
        total: Number(resp.headers['x-total-count'] || resp.headers['X-Total-Count'] || 0),
      };

      CACHE[KEY] = { t: Date.now(), value: pack };
      setRows(pack.rows);
      setSummary(pack.summary);
      setTotal(pack.total);
    } catch {
      setErr('Failed to load ledger.');
      if (!CACHE[KEY]) { setRows([]); setTotal(0); }
    } finally {
      setLoading(false);
    }
  }

  // show cache instantly; revalidate if stale/missing
  useEffect(() => {
    const cached = CACHE[KEY];
    if (cached) {
      setRows(cached.value.rows);
      setSummary(cached.value.summary);
      setTotal(cached.value.total);
      if (Date.now() - cached.t >= TTL) fetchNow({ force: true });
    } else {
      fetchNow({ force: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [KEY]);

  // broadcast listener for location switch
  useEffect(() => {
    function onLocChanged(e) {
      // Only propagate if this tab is already filtered by location.
      if (!searchParams.has('locationId')) return;
      const id = e?.detail?.id;
      const next = new URLSearchParams(searchParams);
      if (id) next.set('locationId', String(id)); else next.delete('locationId');
      next.set('page', '1');
      setPage(1);
      setSearchParams(next, { replace: true });
    }
    window.addEventListener('location:changed', onLocChanged);
    return () => window.removeEventListener('location:changed', onLocChanged);
  }, [searchParams, setSearchParams]);

  // apply / clear
  function applyFilters() {
    const next = new URLSearchParams(searchParams);
    if (from) next.set('from', from); else next.delete('from');
    if (to) next.set('to', to); else next.delete('to');
    if (q.trim()) next.set('q', q.trim()); else next.delete('q');
    next.set('page', '1');
    setPage(1);
    setSearchParams(next, { replace: true });
  }
  function clearFilters() {
    setFrom(''); setTo(''); setQ('');
    const next = new URLSearchParams(searchParams);
    next.delete('from'); next.delete('to'); next.delete('q');
    next.set('page', '1');
    setPage(1);
    setSearchParams(next, { replace: true });
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="ledger-wrap">
      {/* Toolbar */}
      <div className="ledger-toolbar">
        <input
          className="tb-input"
          placeholder="Search reference, method, location, status…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
        />
        <input type="date" className="tb-date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="tb-date" value={to} onChange={(e) => setTo(e.target.value)} />

        <div className="ledger-actions">
          <button className="btn-slim" onClick={applyFilters}>Apply</button>
          <button className="btn-slim" onClick={clearFilters}>Clear</button>
          <button className="btn-slim" onClick={() => fetchNow({ force: true })}>Refresh</button>
        </div>
      </div>

      {/* Summaries */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-title">This Range</div>
          <div className="summary-row">
            <div className="summary-item"><div className="k">Total invoice</div><div className="v">{money(summary.range.total_invoice)}</div></div>
            <div className="summary-item"><div className="k">Total paid</div><div className="v">{money(summary.range.total_paid)}</div></div>
            <div className="summary-item"><div className="k">Balance due</div><div className="v">{money(summary.range.balance_due)}</div></div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-title">Overall Summary</div>
          <div className="summary-row">
            <div className="summary-item"><div className="k">Total invoice</div><div className="v">{money(summary.overall.total_invoice)}</div></div>
            <div className="summary-item"><div className="k">Total paid</div><div className="v">{money(summary.overall.total_paid)}</div></div>
            <div className="summary-item"><div className="k">Balance due</div><div className="v">{money(summary.overall.balance_due)}</div></div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-card overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th>Date</th>
              <th>Reference No</th>
              <th>Type</th>
              <th>Location</th>
              <th>Payment Status</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Payment Method</th>
              <th>Others</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="empty-cell" colSpan={9}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="empty-cell" colSpan={9}>{err ? 'No data / server error' : 'No entries.'}</td></tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={idx}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.reference_no || '-'}</td>
                  <td className="capitalize">{r.type}</td>
                  <td>{r.location || '-'}</td>
                  <td>{r.payment_status || ''}</td>
                  <td>{r.debit ? money(r.debit) : ''}</td>
                  <td>{r.credit ? money(r.credit) : ''}</td>
                  <td>{r.payment_method || ''}</td>
                  <td>{r.others || ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="pager pager-bottom">
        <span className="pager-info">Page {page} of {totalPages} ({total} total)</span>
        <button
          className="btn-slim"
          disabled={page <= 1}
          onClick={() => {
            const np = Math.max(1, page - 1);
            setPage(np);
            const next = new URLSearchParams(searchParams);
            next.set('page', String(np));
            setSearchParams(next, { replace: true });
          }}
        >
          Prev
        </button>
        <button
          className="btn-slim"
          disabled={page >= totalPages}
          onClick={() => {
            const np = Math.min(totalPages, page + 1);
            setPage(np);
            const next = new URLSearchParams(searchParams);
            next.set('page', String(np));
            setSearchParams(next, { replace: true });
          }}
        >
          Next
        </button>
        <select
          className="pager-select"
          value={String(limit)}
          onChange={(e) => {
            const v = Number(e.target.value) || 20;
            setLimit(v);
            const next = new URLSearchParams(searchParams);
            next.set('limit', String(v));
            next.set('page', '1');
            setPage(1);
            setSearchParams(next, { replace: true });
          }}
        >
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </div>
    </div>
  );
}
