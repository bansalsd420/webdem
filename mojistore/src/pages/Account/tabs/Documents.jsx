import { useEffect, useState } from 'react';
import axios from '../../../api/axios';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) :
    d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'2-digit' });
}

function DocCard({ name, description, created_at, view_url, download_url }) {
  return (
    <div className="doc-card">
      <div className="doc-main">
        <div className="doc-icon" aria-hidden>📄</div>
        <div className="doc-meta">
          <div className="doc-name" title={name}>{name}</div>
          <div className="doc-sub">{description || 'No description'} · {fmtDate(created_at)}</div>
        </div>
      </div>
      <div className="doc-actions">
        <a className="btn-ghost" href={view_url} target="_blank" rel="noopener noreferrer">View</a>
        <a className="btn-ghost" href={download_url}>Download</a>
      </div>
    </div>
  );
}

export default function Documents() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await axios.get('/account/documents', { validateStatus: () => true });
        if (!mounted) return;
        if (r.status !== 200) setErr('server_error');
        setRows(Array.isArray(r.data) ? r.data : []);
      } catch {
        if (mounted) setErr('network_error');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="empty-cell">Loading…</div>;
  if (err)      return <div className="empty-cell">Couldn’t load documents.</div>;
  if (!rows.length) return <div className="empty-cell">No documents on file.</div>;

  return (
    <div className="doc-grid">
      {rows.map((r) => <DocCard key={r.id} {...r} />)}
    </div>
  );
}
