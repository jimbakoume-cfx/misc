// Confiance Kiosk dashboard on Cloudflare Pages (https://confiance-kiosk.pages.dev).
// Pages runs this file for every request ("advanced mode"). Static files come from env.ASSETS (the repository's
// public/ folder); /api, /apk and /healthz are proxied to the Supabase Edge Function so the page stays same-origin
// (cookies work, nothing to configure in the browser).

// Replace the project ref here if the backend moves to another Supabase project.
const SUPABASE_URL = "https://qzkoowbcngcdnhqystwz.supabase.co";
// The region of the database: the function runs next to it (a page costs ~0.3 s instead of ~2.3 s).
const API_REGION = "eu-west-3";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
  "content-security-policy":
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' ${SUPABASE_URL}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`,
};

const STORE = `${SUPABASE_URL}/storage/v1/object/public/apk`;

/**
 * Apps too big for one stored file are kept in pieces (<sha256>.apk.p00, .p01, ...) described by <sha256>.apk.json.
 * This sends them to the phone as one file, piece after piece, without holding anything in memory.
 * Returns null when the file is not stored that way.
 */
async function bigFile(sha, req, ctx) {
  const man = await fetch(`${STORE}/${sha}.apk.json`);
  if (!man.ok) { await man.body?.cancel(); return null; }
  const { size, parts } = await man.json();
  if (!(size > 0) || !Array.isArray(parts) || !parts.length) return null;
  const headers = {
    "content-type": "application/vnd.android.package-archive",
    "content-length": String(size),
    "content-disposition": `attachment; filename="${sha.slice(0, 12)}.apk"`,
    "cache-control": "public, max-age=31536000, immutable",
  };
  if (req.method === "HEAD") return new Response(null, { headers });
  const { readable, writable } = new FixedLengthStream(size);
  ctx.waitUntil((async () => {
    try {
      for (let i = 0; i < parts.length; i++) {
        const r = await fetch(`${STORE}/${sha}.apk.p${String(i).padStart(2, "0")}`);
        if (!r.ok || !r.body) throw new Error(`piece ${i}: ${r.status}`);
        await r.body.pipeTo(writable, { preventClose: true });
      }
      await writable.close();
    } catch (e) { await writable.abort(e).catch(() => {}); }
  })());
  return new Response(readable, { headers });
}

const isApi = (p) => p === "/healthz" || p.startsWith("/api/") || p.startsWith("/apk/");

/** Forwards one request to the Supabase function and streams the answer back unchanged. */
async function proxy(req, url) {
  const target = `${SUPABASE_URL}/functions/v1/kiosk${url.pathname}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.set("x-region", API_REGION);
  // The function throttles sign-ins per client address and trusts this header from the hosting proxy. Here it
  // carries the address Cloudflare saw, so every visitor is not counted as one Cloudflare address.
  const ip = req.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-nf-client-connection-ip", ip); else headers.delete("x-nf-client-connection-ip");
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const res = await fetch(target, { method: req.method, headers, body: hasBody ? req.body : undefined, redirect: "manual" });
  return new Response(res.body, res);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    const big = (req.method === "GET" || req.method === "HEAD") && /^\/apk\/([0-9a-f]{64})\.apk$/.exec(path);
    if (big) {
      try { const res = await bigFile(big[1], req, ctx); if (res) return res; }
      catch { return Response.json({ error: "The file could not be read. Try again in a moment." }, { status: 502 }); }
    }
    if (isApi(path)) {
      try { return await proxy(req, url); }
      catch { return Response.json({ error: "The server could not be reached. Try again in a moment." }, { status: 502 }); }
    }
    // Stable address of the newest app file (setup QR and USB script use the storage address directly).
    if (path === "/kiosk-agent.apk") return Response.redirect(`${SUPABASE_URL}/storage/v1/object/public/apk/kiosk-agent.apk`, 302);

    const asset = await env.ASSETS.fetch(req);
    const res = new Response(asset.body, asset);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    if (path.startsWith("/fonts/")) res.headers.set("cache-control", "public, max-age=31536000, immutable");
    else if (path === "/" || /\.(js|css|html)$/.test(path)) res.headers.set("cache-control", "no-cache");
    if (path.startsWith("/setup/") && asset.ok) {
      // Setup scripts are downloaded, never shown in the browser.
      res.headers.set("content-type", "text/plain; charset=utf-8");
      res.headers.set("content-disposition", "attachment");
    }
    return res;
  },
};
