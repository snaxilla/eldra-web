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
    // Character Sheet Body Phase 1B.5 -- `diceScaling` is now also present
    // (see this file's own dedicated Fire Bolt scaling describe block
    // below); `toMatchObject` keeps this 1B.1 assertion proving exactly
    // what it always proved.
    expect(mechanics.damage).toMatchObject({ dice: { count: 1, faces: 10 }, modifier: 0, type: 'fire' })
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
    // Character Sheet Body Phase 1B.5 -- `diceScaling` is now also present
    // (see this file's own dedicated Fireball scaling describe block
    // below); `toMatchObject` keeps this 1B.3 assertion proving exactly
    // what it always proved.
    expect(mechanics.damage).toMatchObject({ dice: { count: 8, faces: 6 }, modifier: 0, type: 'fire', saveOutcome: 'half-on-save' })
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
    // Character Sheet Body Phase 1B.5 -- `diceScaling` is now also present
    // (see this file's own dedicated Cure Wounds scaling describe block
    // below); `toMatchObject` keeps this 1B.4 assertion proving exactly
    // what it always proved.
    expect(mechanics.healing).toMatchObject({ dice: { count: 2, faces: 8 }, modifier: 0, usesSpellcastingModifier: true })
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
    // Character Sheet Body Phase 1B.5 -- `diceScaling` is now also present
    // (see this file's own dedicated Healing Word scaling describe block
    // below); `toMatchObject` keeps this 1B.4 assertion proving exactly
    // what it always proved.
    expect(mechanics.healing).toMatchObject({ dice: { count: 2, faces: 4 }, modifier: 0, usesSpellcastingModifier: true })
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
    // Character Sheet Body Phase 1B.5 -- `diceScaling` is now also present
    // (see this file's own dedicated Chromatic Orb scaling describe block
    // below); `toMatchObject` here so this 1B.2.1 assertion keeps proving
    // exactly what it always proved (dice/modifier/type) without also
    // having to restate the new field.
    expect(mechanics.damage).toMatchObject({ dice: { count: 3, faces: 8 }, modifier: 0, type: undefined })
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

// ---------------------------------------------------------------------------
// Character Sheet Body Phase 1B.5 -- Executable Spell Scaling + Upcasting
// ---------------------------------------------------------------------------
// `SpellRoll.diceScaling` extraction: Fire Bolt/Acid Splash (cantrip,
// character-level trigger) and Fireball/Cure Wounds/Healing Word/Chromatic
// Orb (leveled, cast-level trigger) are the task's own required acceptance
// spells; the negative/edge cases below (Ice Knife-shaped mismatch,
// Shillelagh-shaped no-damage-to-scale, Bigby's-Hand-shaped valid multi-tag)
// are synthetic, built from the REAL shapes this phase's own corpus audit
// found in the full XPHB dataset (see dnd5e.ts's own SCALING header for the
// exact spell names and evidence) -- reproduced here as constructed
// `entries`/`entriesHigherLevel`/`scalingLevelDice` fixtures rather than
// pulling six more large real spells into the fixture file, the same
// "cross-validate against non-matching shapes via synthetic constructed
// entries" precedent this file's own "save outcome degrades honestly"
// describe block above already established for 1B.3.

describe('resolveDnd5eSpellMechanics -- Fire Bolt (cantrip character-level dice scaling, required acceptance)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Fire Bolt'])!

  it('extracts the full 1/5/11/17 threshold table, byte-identical to the real scalingLevelDice field', () => {
    expect(mechanics.damage?.diceScaling).toEqual({
      trigger: 'character-level',
      tiers: [
        { level: 1, dice: { count: 1, faces: 10 } },
        { level: 5, dice: { count: 2, faces: 10 } },
        { level: 11, dice: { count: 3, faces: 10 } },
        { level: 17, dice: { count: 4, faces: 10 } }
      ]
    })
  })

  it('the base tier is byte-identical to damage.dice itself -- deliberately redundant, never drifting', () => {
    const tiers = mechanics.damage!.diceScaling as Extract<typeof mechanics.damage.diceScaling, { trigger: 'character-level' }>
    expect(tiers.tiers[0]).toEqual({ level: 1, dice: mechanics.damage!.dice })
  })

  it('never attaches slot-level (cast-level) scaling to a cantrip', () => {
    expect(mechanics.damage?.diceScaling?.trigger).not.toBe('cast-level')
  })
})

