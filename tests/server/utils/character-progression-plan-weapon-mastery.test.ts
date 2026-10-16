// D&D 2024 Character Rules -- WEAPON MASTERY PROGRESSION (Barbarian Level 4/10, Fighter Level
// 4/10/16). Integration tests through the REAL `planProgression`/`confirmProgression`
// (server/utils/character-progression-plan.ts), proving Preview exposes the growth choice only
// at the correct level, Confirm rejects missing/illegal/duplicate/crafted answers, a valid answer
// persists and the previously-mastered weapons remain owned, a direct Level 1 -> 20 jump requests
// only the real cumulative deficit with no duplicates, a repeated Preview at an already-crossed
// level does not re-request the decision, and a second jump requests only the newly-required
// deficit. No Barbarian/Fighter-specific code exists anywhere in `character-progression-plan.ts`
// -- this file proves the GENERIC `choice:class.weapon-mastery`/`.melee-only` primitive, reused
// verbatim from creation-time authoring.
//
// UNIT-ISOLATION (see tests/helpers/completeness-stub.ts): Phase 0 completeness is stubbed so
// Barbarian's/Fighter's OTHER mandatory decisions never mask the mechanics under test here --
// the same isolation character-progression-plan-feature-option.test.ts's own sibling file
// already uses. Production fail-closed acceptance (Dwarf + Barbarian/Fighter + Criminal through
// the REAL, unstubbed authority) is covered separately, in create-v2-weapon-mastery.test.ts.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../app/lib/content-rules/creation-completeness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../app/lib/content-rules/creation-completeness')>()),
  ...(await import('../../helpers/completeness-stub')).MECHANICS_ONLY_COMPLETENESS
}))

const {
  assembleCharacterMock, getWorldRuntimeMock, saveCharacterProgressionMock,
  loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock,
  listContentPackBindingsForWorldMock, getWorldContentCatalogueMock,
  saveCharacterSpellcastingMock
} = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  saveCharacterProgressionMock: vi.fn(),
  loadCharacterRulesChoicesMock: vi.fn(),
  saveCharacterRulesChoicesMock: vi.fn(),
  listContentPackBindingsForWorldMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn(),
  saveCharacterSpellcastingMock: vi.fn()
}))

vi.mock('../../../server/utils/character-assembly', () => ({ assembleCharacter: assembleCharacterMock }))
vi.mock('../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: getWorldRuntimeMock }))
vi.mock('../../../server/utils/character-progression', () => ({ saveCharacterProgression: saveCharacterProgressionMock }))
vi.mock('../../../server/utils/character-rules-choices', () => ({
  loadCharacterRulesChoices: loadCharacterRulesChoicesMock,
  saveCharacterRulesChoices: saveCharacterRulesChoicesMock
}))
vi.mock('../../../server/utils/world-content-packs', () => ({ listContentPackBindingsForWorld: listContentPackBindingsForWorldMock }))
vi.mock('../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: getWorldContentCatalogueMock }))
vi.mock('../../../server/utils/character-spellcasting', () => ({ saveCharacterSpellcasting: saveCharacterSpellcastingMock }))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eItemMechanics } from '../../../app/lib/item-mechanics/dnd5e'
import { confirmProgression, planProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { normalizeStoredProgression, acquiredItemsFor } from '../../../app/lib/characters/progression'

const WORLD_ID = '5'
const CHARACTER_ID = '42'
const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const PKG = 'eldra.content.xphb'

function hydrate(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(hydrate)
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string' && !record.ast) {
      const parsed = parseExpression(record.text)
      if (!parsed.ok) throw new Error(`Failed to parse: ${record.text}`)
      return { text: record.text, ast: parsed.ast }
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, hydrate(v)]))
  }
  return node
}

function loadRealRuntime() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  const result = createWorldRuntime(manifest, definitions, WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}
const REAL_RUNTIME = loadRealRuntime()

