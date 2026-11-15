# App host (dashboard). Build context: repository root.
# Built on the server by infra/deploy/deploy.sh via infra/docker-compose.yml.
# Today the dashboard is a static build with mocked data; the edge Caddy proxies app.<domain> to :3000 here.
FROM node:24-alpine AS build
WORKDIR /src/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
# `npm install`, not `npm ci`: dashboard/package-lock.json (made on Windows) lacks Linux optional deps.
RUN npm install --no-audit --no-fund
COPY dashboard/ ./
RUN npm run build

FROM caddy:2.10-alpine
COPY dashboard/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dashboard/dist /srv
EXPOSE 3000
