// api/src/routes/test.js
import { Router } from 'express';

const router = Router();

// --- env (no secrets echoed back) ---
const BASE = (process.env.CONNECTOR_BASE_URL || '').replace(/\/+$/, '');
const PREFIX = process.env.CONNECTOR_PREFIX || '/connector/api';
const STATIC_BEARER = (process.env.CONNECTOR_BEARER || '').trim();

const TOKEN_PATHS = [
  process.env.CONNECTOR_TOKEN_PATH || '/oauth/token',
  '/connector/oauth/token',
  '/connector/api/oauth/token',
];

const CREDS = {
  client_id: process.env.CONNECTOR_CLIENT_ID || '',
  client_secret: process.env.CONNECTOR_CLIENT_SECRET || '',
  // Name it explicitly to avoid any confusion with OS USERNAME
  proj_username: process.env.CONNECTOR_USERNAME || '',
  proj_password: process.env.CONNECTOR_PASSWORD || '',
  scope: process.env.CONNECTOR_SCOPE || '*',
};

function urlJoin(...parts) {
  return parts
    .map((p, i) => (i === 0 ? String(p || '').replace(/\/+$/, '') : String(p || '').replace(/^\/+|\/+$/g, '')))
    .filter(Boolean)
    .join('/');
}

async function tryFetchToken() {
  const tries = [];
  if (STATIC_BEARER) {
    return { ok: true, from: 'env', token: STATIC_BEARER, tries };
  }

  for (const p of TOKEN_PATHS) {
    const url = urlJoin(BASE, p);
    const form = new URLSearchParams({
      grant_type: 'password',
      client_id: CREDS.client_id,
      client_secret: CREDS.client_secret,
      username: CREDS.proj_username,
      password: CREDS.proj_password,
      scope: CREDS.scope,
    });

    let status = 0;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: form.toString(),
      });
      status = resp.status;
      if (resp.ok) {
        const j = await resp.json();
        if (j?.access_token) return { ok: true, from: p, token: j.access_token, tries };
      }
    } catch (e) {
      status = -1;
    }
    tries.push({ path: p, status });
  }
  return { ok: false, tries };
}

router.get('/health', async (_req, res) => {
  try {
    // 1) token
    const tok = await tryFetchToken();

    // 2) ping a safe list endpoint (brands) if we have a token
    let brandPing = null;
    if (tok.ok) {
      const u = urlJoin(BASE, PREFIX, '/brand');
      try {
        const r = await fetch(u, { headers: { Authorization: `Bearer ${tok.token}`, Accept: 'application/json' } });
        const data = r.ok ? await r.json() : null;
        const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        brandPing = { status: r.status, count: items.length };
      } catch {
        brandPing = { status: 0, count: 0 };
      }
    }

    // never return secrets
    return res.json({
      ok: tok.ok && (!!brandPing?.status ? brandPing.status < 500 : true),
      config: {
        base: BASE,
        apiPrefix: PREFIX,
        tokenPaths: TOKEN_PATHS,
        clientId_present: !!CREDS.client_id,
        clientSecret_present: !!CREDS.client_secret,
        username_present: !!CREDS.proj_username,
      },
      oauth: {
        usingStaticBearer: !!STATIC_BEARER,
        tries: tok.tries || [],
        obtained: !!tok.ok,
        from: tok.from || null,
      },
      brandPing,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'test_health_failed' });
  }
});

export default router;
