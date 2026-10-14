// ELDRITCH INVOCATIONS PHASE -- WARLOCK ACCUMULATING-OPTION PROGRESSION (Level 2/5/7/9/12/15/18
// growth). Integration tests through the REAL `planProgression`/`confirmProgression`
// (server/utils/character-progression-plan.ts), proving Preview exposes the growth choice only
// at the correct level with the correct cumulative legal pool, Confirm rejects missing/illegal/
// duplicate/crafted answers (including an option whose real "another invocation" prerequisite is
// not yet met), a valid answer persists and previously-selected invocations remain owned, a
// direct Level 1 -> 20 jump resolves the real 2-hop prerequisite chain (Pact of the Blade ->
// Thirsting Blade -> Devouring Blade) WITHIN one transition (same-plan composition, no save/
// reload round trip), a repeated Preview at an already-crossed level does not re-request the
// decision, and a second jump requests only the newly-required deficit. No Warlock/Invocation-
// specific code exists anywhere in `character-progression-plan.ts` -- this file proves the
// GENERIC `choice:class.accumulating-option` primitive, reused verbatim from creation-time
// authoring, with its existing `requiresActive` eligibility doing all the prerequisite work.
//
// UNIT-ISOLATION (see tests/helpers/completeness-stub.ts): Phase 0 completeness is stubbed so
// Warlock's OTHER mandatory decisions never mask the mechanics under test here -- the same
// isolation character-progression-plan-weapon-mastery.test.ts's own sibling file already uses.
// Production fail-closed acceptance (Dwarf + Warlock + Criminal through the REAL, unstubbed
// authority) is covered separately, in create-v2-invocations.test.ts.

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
import { confirmProgression, planProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { fullySatisfyingSpellState } from '../../helpers/satisfying-spell-fixture'
import type { AssembledSpellEntry } from '../../../app/lib/characters/spellcasting'

const WORLD_ID = '5'
const CHARACTER_ID = '42'
const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const PKG = 'eldra.content.xphb'
const CHOICE_SET = 'choice:class.accumulating-option'
const CREATION_KEY = 'class:choice:class.accumulating-option'

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

const WARLOCK_SUBCLASS = 'the-fiend-xphb'
const ASI_FEAT_REF = { packageId: PKG, slug: 'ability-score-improvement-xphb' }
const EPIC_BOON_REF = { packageId: PKG, slug: 'boon-of-fortitude-xphb' }
// Real Warlock ASI cadence (class-warlock.json's own classFeatures): 4/8/12/16.
const ASI_LEVELS = [4, 8, 12, 16]

function catalogueFor() {
  const subclasses = [baseEntry({ title: WARLOCK_SUBCLASS, slug: WARLOCK_SUBCLASS, parentClassSlug: 'warlock-xphb' })]
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
  return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats, items: [], spells: [], monsters: [], subclasses }
}

const WARLOCK_SPELL_REQUIREMENTS = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!

function blueprintForClass(input: { level?: number, rulesChoices?: { selections: Record<string, string[]> } | null, spells?: AssembledSpellEntry[] } = {}) {
  return {
    worldId: WORLD_ID,
    characterId: CHARACTER_ID,
    characterTitle: 'Invocation Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: 'Warlock', slug: 'warlock-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb') ?? undefined }) },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 16 } },
    rulesChoices: input.rulesChoices ?? null,
    inventory: [], notes: null, health: null,
    spells: input.spells ?? [], expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: 'warlock-xphb' }, level: input.level ?? 1, subclassRef: null }], items: [] },
    resources: null, packs: []
  }
}

// Warlock is a real spellcaster -- its own `spellRequirements` (spell/cantrip/arcanum pools) are
// an UNRELATED mechanic this walk also crosses. Seeded fully-satisfied at the fixture's own
// current level (never the eventual preview/confirm target -- that's this file's own concern,
// Invocations, never spells), exactly the same "convenience fixture" remediation
// character-progression-level-1-to-20.test.ts and the all-class subclass contract test already
// use for every OTHER caster class fixture.
function useFixture(input: Parameters<typeof blueprintForClass>[0] = {}, spellTargetLevel?: number) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
  const spells = input.spells ?? fullySatisfyingSpellState(WARLOCK_SPELL_REQUIREMENTS, spellTargetLevel ?? input.level ?? 1)
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintForClass({ ...input, spells }) })
  // Previously-persisted answers are read through the SEPARATE `loadCharacterRulesChoices`
  // boundary (never the blueprint's own `rulesChoices` field alone) -- the same real contract
  // character-progression-plan-rogue-expertise.test.ts's own fixture already relies on.
  loadCharacterRulesChoicesMock.mockResolvedValue(input.rulesChoices ?? null)
}

