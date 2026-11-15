#!/usr/bin/env bash
# Runs every test for the WordPress plugin and the custom-PHP helper:
#   1. phpcs (WordPress Coding Standards + PHPCompatibilityWP 7.4-)
#   2. unit tests on the local PHP and on PHP 7.4 (Docker), incl. the Elementor stub test
#      and the path normaliser against contract/v1/path-normalisation.json
#   3. integrations/php helper tests (local PHP and PHP 7.4) against the mock collector
#   4. Docker WordPress + Contact Form 7 integration tests + official Plugin Check
#
#   wp-plugin/tests/run.sh [--keep] [--reuse] [--skip-plugin-check]
#
# Needs: bash, PHP 7.4+ with zip, Composer, Node 18+, Docker. Ports 8088 and 4010.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Docker on Windows (Git Bash) needs a Windows path for volumes.
DOCKER_ROOT="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

quiet() { local out; if out="$("$@" 2>&1)"; then echo "$out" | tail -n 1; else echo "$out" | grep -v "^  ok "; return 1; fi; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

MOCK_PID=""
cleanup() { if [ -n "$MOCK_PID" ]; then kill "$MOCK_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT

step "Mock collector (contract/mock-collector, port 4010)"
if curl -sf http://127.0.0.1:4010/healthz >/dev/null 2>&1; then
  echo "already running"
else
  [ -d contract/mock-collector/node_modules ] || (cd contract/mock-collector && npm ci --silent)
  (cd contract/mock-collector && PORT=4010 exec node server.mjs >/dev/null 2>&1) &
  MOCK_PID=$!
  for _ in $(seq 1 50); do curl -sf http://127.0.0.1:4010/healthz >/dev/null 2>&1 && break; sleep 0.1; done
  echo "started (pid $MOCK_PID)"
fi

step "phpcs (WordPress + PHPCompatibilityWP, testVersion 7.4-)"
[ -d wp-plugin/vendor ] || (cd wp-plugin && composer install --no-interaction --quiet)
(cd wp-plugin && vendor/bin/phpcs -q --report=summary) && echo "phpcs: clean"

step "Unit tests (local PHP)"
R1_MOCK_URL=http://127.0.0.1:4010 quiet php wp-plugin/tests/unit/run.php

step "PHP helper tests (local PHP)"
quiet php integrations/php/tests/test.php

step "PHP 7.4: lint, unit tests, helper tests (Docker php:7.4-cli-alpine)"
docker run --rm --add-host=host.docker.internal:host-gateway \
  -e R1_MOCK_URL=http://host.docker.internal:4010 \
  -v "$DOCKER_ROOT:/repo:ro" -w /repo php:7.4-cli-alpine sh -c '
    set -e
    for f in $(find wp-plugin/rate1-connector integrations/php -name "*.php"); do php -l "$f" >/dev/null; done
    echo "lint: ok"
    php wp-plugin/tests/unit/run.php > /tmp/u.txt || { grep -v "^  ok " /tmp/u.txt; exit 1; }; tail -n 1 /tmp/u.txt
    php integrations/php/tests/test.php > /tmp/h.txt || { grep -v "^  ok " /tmp/h.txt; exit 1; }; tail -n 1 /tmp/h.txt'

step "Integration: Docker WordPress + Contact Form 7 + mock collector (+ Plugin Check)"
node wp-plugin/tests/integration.mjs "$@"
