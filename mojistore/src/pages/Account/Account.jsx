// src/pages/Account/Account.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import "./account.css";

import OrdersTab from "./tabs/Orders.jsx";
import PaymentsTab from "./tabs/Payments.jsx";
import LedgerTab from "./tabs/Ledger.jsx";
import AddressesTab from "./tabs/Addresses.jsx";
import DocumentsTab from "./tabs/Documents.jsx";
import ProfileTab from "./tabs/Profile.jsx";

// same in-memory cache used by the tab pages
const CACHE = (window.__accountCache ||= {});
const TTL = 2 * 60 * 1000; // 2 minutes

const TABS = [
  { key: "orders",    label: "Orders",    Comp: OrdersTab },
  { key: "ledger",    label: "Ledger",    Comp: LedgerTab },
  { key: "documents", label: "Documents", Comp: DocumentsTab },
  { key: "addresses", label: "Addresses", Comp: AddressesTab },
  { key: "payments",  label: "Payments",  Comp: PaymentsTab },
  { key: "profile",   label: "Profile",   Comp: ProfileTab },
];

export default function Account() {
  const [params, setParams] = useSearchParams();

  // ---------- greeting ----------
  const [displayName, setDisplayName] = useState("there");

  useEffect(() => {
    let mounted = true;

    // prefer profile cache if present
    const cachedProfile = CACHE["account:profile"]?.value;
    if (cachedProfile?.name) setDisplayName(cachedProfile.name);

    (async () => {
      try {
        // use /account/profile (works with your accountProfile route and respects auth)
        const r = await api.get("/account/profile", { validateStatus: () => true, withCredentials: true });
        if (!mounted) return;
        if (r.status === 200 && r.data?.name) {
          CACHE["account:profile"] = { t: Date.now(), value: r.data };
          setDisplayName(r.data.name);
        }
      } catch {
        // soft fail; keep whatever we have
      }
    })();

    return () => { mounted = false; };
  }, []);

  // ---------- active tab ----------
  const activeKey = useMemo(() => {
    const q = (params.get("tab") || "").toLowerCase();
    return TABS.find((t) => t.key === q)?.key || "profile";
  }, [params]);

  const ActiveComp = useMemo(
    () => TABS.find((t) => t.key === activeKey)?.Comp || ProfileTab,
    [activeKey]
  );

  function setTab(key) {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  }

  // ---------- react to location change broadcast (e.g., location switcher) ----------
  const [locTick, setLocTick] = useState(0);
  useEffect(() => {
    const onLoc = () => setLocTick((x) => x + 1);
    window.addEventListener("location:changed", onLoc);
    return () => window.removeEventListener("location:changed", onLoc);
  }, []);

  // ---------- prewarm tab data (stale-while-revalidate) ----------
  useEffect(() => {
    let cancelled = false;

    const now = Date.now();
    const fresh = (k) => CACHE[k] && now - CACHE[k].t < TTL;

    async function prewarm() {
      // orders page 1
      const ordKey = "account:orders?page=1&limit=20";
      if (!fresh(ordKey)) {
        api.get("/account/orders?page=1&limit=20", { withCredentials: true, validateStatus: () => true })
          .then(r => {
            if (cancelled) return;
            const rows = Array.isArray(r.data) ? r.data : (r.data?.rows || []);
            const tot  = Number(r.headers?.["x-total-count"] || rows.length || 0);
            CACHE[ordKey] = { t: Date.now(), value: { rows, total: tot } };
          })
          .catch(() => {});
      }

      // invoices page 1
      const invKey = "account:invoices?page=1&limit=20";
      if (!fresh(invKey)) {
        api.get("/account/invoices?page=1&limit=20", { withCredentials: true, validateStatus: () => true })
          .then(r => {
            if (cancelled) return;
            const data = Array.isArray(r.data) ? r.data : (r.data?.items || []);
            const tot  = Number(r.headers?.["x-total-count"] || r.data?.total || data.length || 0);
            CACHE[invKey] = { t: Date.now(), value: { rows: data, total: tot } };
          })
          .catch(() => {});
      }

      // payments page 1
      const payKey = "account:payments?page=1&limit=20";
      if (!fresh(payKey)) {
        api.get("/account/payments?page=1&limit=20", { withCredentials: true, validateStatus: () => true })
          .then(r => {
            if (cancelled) return;
            const rows = Array.isArray(r.data) ? r.data : (r.data?.rows || []);
            const tot  = Number(r.headers?.["x-total-count"] || rows.length || 0);
            CACHE[payKey] = { t: Date.now(), value: { rows, total: tot } };
          })
          .catch(() => {});
      }

      // ledger page 1 (no filters)
      const ledKey = "account:ledger?page=1&limit=20";
      if (!fresh(ledKey)) {
        api.get("/account/ledger?page=1&limit=20", { withCredentials: true, validateStatus: () => true })
          .then(r => {
            if (cancelled) return;
            const rows = Array.isArray(r.data?.rows) ? r.data.rows : [];
            const summary = r.data?.summary || { range:{total_invoice:0,total_paid:0,balance_due:0}, overall:{total_invoice:0,total_paid:0,balance_due:0} };
            const tot = Number(r.headers?.["x-total-count"] || 0);
            CACHE[ledKey] = { t: Date.now(), value: { rows, summary, total: tot } };
          })
          .catch(() => {});
      }

      // addresses & profile (simple keys used by tabs)
      if (!fresh("account:addresses")) {
        api.get("/account/addresses", { withCredentials: true, validateStatus: () => true })
          .then(r => {
            if (cancelled || r.status !== 200) return;
            const list = Array.isArray(r.data) ? r.data : [];
            CACHE["account:addresses"] = { t: Date.now(), value: list };
          })
          .catch(() => {});
      }
      if (!fresh("account:profile")) {
        api.get("/account/profile", { withCredentials: true, validateStatus: () => true })
          .then(r => { if (!cancelled && r.status === 200) CACHE["account:profile"] = { t: Date.now(), value: r.data || {} }; })
          .catch(() => {});
      }

      // documents
      if (!fresh("account:documents")) {
        api.get("/account/documents", { withCredentials: true, validateStatus: () => true })
          .then(r => {
            if (cancelled || r.status !== 200) return;
            const list = Array.isArray(r.data) ? r.data : [];
            CACHE["account:documents"] = { t: Date.now(), value: list };
          })
          .catch(() => {});
      }
    }

    prewarm();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="account-page account-root">
      <header className="account-header">
        <h1 className="account-title">Hi, {displayName}</h1>

        <nav className="account-tabs" aria-label="Account tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab ${activeKey === t.key ? "is-active" : ""}`}
              role="tab"
              aria-selected={activeKey === t.key ? "true" : "false"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="account-grid">
        <section className="account-content" role="tabpanel" aria-live="polite">
          {/* re-mount on location change so tabs can react to store/location switches */}
          <ActiveComp key={`${activeKey}-${locTick}`} />
        </section>
      </div>
    </div>
  );
}
