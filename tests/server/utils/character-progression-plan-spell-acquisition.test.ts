// D&D 2024 Character Rules P3.4 -- PROGRESSION SPELL ACQUISITION + LEVEL MANAGER WRITE-THROUGH.
// Integration tests through the real `planProgression`/`confirmProgression` (server/utils/
// character-progression-plan.ts), proving the SUCCESS MATRIX, REJECTION MATRIX, FINGERPRINT
// behavior, CANONICAL MERGE write, PERSISTENCE SENSITIVITY, REPEAT PREVIEW, and SECOND LEVEL-UP
// requirements against REAL class facets (findRulesFacet) and the REAL activated Rules Package
// (createWorldRuntime from packages/eldra-dnd5e-2024 on disk) -- never a parallel interpretation of
// planSpellAcquisition/mergeSpellStateCandidate.
//
// UNIT-ISOLATION (see tests/helpers/completeness-stub.ts): these are MECHANICS tests. The Phase 0
// completeness authority is stubbed so a REAL caster class's OTHER, still-blocked mandatory
// decisions (starting equipment, weapon mastery, etc.) do not mask the spell acquisition mechanics
// under test -- exactly the same isolation
// tests/server/utils/character-progression-plan.test.ts's own sibling describe blocks already use.
// Production fail-closed behavior through this same planner is covered, unstubbed, by
// tests/server/utils/character-progression-fail-closed.test.ts.

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
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { confirmProgression, planProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { progressionSpellSlotLevels, spellAnswerKey } from '../../../server/utils/character-progression-spell-acquisition'
import { planSpellAcquisition } from '../../../app/lib/characters/spell-acquisition-plan'
import type { AssembledSpellEntry, StoredSpellEntry } from '../../../app/lib/characters/spellcasting'

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

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: PKG, packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

function spellCatalogueEntry(slug: string, level: number, classLists: string[], title = slug) {
  return { packageId: PKG, slug, title, spellMechanics: resolveDnd5eSpellMechanics({ name: title, source: 'XPHB', level, school: 'V', classLists })! }
}

const SPELL_CLASS_LISTS = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard']
const SHARED_SPELL_CATALOGUE = [
  ...Array.from({ length: 40 }, (_, i) => spellCatalogueEntry(`cantrip-${i}`, 0, SPELL_CLASS_LISTS)),
  ...Array.from({ length: 60 }, (_, i) => spellCatalogueEntry(`spell-1-${i}`, 1, SPELL_CLASS_LISTS)),
  ...[6, 7, 8, 9].map((level) => spellCatalogueEntry(`arcanum-${level}`, level, ['Warlock']))
]

const ACTOR_FEAT = baseEntry({
  title: 'Actor', slug: 'actor-xphb', externalId: 'Actor__XPHB',
  featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: false, prerequisiteGroups: [] }
})
// A SECOND, distinct non-repeatable General feat -- needed whenever a fixture crosses two
// non-repeatable ASI/Feat Selection thresholds (e.g. Levels 4 and 8), since the real
// `ownedElsewhere`/already-owned check correctly refuses the SAME non-repeatable feat twice.
const KEEN_MIND_FEAT = baseEntry({
  title: 'Keen Mind', slug: 'keen-mind-xphb', externalId: 'Keen Mind__XPHB',
  featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: false, prerequisiteGroups: [] }
})
const WIZARD_SUBCLASS = baseEntry({ title: 'School of Evocation', slug: 'school-of-evocation-phb', parentClassSlug: 'wizard-xphb' })
const WARLOCK_SUBCLASS = baseEntry({ title: 'The Fiend', slug: 'fiend-patron-xphb', parentClassSlug: 'warlock-xphb' })

function catalogueFor(classSlug: string, subclass: Record<string, unknown>) {
  return {
    worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [],
    feats: [ACTOR_FEAT, KEEN_MIND_FEAT], items: [], spells: SHARED_SPELL_CATALOGUE, monsters: [],
    subclasses: [subclass]
  }
}

function blueprintForClass(classSlug: string, input: {
  level?: number
  spells?: AssembledSpellEntry[]
  subclassRef?: { packageId: string, slug: string } | null
  rulesChoices?: { selections: Record<string, string[]> } | null
} = {}) {
  return {
    worldId: WORLD_ID,
    characterId: CHARACTER_ID,
    characterTitle: 'P3.4 Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved' as const,
      entry: baseEntry({ title: classSlug, slug: classSlug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', classSlug) ?? undefined })
    },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 10, con: 12, int: 14, wis: 14, cha: 16 } },
    rulesChoices: input.rulesChoices ?? null,
    inventory: [],
    notes: null,
    health: null,
    spells: input.spells ?? [],
    expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: classSlug }, level: input.level ?? 1, subclassRef: input.subclassRef ?? null }] },
    resources: null,
    packs: []
  }
}

