// Unit tests for app/lib/spell-mechanics/cast-configuration.ts -- Character
// Sheet Body Phase 1B.2.1 (Cast Configuration). Pure throughout: no Nuxt, no
// Directus, no filesystem.

import { describe, expect, it } from 'vitest'

import {
  applyResolvedChoicesToDamage,
  legalCastLevelsFor,
  resolveCastConfiguration,
  validateSpellChoices
} from '../../../app/lib/spell-mechanics/cast-configuration'
import type { CanonicalSpellMechanics, SpellChoice } from '../../../app/lib/spell-mechanics/types'
import type { SpellSlotLevel } from '../../../app/lib/characters/spellcasting'

function mechanics(overrides: Partial<CanonicalSpellMechanics>): CanonicalSpellMechanics {
  return { level: 1, concentration: false, ritual: false, resolution: null, ...overrides }
}

const DAMAGE_TYPE_CHOICE: SpellChoice = {
  id: 'damage-type',
  label: 'Damage Type',
  options: [
    { id: 'acid', label: 'Acid' },
    { id: 'cold', label: 'Cold' },
    { id: 'fire', label: 'Fire' },
    { id: 'lightning', label: 'Lightning' },
    { id: 'poison', label: 'Poison' },
    { id: 'thunder', label: 'Thunder' }
  ]
}

describe('legalCastLevelsFor', () => {
  it('is always empty for a cantrip (base level 0), regardless of slot levels', () => {
    const slotLevels: SpellSlotLevel[] = [{ level: 1, max: 4, expended: 0 }]
    expect(legalCastLevelsFor(0, slotLevels)).toEqual([])
  })

  it('excludes levels below the spell\'s base level', () => {
    const slotLevels: SpellSlotLevel[] = [
      { level: 1, max: 4, expended: 0 },
      { level: 2, max: 3, expended: 0 }
    ]
    expect(legalCastLevelsFor(2, slotLevels)).toEqual([{ level: 2, legal: true, available: true }])
  })

  // The task's own worked example: L1 max4/avail1, L2 max3/avail2, L3
  // max2/avail0 -- all three are LEGAL (the character's progression
  // declares a pool at each), only L3 is unavailable.
  it('reports legal-but-unavailable levels rather than hiding them', () => {
    const slotLevels: SpellSlotLevel[] = [
      { level: 1, max: 4, expended: 3 },
      { level: 2, max: 3, expended: 1 },
      { level: 3, max: 2, expended: 2 }
    ]
    expect(legalCastLevelsFor(1, slotLevels)).toEqual([
      { level: 1, legal: true, available: true },
      { level: 2, legal: true, available: true },
      { level: 3, legal: true, available: false }
    ])
  })

  it('never invents a level absent from the character\'s own slot levels', () => {
    const slotLevels: SpellSlotLevel[] = [{ level: 1, max: 2, expended: 0 }]
    // A level-3 spell with only a level-1 slot pool -> no legal levels at
    // all (never fabricates a level-3 entry the character's progression
    // does not declare).
    expect(legalCastLevelsFor(3, slotLevels)).toEqual([])
  })

  it('returns levels sorted ascending regardless of input order', () => {
    const slotLevels: SpellSlotLevel[] = [
      { level: 3, max: 1, expended: 0 },
      { level: 1, max: 4, expended: 0 },
      { level: 2, max: 3, expended: 0 }
    ]
    expect(legalCastLevelsFor(1, slotLevels).map((entry) => entry.level)).toEqual([1, 2, 3])
  })
})

describe('resolveCastConfiguration -- cantrips', () => {
  it('Fire Bolt-shaped (no choices): never requires configuration, castLevels empty, defaultCastLevel null', () => {
    const view = resolveCastConfiguration({ mechanics: mechanics({ level: 0 }), slotLevels: [] })
    expect(view).toEqual({ requiresConfiguration: false, castLevels: [], choices: [], defaultCastLevel: null, canCast: true })
  })

  // Sorcerous Burst-shaped: a cantrip WITH a choice still requires
  // configuration, but never gets a level picker (castLevels stays empty).
  it('a cantrip with a structured choice requires configuration for the choice alone, never a level picker', () => {
    const view = resolveCastConfiguration({
      mechanics: mechanics({ level: 0, choices: [DAMAGE_TYPE_CHOICE] }),
      slotLevels: []
    })
    expect(view.requiresConfiguration).toBe(true)
    expect(view.castLevels).toEqual([])
    expect(view.defaultCastLevel).toBeNull()
    expect(view.canCast).toBe(true)
  })
})

describe('resolveCastConfiguration -- leveled spells, single legal level (Magic Missile, one slot pool)', () => {
  it('does not require configuration -- immediate Cast', () => {
    const view = resolveCastConfiguration({
      mechanics: mechanics({ level: 1 }),
      slotLevels: [{ level: 1, max: 4, expended: 1 }]
    })
    expect(view.requiresConfiguration).toBe(false)
    expect(view.defaultCastLevel).toBe(1)
    expect(view.canCast).toBe(true)
  })
})

