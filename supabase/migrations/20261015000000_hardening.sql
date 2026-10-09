-- Hardening after the October 2026 audit: size limits on what phones report, fixed search_path on helper functions,
-- the pg_net extension out of public, an index for enroll_tokens.group_id, and a daily retention job.
CREATE OR REPLACE FUNCTION kiosk_heartbeat(token TEXT, status JSONB DEFAULT '{}'::jsonb, acks JSONB DEFAULT '[]'::jsonb,
                                           apps JSONB DEFAULT NULL, usage JSONB DEFAULT NULL, location JSONB DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE d devices; t DOUBLE PRECISION := kiosk_now(); st JSONB := COALESCE(status, '{}'::jsonb); a JSONB; rel releases; code INTEGER;
        cmds JSONB := '[]'::jsonb; c RECORD; removed BOOLEAN := false; v_day TEXT; result JSONB; bat INTEGER; owner BOOLEAN; nm TEXT;
BEGIN
  SELECT * INTO d FROM devices dv WHERE dv.token_hash = kiosk_sha256(COALESCE(token, ''));
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown device' USING ERRCODE = 'PT401'; END IF;
  -- Size limits: a phone (or a leaked token) cannot bloat its row. Status is capped, long app lists are ignored.
  IF pg_column_size(st) > 16384 THEN RAISE EXCEPTION 'Status too large' USING ERRCODE = 'PT413'; END IF;
  IF jsonb_typeof(apps) = 'array' AND jsonb_array_length(apps) > 500 THEN apps := NULL; END IF;
  IF jsonb_typeof(usage) = 'object' AND pg_column_size(usage) > 16384 THEN usage := NULL; END IF;

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

-- Helper functions get a fixed search_path (Supabase linter 0011).
ALTER FUNCTION kiosk_clear_alert(integer, text) SET search_path = public;
ALTER FUNCTION kiosk_sweep() SET search_path = public;
ALTER FUNCTION kiosk_now() SET search_path = public;
ALTER FUNCTION kiosk_check_budget(integer, text) SET search_path = public;
ALTER FUNCTION kiosk_setting(text, text) SET search_path = public;
ALTER FUNCTION kiosk_sha256(text) SET search_path = public;
ALTER FUNCTION kiosk_random_token() SET search_path = public;
ALTER FUNCTION kiosk_norm_code(text) SET search_path = public;
ALTER FUNCTION kiosk_day(double precision) SET search_path = public;
ALTER FUNCTION kiosk_apk_url(text) SET search_path = public;
ALTER FUNCTION kiosk_audit(text, text, text) SET search_path = public;
ALTER FUNCTION kiosk_alert(integer, text, text) SET search_path = public;
ALTER FUNCTION kiosk_policy(devices) SET search_path = public;

CREATE INDEX IF NOT EXISTS enroll_tokens_group_id_idx ON enroll_tokens(group_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE SCHEMA IF NOT EXISTS extensions;
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_net stays where it is: %', SQLERRM;
END $$;

-- Retention: 180 days of audit and usage, 30 days of finished commands, 90 days of cleared alerts, expired throttles.
CREATE OR REPLACE FUNCTION kiosk_retention() RETURNS INTEGER LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE t DOUBLE PRECISION := kiosk_now(); n INTEGER := 0; r INTEGER;
BEGIN
  DELETE FROM audit WHERE ts < t - 180::bigint * 86400000; GET DIAGNOSTICS r = ROW_COUNT; n := n + r;
  DELETE FROM usage_daily WHERE day < to_char((now() - interval '180 days'), 'YYYY-MM-DD'); GET DIAGNOSTICS r = ROW_COUNT; n := n + r;
  DELETE FROM commands WHERE status IN ('done', 'failed') AND COALESCE(done_at, created_at) < t - 30::bigint * 86400000; GET DIAGNOSTICS r = ROW_COUNT; n := n + r;
  DELETE FROM alerts WHERE active = 0 AND COALESCE(cleared_at, ts) < t - 90::bigint * 86400000; GET DIAGNOSTICS r = ROW_COUNT; n := n + r;
  DELETE FROM login_attempts WHERE until_ts < t; GET DIAGNOSTICS r = ROW_COUNT; n := n + r;
  RETURN n;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiosk-retention';
    PERFORM cron.schedule('kiosk-retention', '23 3 * * *', 'SELECT kiosk_retention()');
  END IF;
END $$;
