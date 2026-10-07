// PHASE 2C.2B -- the generic creation content-choice mechanics, in isolation. The
// Fighter is only one consumer: every rule here is driven by a declaration the
// caller supplies, never by a class, choice id, or feat name.

import { describe, expect, it } from 'vitest'
import {
  declaredCreationContentChoices,
  resolveCreationContentChoices,
  type CreationFeatEntry
} from '../../../app/lib/characters/creation-content-choices'
import { resolveCreationChoices, type CreationSlotInput } from '../../../app/lib/characters/creation-choice-eligibility'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import type { CreationSpellEntry } from '../../../app/lib/characters/creation-content-choices'

const PKG = 'eldra.solaris.xphb'
const FS_SELECTOR = { category: 'feats', filter: { category: 'fighting-style', variants: ['FS'] } }
const SKILL_CHOICE = 'choice:skill.proficiency'
const CONTENT_CHOICE = 'choice:feat.fighting-style.fs-only'

// A minimal feat shaped like the corpus (the resolver reads these fields).
function feat(name: string, raw: Record<string, unknown>, rulesFacet?: CreationFeatEntry['rulesFacet']): CreationFeatEntry {
  return {
    packageId: PKG,
    slug: `${name.toLowerCase().replace(/ /g, '-')}-xphb`,
    title: name,
    featMechanics: resolveDnd5eFeatMechanics({ name, source: 'XPHB', ...raw }),
    rulesFacet
  }
}

const ARCHERY = feat('Archery', { category: 'FS', prerequisite: [{ feature: ['Fighting Style'] }] },
  { featureRequirements: [{ feature: 'Fighting Style', requires: 'value:feature.fighting-style' }] })
const DEFENSE = feat('Defense', { category: 'FS', prerequisite: [{ feature: ['Fighting Style'] }] },
  { featureRequirements: [{ feature: 'Fighting Style', requires: 'value:feature.fighting-style' }] })
const BLESSED = feat('Blessed Warrior', { category: 'FS:P', prerequisite: [{ otherSummary: { entry: 'x' } }] })
const ATHLETE = feat('Athlete', { category: 'G', prerequisite: [{ level: 4 }] })
const SPELLFIRE = feat('Spellfire Probe', { category: 'FS', prerequisite: [{ feature: ['Spellcasting'] }] },
  // A mapping for a DIFFERENT raw name must never cover this one.
  { featureRequirements: [{ feature: 'Fighting Style', requires: 'value:feature.fighting-style' }] })
const FEATS = [ARCHERY, DEFENSE, BLESSED, ATHLETE, SPELLFIRE]

const granting = (value: string) => ({ grants: [{ set: value, to: true }] })

describe('declaration -- recognized by the package\'s own selector, never by id or shape', () => {
  it('a content-backed choice is declared; a Definition-backed choice is not', () => {
    const slots = [
      { slot: 'class', facet: { choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }, { choiceSet: SKILL_CHOICE, count: 2 }] } }
    ] as (CreationSlotInput & { slot: string })[]
    const declared = declaredCreationContentChoices(slots, (id) => (id === CONTENT_CHOICE ? FS_SELECTOR : null))
    expect(declared.map((d) => d.choiceSetId)).toEqual([CONTENT_CHOICE])
  })

  it('the declared key is the progression key convention, at creation level 1', () => {
    const slots = [{ slot: 'class', facet: { choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }] } }] as (CreationSlotInput & { slot: string })[]
    const [declared] = declaredCreationContentChoices(slots, () => FS_SELECTOR)
    expect(declared!.key).toBe(progressionChoiceKey('class', 1, CONTENT_CHOICE))
    expect(declared!.key).toBe('class:progression:1:choice:feat.fighting-style.fs-only')
  })
})

describe('Definition choices -- unchanged by the content guard', () => {
  it('resolveCreationChoices with the content predicate skips content sets and keeps Definition sets exactly as before', () => {
    const slots: CreationSlotInput[] = [
      { slot: 'class', facet: { choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }, { choiceSet: SKILL_CHOICE, count: 1, from: ['value:skill.arcana.proficient'] }] } }
    ]
    const withGuard = resolveCreationChoices(slots, {}, (id) => id === CONTENT_CHOICE).map((p) => p.choiceSetId)
    const withoutGuard = resolveCreationChoices(slots, {}).map((p) => p.choiceSetId)
    expect(withGuard).toEqual([SKILL_CHOICE])
    expect(withoutGuard).toEqual([CONTENT_CHOICE, SKILL_CHOICE])
  })
})

