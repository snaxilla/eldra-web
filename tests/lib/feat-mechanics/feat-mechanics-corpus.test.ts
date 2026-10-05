// Feat mechanics against the REAL native-XPHB corpus (77 feats, reduced to the
// fields the resolver reads -- see fixtures/xphb-feats.json's own provenance).
// Every expectation here is a corpus fact, not a hand-built approximation.
//
// Covers the PHASE 2C.1 normalization defects: the raw source variant is
// preserved (FS / FS:P / FS:R), Epic Boon's `max: 30` is a cap and never an
// ability named "max", unsupported prerequisites are kept and fail closed, and
// the one shared feat-legality predicate composes the package filter with
// ownership and prerequisites.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import { featFilterVerdict, featOptionVerdict } from '../../../app/lib/feat-mechanics/eligibility'
import type { CanonicalFeatMechanics } from '../../../app/lib/feat-mechanics/types'

type RawFeat = { name: string; source: string; category: string; prerequisite?: unknown; ability?: unknown; repeatable?: boolean }

const corpus: RawFeat[] = JSON.parse(
  readFileSync(new URL('./fixtures/xphb-feats.json', import.meta.url), 'utf8')
).feats

function raw(name: string): RawFeat {
  const found = corpus.find((feat) => feat.name === name)
  if (!found) throw new Error(`corpus has no feat named ${name}`)
  return found
}

function mechanics(name: string): CanonicalFeatMechanics {
  const resolved = resolveDnd5eFeatMechanics(raw(name))
  if (!resolved) throw new Error(`${name} did not resolve`)
  return resolved
}

function byCategory(category: string): RawFeat[] {
  return corpus.filter((feat) => feat.category === category)
}

const ALL_SIX = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const EPIC_BOONS = byCategory('EB')

describe('corpus census -- the real native-XPHB feat categories and counts', () => {
  it('the corpus holds 77 native-XPHB feats', () => {
    expect(corpus).toHaveLength(77)
  })

  it('the raw category keys are exactly G, O, FS, FS:P, FS:R, EB with the real counts', () => {
    const counts = Object.fromEntries(
      ['G', 'O', 'FS', 'FS:P', 'FS:R', 'EB'].map((key) => [key, byCategory(key).length])
    )
    expect(counts).toEqual({ G: 43, O: 10, FS: 10, 'FS:P': 1, 'FS:R': 1, EB: 12 })
  })

  it('every corpus feat resolves to mechanics (nothing silently unresolved)', () => {
    for (const feat of corpus) {
      expect(resolveDnd5eFeatMechanics(feat), `${feat.name} (${feat.category}) did not resolve`).not.toBeNull()
    }
  })
})

describe('variant preservation -- semantic category is shared, source variant is kept', () => {
  it('Archery is fighting-style with variant FS', () => {
    expect(mechanics('Archery')).toMatchObject({ category: 'fighting-style', variant: 'FS' })
  })

  it('Blessed Warrior is fighting-style with variant FS:P (never collapsed into FS)', () => {
    expect(mechanics('Blessed Warrior')).toMatchObject({ category: 'fighting-style', variant: 'FS:P' })
  })

  it('Druidic Warrior is fighting-style with variant FS:R', () => {
    expect(mechanics('Druidic Warrior')).toMatchObject({ category: 'fighting-style', variant: 'FS:R' })
  })

  it('every Epic Boon is epic-boon with variant EB; every General feat is general with variant G', () => {
    for (const boon of EPIC_BOONS) expect(mechanics(boon.name)).toMatchObject({ category: 'epic-boon', variant: 'EB' })
    for (const feat of byCategory('G')) expect(mechanics(feat.name)).toMatchObject({ category: 'general', variant: 'G' })
  })
})

describe('Epic Boon ability parsing -- a cap is never an ability named "max"', () => {
  it('no Epic Boon parses as a fixed ability, and none names "max" anywhere', () => {
    for (const boon of EPIC_BOONS) {
      const parsed = mechanics(boon.name)
      expect(parsed.abilityIncrease?.mode, `${boon.name}`).not.toBe('fixed')
      expect(JSON.stringify(parsed)).not.toContain('"max"')
    }
  })

  it('every Epic Boon is choose-one with the corpus cap of 30', () => {
    for (const boon of EPIC_BOONS) {
      const parsed = mechanics(boon.name)
      expect(parsed.abilityIncrease?.mode, boon.name).toBe('choose')
      expect(parsed.abilityCap, boon.name).toBe(30)
    }
  })

  it('a standard Epic Boon chooses from all six abilities', () => {
    expect(mechanics('Boon of Fortitude').abilityIncrease).toEqual({ mode: 'choose', from: ALL_SIX })
  })

  it('Boon of Irresistible Offense is restricted to Strength and Dexterity', () => {
    expect(mechanics('Boon of Irresistible Offense').abilityIncrease).toEqual({ mode: 'choose', from: ['str', 'dex'] })
  })

  it('Boon of Spell Recall is restricted to Intelligence, Wisdom, and Charisma', () => {
    expect(mechanics('Boon of Spell Recall').abilityIncrease).toEqual({ mode: 'choose', from: ['int', 'wis', 'cha'] })
  })
})

