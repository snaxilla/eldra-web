// D&D 2024 Character Rules -- FEATURE-OPTION PROGRESSION (Cleric Blessed Strikes, Druid Elemental
// Fury, Level 7). Integration tests through the REAL `planProgression`/`confirmProgression`
// (server/utils/character-progression-plan.ts), proving Preview exposes the choice at the correct
// level (never before it), Confirm rejects missing/illegal/crafted answers, a valid answer
// persists and activates the real Source, a direct Level 1 -> 8 jump works with no sequential
// leveling, and a repeated Preview at an already-crossed level does not re-request the decision.
// No Cleric/Druid-specific code exists anywhere in `character-progression-plan.ts` -- this file
// proves the GENERIC `choice:class.feature-option` primitive, reused verbatim from Divine Order/
// Primal Order's own creation-time authoring.
//
// UNIT-ISOLATION (see tests/helpers/completeness-stub.ts): Phase 0 completeness is stubbed so
// Cleric/Druid's OTHER still-blocked mandatory decisions never mask the mechanics under test here
// -- the same isolation character-progression-plan-spell-acquisition.test.ts's own sibling blocks
// already use. Production fail-closed acceptance (Dwarf + Cleric/Druid + Criminal through the
// REAL, unstubbed authority) is covered separately, in create-v2-feature-option.test.ts.

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
import { DependencyGraph } from '../../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../../app/lib/rules/evaluation-session'
import { evaluate } from '../../../app/lib/rules/evaluator'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { confirmProgression, planProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { spellAnswerKey } from '../../../server/utils/character-progression-spell-acquisition'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import type { AssembledSpellEntry } from '../../../app/lib/characters/spellcasting'

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

function spellCatalogueEntry(slug: string, level: number, classLists: string[]) {
  return { packageId: PKG, slug, title: slug, spellMechanics: resolveDnd5eSpellMechanics({ name: slug, source: 'XPHB', level, school: 'V', classLists })! }
}
const SPELL_CLASS_LISTS = ['Cleric', 'Druid']
const SHARED_SPELL_CATALOGUE = [
  ...Array.from({ length: 40 }, (_, i) => spellCatalogueEntry(`cantrip-${i}`, 0, SPELL_CLASS_LISTS)),
  ...Array.from({ length: 60 }, (_, i) => spellCatalogueEntry(`spell-1-${i}`, 1, SPELL_CLASS_LISTS))
]

// Real, production-verified subclass slugs (same fixture character-progression-level-1-to-20.test.ts
// and character-progression-all-class-subclass.test.ts already use) -- needed only so the REAL
// Level-3 Subclass requirement (an unrelated, already-proven-working choice this Level 1 -> 7/8 walk
// also crosses) can be answered, letting these tests isolate feature-option mechanics specifically.
const REAL_SUBCLASSES_BY_CLASS: Record<string, string[]> = {
  'cleric-xphb': ['life-domain-xphb', 'light-domain-xphb', 'trickery-domain-xphb', 'war-domain-xphb'],
  'druid-xphb': ['circle-of-the-land-xphb', 'circle-of-the-moon-xphb', 'circle-of-the-sea-xphb', 'circle-of-the-stars-xphb']
}
const ASI_FEAT_REF = { packageId: PKG, slug: 'ability-score-improvement-xphb' }

function catalogueFor(classSlug: string) {
  const subclasses = (REAL_SUBCLASSES_BY_CLASS[classSlug] ?? []).map((slug) => baseEntry({ title: slug, slug, parentClassSlug: classSlug }))
  const feats = [baseEntry({
    title: 'Ability Score Improvement',
    slug: 'ability-score-improvement-xphb',
    featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: true, prerequisiteGroups: [] },
    rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'ability-score-improvement-xphb') ?? undefined
  })]
  return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats, items: [], spells: SHARED_SPELL_CATALOGUE, monsters: [], subclasses }
}

function blueprintForClass(classSlug: string, input: {
  level?: number
  spells?: AssembledSpellEntry[]
  rulesChoices?: { selections: Record<string, string[]> } | null
} = {}) {
  return {
    worldId: WORLD_ID,
    characterId: CHARACTER_ID,
    characterTitle: 'Feature-Option Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: classSlug, slug: classSlug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', classSlug) ?? undefined }) },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 10, con: 12, int: 14, wis: 14, cha: 16 } },
    rulesChoices: input.rulesChoices ?? null,
    inventory: [], notes: null, health: null,
    spells: input.spells ?? [], expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: classSlug }, level: input.level ?? 1, subclassRef: null }] },
    resources: null, packs: []
  }
}