describe('resolveDnd5eSpellMechanics -- Acid Splash (cantrip character-level dice scaling, required acceptance)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Acid Splash'])!

  it('extracts the full 1/5/11/17 threshold table, proving the mechanism is not Fire-Bolt-specific (different die size)', () => {
    expect(mechanics.damage?.diceScaling).toEqual({
      trigger: 'character-level',
      tiers: [
        { level: 1, dice: { count: 1, faces: 6 } },
        { level: 5, dice: { count: 2, faces: 6 } },
        { level: 11, dice: { count: 3, faces: 6 } },
        { level: 17, dice: { count: 4, faces: 6 } }
      ]
    })
  })

  it('still preserves its own no-damage-on-save outcome alongside the new scaling field', () => {
    expect(mechanics.damage?.saveOutcome).toBe('no-damage-on-save')
  })
})

describe('resolveDnd5eSpellMechanics -- Fireball (slot-level cast-level dice scaling, required acceptance)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells.Fireball)!

  it('extracts a linear cast-level scaling of +1d6 per slot level above base level 3', () => {
    expect(mechanics.damage?.diceScaling).toEqual({ trigger: 'cast-level', perLevelDiceCount: 1 })
  })

  it('still preserves half-on-save alongside the new scaling field', () => {
    expect(mechanics.damage?.saveOutcome).toBe('half-on-save')
  })

  it('never attaches character-level (cantrip) scaling to a leveled spell', () => {
    expect(mechanics.damage?.diceScaling?.trigger).not.toBe('character-level')
  })
})

describe('resolveDnd5eSpellMechanics -- Cure Wounds / Healing Word (slot-level healing-dice scaling, required acceptance)', () => {
  it('Cure Wounds extracts +2d8 per slot level above base level 1 (a per-level COUNT of 2, never hardcoded to 1)', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Cure Wounds'])!
    expect(mechanics.healing?.diceScaling).toEqual({ trigger: 'cast-level', perLevelDiceCount: 2 })
  })

  it('Healing Word extracts +2d4 per slot level above base level 1 -- proves genericity, not Cure-Wounds-specific', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Healing Word'])!
    expect(mechanics.healing?.diceScaling).toEqual({ trigger: 'cast-level', perLevelDiceCount: 2 })
  })

  it('never attaches diceScaling to damage for a pure-healing spell (there is no damage roll to scale)', () => {
    expect(resolveDnd5eSpellMechanics(spells['Cure Wounds'])!.damage).toBeUndefined()
  })
})

describe('resolveDnd5eSpellMechanics -- Chromatic Orb (scaling composes with a structured choice, required investigation)', () => {
  const mechanics = resolveDnd5eSpellMechanics(spells['Chromatic Orb'])!

  it('extracts +1d8 per slot level above base level 1', () => {
    expect(mechanics.damage?.diceScaling).toEqual({ trigger: 'cast-level', perLevelDiceCount: 1 })
  })

  it('the structured damage-type choice survives alongside scaling, type still undefined until resolved', () => {
    expect(mechanics.choices).toHaveLength(1)
    expect(mechanics.damage?.type).toBeUndefined()
  })
})

describe('resolveDnd5eSpellMechanics -- Magic Missile / Bless (non-dice scaling, required investigation: classified, never faked as dice)', () => {
  it('Magic Missile never gets diceScaling -- "one more dart" is instance scaling, not dice scaling', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells['Magic Missile'])!
    expect(mechanics.damage?.diceScaling).toBeUndefined()
    // The base per-dart mechanic is completely unaffected -- proving 1B.5
    // introduces no fake "extra dart = extra die" shortcut anywhere in the
    // canonical layer.
    expect(mechanics.damage).toEqual({ dice: { count: 1, faces: 4 }, modifier: 1, type: 'force' })
  })

  it('Bless has no damage roll at all to attach scaling to -- "one more target" is never modeled as dice', () => {
    const mechanics = resolveDnd5eSpellMechanics(spells.Bless)!
    expect(mechanics.damage).toBeUndefined()
    expect(mechanics.resolution).toBeNull()
  })

  it('both still preserve their own prose-only scaling text (1B.1 behavior, unchanged)', () => {
    expect(resolveDnd5eSpellMechanics(spells['Magic Missile'])!.scaling?.kind).toBe('slot-level')
    expect(resolveDnd5eSpellMechanics(spells.Bless)!.scaling?.kind).toBe('slot-level')
  })
})

