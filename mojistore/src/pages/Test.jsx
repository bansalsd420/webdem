// /web/src/pages/Test.jsx
// Dev control panel: full categories view + visibility toggles,
// banners with auto-sort on add and Up/Down reordering.

import { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";

const yesNo = (v) => (v ? "Yes" : "No");

export default function TestPanel() {
  // ---- BANNERS & Admin controls ----
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
  // (Visibility features removed from the project.)

  const pushToast = (msg, type = 'info', timeout = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), timeout);
  };

  // ---------- CATEGORY VISIBILITY (admin) ----------
  const [visibilityRules, setVisibilityRules] = useState([]);
  const [visLoading, setVisLoading] = useState(false);
  const [visSaving, setVisSaving] = useState(false);
  const [visForm, setVisForm] = useState({ id: 0, category_id: null, category_name: '', subcategory_ids: [], hide_from_guests: true, hide_from_users: false });
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categoryResults, setCategoryResults] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [catLoading, setCatLoading] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [subNameMap, setSubNameMap] = useState({});

  const loadVisibility = async () => {
    setVisLoading(true);
    try {
      const { data } = await axios.get('/admin/visibility', { withCredentials: true, params: { limit: 500 } });
      const items = Array.isArray(data?.items) ? data.items : [];
      setVisibilityRules(items);

      // Build a map of subcategory id -> name by fetching subcategories for each distinct category
      const catIds = Array.from(new Set(items.map(it => it.category_id).filter(Boolean)));
      if (catIds.length) {
        try {
          const pairs = await Promise.all(catIds.map(async (cid) => {
            try {
              const { data: subData } = await axios.get(`/admin/categories/${cid}/subcategories`, { withCredentials: true });
              const arr = Array.isArray(subData?.items) ? subData.items : [];
              return [cid, arr];
            } catch (e) { return [cid, []]; }
          }));
          const map = {};
          for (const [, arr] of pairs) {
            for (const s of arr) {
              if (s?.id) map[s.id] = s.name || String(s.id);
            }
          }
          setSubNameMap(map);
        } catch (e) {
          // ignore mapping failure
        }
      } else {
        setSubNameMap({});
      }
    } catch (e) { pushToast('Failed to load visibility rules: ' + (e?.response?.data?.error || e.message), 'error'); }
    finally { setVisLoading(false); }
  };

  const searchCategories = async (q) => {
    if (!q || q.length < 2) { setCategoryResults([]); return; }
    setCatLoading(true);
    try {
      const { data } = await axios.get('/admin/categories', { params: { query: q }, withCredentials: true });
      setCategoryResults(Array.isArray(data?.items) ? data.items : []);
    } catch (e) { setCategoryResults([]); }
    finally { setCatLoading(false); }
  };

  const loadSubcategories = async (categoryId) => {
    if (!categoryId) { setSubcategories([]); return; }
    setSubLoading(true);
    try {
      const { data } = await axios.get(`/admin/categories/${categoryId}/subcategories`, { withCredentials: true });
      setSubcategories(Array.isArray(data?.items) ? data.items : []);
    } catch (e) { setSubcategories([]); }
    finally { setSubLoading(false); }
  };

  useEffect(() => { loadVisibility(); }, []);

  useEffect(() => {
    // whenever category is selected in form, load its subcategories
    if (visForm?.category_id) loadSubcategories(visForm.category_id);
    else setSubcategories([]);
  }, [visForm?.category_id]);

  const editVisibility = (row) => {
    setVisForm({
      id: row.id || 0,
      category_id: row.category_id || null,
      category_name: row.category_name || (row.category_id ? String(row.category_id) : ''),
      subcategory_ids: row.subcategory_id ? [row.subcategory_id] : [],
      hide_from_guests: !!row.hide_from_guests,
      hide_from_users: !!row.hide_from_users,
    });
    // Load subcategories for this category so the edit form can show names and checkboxes
    if (row.category_id) loadSubcategories(row.category_id);
  };

  const resetVisForm = () => setVisForm({ id: 0, category_id: null, category_name: '', subcategory_ids: [], hide_from_guests: true, hide_from_users: false });

  const saveVisibility = async () => {
    setVisSaving(true);
    try {
      const payload = {
        category_id: visForm.category_id || undefined,
        subcategory_ids: Array.isArray(visForm.subcategory_ids) && visForm.subcategory_ids.length ? visForm.subcategory_ids : undefined,
        hide_from_guests: visForm.hide_from_guests ? 1 : 0,
        hide_from_users: visForm.hide_from_users ? 1 : 0,
        created_by: 0,
      };

      if (visForm.id && visForm.id > 0) {
        // patch only flags
        await axios.patch(`/admin/visibility/${visForm.id}`, { hide_from_guests: payload.hide_from_guests, hide_from_users: payload.hide_from_users }, { withCredentials: true });
        pushToast('Updated visibility rule', 'success');
      } else {
        await axios.post('/admin/visibility', payload, { withCredentials: true });
        pushToast('Created visibility rule(s)', 'success');
      }
      await loadVisibility();
      resetVisForm();
    } catch (e) {
      pushToast('Save failed: ' + (e?.response?.data?.error || e.message), 'error');
    } finally { setVisSaving(false); }
  };

  const removeVisibility = async (id) => {
    if (!confirm('Delete visibility rule?')) return;
    try {
      await axios.delete(`/admin/visibility/${id}`, { withCredentials: true });
      pushToast('Deleted', 'success');
      await loadVisibility();
    } catch (e) { pushToast('Delete failed: ' + (e?.response?.data?.error || e.message), 'error'); }
  };

  // ---- BANNERS ----
  const [slot, setSlot] = useState("hero");
  const [banners, setBanners] = useState([]);
  const [editing, setEditing] = useState(null);
  const [savingBan, setSavingBan] = useState(false);
  const [reordering, setReordering] = useState(false);
  // Broadcasts
  const [broadcasts, setBroadcasts] = useState([]);
  const [editingBroadcast, setEditingBroadcast] = useState(null);
  const [savingBroadcast, setSavingBroadcast] = useState(false);

  const loadBanners = async (s = slot) => {
    const { data } = await axios.get("/test/banners", { withCredentials: true, params: { slot: s } });
    setBanners(Array.isArray(data) ? data : []);
  };
  const loadBroadcasts = async () => {
    try {
      const { data } = await axios.get('/test/broadcasts', { withCredentials: true });
      setBroadcasts(Array.isArray(data) ? data : []);
    } catch (e) { setBroadcasts([]); }
  };
  useEffect(() => { loadBanners(slot); }, [slot]);
  useEffect(() => { loadBroadcasts(); }, []);

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

      {/* Category visibility admin panel */}
      <section className="panel">
        <div className="flex" style={{justifyContent:'space-between', alignItems:'center'}}>
          <h2 className="text-lg font-semibold">Category Visibility (Admin)</h2>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <input placeholder="Search categories" value={categoryQuery} onChange={(e)=>{ setCategoryQuery(e.target.value); searchCategories(e.target.value); }} style={{padding:'6px 8px', border:'1px solid #ddd', borderRadius:8}} />
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 380px', gap:12, marginTop:12}}>
          <div>
            <div style={{marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div><b>Rules</b> <span className="muted">({visibilityRules.length})</span></div>
              <div><button className="btn light" onClick={()=>{ resetVisForm(); setVisibilityRules([]); loadVisibility(); }}>Reload</button></div>
            </div>
            <div>
              {visLoading ? <div>Loading…</div> : (
                <table className="tbl">
                  <thead><tr><th>Category</th><th>Subcategory</th><th>Guests</th><th>Users</th><th></th></tr></thead>
                  <tbody>
                    {visibilityRules.map(r => (
                      <tr key={r.id}>
                        <td>{r.category_name || r.category_id}</td>
                        <td>{r.subcategory_id ? (subNameMap[r.subcategory_id] || r.subcategory_id) : '—'}</td>
                        <td>{r.hide_from_guests ? 'Yes' : 'No'}</td>
                        <td>{r.hide_from_users ? 'Yes' : 'No'}</td>
                        <td style={{textAlign:'right'}}>
                          <button className="btn sm light" onClick={()=>editVisibility(r)}>Edit</button>
                          <button className="btn sm" onClick={()=>removeVisibility(r.id)} style={{marginLeft:8}}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    {!visibilityRules.length && <tr><td colSpan={5} className="muted">No rules defined</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div style={{background:'#fff', padding:12, border:'1px solid #eee', borderRadius:8}}>
            <h3 className="font-medium mb-2">{visForm.id ? 'Edit rule' : 'Create rule'}</h3>
            <div style={{display:'grid', gap:8}}>
              <div>
                <label className="muted">Category</label>
                <input placeholder="Type to search..." value={visForm.category_name || ''} onChange={(e)=>{ setVisForm({...visForm, category_name: e.target.value, category_id: null}); setCategoryQuery(e.target.value); searchCategories(e.target.value); }} style={{width:'100%', padding:8, border:'1px solid #ddd', borderRadius:6}} />
                {catLoading ? <div className="muted">Searching…</div> : (categoryResults.length > 0 && (
                  <div style={{border:'1px solid #eee', background:'#fff', marginTop:6, borderRadius:6, maxHeight:160, overflow:'auto'}}>
                    {categoryResults.map(c => (
                      <div key={c.id} style={{padding:8, borderBottom:'1px solid #fafafa', cursor:'pointer'}} onClick={()=>{ setVisForm({...visForm, category_id:c.id, category_name:c.name}); setCategoryResults([]); loadSubcategories(c.id); }}>{c.name} <span className="muted">#{c.id}</span></div>
                    ))}
                  </div>
                ))}
              </div>

              <div>
                <label className="muted">Subcategories (optional)</label>
                {subLoading ? <div className="muted">Loading subcategories…</div> : (
                  <div style={{display:'grid', gap:6}}>
                    {subcategories.map(s => (
                      <label key={s.id} style={{display:'flex', gap:8, alignItems:'center'}}>
                        <input type="checkbox" checked={visForm.subcategory_ids?.includes(s.id)} onChange={(e)=>{
                          const next = new Set(visForm.subcategory_ids || []);
                          if (e.target.checked) next.add(s.id); else next.delete(s.id);
                          setVisForm({...visForm, subcategory_ids: Array.from(next)});
                        }} />
                        <span>{s.name}</span>
                      </label>
                    ))}
                    {!subcategories.length && <div className="muted">No subcategories</div>}
                  </div>
                )}
              </div>

              <div style={{display:'flex', gap:8}}>
                <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked={!!visForm.hide_from_guests} onChange={(e)=>setVisForm({...visForm, hide_from_guests: e.target.checked})} /> <span>Hide from guests</span></label>
                <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked={!!visForm.hide_from_users} onChange={(e)=>setVisForm({...visForm, hide_from_users: e.target.checked})} /> <span>Hide from logged-in users</span></label>
              </div>

              <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                <button className="btn light" onClick={resetVisForm}>Reset</button>
                <button className="btn" onClick={saveVisibility} disabled={visSaving}>{visSaving ? 'Saving…' : (visForm.id ? 'Update' : 'Create')}</button>
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
          
          {/* Helpful list for admins: what can be flushed and example keys */}
          <div style={{marginTop:12, borderTop:'1px dashed #eee', paddingTop:12}}>
            <h3 style={{margin:0, marginBottom:8}}>Cache flush options — quick reference</h3>
            <div className="muted" style={{fontSize:'.95rem', lineHeight:1.4}}>
              Use the controls above to flush a single cache key or all keys with a given prefix. Below are the common options and exact examples used in this app.
            </div>
            <ul style={{marginTop:8, marginBottom:0, paddingLeft:18, lineHeight:1.6}}>
              <li>
                <strong>Flush exact key</strong> — removes one cache entry.
                <div className="muted" style={{fontSize:'.85rem'}}>Example: <code>products:v1:7f3a2b</code> &nbsp;→ removes the cached product-list page whose cache key is exactly this string.</div>
              </li>
              <li>
                <strong>Flush by prefix</strong> — removes every key that starts with the prefix.
                <div className="muted" style={{fontSize:'.85rem'}}>Example: <code>products:v1:</code> &nbsp;→ removes all product list pages and related product list caches (useful after bulk updates).</div>
              </li>
              <li>
                <strong>Common product-key patterns</strong> — you can target these with exact keys or prefixes.
                <div className="muted" style={{fontSize:'.85rem'}}>
                  Examples:
                  <ul style={{margin:'6px 0 0 18px'}}>
                    <li><code>products:v1:{'{'}hash{'}'}</code> — cached ERP product-list page for a specific query/page.</li>
                    <li><code>products:v1:category:{'{'}categoryId{'}'}:page:{'{'}n{'}'}</code> — cached category page.</li>
                    <li><code>products:v1:brand:{'{'}brandId{'}'}:page:{'{'}n{'}'}</code> — cached brand listing.</li>
                    <li><code>products:v1:ids:{'{'}id,id,id{'}'}</code> — cached list fetched by explicit ids (useful for wishlist autobake).</li>
                  </ul>
                </div>
              </li>
              <li>
                <strong>User / session keys</strong>
                <div className="muted" style={{fontSize:'.85rem'}}>Examples: <code>wishlist:v1:user:42</code>, <code>cart:v1:user:42:loc:3</code>. Flushing these removes cached per-user lists — use with care.</div>
              </li>
              <li>
                <strong>Front page & misc</strong>
                <div className="muted" style={{fontSize:'.85rem'}}>Examples: <code>home:v1</code>, <code>home:banners:v1</code>, <code>products:search:{'{'}term{'}'}</code>. Flushing <code>home:v1</code> is useful after banner or broadcast changes.</div>
              </li>
              <li>
                <strong>Load stats</strong> — use <em>Load cache stats</em> to inspect current counts/keys on the server (read-only).
              </li>
            </ul>

            <div style={{marginTop:10}} className="muted"><strong>Tip:</strong> prefer prefix flush for related groups (for example clear <code>products:v1:</code> after product imports). Use exact-key flush to target one specific cache entry (safer).</div>
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

      {/* Broadcasts */}
      <section className="panel">
        <div className="flex" style={{justifyContent:'space-between', alignItems:'center'}}>
          <h2 className="text-lg font-semibold">Home Broadcasts</h2>
          <div>
            <button className="btn" onClick={() => setEditingBroadcast({ id:0, title:'', body:'', active:1 })}>New broadcast</button>
          </div>
        </div>
        <div style={{marginTop:12}}>
          {broadcasts.length === 0 ? <div style={{color:'#777'}}>No broadcasts</div> : broadcasts.map(b => (
            <div key={b.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:8, border:'1px solid #eee', borderRadius:8, marginTop:8}}>
              <div>
                <div style={{fontWeight:700}}>{b.title || '(no title)'}</div>
                <div style={{color:'#555'}} dangerouslySetInnerHTML={{__html: (b.body || '').slice(0,400)}} />
              </div>
              <div style={{display:'flex', gap:8}}>
                <button className="btn light" onClick={() => setEditingBroadcast(b)}>Edit</button>
                <button className="btn" onClick={async ()=>{ if(!confirm('Delete?')) return; await axios.delete(`/test/broadcasts/${b.id}`, { withCredentials:true }); await loadBroadcasts(); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        {editingBroadcast && (
          <div style={{marginTop:12, background:'#fff', padding:12, border:'1px solid #eee'}}>
            <div style={{marginBottom:8}}><input placeholder="Title" value={editingBroadcast.title} onChange={(e)=>setEditingBroadcast({...editingBroadcast, title:e.target.value})} style={{width:'100%', padding:8, border:'1px solid #ddd'}}/></div>
            <div style={{marginBottom:8}}><textarea placeholder="Body (HTML allowed)" value={editingBroadcast.body} onChange={(e)=>setEditingBroadcast({...editingBroadcast, body:e.target.value})} style={{width:'100%', minHeight:120, padding:8, border:'1px solid #ddd'}}/></div>
            <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn light" onClick={()=>setEditingBroadcast(null)}>Cancel</button>
              <button className="btn" onClick={async ()=>{
                try { setSavingBroadcast(true); await axios.post('/test/broadcasts', editingBroadcast, { withCredentials:true }); setEditingBroadcast(null); await loadBroadcasts(); } catch(e){ alert('Save failed: '+(e?.response?.data?.error||e.message)); } finally { setSavingBroadcast(false); }
              }}>{savingBroadcast ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
