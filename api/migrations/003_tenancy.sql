-- Tenancy: every site belongs to one organisation (tenant).
-- Nullable so ingest's `create-site` CLI keeps working: a site without an
-- organisation is visible to nobody in the dashboard until it is assigned.
-- Deleting an organisation keeps its sites and tracking data, unassigned.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS org_id text REFERENCES organization (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sites_org_id_idx ON sites (org_id);

-- One membership per user per organisation (the authorization lookup relies on it).
CREATE UNIQUE INDEX IF NOT EXISTS member_org_user_uq ON member ("organizationId", "userId");

-- §2 roles: the dashboard API (app_rw) owns the auth tables; ingest gets nothing on them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON "user", session, account, verification, "twoFactor", organization, member, invitation, "rateLimit"
      TO app_rw;
    GRANT SELECT, INSERT, UPDATE, DELETE ON sites, site_config TO app_rw;
  END IF;
END
$$;
