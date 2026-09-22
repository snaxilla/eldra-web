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
    expect(mechanics.damage).toEqual({ dice: { count: 8, faces: 6 }, modifier: 0, type: 'fire', saveOutcome: 'half-on-save' })
  })

  // Character Sheet Body Phase 1B.3 -- the required half-on-save
  // acceptance case, verified against Fireball's own real printed text
  // ("...on a failed save or half as much damage on a successful one").
  it('resolves saveOutcome as half-on-save -- the required acceptance case', () => {
    expect(mechanics.damage?.saveOutcome).toBe('half-on-save')
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

// Character Sheet Body Phase 1B.3 (Saving-Throw Spell Casting) -- the
// required cantrip acceptance case: "succeed... or take Xd Y damage" is the
// no-damage-on-save shape, structurally distinct from Fireball's
// half-on-save above.
describe('resolveDnd5eSpellMechanics -- Acid Splash (cantrip, save-for-no-damage, required acceptance)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Acid Splash'])!

  it('is a cantrip (level 0)', () => {
    expect(mechanics.level).toBe(0)
  })

  it('is a saving-throw resolution against Dexterity', () => {
    expect(mechanics.resolution).toEqual({ kind: 'saving-throw', savingAbility: 'dex' })
  })

  it('preserves 1d6 acid damage', () => {
    expect(mechanics.damage).toMatchObject({ dice: { count: 1, faces: 6 }, modifier: 0, type: 'acid' })
  })

  it('resolves saveOutcome as no-damage-on-save -- the required acceptance case', () => {
    expect(mechanics.damage?.saveOutcome).toBe('no-damage-on-save')
  })

  it('identifies cantrip-level scaling, not slot-level', () => {
    expect(mechanics.scaling?.kind).toBe('cantrip-level')
  })
})

// Character Sheet Body Phase 1B.3 -- the required save-context-only
// acceptance case: a concentration save spell with NO structured damage at
// all, proving `saveOutcome` extraction correctly does nothing when there
// is no damage roll to attach it to.
describe('resolveDnd5eSpellMechanics -- Hold Person (saving-throw, effect-only, concentration, required acceptance)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Hold Person'])!

  it('level 2, Wisdom save', () => {
    expect(mechanics.level).toBe(2)
    expect(mechanics.resolution).toEqual({ kind: 'saving-throw', savingAbility: 'wis' })
  })

  it('is concentration: true', () => {
    expect(mechanics.concentration).toBe(true)
  })

  it('has no structured damage -- a genuinely effect-only saving-throw spell, honestly represented', () => {
    expect(mechanics.damage).toBeUndefined()
  })

  it('never fabricates a saveOutcome with no damage roll to attach it to', () => {
    expect(mechanics.damage?.saveOutcome).toBeUndefined()
  })
})

// Character Sheet Body Phase 1B.4 -- 1B.1's own healing blocker, resolved.
// Cure Wounds is the primary required acceptance case: a three-signal rule
// (dice-tag/Hit-Point-tag proximity, instant duration, a local "regain(s)"
// verb -- see dnd5e.ts's own HEALING header for the full corpus evidence)
// now reliably extracts its healing roll, including the spellcasting
// ability modifier as a BOOLEAN flag (never a baked-in number -- the actual
// modifier is a per-character Rules Engine fact, derived at Cast runtime by
// server/utils/character-cast.ts, never here).
describe('resolveDnd5eSpellMechanics -- Cure Wounds (healing, the required primary acceptance case)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Cure Wounds'])!

  it('extracts 2d8 healing with no flat modifier, and flags that it uses the spellcasting ability modifier', () => {
    expect(mechanics.healing).toEqual({ dice: { count: 2, faces: 8 }, modifier: 0, usesSpellcastingModifier: true })
  })

  it('does not fabricate an attack or save resolution -- Cure Wounds has neither', () => {
    expect(mechanics.resolution).toBeNull()
  })

  it('does not fabricate a damage roll either -- {@dice} is not {@damage}', () => {
    expect(mechanics.damage).toBeUndefined()
  })
})

// The required SECOND acceptance case -- proves the rule is not
// Cure-Wounds-specific: a different die size (2d4, not 2d8), a differently
// worded target clause ("a creature of your choice that you can see within
// range" vs. "a creature you touch"), the identical three signals still
// resolving it correctly with no spell-name-specific code anywhere in the
// resolver.
describe('resolveDnd5eSpellMechanics -- Healing Word (healing, the required second acceptance case)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Healing Word'])!

  it('extracts 2d4 healing with no flat modifier, and flags that it uses the spellcasting ability modifier', () => {
    expect(mechanics.healing).toEqual({ dice: { count: 2, faces: 4 }, modifier: 0, usesSpellcastingModifier: true })
  })

  it('does not fabricate an attack or save resolution', () => {
    expect(mechanics.resolution).toBeNull()
  })
})

