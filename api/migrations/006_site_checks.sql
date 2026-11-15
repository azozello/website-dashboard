-- §12 setup checklist results (contract §10 `site_checks`), written by the dashboard API
-- each time a site's checklist is computed. One row per (site, check id).
CREATE TABLE IF NOT EXISTS site_checks (
  site_id    uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  check_id   text NOT NULL CHECK (check_id IN (
               'script_live', 'pages_tagged', 'test_event', 'plugin_ok', 'delay_js_ok',
               'form_request', 'wix_webhook', 'buttons_found', 'csp_ok', 'gsc_connected')),
  status     text NOT NULL CHECK (status IN ('pass', 'fail', 'pending')),
  reason     text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, check_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON site_checks TO app_rw;
  END IF;
  -- Row-level security, when the RLS migration (app_user_sites()) has already run. Members write
  -- here too: any member's GET /checks stores the results. If this table is created first, the
  -- RLS migration must add the same policies.
  IF to_regprocedure('app_user_sites(text)') IS NOT NULL THEN
    ALTER TABLE site_checks ENABLE ROW LEVEL SECURITY;
    CREATE POLICY site_checks_select ON site_checks FOR SELECT USING (site_id IN (SELECT app_user_sites()));
    CREATE POLICY site_checks_insert ON site_checks FOR INSERT WITH CHECK (site_id IN (SELECT app_user_sites()));
    CREATE POLICY site_checks_update ON site_checks FOR UPDATE
      USING (site_id IN (SELECT app_user_sites()))
      WITH CHECK (site_id IN (SELECT app_user_sites()));
  END IF;
END
$$;