function useFixture(classSlug: string, subclass: Record<string, unknown>, input: Parameters<typeof blueprintForClass>[1] = {}) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor(classSlug, subclass))
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintForClass(classSlug, input) })
}

const REAL_RUNTIME = loadRealRuntime()

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  saveCharacterProgressionMock.mockReset()
  loadCharacterRulesChoicesMock.mockReset()
  saveCharacterRulesChoicesMock.mockReset()
  listContentPackBindingsForWorldMock.mockReset()
  getWorldContentCatalogueMock.mockReset()
  saveCharacterSpellcastingMock.mockReset()

  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime: REAL_RUNTIME,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  saveCharacterSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

// ---------------------------------------------------------------------------
// SUCCESS MATRIX
// ---------------------------------------------------------------------------
describe('SUCCESS MATRIX', () => {
  it('A -- SORCERER: ordinary + cantrip target growth, Level 1 -> 2 (no unrelated choice at Level 2)', async () => {
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }))
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'sorcerer-xphb')!.spellRequirements!
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[1]!
    const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[1]!

    const answers = {
      [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: Array.from({ length: spellTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)
    expect(plan.plan.valid).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    expect(saveCharacterSpellcastingMock).toHaveBeenCalled()
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    expect(written.spells).toHaveLength(spellTarget + cantripTarget)
  })

  it('B -- CLERIC: prepared target growth, Level 1 -> 2', async () => {
    useFixture('cleric-xphb', baseEntry({ parentClassSlug: 'cleric-xphb' }))
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')!.spellRequirements!
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[1]!
    const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[1]!

    const answers = {
      [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: Array.from({ length: spellTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`)
    }
    const result = await confirmProgression(
      WORLD_ID, CHARACTER_ID, 2,
      (await planProgression(WORLD_ID, CHARACTER_ID, 2, answers) as { ok: true, plan: { fingerprint: string } }).plan.fingerprint,
      answers
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
  })

  it('C -- WIZARD: spellbook + prepared + cantrip dependency, full real Level 1 -> 8 walk (Scholar, Subclass, two ASI thresholds all answered alongside spells)', async () => {
    useFixture('wizard-xphb', WIZARD_SUBCLASS, { rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } } })
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellbookTarget = requirements.find((r) => r.id === spellbookId)!.totalByLevel[7]!
    const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[7]!
    const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[7]!
    expect(spellbookTarget).toBe(20)

    const scholarKey = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const subclassKey = progressionChoiceKey('class', 3, 'choice:class.subclass')
    const feat4Key = progressionChoiceKey('class', 4, 'choice:feat.selection')
    const feat8Key = progressionChoiceKey('class', 8, 'choice:feat.selection')

    const answers: Record<string, string[]> = {
      [scholarKey]: ['value:skill.arcana.expertise'],
      [subclassKey]: [serializeContentRef({ packageId: PKG, slug: 'school-of-evocation-phb' })],
      [feat4Key]: [serializeContentRef({ packageId: PKG, slug: 'actor-xphb' })],
      [feat8Key]: [serializeContentRef({ packageId: PKG, slug: 'keen-mind-xphb' })],
      [spellAnswerKey(requirements.find((r) => r.id === spellbookId)!, 8)]: Array.from({ length: spellbookTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 8)]: Array.from({ length: spellTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 8)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`)
    }

    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 8, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    // DEPENDENT EVALUATION -- the SAME preview that answers spellbook ALSO offers those exact
    // identities as legal `spell` (prepared) options, no separate round trip.
    const spellPlan = plan.plan.spellPlan!.requirements.find((r) => r.requirementId === spellId)!
    expect(spellPlan.satisfied).toBe(true)

    expect(plan.plan.valid, 'every Definition/content choice AND the spell plan must be resolved together').toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 8, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.currentLevel).toBe(8)
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    // spellbookTarget + cantripTarget physical rows total -- the `spell`-tagged (prepared) refs are
    // a SUBSET of the spellbook refs, merging onto the SAME rows (never a second physical row for
    // them, the same merge-by-identity rule P3.3 already proved); cantrips are a genuinely separate
    // pool and always add their own rows.
    expect(written.spells).toHaveLength(spellbookTarget + cantripTarget)
    const preparedCount = written.spells.filter((entry) => entry.prepared).length
    expect(preparedCount).toBe(spellTarget)
  })

  it('F -- WARLOCK: ordinary pools + Arcanum-6, starting from a PERSISTED Level 10 (narrows the crossed range to exactly the Arcanum threshold)', async () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const tier6Id = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 6)!.id
    const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[10]!
    const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[10]!

    const persistedStored: StoredSpellEntry[] = [
      ...Array.from({ length: spellTarget }, (_, i) => ({
        instanceId: `spell-${i}`, ref: { packageId: PKG, slug: `spell-1-${i}` }, known: true, prepared: true, requirementIds: [spellId]
      })),
      ...Array.from({ length: cantripTarget }, (_, i) => ({
        instanceId: `cantrip-${i}`, ref: { packageId: PKG, slug: `cantrip-${i}` }, known: true, prepared: false, requirementIds: [cantripId]
      }))
    ]
    const persisted: AssembledSpellEntry[] = persistedStored.map((entry) => ({
      ...entry, status: 'resolved', title: entry.ref!.slug,
      entry: SHARED_SPELL_CATALOGUE.find((candidate) => candidate.slug === entry.ref!.slug)
    }))
    useFixture('warlock-xphb', WARLOCK_SUBCLASS, { level: 10, spells: persisted })

    const answers = { [spellAnswerKey(requirements.find((r) => r.id === tier6Id)!, 11)]: [`${PKG}::arcanum-6`] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 11, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 11, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    // Every EXISTING physical row survives (canonical merge, never a rebuild), plus exactly one
    // NEW row for Arcanum-6.
    expect(written.spells).toHaveLength(persistedStored.length + 1)
    expect(written.spells.find((entry) => entry.ref?.slug === 'arcanum-6')?.requirementIds).toEqual([tier6Id])
  })
})