function baseEntry(overrides: Record<string, unknown> = {}) {
  return { packageId: PKG, packageVersion: '1.0.0', systemKey: 'dnd5e', title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json', ...overrides }
}

function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...baseEntry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
// Eight distinct, real-shaped, all-MELEE weapons -- enough to cover Fighter's own cumulative
// total of 6 and Barbarian's own cumulative total of 4, drawn from the SAME shared catalogue.
const WEAPONS = [
  weaponEntry('Dagger', 'dagger-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB', 'T|XPHB'], mastery: ['Nick|XPHB'] }),
  weaponEntry('Club', 'club-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['L|XPHB'], mastery: ['Slow|XPHB'] }),
  weaponEntry('Mace', 'mace-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: [], mastery: ['Sap|XPHB'] }),
  weaponEntry('Spear', 'spear-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['V|XPHB', 'T|XPHB'], mastery: ['Vex|XPHB'] }),
  weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Warhammer', 'warhammer-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Push|XPHB'] }),
  weaponEntry('Battleaxe', 'battleaxe-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Topple|XPHB'] }),
  weaponEntry('Greataxe', 'greataxe-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['H|XPHB', '2H|XPHB'], mastery: ['Cleave|XPHB'] })
]
function weaponRef(index: number) {
  return serializeContentRef({ packageId: WEAPONS[index]!.packageId, slug: WEAPONS[index]!.slug })
}

// Real, production-verified subclass slugs (same fixture character-progression-level-1-to-
// 20.test.ts already uses) -- needed only so the REAL Level-3 Subclass requirement (an
// unrelated, already-proven-working choice this walk also crosses) can be answered.
const REAL_SUBCLASSES_BY_CLASS: Record<string, string[]> = {
  'barbarian-xphb': ['path-of-the-berserker-xphb', 'path-of-the-wild-heart-xphb', 'path-of-the-world-tree-xphb', 'path-of-the-zealot-xphb'],
  'fighter-xphb': ['battle-master-xphb', 'champion-xphb', 'eldritch-knight-xphb', 'psi-warrior-xphb']
}
const ASI_FEAT_REF = { packageId: PKG, slug: 'ability-score-improvement-xphb' }
const EPIC_BOON_REF = { packageId: PKG, slug: 'boon-of-fortitude-xphb' }
// Real per-class ASI cadence (class-barbarian.json/class-fighter.json's own `classFeatures`
// references -- Fighter is a real structural outlier, 4/6/8/12/14/16, not the standard 4/8/12/16).
const ASI_LEVELS_BY_CLASS: Record<string, number[]> = {
  'barbarian-xphb': [4, 8, 12, 16],
  'fighter-xphb': [4, 6, 8, 12, 14, 16]
}
const WEAPON_MASTERY_CHOICE_SET: Record<string, string> = {
  'barbarian-xphb': 'choice:class.weapon-mastery.melee-only',
  'fighter-xphb': 'choice:class.weapon-mastery'
}
// Real per-class growth levels (class-barbarian.json's/class-fighter.json's own classTableGroups,
// verified in tests/rules/dnd5e-2024-weapon-mastery.test.ts).
const GROWTH_LEVELS_BY_CLASS: Record<string, number[]> = {
  'barbarian-xphb': [4, 10],
  'fighter-xphb': [4, 10, 16]
}

function catalogueFor() {
  const subclasses = Object.entries(REAL_SUBCLASSES_BY_CLASS).flatMap(([classSlug, slugs]) =>
    slugs.map((slug) => baseEntry({ title: slug, slug, parentClassSlug: classSlug }))
  )
  const feats = [
    baseEntry({
      title: 'Ability Score Improvement',
      slug: 'ability-score-improvement-xphb',
      featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: true, prerequisiteGroups: [] },
      rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'ability-score-improvement-xphb') ?? undefined
    }),
    baseEntry({
      title: 'Boon of Fortitude',
      slug: 'boon-of-fortitude-xphb',
      featMechanics: { category: 'epic-boon', variant: 'EB', unsupportedPrerequisites: [], repeatable: false, prerequisiteGroups: [] },
      rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'boon-of-fortitude-xphb') ?? undefined
    })
  ]
  return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats, items: WEAPONS, spells: [], monsters: [], subclasses }
}

function blueprintForClass(classSlug: string, input: { level?: number; rulesChoices?: { selections: Record<string, string[]> } | null } = {}) {
  return {
    worldId: WORLD_ID,
    characterId: CHARACTER_ID,
    characterTitle: 'Weapon Mastery Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: classSlug, slug: classSlug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', classSlug) ?? undefined }) },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 10 } },
    rulesChoices: input.rulesChoices ?? null,
    inventory: [], notes: null, health: null,
    spells: [], expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: classSlug }, level: input.level ?? 1, subclassRef: null }], items: [] },
    resources: null, packs: []
  }
}

