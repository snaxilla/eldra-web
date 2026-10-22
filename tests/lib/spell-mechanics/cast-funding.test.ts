// Unit tests for app/lib/spell-mechanics/cast-funding.ts -- CHARACTER
// MECHANICS PHASE A5, Phase 3 (Resource-Funded Spellcasting, UI
// completion). Pure throughout: no Nuxt, no Directus, no filesystem --
// mirrors cast-configuration.test.ts's own shape exactly.

import { describe, expect, it } from 'vitest'

import {
  defaultFundingMethod,
  isFundingMethodAvailable,
  resolveCastFundingConfiguration,
  resolveOverallCastAvailability,
  resolveOverallRequiresConfiguration,
  resolveSelectedFundingMethod
} from '../../../app/lib/spell-mechanics/cast-funding'
import type { CharacterResourceView } from '../../../app/lib/spell-mechanics/cast-funding'

function resource(overrides: Partial<CharacterResourceView> = {}): CharacterResourceView {
  return { id: 'resource:steps_of_the_fey', label: 'Steps of the Fey', max: 4, expended: 0, remaining: 4, ...overrides }
}

describe('resolveCastFundingConfiguration', () => {
  it('a spell with no funding options at all resolves to slot-only, no funding choice required -- every pre-Phase-3 spell\'s behavior, untouched', () => {
    const config = resolveCastFundingConfiguration({ fundingOptions: [], resources: [] })
    expect(config).toEqual({ slotFundingAllowed: true, resourceOptions: [], requiresFundingChoice: false })
  })

  it('a dual-funded spell (Misty Step\'s own shape) exposes both slot funding and the resource option', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource()]
    })
    expect(config.slotFundingAllowed).toBe(true)
    expect(config.resourceOptions).toEqual([
      { resourceId: 'resource:steps_of_the_fey', label: 'Steps of the Fey', max: 4, expended: 0, remaining: 4 }
    ])
    expect(config.requiresFundingChoice).toBe(true)
  })

  it('a resource-ONLY spell (Darkness\'s own shape) still requires a funding choice -- the real cost is never hidden -- but slot funding is disallowed', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:focus_points', slotFundingAllowed: false }],
      resources: [resource({ id: 'resource:focus_points', label: 'Focus Points', max: 2, expended: 2, remaining: 0 })]
    })
    expect(config.slotFundingAllowed).toBe(false)
    expect(config.requiresFundingChoice).toBe(true)
    expect(config.resourceOptions).toEqual([
      { resourceId: 'resource:focus_points', label: 'Focus Points', max: 2, expended: 2, remaining: 0 }
    ])
  })

  it('a declared funding option naming a resource this character does not currently have access to is silently omitted, never a crash', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: []
    })
    expect(config.resourceOptions).toEqual([])
    expect(config.requiresFundingChoice).toBe(true)
  })
})

describe('defaultFundingMethod', () => {
  it('an unfunded spell always defaults to \'slot\'', () => {
    const config = resolveCastFundingConfiguration({ fundingOptions: [], resources: [] })
    expect(defaultFundingMethod(config, true)).toBe('slot')
    expect(defaultFundingMethod(config, false)).toBe('slot')
  })

  it('prefers a resource with a remaining use over the slot, even when a slot is also currently available', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ remaining: 3 })]
    })
    expect(defaultFundingMethod(config, true)).toBe('resource:steps_of_the_fey')
  })

  it('falls back to the slot when the resource is exhausted and slot funding is allowed and currently available', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ expended: 4, remaining: 0 })]
    })
    expect(defaultFundingMethod(config, true)).toBe('slot')
  })

  it('a resource-only spell with its single resource exhausted still selects that resource (not null, not a fabricated slot) -- the confirm button\'s own disabled state is what actually blocks Casting', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:focus_points', slotFundingAllowed: false }],
      resources: [resource({ id: 'resource:focus_points', expended: 2, max: 2, remaining: 0 })]
    })
    expect(defaultFundingMethod(config, false)).toBe('resource:focus_points')
  })
})

