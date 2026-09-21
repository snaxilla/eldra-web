// Unit tests for app/lib/spell-mechanics/cast-capability.ts -- Character
// Sheet Body Phase 1B.2's shared Cast capability classifier, the ONE
// predicate the client (CharacterActionsPanel.vue) and server
// (server/utils/character-cast.ts) both consume, so they can never
// independently invent different support rules.
//
// Uses the real six-plus-Chromatic-Orb corpus already established in
// dnd5e.test.ts, via the real `resolveDnd5eSpellMechanics` output -- never
// hand-built CanonicalSpellMechanics fixtures that could drift from what
// the resolver actually produces -- plus a few synthetic
// CanonicalSpellMechanics values for edge cases (a saving-throw spell, a
// healing-flagged spell) the current real corpus does not exercise.

import { describe, expect, it } from 'vitest'

import { classifySpellCastCapability } from '../../../app/lib/spell-mechanics/cast-capability'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import type { CanonicalSpellMechanics } from '../../../app/lib/spell-mechanics/types'
import rows from '../content-presentation/fixtures/5etools-real-rows.json'

const spells = rows.xphb.spells as any

function actionOf(name: keyof typeof spells) {
  return { category: 'spell', spellMechanics: resolveDnd5eSpellMechanics(spells[name]) }
}

describe('classifySpellCastCapability -- non-spell actions', () => {
  it('returns null (not applicable) for a weapon action, regardless of spellMechanics', () => {
    expect(classifySpellCastCapability({ category: 'weapon', spellMechanics: null })).toBeNull()
  })

  it('returns null for unarmed/species/class/background categories', () => {
    for (const category of ['unarmed', 'species', 'class', 'background']) {
      expect(classifySpellCastCapability({ category })).toBeNull()
    }
  })
})

describe('classifySpellCastCapability -- the six-spell suite', () => {
  it('Fire Bolt classifies as supported-spell-attack (test 1)', () => {
    expect(classifySpellCastCapability(actionOf('Fire Bolt'))).toEqual({ kind: 'supported-spell-attack' })
  })

  it('Magic Missile classifies as supported-automatic-damage (test 2)', () => {
    expect(classifySpellCastCapability(actionOf('Magic Missile'))).toEqual({ kind: 'supported-automatic-damage' })
  })

  it('Fireball (a saving-throw spell) does NOT classify as supported (test 3)', () => {
    const capability = classifySpellCastCapability(actionOf('Fireball'))
    expect(capability?.kind).toBe('unsupported-save')
  })

  it('Shield (an effect-only spell) does not fabricate Cast support (test 4)', () => {
    const capability = classifySpellCastCapability(actionOf('Shield'))
    expect(capability?.kind).toBe('unsupported-effect')
  })

  it('Cure Wounds is not supported either -- healing is not yet structurally extracted (1B.1/1B.2 honesty)', () => {
    const capability = classifySpellCastCapability(actionOf('Cure Wounds'))
    expect(capability?.kind).toBe('unsupported-effect')
  })

  it('Bless (concentration buff, no damage) does not fabricate Cast support', () => {
    const capability = classifySpellCastCapability(actionOf('Bless'))
    expect(capability?.kind).toBe('unsupported-effect')
  })

  // Phase 1B.2.1 upgrade: Chromatic Orb's damage-type choice is now
  // structurally represented (app/lib/spell-mechanics/dnd5e.ts), so
  // `hasUnresolvedChoice` is false and this classifier -- UNCHANGED code --
  // naturally falls through to its attack-roll resolution.
  it('Chromatic Orb -- an attack-roll spell with a structured damage-type choice -- classifies as supported-spell-attack (test 5, 1B.2.1)', () => {
    const capability = classifySpellCastCapability(actionOf('Chromatic Orb'))
    expect(capability).toEqual({ kind: 'supported-spell-attack' })
  })
})

describe('classifySpellCastCapability -- synthetic edge cases the real corpus does not exercise yet', () => {
  function mechanics(overrides: Partial<CanonicalSpellMechanics>): CanonicalSpellMechanics {
    return { level: 1, concentration: false, ritual: false, resolution: null, ...overrides }
  }

  it('a spell with no resolved spellMechanics at all is unsupported-mechanic (absence, not a guess)', () => {
    expect(classifySpellCastCapability({ category: 'spell', spellMechanics: null })).toEqual({ kind: 'unsupported-mechanic' })
    expect(classifySpellCastCapability({ category: 'spell' })).toEqual({ kind: 'unsupported-mechanic' })
  })

  it('automatic resolution with no damage AND no healing is unsupported-mechanic, never fabricated as supported', () => {
    expect(classifySpellCastCapability({
      category: 'spell', spellMechanics: mechanics({ resolution: { kind: 'automatic' } })
    })).toEqual({ kind: 'unsupported-mechanic' })
  })

  it('a future healing-flagged automatic spell reports unsupported-healing specifically, once 1B.4 populates it', () => {
    expect(classifySpellCastCapability({
      category: 'spell',
      spellMechanics: mechanics({ resolution: { kind: 'automatic' }, healing: { modifier: 0 } })
    })).toEqual({ kind: 'unsupported-healing' })
  })

  it('a non-automatic (resolution: null) spell with a healing flag also reports unsupported-healing', () => {
    expect(classifySpellCastCapability({
      category: 'spell',
      spellMechanics: mechanics({ resolution: null, healing: { modifier: 0 } })
    })).toEqual({ kind: 'unsupported-healing' })
  })

  it('an unresolved choice overrides an otherwise-supported attack-roll resolution', () => {
    expect(classifySpellCastCapability({
      category: 'spell',
      spellMechanics: mechanics({ resolution: { kind: 'attack-roll' }, hasUnresolvedChoice: true })
    })).toEqual({ kind: 'unsupported-choice' })
  })
})

// Test 6 (task's own list): capability logic does not inspect spell names --
// proven structurally by every test above passing using only `category`/
// `spellMechanics`, never a `name` field, and reinforced here explicitly.
describe('classifySpellCastCapability -- never inspects a name', () => {
  it('the function signature accepts no name field at all', () => {
    const action = actionOf('Fire Bolt')
    expect(Object.keys(action)).toEqual(['category', 'spellMechanics'])
    expect(classifySpellCastCapability(action)).toEqual({ kind: 'supported-spell-attack' })
  })
})
