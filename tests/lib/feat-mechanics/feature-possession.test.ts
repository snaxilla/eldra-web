// PHASE 2C.2A -- feature possession as a generic character fact, and the
// fail-closed mapping from a RAW feat prerequisite (`feature: [...]`) to a
// package-owned feature Value. Every rule here is generic: no feat-name branch,
// no class-name branch, and no string comparison against a Value id.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import { coverUnsupportedPrerequisites, featOptionVerdict } from '../../../app/lib/feat-mechanics/eligibility'
import { findRulesFacet } from '../../../app/lib/content-rules'

const FS_COVERAGE = [{ feature: 'Fighting Style', requires: 'value:feature.fighting-style' }]
const FS_FILTER = { category: 'fighting-style', variants: ['FS'] }

// A synthetic raw feat, shaped like the corpus. Used ONLY to exercise the
// fail-closed rules on prerequisite shapes the corpus does not map (Spellfire
// Adept's real `feature: ["Spellcasting", "Pact Magic"]` is FRHoF, outside the
// curated XPHB selection, so it is reproduced here by shape, not by data).
function syntheticFs(name: string, prerequisite: unknown) {
  return resolveDnd5eFeatMechanics({ name, source: 'TEST', category: 'FS', prerequisite })
}

describe('raw feature prerequisites -- explicit package mapping, exact raw name', () => {
  it('a raw feature name covered by an explicit mapping is covered; its Value is what must be active', () => {
    const mechanics = syntheticFs('Probe', [{ feature: ['Fighting Style'] }])!
    expect(coverUnsupportedPrerequisites(mechanics, FS_COVERAGE)).toEqual({
      uncovered: [],
      requiredFeatures: ['value:feature.fighting-style']
    })
  })

  it('an UNMAPPED raw feature stays uncovered and the feat is illegal, even when a Value id happens to resemble it', () => {
    // Spellfire-shaped: `Spellcasting` has no mapping. Declaring `Fighting Style`
    // does not cover it, and no string resemblance can.
    const mechanics = syntheticFs('Spellfire Probe', [{ feature: ['Spellcasting', 'Pact Magic'] }])!
    const verdict = featOptionVerdict({
      mechanics, filter: FS_FILTER, mappings: FS_COVERAGE, featureActive: () => true, ownedElsewhere: false, prerequisitesMet: () => true
    })
    expect(verdict).toEqual({ eligible: false, reason: 'prerequisite-unsupported' })
  })

  it('a feat with TWO raw values is covered only when EVERY value is mapped (partial coverage fails closed)', () => {
    const mechanics = syntheticFs('Partial Probe', [{ feature: ['Fighting Style', 'Pact Magic'] }])!
    expect(coverUnsupportedPrerequisites(mechanics, FS_COVERAGE).uncovered).toHaveLength(1)
  })

  it('matching is verbatim: a raw name that differs by whitespace or case is NOT covered', () => {
    const trailing = syntheticFs('Whitespace Probe', [{ feature: ['Fighting Style '] }])!
    const lowercase = syntheticFs('Case Probe', [{ feature: ['fighting style'] }])!
    expect(coverUnsupportedPrerequisites(trailing, FS_COVERAGE).uncovered).toHaveLength(1)
    expect(coverUnsupportedPrerequisites(lowercase, FS_COVERAGE).uncovered).toHaveLength(1)
  })

  it('prose-only prerequisites (otherSummary) are never covered by a feature mapping', () => {
    const mechanics = syntheticFs('Summary Probe', [{ otherSummary: { entry: 'When gaining the Level 2 Paladin Fighting Style feature' } }])!
    expect(mechanics.unsupportedPrerequisites).toEqual([{ key: 'otherSummary', values: [] }])
    expect(coverUnsupportedPrerequisites(mechanics, FS_COVERAGE).uncovered).toHaveLength(1)
  })

  it('an unsupported key is never silently normalized to "no prerequisites"', () => {
    const mechanics = syntheticFs('Silent Probe', [{ feature: ['Fighting Style'] }])!
    expect(mechanics.prerequisiteGroups).toEqual([])
    expect(mechanics.unsupportedPrerequisites).toEqual([{ key: 'feature', values: ['Fighting Style'] }])
  })
})

