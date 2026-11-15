# Rate 1 PoC — infrastructure runbook

One Hetzner Cloud server running Caddy, the ingest service, the dashboard and Postgres 16 in Docker Compose.
Source of truth for the requirements: `specs/Data-Contract-v1.md` §2.

```
Internet ──► Hetzner Cloud Firewall (in: 80, 443 from anywhere; 22 from admin IP only)
              │
              ▼
          rate1-1 (CX23, Ubuntu 24.04, nbg1)
          ┌──────────────────────── docker network "edge" 172.30.0.0/24 ───────────────┐
          │ caddy :80/:443 ──► collect.bazed.live ──► ingest:8080                       │
          │                └─► app.bazed.live     ──► app:3000                          │
          │                └─► bazed.live         ──► 302 to app.bazed.live             │
          └──────────────────────────────────────────────────────────────────────────────┘
          ┌──────────────────────── docker network "internal" 172.30.1.0/24 (no internet) ┐
          │ ingest, app ──► postgres:5432 (db rate1, roles ingest_rw / app_rw)            │
          └──────────────────────────────────────────────────────────────────────────────┘
```

| Path | What |
| --- | --- |
| `terraform/` | OpenTofu/Terraform: SSH key, firewall, server (+ backups, delete protection), cloud-init |
| `terraform/cloud-init.yaml.tftpl` | First boot: users, SSH hardening, unattended upgrades, Docker, repo clone, `.env` with random secrets, first deploy |
| `docker-compose.yml` | caddy, ingest, app, postgres; networks `edge` and `internal` |
| `caddy/Caddyfile` | TLS, 16 KiB body limit on `/v1/e`, no Set-Cookie and no access log on collect, HSTS on app |
| `postgres/initdb/10-roles.sh` | Creates `ingest_rw` and `app_rw` on first start of an empty volume |
| `.env.example` | Variables of `/opt/rate1/.env` (the real file exists only on the server) |
| `deploy/rate1-deploy` | Installed at `/usr/local/bin/rate1-deploy`; checks out a ref and runs `deploy/deploy.sh` |
| `deploy/deploy.sh` | `docker compose pull && up -d --wait`, then `caddy reload` |
| `backup/pg-backup.sh`, `backup/pg-restore.sh` | Nightly `pg_dump` (7 days kept) and restore |
| `../.github/workflows/deploy.yml` | CI/CD: deploys `main` on every merge |

**Key facts**

- `TRUSTED_PROXY_CIDRS=172.30.0.0/24` (the `edge` network). Caddy is the only proxy in it. It *replaces* any client-sent
  `X-Forwarded-For` with the real client address, so ingest can trust that header from this range.
- `CLIENT_IP_HEADER=X-Forwarded-For`.
- On the server: repo checkout `/opt/rate1/repo` (detached at the deployed commit), secrets `/opt/rate1/.env` (mode 600,
  owner `deploy`), dumps `/opt/rate1/backups/`.
- Users: `ops` (sudo, your key), `deploy` (docker group, no sudo; its CI key can only run `rate1-deploy <ref>`).
  Root login and password login are disabled.

---

## Create (from zero)

Prerequisites: OpenTofu ≥ 1.6 (`brew install opentofu`) or Terraform, `hcloud` CLI, a Hetzner Cloud project and an
API token with read/write rights.

```bash
hcloud context create rate1                 # paste the token when asked; stored in ~/.config/hcloud/cli.toml
export HCLOUD_TOKEN="$(hcloud context active >/dev/null && awk -F'"' '/token/ {print $2; exit}' ~/.config/hcloud/cli.toml)"
ssh-keygen -t ed25519 -N '' -C rate1-github-deploy -f ~/.ssh/rate1_deploy   # CI deploy key
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # set your key path and your IP (curl -4 https://api.ipify.org)
tofu init
tofu plan
tofu apply
tofu output dns_records
```

The `awk` line assumes one context in `cli.toml`; with several, copy the token of the right one. Cloud-init then
installs everything and runs the first deploy of `bootstrap_ref` (≈ 3–5 min). Watch it with
`ssh ops@<ip> sudo cloud-init status --wait` and `sudo tail -f /var/log/cloud-init-output.log`.

**DNS** (bazed.live is hosted at Websupport.sk, not managed in code): add the records printed by
`tofu output dns_records` — A and AAAA for `collect`, `app` and the apex. TTL 300 is fine. Caddy gets the certificates
on its own once the names resolve (it retries in the background until then).

**CI/CD** (one-time, after `apply`):

