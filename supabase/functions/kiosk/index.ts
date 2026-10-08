// Supabase Edge Function entry point: dashboard + API in one function, Postgres through the built-in pooler,
// APK files in the public "apk" Storage bucket. Phones check in through PostgREST (see docs/AGENT_PROTOCOL.md),
// so this function mostly serves the dashboard.
import postgres from "postgres";
import { createApp } from "./app.ts";
import { ASSETS } from "./assets.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
const jsonDefault = (s: string) => { try { return JSON.parse(s)?.default ?? ""; } catch { return ""; } };
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || jsonDefault(env("SUPABASE_SECRET_KEYS"));
const anonKey = env("SUPABASE_ANON_KEY") || jsonDefault(env("SUPABASE_PUBLISHABLE_KEYS"));
const publicUrl = env("PUBLIC_URL") || `${supabaseUrl}/functions/v1/kiosk`;

// Transaction-mode pooler: no prepared statements, few connections per isolate.
const sql = postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });

const BUCKET = "apk";
const storage = {
  publicBase: `${supabaseUrl}/storage/v1/object/public/${BUCKET}`,
  async get(key: string): Promise<ArrayBuffer | null> {
    const r = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${key}`, { headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey } });
    if (!r.ok) return null;
    return r.arrayBuffer();
  },
  async set(key: string, data: ArrayBuffer, contentType = "application/octet-stream"): Promise<void> {
    const r = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "content-type": contentType, "x-upsert": "true", "cache-control": "3600" },
      body: data,
    });
    if (!r.ok) throw new Error(`storage upload failed: ${r.status} ${await r.text()}`);
  },
};

const decoded = new Map<string, Uint8Array>();
const assets = {
  get(path: string) {
    const a = (ASSETS as Record<string, { type: string; b64: string; immutable?: boolean }>)[path];
    if (!a) return null;
    let body = decoded.get(path);
    if (!body) { body = Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)); decoded.set(path, body); }
    return { type: a.type, body, immutable: a.immutable };
  },
};

const app = createApp({
  db: { query: (text, params) => sql.unsafe(text, params as any[]) as unknown as Promise<Record<string, any>[]> },
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
