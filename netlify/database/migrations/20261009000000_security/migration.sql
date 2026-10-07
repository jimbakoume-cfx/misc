-- Two-factor sign-in, session revocation, device approval.
ALTER TABLE admins ADD COLUMN totp_secret TEXT;
ALTER TABLE admins ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN recovery_codes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE admins ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

-- Existing phones stay approved; new ones are approved (or not) at enrolment depending on the setting.
ALTER TABLE devices ADD COLUMN approved INTEGER NOT NULL DEFAULT 1;
