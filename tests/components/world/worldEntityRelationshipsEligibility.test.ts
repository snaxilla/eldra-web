// Unit tests for app/components/world/worldEntityRelationshipsEligibility.ts
// -- the pure gate behind WorldEntityRelationshipsPanel.vue's own
// `canEdit`. No DOM/browser component harness exists in this repo (see
// worldEntityDirectEditEligibility.test.ts for the established sibling
// pattern), so this proves the gating logic directly.
//
// ARTICLE PAGE BUILDER WITHOUT PLAY/BUILD MODE, the condition under
// test: this function takes no `mode`/build-state parameter at all, by
// construction -- the World Map's Play/Build toggle cannot be
// reintroduced as a dependency here. The 'drawer' variant
// (WorldEntityContextDrawer.vue) must stay uneditable through this gate
// regardless of what `allowEdit` is passed as -- that boundary is what
// actually changed hands here (it used to be enforced jointly by
// `mode === 'build'` AND the variant check; now only the variant check).

import { describe, expect, it } from 'vitest'
import { canEditEntityRelationships } from '../../../app/components/world/worldEntityRelationshipsEligibility'

describe('canEditEntityRelationships', () => {
  it('true for the article variant with allowEdit true -- the one caller that ever grants this', () => {
    expect(canEditEntityRelationships('article', true)).toBe(true)
  })

  it('false for the article variant with allowEdit false', () => {
    expect(canEditEntityRelationships('article', false)).toBe(false)
  })

  it('false for the drawer variant even with allowEdit true -- the boundary that must survive removing the mode check', () => {
    expect(canEditEntityRelationships('drawer', true)).toBe(false)
  })

  it('false for the drawer variant with allowEdit false (its own real, hardcoded call shape)', () => {
    expect(canEditEntityRelationships('drawer', false)).toBe(false)
  })

  it('false for an unrecognized variant, never guessed as editable', () => {
    expect(canEditEntityRelationships('something-else', true)).toBe(false)
  })

  it('false when allowEdit is truthy but not literally true (e.g. a stray string) -- exact boolean match only', () => {
    expect(canEditEntityRelationships('article', 'yes' as unknown as boolean)).toBe(false)
  })
})
