// Maps follow-up pass, Area 2 (page shell/theme) and Area 1 (Media
// Gallery) integration coverage for app/pages/worlds/[id]/maps.vue.
//
// This codebase has no Vue Test Utils / SFC-mounting infrastructure (no
// test anywhere mounts a .vue file and renders it), so this cannot be a
// rendered-DOM interaction test. tests/lib/themes/themes.test.ts
// establishes the codebase's own precedent for exactly this situation:
// read the page's raw source and assert on it directly. That test guards
// a fully token-migrated file list against literal colors; maps.vue is
// deliberately modeled on a sibling that is NOT in that list
// (app/pages/worlds/[id]/timelines/index.vue, which still uses the same
// gold hex literals alongside the shared eldra-* classes -- see
// .github/docs/architecture/theming.md §8, ~1,230 such literals remain
// page-specific and are migrated separately), so this file checks the
// narrower, concrete regression: the OLD blue "SaaS dashboard" shell
// (bg-[#09111a], sky/amber/violet raw Tailwind accents, rounded-xl/-full)
// is gone, the current Eldra shell classes are in place, and the
// functionality the task required to survive (map listing/search, upload
// form, map types, zoom tile options, hierarchy/default-map controls, the
// Media Gallery wiring) is still present in the page.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('../../../../app/pages/worlds/[id]/maps.vue', import.meta.url)), 'utf8')

describe('app/pages/worlds/[id]/maps.vue shell/theme', () => {
  it('declares the world-workspace layout', () => {
    expect(source).toMatch(/definePageMeta\(\{\s*layout:\s*'world-workspace'/)
  })

  it('no longer uses the old blue "SaaS dashboard" shell classes', () => {
    const forbidden = [
      /bg-\[#09111a\]/,
      /text-sky-\d/,
      /bg-sky-\d/,
      /border-sky-\d/,
      /border-violet-\d/,
      /bg-violet-\d/,
      /text-violet-\d/,
      /rounded-xl/,
      /rounded-full/,
      /rounded-\[24px\]/,
      /bg-\[rgba\(8,16,27/
    ]

    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern)
    }
  })

  it('uses the shared Eldra shell classes, the same ones neighboring world-management pages use', () => {
    for (const expected of ['eldra-ornate-panel', 'eldra-frame-corners', 'eldra-button', 'eldra-input', 'rounded-none']) {
      expect(source).toContain(expected)
    }
  })

  it('wires the Media Gallery (WorldMediaPicker) into the upload form rather than only a bare OS file input', () => {
    expect(source).toContain('<WorldMediaPicker')
    expect(source).toContain('@select="selectGalleryImage"')
    expect(source).toContain("v-model:open=\"mediaPickerOpen\"")
    // The direct-local-file path must still exist as a clearly separate option.
    expect(source).toContain('@change="onFileChange"')
  })

  it('preserves map listing/search, upload form fields, map types, zoom tile options, and hierarchy/default-map controls', () => {
    for (const marker of [
      'search',
      'uploadMap',
      'MAP_TYPE_OPTIONS',
      'generateTiles',
      'tileMaxZoom',
      'setAsWorldMap',
      'saveParentMap',
      'parentOptionsFor'
    ]) {
      expect(source).toContain(marker)
    }
  })
})