describe('resolveCastConfiguration -- leveled spells, multiple legal levels', () => {
  const slotLevels: SpellSlotLevel[] = [
    { level: 1, max: 4, expended: 3 },
    { level: 2, max: 3, expended: 1 },
    { level: 3, max: 2, expended: 2 }
  ]

  it('requires configuration when more than one legal level exists, even though only some are available', () => {
    const view = resolveCastConfiguration({ mechanics: mechanics({ level: 1 }), slotLevels })
    expect(view.requiresConfiguration).toBe(true)
    expect(view.castLevels).toHaveLength(3)
    expect(view.castLevels.find((entry) => entry.level === 3)?.available).toBe(false)
  })

  it('defaults to the base level when it has an available slot', () => {
    const view = resolveCastConfiguration({ mechanics: mechanics({ level: 1 }), slotLevels })
    expect(view.defaultCastLevel).toBe(1)
  })

  it('falls back to the lowest available higher level when the base level has none available', () => {
    const exhaustedBase: SpellSlotLevel[] = [
      { level: 1, max: 4, expended: 4 },
      { level: 2, max: 3, expended: 1 },
      { level: 3, max: 2, expended: 2 }
    ]
    const view = resolveCastConfiguration({ mechanics: mechanics({ level: 1 }), slotLevels: exhaustedBase })
    expect(view.defaultCastLevel).toBe(2)
  })

  it('canCast is true as long as any legal level is available', () => {
    const view = resolveCastConfiguration({ mechanics: mechanics({ level: 1 }), slotLevels })
    expect(view.canCast).toBe(true)
  })
})

describe('resolveCastConfiguration -- zero available slots (all legal levels exhausted)', () => {
  it('canCast is false, but a sensible default level still exists for display', () => {
    const slotLevels: SpellSlotLevel[] = [{ level: 1, max: 2, expended: 2 }]
    const view = resolveCastConfiguration({ mechanics: mechanics({ level: 1 }), slotLevels })
    expect(view.canCast).toBe(false)
    expect(view.defaultCastLevel).toBe(1)
  })

  it('canCast is false with no legal level at all', () => {
    const view = resolveCastConfiguration({ mechanics: mechanics({ level: 3 }), slotLevels: [{ level: 1, max: 2, expended: 0 }] })
    expect(view.canCast).toBe(false)
    expect(view.defaultCastLevel).toBeNull()
    expect(view.requiresConfiguration).toBe(false)
  })
})

describe('resolveCastConfiguration -- choices are orthogonal to resolution kind', () => {
  it('a choice on an automatic-damage (non-attack-roll) spell still requires configuration', () => {
    const view = resolveCastConfiguration({
      mechanics: mechanics({ level: 1, resolution: { kind: 'automatic' }, choices: [DAMAGE_TYPE_CHOICE] }),
      slotLevels: [{ level: 1, max: 4, expended: 0 }]
    })
    expect(view.requiresConfiguration).toBe(true)
  })
})

describe('validateSpellChoices', () => {
  it('accepts a legal selection', () => {
    const result = validateSpellChoices([DAMAGE_TYPE_CHOICE], { 'damage-type': 'lightning' })
    expect(result).toEqual({ ok: true, resolved: { 'damage-type': 'lightning' } })
  })

  it('rejects a missing required choice', () => {
    const result = validateSpellChoices([DAMAGE_TYPE_CHOICE], undefined)
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown option id for a known choice', () => {
    const result = validateSpellChoices([DAMAGE_TYPE_CHOICE], { 'damage-type': 'necrotic' })
    expect(result.ok).toBe(false)
  })

  it('rejects an unrecognized choice id the spell does not declare', () => {
    const result = validateSpellChoices([], { 'damage-type': 'lightning' })
    expect(result.ok).toBe(false)
  })

  it('rejects an extra choice id alongside an otherwise-valid one', () => {
    const result = validateSpellChoices([DAMAGE_TYPE_CHOICE], { 'damage-type': 'lightning', 'ability': 'str' })
    expect(result.ok).toBe(false)
  })

  it('a spell with no declared choices accepts an empty/absent submission', () => {
    expect(validateSpellChoices([], undefined)).toEqual({ ok: true, resolved: {} })
    expect(validateSpellChoices([], {})).toEqual({ ok: true, resolved: {} })
  })

  it('never trusts the submitted VALUE as mechanically meaningful beyond matching a declared option id', () => {
    // A client submitting a mechanical-looking value that is not one of
    // THIS spell's own declared option ids is rejected outright, proving
    // the value alone carries no authority.
    const result = validateSpellChoices([DAMAGE_TYPE_CHOICE], { 'damage-type': 'radiant' })
    expect(result.ok).toBe(false)
  })
})

describe('applyResolvedChoicesToDamage', () => {
  it('substitutes the resolved damage-type into an otherwise-unresolved damage roll', () => {
    const damage = { dice: { count: 3, faces: 8 }, modifier: 0, type: undefined }
    expect(applyResolvedChoicesToDamage(damage, { 'damage-type': 'lightning' })).toEqual({
      dice: { count: 3, faces: 8 }, modifier: 0, type: 'lightning'
    })
  })

  it('leaves damage unchanged when no damage-type choice was resolved', () => {
    const damage = { dice: { count: 1, faces: 10 }, modifier: 0, type: 'fire' }
    expect(applyResolvedChoicesToDamage(damage, {})).toEqual(damage)
  })

  it('passes through undefined damage unchanged', () => {
    expect(applyResolvedChoicesToDamage(undefined, { 'damage-type': 'lightning' })).toBeUndefined()
  })
})
