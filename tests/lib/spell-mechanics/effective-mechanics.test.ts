// Unit tests for app/lib/spell-mechanics/effective-mechanics.ts --
// Character Sheet Body Phase 1B.5's pure scaling resolver.
//
// Pure throughout: no Nuxt, no Directus, no HTTP. Fixture-derived where a
// real spell's diceScaling shape is a convenient, already-verified input
// (dnd5e.test.ts's own describe blocks are the extraction-correctness
// tests; these tests assume `diceScaling` is already correctly populated
// and verify only what the RESOLVER does with it), plus synthetic
// `SpellRoll` values for edge cases the required real corpus does not
// exercise on its own (a character below the first cantrip tier, a cast
// level equal to base level, immutability).

import { describe, expect, it } from 'vitest'

import {
  resolveEffectiveSpellRoll,
  resolveEffectiveDamage,
  resolveEffectiveHealing
} from '../../../app/lib/spell-mechanics/effective-mechanics'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import type { SpellRoll } from '../../../app/lib/spell-mechanics/types'
import rows from '../content-presentation/fixtures/5etools-real-rows.json'

const spells = (rows as any).xphb.spells

describe('resolveEffectiveSpellRoll -- absence and no-scaling passthrough', () => {
  it('returns undefined for an undefined roll', () => {
    expect(resolveEffectiveSpellRoll(undefined, 1, { castLevel: null, characterLevel: 1 })).toBeUndefined()
  })

  it('returns the roll unchanged (dice/modifier/type/saveOutcome all identical) when it has no diceScaling', () => {
    const roll: SpellRoll = { dice: { count: 1, faces: 4 }, modifier: 1, type: 'force' }
    const result = resolveEffectiveSpellRoll(roll, 1, { castLevel: 1, characterLevel: 1 })
    expect(result).toEqual({ dice: { count: 1, faces: 4 }, modifier: 1, type: 'force' })
  })

  it('never mutates the roll object it was given', () => {
    const roll: SpellRoll = { dice: { count: 1, faces: 4 }, modifier: 1 }
    const frozen = Object.freeze({ ...roll, dice: Object.freeze({ ...roll.dice! }) })
    expect(() => resolveEffectiveSpellRoll(frozen, 1, { castLevel: 1, characterLevel: 1 })).not.toThrow()
  })
})

describe('resolveEffectiveSpellRoll -- Fire Bolt (character-level trigger, required acceptance)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Fire Bolt'])!

  it('a level-1 character rolls the base 1d10', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 1, faces: 10 })
  })

  it('a level-4 character (below the first threshold) still rolls the base 1d10', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 4 })
    expect(effective?.dice).toEqual({ count: 1, faces: 10 })
  })

  it('a level-5 character rolls the scaled 2d10 -- the required threshold acceptance', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 5 })
    expect(effective?.dice).toEqual({ count: 2, faces: 10 })
  })

  it('a level-10 character (between thresholds) still rolls 2d10, not interpolated', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 10 })
    expect(effective?.dice).toEqual({ count: 2, faces: 10 })
  })

  it('a level-11 character rolls 3d10', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 11 })
    expect(effective?.dice).toEqual({ count: 3, faces: 10 })
  })

  it('a level-17 character rolls 4d10', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 17 })
    expect(effective?.dice).toEqual({ count: 4, faces: 10 })
  })

  it('a level-20 character (above every threshold) still rolls 4d10, never extrapolated past the last tier', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 20 })
    expect(effective?.dice).toEqual({ count: 4, faces: 10 })
  })

  it('preserves damage type unchanged at every tier', () => {
    expect(resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 17 })?.type).toBe('fire')
  })

  it('the returned roll has no diceScaling of its own -- a Cast-time projection, not a second scaling rule', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 5 })
    expect(effective).not.toHaveProperty('diceScaling')
  })

  it('does not mutate the canonical mechanics object -- the base dice stay 1d10 for a later, different-level Cast', () => {
    resolveEffectiveDamage(mechanics, { castLevel: null, characterLevel: 17 })
    expect(mechanics.damage?.dice).toEqual({ count: 1, faces: 10 })
  })
})

describe('resolveEffectiveSpellRoll -- Fireball (cast-level trigger, required acceptance)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells.Fireball)!

  it('cast at its own base level 3 rolls the base 8d6', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: 3, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 8, faces: 6 })
  })

  it('cast at level 4 rolls 9d6 -- the required L4 acceptance', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: 4, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 9, faces: 6 })
  })

  it('cast at level 5 rolls 10d6 -- the required L5 acceptance', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: 5, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 10, faces: 6 })
  })

  it('cast at level 9 (the maximum) rolls 14d6', () => {
    const effective = resolveEffectiveDamage(mechanics, { castLevel: 9, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 14, faces: 6 })
  })

  it('preserves half-on-save unchanged at every cast level', () => {
    expect(resolveEffectiveDamage(mechanics, { castLevel: 5, characterLevel: 1 })?.saveOutcome).toBe('half-on-save')
  })

  it('preserves damage type unchanged at every cast level', () => {
    expect(resolveEffectiveDamage(mechanics, { castLevel: 5, characterLevel: 1 })?.type).toBe('fire')
  })

  it('is entirely indifferent to characterLevel -- a leveled spell never keys off it', () => {
    const atLevel1 = resolveEffectiveDamage(mechanics, { castLevel: 4, characterLevel: 1 })
    const atLevel20 = resolveEffectiveDamage(mechanics, { castLevel: 4, characterLevel: 20 })
    expect(atLevel1).toEqual(atLevel20)
  })

  it('does not mutate the canonical mechanics object', () => {
    resolveEffectiveDamage(mechanics, { castLevel: 9, characterLevel: 1 })
    expect(mechanics.damage?.dice).toEqual({ count: 8, faces: 6 })
  })
})

