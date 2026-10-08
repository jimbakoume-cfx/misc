-- Fleet v2: driver fields, data usage, managed apps, alerts, lost mode, and the phone-facing SQL functions.
-- Phones call kiosk_heartbeat / kiosk_report straight through PostgREST (anon key + their own device token),
-- which keeps the Edge Function out of the hot path. The dashboard API calls the same functions.

-- ---------- schema ----------
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS driver_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS driver_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vehicle TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS imei TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sim_serial TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS security_patch TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lost_mode INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lost_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_location TEXT,
  ADD COLUMN IF NOT EXISTS problem TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS problem_at DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_report_at DOUBLE PRECISION;

-- One row per phone per local day. Bytes are summed from the deltas each check-in reports; app_usage is today's
-- foreground minutes per package (the phone sends absolute values, so the last report wins).
CREATE TABLE IF NOT EXISTS usage_daily (
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  mobile_bytes BIGINT NOT NULL DEFAULT 0,
  wifi_bytes BIGINT NOT NULL DEFAULT 0,
  app_usage TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (device_id, day)
);
CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_daily(day);

-- Other APKs (the Confiance Driver app, …) that phones install silently when the package is in their allowed list.
CREATE TABLE IF NOT EXISTS managed_apps (
  id SERIAL PRIMARY KEY,
  pkg TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  version_code INTEGER NOT NULL,
  version_name TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_managed_apps_pkg ON managed_apps(pkg, version_code DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  ts DOUBLE PRECISION NOT NULL,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  emailed INTEGER NOT NULL DEFAULT 0,
  cleared_at DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(active, ts DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id, kind, active);

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION kiosk_now() RETURNS DOUBLE PRECISION LANGUAGE sql STABLE AS
  $$ SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::double precision $$;

CREATE OR REPLACE FUNCTION kiosk_setting(k TEXT, d TEXT DEFAULT '') RETURNS TEXT LANGUAGE sql STABLE AS
  $$ SELECT COALESCE((SELECT value FROM settings WHERE key = k), d) $$;

CREATE OR REPLACE FUNCTION kiosk_sha256(s TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS
  $$ SELECT encode(sha256(convert_to(s, 'UTF8')), 'hex') $$;

-- 32 random bytes as base64url (same shape as the tokens the API issues).
CREATE OR REPLACE FUNCTION kiosk_random_token() RETURNS TEXT LANGUAGE sql VOLATILE AS $$
  SELECT rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '=')
$$;

-- Hand-typed enrolment codes: ignore case/spaces/dashes and look-alike letters.
CREATE OR REPLACE FUNCTION kiosk_norm_code(s TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS
  $$ SELECT translate(upper(regexp_replace(COALESCE(s, ''), '[^A-Za-z0-9]', '', 'g')), 'OIL', '011') $$;

-- Local calendar day (fleet time zone, default Cameroon) for an epoch-ms timestamp.
CREATE OR REPLACE FUNCTION kiosk_day(ts DOUBLE PRECISION) RETURNS TEXT LANGUAGE sql STABLE AS
  $$ SELECT to_char(to_timestamp(ts / 1000.0) AT TIME ZONE kiosk_setting('tz', 'Africa/Douala'), 'YYYY-MM-DD') $$;

CREATE OR REPLACE FUNCTION kiosk_apk_url(sha TEXT) RETURNS TEXT LANGUAGE sql STABLE AS
  $$ SELECT kiosk_setting('apk_base_url') || '/' || sha || '.apk' $$;

CREATE OR REPLACE FUNCTION kiosk_audit(actor TEXT, action TEXT, detail TEXT DEFAULT '') RETURNS VOID LANGUAGE sql VOLATILE AS
  $$ INSERT INTO audit(ts, actor, action, detail) VALUES (kiosk_now(), actor, action, COALESCE(detail, '')) $$;

-- One active alert per (phone, kind); re-raising only refreshes the message.
CREATE OR REPLACE FUNCTION kiosk_alert(p_device INTEGER, p_kind TEXT, p_message TEXT) RETURNS VOID LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  UPDATE alerts a SET message = p_message WHERE a.device_id IS NOT DISTINCT FROM p_device AND a.kind = p_kind AND a.active = 1;
  IF NOT FOUND THEN
    INSERT INTO alerts(ts, device_id, kind, message) VALUES (kiosk_now(), p_device, p_kind, p_message);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION kiosk_clear_alert(p_device INTEGER, p_kind TEXT) RETURNS VOID LANGUAGE sql VOLATILE AS
  $$ UPDATE alerts a SET active = 0, cleared_at = kiosk_now() WHERE a.device_id = p_device AND a.kind = p_kind AND a.active = 1 $$;

-- Month-to-date cellular data against the per-phone budget (0 = no budget).
CREATE OR REPLACE FUNCTION kiosk_check_budget(p_device INTEGER, p_day TEXT) RETURNS VOID LANGUAGE plpgsql VOLATILE AS $$
DECLARE budget BIGINT := COALESCE(NULLIF(kiosk_setting('data_budget_mb', '2048'), '')::bigint, 0);
        used BIGINT; month TEXT := left(p_day, 7); nm TEXT;
BEGIN
  -- an alert raised for an earlier month is over
  UPDATE alerts a SET active = 0, cleared_at = kiosk_now()
   WHERE a.device_id = p_device AND a.kind = 'data_budget' AND a.active = 1 AND left(kiosk_day(a.ts), 7) <> month;
  IF budget <= 0 THEN RETURN; END IF;
  SELECT COALESCE(SUM(mobile_bytes), 0) INTO used FROM usage_daily u WHERE u.device_id = p_device AND left(u.day, 7) = month;
  IF used > budget * 1048576 THEN
    SELECT name INTO nm FROM devices WHERE id = p_device;
    PERFORM kiosk_alert(p_device, 'data_budget', round(used / 1048576.0) || ' MB cellular this month (budget ' || budget || ' MB)');
  END IF;
END $$;

-- Phones that have not checked in for a long time. Called by the dashboard/cron, cheap enough to run often.
CREATE OR REPLACE FUNCTION kiosk_sweep() RETURNS INTEGER LANGUAGE plpgsql VOLATILE AS $$
DECLARE hours INTEGER := GREATEST(COALESCE(NULLIF(kiosk_setting('offline_alert_hours', '12'), '')::int, 12), 1);
        t DOUBLE PRECISION := kiosk_now(); n INTEGER := 0; r RECORD;
BEGIN
  FOR r IN SELECT d.id, d.name, d.last_seen FROM devices d WHERE d.approved = 1 AND d.last_seen IS NOT NULL AND d.last_seen < t - hours * 3600000 LOOP
    PERFORM kiosk_alert(r.id, 'offline', 'No check-in for ' || round((t - r.last_seen) / 3600000) || ' h');
    n := n + 1;
  END LOOP;
  UPDATE alerts a SET active = 0, cleared_at = t
   WHERE a.kind = 'offline' AND a.active = 1
     AND EXISTS (SELECT 1 FROM devices d WHERE d.id = a.device_id AND d.last_seen >= t - hours * 3600000);
  RETURN n;
END $$;

-- ---------- effective policy for one phone ----------
CREATE OR REPLACE FUNCTION kiosk_policy(d devices) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE g device_groups; pending BOOLEAN := d.approved = 0; epoch INTEGER := COALESCE(NULLIF(kiosk_setting('policy_epoch', '1'), '')::int, 1);
        apps JSONB; msg TEXT; pub TEXT := kiosk_setting('public_url'); sb_url TEXT := kiosk_setting('supabase_url');
        sb_key TEXT := kiosk_setting('supabase_anon_key'); pid TEXT; install JSONB; dispatch TEXT := kiosk_setting('dispatch_phone');
BEGIN
  IF d.group_id IS NOT NULL THEN SELECT * INTO g FROM device_groups WHERE id = d.group_id; END IF;
  apps := CASE WHEN pending THEN '[]'::jsonb
               WHEN d.allowed_override IS NOT NULL THEN d.allowed_override::jsonb
               ELSE COALESCE(g.allowed_apps, '[]')::jsonb END;
  msg := CASE WHEN pending THEN 'Waiting for administrator approval'
              WHEN d.message_override IS NOT NULL THEN d.message_override
              ELSE COALESCE(g.message, '') END;
  pid := d.push_id;
  IF pid IS NULL THEN
    UPDATE devices SET push_id = kiosk_random_token() WHERE id = d.id AND push_id IS NULL;
    SELECT push_id INTO pid FROM devices WHERE id = d.id;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('pkg', m.pkg, 'versionCode', m.version_code, 'url', kiosk_apk_url(m.sha256), 'sha256', m.sha256) ORDER BY m.pkg), '[]'::jsonb)
    INTO install
    FROM (SELECT DISTINCT ON (pkg) * FROM managed_apps
           WHERE pkg IN (SELECT e->>'pkg' FROM jsonb_array_elements(apps) e)
           ORDER BY pkg, version_code DESC, id DESC) m;
  RETURN jsonb_build_object(
    'version', d.policy_version + epoch + CASE WHEN pending THEN 0 ELSE 1000000 END,
    'name', d.name,
    'driverName', d.driver_name,
    'vehicle', d.vehicle,
    'allowedApps', apps,
    'message', msg,
    'pinSalt', '',
    'pinHash', CASE WHEN kiosk_setting('pin_enabled', '0') = '1' THEN kiosk_setting('pin_hash') ELSE '' END,
    'disableDebugging', kiosk_setting('disable_debugging', '1') = '1',
    'intervalSec', COALESCE(NULLIF(kiosk_setting('heartbeat_sec', '600'), '')::int, 600),
    'pushIntervalSec', COALESCE(NULLIF(kiosk_setting('push_heartbeat_sec', '1800'), '')::int, 1800),
    'push', CASE WHEN sb_url <> '' AND sb_key <> '' THEN jsonb_build_object('url', sb_url, 'key', sb_key, 'channel', 'dev-' || pid) ELSE NULL END,
    'rest', CASE WHEN sb_url <> '' AND sb_key <> '' AND kiosk_setting('rest_heartbeats', '1') = '1'
                 THEN jsonb_build_object('url', rtrim(sb_url, '/') || '/rest/v1', 'key', sb_key) ELSE NULL END,
    'serverUrl', pub,
    'driverWifi', kiosk_setting('driver_wifi', '1') = '1',
    'dispatchPhone', dispatch,
    'reportLocation', kiosk_setting('report_location', '0') = '1',
    'installApps', install,
    'lostMode', jsonb_build_object('on', d.lost_mode = 1, 'message', d.lost_message, 'phone', COALESCE(NULLIF(d.lost_phone, ''), dispatch)),
    'dataBudgetMb', COALESCE(NULLIF(kiosk_setting('data_budget_mb', '2048'), '')::int, 0));
END $$;

-- ---------- enrolment (called by the API) ----------
CREATE OR REPLACE FUNCTION kiosk_enroll(p_code TEXT, p_identity JSONB DEFAULT '{}'::jsonb) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE raw TEXT := trim(COALESCE(p_code, '')); tok enroll_tokens; t DOUBLE PRECISION := kiosk_now(); dt TEXT := kiosk_random_token();
        v_serial TEXT := COALESCE(p_identity->>'serial', ''); v_aid TEXT := COALESCE(p_identity->>'androidId', '');
        ex devices; v_id INTEGER; v_name TEXT; n INTEGER;
BEGIN
  SELECT * INTO tok FROM enroll_tokens WHERE token = raw;
  IF NOT FOUND THEN SELECT * INTO tok FROM enroll_tokens WHERE token = kiosk_norm_code(raw); END IF;
  IF NOT FOUND OR tok.expires_at < t OR tok.uses >= tok.max_uses THEN
    RAISE EXCEPTION 'Invalid or expired enrollment code' USING ERRCODE = 'PT403';
  END IF;
  IF v_serial <> '' OR v_aid <> '' THEN
    SELECT * INTO ex FROM devices dv WHERE (dv.serial = v_serial AND dv.serial <> '') OR (dv.android_id = v_aid AND dv.android_id <> '') LIMIT 1;
  END IF;
  IF ex.id IS NOT NULL THEN
    v_id := ex.id; v_name := ex.name;
    UPDATE devices dv SET token_hash = kiosk_sha256(dt), model = COALESCE(p_identity->>'model', ''), os_version = COALESCE(p_identity->>'osVersion', ''),
           last_seen = t, imei = COALESCE(NULLIF(p_identity->>'imei', ''), dv.imei), sim_serial = COALESCE(NULLIF(p_identity->>'simSerial', ''), dv.sim_serial),
           security_patch = COALESCE(NULLIF(p_identity->>'securityPatch', ''), dv.security_patch)
     WHERE dv.id = v_id;
  ELSE
    SELECT COUNT(*)::int + 1 INTO n FROM devices;
    v_name := COALESCE(NULLIF(tok.label, ''), 'Device') || '-' || lpad(n::text, 3, '0');
    INSERT INTO devices(name, group_id, token_hash, android_id, serial, model, os_version, enrolled_at, last_seen, approved, push_id, imei, sim_serial, security_patch)
    VALUES (v_name, tok.group_id, kiosk_sha256(dt), v_aid, v_serial, COALESCE(p_identity->>'model', ''), COALESCE(p_identity->>'osVersion', ''), t, t,
            CASE WHEN kiosk_setting('require_approval', '1') = '1' THEN 0 ELSE 1 END, kiosk_random_token(),
            COALESCE(p_identity->>'imei', ''), COALESCE(p_identity->>'simSerial', ''), COALESCE(p_identity->>'securityPatch', ''))
    RETURNING id INTO v_id;
  END IF;
  UPDATE enroll_tokens SET uses = uses + 1 WHERE token = tok.token;
  PERFORM kiosk_audit('device', 'enroll', v_name || ' (' || COALESCE(p_identity->>'model', '?') || ')');
  RETURN jsonb_build_object('deviceToken', dt, 'name', v_name, 'id', v_id);
END $$;

-- ---------- check-in (called by phones through PostgREST, and by the API) ----------
CREATE OR REPLACE FUNCTION kiosk_heartbeat(token TEXT, status JSONB DEFAULT '{}'::jsonb, acks JSONB DEFAULT '[]'::jsonb,
                                           apps JSONB DEFAULT NULL, usage JSONB DEFAULT NULL, location JSONB DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE d devices; t DOUBLE PRECISION := kiosk_now(); st JSONB := COALESCE(status, '{}'::jsonb); a JSONB; rel releases; code INTEGER;
        cmds JSONB := '[]'::jsonb; c RECORD; removed BOOLEAN := false; v_day TEXT; result JSONB; bat INTEGER; owner BOOLEAN; nm TEXT;
BEGIN
  SELECT * INTO d FROM devices dv WHERE dv.token_hash = kiosk_sha256(COALESCE(token, ''));
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown device' USING ERRCODE = 'PT401'; END IF;

  FOR a IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(acks) = 'array' THEN acks ELSE '[]'::jsonb END) LOOP
    UPDATE commands cm SET status = CASE WHEN a->>'status' = 'done' THEN 'done' ELSE 'failed' END,
           error = left(COALESCE(a->>'error', ''), 300), done_at = t
     WHERE cm.id = NULLIF(regexp_replace(COALESCE(a->>'id', ''), '[^0-9]', '', 'g'), '')::int AND cm.device_id = d.id AND cm.status IN ('sent', 'pending');
  END LOOP;

  IF COALESCE(st->>'simSerial', '') <> '' AND d.sim_serial <> '' AND d.sim_serial <> (st->>'simSerial') THEN
    PERFORM kiosk_alert(d.id, 'sim_changed', 'SIM card changed (' || COALESCE(st->>'simOperator', '?') || ')');
  END IF;

  UPDATE devices dv SET status = st::text, last_seen = t,
         apps = CASE WHEN jsonb_typeof(kiosk_heartbeat.apps) = 'array' THEN kiosk_heartbeat.apps::text ELSE dv.apps END,
         imei = COALESCE(NULLIF(st->>'imei', ''), dv.imei),
         sim_serial = COALESCE(NULLIF(st->>'simSerial', ''), dv.sim_serial),
         security_patch = COALESCE(NULLIF(st->>'securityPatch', ''), dv.security_patch),
         last_location = CASE WHEN jsonb_typeof(kiosk_heartbeat.location) = 'object' AND jsonb_exists(kiosk_heartbeat.location, 'lat') THEN kiosk_heartbeat.location::text ELSE dv.last_location END
   WHERE dv.id = d.id;

  IF jsonb_typeof(usage) = 'object' THEN
    v_day := kiosk_day(t);
    INSERT INTO usage_daily(device_id, day, mobile_bytes, wifi_bytes, app_usage)
    VALUES (d.id, v_day, GREATEST(COALESCE((usage->>'mobileBytes')::bigint, 0), 0), GREATEST(COALESCE((usage->>'wifiBytes')::bigint, 0), 0),
            COALESCE(usage->'appUsage', '{}'::jsonb)::text)
    ON CONFLICT (device_id, day) DO UPDATE SET
      mobile_bytes = usage_daily.mobile_bytes + EXCLUDED.mobile_bytes,
      wifi_bytes = usage_daily.wifi_bytes + EXCLUDED.wifi_bytes,
      app_usage = CASE WHEN jsonb_exists(kiosk_heartbeat.usage, 'appUsage') THEN EXCLUDED.app_usage ELSE usage_daily.app_usage END;
    PERFORM kiosk_check_budget(d.id, v_day);
  END IF;

  -- health alerts derived from this check-in
  owner := COALESCE((st->>'deviceOwner')::boolean, false);
  IF d.approved = 1 AND (NOT owner OR COALESCE((st->>'released')::boolean, false)) THEN
    PERFORM kiosk_alert(d.id, 'unmanaged', CASE WHEN NOT owner THEN 'Not managed (app is not the device owner)' ELSE 'Released from kiosk mode' END);
  ELSE
    PERFORM kiosk_clear_alert(d.id, 'unmanaged');
  END IF;
  bat := COALESCE(NULLIF(regexp_replace(COALESCE(st->>'battery', ''), '[^0-9-]', '', 'g'), '')::int, -1);
  IF bat >= 0 AND bat <= 10 AND NOT COALESCE((st->>'charging')::boolean, false) THEN
    PERFORM kiosk_alert(d.id, 'battery', 'Battery at ' || bat || '% and not charging');
  ELSIF bat > 20 THEN
    PERFORM kiosk_clear_alert(d.id, 'battery');
  END IF;
  PERFORM kiosk_clear_alert(d.id, 'offline');

  -- auto-update to the newest kiosk release
  SELECT * INTO rel FROM releases ORDER BY version_code DESC, id DESC LIMIT 1;
  code := COALESCE(NULLIF(regexp_replace(COALESCE(st->>'agentVersionCode', ''), '[^0-9]', '', 'g'), '')::int, 0);
  IF rel.id IS NOT NULL AND kiosk_setting('auto_update', '1') = '1' AND owner AND code > 0 AND code < rel.version_code
     AND NOT EXISTS (SELECT 1 FROM commands cm WHERE cm.device_id = d.id AND cm.type = 'update' AND cm.created_at > t - 1800000) THEN
    INSERT INTO commands(device_id, type, payload, created_at)
    VALUES (d.id, 'update', jsonb_build_object('url', kiosk_apk_url(rel.sha256), 'sha256', rel.sha256, 'versionCode', rel.version_code)::text, t);
  END IF;

  -- deliver pending commands (the ones a phone cannot ack are marked done when sent)
  FOR c IN SELECT cm.id, cm.type, cm.payload FROM commands cm WHERE cm.device_id = d.id AND cm.status = 'pending' ORDER BY cm.id LIMIT 10 LOOP
    UPDATE commands cm SET status = CASE WHEN c.type IN ('reboot', 'unenroll', 'update', 'wipe') THEN 'done' ELSE 'sent' END,
           sent_at = t, done_at = CASE WHEN c.type IN ('reboot', 'unenroll', 'update', 'wipe') THEN t ELSE NULL END
     WHERE cm.id = c.id;
    cmds := cmds || jsonb_build_object('id', c.id::text, 'type', c.type, 'payload', COALESCE(NULLIF(c.payload, ''), '{}')::jsonb);
    IF c.type = 'unenroll' AND d.remove_pending = 1 THEN removed := true; END IF;
  END LOOP;

  SELECT * INTO d FROM devices WHERE id = d.id;
  result := jsonb_build_object('policy', kiosk_policy(d), 'commands', cmds);
  IF removed THEN
    nm := d.name;
    DELETE FROM devices WHERE id = d.id;
    PERFORM kiosk_audit('device', 'removed', nm || ' released and removed');
  END IF;
  RETURN result;
END $$;

-- ---------- driver problem report (phones through PostgREST, or the API) ----------
CREATE OR REPLACE FUNCTION kiosk_report(token TEXT, kind TEXT DEFAULT 'problem', text TEXT DEFAULT '') RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE d devices; t DOUBLE PRECISION := kiosk_now(); msg TEXT := left(trim(COALESCE(kiosk_report.text, '')), 300);
BEGIN
  SELECT * INTO d FROM devices dv WHERE dv.token_hash = kiosk_sha256(COALESCE(token, ''));
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown device' USING ERRCODE = 'PT401'; END IF;
  IF msg = '' THEN RAISE EXCEPTION 'Empty report' USING ERRCODE = 'PT400'; END IF;
  IF d.last_report_at IS NOT NULL AND d.last_report_at > t - 600000 THEN RAISE EXCEPTION 'Please wait a few minutes before sending another report' USING ERRCODE = 'PT429'; END IF;
  UPDATE devices dv SET problem = msg, problem_at = t, last_report_at = t WHERE dv.id = d.id;
  PERFORM kiosk_alert(d.id, 'problem', msg);
  PERFORM kiosk_audit('device', 'problem-reported', d.name || ': ' || msg);
  RETURN jsonb_build_object('ok', true);
END $$;

-- ---------- access control ----------
-- Nothing in these tables is reachable through the public REST API: only the two functions above are.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.kiosk_heartbeat(text, jsonb, jsonb, jsonb, jsonb, jsonb) TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.kiosk_report(text, text, text) TO anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ---------- storage bucket for APKs (hosted Supabase only) ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('apk', 'apk', true), ('web', 'web', true) ON CONFLICT (id) DO UPDATE SET public = true;
  END IF;
END $$;

-- ---------- hourly cron (hosted Supabase only): offline sweep + alert e-mails ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_net';
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiosk-hourly';
      PERFORM cron.schedule('kiosk-hourly', '7 * * * *',
        $job$ SELECT net.http_post(url := kiosk_setting('public_url') || '/api/cron',
                                   headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', kiosk_setting('cron_key')),
                                   body := '{}'::jsonb) $job$);
    END IF;
  END IF;
END $$;
