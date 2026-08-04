import { defineConfig } from 'vitest/config'

// Minimal Vitest config for pure TypeScript unit tests (app/lib/**).
// No aliases are configured because the modules under test
// (app/lib/importers/**, app/lib/systems/**) use only relative imports.
// No DOM/browser environment is required for this test scope.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