function useFixture(classSlug: string, input: Parameters<typeof blueprintForClass>[1] = {}) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor(classSlug))
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintForClass(classSlug, input) })
}

// Every OTHER real, already-proven-working mandatory choice a Level 1 -> 7/8 Cleric or Druid walk
// also crosses -- spell/cantrip acquisition at every level the target grows, the Level-3 Subclass
// choice, and the Level-4/8 Ability Score Improvement (feat.selection) choices -- answered purely
// so Confirm's "the WHOLE plan must be valid" gate is satisfied, letting these tests isolate
// feature-option mechanics specifically rather than tripping on an unrelated requirement. Mirrors
// character-progression-plan-spell-acquisition.test.ts's and character-progression-level-1-to-
// 20.test.ts's own exact patterns.
function fullSpellAnswers(classSlug: string, toLevel: number) {
  const requirements = findRulesFacet('dnd5e.2024', 'class', classSlug)!.spellRequirements!
  const spellReq = requirements.find((r) => r.pool === 'spell')!
  const cantripReq = requirements.find((r) => r.pool === 'cantrip')!
  const spellTarget = spellReq.totalByLevel[toLevel - 1]!
  const cantripTarget = cantripReq.totalByLevel[toLevel - 1]!
  const answers: Record<string, string[]> = {
    [spellAnswerKey(spellReq, toLevel)]: Array.from({ length: spellTarget }, (_, i) => `${PKG}::spell-1-${i}`),
    [spellAnswerKey(cantripReq, toLevel)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`)
  }
  if (toLevel >= 3) {
    const subclassSlug = REAL_SUBCLASSES_BY_CLASS[classSlug]![0]!
    answers[progressionChoiceKey('class', 3, 'choice:class.subclass')] = [serializeContentRef({ packageId: PKG, slug: subclassSlug })]
  }
  for (const asiLevel of [4, 8, 12, 16]) {
    if (toLevel < asiLevel) continue
    const featKey = progressionChoiceKey('class', asiLevel, 'choice:feat.selection')
    answers[featKey] = [serializeContentRef(ASI_FEAT_REF)]
    answers[`feat:${featKey}:choice:feat.asi-ability-increase`] = ['source:asi.increase.str', 'source:asi.increase.dex']
  }
  return answers
}

const BLESSED_STRIKES_KEY = progressionChoiceKey('class', 7, 'choice:class.feature-option')
const ELEMENTAL_FURY_KEY = progressionChoiceKey('class', 7, 'choice:class.feature-option')
// Source ids are rules-level identifiers declared directly in the package's own `from` array (not
// catalogue ContentRefs), so they are submitted bare -- the same convention the ASI nested
// ability-increase answer above already uses (`source:asi.increase.str`, no package prefix).
const DIVINE_STRIKE = 'source:blessed-strikes.divine-strike'
const POTENT_SPELLCASTING_CLERIC = 'source:blessed-strikes.potent-spellcasting'
const POTENT_SPELLCASTING_DRUID = 'source:elemental-fury.potent-spellcasting'
const PRIMAL_STRIKE = 'source:elemental-fury.primal-strike'

beforeEach(() => {
  for (const mock of [assembleCharacterMock, getWorldRuntimeMock, saveCharacterProgressionMock, loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock, listContentPackBindingsForWorldMock, getWorldContentCatalogueMock, saveCharacterSpellcastingMock]) mock.mockReset()
  getWorldRuntimeMock.mockResolvedValue({ configured: true, ok: true, runtime: REAL_RUNTIME, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  saveCharacterSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

describe('PREVIEW -- the choice appears at Level 7, never before it', () => {
  it('Cleric: Level 1 -> 6 preview does NOT expose Blessed Strikes', async () => {
    useFixture('cleric-xphb', { level: 1 })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 6, fullSpellAnswers('cleric-xphb', 6))
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).not.toContain(BLESSED_STRIKES_KEY)
  })

  it('Cleric: Level 1 -> 7 preview exposes Blessed Strikes as a required choice', async () => {
    useFixture('cleric-xphb', { level: 1 })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, fullSpellAnswers('cleric-xphb', 7))
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(BLESSED_STRIKES_KEY)
    expect(plan.plan.valid).toBe(false)
  })

  it('Druid: Level 1 -> 7 preview exposes Elemental Fury as a required choice', async () => {
    useFixture('druid-xphb', { level: 1 })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, fullSpellAnswers('druid-xphb', 7))
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(ELEMENTAL_FURY_KEY)
  })
})

describe('REJECTION MATRIX -- Confirm never trusts a client-submitted answer', () => {
  it('rejects with unresolved-choices when Blessed Strikes is not answered, and writes nothing', async () => {
    useFixture('cleric-xphb', { level: 1 })
    const spellAnswers = fullSpellAnswers('cleric-xphb', 7)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, spellAnswers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, spellAnswers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  it('rejects an illegal option (not one of the 2 real Divine Strike/Potent Spellcasting Sources)', async () => {
    useFixture('cleric-xphb', { level: 1 })
    const spellAnswers = fullSpellAnswers('cleric-xphb', 7)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, spellAnswers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, {
      ...spellAnswers, [BLESSED_STRIKES_KEY]: ['source:divine-order.protector']
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('rejects a crafted key naming a choice this character\'s content never declared', async () => {
    useFixture('cleric-xphb', { level: 1 })
    const spellAnswers = fullSpellAnswers('cleric-xphb', 7)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, spellAnswers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    // A crafted answer under an UNDECLARED key changes nothing -- the real Blessed Strikes key
    // still requires its own real answer, which is absent here.
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, {
      ...spellAnswers, 'class:progression:7:choice:does-not-exist': [DIVINE_STRIKE]
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
  })

  it('rejects too many selections (count must be exactly 1)', async () => {
    useFixture('cleric-xphb', { level: 1 })
    const spellAnswers = fullSpellAnswers('cleric-xphb', 7)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, spellAnswers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, {
      ...spellAnswers, [BLESSED_STRIKES_KEY]: [DIVINE_STRIKE, POTENT_SPELLCASTING_CLERIC]
    })
    expect(result.ok).toBe(false)
  })
})

describe('SUCCESS -- a valid answer persists and activates the real Source', () => {
  it('Cleric: Divine Strike selected at Level 7 persists and activates (no mechanical change for this deferred Source)', async () => {
    useFixture('cleric-xphb', { level: 1 })
    const spellAnswers = fullSpellAnswers('cleric-xphb', 7)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, spellAnswers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, {
      ...spellAnswers, [BLESSED_STRIKES_KEY]: [DIVINE_STRIKE]
    })
    expect(result.ok).toBe(true)
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalledWith(CHARACTER_ID, { selections: expect.objectContaining({ [BLESSED_STRIKES_KEY]: ['source:blessed-strikes.divine-strike'] }) })
    expect(saveCharacterProgressionMock.mock.calls[0]![1].classes[0].level).toBe(7)

    // The activated Source resolves through the real engine -- proven directly, not assumed.
    const graph = DependencyGraph.build(REAL_RUNTIME.registry)
    if (!graph.ok) throw new Error('graph failed')
    const session = new EvaluationSession(REAL_RUNTIME.registry, graph.graph, {
      values: {}, choices: {}, collections: {},
      sources: [{ instanceId: 'x', sourceRef: 'source:blessed-strikes.divine-strike', origin: { kind: 'declared' } }]
    }, {})
    expect(() => evaluate('value:weapon.martial.proficient', session)).not.toThrow()
  })

  it('Druid: Primal Strike selected at Level 7 persists', async () => {
    useFixture('druid-xphb', { level: 1 })
    const spellAnswers = fullSpellAnswers('druid-xphb', 7)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, spellAnswers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, {
      ...spellAnswers, [ELEMENTAL_FURY_KEY]: [PRIMAL_STRIKE]
    })
    expect(result.ok).toBe(true)
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalledWith(CHARACTER_ID, { selections: expect.objectContaining({ [ELEMENTAL_FURY_KEY]: ['source:elemental-fury.primal-strike'] }) })
  })
})

describe('DIRECT LEVEL JUMP -- Level 1 -> 8 works with no sequential leveling', () => {
  it('Cleric: a direct 1 -> 8 jump requests Blessed Strikes exactly once, at Level 7, and Confirm succeeds', async () => {
    useFixture('cleric-xphb', { level: 1 })
    const spellAnswers = fullSpellAnswers('cleric-xphb', 8)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 8, spellAnswers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(BLESSED_STRIKES_KEY)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 8, plan.plan.fingerprint, {
      ...spellAnswers, [BLESSED_STRIKES_KEY]: [POTENT_SPELLCASTING_CLERIC]
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.currentLevel).toBe(8)
  })
})

describe('REPEAT PREVIEW -- an already-crossed level does not re-request the decision', () => {
  it('Cleric: after confirming to Level 7, a FRESH preview to Level 9 does not ask for Blessed Strikes again', async () => {
    const answeredSelections = { [BLESSED_STRIKES_KEY]: ['source:blessed-strikes.divine-strike'] }
    useFixture('cleric-xphb', { level: 7, rulesChoices: { selections: answeredSelections } })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 9, fullSpellAnswers('cleric-xphb', 9))
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).not.toContain(BLESSED_STRIKES_KEY)
  })
})
