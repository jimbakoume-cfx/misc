import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? new URL("../data", import.meta.url).pathname;
mkdirSync(DATA_DIR, { recursive: true });

export function openDb(file = `${DATA_DIR}/kiosk.db`): DatabaseSync {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      allowed_apps TEXT NOT NULL DEFAULT '[]',
      message TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      token_hash TEXT UNIQUE NOT NULL,
      android_id TEXT,
      serial TEXT,
      model TEXT,
      os_version TEXT,
      status TEXT NOT NULL DEFAULT '{}',
      apps TEXT NOT NULL DEFAULT '[]',
      allowed_override TEXT,
      message_override TEXT,
      notes TEXT NOT NULL DEFAULT '',
      policy_version INTEGER NOT NULL DEFAULT 1,
      enrolled_at INTEGER NOT NULL,
      last_seen INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(group_id);

    CREATE TABLE IF NOT EXISTS enroll_tokens (
      token TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      expires_at INTEGER NOT NULL,
      max_uses INTEGER NOT NULL,
      uses INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      sent_at INTEGER,
      done_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id, status);

    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_code INTEGER NOT NULL,
      version_name TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      cert_sha256 TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}
