// Unit tests for app/lib/spell-mechanics/dnd5e.ts -- Character Sheet Body
// Phase 1B.1's canonical spell mechanics resolver.
//
// THE FIXTURE IS REAL PUBLISHED CONTENT, NOT INVENTED SHAPES -- the same
// tests/lib/content-presentation/fixtures/5etools-real-rows.json
// content-actions' own tests already use, extended for this phase with two
// more real rows (Magic Missile, Bless) copied verbatim from the real
// 5etools XPHB dataset. See that fixture's own header.
//
// Six-spell regression suite required by this phase: Fire Bolt, Magic
// Missile, Fireball, Cure Wounds, Shield, Bless -- deliberately spanning
// attack-roll, automatic, saving-throw, and no-resolution archetypes, plus
// cantrip-level vs. slot-level scaling, so no assertion here is
// accidentally true only for one spell's shape.
//
// Pure throughout: no Nuxt, no Directus, no filesystem, no HTTP.

import { describe, expect, it } from 'vitest'

import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import rows from '../content-presentation/fixtures/5etools-real-rows.json'

const spells = rows.xphb.spells as any

describe('resolveDnd5eSpellMechanics -- Fire Bolt (cantrip, attack-roll, cantrip-level scaling)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Fire Bolt'])!

  it('level is structured, numeric, never derived from a label', () => {
    expect(mechanics.level).toBe(0)
  })

  it('is an attack-roll resolution', () => {
    expect(mechanics.resolution).toEqual({ kind: 'attack-roll' })
  })

  it('preserves the damage dice and type, with no flat modifier stated', () => {
    expect(mechanics.damage).toEqual({ dice: { count: 1, faces: 10 }, modifier: 0, type: 'fire' })
  })

  it('identifies its scaling as cantrip-level, preserving the source text, without computing the per-level steps', () => {
    expect(mechanics.scaling?.kind).toBe('cantrip-level')
    expect(mechanics.scaling?.text).toContain('levels 5')
  })

  it('never fabricates healing', () => {
    expect(mechanics.healing).toBeUndefined()
  })
})

describe('resolveDnd5eSpellMechanics -- Magic Missile (automatic resolution, the required regression)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Magic Missile'])!

  it('level 1, force damage', () => {
    expect(mechanics.level).toBe(1)
  })

  // THE required acceptance case: Magic Missile deals damage with NEITHER
  // an attack roll nor a saving throw. Must be 'automatic', never coerced
  // into the other two kinds and never left as `null` (which would claim
  // "no mechanical hook at all", which is false -- it plainly deals
  // damage).
  it('resolves as automatic -- neither attack-roll nor saving-throw', () => {
    expect(mechanics.resolution).toEqual({ kind: 'automatic' })
  })

  // THE Magic Missile regression, verbatim: "1d4 + 1" must not become "1d4".
  it('preserves the dice AND the flat +1 modifier -- the required regression case', () => {
    expect(mechanics.damage).toEqual({ dice: { count: 1, faces: 4 }, modifier: 1, type: 'force' })
  })

  it('identifies slot-level scaling (one more dart per slot above 1st), without assuming it means extra damage dice', () => {
    expect(mechanics.scaling?.kind).toBe('slot-level')
    expect(mechanics.scaling?.text).toContain('one more dart')
  })
})

describe('resolveDnd5eSpellMechanics -- Fireball (saving-throw, half-on-save damage, slot-level scaling)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells.Fireball)!

  it('is a saving-throw resolution against Dexterity', () => {
    expect(mechanics.resolution).toEqual({ kind: 'saving-throw', savingAbility: 'dex' })
  })

  it('preserves 8d6 fire damage with no flat modifier', () => {
    expect(mechanics.damage).toEqual({ dice: { count: 8, faces: 6 }, modifier: 0, type: 'fire' })
  })

  it('preserves slot-level scaling text -- damage-scaling shape, not lost', () => {
    expect(mechanics.scaling?.kind).toBe('slot-level')
    expect(mechanics.scaling?.text).toContain('spell slot level above 3')
  })

  it('is concentration: false, ritual: false', () => {
    expect(mechanics.concentration).toBe(false)
    expect(mechanics.ritual).toBe(false)
  })
})

