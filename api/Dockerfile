# App API (sign-in, tenants) for app.<domain>/api. Build context: repository root.
# Built on the server by infra/deploy/deploy.sh via infra/docker-compose.yml (services `api` and `api-migrate`).
# Runs the TypeScript sources directly (Node 24 strips types); no build step.
FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8081
WORKDIR /app
COPY api/package.json api/package-lock.json ./
# npm install (lock-respecting), not npm ci: Windows-made lock files can miss Linux-only optional deps.
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY api/src ./src
COPY api/migrations ./migrations
USER node
EXPOSE 8081
CMD ["node", "src/main.ts"]
