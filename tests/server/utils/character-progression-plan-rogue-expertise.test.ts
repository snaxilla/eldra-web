// D&D 2024 Character Rules -- ROGUE EXPERTISE PHASE, Ranger Level-2 "Deft Explorer" half
// (progression:class.skill-expertise-deft-explorer). Integration tests through the REAL
// `planProgression`/`confirmProgression` (server/utils/character-progression-plan.ts) and the
// REAL `getDerivedCharacterAtLevel` (server/utils/character-derived.ts), proving: Preview exposes
// the choice only at Level 2 (never Level 1), only an ALREADY-proficient skill is a legal option
// (this phase's own creation-time `requiresActive` eligibility is a sibling of the PROGRESSION-
// time one `character-actor-bridge.ts` already used for the base-class Expertise rows), a valid
// answer persists through `rules_choices` (never `progression.items`/`.feats` -- Expertise is a
// Definition-keyed choice, not a content acquisition), a fresh reload keeps it active, a direct
// jump works, and the derived skill bonus genuinely doubles the proficiency bonus. No Ranger-
// specific code exists anywhere in `character-progression-plan.ts` or `character-derived.ts` --
// this file proves the GENERIC `choice:skill.expertise` primitive, reused verbatim from the
// already-implemented base-class Expertise rows (Bard/Ranger L9/Rogue L6/Wizard L2).
//
// UNIT-ISOLATION (see tests/helpers/completeness-stub.ts): Phase 0 completeness is stubbed so
// Ranger's OTHER mandatory decisions (spells, Weapon Mastery, Fighting Style) never mask the
// mechanics under test here -- the same isolation character-progression-plan-weapon-mastery.
// test.ts's own sibling file already uses. Rogue's own Level-1 creation-time half, and the real
// production fail-closed acceptance proving Rogue's remaining honest blocker is Thieves' Cant
// alone, are covered separately in create-v2-rogue-expertise.test.ts.

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
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import xphbFeats from '../../lib/feat-mechanics/fixtures/xphb-feats.json'
import { confirmProgression, planProgression } from '../../../server/utils/character-progression-plan'
import { getDerivedCharacterAtLevel } from '../../../server/utils/character-derived'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { normalizeStoredProgression } from '../../../app/lib/characters/progression'
import type { DerivedCharacter } from '../../../server/utils/character-derived'
import { fullySatisfyingSpellState } from '../../helpers/satisfying-spell-fixture'

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

const ARCHERY_RAW = (xphbFeats.feats as Array<{ name: string }>).find((f) => f.name === 'Archery')!
const ARCHERY_REF = { packageId: PKG, slug: 'archery-xphb' }
const ARCHERY_ENTRY = baseEntry({
  title: 'Archery', slug: 'archery-xphb',
  featMechanics: resolveDnd5eFeatMechanics(ARCHERY_RAW),
  rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'archery-xphb') ?? undefined
})
const ASI_RAW = (xphbFeats.feats as Array<{ name: string }>).find((f) => f.name === 'Ability Score Improvement')!
const ASI_FEAT_REF = { packageId: PKG, slug: 'ability-score-improvement-xphb' }
const ASI_ENTRY = baseEntry({
  title: 'Ability Score Improvement', slug: 'ability-score-improvement-xphb',
  featMechanics: resolveDnd5eFeatMechanics(ASI_RAW),
  rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'ability-score-improvement-xphb') ?? undefined
})

const FS_KEY = progressionChoiceKey('class', 2, 'choice:feat.fighting-style.fs-and-fs-r')
const DEFT_EXPLORER_KEY = progressionChoiceKey('class', 2, 'choice:skill.expertise')
const BASE_EXPERTISE_L9_KEY = progressionChoiceKey('class', 9, 'choice:skill.expertise')