// Character Sheet Body Phase 1B.4 -- the required negative case for
// Temporary Hit Points. False Life's real tag is
// "{@variantrule Temporary Hit Points|XPHB}", a DIFFERENT tag name than
// "{@variantrule Hit Point...}" -- signal 1's own tag-name specificity
// excludes it "for free", with no separate miscTags/theme-tag check needed.
// A false positive here would mean Cast could one day silently apply Temp
// HP as ordinary healing, which this phase's own DO-NOT-TOUCH list
// forbids.
describe('resolveDnd5eSpellMechanics -- False Life (Temp HP, required negative case)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['False Life'])!

  it('never extracts a healing roll -- Temporary Hit Points is not healing', () => {
    expect(mechanics.healing).toBeUndefined()
  })
})

// Character Sheet Body Phase 1B.4 -- the required negative case for
// resurrection. Revivify's real text has NO {@dice} tag at all (it revives
// with a flat, un-rolled "1 Hit Point"), so signal 1 never matches and no
// healing is ever extracted -- proving resurrection spells fail closed
// without needing any resurrection-specific exclusion logic.
describe('resolveDnd5eSpellMechanics -- Revivify (resurrection, required negative case)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells.Revivify)!

  it('never extracts a healing roll -- no {@dice} tag exists to find', () => {
    expect(mechanics.healing).toBeUndefined()
  })
})

