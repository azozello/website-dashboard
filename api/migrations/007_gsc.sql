-- Google Search Console (contract §10 gsc_connections, gsc_daily; §12 gsc_connected). Written by the API only.

-- One connection per site. The refresh token is encrypted (AES-256-GCM, TOKEN_ENCRYPTION_KEY, bound to site_id).
--   needs_property  connected, but no single property of the Google account matches the site's addresses yet
--   active          property chosen; synced daily
--   error           Google refused the token or the property (last_error says why); connect again
CREATE TABLE IF NOT EXISTS gsc_connections (
  site_id           uuid PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
  property          text,
  status            text NOT NULL CHECK (status IN ('needs_property', 'active', 'error')),
  refresh_token_enc text NOT NULL,
  google_email      text,
  -- The account's verified properties at connect time: [{"siteUrl": "...", "permissionLevel": "..."}]
  properties        jsonb NOT NULL DEFAULT '[]',
  connected_by      text REFERENCES "user" (id) ON DELETE SET NULL,
  connected_at      timestamptz NOT NULL DEFAULT now(),
  last_sync_at      timestamptz,
  -- Newest day imported (Search Console's dates, Pacific Time).
  synced_through    date,
  last_error        text,
  -- Set while a sync runs (a claim, so two never run for one site); stale after 30 minutes.
  sync_started_at   timestamptz
);

-- Search Analytics per day and normalised path (§1). query NULL = the page's total, which also counts
-- the anonymised queries Google leaves out of the per-query rows.
CREATE TABLE IF NOT EXISTS gsc_daily (
  site_id     uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  date        date NOT NULL,
  path        text NOT NULL,
  query       text,
  clicks      integer NOT NULL,
  impressions integer NOT NULL,
  -- Average position, as Google reports it (1 = top). Combine rows weighted by impressions.
  position    real NOT NULL,
  CONSTRAINT gsc_daily_uq UNIQUE NULLS NOT DISTINCT (site_id, date, path, query)
);

-- OAuth state for the connect flow: one-time, 10 minutes, tied to the user and site that started it.
CREATE TABLE IF NOT EXISTS gsc_oauth_states (
  state_hash    text PRIMARY KEY,
  site_id       uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz
);
CREATE INDEX IF NOT EXISTS gsc_oauth_states_expires_idx ON gsc_oauth_states (expires_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gsc_connections, gsc_daily, gsc_oauth_states TO app_rw;
  END IF;
  -- Row-level security for these tables: 008_rls.sql.
END
$$;
