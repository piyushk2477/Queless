import { defineConfig } from 'vitest/config';

// Integration tests need a Postgres with the schema + seed loaded:
//   TEST_DATABASE_URL=postgres://... npm test
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://unused@localhost/unused',
      SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
      FRONTEND_URL: 'http://localhost:5173',
      JOBS_ENABLED: 'false',
    },
  },
});