function useFixture(classSlug: string, input: Parameters<typeof blueprintForClass>[1] = {}) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintForClass(classSlug, input) })
}

// Every OTHER real, already-proven-working mandatory choice a multi-level Barbarian/Fighter walk
// also crosses -- the Level-3 Subclass choice and the real per-class ASI cadence -- answered
// purely so Confirm's "the WHOLE plan must be valid" gate is satisfied, letting these tests
// isolate Weapon Mastery growth mechanics specifically. Weapon Mastery growth answers are built
// SEPARATELY (see `weaponMasteryAnswers`) since they are additive and cumulative, unlike these.
function nonWeaponAnswers(classSlug: string, toLevel: number): Record<string, string[]> {
  const answers: Record<string, string[]> = {}
  if (toLevel >= 3) {
    const subclassSlug = REAL_SUBCLASSES_BY_CLASS[classSlug]![0]!
    answers[progressionChoiceKey('class', 3, 'choice:class.subclass')] = [serializeContentRef({ packageId: PKG, slug: subclassSlug })]
  }
  // D&D 2024 Character Rules A1 -- Barbarian's own real Primal Knowledge (Level 3): this
  // fixture's own rulesChoices is null (no Level-1 skill-proficiency answer on record), so
  // nothing is yet proficient and any one of the real 6-skill list is legal here.
  if (toLevel >= 3 && classSlug === 'barbarian-xphb') {
    answers[progressionChoiceKey('class', 3, 'choice:skill.proficiency')] = ['value:skill.athletics.proficient']
  }
  for (const asiLevel of ASI_LEVELS_BY_CLASS[classSlug]!) {
    if (toLevel < asiLevel) continue
    const featKey = progressionChoiceKey('class', asiLevel, 'choice:feat.selection')
    answers[featKey] = [serializeContentRef(ASI_FEAT_REF)]
    answers[`feat:${featKey}:choice:feat.asi-ability-increase`] = ['source:asi.increase.str', 'source:asi.increase.con']
  }
  if (toLevel >= 19) {
    const boonKey = progressionChoiceKey('class', 19, 'choice:feat.epic-boon')
    answers[boonKey] = [serializeContentRef(EPIC_BOON_REF)]
    answers[`feat:${boonKey}:choice:feat.epic-boon-ability`] = ['source:asi.increase.con']
  }
  return answers
}

// The additive, cumulative Weapon Mastery growth answers for every real growth level up to
// `toLevel` -- each row's own answer is the NEXT, not-yet-used weapon(s), so the cumulative
// total across every row is always correct and never duplicates an earlier pick.
function weaponMasteryAnswers(classSlug: string, toLevel: number, startIndex = 0): Record<string, string[]> {
  const choiceSetId = WEAPON_MASTERY_CHOICE_SET[classSlug]!
  const answers: Record<string, string[]> = {}
  let index = startIndex
  for (const level of GROWTH_LEVELS_BY_CLASS[classSlug]!) {
    if (toLevel < level) continue
    answers[progressionChoiceKey('class', level, choiceSetId)] = [weaponRef(index)]
    index++
  }
  return answers
}

