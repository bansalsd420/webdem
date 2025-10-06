// api/src/routes/devProbe.js
import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { erpFetch } from "../lib/erp.js";

const router = Router();
const BIZ = Number(process.env.BUSINESS_ID || 9);

const withBiz = (q = {}, bid) =>
  Object.prototype.hasOwnProperty.call(q, "business_id")
    ? q
    : { ...q, business_id: bid };

const isNumeric = (v) => /^[0-9]+$/.test(String(v || "").trim());

// GET /api/dev/contact?cid=...&bid=...
router.get("/contact", authRequired, async (req, res) => {
  const cid = (req.query.cid ?? "").toString().trim();
  const email = (req.query.email ?? "").toString().trim().toLowerCase();
  const bid = Number(req.query.bid ?? BIZ) || BIZ;
  const per_page = Number(req.query.per_page ?? 1);

  if (!cid && !email) {
    return res.status(400).json({ error: "pass ?cid=<id|code> or ?email=<email>" });
  }

  const attempts = [];
  const run = async (path, query, label) => {
    const url = `${path}?${new URLSearchParams(query).toString()}`;
    try {
      const r = await erpFetch(path, { query });
      const txt = await r.text();
      let data; try { data = JSON.parse(txt); } catch { data = txt; }
      return { ok: r.ok, status: r.status, tried: label, url, data };
    } catch (e) {
      return { ok: false, status: 0, tried: label, url, error: String(e?.message || e) };
    }
  };

  if (cid) {
    if (isNumeric(cid)) {
      attempts.push(await run(`/contactapi/${cid}`, withBiz({}, bid), "show/:id"));
      if (attempts[0].ok) return res.json(attempts[0]);
      attempts.push(await run(`/contactapi`, withBiz({ contact_id: cid, per_page }, bid), "query?contact_id"));
      if (attempts[1].ok) return res.json(attempts[1]);
    } else {
      attempts.push(await run(`/contactapi`, withBiz({ contact_id: cid, per_page }, bid), "query?contact_id"));
      if (attempts[0].ok) return res.json(attempts[0]);
      attempts.push(await run(`/contactapi/${cid}`, withBiz({}, bid), "show/:id (fallback)"));
      if (attempts[1].ok) return res.json(attempts[1]);
    }
  }

  if (email && (!cid || !attempts.some(a => a.ok))) {
    attempts.push(await run(`/contactapi`, withBiz({ email, per_page }, bid), "query?email"));
    if (attempts.at(-1).ok) return res.json(attempts.at(-1));
  }

  return res.status(404).json({ ok: false, status: 404, message: "No contact found", attempts });
});

export default router;
