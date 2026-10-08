-- Each phone remembers the setup code that enrolled it, so the Add phones page can show how many phones a code
-- currently has (a phone removed and set up again used to count twice).
ALTER TABLE devices ADD COLUMN IF NOT EXISTS enroll_code TEXT NOT NULL DEFAULT '';
UPDATE devices SET enroll_code = COALESCE((SELECT token FROM enroll_tokens ORDER BY created_at DESC LIMIT 1), '') WHERE enroll_code = '';
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
    UPDATE devices dv SET token_hash = kiosk_sha256(dt), enroll_code = tok.token, model = COALESCE(p_identity->>'model', ''), os_version = COALESCE(p_identity->>'osVersion', ''),
           last_seen = t, imei = COALESCE(NULLIF(p_identity->>'imei', ''), dv.imei), sim_serial = COALESCE(NULLIF(p_identity->>'simSerial', ''), dv.sim_serial),
           security_patch = COALESCE(NULLIF(p_identity->>'securityPatch', ''), dv.security_patch)
     WHERE dv.id = v_id;
  ELSE
    SELECT COUNT(*)::int + 1 INTO n FROM devices;
    v_name := COALESCE(NULLIF(tok.label, ''), 'Device') || '-' || lpad(n::text, 3, '0');
    INSERT INTO devices(name, group_id, token_hash, enroll_code, android_id, serial, model, os_version, enrolled_at, last_seen, approved, push_id, imei, sim_serial, security_patch)
    VALUES (v_name, tok.group_id, kiosk_sha256(dt), tok.token, v_aid, v_serial, COALESCE(p_identity->>'model', ''), COALESCE(p_identity->>'osVersion', ''), t, t,
            CASE WHEN kiosk_setting('require_approval', '1') = '1' THEN 0 ELSE 1 END, kiosk_random_token(),
            COALESCE(p_identity->>'imei', ''), COALESCE(p_identity->>'simSerial', ''), COALESCE(p_identity->>'securityPatch', ''))
    RETURNING id INTO v_id;
  END IF;
  UPDATE enroll_tokens SET uses = uses + 1 WHERE token = tok.token;
  PERFORM kiosk_audit('device', 'enroll', v_name || ' (' || COALESCE(p_identity->>'model', '?') || ')');
  RETURN jsonb_build_object('deviceToken', dt, 'name', v_name, 'id', v_id);
END $$;