// Character Sheet Body Phase 1B.5 -- synthetic cross-validation edge cases,
// reproducing REAL corpus shapes this phase's own audit found (see
// dnd5e.ts's own SCALING header) without pulling six more large real spells
// into the fixture.
describe('resolveDnd5eSpellMechanics -- diceScaling cross-validation, synthetic edge cases', () => {
  function cantripEntry(overrides: Record<string, unknown>) {
    return {
      name: 'Test Cantrip', level: 0, spellAttack: ['R'],
      entries: ['Deals {@damage 1d6} damage.'],
      ...overrides
    }
  }

  function leveledEntry(overrides: Record<string, unknown>) {
    return {
      name: 'Test Spell', level: 3, spellAttack: ['R'],
      entries: ['Deals {@damage 8d6} damage.'],
      ...overrides
    }
  }

  // Shillelagh/True Strike's real shape: a `scalingLevelDice` table exists,
  // but the spell has no `{@damage}` tag of its own (their real effect
  // modifies a WEAPON's damage die, not a spell roll) -- diceScaling must
  // never attach to a roll that does not exist.
  it('a scalingLevelDice table with no underlying damage roll attaches nothing (Shillelagh/True Strike-shaped)', () => {
    const mechanics = resolveDnd5eSpellMechanics({
      name: 'Test Weapon Buff', level: 0,
      entries: ['Your weapon damage die becomes a d8.'],
      scalingLevelDice: { label: 'damage', scaling: { 1: '1d8', 5: '1d10', 11: '1d12', 17: '2d6' } }
    })!
    expect(mechanics.damage).toBeUndefined()
  })

  // Shillelagh's own real anomaly: the tiers themselves change FACE size
  // (die-size change), not just count -- even if a damage roll DID exist
  // with base 1d8, this would be refused because the base tier's dice must
  // match `damage.dice` exactly AND every other real corpus scaling table
  // never changes face size, so a cross-validated match here would be
  // coincidental at best. Verified here as: base tier face size differs
  // from actual damage -> refused.
  it('a scalingLevelDice base tier that does not match the extracted damage dice is refused (die-size-change-shaped)', () => {
    const mechanics = resolveDnd5eSpellMechanics(cantripEntry({
      entries: ['Deals {@damage 1d8} damage.'],
      scalingLevelDice: { label: 'damage', scaling: { 1: '1d6', 5: '1d10', 11: '1d12', 17: '2d6' } }
    }))!
    expect(mechanics.damage?.dice).toEqual({ count: 1, faces: 8 })
    expect(mechanics.damage?.diceScaling).toBeUndefined()
  })

  // True Strike's own real anomaly: the tiers start at level 5, no level-1
  // entry at all -- with no damage to cross-validate against anyway
  // (True Strike has none), but proven independently here: even WITH a
  // damage roll present, a table missing its lowest tier's own match to
  // `damage.dice` is refused, never assumed.
  it('a scalingLevelDice table whose lowest tier does not match extracted damage is refused, even with damage present', () => {
    const mechanics = resolveDnd5eSpellMechanics(cantripEntry({
      entries: ['Deals {@damage 1d6} damage.'],
      scalingLevelDice: { label: 'extra damage', scaling: { 5: '1d6', 11: '2d6', 17: '3d6' } }
    }))!
    expect(mechanics.damage?.dice).toEqual({ count: 1, faces: 6 })
    expect(mechanics.damage?.diceScaling).toBeUndefined()
  })

  // Ice Knife's real shape: the {@scaledamage} tag describes a DIFFERENT
  // damage component (a 2d6 secondary explosion) than the FIRST {@damage}
  // tag this resolver's own established "first tag wins" rule extracts
  // (a 1d10 direct hit) -- cross-validation must refuse rather than
  // silently scale the wrong roll.
  it('a {@scaledamage} tag describing a different component than the extracted damage is refused (Ice-Knife-shaped)', () => {
    const mechanics = resolveDnd5eSpellMechanics({
      name: 'Test Knife', level: 1, spellAttack: ['R'],
      entries: ['On a hit, the target takes {@damage 1d10} Piercing damage. Each creature within 5 feet takes {@damage 2d6} Cold damage.'],
      entriesHigherLevel: [{
        type: 'entries', name: 'Using a Higher-Level Spell Slot',
        entries: ['The Cold damage increases by {@scaledamage 2d6|1-9|1d6} for each spell slot level above 1.']
      }]
    })!
    expect(mechanics.damage?.dice).toEqual({ count: 1, faces: 10 })
    expect(mechanics.damage?.diceScaling).toBeUndefined()
  })

  // Ice Storm's real shape: TWO simultaneous {@damage} tags (never a
  // choice, per the existing 1B.2.1 precedent this file's own "structured
  // choice precision" describe block above already tests), and the
  // {@scaledamage} tag's own base (2d8) matches NEITHER of them (2d10
  // bludgeoning, 4d6 cold) -- refused.
  it('a {@scaledamage} tag matching neither of two simultaneous damage components is refused (Ice-Storm-shaped)', () => {
    const mechanics = resolveDnd5eSpellMechanics({
      name: 'Test Storm', level: 4, savingThrow: ['dexterity'],
      damageInflict: ['bludgeoning', 'cold'],
      entries: ['Each creature takes {@damage 2d10} Bludgeoning damage and {@damage 4d6} Cold damage on a failed save or half as much damage on a successful one.'],
      entriesHigherLevel: [{
        type: 'entries', name: 'Using a Higher-Level Spell Slot',
        entries: ['The damage increases by {@scaledamage 2d8|4-9|1d10} for each spell slot level above 4.']
      }]
    })!
    expect(mechanics.damage?.dice).toEqual({ count: 2, faces: 10 })
    expect(mechanics.damage?.diceScaling).toBeUndefined()
  })

  // Bigby's Hand/Wall of Ice's real shape: TWO {@scaledamage} tags, but the
  // FIRST one genuinely does describe the same component the resolver's own
  // "first tag" rule extracted -- multi-tag alone must never be
  // disqualifying, only a base-dice/min-level mismatch is.
  it('multiple {@scaledamage} tags are not themselves disqualifying when the first one matches (Bigby\'s-Hand-shaped)', () => {
    const mechanics = resolveDnd5eSpellMechanics({
      name: 'Test Hand', level: 5, spellAttack: ['M'],
      entries: ['On a hit, the hand deals {@damage 5d8} Force damage.'],
      entriesHigherLevel: [{
        type: 'entries', name: 'Using a Higher-Level Spell Slot',
        entries: ['The damage of the first mode increases by {@scaledamage 5d8|5-9|2d8} and the damage of the second mode increases by {@scaledamage 4d6|5-9|2d6} for each spell slot level above 5.']
      }]
    })!
    expect(mechanics.damage?.diceScaling).toEqual({ trigger: 'cast-level', perLevelDiceCount: 2 })
  })

  // Disintegrate's real shape: the {@scaledamage} tag's own BASE carries a
  // flat "+K" modifier suffix ("10d6 + 40"), not a bare NdM -- this
  // resolver's own dice-notation parser refuses anything but bare `NdM`
  // rather than guessing how a modifier should scale.
  it('a {@scaledamage} base with a flat modifier suffix is refused rather than guessed (Disintegrate-shaped)', () => {
    const mechanics = resolveDnd5eSpellMechanics(leveledEntry({
      level: 6,
      entries: ['The target takes {@damage 10d6 + 40} Force damage.'],
      entriesHigherLevel: [{
        type: 'entries', name: 'Using a Higher-Level Spell Slot',
        entries: ['The damage increases by {@scaledamage 10d6 + 40|6-9|3d6} for each spell slot level above 6.']
      }]
    }))!
    expect(mechanics.damage?.dice).toEqual({ count: 10, faces: 6 })
    expect(mechanics.damage?.modifier).toBe(40)
    expect(mechanics.damage?.diceScaling).toBeUndefined()
  })

  // Conjure Elemental/Lightning Arrow/Melf's Acid Arrow's real shape: a
  // semicolon-separated dual base ("8d8;4d8", a hit/miss or two-mode
  // variant) -- not a bare NdM, refused rather than guessing which half
  // applies.
  it('a semicolon-separated dual {@scaledamage} base is refused rather than guessed (Conjure-Elemental-shaped)', () => {
    const mechanics = resolveDnd5eSpellMechanics(leveledEntry({
      level: 5,
      entries: ['The creature deals {@damage 8d8} damage.'],
      entriesHigherLevel: [{
        type: 'entries', name: 'Using a Higher-Level Spell Slot',
        entries: ['The damage increases by {@scaledamage 8d8;4d8|5-9|1d8} for each spell slot level above 5.']
      }]
    }))!
    expect(mechanics.damage?.dice).toEqual({ count: 8, faces: 8 })
    expect(mechanics.damage?.diceScaling).toBeUndefined()
  })

  // The per-level increment's own die SIZE must match the base roll's die
  // size -- refused if it does not (no real corpus example exists, but the
  // guard itself is verified directly rather than trusted untested).
  it('a per-level increment whose die size differs from the base roll is refused', () => {
    const mechanics = resolveDnd5eSpellMechanics(leveledEntry({
      entriesHigherLevel: [{
        type: 'entries', name: 'Using a Higher-Level Spell Slot',
        entries: ['The damage increases by {@scaledamage 8d6|3-9|1d8} for each spell slot level above 3.']
      }]
    }))!
    expect(mechanics.damage?.diceScaling).toBeUndefined()
  })

  // A {@scaledamage} tag whose own stated minimum level does not match this
  // spell's own base level is refused -- proves the range-start check is
  // real, not a no-op.
  it('a {@scaledamage} tag whose stated minimum level does not match the spell\'s own base level is refused', () => {
    const mechanics = resolveDnd5eSpellMechanics(leveledEntry({
      entriesHigherLevel: [{
        type: 'entries', name: 'Using a Higher-Level Spell Slot',
        entries: ['The damage increases by {@scaledamage 8d6|4-9|1d6} for each spell slot level above 4.']
      }]
    }))!
    expect(mechanics.damage?.diceScaling).toBeUndefined()
  })

  // A per-level increment count that is NOT 1 must be preserved exactly,
  // never hardcoded to "+1 die" -- several real spells (Circle of Death,
  // Disintegrate's own valid siblings, Cure Wounds itself) add 2 or 3 dice
  // per level.
  it('a per-level increment count other than 1 is preserved exactly, never coerced to 1', () => {
    const mechanics = resolveDnd5eSpellMechanics(leveledEntry({
      entriesHigherLevel: [{
        type: 'entries', name: 'Using a Higher-Level Spell Slot',
        entries: ['The damage increases by {@scaledamage 8d6|3-9|3d6} for each spell slot level above 3.']
      }]
    }))!
    expect(mechanics.damage?.diceScaling).toEqual({ trigger: 'cast-level', perLevelDiceCount: 3 })
  })
})