```bash
IP=$(tofu output -raw ipv4)
gh secret set HCLOUD_TOKEN                       # paste a Hetzner token (a separate "github-deploy" token is best)
gh secret set DEPLOY_SSH_KEY < ~/.ssh/rate1_deploy
gh variable set DEPLOY_HOST --body "$IP"
gh variable set DEPLOY_KNOWN_HOSTS --body "$(ssh-keyscan -t ed25519 "$IP" 2>/dev/null)"
gh variable set HCLOUD_FIREWALL --body rate1-fw
```

Check the host key you scanned against the server's own: `ssh ops@$IP ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`
vs `ssh-keyscan -t ed25519 $IP | ssh-keygen -lf -`.

From then on, every push/merge to `main` runs `.github/workflows/deploy.yml`: it opens port 22 in the Hetzner
firewall for the runner's IP, runs `ssh deploy@<server> <sha>`, and always removes the rule again. It can also be run
by hand from the Actions tab (workflow_dispatch). A deploy can be started from your machine too:

```bash
ssh ops@<ip> sudo -u deploy -H rate1-deploy main      # or a branch / commit sha
```

## Deploy a new app image

The ingest (W3) and dashboard (W4) services are placeholders (`traefik/whoami`) until real images exist. Images must
be `linux/amd64` (CX23 is x86) and listen on 8080 (ingest) and 3000 (app).

1. Publish the image, e.g. `ghcr.io/<owner>/rate1-ingest:<tag>` (public, or run `docker login ghcr.io` once on the server as `deploy`).
2. Pin it in `docker-compose.yml` (`image: ${INGEST_IMAGE:-ghcr.io/...:<tag>}`) and remove the `WHOAMI_*` lines, then
   merge to `main`. CI deploys it.
   Quick override without a commit: set `INGEST_IMAGE=` / `APP_IMAGE=` in `/opt/rate1/.env` and run
   `sudo -u deploy -H rate1-deploy main`.
3. Roll back: revert the commit and merge, or deploy an older sha: `sudo -u deploy -H rate1-deploy <sha>`.

## Update