describe('authority -- the content presentation uses the shared feat verdict', () => {
  const slotsWithFeature = [{ slot: 'class', facet: { ...granting('value:feature.fighting-style'), choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }] } }] as (CreationSlotInput & { slot: string })[]
  const declared = declaredCreationContentChoices(slotsWithFeature, () => FS_SELECTOR)

  it('the feature Value granted by the creation state makes the ordinary FS feat eligible', () => {
    const [presentation] = resolveCreationContentChoices(declared, slotsWithFeature, {}, FEATS)
    const archery = presentation!.offered.find((o) => o.slug === 'archery-xphb')
    expect(archery).toMatchObject({ eligible: true })
  })

  it('WITHOUT the feature grant the same FS feat is refused (prerequisite-unmet): nothing bypasses the package fact', () => {
    const noGrant = [{ slot: 'class', facet: { choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }] } }] as (CreationSlotInput & { slot: string })[]
    const [presentation] = resolveCreationContentChoices(declared, noGrant, { [progressionChoiceKey('class', 1, CONTENT_CHOICE)]: [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })] }, FEATS)
    expect(presentation!.offered.find((o) => o.slug === 'archery-xphb')).toMatchObject({ eligible: false, reason: 'prerequisite-unmet' })
    expect(presentation!.selected).toEqual([])
    expect(presentation!.valid).toBe(false)
  })

  it('an unmapped raw feature (Spellcasting) stays unsupported even when another raw name is mapped', () => {
    const [presentation] = resolveCreationContentChoices(declared, slotsWithFeature, {}, FEATS)
    // SPELLFIRE is FS-category, so it is offered -- and refused by its unmapped feature.
    expect(presentation!.offered.find((o) => o.slug === 'spellfire-probe-xphb')).toMatchObject({ eligible: false, reason: 'prerequisite-unsupported' })
  })

  it('a wrong-category, wrong-variant, or General feat is never offered at all', () => {
    const [presentation] = resolveCreationContentChoices(declared, slotsWithFeature, {}, FEATS)
    const offered = presentation!.offered.map((o) => o.slug)
    expect(offered).not.toContain('blessed-warrior-xphb')
    expect(offered).not.toContain('athlete-xphb')
  })

  it('an unknown destination category is never valid (fail closed), even with a selection', () => {
    const unknown = [{ key: 'k', slot: 'class', choiceSetId: 'choice:x', count: 1, selector: { category: 'mystery' } }]
    const [presentation] = resolveCreationContentChoices(unknown, slotsWithFeature, { k: ['x'] }, FEATS)
    expect(presentation).toMatchObject({ category: 'mystery', offered: [], selected: [], valid: false })
  })
})

// D&D 2024 Character Rules P2 -- the SAME generic mechanism, routed to 'spells' instead of
// 'feats'. Synthetic spell fixtures here, exactly like ARCHERY/DEFENSE above are synthetic feat
// fixtures: this describe block proves the GENERIC routing/ownership mechanism, not real-corpus
// class-list membership (that is spell-option-eligibility.test.ts's own job, with real spells).
const SPELL_CHOICE = 'choice:spell.selection.test'
const WIZARD_L1_SELECTOR = { category: 'spells', filter: { classList: ['Wizard'], level: 1 } }

function spell(name: string, raw: Record<string, unknown>): CreationSpellEntry {
  return {
    packageId: PKG,
    slug: `${name.toLowerCase().replace(/ /g, '-')}-xphb`,
    title: name,
    spellMechanics: resolveDnd5eSpellMechanics({ name, source: 'XPHB', level: 1, school: 'V', ...raw })
  }
}

