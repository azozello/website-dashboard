import { defineConfig } from 'vitest/config';

// Real-chain test: needs Postgres 16 (docker-compose.test.yml) and tracker/dist/r1.js.
export default defineConfig({
  test: { include: ['test/e2e/**/*.e2e.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
});
