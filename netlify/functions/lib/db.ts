/** Minimal async SQL interface so the app can run on Netlify Database (Postgres) or an in-memory Postgres in tests. */
export interface Db {
  query(sql: string, params: unknown[]): Promise<Record<string, any>[]>;
}

/** Converts `?` placeholders to Postgres `$1, $2, …`. Our SQL never contains a literal `?`. */
export function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export interface BlobStore {
  get(key: string): Promise<ArrayBuffer | null>;
  set(key: string, data: ArrayBuffer): Promise<void>;
}