describe('prerequisites -- supported shapes evaluate, unsupported shapes are kept and fail closed', () => {
  it('every Epic Boon requires level 19; Spell Recall additionally requires spellcasting', () => {
    for (const boon of EPIC_BOONS) {
      expect(mechanics(boon.name).prerequisiteGroups[0]?.[0], boon.name).toEqual({ kind: 'level', level: 19 })
    }
    expect(mechanics('Boon of Spell Recall').prerequisiteGroups).toEqual([[
      { kind: 'level', level: 19 },
      { kind: 'spellcasting' }
    ]])
  })

  it('no Epic Boon, Origin, or General feat has an unsupported prerequisite', () => {
    for (const feat of [...EPIC_BOONS, ...byCategory('O'), ...byCategory('G')]) {
      expect(mechanics(feat.name).unsupportedPrerequisites, feat.name).toEqual([])
    }
  })

  // The real Fighting Style prerequisite is `feature: ["Fighting Style"]`, which
  // the engine has no primitive for. It used to vanish silently, leaving the
  // feat with NO prerequisite -- i.e. accidentally legal. It must now be kept.
  it('Archery keeps its feature prerequisite as UNSUPPORTED (never silently erased)', () => {
    expect(mechanics('Archery').unsupportedPrerequisites).toEqual(['feature'])
  })

  it('every Fighting Style FS feat keeps the feature prerequisite as unsupported', () => {
    for (const feat of byCategory('FS')) expect(mechanics(feat.name).unsupportedPrerequisites, feat.name).toEqual(['feature'])
  })

  it('Blessed and Druidic Warrior keep their otherSummary prerequisite as unsupported', () => {
    expect(mechanics('Blessed Warrior').unsupportedPrerequisites).toEqual(['otherSummary'])
    expect(mechanics('Druidic Warrior').unsupportedPrerequisites).toEqual(['otherSummary'])
  })

  it('an unsupported prerequisite makes the feat illegal even when every OTHER check passes', () => {
    const verdict = featOptionVerdict({
      mechanics: mechanics('Archery'),
      filter: { category: 'fighting-style', variants: ['FS'] },
      ownedElsewhere: false,
      prerequisitesMet: () => true
    })
    expect(verdict).toEqual({ eligible: false, reason: 'prerequisite-unsupported' })
  })
})

describe('General feats -- unchanged by the generic filter', () => {
  it('the 43 General feats are all general, none carries a cap, and none is unsupported', () => {
    const general = byCategory('G').map((feat) => mechanics(feat.name))
    expect(general).toHaveLength(43)
    for (const parsed of general) {
      expect(parsed.category).toBe('general')
      expect(parsed.abilityCap).toBeUndefined()
      expect(parsed.unsupportedPrerequisites).toEqual([])
    }
  })

  it('Ability Score Improvement keeps its two-entry ASI shape and is repeatable', () => {
    const asi = mechanics('Ability Score Improvement')
    expect(asi.repeatable).toBe(true)
    expect(asi.abilityIncrease?.mode).toBe('asi')
  })

  it('Crossbow Expert keeps its fixed +1 Dexterity (a real fixed ability, not a cap)', () => {
    expect(mechanics('Crossbow Expert').abilityIncrease).toEqual({ mode: 'fixed', ability: 'dex' })
  })

  it('Athlete keeps its choose-one-of Strength/Dexterity', () => {
    expect(mechanics('Athlete').abilityIncrease).toEqual({ mode: 'choose', from: ['str', 'dex'] })
  })

  it('Elemental Adept (General) keeps its repeatable flag', () => {
    expect(mechanics('Elemental Adept').repeatable).toBe(true)
  })
})

