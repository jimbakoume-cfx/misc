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
}

/** Static dashboard files served next to the API. */
export interface Assets {
  get(path: string): { type: string; body: Uint8Array | string; immutable?: boolean } | null;
}