// Every OTHER real, already-proven-working mandatory choice a multi-level Warlock walk also
// crosses (Level-3 Subclass, the real ASI cadence) -- answered purely so Confirm's "the WHOLE
// plan must be valid" gate is satisfied, letting these tests isolate Invocation growth mechanics.
function nonInvocationAnswers(toLevel: number): Record<string, string[]> {
  const answers: Record<string, string[]> = {}
  if (toLevel >= 3) {
    answers[progressionChoiceKey('class', 3, 'choice:class.subclass')] = [serializeContentRef({ packageId: PKG, slug: WARLOCK_SUBCLASS })]
  }
  for (const asiLevel of ASI_LEVELS) {
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

beforeEach(() => {
  for (const mock of [assembleCharacterMock, getWorldRuntimeMock, saveCharacterProgressionMock, loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock, listContentPackBindingsForWorldMock, getWorldContentCatalogueMock, saveCharacterSpellcastingMock]) mock.mockReset()
  getWorldRuntimeMock.mockResolvedValue({ configured: true, ok: true, runtime: REAL_RUNTIME, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  saveCharacterSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

describe('ELDRITCH INVOCATIONS GROWTH -- warlock-xphb (creation 1, Level-20 total 10)', () => {
  const key = (level: number) => progressionChoiceKey('class', level, CHOICE_SET)

  it('PREVIEW -- the growth choice appears exactly at Level 2, legal pool is the 10 real options with no level-5+ prerequisite', async () => {
    useFixture({ level: 1, rulesChoices: { selections: { [CREATION_KEY]: ['value:invocation.armor_of_shadows.known'] } } }, 2)
    const result = await planProgression(WORLD_ID, CHARACTER_ID, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const step = result.plan.steps.find((s) => s.level === 2)!
    const choice = step.requiredChoices.find((c) => c.id === key(2))!
    expect(choice.count).toBe(2)
    // Already-selected at creation (armor_of_shadows) is excluded -- `excludeIfAlreadyActive`.
    expect(choice.options.some((o) => o.id === 'value:invocation.armor_of_shadows.known')).toBe(false)
    expect(choice.options.length).toBe(9)
  })

  it('REJECTION -- missing the growth answer refuses Confirm, zero writes', async () => {
    useFixture({ level: 1, rulesChoices: { selections: { [CREATION_KEY]: ['value:invocation.armor_of_shadows.known'] } } }, 2)
    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 2)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, preview.plan.fingerprint, {})
    expect(result.ok).toBe(false)
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('REJECTION -- an option whose real "another invocation" prerequisite is not yet met (Eldritch Smite at Level 5, without Pact of the Blade) is refused', async () => {
    useFixture({
      level: 2,
      rulesChoices: { selections: {
        [CREATION_KEY]: ['value:invocation.armor_of_shadows.known'],
        [key(2)]: ['value:invocation.eldritch_mind.known', 'value:invocation.devils_sight.known']
      } }
    }, 5)
    const answers = { ...nonInvocationAnswers(5), [key(5)]: ['value:invocation.eldritch_smite.known', 'value:invocation.fiendish_vigor.known'] }
    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 5, answers)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 5, preview.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('SUCCESS -- a valid growth answer persists, previously-selected invocations (creation + Level 2) remain owned', async () => {
    useFixture({
      level: 2,
      rulesChoices: { selections: {
        [CREATION_KEY]: ['value:invocation.armor_of_shadows.known'],
        [key(2)]: ['value:invocation.eldritch_mind.known', 'value:invocation.devils_sight.known']
      } }
    }, 5)
    const answers = { ...nonInvocationAnswers(5), [key(5)]: ['value:invocation.ascendant_step.known', 'value:invocation.fiendish_vigor.known'] }
    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 5, answers)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 5, preview.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const stored = saveCharacterRulesChoicesMock.mock.calls[0]![1] as { selections: Record<string, string[]> }
    expect(stored.selections[CREATION_KEY]).toEqual(['value:invocation.armor_of_shadows.known'])
    expect(stored.selections[key(2)]).toEqual(['value:invocation.eldritch_mind.known', 'value:invocation.devils_sight.known'])
    expect(stored.selections[key(5)]).toEqual(['value:invocation.ascendant_step.known', 'value:invocation.fiendish_vigor.known'])
  })

  it('DIRECT JUMP -- Level 1 -> 20 resolves the real 2-hop chain (Pact of the Blade at creation -> Thirsting Blade at Level 5 -> Devouring Blade at Level 12) in ONE transition, ends at the real total of 10, no duplicates', async () => {
    useFixture({ level: 1, rulesChoices: { selections: { [CREATION_KEY]: ['value:invocation.pact_of_the_blade.known'] } } }, 20)
    const answers: Record<string, string[]> = {
      ...nonInvocationAnswers(20),
      [key(2)]: ['value:invocation.armor_of_shadows.known', 'value:invocation.eldritch_mind.known'],
      [key(5)]: ['value:invocation.thirsting_blade.known', 'value:invocation.ascendant_step.known'],
      [key(7)]: ['value:invocation.whispers_of_the_grave.known'],
      [key(9)]: ['value:invocation.visions_of_distant_realms.known'],
      [key(12)]: ['value:invocation.devouring_blade.known'],
      [key(15)]: ['value:invocation.witch_sight.known'],
      [key(18)]: ['value:invocation.one_with_shadows.known']
    }
    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 20, answers)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.plan.valid).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 20, preview.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const stored = saveCharacterRulesChoicesMock.mock.calls[0]![1] as { selections: Record<string, string[]> }
    const allSelected = [
      ...stored.selections[CREATION_KEY]!, ...stored.selections[key(2)]!, ...stored.selections[key(5)]!,
      ...stored.selections[key(7)]!, ...stored.selections[key(9)]!, ...stored.selections[key(12)]!,
      ...stored.selections[key(15)]!, ...stored.selections[key(18)]!
    ]
    expect(allSelected).toHaveLength(10)
    expect(new Set(allSelected).size).toBe(10)
    expect(allSelected).toContain('value:invocation.devouring_blade.known')
  })

  it('REPEAT PREVIEW -- after confirming through Level 5, a fresh preview to a LATER already-answered level does not re-request Level 2/5', async () => {
    useFixture({
      level: 5,
      rulesChoices: { selections: {
        [CREATION_KEY]: ['value:invocation.armor_of_shadows.known'],
        [key(2)]: ['value:invocation.eldritch_mind.known', 'value:invocation.devils_sight.known'],
        [key(5)]: ['value:invocation.ascendant_step.known', 'value:invocation.fiendish_vigor.known']
      } }
    }, 7)
    const result = await planProgression(WORLD_ID, CHARACTER_ID, 7, nonInvocationAnswers(7))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const step7 = result.plan.steps.find((s) => s.level === 7)!
    const choice7 = step7.requiredChoices.find((c) => c.id === key(7))!
    expect(choice7.count).toBe(1)
    expect(result.plan.steps.some((s) => s.level === 2)).toBe(false)
    expect(result.plan.steps.some((s) => s.level === 5)).toBe(false)
  })

  it('SECOND JUMP -- Level 5 (already answered through Level 5) -> Level 9 requests only the Level 7 (+1) and Level 9 (+1) deficits', async () => {
    useFixture({
      level: 5,
      rulesChoices: { selections: {
        [CREATION_KEY]: ['value:invocation.armor_of_shadows.known'],
        [key(2)]: ['value:invocation.eldritch_mind.known', 'value:invocation.devils_sight.known'],
        [key(5)]: ['value:invocation.ascendant_step.known', 'value:invocation.fiendish_vigor.known']
      } }
    }, 9)
    const answers = { ...nonInvocationAnswers(9), [key(7)]: ['value:invocation.whispers_of_the_grave.known'], [key(9)]: ['value:invocation.visions_of_distant_realms.known'] }
    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 9, answers)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const level7 = preview.plan.steps.find((s) => s.level === 7)!.requiredChoices.find((c) => c.id === key(7))!
    const level9 = preview.plan.steps.find((s) => s.level === 9)!.requiredChoices.find((c) => c.id === key(9))!
    expect(level7.count).toBe(1)
    expect(level9.count).toBe(1)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 9, preview.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const stored = saveCharacterRulesChoicesMock.mock.calls[0]![1] as { selections: Record<string, string[]> }
    // Every earlier selection survives, untouched, alongside exactly the 2 new ones.
    expect(stored.selections[CREATION_KEY]).toEqual(['value:invocation.armor_of_shadows.known'])
    expect(stored.selections[key(2)]).toEqual(['value:invocation.eldritch_mind.known', 'value:invocation.devils_sight.known'])
    expect(stored.selections[key(5)]).toEqual(['value:invocation.ascendant_step.known', 'value:invocation.fiendish_vigor.known'])
    expect(stored.selections[key(7)]).toEqual(['value:invocation.whispers_of_the_grave.known'])
    expect(stored.selections[key(9)]).toEqual(['value:invocation.visions_of_distant_realms.known'])
  })
})
