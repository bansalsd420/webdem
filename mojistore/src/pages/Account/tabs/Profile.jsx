// src/pages/Account/tabs/Profile.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/axios.js";

function Stat({ label, value, money = true }) {
  const text = money ? `₹ ${Number(value || 0).toFixed(2)}` : String(value ?? "-");
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-lg font-semibold mt-1">{text}</div>
    </div>
  );
}

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", phone: "" });
  const cacheRef = useRef({ data: null, ts: 0 }); // simple 120s memo

  const TTL = 120 * 1000;

  const load = useMemo(
    () => async (force = false) => {
      setLoading(true);
      setError(null);

      const tooOld = Date.now() - cacheRef.current.ts > TTL;
      if (!force && cacheRef.current.data && !tooOld) {
        const { profile: p, summary: s } = cacheRef.current.data;
        setProfile(p); setSummary(s); setLoading(false);
        return;
      }

      try {
        const [pRes, sRes] = await Promise.all([
          api.get("/account/profile", { withCredentials: true, validateStatus: () => true }),
          api.get("/account/summary", { withCredentials: true, validateStatus: () => true }),
        ]);

        if (pRes.status !== 200) throw new Error("profile_unavailable");
        if (sRes.status !== 200) throw new Error("summary_unavailable");

        const p = pRes.data || null;
        const s = sRes.data || null;

        setProfile(p);
        setSummary(s);
        cacheRef.current = { data: { profile: p, summary: s }, ts: Date.now() };
      } catch (e) {
        console.error(e);
        setError(e?.message || "failed");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    // Prepare form when entering edit mode
    if (editing && profile) {
      setForm({
        name: profile.name || "",
        company: profile.company || "",
        phone: profile.phone || "",
      });
    }
  }, [editing, profile]);

  const onSave = async () => {
    try {
      const payload = {
        name: form.name?.trim(),
        company: form.company?.trim(),
        phone: form.phone?.trim(),
      };
      const res = await api.put("/account/profile", payload, {
        withCredentials: true,
        validateStatus: () => true,
      });
      if (res.status !== 200) throw new Error(res.data?.error || "update_failed");
      setEditing(false);
      await load(true);
    } catch (e) {
      alert(e?.message || "Update failed");
    }
  };

  if (loading) {
    return <div className="p-6 opacity-80">Loading profile…</div>;
  }
  if (error) {
    return <div className="p-6 text-red-500">Error: {String(error)}</div>;
  }
  if (!profile) {
    return <div className="p-6">No profile found.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary pane */}
      {summary && (
        <section className="rounded-2xl p-4 border border-white/10 bg-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Account Summary</h3>
            <button
              className="text-sm underline opacity-80"
              onClick={() => load(true)}
            >
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Stat label="Advance Balance" value={summary.advance_balance} />
            <Stat label="Total Sales" value={summary.total_sales} />
            <Stat label="Opening Balance" value={summary.opening_balance} />
            <Stat label="Total Invoices" value={summary.total_invoices} money={false} />
            <Stat label="Balance Due" value={summary.balance_due} />
          </div>
        </section>
      )}

      {/* Profile details / edit card */}
      <section className="rounded-2xl p-4 border border-white/10 bg-white/5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Profile</h3>
          {!editing ? (
            <button
              className="rounded-lg px-3 py-2 border"
              onClick={() => setEditing(true)}
            >
              Request a change
            </button>
          ) : null}
        </div>

        {!editing ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs opacity-70">Name</div>
              <div className="mt-1">{profile.name || "-"}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">Company</div>
              <div className="mt-1">{profile.company || "-"}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">Phone</div>
              <div className="mt-1">{profile.phone || "-"}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">Email</div>
              <div className="mt-1">{profile.email || "-"}</div>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Name</span>
              <input
                className="rounded-lg px-3 py-2 bg-white/10 border border-white/15"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your name"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Company</span>
              <input
                className="rounded-lg px-3 py-2 bg-white/10 border border-white/15"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Company name"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs opacity-70">Phone</span>
              <input
                className="rounded-lg px-3 py-2 bg-white/10 border border-white/15"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
              />
            </label>

            <div className="sm:col-span-2 flex gap-2 justify-end mt-2">
              <button
                className="rounded-lg px-3 py-2 border"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg px-3 py-2"
                style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                onClick={onSave}
              >
                Save changes
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
