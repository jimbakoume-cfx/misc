-- Apps bigger than the storage's per-file limit are stored in pieces (<sha256>.apk.p00, .p01, ...) with a small
-- description next to them (<sha256>.apk.json). Phones cannot fetch those from the storage address, so their
-- download address is the dashboard's, which joins the pieces back into one file.
ALTER TABLE managed_apps ADD COLUMN IF NOT EXISTS parts INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION kiosk_apk_url(sha TEXT) RETURNS TEXT LANGUAGE sql STABLE AS
  $$ SELECT CASE WHEN EXISTS (SELECT 1 FROM managed_apps m WHERE m.sha256 = sha AND m.parts > 1)
            THEN COALESCE(NULLIF(kiosk_setting('big_apk_base_url'), ''), kiosk_setting('public_url') || '/apk')
            ELSE kiosk_setting('apk_base_url') END || '/' || sha || '.apk' $$;
ALTER FUNCTION kiosk_apk_url(text) SET search_path = public;
