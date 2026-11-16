#!/bin/bash
# Called by deploy.sh with the deploy's stdin: brings the server's env file up to date without anyone logging in.
#
# 1. Takes NAME=value lines that CI sends over the deploy SSH connection (GitHub secrets, see
#    .github/workflows/deploy.yml) and writes them into the env file.
#      - Only names in ALLOWED are taken; anything else is skipped (its value is never printed).
#      - An empty value never overwrites: an unset GitHub secret leaves the server's value alone.
#      - Values are written single-quoted (literal for Compose); a value containing ' is refused.
# 2. Generates server-only values that are missing (BETTER_AUTH_SECRET and TOKEN_ENCRYPTION_KEY never leave the
#    server) and fills MAIL_FROM with a default.
#
# Interactive runs (stdin is a terminal) skip step 1. Prints names only, never values.
set -euo pipefail

ENV_FILE="$1"
ALLOWED=" SMTP_URL MAIL_FROM GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET "

declare -A set_to=()
updated=()
generated=()

if [ ! -t 0 ]; then
  # -t: an unused stdin (e.g. an older workflow that sends nothing but keeps the pipe open) can't hang the deploy.
  while IFS= read -r -t 10 line || [ -n "${line:-}" ]; do
    [ -z "$line" ] && continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "$line" != *=* || ! "$key" =~ ^[A-Z][A-Z0-9_]*$ || "$ALLOWED" != *" $key "* ]]; then
      echo "merge-secrets: skipped an entry that is not an allowed NAME=value" >&2
      line=""
      continue
    fi
    line=""
    [ -z "$value" ] && continue
    if [[ "$value" == *"'"* ]]; then
      echo "merge-secrets: $key contains a single quote, which the env file can't hold; not written" >&2
      exit 1
    fi
    set_to[$key]="$value"
    updated+=("$key")
  done
fi

# Current value of NAME in the env file (last occurrence), without surrounding quotes; empty if absent.
current() {
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-)" || true
  v="${v%%[[:space:]]#*}"            # trailing comment
  v="${v#\'}"; v="${v%\'}"; v="${v#\"}"; v="${v%\"}"
  printf '%s' "$v"
}

if [ -z "$(current BETTER_AUTH_SECRET)" ] && [ -z "${set_to[BETTER_AUTH_SECRET]:-}" ]; then
  set_to[BETTER_AUTH_SECRET]="$(openssl rand -base64 48)"
  generated+=(BETTER_AUTH_SECRET)
fi
# Normally written by cloud-init on first boot; generated here for servers created before it was. Never rotate it:
# stored Search Console tokens can only be decrypted with the key they were sealed with.
if [ -z "$(current TOKEN_ENCRYPTION_KEY)" ]; then
  set_to[TOKEN_ENCRYPTION_KEY]="$(openssl rand -base64 32)"
  generated+=(TOKEN_ENCRYPTION_KEY)
fi
if [ -z "$(current MAIL_FROM)" ] && [ -z "${set_to[MAIL_FROM]:-}" ]; then
  domain="$(current DOMAIN)"
  set_to[MAIL_FROM]="Rate 1 <no-reply@${domain:-localhost}>"
  generated+=(MAIL_FROM)
fi

[ ${#set_to[@]} -eq 0 ] && exit 0

# Rewrite atomically: same directory, mode 600, then rename over the old file.
umask 077
tmp="$(mktemp "$(dirname "$ENV_FILE")/.env.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
pattern="^($(IFS='|'; echo "${!set_to[*]}"))="
grep -Ev "$pattern" "$ENV_FILE" > "$tmp" || true
for key in "${!set_to[@]}"; do
  printf "%s='%s'\n" "$key" "${set_to[$key]}" >> "$tmp"
done
mv -f "$tmp" "$ENV_FILE"
trap - EXIT

[ ${#updated[@]} -gt 0 ] && echo "merge-secrets: updated ${updated[*]} from CI"
[ ${#generated[@]} -gt 0 ] && echo "merge-secrets: generated ${generated[*]}"
exit 0
