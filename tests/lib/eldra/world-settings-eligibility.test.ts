// Unit tests for app/lib/eldra/world-settings-eligibility.ts -- the pure
// capability-only gate behind the "Customize Page" entry point. See
// worldEntityDirectEditEligibility.test.ts for the sibling pattern this
// follows: no DOM harness exists in this repo, so this proves the gating
// logic directly, not that the actual <button> v-if renders in a browser.
//
// MODE INDEPENDENCE, the condition under test: this function takes no
// `mode`/build-state parameter at all, by construction, so Play/Build
// (Map-pin-only per the owner's product decision) cannot be reintroduced
// as a dependency through this gate.

import { describe, expect, it } from 'vitest'
import { canEditWorldSettings } from '../../../app/lib/eldra/world-settings-eligibility'

describe('canEditWorldSettings', () => {
  it('true when world.settings.edit is present (owner/gm)', () => {
    expect(canEditWorldSettings(['world.settings.edit'])).toBe(true)
  })

  it('false for a worldbuilder (world.entity.edit but not world.settings.edit)', () => {
    expect(canEditWorldSettings(['world.entity.edit', 'world.read'])).toBe(false)
  })

  it('false for an ordinary player', () => {
    expect(canEditWorldSettings(['world.read', 'world.character.create'])).toBe(false)
  })

  it('false when capabilities is missing/undefined (unknown reads as not granted here, unlike AdminWorldPropertiesPanel\'s own "unknown stays enabled" posture -- this gate decides whether to SHOW a new action, not whether to keep an already-open form editable)', () => {
    expect(canEditWorldSettings(undefined)).toBe(false)
  })

  it('false when capabilities is not an array', () => {
    expect(canEditWorldSettings('world.settings.edit')).toBe(false)
    expect(canEditWorldSettings(null)).toBe(false)
    expect(canEditWorldSettings({})).toBe(false)
  })

  it('false for an empty capabilities array', () => {
    expect(canEditWorldSettings([])).toBe(false)
  })
})