describe('feature Values -- generic, read through the same predicate every consumer uses', () => {
  it('a covered requirement is met only when its Value is active in the caller\'s derived state', () => {
    const mechanics = resolveDnd5eFeatMechanics({ name: 'Probe', source: 'XPHB', category: 'FS', prerequisite: [{ feature: ['Fighting Style'] }] })
    const input = { mechanics, filter: FS_FILTER, mappings: FS_COVERAGE, ownedElsewhere: false, prerequisitesMet: () => true }
    expect(featOptionVerdict({ ...input, featureActive: () => true })).toEqual({ eligible: true })
    expect(featOptionVerdict({ ...input, featureActive: () => false })).toEqual({ eligible: false, reason: 'prerequisite-unmet' })
  })

  it('with no feature activity supplied, a required feature fails closed', () => {
    const mechanics = resolveDnd5eFeatMechanics({ name: 'Probe', source: 'XPHB', category: 'FS', prerequisite: [{ feature: ['Fighting Style'] }] })
    expect(featOptionVerdict({ mechanics, filter: FS_FILTER, mappings: FS_COVERAGE, ownedElsewhere: false, prerequisitesMet: () => true }))
      .toEqual({ eligible: false, reason: 'prerequisite-unmet' })
  })

  it('the mechanism is generic: a different package Value mapped from a different raw name works the same way, with no code change', () => {
    const mechanics = resolveDnd5eFeatMechanics({ name: 'Other Probe', source: 'TEST', category: 'FS', prerequisite: [{ feature: ['Test Thing'] }] })
    const mappings = [{ feature: 'Test Thing', requires: 'value:feature.test-thing' }]
    const verdict = (active: boolean) => featOptionVerdict({
      mechanics, filter: FS_FILTER, mappings, featureActive: (id) => id === 'value:feature.test-thing' && active,
      ownedElsewhere: false, prerequisitesMet: () => true
    })
    expect(verdict(true)).toEqual({ eligible: true })
    expect(verdict(false)).toEqual({ eligible: false, reason: 'prerequisite-unmet' })
  })

  it('the feature requirement is checked independently of any display label: the same raw prerequisite yields identical mechanics under any title', () => {
    const a = resolveDnd5eFeatMechanics({ name: 'Archery', source: 'XPHB', category: 'FS', prerequisite: [{ feature: ['Fighting Style'] }] })
    const b = resolveDnd5eFeatMechanics({ name: 'Renamed Anything', source: 'XPHB', category: 'FS', prerequisite: [{ feature: ['Fighting Style'] }] })
    expect(a).toEqual(b)
  })
})

describe('package facts -- the Value and every mapping resolve in the real Rules Package', () => {
  const definitions: { id: string, kind: string, valueType?: string, category?: string, storage?: string, default?: unknown }[] =
    JSON.parse(readFileSync(new URL('../../../packages/eldra-dnd5e-2024/definitions.json', import.meta.url), 'utf8'))

  it('value:feature.fighting-style is a stored boolean Value, default false, in the progression category', () => {
    expect(definitions.find((d) => d.id === 'value:feature.fighting-style')).toMatchObject({
      kind: 'value', valueType: 'boolean', storage: 'stored', default: false, category: 'progression'
    })
  })

  it('every ordinary FS feat\'s coverage points at a Value that the package declares', () => {
    const declared = new Set(definitions.map((d) => d.id))
    const fsSlugs = ['archery', 'blind-fighting', 'defense', 'dueling', 'great-weapon-fighting', 'interception', 'protection', 'thrown-weapon-fighting', 'two-weapon-fighting', 'unarmed-fighting']
    for (const slug of fsSlugs) {
      const facet = findRulesFacet('dnd5e.2024', 'feat', `${slug}-xphb`)
      expect(facet?.featureRequirements, slug).toEqual([{ feature: 'Fighting Style', requires: 'value:feature.fighting-style' }])
      for (const requirement of facet!.featureRequirements!) expect(declared.has(requirement.requires)).toBe(true)
    }
  })

  it('Blessed Warrior and Druidic Warrior carry NO feature coverage (their unsupported prerequisite stays unsupported)', () => {
    expect(findRulesFacet('dnd5e.2024', 'feat', 'blessed-warrior-xphb')?.featureRequirements).toBeUndefined()
    expect(findRulesFacet('dnd5e.2024', 'feat', 'druidic-warrior-xphb')?.featureRequirements).toBeUndefined()
  })

  it('the Paladin and Ranger Level-2 rows ACTIVATE the feature Value and offer their own FS declarations', () => {
    const paladin = definitions.find((d) => d.id === 'progression:class.fighting-style-fs-and-fs-p') as unknown as { rows: { at: number, sets: Record<string, boolean>, choices: { choiceSet: string }[] }[] }
    const ranger = definitions.find((d) => d.id === 'progression:class.fighting-style-fs-and-fs-r') as unknown as { rows: { at: number, sets: Record<string, boolean>, choices: { choiceSet: string }[] }[] }
    expect(paladin.rows).toEqual([{ at: 2, sets: { 'value:feature.fighting-style': true }, choices: [{ choiceSet: 'choice:feat.fighting-style.fs-and-fs-p', count: 1 }] }])
    expect(ranger.rows).toEqual([{ at: 2, sets: { 'value:feature.fighting-style': true }, choices: [{ choiceSet: 'choice:feat.fighting-style.fs-and-fs-r', count: 1 }] }])
  })
})