describe('isFundingMethodAvailable', () => {
  it('null is never available', () => {
    const config = resolveCastFundingConfiguration({ fundingOptions: [], resources: [] })
    expect(isFundingMethodAvailable(null, config, true)).toBe(false)
  })

  it('\'slot\' is available only when the configuration allows it AND a slot currently exists', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource()]
    })
    expect(isFundingMethodAvailable('slot', config, true)).toBe(true)
    expect(isFundingMethodAvailable('slot', config, false)).toBe(false)
  })

  it('\'slot\' is never available for a resource-only spell, regardless of slot availability', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:focus_points', slotFundingAllowed: false }],
      resources: [resource({ id: 'resource:focus_points' })]
    })
    expect(isFundingMethodAvailable('slot', config, true)).toBe(false)
  })

  it('a resourceId is available only while it has a remaining use -- a stale selection (exhausted by another tab) is correctly rejected', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ remaining: 0 })]
    })
    expect(isFundingMethodAvailable('resource:steps_of_the_fey', config, true)).toBe(false)
  })

  it('an unrecognized resourceId (e.g. a repin changed this spell\'s own funding options) is never available', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource()]
    })
    expect(isFundingMethodAvailable('resource:rage', config, true)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// A5 PHASE 3 FINAL ACCEPTANCE -- FUNDING-SELECTION INTEGRITY, section 2.
// ---------------------------------------------------------------------------
// These three are CharacterActionsPanel.vue's own combinators, extracted
// here (this task's own report explains why -- no Vue component-test
// harness exists in this repo) so every item on the task's own integrity
// checklist is directly, narrowly provable.

describe('resolveSelectedFundingMethod -- FUNDING-SELECTION INTEGRITY', () => {
  it('SLOT-ONLY SPELL: an unfunded spell always resolves to \'slot\', regardless of any stored value -- existing behavior preserved', () => {
    const config = resolveCastFundingConfiguration({ fundingOptions: [], resources: [] })
    expect(resolveSelectedFundingMethod(undefined, config, true)).toBe('slot')
  })

  it('FUNDING CHOICE RESETS WHEN CHANGING SPELLS: a stored value is scoped to ONE action -- a different action with no stored value of its own gets its own fresh default, never the other action\'s selection', () => {
    // This function itself takes no actionId -- the CALLER (CharacterActionsPanel.vue) is
    // responsible for keying `stored` per action.id, exactly like castLevels/castChoices
    // already are. Proven here structurally: passing `undefined` (what a DIFFERENT, never-
    // before-opened action's own lookup would read) always recomputes the default fresh, never
    // leaking a value that was never passed in.
    const dualFunded = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ remaining: 0 })] // exhausted, so default would be 'slot' here
    })
    const resourceOnly = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:focus_points', slotFundingAllowed: false }],
      resources: [resource({ id: 'resource:focus_points', remaining: 2 })]
    })
    // Even though the FIRST spell's own in-effect method would be 'slot', a second spell's own
    // lookup (its own stored value, independently undefined) is computed purely from ITS OWN
    // configuration, never contaminated by the first.
    expect(resolveSelectedFundingMethod(undefined, dualFunded, true)).toBe('slot')
    expect(resolveSelectedFundingMethod(undefined, resourceOnly, false)).toBe('resource:focus_points')
  })

  it('CHANGING CAST LEVEL CANNOT SILENTLY CHANGE FUNDING: once a method is stored, it is returned verbatim regardless of the ambient slot-availability fact a cast-level change would affect', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ remaining: 3 })]
    })
    // The player explicitly chose the slot. A cast-level change elsewhere never calls this
    // function with a DIFFERENT `stored` argument -- it only ever changes `slotCurrentlyAvailable`
    // (a different legal slot level could become available/unavailable). The stored choice must
    // win either way, never silently flip back to the resource default.
    expect(resolveSelectedFundingMethod('slot', config, true)).toBe('slot')
    expect(resolveSelectedFundingMethod('slot', config, false)).toBe('slot')
  })

  it('REFRESH RESTORES CORRECT AVAILABILITY: with no stored value (a fresh page load/new interaction state), the default is recomputed from the CURRENT resource list, never a value cached from before the refresh', () => {
    const beforeRefresh = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ remaining: 3 })]
    })
    const afterRefresh = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ remaining: 0 })] // the resource was exhausted by another tab/session
    })
    expect(resolveSelectedFundingMethod(undefined, beforeRefresh, true)).toBe('resource:steps_of_the_fey')
    expect(resolveSelectedFundingMethod(undefined, afterRefresh, true)).toBe('slot')
  })
})

describe('resolveOverallCastAvailability -- FUNDING-SELECTION INTEGRITY', () => {
  it('SLOT-ONLY SPELL: resolves to exactly the slot fact, untouched', () => {
    const config = resolveCastFundingConfiguration({ fundingOptions: [], resources: [] })
    expect(resolveOverallCastAvailability(config, true)).toBe(true)
    expect(resolveOverallCastAvailability(config, false)).toBe(false)
  })

  it('RESOURCE-ONLY SPELL: an exhausted resource with no slot option at all is correctly uncastable, never a fabricated slot-casting permission', () => {
    const config = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:focus_points', slotFundingAllowed: false }],
      resources: [resource({ id: 'resource:focus_points', remaining: 0 })]
    })
    expect(resolveOverallCastAvailability(config, true)).toBe(false)
  })

  it('DUAL-FUNDED SPELL: castable when EITHER the slot or the resource is available', () => {
    const slotAvailableOnly = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ remaining: 0 })]
    })
    const resourceAvailableOnly = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:steps_of_the_fey', slotFundingAllowed: true }],
      resources: [resource({ remaining: 1 })]
    })
    expect(resolveOverallCastAvailability(slotAvailableOnly, true)).toBe(true)
    expect(resolveOverallCastAvailability(resourceAvailableOnly, false)).toBe(true)
    expect(resolveOverallCastAvailability(slotAvailableOnly, false)).toBe(false)
  })
})

describe('resolveOverallRequiresConfiguration -- FUNDING-SELECTION INTEGRITY', () => {
  it('EXISTING ATTACK/SAVE/HEALING INTERACTIONS UNCHANGED: a spell with no funding options at all requires configuration exactly when the slot-level logic alone says so', () => {
    const config = resolveCastFundingConfiguration({ fundingOptions: [], resources: [] })
    expect(resolveOverallRequiresConfiguration(config, false)).toBe(false)
    expect(resolveOverallRequiresConfiguration(config, true)).toBe(true)
  })

  it('a funded spell ALWAYS requires configuration, even one with no cast-level choice of its own, so the real cost is never hidden', () => {
    const resourceOnly = resolveCastFundingConfiguration({
      fundingOptions: [{ resourceId: 'resource:focus_points', slotFundingAllowed: false }],
      resources: [resource({ id: 'resource:focus_points' })]
    })
    expect(resolveOverallRequiresConfiguration(resourceOnly, false)).toBe(true)
  })
})