describe('resolveDnd5eSpellMechanics -- Cure Wounds (healing investigation outcome)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Cure Wounds'])!

  // Per this phase's own required healing investigation (see dnd5e.ts's own
  // header for the full evidence): no reliable source signal was found, so
  // this MUST remain undefined rather than a guess -- proving the "STOP and
  // report" branch was actually taken, not silently skipped.
  it('does not fabricate a healing roll -- no reliable source signal exists (see resolver header)', () => {
    expect(mechanics.healing).toBeUndefined()
  })

  it('does not fabricate an attack or save resolution -- Cure Wounds has neither', () => {
    expect(mechanics.resolution).toBeNull()
  })

  it('does not fabricate a damage roll either -- {@dice} is not {@damage}', () => {
    expect(mechanics.damage).toBeUndefined()
  })
})

describe('resolveDnd5eSpellMechanics -- Shield (pure buff/utility, no roll)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells.Shield)!

  it('has no resolution, no damage, no healing -- a genuinely unresolved spell, honestly represented', () => {
    expect(mechanics.resolution).toBeNull()
    expect(mechanics.damage).toBeUndefined()
    expect(mechanics.healing).toBeUndefined()
  })

  it('still normalizes identity/display fields -- a reaction, self range, 1-round duration', () => {
    expect(mechanics.castingTime).toContain('Reaction')
    expect(mechanics.range).toBe('Self')
    expect(mechanics.duration).toBe('1 round')
  })
})

describe('resolveDnd5eSpellMechanics -- Bless (concentration, buff, target-count upcast)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells.Bless)!

  it('preserves concentration: true, read from the duration entry, not a top-level/meta field', () => {
    expect(mechanics.concentration).toBe(true)
  })

  it('does not fabricate a damage resolution -- Bless\'s own {@dice 1d4} is a buff bonus, never tagged {@damage}', () => {
    expect(mechanics.resolution).toBeNull()
    expect(mechanics.damage).toBeUndefined()
  })

  it('preserves slot-level scaling text without pretending it is damage scaling -- it scales target count', () => {
    expect(mechanics.scaling?.kind).toBe('slot-level')
    expect(mechanics.scaling?.text).toContain('additional creature')
  })
})

describe('resolveDnd5eSpellMechanics -- Chromatic Orb (structured damage-type choice, Phase 1B.2.1)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Chromatic Orb'])!

  // 1B.2.1 upgrades this from a boolean warning into a structured choice --
  // no longer "unresolved" once it is representable. See `choices` below.
  it('is no longer flagged as an unresolved choice, now that it is structurally represented', () => {
    expect(mechanics.hasUnresolvedChoice).toBeFalsy()
  })

  it('exposes a structured damage-type choice with all six real legal types, never fabricating an order or a default', () => {
    expect(mechanics.choices).toEqual([{
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
    }])
  })

  it('still preserves the dice, but leaves damage.type undefined -- never "acid" by default', () => {
    expect(mechanics.damage).toEqual({ dice: { count: 3, faces: 8 }, modifier: 0, type: undefined })
  })

  it('is still a real attack-roll resolution -- the choice concerns damage type, not resolution kind', () => {
    expect(mechanics.resolution).toEqual({ kind: 'attack-roll' })
  })
})

describe('resolveDnd5eSpellMechanics -- structured choice precision (1B.2.1 corpus audit)', () => {
  function withEntry(overrides: Record<string, unknown>) {
    return { name: 'Test Spell', level: 1, entries: ['Deals damage.'], ...overrides }
  }

  // Sorcerous Burst's real shape: multiple damageInflict types, exactly one
  // {@damage} tag -- structurally identical to Chromatic Orb, proving the
  // rule generalizes with no spell-specific code (this phase's own
  // "NO SPELL-NAME LOGIC" requirement).
  it('a single damage tag with multiple listed types is a genuine structured choice, regardless of spell', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry({
      damageInflict: ['acid', 'cold', 'fire', 'lightning', 'poison', 'psychic', 'thunder'],
      entries: ['You cast sorcerous energy. Make a ranged attack roll. On a hit, {@damage 1d8} damage of a type you choose.']
    }))!
    expect(mechanics.hasUnresolvedChoice).toBeFalsy()
    expect(mechanics.choices?.[0]?.options).toHaveLength(7)
    expect(mechanics.damage).toEqual({ dice: { count: 1, faces: 8 }, modifier: 0, type: undefined })
  })

  // Ice Storm's real shape: multiple damageInflict types, but TWO {@damage}
  // tags -- two simultaneous damage components, never a player choice. Must
  // NOT populate `choices`, and `hasUnresolvedChoice` correctly reports the
  // genuine ambiguity this phase cannot safely resolve (never silently
  // "fixed" by picking one of the two types).
  it('multiple damage tags with multiple listed types is NOT a choice -- simultaneous components, never populated as one', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry({
      damageInflict: ['bludgeoning', 'cold'],
      entries: ['Each creature takes {@damage 2d8} bludgeoning damage and {@damage 4d6} cold damage.']
    }))!
    expect(mechanics.choices).toBeUndefined()
    expect(mechanics.hasUnresolvedChoice).toBe(true)
    // The first tag's dice are still preserved (unchanged 1B.1 behavior) --
    // only the TYPE stays undefined, since damageInflict order does not
    // reliably correspond to the first extracted tag.
    expect(mechanics.damage).toEqual({ dice: { count: 2, faces: 8 }, modifier: 0, type: undefined })
  })

  it('a single listed damage type never populates choices, regardless of tag count', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry({
      damageInflict: ['fire'],
      entries: ['Deals {@damage 8d6} fire damage.']
    }))!
    expect(mechanics.choices).toBeUndefined()
    expect(mechanics.hasUnresolvedChoice).toBeFalsy()
  })
})

