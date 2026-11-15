#!/bin/bash
# Restore a pg-backup.sh dump into a database.
#   pg-restore.sh <dump file> <target db>
# The target must not exist yet (restore into a scratch db, check it, then swap - see README).
set -euo pipefail
cd "$(dirname "$0")/.."

dump="${1:?usage: pg-restore.sh <dump file> <target db>}"
target="${2:?usage: pg-restore.sh <dump file> <target db>}"
[[ "$target" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "invalid db name" >&2; exit 2; }

ENV_FILE="${RATE1_ENV_FILE:-/opt/rate1/.env}"
dc() { docker compose --project-name rate1 --env-file "$ENV_FILE" -f docker-compose.yml "$@"; }

dc exec -T postgres createdb -U postgres "$target"
dc exec -T postgres pg_restore -U postgres -d "$target" --exit-on-error < "$dump"
echo "pg-restore: restored $dump into $target"