// Ranger's own real Level-1 skill proficiency answer (the facet's own first 3 options), the
// genuine proficiency Deft Explorer's own `requiresActive` prerequisite reads.
const RANGER_SKILL_CHOICE = findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb')!.choices!.find((c) => c.choiceSet === 'choice:skill.proficiency')!
const RANGER_PROFICIENT_SKILLS = (RANGER_SKILL_CHOICE.from ?? []).slice(0, RANGER_SKILL_CHOICE.count)

const RANGER_SUBCLASS_SLUG = 'hunter-xphb'
function catalogueFor() {
  const subclass = baseEntry({ title: 'hunter-xphb', slug: RANGER_SUBCLASS_SLUG, parentClassSlug: 'ranger-xphb' })
  return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats: [ARCHERY_ENTRY, ASI_ENTRY], items: [], spells: [], monsters: [], subclasses: [subclass] }
}

function blueprintForRanger(input: { level?: number; rulesChoices?: { selections: Record<string, string[]> } | null; targetLevel?: number } = {}) {
  return {
    worldId: WORLD_ID,
    characterId: CHARACTER_ID,
    characterTitle: 'Deft Explorer Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: 'ranger-xphb', slug: 'ranger-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb') ?? undefined }) },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 10 } },
    rulesChoices: input.rulesChoices ?? { selections: { 'class:choice:skill.proficiency': RANGER_PROFICIENT_SKILLS } },
    inventory: [], notes: null, health: null,
    // D&D 2024 Character Rules P3.4 -- sized to whatever level the CALLER actually plans/
    // confirms/derives against (see tests/helpers/satisfying-spell-fixture.ts's own header);
    // Ranger is a real caster, so an unsatisfied fixture would be spuriously blocked by spell
    // acquisition, a requirement unrelated to the Expertise mechanics under test here.
    spells: fullySatisfyingSpellState(findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb')?.spellRequirements ?? [], input.targetLevel ?? input.level ?? 1),
    expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: 'ranger-xphb' }, level: input.level ?? 1, subclassRef: null }], items: [] },
    resources: null, packs: []
  }
}

const FEAT_CATALOGUE_BY_SLUG: Record<string, Record<string, unknown>> = { 'archery-xphb': ARCHERY_ENTRY, 'ability-score-improvement-xphb': ASI_ENTRY }

function useFixture(input: Parameters<typeof blueprintForRanger>[0] = {}) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
  assembleCharacterMock.mockImplementation(async (_w: unknown, _c: unknown, _sub: unknown, tentativeFeats?: readonly { choiceKey: string, ref: { packageId: string, slug: string } }[]) => {
    const base = blueprintForRanger(input)
    return {
      available: true,
      blueprint: {
        ...base,
        feats: (tentativeFeats ?? []).map((f) => ({ status: 'resolved' as const, entry: { ...(FEAT_CATALOGUE_BY_SLUG[f.ref.slug] ?? ARCHERY_ENTRY) }, choiceKey: f.choiceKey }))
      }
    }
  })
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

// LANGUAGE CORPUS + POLICY PHASE -- Deft Explorer's own "Languages" half (progression:class.
// language-deft-explorer, count 2, Standard+Rare) is a SIBLING Level-2 row to the Expertise one
// under test, answered here too for the identical reason Fighting Style is: so Confirm's "the
// WHOLE plan must be valid" gate is satisfied while isolating Expertise mechanics specifically.
const DEFT_EXPLORER_LANGUAGE_KEY = progressionChoiceKey('class', 2, 'choice:language.known')

// Every OTHER real mandatory Level-2 choice this walk also crosses (Fighting Style, Deft
// Explorer's own Languages half) -- answered purely so Confirm's "the WHOLE plan must be valid"
// gate is satisfied, letting these tests isolate Deft Explorer's own Expertise mechanics
// specifically.
function fightingStyleAnswer(): Record<string, string[]> {
  return {
    [FS_KEY]: [serializeContentRef(ARCHERY_REF)],
    [DEFT_EXPLORER_LANGUAGE_KEY]: ['value:language.draconic.known', 'value:language.dwarvish.known']
  }
}

