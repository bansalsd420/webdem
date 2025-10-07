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
