import { defineConfig } from 'vitest/config';

// Tests need the dev Postgres (npm run db:up). Each test file creates its own database.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
