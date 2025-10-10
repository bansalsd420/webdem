// /web/src/pages/Test.jsx
// Dev control panel: full categories view + visibility toggles,
// banners with auto-sort on add and Up/Down reordering.

import { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";

const yesNo = (v) => (v ? "Yes" : "No");

export default function TestPanel() {
  // ---- CATEGORIES + VISIBILITY (ALL) ----
  const [catRows, setCatRows] = useState([]); // [{category_id, category_name, hide_for_*}]
  const [visSaving, setVisSaving] = useState({});
  const [q, setQ] = useState("");

  const filteredCats = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return catRows;
    return catRows.filter((r) => r.category_name.toLowerCase().includes(t));
  }, [catRows, q]);

  const loadAllVis = async () => {
    const { data } = await axios.get("/test/visibility/all", { withCredentials: true });
    setCatRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => { loadAllVis(); }, []);

  // ---- PER-CONTACT VISIBILITY (DEV) ----
  const [contactId, setContactId] = useState('');
  const [contactHidden, setContactHidden] = useState([]);
  const [pcSelectedCat, setPcSelectedCat] = useState(null);
  const [pcSearch, setPcSearch] = useState('');
  const [pcDescendants, setPcDescendants] = useState([]);
  const [pcRecursive, setPcRecursive] = useState(false);
  // admin cache UI
  const [adminSecret, setAdminSecret] = useState('');
  const [cacheKey, setCacheKey] = useState('');
  const [cachePrefix, setCachePrefix] = useState('');
  const [cacheStats, setCacheStats] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [adminLoadingFlushKey, setAdminLoadingFlushKey] = useState(false);
  const [adminLoadingFlushPrefix, setAdminLoadingFlushPrefix] = useState(false);
  const [adminLoadingStats, setAdminLoadingStats] = useState(false);
  const [showPrefixConfirm, setShowPrefixConfirm] = useState(false);
  const loadContactHidden = async (cid) => {
    if (!cid) return setContactHidden([]);
    try {
      const { data } = await axios.get(`/test/visibility/effective`, { params: { business_id: process.env.REACT_APP_BUSINESS_ID || undefined, contact_id: cid } });
      setContactHidden(Array.isArray(data?.hidden) ? data.hidden : []);
    } catch (e) { setContactHidden([]); }
  };

  const applyPerContactHide = async ({ category_id, contact_ids, recursive }) => {
    await axios.post('/test/visibility/for-contact', { category_id, contact_ids, recursive, business_id: Number(process.env.REACT_APP_BUSINESS_ID || 0) }, { withCredentials: true });
  };

  const removePerContactHide = async ({ category_id, contact_ids, recursive }) => {
    await axios.delete('/test/visibility/for-contact', { data: { category_id, contact_ids, recursive, business_id: Number(process.env.REACT_APP_BUSINESS_ID || 0) }, withCredentials: true });
  };

  const loadDescendants = async (categoryId) => {
    if (!categoryId) return setPcDescendants([]);
    try {
      const { data } = await axios.get('/test/categories/descendants', { params: { category_id: categoryId, business_id: Number(process.env.REACT_APP_BUSINESS_ID || 0) } });
      setPcDescendants(Array.isArray(data?.categories) ? data.categories : []);
    } catch (e) { setPcDescendants([]); }
  };

  const flushVisibilityCache = async (businessId, contactId) => {
    await axios.post('/test/visibility/flush', { business_id: businessId, contact_id: contactId }, { withCredentials: true });
  };

  const pushToast = (msg, type = 'info', timeout = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), timeout);
  };

  const saveOneVis = async (row) => {
    setVisSaving((p) => ({ ...p, [row.category_id]: true }));
    try {
      await axios.post("/test/visibility", {
        category_id: row.category_id,
        hide_for_guests: row.hide_for_guests ? 1 : 0,
        hide_for_all_users: row.hide_for_all_users ? 1 : 0,
      }, { withCredentials: true });
    } finally {
      setVisSaving((p) => ({ ...p, [row.category_id]: false }));
    }
  };

  // ---- BANNERS ----
  const [slot, setSlot] = useState("hero");
  const [banners, setBanners] = useState([]);
  const [editing, setEditing] = useState(null);
  const [savingBan, setSavingBan] = useState(false);
  const [reordering, setReordering] = useState(false);

  const loadBanners = async (s = slot) => {
    const { data } = await axios.get("/test/banners", { withCredentials: true, params: { slot: s } });
    setBanners(Array.isArray(data) ? data : []);
  };
  useEffect(() => { loadBanners(slot); }, [slot]);

  const newBannerDefaults = () => ({
    id: 0,
    slot,
    sort_order: 0, // will be auto-filled to MAX+1 by backend
    href: "",
    file_name: "",
    alt_text: "",
    is_gif: 0,
    active: 1,
  });

  const saveBanner = async (row) => {
    setSavingBan(true);
    try {
      const payload = {
        id: row.id || undefined,
        slot,
        sort_order: Number(row.sort_order || 0), // backend will auto-assign if <=0
        href: row.href || "",
        file_name: row.file_name || "",
        alt_text: row.alt_text || "",
        is_gif: row.is_gif ? 1 : 0,
        active: row.active ? 1 : 0,
      };
      await axios.post("/test/banners", payload, { withCredentials: true });
      setEditing(null);
      await loadBanners(slot);
    } finally {
      setSavingBan(false);
    }
  };

  const moveBanner = async (id, dir) => {
    setReordering(true);
    try {
      const { data } = await axios.post("/test/banners/reorder", { id, dir }, { withCredentials: true });
      if (data?.items) setBanners(data.items);
      else await loadBanners(slot);
    } finally {
      setReordering(false);
    }
  };

  const deleteBanner = async (id) => {
    if (!id) return;
    if (!confirm("Delete this banner?")) return;
    await axios.delete(`/test/banners/${id}`, { withCredentials: true });
    await loadBanners(slot);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-10">
      <style>{`
        .panel{background:var(--surface,#fff);border:1px solid var(--border-subtle,#e5e7eb);border-radius:12px;padding:14px 16px;box-shadow:0 4px 22px rgba(0,0,0,.04)}
        .row{display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:center;margin-bottom:10px}
        .grid{display:grid;gap:10px}
        .btn{padding:.5rem .9rem;border-radius:10px;border:1px solid #d1d5db;background:#111827;color:#fff;font-weight:600}
        .btn.light{background:#fff;color:#111;border-color:#d1d5db}
        .btn.sm{padding:.35rem .7rem;border-radius:8px}
        .tbl{width:100%;border-collapse:separate;border-spacing:0 8px}
        .tbl th{ text-align:left;color:#6b7280;font-size:.85rem }
        .tbl td{ background:var(--surface,#fff); border:1px solid var(--border-subtle,#e5e7eb); padding:.5rem; border-radius:8px; vertical-align: middle }
        .flex{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        input[type="text"],input[type="number"],select{border:1px solid #d1d5db;border-radius:8px;padding:.45rem .6rem;width:100%}
        .pill{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:999px;padding:.2rem .5rem;font-size:.8rem}
        .muted{color:#6b7280}
      `}</style>

      {/* Categories + Visibility (ALL) */}
      <section className="panel">
        <div className="flex" style={{justifyContent:"space-between", alignItems:"center"}}>
          <h2 className="text-lg font-semibold">Category visibility (all categories)</h2>
          <input
            className="border rounded px-3 py-1"
            placeholder="Search category…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
          />
        </div>

        <table className="tbl mt-3">
          <thead>
            <tr>
              <th style={{width: 60}}>ID</th>
              <th>Category</th>
              <th style={{width: 140}}>Hide guests</th>
              <th style={{width: 180}}>Hide all users</th>
              <th style={{width: 140}}>Save</th>
            </tr>
          </thead>
          <tbody>
            {filteredCats.map((r) => (
              <tr key={r.category_id}>
                <td>{r.category_id}</td>
                <td>{r.category_name}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!r.hide_for_guests}
                    onChange={(e) =>
                      setCatRows((prev) =>
                        prev.map((x) =>
                          x.category_id === r.category_id ? { ...x, hide_for_guests: e.target.checked ? 1 : 0 } : x
                        )
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!r.hide_for_all_users}
                    onChange={(e) =>
                      setCatRows((prev) =>
                        prev.map((x) =>
                          x.category_id === r.category_id ? { ...x, hide_for_all_users: e.target.checked ? 1 : 0 } : x
                        )
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    className="btn sm"
                    disabled={!!visSaving[r.category_id]}
                    onClick={() => saveOneVis(r)}
                  >
                    {visSaving[r.category_id] ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
            {!filteredCats.length && (
              <tr><td className="muted" colSpan={5}>No categories.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Per-contact visibility controls */}
      <section className="panel">
        <div className="flex" style={{justifyContent:'space-between', alignItems:'center'}}>
          <h2 className="text-lg font-semibold">Per-contact category hides (dev)</h2>
          <div className="flex">
            <input className="border rounded px-3 py-1 mr-2" placeholder="Contact ID" value={contactId} onChange={(e)=>setContactId(e.target.value)} />
            <button className="btn light" onClick={()=>loadContactHidden(contactId)}>Load hidden</button>
            <button className="btn light" style={{ marginLeft: 8 }} onClick={() => flushVisibilityCache(Number(process.env.REACT_APP_BUSINESS_ID || 0), contactId)}>Flush visibility cache</button>
          </div>
        </div>

        <div className="mt-3">
          <div className="muted">Hidden categories for contact: {contactHidden.length ? contactHidden.join(', ') : <i>none</i>}</div>

          <div className="mt-3 grid gap-2">
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input placeholder="Search categories..." value={pcSearch} onChange={(e)=>setPcSearch(e.target.value)} style={{ flex: 1 }} className="border rounded px-3 py-2" />
              <div style={{ minWidth: 320, maxHeight: 220, overflow: 'auto', border: '1px solid #ddd', background: '#fff' }}>
                {catRows.filter(c => { if (!pcSearch) return true; return (c.category_name || '').toLowerCase().includes(pcSearch.toLowerCase()); }).map(c => {
                  const isHiddenForContact = contactHidden && contactHidden.includes(Number(c.category_id));
                  return (
                    <div key={c.category_id} onClick={() => { setPcSelectedCat({ id: c.category_id, name: c.category_name }); setPcSearch(c.category_name); loadDescendants(c.category_id); }} style={{ padding: 8, cursor: 'pointer', background: pcSelectedCat?.id === c.category_id ? '#eef' : isHiddenForContact ? '#fff7ed' : 'transparent', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>{c.category_name} (id {c.category_id})</div>
                      {isHiddenForContact && <div className="pill">hidden</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ marginTop: 8 }}><strong>Selected:</strong> {pcSelectedCat ? `${pcSelectedCat.name} (id ${pcSelectedCat.id})` : 'none'}</div>
              <div style={{ marginTop: 8 }}><label className="inline-flex items-center gap-2"><input type="checkbox" checked={pcRecursive} onChange={(e)=>setPcRecursive(e.target.checked)} /> Include descendants</label></div>
              <div style={{ marginTop: 8 }} className="flex gap-2">
                <button className="btn" disabled={!pcSelectedCat || !contactId} onClick={async () => { await applyPerContactHide({ category_id: pcSelectedCat.id, contact_ids: [Number(contactId)], recursive: pcRecursive }); await loadContactHidden(contactId); }}>Apply hide for contact</button>
                <button className="btn light" style={{ marginLeft: 8 }} disabled={!pcSelectedCat || !contactId} onClick={async () => { await removePerContactHide({ category_id: pcSelectedCat.id, contact_ids: [Number(contactId)], recursive: pcRecursive }); await loadContactHidden(contactId); }}>Remove hide for contact</button>
              </div>
            </div>

            <div>
              <div style={{ marginTop: 8 }}><strong>Descendants preview ({pcDescendants.length})</strong></div>
              <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid #eee', padding: 8, marginTop: 8 }}>
                {pcDescendants.length === 0 ? <div style={{ color: '#777' }}>No descendants or none loaded.</div> : pcDescendants.map(d => <div key={d.id}>{d.name} (id {d.id})</div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Admin cache controls (flush, prefix flush, stats) */}
      <section className="panel">
        <div className="flex" style={{justifyContent:'space-between', alignItems:'center'}}>
          <h2 className="text-lg font-semibold">Admin cache controls</h2>
          <div style={{maxWidth: 520, display: 'flex', gap: 8}}>
            <input placeholder="Admin secret" value={adminSecret} onChange={(e)=>setAdminSecret(e.target.value)} className="border rounded px-3 py-1" />
          </div>
        </div>

        <div style={{marginTop: 12}}>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <input placeholder="Exact cache key to flush (e.g. products:v1:abc)" value={cacheKey} onChange={(e)=>setCacheKey(e.target.value)} className="border rounded px-3 py-2" style={{flex:1}} />
            <button className="btn light" onClick={async ()=>{
              if (!cacheKey) return pushToast('Enter a cache key', 'error');
              setAdminLoadingFlushKey(true);
              try {
                await axios.post('/admin/cache/flush', { key: cacheKey, secret: adminSecret });
                pushToast('Flushed ' + cacheKey, 'success');
              } catch (e) { pushToast('Flush failed: ' + (e?.response?.data?.error || e.message), 'error'); }
              finally { setAdminLoadingFlushKey(false); }
            }}>Flush key</button>
          </div>

          <div style={{marginTop:8, display:'flex', gap:8, alignItems:'center'}}>
            <input placeholder="Prefix to flush (e.g. products:v1:)" value={cachePrefix} onChange={(e)=>setCachePrefix(e.target.value)} className="border rounded px-3 py-2" style={{flex:1}} />
            <button className="btn light" onClick={async ()=>{
              if (!cachePrefix) return pushToast('Enter a prefix', 'error');
              // show confirm modal for prefix
              setShowPrefixConfirm(true);
            }}>{adminLoadingFlushPrefix ? 'Working…' : 'Flush prefix'}</button>
          </div>

          <div style={{marginTop:8}}>
            <button className="btn" onClick={async ()=>{
              setAdminLoadingStats(true);
              try {
                const { data } = await axios.get('/admin/cache/stats', { params: { secret: adminSecret } });
                setCacheStats(data?.stats || null);
                pushToast('Loaded cache stats', 'info');
              } catch (e) { pushToast('Stats failed: ' + (e?.response?.data?.error || e.message), 'error'); }
              finally { setAdminLoadingStats(false); }
            }}>{adminLoadingStats ? 'Loading…' : 'Load cache stats'}</button>
            {cacheStats && <pre style={{marginTop:8, maxHeight:200, overflow:'auto', background:'#fff', padding:8, border:'1px solid #eee'}}>{JSON.stringify(cacheStats, null, 2)}</pre>}
          </div>
        </div>
      </section>

      {/* Prefix flush confirmation modal */}
      {showPrefixConfirm && (
        <div style={{position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{background:'#fff', padding:20, borderRadius:8, width:520}}>
            <h3>Confirm prefix flush</h3>
            <p>You're about to flush cache keys matching prefix: <code>{cachePrefix}</code></p>
            <p style={{color:'#b00'}}>This may remove many cache entries. Proceed only if you understand the impact.</p>
            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
              <button className="btn light" onClick={()=>setShowPrefixConfirm(false)}>Cancel</button>
              <button className="btn" onClick={async ()=>{
                setAdminLoadingFlushPrefix(true);
                try {
                  await axios.post('/admin/cache/flush-prefix', { prefix: cachePrefix, secret: adminSecret });
                  pushToast('Flushed prefix ' + cachePrefix, 'success');
                } catch (e) { pushToast('Flush-prefix failed: ' + (e?.response?.data?.error || e.message), 'error'); }
                finally { setAdminLoadingFlushPrefix(false); setShowPrefixConfirm(false); }
              }}>{adminLoadingFlushPrefix ? 'Working…' : 'Confirm flush'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div style={{position:'fixed', right:16, bottom:16, display:'flex', flexDirection:'column', gap:8}}>
        {toasts.map(t => (
          <div key={t.id} style={{background: t.type === 'error' ? '#fee' : t.type === 'success' ? '#e6ffed' : '#eef', border: '1px solid #ddd', padding: 8, borderRadius: 6}}>{t.msg}</div>
        ))}
      </div>

      {/* Banners */}
      <section className="panel">
        <div className="flex" style={{justifyContent:"space-between", alignItems:"center"}}>
          <h2 className="text-lg font-semibold">Home banners</h2>
          <select className="border rounded px-3 py-2" value={slot} onChange={(e)=>setSlot(e.target.value)}>
            <option value="hero">Hero</option>
            <option value="wall">Wall</option>
          </select>
        </div>

        <div className="mt-4 grid gap-3">
          {banners.map((b, idx) => (
            <div key={b.id} className="flex items-center justify-between rounded border px-3 py-2">
              <div className="text-sm">
                <div><b>#{b.id}</b> • order {b.sort_order} • {b.file_name || <i>(no file)</i>}</div>
                <div className="text-gray-500">
                  active: {yesNo(b.active)} • gif: {yesNo(b.is_gif)} • alt: {b.alt_text || "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 rounded border"
                  disabled={reordering || idx === 0}
                  onClick={() => moveBanner(b.id, "up")}
                  title="Move up"
                >↑</button>
                <button
                  className="px-3 py-1 rounded border"
                  disabled={reordering || idx === banners.length - 1}
                  onClick={() => moveBanner(b.id, "down")}
                  title="Move down"
                >↓</button>
                <button className="px-3 py-1 rounded border" onClick={() => setEditing(b)}>Edit</button>
                <button className="px-3 py-1 rounded border text-red-600" onClick={() => deleteBanner(b.id)}>Delete</button>
              </div>
            </div>
          ))}
          {!banners.length && <div className="muted">No banners for “{slot}”.</div>}
        </div>

        {/* Editor */}
        <div className="mt-6">
          <h3 className="font-medium mb-2">{editing?.id ? "Edit banner" : "Add banner"}</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <input className="border rounded px-3 py-2" placeholder="File name"
                   value={editing?.file_name || ""} onChange={(e)=>setEditing(v=>({...(v||newBannerDefaults()), file_name:e.target.value}))}/>
            <input className="border rounded px-3 py-2" placeholder="Href"
                   value={editing?.href || ""} onChange={(e)=>setEditing(v=>({...(v||newBannerDefaults()), href:e.target.value}))}/>
            <input className="border rounded px-3 py-2" placeholder="Alt text"
                   value={editing?.alt_text || ""} onChange={(e)=>setEditing(v=>({...(v||newBannerDefaults()), alt_text:e.target.value}))}/>
            <input className="border rounded px-3 py-2" placeholder="Sort order (optional)"
                   value={editing?.sort_order ?? ""} onChange={(e)=>setEditing(v=>({...(v||newBannerDefaults()), sort_order:e.target.value}))}/>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!editing?.is_gif}
                     onChange={(e)=>setEditing(v=>({...(v||newBannerDefaults()), is_gif: e.target.checked}))}/>
              <span>Is GIF</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!editing?.active}
                     onChange={(e)=>setEditing(v=>({...(v||newBannerDefaults()), active: e.target.checked}))}/>
              <span>Active</span>
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <button className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
                    disabled={savingBan}
                    onClick={()=> saveBanner(editing || newBannerDefaults())}>
              {savingBan ? "Saving…" : (editing?.id ? "Update banner" : "Create banner")}
            </button>
            <button className="rounded px-4 py-2 border"
                    onClick={()=>setEditing(newBannerDefaults())}>
              New
            </button>
            {editing?.id && (
              <button className="rounded px-4 py-2 border"
                      onClick={()=>setEditing(null)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