// Character Sheet Body Phase 1B.4 -- synthetic edge cases for each of the
// three signals individually, proving the rule is a genuine three-signal
// AND, not any single signal alone (the same "cross-validate against
// non-matching shapes, not just the positive corpus" discipline this file's
// own "save outcome degrades honestly" describe block above already
// applies to 1B.3's saveOutcome rule).
describe('resolveDnd5eSpellMechanics -- healing three-signal rule, synthetic edge cases', () => {
  function withEntry(overrides: Record<string, unknown>) {
    return { name: 'Test Spell', level: 1, ...overrides }
  }

  // Regeneration-shaped: dice + Hit Point tag + "regains" verb, but NOT an
  // instant duration (a real regeneration/heal-over-time spell resolves
  // over multiple rounds/minutes) -- must fail closed.
  it('a dice+HP+"regains" spell with a non-instant duration is never extracted as healing', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry({
      duration: [{ type: 'timed', duration: { type: 'minute', amount: 1 } }],
      entries: ['At the start of each of its turns, the target regains {@dice 1d6} {@variantrule Hit Points|XPHB}.']
    }))!
    expect(mechanics.healing).toBeUndefined()
  })

  // Heroes'-Feast-shaped: dice + Hit Point tag + instant duration, but the
  // real verb used is "gains", never "regain(s)" -- must fail closed rather
  // than treat every HP-adjacent dice roll as healing.
  it('a dice+HP+instant spell using "gains" instead of "regain(s)" is never extracted as healing', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry({
      duration: [{ type: 'instant' }],
      entries: ['Each creature that partakes of the feast gains {@dice 2d10} {@variantrule Hit Points|XPHB} maximum for 24 hours.']
    }))!
    expect(mechanics.healing).toBeUndefined()
  })

  // A dice tag and an unrelated Hit-Point-tagged rules reference that are
  // far apart in the same spell's text (well outside the 80-char proximity
  // window) must not be paired into a false-positive healing roll.
  it('a dice tag and an unrelated distant Hit Point reference are not paired', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry({
      duration: [{ type: 'instant' }],
      entries: [
        'The target takes {@dice 3d6} necrotic damage and is frightened until the end of its next turn, '
        + 'unable to regain any benefit from a long rest for that same duration. Separately, see the rules on '
        + '{@variantrule Hit Points|XPHB} for how damage interacts with temporary effects in general.'
      ]
    }))!
    expect(mechanics.healing).toBeUndefined()
  })

  // Prayer-of-Healing-shaped: all three signals present, but the source
  // states NO spellcasting-ability-modifier addend at all -- a genuine RAW
  // distinction (Prayer of Healing's own real text is flat "regain 2d8 Hit
  // Points", no "plus your spellcasting ability modifier" clause), not an
  // extraction gap. `usesSpellcastingModifier` must stay ABSENT, never
  // fabricated as `false`.
  it('a healing spell with no stated modifier addend omits usesSpellcastingModifier entirely', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry({
      duration: [{ type: 'instant' }],
      entries: ['Up to six creatures of your choice that you can see within range each regain {@dice 2d8} {@variantrule Hit Points|XPHB}.']
    }))!
    expect(mechanics.healing).toEqual({ dice: { count: 2, faces: 8 }, modifier: 0 })
    expect(mechanics.healing?.usesSpellcastingModifier).toBeUndefined()
  })

  // A malformed/zero-faces dice tag near a valid Hit Point reference must
  // be rejected, not coerced -- the same discipline the dice-parser-variant
  // describe block above already requires of {@damage}.
  it('malformed healing dice (zero faces) is rejected, not coerced', () => {
    const mechanics = resolveDnd5eSpellMechanics(withEntry({
      duration: [{ type: 'instant' }],
      entries: ['The target regains {@dice 1d0} {@variantrule Hit Points|XPHB}.']
    }))!
    expect(mechanics.healing).toBeUndefined()
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

// Character Sheet Body Phase 1B.3 -- the corpus audit's own "ambiguous"
// bucket (Disintegrate, the smite spells, ...): a saving-throw spell with
// real structured damage whose prose matches NEITHER reliable pattern.
// `saveOutcome` must stay honestly absent rather than guessing either way.
describe('resolveDnd5eSpellMechanics -- save outcome degrades honestly when the source is ambiguous', () => {
  function savingThrowEntry(text: string) {
    return { name: 'Test Spell', level: 3, savingThrow: ['constitution'], entries: [text] }
  }

  it('a save spell whose prose states neither "half" nor the "or take" shape leaves saveOutcome undefined', () => {
    const mechanics = resolveDnd5eSpellMechanics(savingThrowEntry(
      'The target must make a Constitution saving throw. On a failed save, the target takes {@damage 10d6} force damage and is turned to dust. On a successful save, the target takes the same damage but is not turned to dust.'
    ))!
    expect(mechanics.damage).toMatchObject({ dice: { count: 10, faces: 6 } })
    expect(mechanics.damage?.saveOutcome).toBeUndefined()
  })

  it('a saving-throw spell with NO damage at all never populates saveOutcome', () => {
    const mechanics = resolveDnd5eSpellMechanics(savingThrowEntry('The target must succeed on a saving throw or be frightened.'))!
    expect(mechanics.damage).toBeUndefined()
  })

  it('an attack-roll spell (not saving-throw) never populates saveOutcome even with "half" in its text', () => {
    const mechanics = resolveDnd5eSpellMechanics({
      name: 'Test Spell', level: 1, spellAttack: ['R'],
      entries: ['Make a ranged spell attack. On a hit, the target takes {@damage 2d6} damage, or half that on a miracle.']
    })!
    expect(mechanics.resolution).toEqual({ kind: 'attack-roll' })
    expect(mechanics.damage?.saveOutcome).toBeUndefined()
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

// Character Sheet Body Phase 1B.4 -- a corpus-wide sweep across every real
// spell checked into the fixture (not just the two intended healing
// spells): guards against a FUTURE change to the three-signal rule
// accidentally widening it to match a spell it should not. Only Cure
// Wounds and Healing Word are expected to produce a healing roll from this
// fixture; every other real spell here (Fireball, Shield, Fire Bolt, Magic
// Missile, Chromatic Orb, Bless, Acid Splash, Hold Person, False Life,
// Revivify) must not. The full 391-spell real XPHB corpus was independently
// verified by hand during this phase's own investigation (see dnd5e.ts's
// own HEALING header) -- this sweep is the permanent, automated subset of
// that evidence.
describe('resolveDnd5eSpellMechanics -- healing corpus sweep (regression guard)', () => {
  const HEALING_SPELL_NAMES = new Set(['Cure Wounds', 'Healing Word'])

  for (const name of Object.keys(spells)) {
    const expectHealing = HEALING_SPELL_NAMES.has(name)
    it(`${name}: healing is ${expectHealing ? 'populated' : 'absent'}`, () => {
      const mechanics = resolveDnd5eSpellMechanics(spells[name])!
      if (expectHealing) {
        expect(mechanics.healing).toBeDefined()
      } else {
        expect(mechanics.healing).toBeUndefined()
      }
    })
  }
})
