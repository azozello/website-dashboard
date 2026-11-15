#!/bin/bash
# Nightly logical backup (cron, as deploy). Keeps 7 days in /opt/rate1/backups.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-/opt/rate1/backups}"
ENV_FILE="${RATE1_ENV_FILE:-/opt/rate1/.env}"
dc() { docker compose --project-name rate1 --env-file "$ENV_FILE" -f docker-compose.yml "$@"; }

stamp="$(date -u +%Y-%m-%dT%H%MZ)"
out="$BACKUP_DIR/rate1-$stamp.dump"
umask 077
dc exec -T postgres pg_dump -U postgres -d rate1 --format=custom > "$out.tmp"
mv "$out.tmp" "$out"
find "$BACKUP_DIR" -name 'rate1-*.dump' -type f -mtime +6 -delete
echo "$(date -u +%FT%TZ) pg-backup: wrote $out ($(stat -c %s "$out") bytes)"
