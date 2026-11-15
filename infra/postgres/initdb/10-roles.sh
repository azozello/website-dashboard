#!/bin/bash
# Runs once, when the pgdata volume is first initialised. Creates the two service roles from Data Contract §2.
# Table-level grants (ingest_rw writes tracking tables, app_rw writes site/admin/GSC tables) belong to the
# application migrations, which create the tables.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v ingest_pw="$INGEST_DB_PASSWORD" -v app_pw="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE ingest_rw LOGIN PASSWORD :'ingest_pw';
CREATE ROLE app_rw LOGIN PASSWORD :'app_pw';
REVOKE ALL ON DATABASE rate1 FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE rate1 TO ingest_rw, app_rw;
GRANT USAGE, CREATE ON SCHEMA public TO ingest_rw, app_rw;
SQL
