#!/bin/bash
# Brings the Compose stack to the state of the checked-out commit. Run by rate1-deploy as the deploy user.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${RATE1_ENV_FILE:-/opt/rate1/.env}"
dc() { docker compose --project-name rate1 --env-file "$ENV_FILE" -f docker-compose.yml "$@"; }

dc config --quiet
dc pull --quiet
dc up -d --remove-orphans --wait --wait-timeout 180

# When Compose recreates a network it can reattach a container without its service alias, so Caddy can no longer
# resolve e.g. "app" and answers 502 (seen 2026-11-15 after enabling IPv6 on edge). Check every upstream name from
# Caddy and recreate the service if it doesn't resolve.
for svc in ingest app; do
  if ! dc exec -T caddy getent hosts "$svc" >/dev/null 2>&1; then
    echo "deploy.sh: '$svc' does not resolve from caddy; recreating it"
    dc up -d --force-recreate --no-deps --wait --wait-timeout 120 "$svc"
    dc exec -T caddy getent hosts "$svc" >/dev/null 2>&1 || { echo "deploy.sh: '$svc' still does not resolve" >&2; exit 1; }
  fi
done
# Caddy reads ./caddy as a directory mount, so a changed Caddyfile only needs a reload.
dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker image prune -f >/dev/null
dc ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
echo "deploy.sh: done"
