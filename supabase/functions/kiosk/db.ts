/** Minimal async SQL interface so the app can run on Supabase Postgres, or an in-memory Postgres (PGlite) in tests. */
export interface Db {
  query(sql: string, params: unknown[]): Promise<Record<string, any>[]>;
}

/** Converts `?` placeholders to Postgres `$1, $2, …`. Our SQL never contains a literal `?` outside jsonb operators,
 *  which are written as `??` and restored here. */
export function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?\?|\?/g, (m) => (m === "??" ? "?" : `$${++i}`));
}

/** Where APK files live: Supabase Storage in production, a Map in tests and the dev server. */
export interface BlobStore {
  get(key: string): Promise<ArrayBuffer | null>;
  set(key: string, data: ArrayBuffer, contentType?: string): Promise<void>;
  /** Public base URL for `${publicBase}/${key}` downloads (CDN with Content-Length and ranges), if any. */
  publicBase?: string;
  /** One-time address the browser can PUT a file to, so big uploads never pass through the API (which must answer within 150 s). */
  signUpload?(key: string): Promise<string>;
  /** Renames a stored file. Throws when the destination already exists. */
  move?(from: string, to: string): Promise<void>;
  /** Deletes stored files; missing ones are ignored. */
  remove?(keys: string[]): Promise<void>;
  /** Files directly under a folder ("" = top level), with their age and size. */
  list?(prefix: string): Promise<{ name: string; createdAt: number; size?: number }[]>;
  /** Stores one dashboard file (index.html, app.js, …) where `Assets` will read it from; absent when the files ship with the code. */
  setStatic?(path: string, data: ArrayBuffer, contentType: string): Promise<void>;
}

/** Static dashboard files served next to the API. */
export interface Assets {
  get(path: string): Promise<{ type: string; body: Uint8Array | string; immutable?: boolean } | null> | { type: string; body: Uint8Array | string; immutable?: boolean } | null;
}

export const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".ps1": "text/plain; charset=utf-8", ".sh": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};
export const staticType = (path: string) => STATIC_TYPES[path.slice(path.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";