describe('resolveEffectiveSpellRoll -- Cure Wounds / Healing Word (cast-level healing scaling, required acceptance)', () => {
  it('Cure Wounds cast at base level 1 rolls the base 2d8', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Cure Wounds'])!
    const effective = resolveEffectiveHealing(mechanics, { castLevel: 1, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 2, faces: 8 })
  })

  it('Cure Wounds cast at level 2 rolls 4d8 -- +2d8 per level, never hardcoded to +1 die', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Cure Wounds'])!
    const effective = resolveEffectiveHealing(mechanics, { castLevel: 2, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 4, faces: 8 })
  })

  it('Cure Wounds preserves usesSpellcastingModifier unchanged at every cast level', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Cure Wounds'])!
    expect(resolveEffectiveHealing(mechanics, { castLevel: 3, characterLevel: 1 })?.usesSpellcastingModifier).toBe(true)
  })

  it('Cure Wounds preserves modifier (0) unchanged -- scaling only ever changes dice.count', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Cure Wounds'])!
    expect(resolveEffectiveHealing(mechanics, { castLevel: 3, characterLevel: 1 })?.modifier).toBe(0)
  })

  it('Healing Word cast at level 2 rolls 4d4 -- proves the same generic mechanism, different die size', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Healing Word'])!
    const effective = resolveEffectiveHealing(mechanics, { castLevel: 2, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 4, faces: 4 })
  })

  it('does not mutate the canonical mechanics object', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Cure Wounds'])!
    resolveEffectiveHealing(mechanics, { castLevel: 5, characterLevel: 1 })
    expect(mechanics.healing?.dice).toEqual({ count: 2, faces: 8 })
  })
})

describe('resolveEffectiveSpellRoll -- Chromatic Orb (scaling composes with a resolved structured choice)', () => {
  it('a chosen damage type survives alongside scaling -- both apply, neither erases the other', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Chromatic Orb'])!
    // Simulates what resolveCastableSpell's own applyResolvedChoicesToDamage
    // already produces before this resolver ever sees the roll -- a
    // choice-resolved `type`, `diceScaling` still attached.
    const choiceResolved: SpellRoll = { ...mechanics.damage!, type: 'lightning' }
    const effective = resolveEffectiveSpellRoll(choiceResolved, mechanics.level, { castLevel: 3, characterLevel: 1 })
    expect(effective).toEqual({ dice: { count: 5, faces: 8 }, modifier: 0, type: 'lightning' })
  })
})

describe('resolveEffectiveSpellRoll -- Magic Missile / Bless (no diceScaling, never fabricated)', () => {
  it('Magic Missile\'s damage is completely unaffected by castLevel -- no fake extra-dice scaling', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Magic Missile'])!
    const atBase = resolveEffectiveDamage(mechanics, { castLevel: 1, characterLevel: 1 })
    const atHigher = resolveEffectiveDamage(mechanics, { castLevel: 4, characterLevel: 1 })
    expect(atBase).toEqual({ dice: { count: 1, faces: 4 }, modifier: 1, type: 'force' })
    expect(atHigher).toEqual(atBase)
  })

  it('Bless has no damage roll to resolve at all', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells.Bless)!
    expect(resolveEffectiveDamage(mechanics, { castLevel: 1, characterLevel: 1 })).toBeUndefined()
  })
})

describe('resolveEffectiveSpellRoll -- defensive edge cases', () => {
  it('a cast-level roll with castLevel below baseLevel never subtracts dice (defensive clamp, not a real path)', () => {
    const roll: SpellRoll = { dice: { count: 8, faces: 6 }, modifier: 0, diceScaling: { trigger: 'cast-level', perLevelDiceCount: 1 } }
    const effective = resolveEffectiveSpellRoll(roll, 3, { castLevel: 1, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 8, faces: 6 })
  })

  it('a cast-level roll with castLevel null (should never happen for a leveled spell) falls back to base dice, never throws', () => {
    const roll: SpellRoll = { dice: { count: 8, faces: 6 }, modifier: 0, diceScaling: { trigger: 'cast-level', perLevelDiceCount: 1 } }
    const effective = resolveEffectiveSpellRoll(roll, 3, { castLevel: null, characterLevel: 1 })
    expect(effective?.dice).toEqual({ count: 8, faces: 6 })
  })
})
