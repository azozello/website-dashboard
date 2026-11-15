-- Row-level security: a second layer behind the route guards (src/tenant.ts).
--
-- The API's tenant pool (src/db.ts) sets app.user_id on every connection it hands out to the signed-in
-- user of the request ('' when there is none). The policies below limit such a connection to the
-- organisations that user belongs to, so a query that forgets its site or organisation filter returns
-- nothing of other tenants, and a write to another tenant's row fails.
--
-- Who is subject to them: every role except table owners and superusers. app_rw (the API) is.
-- Migrations run as the superuser. ingest_rw usually owns sites and the tracking tables (ingest migrates
-- first); it gets explicit allow-all policies anyway, because it authenticates sites by key, not by user,
-- and must keep working if ownership changes (e.g. after a restore).
--
-- Runs after every table it covers (it was 005_rls.sql on its branch; production had 006 and 007 first),
-- and is idempotent: each policy is dropped before it is created, so a database that ran 005_rls.sql or
-- the conditional blocks of 006/007 ends up the same.
--
-- A new table with tenant data needs the same treatment in a later migration:
--   ALTER TABLE t ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY t_select ON t FOR SELECT USING (site_id IN (SELECT app_user_sites()));
--   (plus INSERT/UPDATE/DELETE policies with app_user_sites('admin') where the API writes it)

-- Organisations in which the current user has at least min_role ('member' < 'admin' < 'owner').
-- Better Auth stores roles as a comma-separated list.
CREATE OR REPLACE FUNCTION app_user_orgs(min_role text DEFAULT 'member') RETURNS SETOF text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT m."organizationId"
    FROM member m
   WHERE m."userId" = nullif(current_setting('app.user_id', true), '')
     AND string_to_array(replace(m.role, ' ', ''), ',') && CASE min_role
           WHEN 'owner' THEN ARRAY['owner']
           WHEN 'admin' THEN ARRAY['owner', 'admin']
           ELSE ARRAY['owner', 'admin', 'member']
         END
$$;

-- Sites of those organisations.
CREATE OR REPLACE FUNCTION app_user_sites(min_role text DEFAULT 'member') RETURNS SETOF uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT s.id FROM sites s WHERE s.org_id IN (SELECT app_user_orgs(min_role))
$$;