describe('RANGER DEFT EXPLORER -- Level-2 Expertise (progression:class.skill-expertise-deft-explorer)', () => {
  // Deft Explorer's own real decision level is 2 (never 1) -- proven directly against the
  // decision corpus in tests/rules/mandatory-decision-coverage.test.ts's own RECLASSIFICATION
  // test. Ranger has no level between 1 and 2, so there is no intermediate "preview before it
  // exists" level to plan toward here (unlike Barbarian/Fighter's own multi-level Weapon Mastery
  // growth gap) -- the first meaningful Preview is the one immediately below, AT Level 2.
  it('PREVIEW -- the Expertise choice appears exactly at Level 2, and only an ALREADY-proficient skill is a legal option', async () => {
    useFixture({ level: 1, targetLevel: 2 })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, fightingStyleAnswer())
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(DEFT_EXPLORER_KEY)
    const step = plan.plan.steps.find((s) => s.level === 2)!
    const choice = step.requiredChoices.find((c) => c.id === DEFT_EXPLORER_KEY)!
    expect(choice.count).toBe(1)
    const legalIds = choice.options.map((o) => o.id)
    for (const skill of RANGER_PROFICIENT_SKILLS) {
      expect(legalIds).toContain(skill.replace('.proficient', '.expertise'))
    }
    // A skill this fixture's Ranger was never made proficient in (Perception, not among the
    // first 3 RANGER_PROFICIENT_SKILLS) must NOT be offered -- the real "already proficient"
    // prerequisite, not an unrestricted list.
    expect(legalIds).not.toContain('value:skill.perception.expertise')
  })

  it('REJECTION -- missing the Expertise answer refuses Confirm, zero writes', async () => {
    useFixture({ level: 1, targetLevel: 2 })
    const answers = fightingStyleAnswer()
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('REJECTION -- a non-proficient skill is never offered, so submitting it is rejected with zero writes', async () => {
    useFixture({ level: 1, targetLevel: 2 })
    const answers = { ...fightingStyleAnswer(), [DEFT_EXPLORER_KEY]: ['value:skill.perception.expertise'] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const step = plan.plan.steps.find((s) => s.level === 2)!
    const choice = step.requiredChoices.find((c) => c.id === DEFT_EXPLORER_KEY)!
    expect(choice.options.map((o) => o.id)).not.toContain('value:skill.perception.expertise')
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('SUCCESS -- a valid answer confirms and persists through rules_choices, never progression.items/.feats', async () => {
    useFixture({ level: 1, targetLevel: 2 })
    const expertiseAnswer = RANGER_PROFICIENT_SKILLS[0]!.replace('.proficient', '.expertise')
    const answers = { ...fightingStyleAnswer(), [DEFT_EXPLORER_KEY]: [expertiseAnswer] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Expertise itself never becomes an item or feat acquisition -- the sibling Fighting Style
    // answer this walk also crosses IS a real feat acquisition (progression.feats), proving the
    // two mechanisms coexist without the Expertise answer leaking into either.
    expect(result.progression.items ?? []).toEqual([])
    expect(result.progression.feats).toEqual([{ featRef: ARCHERY_REF, choiceKey: FS_KEY }])
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalledWith(CHARACTER_ID, expect.objectContaining({
      selections: expect.objectContaining({ [DEFT_EXPLORER_KEY]: [expertiseAnswer] })
    }))
  })

  it('FRESH RELOAD -- Confirm -> persisted rules_choices -> fresh derive: the Expertise choice is still answered and active', async () => {
    const expertiseAnswer = RANGER_PROFICIENT_SKILLS[0]!.replace('.proficient', '.expertise')
    const answers = { ...fightingStyleAnswer(), [DEFT_EXPLORER_KEY]: [expertiseAnswer] }
    // The real creation-time skill proficiency answer must already be in the PERSISTED
    // rules_choices store (loadCharacterRulesChoices) so Confirm's own merge-write preserves it
    // alongside the new Level-2 Expertise answer -- otherwise this fixture would lose the very
    // proficiency fact Expertise's own `requiresActive` prerequisite depends on, exactly the
    // "every answer is re-validated on read, never trusted" posture the engine already takes.
    let storedRulesChoices: { selections: Record<string, string[]> } | null = { selections: { 'class:choice:skill.proficiency': RANGER_PROFICIENT_SKILLS } }
    useFixture({ level: 1, targetLevel: 2 })
    loadCharacterRulesChoicesMock.mockResolvedValue(storedRulesChoices)
    saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => {
      storedRulesChoices = JSON.parse(JSON.stringify(stored))
      return stored
    })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    if (!plan.ok) throw new Error('plan failed')
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)

    // Fresh derive, reading the REAL persisted rules_choices back (no tentative answers).
    useFixture({ level: 2, targetLevel: 2, rulesChoices: storedRulesChoices })
    const fresh = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 2)
    expect(fresh.available).toBe(true)
    if (!fresh.available) return
    const choice = fresh.derived.choices.find((c) => c.key === DEFT_EXPLORER_KEY)
    expect(choice?.answered).toBe(true)
    expect(choice?.selected).toEqual([expertiseAnswer])
    expect(findFlagIn(fresh.derived, expertiseAnswer)).toBe(true)
  })

  it('DIRECT JUMP -- Level 1 -> 9 answers BOTH Deft Explorer (L2) and base-class Expertise (L9) with zero collision', async () => {
    useFixture({ level: 1, targetLevel: 9 })
    const deftExplorerAnswer = RANGER_PROFICIENT_SKILLS[0]!.replace('.proficient', '.expertise')
    // Ranger's base-class L9 row requires count 2 ("two of your skill proficiencies"), distinct
    // from Deft Explorer's own L2 skill (index 0) -- indices 1 and 2 of this fixture's 3 real
    // proficient skills.
    const baseExpertiseAnswers = [RANGER_PROFICIENT_SKILLS[1]!.replace('.proficient', '.expertise'), RANGER_PROFICIENT_SKILLS[2]!.replace('.proficient', '.expertise')]
    const subclassKey = progressionChoiceKey('class', 3, 'choice:class.subclass')
    const asiKey4 = progressionChoiceKey('class', 4, 'choice:feat.selection')
    const asiKey8 = progressionChoiceKey('class', 8, 'choice:feat.selection')
    const answers = {
      ...fightingStyleAnswer(),
      [DEFT_EXPLORER_KEY]: [deftExplorerAnswer],
      [BASE_EXPERTISE_L9_KEY]: baseExpertiseAnswers,
      [subclassKey]: [serializeContentRef({ packageId: PKG, slug: RANGER_SUBCLASS_SLUG })],
      [asiKey4]: [serializeContentRef(ASI_FEAT_REF)],
      [`feat:${asiKey4}:choice:feat.asi-ability-increase`]: ['source:asi.increase.str', 'source:asi.increase.con'],
      [asiKey8]: [serializeContentRef(ASI_FEAT_REF)],
      [`feat:${asiKey8}:choice:feat.asi-ability-increase`]: ['source:asi.increase.str', 'source:asi.increase.con']
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 9, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 9, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const normalized = normalizeStoredProgression(result.progression)
    expect(normalized?.items ?? []).toEqual([])
  })

  it('the Expertise answer is purely additive to rules_choices -- it never appears as a progression.feats or .items entry of its own', async () => {
    useFixture({ level: 1, targetLevel: 2 })
    const expertiseAnswer = RANGER_PROFICIENT_SKILLS[0]!.replace('.proficient', '.expertise')
    const answers = { ...fightingStyleAnswer(), [DEFT_EXPLORER_KEY]: [expertiseAnswer] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2, answers)
    if (!plan.ok) throw new Error('plan failed')
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 2, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The ONLY progression.feats entry is the sibling Fighting Style answer (a real feat
    // acquisition); Expertise contributes zero entries to either feats or items -- it is a
    // rules_choices-only mutation, never duplicated into the content-acquisition transport.
    expect(result.progression.feats).toHaveLength(1)
    expect(result.progression.feats[0]!.choiceKey).toBe(FS_KEY)
    expect(result.progression.items ?? []).toEqual([])
  })
})

function findFlagIn(derived: DerivedCharacter, id: string): boolean | null {
  for (const entries of Object.values(derived.byCategory)) {
    const found = entries.find((entry) => entry.id === id)
    if (found) return found.value as boolean
  }
  return null
}

function findNumberIn(derived: DerivedCharacter, id: string): number | null {
  for (const entries of Object.values(derived.byCategory)) {
    const found = entries.find((entry) => entry.id === id)
    if (found) return found.value as number
  }
  return null
}

// DERIVED SKILL BONUS -- Expertise genuinely doubles the proficiency bonus (the real canonical
// formula, packages/eldra-dnd5e-2024/definitions.json's own `value:skill.X.bonus`), never
// duplicated arithmetic in the new choice system. Proven directly against the real engine.
describe('DERIVED SKILL BONUS -- Expertise doubles proficiency, the SAME skill differs with/without it', () => {
  it('the SAME skill, same ability score, reads ability-mod + proficiency_bonus ordinarily, and + 2x once Expertise is selected', async () => {
    const skillProficientId = RANGER_PROFICIENT_SKILLS[0]!
    const skillBonusId = skillProficientId.replace('.proficient', '.bonus')
    const skillExpertiseAnswer = skillProficientId.replace('.proficient', '.expertise')

    useFixture({ level: 2, rulesChoices: { selections: { 'class:choice:skill.proficiency': RANGER_PROFICIENT_SKILLS } } })
    const withoutExpertise = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 2)
    expect(withoutExpertise.available).toBe(true)
    if (!withoutExpertise.available) return
    const proficiencyBonus = findNumberIn(withoutExpertise.derived, 'value:proficiency_bonus')!
    expect(proficiencyBonus).toBeGreaterThan(0)
    const ordinaryBonus = findNumberIn(withoutExpertise.derived, skillBonusId)!

    useFixture({ level: 2, rulesChoices: { selections: { 'class:choice:skill.proficiency': RANGER_PROFICIENT_SKILLS, [DEFT_EXPLORER_KEY]: [skillExpertiseAnswer] } } })
    const withExpertise = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 2)
    expect(withExpertise.available).toBe(true)
    if (!withExpertise.available) return
    const expertiseBonus = findNumberIn(withExpertise.derived, skillBonusId)!

    // The only difference between the two derives is the Expertise answer; the ability score and
    // every other input are byte-identical, so the delta must be exactly one more proficiency bonus.
    expect(expertiseBonus - ordinaryBonus).toBe(proficiencyBonus)
  })

  it('fresh reload preserves the doubled bonus -- re-deriving from the same persisted answer gives the same result', async () => {
    const skillProficientId = RANGER_PROFICIENT_SKILLS[0]!
    const skillBonusId = skillProficientId.replace('.proficient', '.bonus')
    const skillExpertiseAnswer = skillProficientId.replace('.proficient', '.expertise')
    useFixture({ level: 2, rulesChoices: { selections: { 'class:choice:skill.proficiency': RANGER_PROFICIENT_SKILLS, [DEFT_EXPLORER_KEY]: [skillExpertiseAnswer] } } })

    const first = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 2)
    const second = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 2)
    expect(first.available && second.available).toBe(true)
    if (!first.available || !second.available) return
    expect(findNumberIn(second.derived, skillBonusId)).toBe(findNumberIn(first.derived, skillBonusId))
  })
})
