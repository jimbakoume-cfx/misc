// Local copy of the whole site for testing: dashboard + API on an in-memory Postgres (PGlite), APKs in memory.
// Usage: PORT=8099 node --disable-warning=ExperimentalWarning scripts/dev-server.ts
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../supabase/functions/kiosk/app.ts";

const root = new URL("..", import.meta.url).pathname;
const pg = new PGlite();
const mdir = join(root, "supabase/migrations");
for (const m of readdirSync(mdir).sort()) await pg.exec(readFileSync(join(mdir, m), "utf8"));
const blobs = new Map<string, ArrayBuffer>();
const port = Number(process.env.PORT ?? 8099);
const origin = `http://localhost:${port}`;
const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ps1": "text/plain", ".sh": "text/plain" };
const pub = join(root, "public");

const app = createApp({
  db: { query: async (sql, params) => (await pg.query(sql, params as any[])).rows as any[] },
  blobs: { get: async (k) => blobs.get(k) ?? null, set: async (k, v) => { blobs.set(k, v); } },
  // Read from disk on every request so edits show up without a restart.
  assets: { get(path) {
    const file = join(pub, path);
    if (!file.startsWith(pub) || !existsSync(file) || statSync(file).isDirectory()) return null;
    return { type: types[extname(file)] ?? "application/octet-stream", body: new Uint8Array(readFileSync(file)) };
  } },
  env: {
    PUBLIC_URL: process.env.PUBLIC_URL ?? origin, SESSION_SECRET: "dev-secret",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@test.com", ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "dev-password-123",
    SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_KEY: process.env.SUPABASE_KEY,
  },
  loadSeed: async () => {
    try {
      const meta = JSON.parse(readFileSync(join(root, "releases/seed.json"), "utf8"));
      const buf = readFileSync(join(root, "releases", meta.file));
      return { apk: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, versionCode: meta.versionCode, versionName: meta.versionName, certSha256: meta.certSha256 };
    } catch { return null; }
  },
});

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", origin);
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const r = await app(new Request(url, { method: req.method, headers: req.headers as any, body: ["GET", "HEAD"].includes(req.method!) ? undefined : Buffer.concat(chunks) }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`dev server on ${origin}`));
