# Collect host (ingest + r1.js). Build context: repository root (needs ../tracker).
# Built on the server by infra/deploy/deploy.sh via infra/docker-compose.yml.

# Stage 1: r1.js (served by ingest at /v1/r1.js and /v1/r1.<version>.js)
FROM node:24-alpine AS tracker
WORKDIR /src/tracker
COPY tracker/package.json tracker/package-lock.json ./
# npm install (lock-respecting), not npm ci: Windows-made lock files miss the
# Linux-only optional @emnapi/* deps of a dev tool (npm bug); build output is the same.
RUN npm install --ignore-scripts --no-audit --no-fund
COPY tracker/build.mjs tracker/tsconfig.json ./
COPY tracker/src ./src
RUN node build.mjs

# Stage 2: ingest
FROM node:24-alpine AS build
WORKDIR /src/ingest
COPY ingest/package.json ingest/package-lock.json ./
RUN npm install --no-audit --no-fund
COPY ingest/build.mjs ingest/tsconfig.json ./
COPY ingest/src ./src
COPY ingest/migrations ./migrations
RUN node build.mjs && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 R1_JS_DIR=/app/public
WORKDIR /app
COPY --from=build /src/ingest/package.json ./
COPY --from=build /src/ingest/node_modules ./node_modules
COPY --from=build /src/ingest/dist ./dist
COPY --from=build /src/ingest/migrations ./migrations
COPY --from=tracker /src/tracker/dist ./public
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