| Change | How |
| --- | --- |
| Compose, Caddyfile, scripts | Merge to `main`. CI deploys; Caddy reloads in place. |
| Secrets / env | Edit `/opt/rate1/.env` on the server (`sudo -u deploy -H nano /opt/rate1/.env`), then `rate1-deploy main`. DB passwords: also `ALTER ROLE ... PASSWORD` in Postgres. |
| OS packages | Security updates install automatically (unattended-upgrades). Other updates: `sudo apt full-upgrade`, then `sudo reboot` when `/var/run/reboot-required` exists. Containers restart on their own. |
| Postgres 16 minor | Merge (tag `postgres:16` is re-pulled on every deploy). Major upgrade = dump + restore into a new volume. |
| Firewall, server type, backups | Edit `terraform/`, `tofu plan`, `tofu apply`. Server type changes reboot the server. |
| `cloud-init.yaml.tftpl`, `deploy/rate1-deploy` | Only used at creation (changes are ignored so they never replace the server). Apply the same change by hand on the live server (`sudo install -m 755 infra/deploy/rate1-deploy /usr/local/bin/`). |
| Your IP changed | Update `ssh_allowed_cidrs` in `terraform.tfvars`, `tofu apply` (or add it in the Hetzner console if you're locked out). |

## Backup and restore

Two layers:

- **Hetzner backups** (whole-disk snapshot, daily, last 7 kept): on via `backups = true`. Restore = Hetzner console →
  server → Backups → "Rebuild from backup" (needs `rebuild_protection` off; overwrites the disk) or "Convert to image"
  and create a new server from it.
- **pg_dump**: cron `/etc/cron.d/rate1-backup`, 02:15 UTC, `/opt/rate1/backups/rate1-<time>.dump` (custom format),
  7 days kept, log in `/opt/rate1/backups/backup.log`. These dumps live on the same disk, so they're also inside the
  Hetzner backup; copy one off the server for an independent copy:
  `scp ops@<ip>:/opt/rate1/backups/<file>.dump .` (as `ops`: `sudo cp` it to `/tmp` and `chown` first).

```bash
# on the server, as ops
cd /opt/rate1/repo/infra
sudo -u deploy -H backup/pg-backup.sh                                   # dump now
ls -l /opt/rate1/backups/
sudo -u deploy -H backup/pg-restore.sh /opt/rate1/backups/<file>.dump rate1_restore   # restore to a scratch db
docker exec rate1-postgres-1 psql -U postgres -d rate1_restore -c '\dt'              # check it
docker exec rate1-postgres-1 dropdb -U postgres rate1_restore                         # clean up
```

Replace the live database with a dump (downtime for ingest and app):

```bash
cd /opt/rate1/repo/infra
dc() { sudo -u deploy -H docker compose --project-name rate1 --env-file /opt/rate1/.env -f docker-compose.yml "$@"; }
dc stop ingest app
docker exec rate1-postgres-1 psql -U postgres -c 'ALTER DATABASE rate1 RENAME TO rate1_old'
sudo -u deploy -H backup/pg-restore.sh /opt/rate1/backups/<file>.dump rate1
docker exec rate1-postgres-1 psql -U postgres -c 'GRANT CONNECT, TEMPORARY ON DATABASE rate1 TO ingest_rw, app_rw'
dc start ingest app
# when happy: docker exec rate1-postgres-1 dropdb -U postgres rate1_old
```

## Destroy

The server has Hetzner delete and rebuild protection, so nothing goes away by accident.

```bash
cd infra/terraform
# 1. take what you need off the server first (latest dump, /opt/rate1/.env)
# 2. allow deletion
sed -i '' 's/delete_protection  = true/delete_protection  = false/; s/rebuild_protection = true/rebuild_protection = false/' main.tf
tofu apply             # only flips the protection flags
tofu destroy           # server (and its IPs and Hetzner backups), firewall, SSH key
```

Then remove the DNS records and the GitHub secrets/variables (`gh secret delete HCLOUD_TOKEN`, etc.), and revoke the
Hetzner API tokens.

## Monthly cost

Prices from the Hetzner API (`/v1/pricing`) for nbg1 on 15 Nov 2026, excl. VAT:

| Item | €/month |
| --- | --- |
| CX23 server | 5.49 |
| Primary IPv4 | 0.50 |
| Automatic backups (+20% of server) | 1.10 |
| IPv6, firewall, traffic (20 TB incl.) | 0.00 |
| **Total** | **7.09** (≈ 8.72 incl. 23% VAT) |

## Move to another Hetzner account and/or domain

1. In the new account: create a project and an API token; `hcloud context create <name>`; export `HCLOUD_TOKEN`.
2. Take a fresh dump from the old server and copy it to your machine (see Backup); also copy `/opt/rate1/.env`
   (or let cloud-init generate new secrets and only carry over `GOOGLE_*` and `TOKEN_ENCRYPTION_KEY` — the latter is
   needed to decrypt stored Search Console refresh tokens).
3. New domain: set `domain` in `terraform.tfvars` (Caddy reads `DOMAIN` from `.env`; update `COLLECT_BASE_URL`,
   `APP_BASE_URL` there too). Every site's script tag points at `collect.<domain>`, so the sites' install snippets must
   be updated as well.
4. Use a new state: `cd infra/terraform && mv terraform.tfstate terraform.tfstate.old-account` (keep it until the old
   server is destroyed), then `tofu apply` with the new token.
5. On the new server: copy the dump and `.env` over (`scp` as `ops`, then `sudo install -o deploy -g deploy -m 600 ...`),
   restore the dump as in "Replace the live database", run `sudo -u deploy -H rate1-deploy main`.
6. Point DNS at the new IPs, update the GitHub variables (`DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`) and the `HCLOUD_TOKEN`
   secret.
7. When the new server is verified, destroy the old one with the old state and old token.

## Verification commands

```bash
D=bazed.live; IP=<server ipv4>
dig +short A collect.$D; dig +short AAAA collect.$D; dig +short A app.$D; dig +short AAAA app.$D
curl -sI http://collect.$D/ | head -3                       # 308 to https
curl -sv https://app.$D/healthz 2>&1 | grep -E 'subject:|issuer:|expire|HTTP/|strict-transport'
curl -s https://collect.$D/ | grep -i x-forwarded-for         # must equal: curl -4 https://api.ipify.org
curl -sI https://collect.$D/ | grep -ci set-cookie            # 0
head -c 17000 /dev/zero | curl -s -o /dev/null -w '%{http_code}\n' -X POST --data-binary @- https://collect.$D/v1/e   # 413
nc -vz -w 3 $IP 5432                                           # refused / timeout
ssh ops@$IP 'docker logs rate1-caddy-1 2>&1 | grep -c <your ip>'   # 0
```

## Known gaps vs Data Contract §2

- **Rate limits** (`/v1/e` 120/min per IP, others 60/min) are not enforced: stock Caddy has no rate limiter. Options:
  a Caddy build with the `caddy-ratelimit` module, or enforce them in the ingest service. Not done; needs a decision.
- **`/healthz` on both hosts**: answered by the placeholders today; the real services must implement it.
- **`ENV=test`** is set for the PoC (enables `/v1/_echo` in the real ingest). Switch to `prod` in `.env` later.
