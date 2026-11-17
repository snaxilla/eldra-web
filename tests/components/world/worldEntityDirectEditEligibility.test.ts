// Unit tests for app/components/world/worldEntityDirectEditEligibility.ts
// -- the pure authorization-gating helpers behind the entity Edit/Delete
// actions (context rail and card). WorldEntityInteractivePage.vue itself
// has no DOM/browser test harness in this repo, so this is the
// established pattern (see worldEntityHomebrewActions.test.ts) for
// testing logic extracted out of a .vue file: it proves the gating logic
// directly, not that the actual <button> v-if renders in a browser.
//
// PRODUCT REGRESSION, the condition under test. These actions must be
// capability-only -- never dependent on the World Map's Play/Build toggle
// (`mode`), which is a page-/pin-specific control these functions take
// no `mode` parameter at all, by construction, to make that regression
// structurally impossible to reintroduce here.

import { describe, expect, it } from 'vitest'
import {
  canDeleteWorldEntities,
  canEditWorldEntities,
  shouldShowDirectEditAction,
  supportsDirectEdit
} from '../../../app/components/world/worldEntityDirectEditEligibility'

describe('canEditWorldEntities', () => {
  it('true when world.entity.edit is present', () => {
    expect(canEditWorldEntities(['world.entity.edit'])).toBe(true)
  })

  it('false for an ordinary player (no world.entity.edit)', () => {
    expect(canEditWorldEntities(['world.read', 'world.character.create'])).toBe(false)
  })

  it('false when capabilities is missing/not an array (unauthenticated or still loading)', () => {
    expect(canEditWorldEntities(undefined)).toBe(false)
    expect(canEditWorldEntities(null)).toBe(false)
  })
})

describe('canDeleteWorldEntities', () => {
  it('true when world.entity.delete is present', () => {
    expect(canDeleteWorldEntities(['world.entity.delete'])).toBe(true)
  })

  it('false for a caller who can edit but not delete', () => {
    expect(canDeleteWorldEntities(['world.entity.edit'])).toBe(false)
  })

  it('false when capabilities is missing/not an array', () => {
    expect(canDeleteWorldEntities(undefined)).toBe(false)
  })
})

describe('supportsDirectEdit', () => {
  it('true for every category the shared presentation editor supports', () => {
    for (const type of ['species', 'class', 'background', 'spell', 'featureOption', 'item']) {
      expect(supportsDirectEdit(type)).toBe(true)
    }
  })

  it('false for categories with no editor yet', () => {
    for (const type of ['location', 'character', 'npc', 'feat', 'enemy', 'monster', 'subclass']) {
      expect(supportsDirectEdit(type)).toBe(false)
    }
  })

  it('false for missing/empty entityType', () => {
    expect(supportsDirectEdit(undefined)).toBe(false)
    expect(supportsDirectEdit('')).toBe(false)
  })
})

describe('shouldShowDirectEditAction', () => {
  it('true for a supported category AND an authorized editor', () => {
    expect(shouldShowDirectEditAction('item', ['world.entity.edit'])).toBe(true)
  })

  it('false for a supported category but an unauthorized caller (ordinary player)', () => {
    expect(shouldShowDirectEditAction('item', ['world.read'])).toBe(false)
  })

  it('false for an authorized editor on an unsupported category', () => {
    expect(shouldShowDirectEditAction('location', ['world.entity.edit'])).toBe(false)
  })

  it('false when both conditions fail', () => {
    expect(shouldShowDirectEditAction('location', ['world.read'])).toBe(false)
  })

  // The regression this whole module exists to prevent: no `mode`
  // parameter exists to pass 'play'/'build' through at all, so Edit
  // visibility can never again be made to depend on the World Map's
  // Play/Build toggle through this gate.
  it('has no mode/build-state parameter of any kind', () => {
    expect(shouldShowDirectEditAction.length).toBe(2)
  })
})
