// BLANK ARTICLE + QUICK-CREATE IMAGE regression coverage for
// app/pages/worlds/[id]/entities/[entityId]/index.vue.
//
// This codebase has no Vue Test Utils / SFC-mounting infrastructure (no
// test anywhere mounts a .vue file and renders it) -- tests/lib/themes/themes.test.ts
// and tests/app/pages/worlds/maps.test.ts establish the codebase's own
// precedent for exactly this situation: read the page's raw source and
// assert on it directly.
//
// The bug this guards: `authoringActive` (a computed) closed over
// `buildDrawerOpen`, which was declared ~900 lines further down the same
// <script setup>. That is not merely bad style -- `watch()`'s source
// getter runs SYNCHRONOUSLY the instant watch() is called (to seed its
// own tracked value), regardless of the `immediate` option, and one such
// watch (feeding resolveArticleSidebarMentions) reads a value that chains
// through authoringActive -> buildDrawerOpen well before that
// declaration had run. That is a real TDZ ReferenceError ("Cannot access
// 'buildDrawerOpen' before initialization"), reproduced for real against
// a disposable Directus instance: every single entity article page 500'd,
// on every load, not only freshly created ones. The fix is purely an
// ordering change (declare buildDrawerOpen before authoringActive) with
// no behavioral change, so the only thing worth asserting is the order
// itself -- a behavioral/rendering test would need the SFC-mounting
// infrastructure this codebase does not have.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../../../../../app/pages/worlds/[id]/entities/[entityId]/index.vue', import.meta.url)),
  'utf8'
)

describe('app/pages/worlds/[id]/entities/[entityId]/index.vue', () => {
  it('declares buildDrawerOpen before authoringActive references it (TDZ regression)', () => {
    const buildDrawerOpenIndex = source.indexOf('const buildDrawerOpen = ref(false)')
    const authoringActiveIndex = source.indexOf('const authoringActive = computed(')

    expect(buildDrawerOpenIndex).toBeGreaterThan(-1)
    expect(authoringActiveIndex).toBeGreaterThan(-1)
    expect(buildDrawerOpenIndex).toBeLessThan(authoringActiveIndex)
  })

  it('declares buildDrawerOpen exactly once (no leftover duplicate from the fix)', () => {
    const matches = source.match(/const buildDrawerOpen = ref\(false\)/g) || []
    expect(matches).toHaveLength(1)
  })

  it('forwards the incoming request cookie on the entity fetch (SSR/hard-refresh regression)', () => {
    // Separate, real defect found while verifying "direct URL and hard
    // refresh render it": this page's own entity fetch used useAsyncData
    // + a bare $fetch call, which (unlike useFetch) does not forward the
    // original request's cookies during SSR -- so every entity page
    // loaded via a fresh/hard-refreshed URL rendered a logged-out,
    // empty-entity fallback for an authenticated viewer. Reproduced for
    // real: the internal self-fetch came back 401 "Authentication
    // required" even though the outer request carried a valid session.
    const entityFetchBlock = source.slice(
      source.indexOf('const { data: entity, refresh: refreshEntity }'),
      source.indexOf('const classFeaturesUrl')
    )

    expect(entityFetchBlock).toContain("useRequestHeaders(['cookie'])")
  })
})
