// Overview — compact sticky sidebar with computed stats (no API changes)
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../state/auth";

export default function Overview() {
  const auth = useAuth();
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState({
    advance: null,
    balanceDue: null,
    totalSales: null,
    totalInvoice: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Use Auth context to avoid duplicate /account/me probes.
        // If we don't have an authenticated user, skip the heavy account calls.
  if (!auth?.isAuthenticated) return;

        const meData = auth.user || null;
        if (!alive) return;
        setMe(meData || null);

        // derive totals from existing endpoints
        const [invRes, payRes, ordRes] = await Promise.allSettled([
          api.get("/account/invoices"),
          api.get("/account/payments"),
          api.get("/account/orders"),
        ]);

        const invoices = invRes.status === "fulfilled" && Array.isArray(invRes.value.data) ? invRes.value.data : [];
        const payments = payRes.status === "fulfilled" && Array.isArray(payRes.value.data) ? payRes.value.data : [];
        const orders = ordRes.status === "fulfilled" && Array.isArray(ordRes.value.data) ? ordRes.value.data : [];

        const totalInvoice = invoices.reduce((s, r) => s + Number(r.final_total || 0), 0);
        const totalPaid = payments.reduce((s, r) => s + Number(r.amount || 0), 0);
        const balanceDue = Math.max(totalInvoice - totalPaid, 0);
        const totalSales = orders.reduce((s, r) => s + Number(r.final_total || 0), 0);

        setStats({
          advance: meData?.advance_balance ?? null,
          balanceDue,
          totalSales,
          totalInvoice,
        });
      } catch {}
    })();
    return () => { alive = false; };
  }, [auth]);

  const initial =
    me?.business_name?.[0]?.toUpperCase?.() ||
    me?.first_name?.[0]?.toUpperCase?.() ||
    me?.email?.[0]?.toUpperCase?.() || "M";

  const money = (n) => {
    if (typeof n !== "number") return "—";
    try {
      return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    } catch {
      return `$ ${n.toFixed(2)}`;
    }
  };

  return (
    <div className="ov-card">
      <div className="ov-ident">
        <div className="ov-avatar" aria-hidden="true">{initial}</div>
        <div className="ov-ident-main">
          <div className="ov-title">{me?.business_name || "Your business"}</div>
          <div className="ov-sub">{me?.email || "—"}</div>
        </div>
      </div>

      <div className="ov-stats">
        <div className="ov-stat">
          <div className="ov-stat-val">{money(stats.advance)}</div>
          <div className="ov-stat-label">Advance</div>
        </div>
        <div className="ov-stat">
          <div className="ov-stat-val">{money(stats.balanceDue)}</div>
          <div className="ov-stat-label">Balance Due</div>
        </div>
        <div className="ov-stat">
          <div className="ov-stat-val">{money(stats.totalSales)}</div>
          <div className="ov-stat-label">Total Sales</div>
        </div>
        <div className="ov-stat">
          <div className="ov-stat-val">{money(stats.totalInvoice)}</div>
          <div className="ov-stat-label">Total Invoice</div>
        </div>
      </div>

      {/* minimal meta (no ids/group) */}
      <div className="ov-meta">
        <div>
          <div className="ov-meta-k">Contact</div>
          <div className="ov-meta-v">
            {me?.first_name ? `${me.first_name} ${me?.last_name || ""}` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
