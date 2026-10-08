-- Timestamps are epoch milliseconds stored as DOUBLE PRECISION (exact below 2^53, and the
-- driver returns numbers instead of strings, unlike BIGINT).

CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'
);

CREATE TABLE device_groups (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  allowed_apps TEXT NOT NULL DEFAULT '[]',
  message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE devices (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  group_id INTEGER REFERENCES device_groups(id) ON DELETE SET NULL,
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
  enrolled_at DOUBLE PRECISION NOT NULL,
  last_seen DOUBLE PRECISION
);
CREATE INDEX idx_devices_group ON devices(group_id);

CREATE TABLE enroll_tokens (
  token TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  group_id INTEGER REFERENCES device_groups(id) ON DELETE SET NULL,
  expires_at DOUBLE PRECISION NOT NULL,
  max_uses INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE commands (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  created_at DOUBLE PRECISION NOT NULL,
  sent_at DOUBLE PRECISION,
  done_at DOUBLE PRECISION
);
CREATE INDEX idx_commands_device ON commands(device_id, status);

CREATE TABLE releases (
  id SERIAL PRIMARY KEY,
  version_code INTEGER NOT NULL,
  version_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  cert_sha256 TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit (
  id SERIAL PRIMARY KEY,
  ts DOUBLE PRECISION NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);

CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  until_ts DOUBLE PRECISION NOT NULL
);