beforeEach(() => {
  for (const mock of [assembleCharacterMock, getWorldRuntimeMock, saveCharacterProgressionMock, loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock, listContentPackBindingsForWorldMock, getWorldContentCatalogueMock, saveCharacterSpellcastingMock]) mock.mockReset()
  getWorldRuntimeMock.mockResolvedValue({ configured: true, ok: true, runtime: REAL_RUNTIME, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  saveCharacterSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

describe.each([
  ['barbarian-xphb', 2, 4],
  ['fighter-xphb', 3, 6]
] as const)('WEAPON MASTERY GROWTH -- %s (creation %i, Level-20 total %i)', (classSlug, creationCount, totalAt20) => {
  const choiceSetId = WEAPON_MASTERY_CHOICE_SET[classSlug]!
  const growthLevels = GROWTH_LEVELS_BY_CLASS[classSlug]!
  const firstGrowthLevel = growthLevels[0]!

  it('PREVIEW -- the growth choice does not appear before its real level', async () => {
    useFixture(classSlug, { level: 1 })
    const toLevel = firstGrowthLevel - 1
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, toLevel, nonWeaponAnswers(classSlug, toLevel))
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds.some((id) => id.includes(choiceSetId))).toBe(false)
  })

  it('PREVIEW -- the growth choice appears exactly at its real level (and is answered once a legal answer is supplied)', async () => {
    useFixture(classSlug, { level: 1 })
    const key = progressionChoiceKey('class', firstGrowthLevel, choiceSetId)
    const unanswered = await planProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, nonWeaponAnswers(classSlug, firstGrowthLevel))
    expect(unanswered.ok).toBe(true)
    if (!unanswered.ok) return
    expect(unanswered.plan.unresolvedChoiceIds).toContain(key)

    const answered = await planProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, {
      ...nonWeaponAnswers(classSlug, firstGrowthLevel), ...weaponMasteryAnswers(classSlug, firstGrowthLevel)
    })
    expect(answered.ok).toBe(true)
    if (!answered.ok) return
    expect(answered.plan.unresolvedChoiceIds).not.toContain(key)
    expect(answered.plan.valid).toBe(true)
  })

  it('REJECTION -- missing the growth answer refuses Confirm, zero writes', async () => {
    useFixture(classSlug, { level: 1 })
    const answers = nonWeaponAnswers(classSlug, firstGrowthLevel)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  // The creation-time weapon is excluded from the growth row's own OFFERED options already, at
  // Preview (ownedElsewhere, item-mechanics/eligibility.ts) -- resubmitting it therefore never
  // reads as "answered," and Confirm's own ordinary unresolved-choices gate refuses it before
  // ever reaching the dedicated item-acquisition validation block (a defense-in-depth backstop
  // for a stale/bypassed plan, not the path an ordinary resubmission takes). Zero writes either
  // way.
  it('REJECTION -- a duplicate of the creation-time weapon is never offered, so it is rejected with zero writes', async () => {
    useFixture(classSlug, { level: 1, rulesChoices: null })
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: { ...blueprintForClass(classSlug, { level: 1 }), progression: { classes: [{ classRef: { packageId: PKG, slug: classSlug }, level: 1, subclassRef: null }], items: [{ itemRef: { packageId: PKG, slug: WEAPONS[0]!.slug }, choiceKey: progressionChoiceKey('class', 1, choiceSetId) }] } }
    })
    const answers = { ...nonWeaponAnswers(classSlug, firstGrowthLevel), [progressionChoiceKey('class', firstGrowthLevel, choiceSetId)]: [weaponRef(0)] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const growthKey = progressionChoiceKey('class', firstGrowthLevel, choiceSetId)
    const step = plan.plan.steps.find((s) => s.level === firstGrowthLevel)!
    const choice = step.requiredChoices.find((c) => c.id === growthKey)!
    expect(choice.options).not.toContain(weaponRef(0))
    expect(choice.answered).toBe(false)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('REJECTION -- an unresolvable ContentRef is rejected at Confirm, zero writes', async () => {
    useFixture(classSlug, { level: 1 })
    const answers = { ...nonWeaponAnswers(classSlug, firstGrowthLevel), [progressionChoiceKey('class', firstGrowthLevel, choiceSetId)]: [`${PKG}::not-a-real-weapon-xphb`] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
  })

  it('SUCCESS -- a valid growth answer persists, previously-mastered weapons (none yet) remain owned', async () => {
    useFixture(classSlug, { level: 1 })
    const answers = { ...nonWeaponAnswers(classSlug, firstGrowthLevel), ...weaponMasteryAnswers(classSlug, firstGrowthLevel) }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, firstGrowthLevel, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(acquiredItemsFor(result.progression, choiceSetId)).toHaveLength(1)
  })

  it('DIRECT JUMP -- Level 1 -> 20 ends with the real cumulative total, no duplicates', async () => {
    useFixture(classSlug, { level: 1 })
    const answers = { ...nonWeaponAnswers(classSlug, 20), ...weaponMasteryAnswers(classSlug, 20) }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 20, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 20, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const owned = acquiredItemsFor(result.progression, choiceSetId)
    expect(owned).toHaveLength(totalAt20 - creationCount)
    const uniqueSlugs = new Set(owned.map((o) => o.slug))
    expect(uniqueSlugs.size).toBe(owned.length)
  })

  it('REPEAT PREVIEW -- after confirming through the first growth level, a fresh preview to a LATER already-answered level does not re-request it', async () => {
    const answeredSelections = { [progressionChoiceKey('class', firstGrowthLevel, choiceSetId)]: [weaponRef(0)] }
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: { ...blueprintForClass(classSlug, { level: firstGrowthLevel }), rulesChoices: { selections: {} }, progression: { classes: [{ classRef: { packageId: PKG, slug: classSlug }, level: firstGrowthLevel, subclassRef: { packageId: PKG, slug: REAL_SUBCLASSES_BY_CLASS[classSlug]![0]! } }], items: [{ itemRef: { packageId: PKG, slug: WEAPONS[0]!.slug }, choiceKey: progressionChoiceKey('class', firstGrowthLevel, choiceSetId) }] } }
    })
    const nextLevel = firstGrowthLevel + 1
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, nextLevel, {})
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).not.toContain(progressionChoiceKey('class', firstGrowthLevel, choiceSetId))
  })

  if (growthLevels.length > 1) {
    it('SECOND JUMP -- after confirming through the first growth level, a later jump requests only the newly-required deficit', async () => {
      const secondGrowthLevel = growthLevels[1]!
      getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
      assembleCharacterMock.mockResolvedValue({
        available: true,
        blueprint: { ...blueprintForClass(classSlug, { level: firstGrowthLevel }), progression: { classes: [{ classRef: { packageId: PKG, slug: classSlug }, level: firstGrowthLevel, subclassRef: { packageId: PKG, slug: REAL_SUBCLASSES_BY_CLASS[classSlug]![0]! } }], items: [{ itemRef: { packageId: PKG, slug: WEAPONS[0]!.slug }, choiceKey: progressionChoiceKey('class', firstGrowthLevel, choiceSetId) }] } }
      })
      const secondKey = progressionChoiceKey('class', secondGrowthLevel, choiceSetId)
      const firstKey = progressionChoiceKey('class', firstGrowthLevel, choiceSetId)

      // Unanswered: only the SECOND level's own growth choice is requested -- the FIRST level's
      // own choice, already confirmed, is never re-requested (never appears as a step at all,
      // since `planProgression` only walks levels strictly above the character's current level).
      const unanswered = await planProgression(WORLD_ID, CHARACTER_ID, secondGrowthLevel, nonWeaponAnswers(classSlug, secondGrowthLevel))
      expect(unanswered.ok).toBe(true)
      if (!unanswered.ok) return
      expect(unanswered.plan.unresolvedChoiceIds).toContain(secondKey)
      expect(unanswered.plan.unresolvedChoiceIds).not.toContain(firstKey)
      expect(unanswered.plan.steps.some((s) => s.level === firstGrowthLevel)).toBe(false)

      const answers = { ...nonWeaponAnswers(classSlug, secondGrowthLevel), [secondKey]: [weaponRef(1)] }
      const plan = await planProgression(WORLD_ID, CHARACTER_ID, secondGrowthLevel, answers)
      expect(plan.ok).toBe(true)
      if (!plan.ok) return
      expect(plan.plan.valid).toBe(true)
      const result = await confirmProgression(WORLD_ID, CHARACTER_ID, secondGrowthLevel, plan.plan.fingerprint, answers)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const owned = acquiredItemsFor(result.progression, choiceSetId)
      expect(owned).toHaveLength(2)
      expect(new Set(owned.map((o) => o.slug)).size).toBe(2)
    })
  }
})

describe('PALADIN / RANGER / ROGUE -- no later mandatory Weapon Mastery growth', () => {
  it.each(['paladin-xphb', 'ranger-xphb', 'rogue-xphb'])('%s crossing Level 1 -> 20 never requires a second Weapon Mastery answer', async (classSlug) => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: { ...blueprintForClass('barbarian-xphb', { level: 1 }), class: { status: 'resolved' as const, entry: baseEntry({ title: classSlug, slug: classSlug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', classSlug) ?? undefined }) }, progression: { classes: [{ classRef: { packageId: PKG, slug: classSlug }, level: 1, subclassRef: null }], items: [] } }
    })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 20, {})
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds.some((id) => id.includes('weapon-mastery'))).toBe(false)
  })
})
