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

  // RESTORE A CLEAR, CONSISTENT FULL-EDITOR ENTRY POINT -- the floating
  // "Page Builder" button (undiscoverable, misleadingly also opened a
  // SEPARATE page-presentation aside under the same flag) is replaced by
  // a header-card "Edit" button plus the shared WorldPageCustomizeButton,
  // reusing the article's EXISTING inline authoring sections unchanged.
  it('no longer renders the floating "Page Builder" button', () => {
    expect(source).not.toMatch(/>\s*Page Builder\s*</)
  })

  it('renders a header "Edit" toggle gated on canAuthorArticle only, independent of canEditPageSettings', () => {
    const headerRow = source.slice(
      source.indexOf('<div class="flex flex-wrap items-start justify-between gap-3">'),
      source.indexOf('<h1 class="mt-4 text-6xl')
    )

    expect(headerRow).toContain('v-if="canAuthorArticle"')
    expect(headerRow).toContain("buildDrawerOpen ? 'Close' : 'Edit'")
  })

  it('reuses the shared WorldPageCustomizeButton for page presentation, gated on canEditPageSettings, instead of a bespoke aside', () => {
    expect(source).toContain('<WorldPageCustomizeButton')
    expect(source).toContain('v-if="canEditPageSettings"')
    expect(source).not.toContain('Article Setup')
    expect(source).not.toMatch(/<aside[^>]*v-if="buildDrawerOpen"/)
  })

  it('articleRightRailOpen no longer reserves margin for the removed presentation aside', () => {
    const computedBlock = source.slice(
      source.indexOf('const articleRightRailOpen = computed('),
      source.indexOf('const articleBaselineMarkdown')
    )

    expect(computedBlock).not.toContain('buildDrawerOpen')
    expect(computedBlock).toContain('contextDrawerOpen')
  })

  it('opening Edit reveals Header/Body/Sidebar sections directly -- no further nested toggle', () => {
    // Header is self-contained: v-if="authoringActive" sits on the exact
    // same element as its own id.
    const headerIdIndex = source.indexOf('id="article-build-header"')
    const headerBefore = source.slice(Math.max(0, headerIdIndex - 60), headerIdIndex)
    expect(headerBefore).toContain('v-if="authoringActive"')

    // Body and Sidebar are siblings inside ONE v-else-if="authoringActive"
    // branch (of the if/else-if/else chain deciding what the article area
    // shows); both ids must fall inside that branch's own span, up to the
    // chain's final v-else ("No article content yet."), regardless of
    // unrelated NESTED conditionals in between (e.g. each section's own
    // "Unsaved" badge) -- those are siblings within the branch, not a
    // second gate guarding the section itself.
    const branchStart = source.indexOf('v-else-if="authoringActive"')
    const branchEnd = source.indexOf('No article content yet.')
    expect(branchStart).toBeGreaterThan(-1)
    expect(branchEnd).toBeGreaterThan(branchStart)

    const bodyIdIndex = source.indexOf('id="article-build-body"')
    const sidebarIdIndex = source.indexOf('id="article-build-sidebar"')
    expect(bodyIdIndex).toBeGreaterThan(branchStart)
    expect(bodyIdIndex).toBeLessThan(branchEnd)
    expect(sidebarIdIndex).toBeGreaterThan(branchStart)
    expect(sidebarIdIndex).toBeLessThan(branchEnd)
  })

  it('the Article Image control uses WorldMediaPicker (an existing asset or a fresh Gallery upload), not a bare OS file input', () => {
    expect(source).toContain('<WorldMediaPicker')
    expect(source).toContain('v-model:open="articleImagePickerOpen"')
    expect(source).toContain('@select="onArticleImageSelected"')
    expect(source).not.toContain('type="file"')
  })

  it('stores the applied image as the original asset reference, previewed through buildCardThumbnailUrl', () => {
    expect(source).toContain("import { buildCardThumbnailUrl } from '~/lib/media/thumbnail-url'")
    expect(source).toContain('buildCardThumbnailUrl(entityImageUrl)')
    const selectFnStart = source.indexOf('async function onArticleImageSelected')
    const selectFnBlock = source.slice(selectFnStart, selectFnStart + 800)
    expect(selectFnBlock).toContain('imageFileId: String(file.id)')
  })
})
