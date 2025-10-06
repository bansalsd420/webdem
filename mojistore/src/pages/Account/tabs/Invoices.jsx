// src/pages/Account/tabs/Invoices.jsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from '../../../api/axios';


const CACHE = (window.__accountCache ||= {});
const TTL = 2 * 60 * 1000; // 2 minutes
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return String(d); }
};
const money = (n) => USD.format(Number(n || 0));

function mapInvoice(row, i) {
  const invoiceNo = row?.invoice_no ?? row?.number ?? row?.no ?? null;
  return {
    id: row?.id ?? row?.invoice_id ?? i,
    invoice_no: invoiceNo,
    date: row?.date ?? row?.invoice_date ?? row?.created_at ?? null,
    status: row?.status ?? row?.payment_status ?? '-',
    total: Number(row?.final_total ?? row?.grand_total ?? row?.total ?? 0),
    due: Number(row?.balance ?? row?.amount_due ?? row?.due ?? 0),
    // Prefer your API PDF endpoint if present; fallback to backoffice URL pattern
    pdfUrl: invoiceNo
      ? `/api/account/invoice.pdf?invoice=${encodeURIComponent(invoiceNo)}`
      : null,
    raw: row,
  };
}

export default function InvoicesTab() {
  const [params, setParams] = useSearchParams();

  const page = Number(params.get('page') || 1);
  const limit = Number(params.get('limit') || 20);
  const q = (params.get('q') || '').trim();
  const start = params.get('start') || '';
  const end = params.get('end') || '';
  const status = params.get('status') || '';

  const key = useMemo(() => {
    const qp = new URLSearchParams();
    qp.set('page', String(page));
    qp.set('limit', String(limit));
    if (q) qp.set('q', q);
    if (start) qp.set('start', start);
    if (end) qp.set('end', end);
    if (status) qp.set('status', status);
    return `account:invoices?${qp.toString()}`;
  }, [page, limit, q, start, end, status]);

  const cached = CACHE[key];
  const [rows, setRows] = useState(cached?.value?.rows || []);
  const [total, setTotal] = useState(cached?.value?.total ?? null);
  const [loading, setLoading] = useState(!cached);
  const [err, setErr] = useState('');

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v === '' || v == null) next.delete(k);
    else next.set(k, v);
    if (k !== 'page') next.set('page', '1');
    setParams(next, { replace: true });
  };

  async function fetchNow({ force = false } = {}) {
    const fresh = CACHE[key] && Date.now() - CACHE[key].t < TTL;
    if (fresh && !force) return;

    if (!CACHE[key]) setLoading(true);
    setErr('');

    try {
      const res = await axios.get(`/account/invoices?${key.split('?')[1]}`, {
        withCredentials: true,
        validateStatus: () => true,
      });
      if (res.status !== 200) throw new Error('server_error');

      const raw = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      const mapped = raw.map(mapInvoice);
      const hdrTotal = Number(res.headers?.['x-total-count']);
      const totalVal = Number.isFinite(hdrTotal) ? hdrTotal : (res.data?.total ?? mapped.length);

      const pack = { rows: mapped, total: totalVal };
      CACHE[key] = { t: Date.now(), value: pack };
      setRows(mapped);
      setTotal(totalVal);
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load invoices.');
      if (!CACHE[key]) { setRows([]); setTotal(null); }
    } finally {
      setLoading(false);
    }
  }

  // show cache instantly; revalidate in background if stale/missing
  useEffect(() => {
    if (!CACHE[key]) {
      fetchNow({ force: true });
      return;
    }
    const isStale = Date.now() - CACHE[key].t >= TTL;
    if (isStale) fetchNow({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const pages = useMemo(() => {
    if (!Number.isFinite(total) || !total) return null;
    return Math.max(1, Math.ceil(total / limit));
  }, [total, limit]);

  return (
    <div className="invoices-panel">
      <div className="table-toolbar">
        <input
          className="tb-input"
          placeholder="Search invoices…"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
        />

        <div className="tb-dates">
          <label>
            From <input type="date" value={start} onChange={(e) => setParam('start', e.target.value)} />
          </label>
          <label>
            To <input type="date" value={end} onChange={(e) => setParam('end', e.target.value)} />
          </label>
        </div>

        <div className="tb-controls">
          <label>
            Status
            <select value={status} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>

          <label>
            Per page
            <select value={String(limit)} onChange={(e) => setParam('limit', e.target.value)}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>

          <button className="tb-reset" onClick={() => {
            const next = new URLSearchParams(params);
            ['q','start','end','status','page','limit'].forEach(k => next.delete(k));
            setParams(next, { replace: true });
          }}>
            Reset
          </button>

          <button className="btn-slim" onClick={() => fetchNow({ force: true })}>
            Refresh
          </button>
        </div>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Due</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="empty-cell" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td className="empty-cell" colSpan={6}>
                  {err}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="empty-cell" colSpan={6}>
                  No invoices found.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={String(r.id ?? i)}>
                  <td>{r.invoice_no || r.id}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td>
                    <span className="pill">{r.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{money(r.due)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.total)}</td>
                  <td>
                    {r.pdfUrl ? (
                      <a className="btn-outline" href={r.pdfUrl} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button
          disabled={page <= 1}
          onClick={() => setParam('page', String(Math.max(1, page - 1)))}
        >
          Prev
        </button>
        <span>{Number.isFinite(pages) ? `Page ${page} of ${pages}` : `Page ${page}`}</span>
        <button
          disabled={Number.isFinite(pages) ? page >= pages : rows.length < limit}
          onClick={() => setParam('page', String(page + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
