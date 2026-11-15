#!/bin/bash
# Brings the Compose stack to the state of the checked-out commit. Run by rate1-deploy as the deploy user.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${RATE1_ENV_FILE:-/opt/rate1/.env}"
dc() { docker compose --project-name rate1 --env-file "$ENV_FILE" -f docker-compose.yml "$@"; }

dc config --quiet
dc pull --quiet
dc up -d --remove-orphans --wait --wait-timeout 180
# Caddy reads ./caddy as a directory mount, so a changed Caddyfile only needs a reload.
dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker image prune -f >/dev/null
dc ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
echo "deploy.sh: done"
