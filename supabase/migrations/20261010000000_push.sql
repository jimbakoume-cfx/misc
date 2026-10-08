-- Private, unguessable wake-up channel per phone (Supabase Realtime).
ALTER TABLE devices ADD COLUMN push_id TEXT;