-- Helpers for this migration only (pg_temp: gone when the migration's connection closes).
CREATE FUNCTION pg_temp.rls(t text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(t) IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END IF;
END
$$;
CREATE FUNCTION pg_temp.policy(t text, name text, body text, only_if_role text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(t) IS NULL THEN RETURN; END IF;
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', name, t);
  IF only_if_role IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = only_if_role) THEN RETURN; END IF;
  EXECUTE format('CREATE POLICY %I ON %I ', name, t) || body;
END
$$;
CREATE FUNCTION pg_temp.drop_policy(t text, name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(t) IS NOT NULL THEN
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', name, t);
  END IF;
END
$$;

-- Read: any member. Add or change: admin. Delete (drops all tracking data): owner.
SELECT pg_temp.rls('sites');
SELECT pg_temp.policy('sites', 'sites_select', 'FOR SELECT USING (org_id IN (SELECT app_user_orgs()))');
SELECT pg_temp.policy('sites', 'sites_insert', 'FOR INSERT WITH CHECK (org_id IN (SELECT app_user_orgs(''admin'')))');
SELECT pg_temp.policy('sites', 'sites_update', 'FOR UPDATE USING (org_id IN (SELECT app_user_orgs(''admin''))) WITH CHECK (org_id IN (SELECT app_user_orgs(''admin'')))');
SELECT pg_temp.policy('sites', 'sites_delete', 'FOR DELETE USING (org_id IN (SELECT app_user_orgs(''owner'')))');
SELECT pg_temp.policy('sites', 'sites_ingest', 'TO ingest_rw USING (true) WITH CHECK (true)', 'ingest_rw');

-- Goes with its site (deleted by the cascade, which row-level security doesn't apply to).
SELECT pg_temp.rls('site_config');
SELECT pg_temp.policy('site_config', 'site_config_select', 'FOR SELECT USING (site_id IN (SELECT app_user_sites()))');
SELECT pg_temp.policy('site_config', 'site_config_insert', 'FOR INSERT WITH CHECK (site_id IN (SELECT app_user_sites(''admin'')))');
SELECT pg_temp.policy('site_config', 'site_config_update', 'FOR UPDATE USING (site_id IN (SELECT app_user_sites(''admin''))) WITH CHECK (site_id IN (SELECT app_user_sites(''admin'')))');
SELECT pg_temp.policy('site_config', 'site_config_ingest', 'TO ingest_rw USING (true) WITH CHECK (true)', 'ingest_rw');

-- Tracking tables, created by ingest (absent in a database that only has the API's migrations). The API only reads them.
SELECT pg_temp.rls(t), pg_temp.policy(t, t || '_select', 'FOR SELECT USING (site_id IN (SELECT app_user_sites()))'),
       pg_temp.policy(t, t || '_ingest', 'TO ingest_rw USING (true) WITH CHECK (true)', 'ingest_rw')
  FROM unnest(ARRAY['visits', 'pageviews', 'clicks', 'flow_steps', 'requests', 'plugin_status']) AS t;

-- site_checks (006): any member's GET /checks refreshes it, so members may write.
SELECT pg_temp.rls('site_checks');
SELECT pg_temp.policy('site_checks', 'site_checks_select', 'FOR SELECT USING (site_id IN (SELECT app_user_sites()))');
SELECT pg_temp.policy('site_checks', 'site_checks_insert', 'FOR INSERT WITH CHECK (site_id IN (SELECT app_user_sites()))');
SELECT pg_temp.policy('site_checks', 'site_checks_update', 'FOR UPDATE USING (site_id IN (SELECT app_user_sites())) WITH CHECK (site_id IN (SELECT app_user_sites()))');

-- Search Console (007): members read; admins connect, choose, import and disconnect. The daily import has no
-- signed-in user: it acts for the admin who connected the site (app_gsc_due below), so these apply to it too.
SELECT pg_temp.rls('gsc_connections');
SELECT pg_temp.policy('gsc_connections', 'gsc_connections_select', 'FOR SELECT USING (site_id IN (SELECT app_user_sites()))');
SELECT pg_temp.policy('gsc_connections', 'gsc_connections_admin', 'FOR ALL USING (site_id IN (SELECT app_user_sites(''admin''))) WITH CHECK (site_id IN (SELECT app_user_sites(''admin'')))');
SELECT pg_temp.rls('gsc_daily');
SELECT pg_temp.policy('gsc_daily', 'gsc_daily_select', 'FOR SELECT USING (site_id IN (SELECT app_user_sites()))');
SELECT pg_temp.policy('gsc_daily', 'gsc_daily_admin', 'FOR ALL USING (site_id IN (SELECT app_user_sites(''admin''))) WITH CHECK (site_id IN (SELECT app_user_sites(''admin'')))');
-- OAuth states: only the user who started the connect flow, for a site they administer.
SELECT pg_temp.rls('gsc_oauth_states');
SELECT pg_temp.policy('gsc_oauth_states', 'gsc_oauth_states_own',
  'FOR ALL USING (user_id = nullif(current_setting(''app.user_id'', true), '''')) WITH CHECK (user_id = nullif(current_setting(''app.user_id'', true), '''') AND site_id IN (SELECT app_user_sites(''admin'')))');
-- An earlier draft let the import through with a session flag (app.job); gone.
SELECT pg_temp.drop_policy('gsc_connections', 'gsc_connections_sync');
SELECT pg_temp.drop_policy('gsc_daily', 'gsc_daily_sync');
SELECT pg_temp.drop_policy('sites', 'sites_gsc_sync');

-- The daily Search Console import (src/gsc.ts syncDue) has no signed-in user. This tells it which connections
-- are due and for whom to act: the admin who connected the site. A connection whose admin left the
-- organisation (or lost the admin role) is marked broken instead, so someone still there connects again.
CREATE OR REPLACE FUNCTION app_gsc_due(p_hours integer) RETURNS TABLE (site_id uuid, user_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE gsc_connections g SET status = 'error', last_error = 'connector_left'
   WHERE g.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM sites s JOIN member m ON m."organizationId" = s.org_id
        WHERE s.id = g.site_id AND m."userId" = g.connected_by
          AND string_to_array(replace(m.role, ' ', ''), ',') && ARRAY['owner', 'admin']);
  RETURN QUERY
    SELECT g.site_id, g.connected_by FROM gsc_connections g
     WHERE g.status = 'active' AND g.property IS NOT NULL
       AND (g.last_sync_at IS NULL OR g.last_sync_at < now() - make_interval(hours => p_hours))
     ORDER BY g.last_sync_at NULLS FIRST;
END
$$;
REVOKE ALL ON FUNCTION app_gsc_due(integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT EXECUTE ON FUNCTION app_gsc_due(integer) TO app_rw;
  END IF;
END
$$;
