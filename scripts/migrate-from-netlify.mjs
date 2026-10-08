// One-off: copies the fleet from the old Netlify Database (Postgres) into the Supabase project, so phones that are already
// set up stay enrolled (their device tokens are stored hashed and move as-is).
// Usage: SOURCE_URL=postgres://... (Netlify Database connection string)  TARGET_URL=postgres://... (Supabase, session pooler, port 5432)
//        node scripts/migrate-from-netlify.mjs
// Run it once, BEFORE the first phone talks to the new backend. It skips rows that already exist (by primary key).
import postgres from "postgres";

const src = postgres(process.env.SOURCE_URL ?? "", { max: 1 });
const dst = postgres(process.env.TARGET_URL ?? "", { max: 1, prepare: false });
if (!process.env.SOURCE_URL || !process.env.TARGET_URL) { console.error("Set SOURCE_URL and TARGET_URL"); process.exit(1); }

// Parents first. Columns that only exist on the target keep their defaults.
const tables = [
  ["admins", "id"], ["device_groups", "id"], ["devices", "id"], ["enroll_tokens", "token"], ["commands", "id"],
  ["releases", "id"], ["settings", "key"], ["audit", "id"], ["login_attempts", "key"],
];
const skipSettings = new Set(["public_url", "apk_base_url", "supabase_url", "supabase_anon_key", "session_secret", "cron_key"]);
for (const [table, pk] of tables) {
  const rows = await src.unsafe(`SELECT * FROM ${table}`);
  let n = 0;
  for (const row of rows) {
    if (table === "settings" && skipSettings.has(row.key)) continue;
    const cols = Object.keys(row);
    const r = await dst.unsafe(
      `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT ("${pk}") DO NOTHING`,
      cols.map((c) => row[c]));
    n += r.count;
  }
  if (rows.length && pk === "id") await dst.unsafe(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM ${table}`);
  console.log(`${table}: ${n}/${rows.length} rows copied`);
}
// Old releases point at files that lived in Netlify Blobs: re-upload the APK(s) through the dashboard (Apps page) afterwards.
await src.end(); await dst.end();
console.log("done. Now upload the current APK again on the Apps page so phones can download it from Supabase Storage.");
