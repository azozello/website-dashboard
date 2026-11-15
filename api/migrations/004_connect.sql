-- WordPress connect handoff (contract §8): one-time codes, valid 5 minutes, stored as SHA-256 hashes.
-- Issued by POST /api/orgs/:orgId/connect/wordpress (signed-in owner/admin), redeemed once by
-- POST /api/connect/exchange (the plugin, server to server).
CREATE TABLE IF NOT EXISTS connect_codes (
  code_hash  text PRIMARY KEY,
  site_id    uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS connect_codes_expires_idx ON connect_codes (expires_at);

-- Redeems a code once and stores the site's new secret hash, in one statement. Returns the site key, or NULL
-- when the code is unknown, used or expired. SECURITY DEFINER (runs as the migrator, which owns or bypasses
-- row-level security on `sites`): the exchange is called by WordPress with no signed-in user, so with
-- tenant RLS on `sites` the API role alone could not update the row. It touches only the redeemed code's site.
CREATE OR REPLACE FUNCTION app_connect_exchange(p_code_hash text, p_secret_hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site uuid;
  v_key  text;
BEGIN
  UPDATE connect_codes SET used_at = now()
   WHERE code_hash = p_code_hash AND used_at IS NULL AND expires_at > now()
  RETURNING site_id INTO v_site;
  IF v_site IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE sites SET site_secret_hash = p_secret_hash WHERE id = v_site RETURNING site_key INTO v_key;
  RETURN v_key;
END
$$;
REVOKE ALL ON FUNCTION app_connect_exchange(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON connect_codes TO app_rw;
    GRANT EXECUTE ON FUNCTION app_connect_exchange(text, text) TO app_rw;
  END IF;
END
$$;
