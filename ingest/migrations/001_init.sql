-- Rate 1 PoC schema, Data contract v1 §10.
-- `sites` and `site_config` belong to the dashboard (W4). They are created here
-- so ingest can run before the dashboard backend exists; W4 may take them over
-- unchanged. Columns marked "internal" are not part of the contract.

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
  spa            text NOT NULL DEFAULT 'auto', -- served in §5, not listed in §10
  sections       jsonb NOT NULL DEFAULT '[]',
  booking_paths  jsonb NOT NULL DEFAULT '[]',
  forms_browser  jsonb NOT NULL DEFAULT '[]',
  request_rules  jsonb NOT NULL DEFAULT '[]',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salts (
  day  date PRIMARY KEY,
  salt bytea NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  visitor_key    text NOT NULL,
  started_at     timestamptz NOT NULL,
  last_seen_at   timestamptz NOT NULL,
  landing_path   text,
  source_channel text NOT NULL,
  source_detail  text,
  utm_campaign   text,
  device         text NOT NULL CHECK (device IN ('mobile', 'tablet', 'desktop')),
  test           boolean NOT NULL DEFAULT false,
  pv_count       integer NOT NULL DEFAULT 0 -- internal: next seq
);
CREATE INDEX IF NOT EXISTS visits_lookup ON visits (site_id, visitor_key, test, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS visits_started ON visits (site_id, started_at);

CREATE TABLE IF NOT EXISTS pageviews (
  pv          text NOT NULL,
  site_id     uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  visit_id    uuid NOT NULL REFERENCES visits (id) ON DELETE CASCADE,
  seq         integer NOT NULL,
  path        text NOT NULL,
  title       text,
  nav         text NOT NULL CHECK (nav IN ('load', 'spa', 'unknown')),
  received_at timestamptz NOT NULL,
  load_ms     integer,
  active_ms   integer,
  scroll      smallint,
  sections    text[] NOT NULL DEFAULT '{}',
  has_engage  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (site_id, pv)
);
CREATE INDEX IF NOT EXISTS pageviews_visit ON pageviews (visit_id, seq);
CREATE INDEX IF NOT EXISTS pageviews_site_time ON pageviews (site_id, received_at);
CREATE INDEX IF NOT EXISTS pageviews_site_path ON pageviews (site_id, path);

CREATE TABLE IF NOT EXISTS clicks (
  id          bigserial PRIMARY KEY,
  site_id     uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  visit_id    uuid NOT NULL REFERENCES visits (id) ON DELETE CASCADE,
  pv          text NOT NULL,
  eid         text NOT NULL, -- internal: dedupe on (pv, eid)
  kind        text NOT NULL CHECK (kind IN ('call', 'whatsapp', 'email', 'booking_cta')),
  label       text,
  received_at timestamptz NOT NULL,
  UNIQUE (site_id, pv, eid)
);
CREATE INDEX IF NOT EXISTS clicks_site_time ON clicks (site_id, received_at);

CREATE TABLE IF NOT EXISTS flow_steps (
  site_id     uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  visit_id    uuid NOT NULL REFERENCES visits (id) ON DELETE CASCADE,
  pv          text NOT NULL,
  flow        text NOT NULL CHECK (flow IN ('booking', 'calculator')),
  flow_id     text NOT NULL,
  step        smallint NOT NULL CHECK (step BETWEEN 1 AND 20),
  name        text,
  received_at timestamptz NOT NULL,
  UNIQUE (visit_id, flow_id, step)
);
CREATE INDEX IF NOT EXISTS flow_steps_site_time ON flow_steps (site_id, received_at);

CREATE TABLE IF NOT EXISTS requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  visit_id     uuid REFERENCES visits (id) ON DELETE SET NULL,
  pv           text,
  path         text,
  channel      text NOT NULL CHECK (channel IN ('form', 'booking', 'calculator')),
  confirmation text NOT NULL CHECK (confirmation IN ('server', 'webhook', 'browser', 'thankyou')),
  source       text,
  form_id      text,
  counts       boolean NOT NULL DEFAULT true,
  spam         boolean NOT NULL DEFAULT false,
  spam_reason  text CHECK (spam_reason IN ('honeypot', 'plugin', 'too_fast')),
  external_id  text,
  received_at  timestamptz NOT NULL
);
-- Idempotency (§1): server rid, Wix submission_id, browser pv:eid, thank-you visit:rule.
CREATE UNIQUE INDEX IF NOT EXISTS requests_dedupe ON requests (site_id, confirmation, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS requests_site_time ON requests (site_id, received_at);
CREATE INDEX IF NOT EXISTS requests_unlinked_pv ON requests (site_id, pv) WHERE visit_id IS NULL AND pv IS NOT NULL;

CREATE TABLE IF NOT EXISTS plugin_status (
  site_id        uuid PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
  platform       text NOT NULL,
  plugin_version text,
  env            jsonb NOT NULL,
  last_hello_at  timestamptz NOT NULL
);

-- §2 database roles, when the infra has created them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_rw;
    GRANT INSERT, UPDATE, DELETE ON sites, site_config TO app_rw;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ingest_rw') THEN
    GRANT SELECT ON sites, site_config TO ingest_rw;
    GRANT SELECT, INSERT, UPDATE, DELETE ON salts, visits, pageviews, clicks, flow_steps, requests, plugin_status TO ingest_rw;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ingest_rw;
  END IF;
END
$$;