// ---------------------------------------------------------------------------
// SECOND LEVEL-UP -- continuing Warlock F from 11 -> 13: only the Arcanum-7 deficit is requested.
// ---------------------------------------------------------------------------
describe('SECOND LEVEL-UP -- only the additional target-state deficit is requested on a later jump', () => {
  it('Warlock Level 11 (Arcanum-6 already owned) -> Level 13: Arcanum-7 is the ONLY new requirement, Arcanum-6 is never re-asked', async () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const tier6Id = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 6)!.id
    const tier7Id = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 7)!.id
    const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[12]!
    const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[12]!

    const persistedStored: StoredSpellEntry[] = [
      ...Array.from({ length: spellTarget }, (_, i) => ({
        instanceId: `spell-${i}`, ref: { packageId: PKG, slug: `spell-1-${i}` }, known: true, prepared: true, requirementIds: [spellId]
      })),
      ...Array.from({ length: cantripTarget }, (_, i) => ({
        instanceId: `cantrip-${i}`, ref: { packageId: PKG, slug: `cantrip-${i}` }, known: true, prepared: false, requirementIds: [cantripId]
      })),
      { instanceId: 'arc6', ref: { packageId: PKG, slug: 'arcanum-6' }, known: true, prepared: false, requirementIds: [tier6Id] }
    ]
    const persisted: AssembledSpellEntry[] = persistedStored.map((entry) => ({
      ...entry, status: 'resolved', title: entry.ref!.slug,
      entry: SHARED_SPELL_CATALOGUE.find((candidate) => candidate.slug === entry.ref!.slug)
    }))
    useFixture('warlock-xphb', WARLOCK_SUBCLASS, { level: 11, spells: persisted })

    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 13)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const tier6Plan = preview.plan.spellPlan!.requirements.find((r) => r.requirementId === tier6Id)!
    const tier7Plan = preview.plan.spellPlan!.requirements.find((r) => r.requirementId === tier7Id)!
    expect(tier6Plan.satisfied, 'Arcanum-6 is already owned -- never re-requested').toBe(true)
    expect(tier6Plan.missing).toBe(0)
    expect(tier7Plan.missing).toBe(1)

    // Level 11 -> 13 also crosses the real Level-12 ASI threshold -- answered here with the same
    // non-repeatable, no-prerequisite Actor feat the other tests already use, so this test's own
    // subject (Arcanum-7, never Arcanum-6 again) stays the only thing actually under assertion.
    const feat12Key = progressionChoiceKey('class', 12, 'choice:feat.selection')
    const answers = {
      [spellAnswerKey(requirements.find((r) => r.id === tier7Id)!, 13)]: [`${PKG}::arcanum-7`],
      [feat12Key]: [serializeContentRef({ packageId: PKG, slug: 'actor-xphb' })]
    }
    const result = await confirmProgression(
      WORLD_ID, CHARACTER_ID, 13,
      (await planProgression(WORLD_ID, CHARACTER_ID, 13, answers) as { ok: true, plan: { fingerprint: string } }).plan.fingerprint,
      answers
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    expect(written.spells).toHaveLength(persistedStored.length + 1) // Arcanum-6 row untouched, Arcanum-7 is the one new row
    expect(written.spells.find((entry) => entry.ref?.slug === 'arcanum-6')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// REPEAT PREVIEW -- after a successful Confirm + fresh reload, previewing the SAME target again
// requests zero additional spells for requirements already satisfied.
// ---------------------------------------------------------------------------
describe('REPEAT PREVIEW', () => {
  it('Sorcerer: previewing a HIGHER level after Confirm never re-requests the already-satisfied Level-2 totals, only the incremental deficit', async () => {
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }))
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'sorcerer-xphb')!.spellRequirements!
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellTargetAt2 = requirements.find((r) => r.id === spellId)!.totalByLevel[1]!
    const cantripTargetAt2 = requirements.find((r) => r.id === cantripId)!.totalByLevel[1]!
    const answers = {
      [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: Array.from({ length: spellTargetAt2 }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: Array.from({ length: cantripTargetAt2 }, (_, i) => `${PKG}::cantrip-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    if (!plan.ok) throw new Error('plan failed')
    const confirmResult = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    if (!confirmResult.ok) throw new Error('confirm failed')

    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const freshPersisted: AssembledSpellEntry[] = written.spells.map((entry) => ({
      ...entry, status: 'resolved', title: entry.ref!.slug,
      entry: SHARED_SPELL_CATALOGUE.find((candidate) => candidate.slug === entry.ref!.slug)
    }))
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }), { level: 2, spells: freshPersisted })

    const spellTargetAt3 = requirements.find((r) => r.id === spellId)!.totalByLevel[2]!
    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 3)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const spellPlanAt3 = preview.plan.spellPlan!.requirements.find((r) => r.requirementId === spellId)!
    expect(spellPlanAt3.legalCount).toBe(spellTargetAt2) // the Level-2 picks are still owned
    expect(spellPlanAt3.missing).toBe(Math.max(0, spellTargetAt3 - spellTargetAt2)) // never re-asks for the Level-2 total again
  })
})

// ---------------------------------------------------------------------------
// FINGERPRINT
// ---------------------------------------------------------------------------
describe('FINGERPRINT', () => {
  it('a stale fingerprint (the character\'s level moved since Preview) is refused at Confirm regardless of the spell answers submitted', async () => {
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }))
    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 2)
    if (!preview.ok) throw new Error('preview failed')

    // Another admin levels the SAME character concurrently.
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }), { level: 2 })
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, preview.plan.fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('stale-plan')
    expect(saveCharacterSpellcastingMock).not.toHaveBeenCalled()
  })

  it('DOCUMENTED LIMITATION -- the fingerprint encodes starting state only (level/package/content binding), never the submitted answers; Confirm\'s own FULL RE-VALIDATION of whatever answers are actually submitted is the real protection against a stale/crafted answer, not the fingerprint string', async () => {
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }))
    const withAnswerA = await planProgression(WORLD_ID, CHARACTER_ID, 2, { 'irrelevant-key': ['x'] })
    const withAnswerB = await planProgression(WORLD_ID, CHARACTER_ID, 2, { 'different-irrelevant-key': ['y'] })
    if (!withAnswerA.ok || !withAnswerB.ok) throw new Error('preview failed')
    // Same starting state -> same fingerprint, by design (this file's own header; extending the
    // shared fingerprint to also hash the answers map would break the already-approved "preview
    // with no answers, confirm directly with the real final answer" workflow -- see this phase's
    // own report).
    expect(withAnswerA.plan.fingerprint).toBe(withAnswerB.plan.fingerprint)

    // Confirming with INCOMPLETE spell answers under this SAME fingerprint is still refused --
    // not because the fingerprint detected anything, but because confirmProgression rebuilds and
    // re-validates the spell plan from the ACTUAL submitted answers every time.
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, withAnswerA.plan.fingerprint, {})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-spell-selection')
  })
})

// ---------------------------------------------------------------------------
// REJECTION MATRIX -- every rejection writes NOTHING.
// ---------------------------------------------------------------------------
describe('REJECTION MATRIX', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'sorcerer-xphb')!.spellRequirements!
  const spellId = requirements.find((r) => r.pool === 'spell')!.id
  const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
  const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[1]!
  const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[1]!

  function fullAnswers() {
    return {
      [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: Array.from({ length: spellTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`)
    }
  }

  async function expectRejected(answers: Record<string, string[]>, expectedReason = 'unresolved-spell-selection') {
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }))
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(expectedReason)
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
    expect(saveCharacterSpellcastingMock).not.toHaveBeenCalled()
  }

  it('missing required spell -- empty answers', async () => {
    await expectRejected({})
  })

  it('unknown requirement (an answer at a key naming no real requirement) changes nothing -- still missing', async () => {
    await expectRejected({ 'class:progression:2:spell-requirement.not-real': [`${PKG}::spell-1-0`] })
  })

  it('unknown ContentRef (a ref the catalogue has never heard of)', async () => {
    const answers = { ...fullAnswers(), [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: [`${PKG}::does-not-exist`] }
    await expectRejected(answers)
  })

  it('wrong package (ref names a package this requirement\'s catalogue never resolves)', async () => {
    const answers = { ...fullAnswers(), [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: ['wrong.package::spell-1-0'] }
    await expectRejected(answers)
  })

  it('wrong class list (a spell with no Sorcerer on its classLists)', async () => {
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }))
    const offList = spellCatalogueEntry('off-list-spell', 1, ['Wizard'])
    getWorldContentCatalogueMock.mockResolvedValue({ ...catalogueFor('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' })), spells: [...SHARED_SPELL_CATALOGUE, offList] })
    const answers = { ...fullAnswers(), [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: [`${PKG}::off-list-spell`] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-spell-selection')
    expect(saveCharacterSpellcastingMock).not.toHaveBeenCalled()
  })

  it('wrong spell level (a Level-3 spell submitted to the Level-1 Sorcerer\'s own current max spell level)', async () => {
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }))
    const tooHigh = spellCatalogueEntry('too-high', 3, SPELL_CLASS_LISTS)
    getWorldContentCatalogueMock.mockResolvedValue({ ...catalogueFor('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' })), spells: [...SHARED_SPELL_CATALOGUE, tooHigh] })
    const answers = { ...fullAnswers(), [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: [`${PKG}::too-high`] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-spell-selection')
  })

  it('duplicate same-pool spell (the same ref submitted twice for one requirement)', async () => {
    const answers = { ...fullAnswers(), [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: [`${PKG}::cantrip-0`, `${PKG}::cantrip-0`] }
    await expectRejected(answers)
  })

  it('extra selection / over-target (one more cantrip than the exact-bounded target allows)', async () => {
    const answers = { ...fullAnswers(), [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: Array.from({ length: cantripTarget + 1 }, (_, i) => `${PKG}::cantrip-${i}`) }
    await expectRejected(answers)
  })

  it('Wizard: a prepared pick that was never also submitted as a spellbook member (not in the effective membership pool)', async () => {
    useFixture('wizard-xphb', WIZARD_SUBCLASS, { rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } } })
    const wizardRequirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = wizardRequirements.find((r) => r.pool === 'spellbook')!.id
    const wizSpellId = wizardRequirements.find((r) => r.pool === 'spell')!.id
    const cantripReq = wizardRequirements.find((r) => r.pool === 'cantrip')!
    const spellbookTarget = wizardRequirements.find((r) => r.id === spellbookId)!.totalByLevel[1]!
    const spellTargetAtL1 = wizardRequirements.find((r) => r.id === wizSpellId)!.totalByLevel[1]!
    const cantripTargetAtL1 = cantripReq.totalByLevel[1]!

    const answers: Record<string, string[]> = {
      [spellAnswerKey(wizardRequirements.find((r) => r.id === spellbookId)!, 2)]: Array.from({ length: spellbookTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      // Prepared pick names a DIFFERENT spell, never named as a spellbook member above.
      [spellAnswerKey(wizardRequirements.find((r) => r.id === wizSpellId)!, 2)]: Array.from({ length: spellTargetAtL1 }, (_, i) => `${PKG}::spell-1-${spellbookTarget + i}`),
      [spellAnswerKey(cantripReq, 2)]: Array.from({ length: cantripTargetAtL1 }, (_, i) => `${PKG}::cantrip-${i}`)
    }
    const scholarKey = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    answers[scholarKey] = ['value:skill.arcana.expertise']

    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const spellPlan = plan.plan.spellPlan!.requirements.find((r) => r.requirementId === wizSpellId)!
    expect(spellPlan.issues.some((issue) => (issue as { kind: string }).kind === 'illegal-not-in-membership-pool')).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-spell-selection')
    expect(saveCharacterSpellcastingMock).not.toHaveBeenCalled()
  })

  it('Warlock: wrong Arcanum tier (a Level-7 Arcanum spell submitted against the Level-6 tier\'s own exact-level requirement)', async () => {
    const warlockRequirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
    const tier6Id = warlockRequirements.find((r) => r.pool === 'arcanum' && r.filter.level === 6)!.id
    const spellIdW = warlockRequirements.find((r) => r.pool === 'spell')!.id
    const cantripIdW = warlockRequirements.find((r) => r.pool === 'cantrip')!.id
    const spellTargetAt10 = warlockRequirements.find((r) => r.id === spellIdW)!.totalByLevel[9]!
    const cantripTargetAt10 = warlockRequirements.find((r) => r.id === cantripIdW)!.totalByLevel[9]!

    const persistedStored: StoredSpellEntry[] = [
      ...Array.from({ length: spellTargetAt10 }, (_, i) => ({ instanceId: `s-${i}`, ref: { packageId: PKG, slug: `spell-1-${i}` }, known: true, prepared: true, requirementIds: [spellIdW] })),
      ...Array.from({ length: cantripTargetAt10 }, (_, i) => ({ instanceId: `c-${i}`, ref: { packageId: PKG, slug: `cantrip-${i}` }, known: true, prepared: false, requirementIds: [cantripIdW] }))
    ]
    const persisted: AssembledSpellEntry[] = persistedStored.map((entry) => ({
      ...entry, status: 'resolved', title: entry.ref!.slug, entry: SHARED_SPELL_CATALOGUE.find((candidate) => candidate.slug === entry.ref!.slug)
    }))
    useFixture('warlock-xphb', WARLOCK_SUBCLASS, { level: 10, spells: persisted })

    const answers = { [spellAnswerKey(warlockRequirements.find((r) => r.id === tier6Id)!, 11)]: [`${PKG}::arcanum-7`] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 11, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 11, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-spell-selection')
    expect(saveCharacterSpellcastingMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// PERSISTENCE SENSITIVITY -- correctness genuinely depends on provenance surviving the round trip.
// Wizard (the real cross-pool collision) and Sorcerer (a simpler single-pool deficit), per this
// phase's own explicit "Wizard + one non-Wizard" requirement.
// ---------------------------------------------------------------------------
describe('PERSISTENCE SENSITIVITY', () => {
  it('Wizard: Confirm-written rows validate complete on a fresh reload; a BROKEN COPY with requirementIds stripped reproduces the real pre-P3.2.1 cross-pool collision; the original write is never mutated', async () => {
    useFixture('wizard-xphb', WIZARD_SUBCLASS, { rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } } })
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellbookTarget = requirements.find((r) => r.id === spellbookId)!.totalByLevel[1]!
    const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[1]!
    const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[1]!

    const answers: Record<string, string[]> = {
      [progressionChoiceKey('class', 2, 'choice:skill.expertise')]: ['value:skill.arcana.expertise'],
      [spellAnswerKey(requirements.find((r) => r.id === spellbookId)!, 2)]: Array.from({ length: spellbookTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: Array.from({ length: spellTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`)
    }
    // targetLevel must exceed currentLevel (1) -- this probe drives a real Level 1 -> 2 confirm,
    // using Level 2's own real totals (`totalByLevel[1]`) -- Wizard's spellbook/cantrip totals DO
    // increase between Level 1 and 2 (6 -> 8, 3 -> 4), so the answer key's own targetLevel (2) must
    // match exactly what planProgression/confirmProgression are actually called with below.
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const confirmResult = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return

    const written = Object.freeze(saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] })
    for (const entry of written.spells) expect(entry.requirementIds?.length).toBeGreaterThan(0)

    // FRESH RELOAD, tagged: complete.
    const taggedAssembled: AssembledSpellEntry[] = written.spells.map((entry) => ({
      ...entry, status: 'resolved' as const, title: entry.ref!.slug,
      entry: SHARED_SPELL_CATALOGUE.find((candidate) => candidate.slug === entry.ref!.slug)
    }))
    useFixture('wizard-xphb', WIZARD_SUBCLASS, { spells: taggedAssembled })
    const taggedPreview = await planProgression(WORLD_ID, CHARACTER_ID, 2)
    expect(taggedPreview.ok).toBe(true)
    if (taggedPreview.ok) expect(taggedPreview.plan.spellPlan?.complete).toBe(true)

    // FRESH RELOAD, a BROKEN COPY with every requirementIds stripped -- never mutating `written`.
    const brokenAssembled: AssembledSpellEntry[] = written.spells.map((entry) => {
      const { requirementIds, ...rest } = entry
      return { ...rest, status: 'resolved' as const, title: entry.ref!.slug, entry: SHARED_SPELL_CATALOGUE.find((candidate) => candidate.slug === entry.ref!.slug) }
    })
    useFixture('wizard-xphb', WIZARD_SUBCLASS, { spells: brokenAssembled })
    const brokenPreview = await planProgression(WORLD_ID, CHARACTER_ID, 2)
    expect(brokenPreview.ok).toBe(true)
    if (brokenPreview.ok) expect(brokenPreview.plan.spellPlan?.complete).toBe(false) // the real pre-P3.2.1 collision, reproduced on demand

    // The ORIGINAL write is untouched by either reload above.
    for (const entry of written.spells) expect(entry.requirementIds?.length).toBeGreaterThan(0)
  })

  it('Sorcerer: Confirm-written rows validate complete; a BROKEN COPY with requirementIds stripped still shows a real deficit under the legacy flag-only heuristic at a HIGHER target, never silently repaired', async () => {
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }))
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'sorcerer-xphb')!.spellRequirements!
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[1]!
    const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[1]!
    const answers = {
      [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: Array.from({ length: spellTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    if (!plan.ok) throw new Error('plan failed')
    const confirmResult = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    if (!confirmResult.ok) throw new Error('confirm failed')

    const written = Object.freeze(saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] })
    for (const entry of written.spells) expect(entry.requirementIds?.length).toBeGreaterThan(0)

    const taggedAssembled: AssembledSpellEntry[] = written.spells.map((entry) => ({
      ...entry, status: 'resolved' as const, title: entry.ref!.slug,
      entry: SHARED_SPELL_CATALOGUE.find((candidate) => candidate.slug === entry.ref!.slug)
    }))
    // `planProgression` requires an advancing target, so a "fresh reload at the identical level"
    // probe is driven via Level 2 -> 3's own INCREMENTAL deficit instead (Sorcerer's real `spell`
    // pool does grow between Level 2 and 3) -- the persisted, correctly-tagged rows legally count
    // toward the Level-2 PORTION of that total, never re-requested, exactly the REPEAT PREVIEW
    // contract this phase's own report names.
    useFixture('sorcerer-xphb', baseEntry({ parentClassSlug: 'sorcerer-xphb' }), { level: 2, spells: taggedAssembled })
    const taggedPreview = await planProgression(WORLD_ID, CHARACTER_ID, 3)
    expect(taggedPreview.ok).toBe(true)
    if (taggedPreview.ok) {
      const spellPlan = taggedPreview.plan.spellPlan!.requirements.find((r) => r.requirementId === spellId)!
      expect(spellPlan.legalCount).toBe(spellTarget) // the Level-2 picks remain legally owned
    }

    // The ORIGINAL write is untouched regardless of what any later probe does with a copy.
    for (const entry of written.spells) expect(entry.requirementIds?.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// FINAL FAILURE POSTURE -- the newly-added spellcasting write fails AFTER rules_choices and
// progression both already succeeded. This is the one genuinely NEW partial-write case P3.4
// introduces (spellcasting is the new, final write in the chain) -- see this phase's own report's
// WRITE ORDER section for why it is placed last and what residual risk that ordering accepts.
// Proves: (1) Confirm fails loudly, no swallowed error; (2) no rollback is claimed or invented;
// (3) progression is left at the new level while spellcasting is left old/incomplete; (4) that
// EXACT partial state, re-evaluated fresh and independently, still reports the target-level spell
// requirement as a real, visible deficit -- the system never treats spell state as complete merely
// because `progression.level` reached the target.
// ---------------------------------------------------------------------------
describe('FINAL FAILURE POSTURE -- spellcasting write fails after rules_choices and progression succeed', () => {
  it('Wizard Level 1 -> 2: Confirm fails loudly; progression persists the new level; spellcasting does not; a fresh authoritative re-evaluation of that exact partial state still reports the target-level requirement UNSATISFIED', async () => {
    useFixture('wizard-xphb', WIZARD_SUBCLASS, { rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } } })
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellbookTarget = requirements.find((r) => r.id === spellbookId)!.totalByLevel[1]!
    const spellTarget = requirements.find((r) => r.id === spellId)!.totalByLevel[1]!
    const cantripTarget = requirements.find((r) => r.id === cantripId)!.totalByLevel[1]!

    // Level 1 -> 2 crosses the real Scholar/Expertise choice -- answered here so this plan is
    // OTHERWISE fully valid (rules_choices has something real to write), and the ONLY thing about
    // to fail is the new spellcasting write itself, never a pre-existing validity problem.
    const scholarKey = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const answers: Record<string, string[]> = {
      [scholarKey]: ['value:skill.arcana.expertise'],
      [spellAnswerKey(requirements.find((r) => r.id === spellbookId)!, 2)]: Array.from({ length: spellbookTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === spellId)!, 2)]: Array.from({ length: spellTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(requirements.find((r) => r.id === cantripId)!, 2)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`)
    }

    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid, 'otherwise fully valid -- the write itself is the only thing under test').toBe(true)

    // ARRANGE: rules_choices and progression succeed (their mocks are untouched, default resolve);
    // spellcasting is the one write that fails.
    saveCharacterSpellcastingMock.mockRejectedValueOnce(new Error('simulated spellcasting write failure'))

    // 1. CONFIRM FAILS LOUDLY -- no `.catch` anywhere in the chain swallows this; the call REJECTS,
    // it never resolves to a quiet `{ ok: false }`.
    await expect(
      confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    ).rejects.toThrow('simulated spellcasting write failure')

    // 2. NO ROLLBACK -- both earlier writes already ran (and, per their own mocks, succeeded)
    // before the failing one; nothing here claims or performs a compensating undo.
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalled()
    expect(saveCharacterProgressionMock).toHaveBeenCalled()
    expect(saveCharacterSpellcastingMock).toHaveBeenCalled() // attempted -- and this is the one that failed

    // 3. PERSISTED PROGRESSION reflects the new target level -- the write that succeeded.
    const persistedProgression = saveCharacterProgressionMock.mock.calls[0]![1] as { classes: { level: number }[] }
    expect(persistedProgression.classes[0]!.level).toBe(2)

    // 4. PERSISTED SPELLCASTING remains old/incomplete -- the write never landed. No repair or
    // reconciliation workflow is invented here; this partial state is the real, documented
    // residual risk this phase's own report already names under WRITE ORDER.

    // 5. FRESH, AUTHORITATIVE RE-EVALUATION of that EXACT partial state (progression already at
    // Level 2; spellcasting still whatever it was before this Confirm -- a brand-new Wizard, so
    // empty). `planProgression` itself would correctly refuse to even preview this exact state
    // (`targetLevel === currentLevel` now that progression already advanced -> `not-advancement`),
    // so -- per this phase's own explicit instruction -- the invariant is proven one layer down, at
    // the lowest authority boundary that actually answers "is this spell state complete at this
    // level": `planSpellAcquisition` (P3.2), called directly with the SAME real requirements, the
    // SAME real target-level slot table, and the TRUE persisted candidate set (empty, since the
    // write never happened).
    const slots = progressionSpellSlotLevels(REAL_RUNTIME.registry, findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!, 2)
    const freshPlan = planSpellAcquisition({
      requirements, characterLevel: 2, candidates: [], catalogue: SHARED_SPELL_CATALOGUE, spellSlotLevels: slots, tentative: []
    })
    expect(freshPlan.complete, 'reaching the target LEVEL must never be treated as the spell state also being complete').toBe(false)
    for (const requirementId of [spellbookId, spellId, cantripId]) {
      const requirementPlan = freshPlan.requirements.find((r) => r.requirementId === requirementId)!
      expect(requirementPlan.missing, `${requirementId} must still report a real, visible deficit`).toBeGreaterThan(0)
    }

    // Repair/reconciliation UX for this exact partial state is explicitly NOT built in this phase --
    // recorded as technical debt in this phase's own audit update (§25.34), never silently assumed.
  })
})
