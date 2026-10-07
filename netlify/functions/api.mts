import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getDatabase } from "@netlify/database";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createApp, type Seed } from "./lib/app.ts";

const ENV_KEYS = ["SESSION_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "PUBLIC_URL", "SUPABASE_URL", "SUPABASE_KEY"];

/** The APK shipped with the deploy (see `included_files` in netlify.toml); installed as release #1 on first use. */
async function loadSeed(): Promise<Seed | null> {
  const roots = [process.env.LAMBDA_TASK_ROOT, process.cwd(), join(process.cwd(), "..")].filter(Boolean) as string[];
  for (const root of roots) {
    try {
      const meta = JSON.parse(await readFile(join(root, "releases", "seed.json"), "utf8"));
      const buf = await readFile(join(root, "releases", meta.file));
      return {
        apk: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        versionCode: meta.versionCode, versionName: meta.versionName, certSha256: meta.certSha256,
      };
    } catch { /* try next root */ }
  }
  return null;
}

let handler: ((req: Request) => Promise<Response>) | undefined;

export default async (req: Request) => {
  handler ??= (() => {
    const db = getDatabase();
    const store = getStore({ name: "apks", consistency: "strong" });
    return createApp({
      db: { query: async (sql, params) => (await db.pool.query(sql, params as any[])).rows },
      blobs: {
        get: async (key) => (await store.get(key, { type: "arrayBuffer" })) as ArrayBuffer | null,
        set: async (key, data) => { await store.set(key, data); },
      },
      env: Object.fromEntries(ENV_KEYS.map((k) => [k, Netlify.env.get(k)])),
      loadSeed,
    });
  })();
  return handler(req);
};

export const config: Config = {
  path: ["/api/*", "/apk/*", "/healthz"],
};
