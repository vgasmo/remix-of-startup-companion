-- Minimal Supabase-compatible shim for a disposable local Postgres.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN SUPERUSER; END IF;
END $$;
GRANT anon, authenticated, service_role TO postgres;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS graphql_public;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  phone text,
  encrypted_password text,
  email_confirmed_at timestamptz DEFAULT now(),
  confirmed_at timestamptz DEFAULT now(),
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  is_super_admin boolean DEFAULT false,
  role text DEFAULT 'authenticated',
  aud text DEFAULT 'authenticated',
  banned_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb DEFAULT '{}'::jsonb, provider text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(COALESCE(
    current_setting('request.jwt.claim.sub', true),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon')
$$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT (SELECT email FROM auth.users WHERE id = auth.uid())
$$;

-- storage shim (buckets/objects) used by a few policies
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text, public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text, owner uuid, metadata jsonb,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1]
$$;
-- cron/net shims
CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE IF NOT EXISTS cron.job (jobid bigserial PRIMARY KEY, schedule text, command text, jobname text UNIQUE, active boolean DEFAULT true);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job(schedule, command, jobname) VALUES (schedule, command, job_name)
  ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command
  RETURNING jobid
$$;
CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text) RETURNS bigint LANGUAGE sql AS $$
  SELECT cron.schedule('job_' || md5(schedule || command), schedule, command)
$$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text) RETURNS boolean LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobname = job_name RETURNING true
$$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobid = job_id RETURNING true
$$;
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE OR REPLACE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.decrypted_secrets (id uuid DEFAULT gen_random_uuid(), name text, decrypted_secret text);
CREATE SCHEMA IF NOT EXISTS supabase_functions;
-- search_path is set per-session by the harness (PGOPTIONS).
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name,'/'),1)]
$$;
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT split_part(storage.filename(name), '.', 2)
$$;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit bigint;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types text[];
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS owner uuid;
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS path_tokens text[];
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz DEFAULT now();
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS version text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS instance_id uuid DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS confirmation_token text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_token text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_token_new text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change text;
-- Realtime broadcast table (platform-managed in Supabase); migrations that grant
-- or policy realtime.messages need it to exist locally.
CREATE TABLE IF NOT EXISTS realtime.messages (
  id bigserial PRIMARY KEY,
  topic text NOT NULL,
  extension text NOT NULL DEFAULT 'broadcast',
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role;