// D&D 2024 Character Rules P2 -- `classLists`, the one additive field P2 adds to this resolver.
// Read only from the already-compiled `data.classLists` (set by 5etools-dataset.ts's
// `enrichSpellClassLists` at Content compile time); this resolver never re-derives it.
describe('resolveDnd5eSpellMechanics -- classLists (P2 addition)', () => {
  it('is populated verbatim when the compiled data carries it', () => {
    const mechanics = resolveDnd5eSpellMechanics({
      name: 'Fireball', source: 'XPHB', level: 3, school: 'V',
      classLists: ['Sorcerer', 'Wizard']
    })!
    expect(mechanics.classLists).toEqual(['Sorcerer', 'Wizard'])
  })

  it('is absent (never an empty array) when the compiled data carries none -- a Content entry compiled before this phase, or one the lookup found no membership for', () => {
    const mechanics = resolveDnd5eSpellMechanics({ name: 'Fireball', source: 'XPHB', level: 3, school: 'V' })!
    expect(mechanics.classLists).toBeUndefined()
  })

  it('a malformed classLists value (not an array of strings) resolves to absent, never a thrown error or a guessed value', () => {
    const notArray = resolveDnd5eSpellMechanics({ name: 'Fireball', source: 'XPHB', level: 3, school: 'V', classLists: 'Wizard' })!
    expect(notArray.classLists).toBeUndefined()

    const mixedArray = resolveDnd5eSpellMechanics({ name: 'Fireball', source: 'XPHB', level: 3, school: 'V', classLists: ['Wizard', 42, null] })!
    expect(mixedArray.classLists).toEqual(['Wizard'])
  })
})