describe('resolveDnd5eSpellMechanics -- single damage type never flags a choice', () => {
  it('Fireball (one type) has hasUnresolvedChoice undefined/false', () => {
    expect(resolveDnd5eSpellMechanics(spells.Fireball)!.hasUnresolvedChoice).toBeFalsy()
  })

  it('Magic Missile (one type) has hasUnresolvedChoice undefined/false', () => {
    expect(resolveDnd5eSpellMechanics(spells['Magic Missile'])!.hasUnresolvedChoice).toBeFalsy()
  })
})

describe('resolveDnd5eSpellMechanics -- dice parser variants (NdM, NdM+K, NdM-K, whitespace)', () => {
  function withEntry(text: string) {
    return { name: 'Test Spell', level: 1, entries: [text] }
  }

  it('NdM with no modifier', () => {
    expect(resolveDnd5eSpellMechanics(withEntry('Deals {@damage 2d6} damage.'))!.damage).toEqual({
      dice: { count: 2, faces: 6 }, modifier: 0, type: undefined
    })
  })

  it('NdM + K, tight spacing', () => {
    expect(resolveDnd5eSpellMechanics(withEntry('Deals {@damage 1d4+1} damage.'))!.damage).toEqual({
      dice: { count: 1, faces: 4 }, modifier: 1, type: undefined
    })
  })

  it('NdM + K, loose spacing', () => {
    expect(resolveDnd5eSpellMechanics(withEntry('Deals {@damage 1d4  +  1} damage.'))!.damage).toEqual({
      dice: { count: 1, faces: 4 }, modifier: 1, type: undefined
    })
  })

  it('NdM - K', () => {
    expect(resolveDnd5eSpellMechanics(withEntry('Deals {@damage 3d8 - 2} damage.'))!.damage).toEqual({
      dice: { count: 3, faces: 8 }, modifier: -2, type: undefined
    })
  })

  it('malformed dice (zero faces) is rejected, not coerced', () => {
    expect(resolveDnd5eSpellMechanics(withEntry('Deals {@damage 1d0} damage.'))!.damage).toBeUndefined()
  })

  it('missing damage tag entirely -- no damage, no resolution fabricated from nothing', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry('This spell does something descriptive.'))!
    expect(mechanics.damage).toBeUndefined()
    expect(mechanics.resolution).toBeNull()
  })

  it('only the FIRST {@damage} tag in a multi-tag entry is used -- a stated, documented simplification', () => {
    expect(resolveDnd5eSpellMechanics(withEntry('First {@damage 1d6} then {@damage 2d8}.'))!.damage).toEqual({
      dice: { count: 1, faces: 6 }, modifier: 0, type: undefined
    })
  })
})

describe('resolveDnd5eSpellMechanics -- malformed/absent data degrades honestly', () => {
  it('returns null for a non-object payload', () => {
    expect(resolveDnd5eSpellMechanics('not an object')).toBeNull()
    expect(resolveDnd5eSpellMechanics(null)).toBeNull()
    expect(resolveDnd5eSpellMechanics(undefined)).toBeNull()
    expect(resolveDnd5eSpellMechanics([1, 2, 3])).toBeNull()
  })

  it('returns null when name is missing or blank -- never a half-built record', () => {
    expect(resolveDnd5eSpellMechanics({ level: 1 })).toBeNull()
    expect(resolveDnd5eSpellMechanics({ name: '   ', level: 1 })).toBeNull()
  })
})
