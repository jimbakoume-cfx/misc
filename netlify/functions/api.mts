import type { Config } from "@netlify/functions";

/**
 * Transitional proxy. The backend now runs on Supabase (see docs/DEPLOY.md); this function only keeps phones that
 * still point at the old Netlify address working until they update to agent 1.4.0, which switches to the new
 * address by itself (policy.serverUrl). Set KIOSK_UPSTREAM to the Supabase function URL, e.g.
 * https://<ref>.supabase.co/functions/v1/kiosk, then delete the Netlify site once no phone uses it any more.
 */
export default async (req: Request) => {
  const upstream = (Netlify.env.get("KIOSK_UPSTREAM") ?? "").replace(/\/$/, "");
  if (!upstream) return new Response(JSON.stringify({ error: "KIOSK_UPSTREAM is not configured" }), { status: 503, headers: { "content-type": "application/json" } });
  const url = new URL(req.url);
  const headers = new Headers(req.headers);
  headers.delete("host");
  const ip = req.headers.get("x-nf-client-connection-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  const res = await fetch(upstream + url.pathname + url.search, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    redirect: "manual",
  });
  return new Response(res.body, { status: res.status, headers: res.headers });
};

export const config: Config = {
  path: ["/api/*", "/apk/*", "/healthz"],
};
