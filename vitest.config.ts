import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Minimal Vitest config for pure TypeScript unit tests.
// No DOM/browser environment is required for this test scope.
//
// The `~` / `@` aliases mirror Nuxt's own srcDir resolution (app/). They were
// not needed while every tested module used relative imports, and while the
// only alias-style imports in tested files were `import type`, which the
// transform erases without ever resolving.
//
// Character Builder / Sheet Phase 3 made them necessary: a component-adjacent
// module (app/components/characters/builder/characterBuilderSelection.ts) now
// has a real VALUE import of a pure domain module
// (app/lib/characters/ability-scores.ts). Without these aliases, whether one
// app/ module may import another by alias would depend on whether a test
// happens to exist for it -- which is the config constraining the source,
// rather than the other way round.
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
