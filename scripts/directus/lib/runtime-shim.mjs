// Nuxt Runtime Shim -- lets a standalone Node script call the REAL,
// unmodified server/utils/*.ts functions (which are written assuming
// Nuxt's auto-imported globals exist) without running inside Nitro.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// Every scripts/directus/*.mjs file before this one avoided
// directusServiceRequest (server/utils/directus.ts) entirely and wrote its
// own local `dx()` fetch helper instead -- publish-rules-package.mjs's own
// design decision 1 explains why: directusServiceRequest calls
// `useRuntimeConfig()`, a Nuxt-injected global absent outside a running
// Nitro process.
//
// Package Sync Phase 1 needs more than rules_packages GET/POST, though --
// it needs to call the REAL refreshContentSource, publishContentSourceSelection,
// activateWorldRulesPackage, bindContentPackToWorld, getWorldRuntime, and
// getWorldContentCatalogue, because this task explicitly forbids
// reimplementing them ("Do NOT create a second compiler/publisher"). Every
// one of those functions eventually calls directusServiceRequest, several
// layers deep. Re-implementing all of that orchestration in a script would
// itself BE "a second compiler/publisher" -- the thing being avoided.
//
// This module closes that gap the smallest way that is still real, not
// mocked: `server/utils/directus.ts`'s three Nuxt-auto-imported calls
// (`useRuntimeConfig`, `$fetch`, `createError`) are given real, working
// implementations as actual globals, so the genuine, unmodified
// server/utils/*.ts code runs exactly as it does inside Nitro.
//
// ---------------------------------------------------------------------------
// WHY THIS IS SAFE, NOT A HACK THAT COULD SILENTLY MISBEHAVE
// ---------------------------------------------------------------------------
// `getRuntimeDirectusConfig()` (directus.ts) reads `process.env.DIRECTUS_URL`
// and `process.env.DIRECTUS_TOKEN` FIRST, before ever consulting
// `useRuntimeConfig()`'s return value -- confirmed by reading that
// function's exact fallback order. This shim's `useRuntimeConfig` stub is
// therefore never actually consulted for a value in this tool's normal
// operation; it exists only so the bare function reference does not throw
// ReferenceError. `$fetch` is the REAL `ofetch` (the exact package Nuxt's
// own `$fetch` global IS, verified: `nuxt/dist/...` re-exports ofetch's
// default instance) -- not a re-implementation, so every HTTP behavior
// (JSON parsing, non-2xx throwing with `.data`/`.statusCode`) matches
// production exactly. `createError` is the REAL `h3` package's own
// `createError` -- again the exact function Nuxt/Nitro auto-imports, not a
// re-implementation.
//
// ---------------------------------------------------------------------------
// WHAT THIS DOES NOT DO
// ---------------------------------------------------------------------------
// This shim does NOT stub `defineEventHandler`, `getRouterParam`,
// `readBody`, or any other H3/Nitro route-handling global -- this tool
// never imports a server/api/**/*.ts route file, only server/utils/*.ts
// modules, none of which use those.

import { ofetch } from 'ofetch'
import { createError } from 'h3'

let installed = false

export function installNuxtRuntimeShim() {
  if (installed) return
  installed = true

  if (typeof globalThis.$fetch === 'undefined') {
    globalThis.$fetch = ofetch
  }
  if (typeof globalThis.createError === 'undefined') {
    globalThis.createError = createError
  }
  if (typeof globalThis.useRuntimeConfig === 'undefined') {
    // Never actually consulted for a value -- see this file's header.
    // Returns a harmless, correctly-shaped stand-in only so the bare call
    // does not throw.
    globalThis.useRuntimeConfig = () => ({ directusToken: '', public: { directusUrl: '' } })
  }
}
