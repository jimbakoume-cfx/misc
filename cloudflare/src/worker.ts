// Confiance Kiosk dashboard on Cloudflare Workers.
// Static files come from the ASSETS binding (the repository's public/ folder); /api, /apk and /healthz are proxied to
// the Supabase Edge Function so the page stays same-origin (cookies work, nothing to configure in the browser).

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL: string;
  API_REGION: string;
}

const SECURITY_HEADERS = (supabaseUrl: string): Record<string, string> => ({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
  "content-security-policy":
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' ${supabaseUrl}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`,
});

const isApi = (p: string) => p === "/healthz" || p.startsWith("/api/") || p.startsWith("/apk/");

/** Forwards one request to the Supabase function and streams the answer back unchanged. */
async function proxy(req: Request, url: URL, env: Env): Promise<Response> {
  const target = `${env.SUPABASE_URL}/functions/v1/kiosk${url.pathname}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.set("x-region", env.API_REGION);
  // The function throttles sign-ins per client address. It trusts this header from the hosting proxy (Netlify sets
  // it); here it carries the address Cloudflare saw, so every visitor is not counted as one Cloudflare address.
  const ip = req.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-nf-client-connection-ip", ip); else headers.delete("x-nf-client-connection-ip");
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const res = await fetch(target, { method: req.method, headers, body: hasBody ? req.body : undefined, redirect: "manual" });
  return new Response(res.body, res);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (isApi(path)) {
      try { return await proxy(req, url, env); }
      catch (e) { return Response.json({ error: "The server could not be reached. Try again in a moment." }, { status: 502 }); }
    }
    // Stable address of the newest app file (setup QR and USB script use the storage address directly).
    if (path === "/kiosk-agent.apk") return Response.redirect(`${env.SUPABASE_URL}/storage/v1/object/public/apk/kiosk-agent.apk`, 302);

    const asset = await env.ASSETS.fetch(req);
    const res = new Response(asset.body, asset);
    for (const [k, v] of Object.entries(SECURITY_HEADERS(env.SUPABASE_URL))) res.headers.set(k, v);
    if (path.startsWith("/fonts/")) res.headers.set("cache-control", "public, max-age=31536000, immutable");
    else if (path === "/" || /\.(js|css|html)$/.test(path)) res.headers.set("cache-control", "no-cache");
    if (path.startsWith("/setup/")) {
      // Setup scripts are downloaded, never shown in the browser.
      res.headers.set("content-type", "text/plain; charset=utf-8");
      res.headers.set("content-disposition", "attachment");
    }
    return res;
  },
};