const MAGIC_MISSILE = spell('Magic Missile', { classLists: ['Sorcerer', 'Wizard'] })
const CURE_WOUNDS = spell('Cure Wounds', { classLists: ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger'] })
const SPELLS = [MAGIC_MISSILE, CURE_WOUNDS]

describe('authority -- spells category (P2), using the shared spell verdict', () => {
  const slots = [{ slot: 'class', facet: { choices: [{ choiceSet: SPELL_CHOICE, count: 1 }] } }] as (CreationSlotInput & { slot: string })[]
  const declared = declaredCreationContentChoices(slots, () => WIZARD_L1_SELECTOR)

  it('a spell on the declared class list, at the declared level, is offered and eligible', () => {
    const [presentation] = resolveCreationContentChoices(declared, slots, {}, [], SPELLS)
    expect(presentation!.offered.find((o) => o.slug === 'magic-missile-xphb')).toMatchObject({ eligible: true })
  })

  it('a spell NOT on the declared class list is offered but refused (wrong-class-list), never silently omitted', () => {
    const [presentation] = resolveCreationContentChoices(declared, slots, {}, [], SPELLS)
    expect(presentation!.offered.find((o) => o.slug === 'cure-wounds-xphb')).toMatchObject({ eligible: false, reason: 'wrong-class-list' })
  })

  it('a crafted selection of the ineligible spell is rejected, never trusted from the client', () => {
    const [presentation] = resolveCreationContentChoices(
      declared, slots,
      { [declared[0]!.key]: [serializeContentRef({ packageId: PKG, slug: 'cure-wounds-xphb' })] },
      [], SPELLS
    )
    expect(presentation!.selected).toEqual([])
    expect(presentation!.valid).toBe(false)
  })

  it('two spell choices cannot both take the same spell: the later one is refused as already owned', () => {
    const twoSlots = [
      { slot: 'class', facet: { choices: [{ choiceSet: SPELL_CHOICE, count: 1 }] } },
      { slot: 'background', facet: { choices: [{ choiceSet: 'choice:spell.other', count: 1 }] } }
    ] as (CreationSlotInput & { slot: string })[]
    const twoDeclared = declaredCreationContentChoices(twoSlots, () => WIZARD_L1_SELECTOR)
    const missileRef = serializeContentRef({ packageId: PKG, slug: 'magic-missile-xphb' })
    const presentations = resolveCreationContentChoices(twoDeclared, twoSlots, {
      [twoDeclared[0]!.key]: [missileRef],
      [twoDeclared[1]!.key]: [missileRef]
    }, [], SPELLS)
    expect(presentations[0]!.selected).toEqual([missileRef])
    expect(presentations[1]!.selected).toEqual([])
    expect(presentations[1]!.offered.find((o) => o.slug === 'magic-missile-xphb')).toMatchObject({ eligible: false, reason: 'already-owned' })
  })

  it('feats and spells coexist as distinct destinations, with no cross-contamination', () => {
    const mixedSlots = [{
      slot: 'class',
      facet: { ...granting('value:feature.fighting-style'), choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }, { choiceSet: SPELL_CHOICE, count: 1 }] }
    }] as (CreationSlotInput & { slot: string })[]
    const mixedDeclared = declaredCreationContentChoices(
      mixedSlots,
      (id) => (id === CONTENT_CHOICE ? FS_SELECTOR : id === SPELL_CHOICE ? WIZARD_L1_SELECTOR : null)
    )
    const presentations = resolveCreationContentChoices(mixedDeclared, mixedSlots, {}, FEATS, SPELLS)
    expect(presentations.find((p) => p.choiceSetId === CONTENT_CHOICE)!.offered.map((o) => o.slug)).toContain('archery-xphb')
    expect(presentations.find((p) => p.choiceSetId === SPELL_CHOICE)!.offered.map((o) => o.slug)).toContain('magic-missile-xphb')
  })
})

describe('ownership and multiple creation acquisitions', () => {
  it('two declarations cannot both take the same ref: the later one is refused as already owned', () => {
    const slots = [
      { slot: 'class', facet: { ...granting('value:feature.fighting-style'), choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }] } },
      { slot: 'background', facet: { choices: [{ choiceSet: 'choice:feat.other-fs', count: 1 }] } }
    ] as (CreationSlotInput & { slot: string })[]
    const declared = declaredCreationContentChoices(slots, () => FS_SELECTOR)
    const archery = serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })
    const presentations = resolveCreationContentChoices(declared, slots, {
      [declared[0]!.key]: [archery],
      [declared[1]!.key]: [archery]
    }, FEATS)
    expect(presentations[0]!.selected).toEqual([archery])
    expect(presentations[1]!.selected).toEqual([])
    expect(presentations[1]!.offered.find((o) => o.slug === 'archery-xphb')).toMatchObject({ eligible: false, reason: 'already-owned' })
  })

  it('two DISTINCT acquisitions get distinct stable keys (no collision for the future Origin path)', () => {
    const classKey = progressionChoiceKey('class', 1, CONTENT_CHOICE)
    const backgroundKey = progressionChoiceKey('background', 1, 'choice:feat.origin-future')
    expect(classKey).not.toBe(backgroundKey)
    expect(new Set([classKey, backgroundKey]).size).toBe(2)
  })
})