describe('the package-owned filter -- category, variant, and fail-closed defaults', () => {
  const epicBoonFilter = { category: 'epic-boon' }

  it('a General feat is not an Epic Boon (wrong category)', () => {
    expect(featFilterVerdict(mechanics('Athlete'), epicBoonFilter)).toEqual({ eligible: false, reason: 'wrong-category' })
  })

  it('an Origin feat is not an Epic Boon, and an Origin filter identifies Origin only', () => {
    expect(featFilterVerdict(mechanics('Alert'), epicBoonFilter).eligible).toBe(false)
    expect(featFilterVerdict(mechanics('Alert'), { category: 'origin' })).toEqual({ eligible: true })
    expect(featFilterVerdict(mechanics('Athlete'), { category: 'origin' }).eligible).toBe(false)
  })

  it('a Fighting Style filter distinguishes the semantic category from a source variant', () => {
    expect(featFilterVerdict(mechanics('Archery'), { category: 'fighting-style' })).toEqual({ eligible: true })
    expect(featFilterVerdict(mechanics('Blessed Warrior'), { category: 'fighting-style' })).toEqual({ eligible: true })
  })

  it('a variant restriction admits only the listed raw variants (the Fighter-style FS-only list)', () => {
    const fighterFilter = { category: 'fighting-style', variants: ['FS'] }
    expect(featFilterVerdict(mechanics('Archery'), fighterFilter)).toEqual({ eligible: true })
    expect(featFilterVerdict(mechanics('Blessed Warrior'), fighterFilter)).toEqual({ eligible: false, reason: 'wrong-variant' })
  })

  it('a Paladin-style list admits FS and FS:P together, never FS:R', () => {
    const paladinFilter = { category: 'fighting-style', variants: ['FS', 'FS:P'] }
    expect(featFilterVerdict(mechanics('Blessed Warrior'), paladinFilter).eligible).toBe(true)
    expect(featFilterVerdict(mechanics('Druidic Warrior'), paladinFilter)).toEqual({ eligible: false, reason: 'wrong-variant' })
  })

  it('no filter means nothing is legal (fail closed, never a default category)', () => {
    expect(featFilterVerdict(mechanics('Athlete'), undefined)).toEqual({ eligible: false, reason: 'no-filter' })
  })

  it('an unresolved feat satisfies no filter', () => {
    expect(featFilterVerdict(null, epicBoonFilter)).toEqual({ eligible: false, reason: 'wrong-category' })
  })
})

describe('the shared option verdict -- filter, ownership, and prerequisites compose', () => {
  const epicBoonFilter = { category: 'epic-boon' }
  const met = () => true
  const unmet = () => false

  it('a legal, unowned Epic Boon whose prerequisite is met is eligible', () => {
    expect(featOptionVerdict({ mechanics: mechanics('Boon of Fortitude'), filter: epicBoonFilter, ownedElsewhere: false, prerequisitesMet: met }))
      .toEqual({ eligible: true })
  })

  it('an unmet prerequisite refuses an otherwise-legal Epic Boon', () => {
    expect(featOptionVerdict({ mechanics: mechanics('Boon of Spell Recall'), filter: epicBoonFilter, ownedElsewhere: false, prerequisitesMet: unmet }))
      .toEqual({ eligible: false, reason: 'prerequisite-unmet' })
  })

  it('a non-repeatable feat already owned elsewhere is refused', () => {
    expect(featOptionVerdict({ mechanics: mechanics('Boon of Fortitude'), filter: epicBoonFilter, ownedElsewhere: true, prerequisitesMet: met }))
      .toEqual({ eligible: false, reason: 'already-owned' })
  })

  it('a REPEATABLE feat stays eligible when already owned (Ability Score Improvement)', () => {
    expect(featOptionVerdict({ mechanics: mechanics('Ability Score Improvement'), filter: { category: 'general' }, ownedElsewhere: true, prerequisitesMet: met }))
      .toEqual({ eligible: true })
  })

  it('a repeatable Origin feat (Skilled) stays eligible when already owned, composing with the origin filter', () => {
    expect(featOptionVerdict({ mechanics: mechanics('Skilled'), filter: { category: 'origin' }, ownedElsewhere: true, prerequisitesMet: met }))
      .toEqual({ eligible: true })
  })

  it('the filter is checked before ownership, so a wrong-category feat reports wrong-category even if owned', () => {
    expect(featOptionVerdict({ mechanics: mechanics('Athlete'), filter: epicBoonFilter, ownedElsewhere: true, prerequisitesMet: met }))
      .toEqual({ eligible: false, reason: 'wrong-category' })
  })

  it('prerequisitesMet is not evaluated when an earlier check already decided the verdict', () => {
    let evaluated = false
    featOptionVerdict({
      mechanics: mechanics('Athlete'),
      filter: epicBoonFilter,
      ownedElsewhere: false,
      prerequisitesMet: () => { evaluated = true; return true }
    })
    expect(evaluated).toBe(false)
  })
})
