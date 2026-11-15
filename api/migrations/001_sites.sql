-- `sites` and `site_config` are created by ingest/migrations/001_init.sql (contract §10).
-- Repeated here, identically and with IF NOT EXISTS, so the API also runs against an
-- empty database in development and tests. Keep in sync with ingest; whichever
-- service migrates first creates them.

CREATE TABLE IF NOT EXISTS sites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  platform           text NOT NULL CHECK (platform IN ('php', 'wordpress', 'wix')),
  timezone           text NOT NULL DEFAULT 'Europe/Berlin',
  allowed_origins    text[] NOT NULL DEFAULT '{}',
  site_key           text NOT NULL UNIQUE,
  site_secret_hash   text NOT NULL UNIQUE,
  webhook_token_hash text UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_config (
  site_id        uuid PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
  config_version integer NOT NULL DEFAULT 0,
  spa            text NOT NULL DEFAULT 'auto',
  sections       jsonb NOT NULL DEFAULT '[]',
  booking_paths  jsonb NOT NULL DEFAULT '[]',
  forms_browser  jsonb NOT NULL DEFAULT '[]',
  request_rules  jsonb NOT NULL DEFAULT '[]',
  updated_at     timestamptz NOT NULL DEFAULT now()
);
