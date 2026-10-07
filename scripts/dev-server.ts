// Local copy of the whole site for testing: static dashboard + API on an in-memory Postgres (PGlite).
// Usage: PORT=8099 node --disable-warning=ExperimentalWarning scripts/dev-server.ts
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../netlify/functions/lib/app.ts";

const root = new URL("..", import.meta.url).pathname;
const pg = new PGlite();
const mdir = join(root, "netlify/database/migrations");
for (const m of readdirSync(mdir).sort()) await pg.exec(readFileSync(join(mdir, m, "migration.sql"), "utf8"));
const blobs = new Map<string, ArrayBuffer>();
const port = Number(process.env.PORT ?? 8099);
const origin = `http://localhost:${port}`;
const app = createApp({
  db: { query: async (sql, params) => (await pg.query(sql, params as any[])).rows as any[] },
  blobs: { get: async (k) => blobs.get(k) ?? null, set: async (k, v) => { blobs.set(k, v); } },
  env: { SESSION_SECRET: "dev-secret", ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@test.com", ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "dev-password-123" },
});

// same headers as netlify.toml so CSP problems show up locally
const toml = readFileSync(join(root, "netlify.toml"), "utf8");
const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)?.[1] ?? "";
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", origin);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/apk/") || url.pathname === "/healthz") {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const r = await app(new Request(url, { method: req.method, headers: req.headers as any, body: ["GET", "HEAD"].includes(req.method!) ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let file = join(root, "public", url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(join(root, "public")) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "content-security-policy": csp });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`dev server on ${origin}`));
