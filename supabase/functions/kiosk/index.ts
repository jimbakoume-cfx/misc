// Supabase Edge Function entry point: dashboard + API in one function, Postgres through the built-in pooler,
// APK files in the public "apk" Storage bucket. Phones check in through PostgREST (see docs/AGENT_PROTOCOL.md),
// so this function mostly serves the dashboard.
import postgres from "postgres";
import { createApp } from "./app.ts";
import { staticType } from "./db.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
const jsonDefault = (s: string) => { try { return JSON.parse(s)?.default ?? ""; } catch { return ""; } };
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || jsonDefault(env("SUPABASE_SECRET_KEYS"));
const anonKey = env("SUPABASE_ANON_KEY") || jsonDefault(env("SUPABASE_PUBLISHABLE_KEYS"));
const publicUrl = env("PUBLIC_URL") || `${supabaseUrl}/functions/v1/kiosk`;

// SUPABASE_DB_URL is the *direct* connection; each isolate keeps at most two, released after 20 s idle, so a burst of
// dashboard requests stays well under the database's ~60 slots (the dashboard also loads pages one at a time).
// Optional: DB_POOLER_HOST (e.g. aws-1-eu-west-3.pooler.supabase.com) routes through the transaction-mode pooler
// instead; it is probed once per isolate and the direct connection is kept when it cannot be reached. Off by default:
// in a test the pooler answered single-row endpoints but never returned for the multi-query overview/devices ones.
const opts = { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 } as const;
const directUrl = env("SUPABASE_DB_URL");
const poolerUrl = (() => {
  try {
    const ref = /^https:\/\/([a-z0-9]+)\./.exec(supabaseUrl)?.[1];
    const host = env("DB_POOLER_HOST");
    if (!ref || !directUrl || !host) return "";
    const u = new URL(directUrl); u.username = `postgres.${ref}`; u.hostname = host; u.port = "6543"; return u.toString();
  } catch { return ""; }
})();
let sql = postgres(directUrl, opts);
const dbReady = (async () => {
  if (!poolerUrl) return;
  const c = postgres(poolerUrl, { ...opts, connect_timeout: 5 });
  try { await c`select 1`; sql = c; console.log("db: pooler", new URL(poolerUrl).hostname); }
  catch (e) { console.warn("db: pooler unavailable, using the direct connection:", (e as Error).message); await c.end({ timeout: 1 }).catch(() => {}); }
})();

// Two public buckets: "apk" for app files (phones download them straight from the CDN) and "web" for the dashboard
// files, which this function serves with its security headers. Both are created by the migrations.
const APK = "apk", WEB = "web";
async function upload(bucket: string, key: string, data: ArrayBuffer, contentType: string) {
  const r = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
    method: "POST",
    headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "content-type": contentType, "x-upsert": "true", "cache-control": "3600" },
    body: data,
  });
  if (!r.ok) throw new Error(`storage upload failed: ${r.status} ${await r.text()}`);
}
const storage = {
  publicBase: `${supabaseUrl}/storage/v1/object/public/${APK}`,
  async get(key: string): Promise<ArrayBuffer | null> {
    const r = await fetch(`${supabaseUrl}/storage/v1/object/${APK}/${key}`, { headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey } });
    if (!r.ok) return null;
    return r.arrayBuffer();
  },
  set: (key: string, data: ArrayBuffer, contentType = "application/octet-stream") => upload(APK, key, data, contentType),
  setStatic: (path: string, data: ArrayBuffer, contentType: string) => upload(WEB, path.replace(/^\//, ""), data, contentType),
};

// Dashboard files, cached per isolate for a minute so edits show up quickly after publishing.
const cache = new Map<string, { at: number; body: Uint8Array | null }>();
const assets = {
  async get(path: string) {
    const hit = cache.get(path);
    let body = hit && Date.now() - hit.at < 60_000 ? hit.body : undefined;
    if (body === undefined) {
      const r = await fetch(`${supabaseUrl}/storage/v1/object/public/${WEB}${path}`, { headers: { apikey: anonKey } });
      body = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
      cache.set(path, { at: Date.now(), body });
    }
    return body ? { type: staticType(path), body, immutable: path.endsWith(".woff2") } : null;
  },
};

const app = createApp({
  db: { query: async (text, params) => { await dbReady; return await (sql.unsafe(text, params as any[]) as unknown as Promise<Record<string, any>[]>); } },
  blobs: storage,
  assets,
  env: {
    PUBLIC_URL: publicUrl,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_KEY: anonKey,
    SESSION_SECRET: env("SESSION_SECRET") || undefined,
    ADMIN_EMAIL: env("ADMIN_EMAIL") || undefined,
    ADMIN_PASSWORD: env("ADMIN_PASSWORD") || undefined,
    RESEND_API_KEY: env("RESEND_API_KEY") || undefined,
    ALERT_FROM: env("ALERT_FROM") || undefined,
  },
});

Deno.serve((req) => app(req));
