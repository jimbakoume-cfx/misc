-- The policy tells a phone which kiosk release to install (policy.update) so updates no longer depend on a
-- queued command; the agent (1.4.2+) installs it itself and retries.
CREATE OR REPLACE FUNCTION kiosk_policy(d devices) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE g device_groups; pending BOOLEAN := d.approved = 0; epoch INTEGER := COALESCE(NULLIF(kiosk_setting('policy_epoch', '1'), '')::int, 1);
        apps JSONB; msg TEXT; pub TEXT := kiosk_setting('public_url'); sb_url TEXT := kiosk_setting('supabase_url');
        sb_key TEXT := kiosk_setting('supabase_anon_key'); pid TEXT; install JSONB; dispatch TEXT := kiosk_setting('dispatch_phone');
        rel releases; code INTEGER; st JSONB := COALESCE(NULLIF(d.status::text, ''), '{}')::jsonb; upd JSONB := NULL;
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
  -- newest kiosk release, offered to phones running an older build (they install it themselves)
  SELECT * INTO rel FROM releases ORDER BY version_code DESC, id DESC LIMIT 1;
  code := COALESCE(NULLIF(regexp_replace(COALESCE(st->>'agentVersionCode', ''), '[^0-9]', '', 'g'), '')::int, 0);
  IF rel.id IS NOT NULL AND kiosk_setting('auto_update', '1') = '1' AND code > 0 AND code < rel.version_code THEN
    upd := jsonb_build_object('url', kiosk_apk_url(rel.sha256), 'sha256', rel.sha256, 'versionCode', rel.version_code, 'versionName', rel.version_name);
  END IF;
  RETURN jsonb_build_object(
    'update', upd,
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
