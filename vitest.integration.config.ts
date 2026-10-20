import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// CHARACTER MECHANICS PHASE A5, Checkpoint 1 -- a SEPARATE Vitest project
// for tests/integration/**, the one place a real PostgreSQL connection is
// required (ELDRA_RESOURCE_DB_URL pointing at a disposable, throwaway
// database -- never production, never the live dev Directus database).
// Deliberately NOT merged into vitest.config.ts's own `include`: every
// test there runs with every external dependency mocked, so it can run
// anywhere with no setup; these tests cannot, and must never silently run
// as part of `pnpm run test`.
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // These tests share one real database connection pool across
    // concurrent-expenditure assertions that depend on true parallelism --
    // running test files in parallel worker processes would make the
    // "two simultaneous casts" scenarios meaningless (each worker would get
    // its own pool/transaction ordering). Sequential, single-threaded.
    fileParallelism: false,
    pool: 'forks',
    singleFork: true
  }
})
