// D&D 2024 LEVEL 1 -> 20 END-TO-END PROGRESSION ACCEPTANCE AUDIT
// (2026-10-02).
//
// Answers one question with an EXECUTABLE result, not a manual browser
// checklist: for each of the 12 real native-XPHB classes, if a real
// Level-1 character previews progression all the way to Level 20 --
// which choices SHOULD Eldra surface (derived from the real corpus + the
// checked-in Progression Coverage Ledger, dnd5e-2024-progression-
// coverage.ts), which DOES it actually surface (the real ProgressionPlan,
// built from the real on-disk Rules Package + the real RulesFacet corpus
// via `findRulesFacet`), and do those two ever disagree.
//
// Architecture mirrors character-progression-all-class-subclass.test.ts
// exactly: `assembleCharacter`/world-runtime/content-catalogue boundaries
// are mocked, the Rules Runtime itself is REAL (built from the actual
// `packages/eldra-dnd5e-2024` files on disk), and every class's own
// `RulesFacet` comes from the REAL, shipped `dnd5e-2024.ts` corpus --
// never a hand-typed fixture that could silently drift from either. ONE
// data-driven test body runs for all 12 classes; this file contains no
// twelve-synthetic-Wizard-copies pattern.
//
// THREE OUTCOMES, never collapsed into one judgment (this task's own
// explicit distinction):
//   1. IMPLEMENTED AND PRESENT       -- good, asserted as a hard pass.
//   2. BLOCKED/DEFERRED AND ABSENT   -- expected incompleteness, reported,
//                                       never a test failure on its own.
//   3. CLASSIFIED IMPLEMENTED, ABSENT -- a real regression; FAILS loudly.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'

const {
  assembleCharacterMock, getWorldRuntimeMock, saveCharacterProgressionMock,
  loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock,
  listContentPackBindingsForWorldMock, getWorldContentCatalogueMock
} = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  saveCharacterProgressionMock: vi.fn(),
  loadCharacterRulesChoicesMock: vi.fn(),
  saveCharacterRulesChoicesMock: vi.fn(),
  listContentPackBindingsForWorldMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn()
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

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import {
  confirmProgression,
  planProgression
} from '../../../server/utils/character-progression-plan'
import { getDerivedCharacterAtLevel, type DerivedCharacter } from '../../../server/utils/character-derived'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { parseContentRef, serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { DND5E_2024_PROGRESSION_COVERAGE } from '../../../app/lib/content-rules/dnd5e-2024-progression-coverage'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const WORLD_ID = '5'
const CHARACTER_ID = '42'
const FEAT_PACKAGE_ID = 'eldra.content.xphb'

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

function loadRealDefinitions(): Definition[] {
  return hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
}

function loadRealRuntime() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = loadRealDefinitions()
  const result = createWorldRuntime(manifest, definitions, WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: FEAT_PACKAGE_ID, packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

// Real, production-verified (read-only Directus read against Solaris's
// own bound Content Pack `eldra.solaris.xphb@1.0.8`, ALL-CLASS PROGRESSION
// CONTRACT AUDIT phase) -- the identical 48-subclass fixture
// character-progression-all-class-subclass.test.ts already proved against.
const REAL_SUBCLASSES_BY_CLASS: Record<string, string[]> = {
  'barbarian-xphb': ['path-of-the-berserker-xphb', 'path-of-the-wild-heart-xphb', 'path-of-the-world-tree-xphb', 'path-of-the-zealot-xphb'],
  'bard-xphb': ['college-of-dance-xphb', 'college-of-glamour-xphb', 'college-of-lore-xphb', 'college-of-valor-xphb'],
  'cleric-xphb': ['life-domain-xphb', 'light-domain-xphb', 'trickery-domain-xphb', 'war-domain-xphb'],
  'druid-xphb': ['circle-of-the-land-xphb', 'circle-of-the-moon-xphb', 'circle-of-the-sea-xphb', 'circle-of-the-stars-xphb'],
  'fighter-xphb': ['battle-master-xphb', 'champion-xphb', 'eldritch-knight-xphb', 'psi-warrior-xphb'],
  'monk-xphb': ['warrior-of-mercy-xphb', 'warrior-of-shadow-xphb', 'warrior-of-the-elements-xphb', 'warrior-of-the-open-hand-xphb'],
  'paladin-xphb': ['oath-of-devotion-xphb', 'oath-of-glory-xphb', 'oath-of-the-ancients-xphb', 'oath-of-vengeance-xphb'],
  'ranger-xphb': ['beast-master-xphb', 'fey-wanderer-xphb', 'gloom-stalker-xphb', 'hunter-xphb'],
  'rogue-xphb': ['arcane-trickster-xphb', 'assassin-xphb', 'soulknife-xphb', 'thief-xphb'],
  'sorcerer-xphb': ['aberrant-sorcery-xphb', 'clockwork-sorcery-xphb', 'draconic-sorcery-xphb', 'wild-magic-sorcery-xphb'],
  'warlock-xphb': ['archfey-patron-xphb', 'celestial-patron-xphb', 'fiend-patron-xphb', 'great-old-one-patron-xphb'],
  'wizard-xphb': ['abjurer-xphb', 'diviner-xphb', 'evoker-xphb', 'illusionist-xphb']
}

const ALL_12_CLASS_SLUGS = Object.keys(REAL_SUBCLASSES_BY_CLASS)

const ASI_FEAT_REF = { packageId: FEAT_PACKAGE_ID, slug: 'ability-score-improvement-xphb' }

// Shared between the catalogue fixture AND the blueprint's own `feats`
// slot builder below -- a feat's `featMechanics` (category/repeatable/
// prerequisiteGroups) must be IDENTICAL in both places, exactly as the
// real `assembleCharacter`/`resolveFeats` always resolves a blueprint feat
// slot's `entry` straight from the SAME catalogue
// (server/utils/character-assembly.ts). Two independently-hand-built
// copies could silently drift (this phase's own first attempt did
// exactly that -- the blueprint copy omitted `featMechanics` entirely,
// which made the real "an already-owned REPEATABLE feat stays legal"
// check in character-derived.ts read `repeatable: undefined` and
// incorrectly exclude Ability Score Improvement from its own later ASI
// thresholds' options).
const FEAT_CATALOGUE_ENTRIES = [
  // The one REAL general feat this audit's legal path needs -- Ability
  // Score Improvement's own real mechanics (general category, repeatable,
  // no prerequisite -- 2024 XPHB `feats.json`, verified this phase).
  baseEntry({
    title: 'Ability Score Improvement',
    slug: 'ability-score-improvement-xphb',
    featMechanics: { category: 'general', repeatable: true, prerequisiteGroups: [] }
  }),
  // SYNTHETIC PROBES, clearly labeled -- not real named 5e feats, used
  // ONLY to exercise prerequisite-filtering/repeatability behavior the
  // real catalogue would exercise identically through the same
  // `featMechanics` fields. Kept separate from the real ASI entry
  // above so the main Level 1->20 legal path never depends on them.
  baseEntry({
    title: 'Synthetic Probe: Strength Prerequisite',
    slug: 'synthetic-str-prereq-probe',
    featMechanics: {
      category: 'general', repeatable: false,
      prerequisiteGroups: [[{ kind: 'ability', ability: 'str', minimum: 15 }]]
    }
  }),
  baseEntry({
    title: 'Synthetic Probe: Non-Repeatable',
    slug: 'synthetic-non-repeatable-probe',
    featMechanics: { category: 'general', repeatable: false, prerequisiteGroups: [] }
  })
]

function catalogueForClass(classSlug: string) {
  const subclasses = (REAL_SUBCLASSES_BY_CLASS[classSlug] ?? []).map((slug) =>
    baseEntry({ title: slug, slug, parentClassSlug: classSlug })
  )
  return {
    worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [],
    feats: FEAT_CATALOGUE_ENTRIES,
    items: [], spells: [], monsters: [],
    subclasses
  }
}

// CHOICE ELIGIBILITY PHASE 2B -- a real, legal skill-proficiency answer
// for `classSlug`, derived GENERICALLY from that class's own real facet
// (never hand-picked per class): the first N options of its own real
// `choice:skill.proficiency` entry, where N is that entry's own `count`.
// Needed because Expertise's real prerequisite (`requiresActive`) now
// requires ACTUAL proficiency -- without this, Scholar/base-class
// Expertise would correctly have zero legal options for a character with
// none at all.
// CHOICE ELIGIBILITY PHASE 2B -- `choice:skill.proficiency` now declares
// `excludeIfAlreadyActive: true` (definitions.json), so a skill this
// fixture's own Background (Sage) already grants directly (Arcana,
// History) is correctly ABSENT from the class choice's own eligible
// options -- picking the naive first N of the RAW, unfiltered list could
// name one of those two, producing an answer the real eligibility filter
// then rejects. Filtered out here so this helper always returns a
// genuinely legal answer, exactly mirroring what the real engine would
// still offer.
const SAGE_BACKGROUND_GRANTS = ['value:skill.arcana.proficient', 'value:skill.history.proficient']

function realSkillProficiencyAnswer(classSlug: string): string[] {
  const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)
  const proficiencyChoice = facet?.choices?.find((c) => c.choiceSet === 'choice:skill.proficiency')
  const eligible = (proficiencyChoice?.from ?? []).filter((id) => !SAGE_BACKGROUND_GRANTS.includes(id))
  return eligible.slice(0, proficiencyChoice?.count ?? 0)
}

// `tentativeFeatAcquisitions` -- the REAL `assembleCharacter`
// (server/utils/character-assembly.ts) merges this exact argument into
// the returned blueprint's own TOP-LEVEL `feats` field (`resolveFeats`,
// distinct from `progression.feats`, the persisted bookkeeping list) --
// this is what makes an acquired feat's own RulesFacet (and therefore its
// NESTED ability-distribution choice, for Ability Score Improvement)
// actually reach the bridge and affect derived ability scores. Replicated
// here, since `assembleCharacter` itself is mocked at the module boundary
// and would otherwise silently drop every tentative feat acquisition.
function blueprintForClass(
  classSlug: string,
  tentativeFeatAcquisitions: readonly { choiceKey: string, ref: { packageId: string, slug: string } }[] = []
) {
  return {
    worldId: WORLD_ID,
    characterId: CHARACTER_ID,
    characterTitle: 'Level 1-20 Acceptance Audit Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved' as const,
      entry: baseEntry({ title: classSlug, slug: classSlug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', classSlug) ?? undefined })
    },
    // `rulesFacet` wired here (previously missing -- Sage's own real
    // Arcana + History grants never actually applied without it, found
    // while debugging the base-class Expertise pool below).
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'sage-xphb') ?? undefined }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 12, dex: 12, con: 14, int: 12, wis: 12, cha: 12 } },
    rulesChoices: {
      selections: {
        'class:choice:skill.proficiency': realSkillProficiencyAnswer(classSlug)
      }
    },
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: FEAT_PACKAGE_ID, slug: classSlug }, level: 1 }] },
    feats: tentativeFeatAcquisitions.map(({ choiceKey, ref }) => {
      // Resolved against the SAME catalogue entry `catalogueForClass`'s
      // own `feats` array uses (FEAT_CATALOGUE_ENTRIES) -- carries the
      // real `featMechanics`, exactly as the real `resolveSlot` always
      // resolves a blueprint feat slot's `entry` from the catalogue, never
      // from a bare re-built object (see this function's own header).
      const catalogueEntry = FEAT_CATALOGUE_ENTRIES.find((candidate) => candidate.slug === ref.slug)
      return {
        status: 'resolved' as const,
        entry: { ...catalogueEntry, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', ref.slug) ?? undefined },
        choiceKey
      }
    }),
    resources: null,
    packs: []
  }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  saveCharacterProgressionMock.mockReset()
  loadCharacterRulesChoicesMock.mockReset()
  saveCharacterRulesChoicesMock.mockReset()
  listContentPackBindingsForWorldMock.mockReset()
  getWorldContentCatalogueMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  listContentPackBindingsForWorldMock.mockResolvedValue([])
})

function useClass(classSlug: string) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueForClass(classSlug))
  // `mockImplementation`, not `mockResolvedValue` -- real `assembleCharacter`
  // is called with `(worldId, characterId, tentativeSubclassRef,
  // tentativeFeatAcquisitions)` on every preview/derive call
  // (character-derived.ts's own `getDerivedCharacterAtLevel`), and this
  // mock must read that 4th argument to merge tentative feat acquisitions
  // into the blueprint exactly as the real function does -- a static
  // `mockResolvedValue` would silently ignore every tentative feat pick.
  assembleCharacterMock.mockImplementation(async (
    _worldId: unknown,
    _characterId: unknown,
    _tentativeSubclassRef: unknown,
    tentativeFeatAcquisitions?: readonly { choiceKey: string, ref: { packageId: string, slug: string } }[]
  ) => ({
    available: true,
    blueprint: blueprintForClass(classSlug, tentativeFeatAcquisitions ?? [])
  }))
}

// ---------------------------------------------------------------------------
// REAL-CORPUS-DERIVED EXPECTATIONS -- never hand-copied. Reads the real,
// on-disk `progression:*` Definitions this class's own real facet
// (findRulesFacet) references, filtered to exactly the ChoiceSets the
// checked-in ledger (dnd5e-2024-progression-coverage.ts) classifies
// IMPLEMENTED for this class. This is "what SHOULD Eldra surface," derived
// from the real package + the real ledger, never asserted from memory.
// ---------------------------------------------------------------------------

type ExpectedChoice = { level: number, choiceSetId: string, count: number, from: string[] }

function expectedImplementedChoices(classSlug: string, definitions: Definition[]): ExpectedChoice[] {
  const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)
  const referencedProgressionIds = new Set(facet?.progression ?? [])
  const implementedRefs = new Set(
    DND5E_2024_PROGRESSION_COVERAGE
      .filter((entry) => entry.classSlug === classSlug && entry.status === 'IMPLEMENTED' && entry.implementationRef)
      .map((entry) => entry.implementationRef as string)
  )

  const expected: ExpectedChoice[] = []
  for (const definition of definitions) {
    if (definition.kind !== 'progression') continue
    if (!referencedProgressionIds.has(definition.id)) continue
    if (!implementedRefs.has(definition.id)) continue
    for (const row of definition.rows ?? []) {
      for (const choice of row.choices ?? []) {
        expected.push({ level: row.at as number, choiceSetId: choice.choiceSet, count: choice.count, from: choice.from ?? [] })
      }
    }
  }
  return expected.sort((a, b) => a.level - b.level)
}

// The real, checked-in blocker classification for this class -- reported,
// never asserted absent-as-a-failure (BLOCKED/DEFERRED CONTRACT: "report
// them explicitly... but do NOT fail merely because they are absent").
function blockedLedgerEntries(classSlug: string) {
  return DND5E_2024_PROGRESSION_COVERAGE.filter(
    (entry) => entry.classSlug === classSlug && entry.status !== 'IMPLEMENTED'
  )
}

// ---------------------------------------------------------------------------
// LEGAL ANSWER BUILDER -- generic, computed directly from real key formats
// (progressionChoiceKey for a Progression-row choice; `feat:${featChoiceKey}:
// ${nestedChoiceSetId}` for a feat's own nested choice --
// server/utils/character-progression-plan.ts's own FEAT ACQUISITIONS block,
// confirmed this phase by direct read, never guessed). Answers ONLY the
// three ChoiceSets currently classified IMPLEMENTED anywhere in the real
// corpus (choice:class.subclass, choice:feat.selection, choice:skill.
// expertise, plus feat.selection's own nested choice:feat.asi-ability-
// increase) -- anything else is deliberately left unanswered, never faked,
// per this task's own "do not fake answers for unsupported mechanics."
// ---------------------------------------------------------------------------

function legalAnswersFor(expected: ExpectedChoice[], subclassSlug: string, classSlug: string): Record<string, string[]> {
  const answers: Record<string, string[]> = {}
  // CHOICE ELIGIBILITY PHASE 2B -- Expertise's own real prerequisite
  // (`requiresActive`) means a legal answer must name a skill THIS
  // character is actually proficient in. The pool: the class's own real
  // proficiency picks (`realSkillProficiencyAnswer`) PLUS Sage's own real
  // direct grants (Arcana + History, app/lib/content-rules/dnd5e-2024.ts
  // -- this fixture's own Background, unconditionally active via this
  // bridge's own cross-facet pre-pass) -- a real Bard/Rogue needs BOTH
  // sources: its own 3-4 class skills are not enough to fill two DISJOINT
  // "two more, excluding any already-Expertise'd skill" picks (L2 AND L9)
  // on their own. `excludeIfAlreadyActive` means each row consumes a
  // FRESH, not-yet-used subset -- tracked here by simply shifting through
  // the pool in level order (`expected` is already level-ascending).
  const skillPool = [...new Set([
    ...realSkillProficiencyAnswer(classSlug).map((id) => id.replace('.proficient', '.expertise')),
    'value:skill.arcana.expertise', 'value:skill.history.expertise'
  ])]
  const usedSkills = new Set<string>()
  for (const { level, choiceSetId, count, from } of expected) {
    const key = progressionChoiceKey('class', level, choiceSetId)
    if (choiceSetId === 'choice:class.subclass') {
      answers[key] = [serializeContentRef({ packageId: FEAT_PACKAGE_ID, slug: subclassSlug })]
    } else if (choiceSetId === 'choice:feat.selection') {
      answers[key] = [serializeContentRef(ASI_FEAT_REF)]
      // Ability Score Improvement's own nested ability-distribution choice
      // -- real key format, not discovered empirically: `feat:${the
      // ACQUIRING choice's own key}:${the feat facet's own nested
      // choiceSetId}` (character-progression-plan.ts's own `feat:${acquisition.
      // choiceKey}:` prefix check). Alternates STR/DEX then CON/INT across
      // levels purely so a representative test later can observe more than
      // one ability actually move -- the Rules Engine applies no
      // real-RAW distinction between which two abilities a feat-selection
      // ASI increases.
      const nestedKey = `feat:${key}:choice:feat.asi-ability-increase`
      answers[nestedKey] = level % 8 < 4
        ? ['source:asi.increase.str', 'source:asi.increase.dex']
        : ['source:asi.increase.con', 'source:asi.increase.int']
    } else if (choiceSetId === 'choice:skill.expertise') {
      // `count` legal, already-proficient, NOT-YET-USED skills, filtered
      // to THIS row's own real legal `from` list (Wizard's Scholar
      // restricts to 6 named skills; the base-class rows authored this
      // phase do not restrict at all) -- 1 for Wizard's own Scholar row,
      // 2 for every base-class Expertise row this phase authors (Bard/
      // Ranger/Rogue). Drawn from the shared pool minus whatever an
      // EARLIER row (lower level, same class) already consumed, so a
      // class with more than one Expertise row (Bard: L2 + L9) gets two
      // disjoint picks, never the same skill twice.
      const legalForThisRow = skillPool.filter((id) => from.includes(id) && !usedSkills.has(id))
      const picked = legalForThisRow.slice(0, count)
      answers[key] = picked
      for (const id of picked) usedSkills.add(id)
    }
    // Anything else: left unanswered on purpose -- see this function's
    // own header.
  }
  return answers
}

// Local mirror of character-progression-plan.ts's own (unexported)
// `extractTentativeFeatAcquisitions` -- needed only by tests that call
// `getDerivedCharacterAtLevel` DIRECTLY (bypassing `planProgression`,
// which normally derives this itself from the same `tentativeAnswers`
// map before evaluating). A feat's own facet is consumed only via this
// explicit acquisitions list, never merely by its nested choice answer
// being present in `tentativeAnswers`.
function extractFeatAcquisitions(answers: Record<string, string[]>): { choiceKey: string, ref: { packageId: string, slug: string } }[] {
  const acquisitions: { choiceKey: string, ref: { packageId: string, slug: string } }[] = []
  for (const [key, selected] of Object.entries(answers)) {
    if (!key.endsWith(':choice:feat.selection')) continue
    if (selected.length !== 1) continue
    const ref = parseContentRef(selected[0]!)
    if (ref) acquisitions.push({ choiceKey: key, ref })
  }
  return acquisitions
}

function findNumberIn(derived: DerivedCharacter, id: string): number | null {
  for (const entries of Object.values(derived.byCategory)) {
    const entry = entries?.find((candidate) => candidate.id === id)
    if (entry && typeof entry.value === 'number') return entry.value
  }
  return null
}

describe.each(ALL_12_CLASS_SLUGS)('LEVEL 1 -> 20 ACCEPTANCE -- %s', (classSlug) => {
  const definitions = loadRealDefinitions()
  const expected = expectedImplementedChoices(classSlug, definitions)
  const subclassSlug = REAL_SUBCLASSES_BY_CLASS[classSlug]![0]!

  beforeEach(() => useClass(classSlug))

  it('IMPLEMENTED CONTRACT -- every ledger-IMPLEMENTED choice for this class is actually present in the raw (unanswered) Level 1->20 plan, at the right level/kind/count, with non-empty options', async () => {
    expect(expected.length, 'this class has at least one real IMPLEMENTED choice to verify').toBeGreaterThan(0)

    const result = await planProgression(WORLD_ID, CHARACTER_ID, 20)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const { level, choiceSetId, count } of expected) {
      const step = result.plan.steps.find((s) => s.level === level)
      expect(step, `REGRESSION: no plan step at all for level ${level} (expected ${choiceSetId})`).toBeDefined()

      const key = progressionChoiceKey('class', level, choiceSetId)
      const choice = step!.requiredChoices.find((c) => c.id === key)
      expect(
        choice,
        `REGRESSION: ledger classifies ${classSlug}'s '${choiceSetId}' as IMPLEMENTED at level ${level}, but the real plan declares no such required choice.`
      ).toBeDefined()
      expect(choice!.count).toBe(count)
      expect(choice!.options.length).toBeGreaterThan(0)
      for (const option of choice!.options) {
        expect(option.id.length).toBeGreaterThan(0)
        expect(option.label.length).toBeGreaterThan(0)
      }
    }

    // Plan starts invalid -- nothing answered yet.
    expect(result.plan.valid).toBe(false)
  })

  it('BLOCKED/DEFERRED CONTRACT -- classified blockers for this class are reported, and never silently promoted to a required choice the plan would need answered', async () => {
    const blocked = blockedLedgerEntries(classSlug)
    expect(blocked.length, 'every class has at least one classified gap today (Epic Boon, if nothing else)').toBeGreaterThan(0)

    const result = await planProgression(WORLD_ID, CHARACTER_ID, 20)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // A blocked/deferred mechanic must not somehow already be a REQUIRED
    // choice the raw plan declares -- if it were, it would need its own
    // IMPLEMENTED ledger entry, not a blocked one. This is the honest
    // "reported, not failed" check: the blocker exists (asserted above,
    // via the ledger itself -- enforced exhaustively by
    // tests/rules/dnd5e-2024-progression-coverage.test.ts), and the plan
    // correctly declares nothing for it.
    const allDeclaredChoiceSetIds = new Set(
      result.plan.steps.flatMap((step) => step.requiredChoices.map((c) => c.choiceSetId))
    )
    for (const entry of blocked) {
      if (entry.implementationRef && entry.implementationRef.startsWith('choice:')) {
        expect(allDeclaredChoiceSetIds.has(entry.implementationRef)).toBe(false)
      }
    }
  })

  it('EPIC BOON -- Level 19 declares no ordinary ASI/General-Feat requirement (the real corpus\'s own Epic Boon feature is a classified gap, not silently handled as plain ASI)', async () => {
    const result = await planProgression(WORLD_ID, CHARACTER_ID, 20)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const level19 = result.plan.steps.find((s) => s.level === 19)
    expect(level19).toBeDefined()
    const featChoiceAt19 = level19!.requiredChoices.find((c) => c.choiceSetId === 'choice:feat.selection')
    expect(featChoiceAt19, 'Level 19 must not declare an ordinary Feat Selection -- Epic Boon is a distinct, currently-unimplemented mechanic').toBeUndefined()

    const epicBoonEntry = DND5E_2024_PROGRESSION_COVERAGE.find((e) => e.classSlug === classSlug && e.featureName === 'Epic Boon')
    expect(epicBoonEntry, 'Epic Boon must be explicitly classified in the ledger for this class').toBeDefined()
    expect(epicBoonEntry!.status).not.toBe('IMPLEMENTED')
  })

  it('PLAN VALIDITY -- answering every real IMPLEMENTED choice resolves the plan to valid, and Confirm succeeds through Level 20', async () => {
    const answers = legalAnswersFor(expected, subclassSlug, classSlug)
    const result = await planProgression(WORLD_ID, CHARACTER_ID, 20, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Every expected choice must now read as answered.
    for (const { level, choiceSetId } of expected) {
      const key = progressionChoiceKey('class', level, choiceSetId)
      const step = result.plan.steps.find((s) => s.level === level)!
      const choice = step.requiredChoices.find((c) => c.id === key)!
      expect(choice.answered, `${classSlug}'s '${choiceSetId}' at level ${level} did not resolve with a legal answer`).toBe(true)
    }

    // OUTCOME A vs B (this task's own PLAN VALIDITY section): report
    // honestly which one this class lands on, never assume.
    expect(result.plan.valid, `${classSlug}: expected OUTCOME A (valid) -- every currently-declared required choice was answered; if this is false, some IMPLEMENTED choice was missed above or a new requirement appeared unaccounted for`).toBe(true)

    const confirmResult = await confirmProgression(WORLD_ID, CHARACTER_ID, 20, result.plan.fingerprint, answers)
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return

    // DEPENDENT EVALUATION -- subclass selected at L3 remains active
    // through L20 (the persisted progression record itself, not merely
    // the preview).
    expect(confirmResult.progression.classes[0]!.subclassRef).toEqual({ packageId: FEAT_PACKAGE_ID, slug: subclassSlug })

    // DEPENDENT EVALUATION -- every ASI pick remains OWNED (repeated
    // feats remain owned): one `feats[]` entry per real ASI threshold this
    // class has.
    const asiThresholds = expected.filter((e) => e.choiceSetId === 'choice:feat.selection').length
    expect(confirmResult.progression.feats ?? []).toHaveLength(asiThresholds)
    for (const feat of confirmResult.progression.feats ?? []) {
      expect(feat.featRef).toEqual(ASI_FEAT_REF)
    }
  })

  it('NESTED ASI CHOICES -- every ASI-tier nested ability-distribution key is unique, never colliding across levels', () => {
    const asiLevels = expected.filter((e) => e.choiceSetId === 'choice:feat.selection').map((e) => e.level)
    const nestedKeys = asiLevels.map((level) => {
      const featKey = progressionChoiceKey('class', level, 'choice:feat.selection')
      return `feat:${featKey}:choice:feat.asi-ability-increase`
    })
    expect(new Set(nestedKeys).size).toBe(nestedKeys.length)
  })

  it('SUBCLASS-INTERNAL PROGRESSION -- any later subclass-internal choice-bearing feature for the SELECTED subclass is classified in the ledger, never silently surfaced or silently dropped', () => {
    const internalEntries = DND5E_2024_PROGRESSION_COVERAGE.filter(
      (entry) => entry.id.startsWith(`${classSlug}:${subclassSlug}:`)
    )
    // Not every subclass has a discovered subclass-internal choice (only 7
    // across all 48 do) -- absence here is legal; PRESENCE must be
    // ENGINE_BLOCKED (the one status this mechanism is currently capable
    // of), never IMPLEMENTED (that would require subclass-internal
    // feature-level gating, which does not exist).
    for (const entry of internalEntries) {
      expect(entry.status).toBe('ENGINE_BLOCKED')
      expect(entry.blockerReason).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// LEVEL 20 DERIVED-VALUE / RESOURCE SCALING -- a representative subset
// (every resource category the task names at least once), not all 12 --
// this is a composition regression check, not a full RAW-stat audit.
// ---------------------------------------------------------------------------

describe('LEVEL 20 DERIVATION -- representative scaling composes correctly through a real multi-level hypothetical evaluation', () => {
  it('Barbarian: proficiency bonus/HP scale, and Rage\'s own max scales from 2 (L1) to 6 (L20) -- real class-barbarian.json classTableGroups values', async () => {
    useClass('barbarian-xphb')
    const atLevel1 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 1)
    const atLevel20 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 20)
    expect(atLevel1.available && atLevel20.available).toBe(true)
    if (!atLevel1.available || !atLevel20.available) return

    const rageAtL1 = atLevel1.derived.resources.find((r) => r.id === 'resource:rage')
    const rageAtL20 = atLevel20.derived.resources.find((r) => r.id === 'resource:rage')
    expect(rageAtL1?.max).toBe(2)
    expect(rageAtL20?.max).toBe(6)

    expect(findNumberIn(atLevel1.derived, 'value:proficiency_bonus')).toBe(2)
    expect(findNumberIn(atLevel20.derived, 'value:proficiency_bonus')).toBe(6)
    const hpAtL1 = findNumberIn(atLevel1.derived, 'value:hit_points.max')
    const hpAtL20 = findNumberIn(atLevel20.derived, 'value:hit_points.max')
    expect(hpAtL1).not.toBeNull()
    expect(hpAtL20).not.toBeNull()
    expect(hpAtL20! > hpAtL1!).toBe(true)
  })

  it('Fighter: Action Surge appears at L2, Indomitable appears at L9 -- resource ACQUISITION threshold, not merely max scaling', async () => {
    useClass('fighter-xphb')
    const atLevel1 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 1)
    const atLevel2 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 2)
    const atLevel9 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 9)
    expect(atLevel1.available && atLevel2.available && atLevel9.available).toBe(true)
    if (!atLevel1.available || !atLevel2.available || !atLevel9.available) return

    expect(atLevel1.derived.resources.find((r) => r.id === 'resource:action_surge')).toBeUndefined()
    expect(atLevel2.derived.resources.find((r) => r.id === 'resource:action_surge')).toBeDefined()
    expect(atLevel2.derived.resources.find((r) => r.id === 'resource:indomitable')).toBeUndefined()
    expect(atLevel9.derived.resources.find((r) => r.id === 'resource:indomitable')).toBeDefined()
  })

  it('Monk: Focus Points acquired at L2 and scale with level', async () => {
    useClass('monk-xphb')
    const atLevel1 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 1)
    const atLevel2 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 2)
    const atLevel20 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 20)
    expect(atLevel1.available && atLevel2.available && atLevel20.available).toBe(true)
    if (!atLevel1.available || !atLevel2.available || !atLevel20.available) return

    expect(atLevel1.derived.resources.find((r) => r.id === 'resource:focus_points')).toBeUndefined()
    const focusAtL2 = atLevel2.derived.resources.find((r) => r.id === 'resource:focus_points')
    const focusAtL20 = atLevel20.derived.resources.find((r) => r.id === 'resource:focus_points')
    expect(focusAtL2).toBeDefined()
    expect(focusAtL20).toBeDefined()
    expect(focusAtL20!.max > focusAtL2!.max).toBe(true)
  })

  it('Sorcerer: Sorcery Points acquired at L2 and scale with level', async () => {
    useClass('sorcerer-xphb')
    const atLevel1 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 1)
    const atLevel2 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 2)
    const atLevel20 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 20)
    expect(atLevel1.available && atLevel2.available && atLevel20.available).toBe(true)
    if (!atLevel1.available || !atLevel2.available || !atLevel20.available) return

    expect(atLevel1.derived.resources.find((r) => r.id === 'resource:sorcery_points')).toBeUndefined()
    const spAtL2 = atLevel2.derived.resources.find((r) => r.id === 'resource:sorcery_points')
    const spAtL20 = atLevel20.derived.resources.find((r) => r.id === 'resource:sorcery_points')
    expect(spAtL2).toBeDefined()
    expect(spAtL20!.max > spAtL2!.max).toBe(true)
  })

  it('Paladin: Lay on Hands is always-on from L1 and its pool scales with level (5 x level)', async () => {
    useClass('paladin-xphb')
    const atLevel1 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 1)
    const atLevel20 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 20)
    expect(atLevel1.available && atLevel20.available).toBe(true)
    if (!atLevel1.available || !atLevel20.available) return

    const lohAtL1 = atLevel1.derived.resources.find((r) => r.id === 'resource:lay_on_hands')
    const lohAtL20 = atLevel20.derived.resources.find((r) => r.id === 'resource:lay_on_hands')
    expect(lohAtL1?.max).toBe(5)
    expect(lohAtL20?.max).toBe(100)
  })

  it('Ranger: Tireless is acquired at L10, not before', async () => {
    useClass('ranger-xphb')
    const atLevel9 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 9)
    const atLevel10 = await getDerivedCharacterAtLevel(WORLD_ID, CHARACTER_ID, 10)
    expect(atLevel9.available && atLevel10.available).toBe(true)
    if (!atLevel9.available || !atLevel10.available) return

    expect(atLevel9.derived.resources.find((r) => r.id === 'resource:tireless')).toBeUndefined()
    expect(atLevel10.derived.resources.find((r) => r.id === 'resource:tireless')).toBeDefined()
  })

  it('DEPENDENT EVALUATION -- an ASI picked at an earlier level affects the LATER derived ability value (Barbarian, +1 STR/+1 DEX at every real ASI threshold)', async () => {
    useClass('barbarian-xphb')
    const definitions = loadRealDefinitions()
    const expected = expectedImplementedChoices('barbarian-xphb', definitions)
    const answers = legalAnswersFor(expected, REAL_SUBCLASSES_BY_CLASS['barbarian-xphb']![0]!, 'barbarian-xphb')

    const atLevel20 = await getDerivedCharacterAtLevel(
      WORLD_ID, CHARACTER_ID, 20, answers,
      undefined, extractFeatAcquisitions(answers)
    )
    expect(atLevel20.available).toBe(true)
    if (!atLevel20.available) return

    const asiThresholds = expected.filter((e) => e.choiceSetId === 'choice:feat.selection').length
    expect(asiThresholds).toBe(4) // Barbarian: real standard ASI cadence 4/8/12/16

    // Half the thresholds applied STR/DEX, half applied CON/INT (the
    // alternation in legalAnswersFor) -- base 12/12/14/12 -> +2 STR, +2
    // DEX, +2 CON, +2 INT for 4 thresholds.
    expect(findNumberIn(atLevel20.derived, 'value:ability.str')).toBe(14)
    expect(findNumberIn(atLevel20.derived, 'value:ability.dex')).toBe(14)
  })
})

// ---------------------------------------------------------------------------
// FEAT MECHANICS -- prerequisite filtering / repeatability, verified
// against the real `isPrerequisiteSatisfied`/repeatable-check machinery
// (character-progression-plan.ts) using two SYNTHETIC probe feats (clearly
// labeled, never claimed as real named 5e feats -- the real ASI path above
// never depends on either).
// ---------------------------------------------------------------------------

describe('FEAT MECHANICS -- prerequisite filtering and repeatability (synthetic probes)', () => {
  beforeEach(() => useClass('fighter-xphb')) // Fighter: real ASI at levels 4/6/8/12/14/16, gives room for two independent probes

  // Fighter's own real Level-3 Subclass requirement is a SEPARATE,
  // unrelated IMPLEMENTED choice this walk also crosses -- every test
  // below answers it too (Battle Master, arbitrary among the 4 real
  // options) purely so `confirmProgression`'s own "the WHOLE plan must be
  // valid" gate is satisfied, letting these tests isolate feat-mechanics
  // behavior specifically rather than tripping on an unrelated, already-
  // proven-working requirement.
  const subclassKey = progressionChoiceKey('class', 3, 'choice:class.subclass')
  const subclassAnswer = { [subclassKey]: [serializeContentRef({ packageId: FEAT_PACKAGE_ID, slug: 'battle-master-xphb' })] }

  it('a feat whose ability prerequisite is NOT met is rejected at Confirm, even though the plan optimistically marks the choice answered', async () => {
    const featKey = progressionChoiceKey('class', 4, 'choice:feat.selection')
    const probeRef = { packageId: FEAT_PACKAGE_ID, slug: 'synthetic-str-prereq-probe' }
    const answers = { ...subclassAnswer, [featKey]: [serializeContentRef(probeRef)] }

    const planResult = await planProgression(WORLD_ID, CHARACTER_ID, 4, answers)
    expect(planResult.ok).toBe(true)
    if (!planResult.ok) return

    const confirmResult = await confirmProgression(WORLD_ID, CHARACTER_ID, 4, planResult.plan.fingerprint, answers)
    expect(confirmResult.ok).toBe(false)
    if (confirmResult.ok) return
    expect(confirmResult.reason).toBe('illegal-feat-selection')
  })

  it('a non-repeatable feat cannot be legally selected a second time at a later ASI threshold', async () => {
    const firstKey = progressionChoiceKey('class', 4, 'choice:feat.selection')
    const secondKey = progressionChoiceKey('class', 6, 'choice:feat.selection')
    const probeRef = { packageId: FEAT_PACKAGE_ID, slug: 'synthetic-non-repeatable-probe' }
    const answers = {
      ...subclassAnswer,
      [firstKey]: [serializeContentRef(probeRef)],
      [secondKey]: [serializeContentRef(probeRef)]
    }

    const planResult = await planProgression(WORLD_ID, CHARACTER_ID, 6, answers)
    expect(planResult.ok).toBe(true)
    if (!planResult.ok) return

    // Caught even earlier than Confirm's own ownership check: the real
    // option-resolution logic (character-derived.ts's own `ownedFeatRefs`)
    // already excludes a non-repeatable feat already owned elsewhere from
    // the LEGAL OPTIONS of a later feat-selection choice, so the Level 6
    // choice reads `answered: false` (the submitted answer is no longer
    // among its own options) and the plan itself is invalid -- Confirm
    // never even reaches its own `illegal-feat-selection` check for this
    // case. A stricter, earlier rejection than this test originally
    // assumed, verified by reading the real result rather than guessing.
    const level6 = planResult.plan.steps.find((s) => s.level === 6)!
    const secondChoice = level6.requiredChoices.find((c) => c.id === secondKey)!
    expect(secondChoice.answered).toBe(false)
    expect(secondChoice.options).not.toContain(serializeContentRef(probeRef))
    expect(planResult.plan.valid).toBe(false)

    const confirmResult = await confirmProgression(WORLD_ID, CHARACTER_ID, 6, planResult.plan.fingerprint, answers)
    expect(confirmResult.ok).toBe(false)
    if (confirmResult.ok) return
    expect(confirmResult.reason).toBe('unresolved-choices')
  })

  it('the SAME repeatable feat (Ability Score Improvement) CAN be legally selected at two different ASI thresholds', async () => {
    const firstKey = progressionChoiceKey('class', 4, 'choice:feat.selection')
    const secondKey = progressionChoiceKey('class', 6, 'choice:feat.selection')
    const answers = {
      ...subclassAnswer,
      [firstKey]: [serializeContentRef(ASI_FEAT_REF)],
      [secondKey]: [serializeContentRef(ASI_FEAT_REF)],
      [`feat:${firstKey}:choice:feat.asi-ability-increase`]: ['source:asi.increase.str', 'source:asi.increase.dex'],
      [`feat:${secondKey}:choice:feat.asi-ability-increase`]: ['source:asi.increase.con', 'source:asi.increase.wis']
    }

    const planResult = await planProgression(WORLD_ID, CHARACTER_ID, 6, answers)
    expect(planResult.ok).toBe(true)
    if (!planResult.ok) return

    const confirmResult = await confirmProgression(WORLD_ID, CHARACTER_ID, 6, planResult.plan.fingerprint, answers)
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return
    expect(confirmResult.progression.feats ?? []).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// BOB -- the one manual browser acceptance contract this audit authorizes.
// Derives the exact expected Level 1->20 sequence from the real plan + the
// real ledger -- never from memory.
// ---------------------------------------------------------------------------

describe('BOB ACCEPTANCE -- Barbarian, Level 1 -> 20, the exact browser-visible sequence', () => {
  beforeEach(() => useClass('barbarian-xphb'))

  it('produces the real SHOULD-APPEAR sequence: Subclass at L3, Ability Score Improvement at L4/8/12/16, nothing else', async () => {
    const result = await planProgression(WORLD_ID, CHARACTER_ID, 20)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sequence = result.plan.steps
      .filter((step) => step.requiredChoices.length > 0)
      .map((step) => ({ level: step.level, choiceSetIds: step.requiredChoices.map((c) => c.choiceSetId) }))

    expect(sequence).toEqual([
      { level: 3, choiceSetIds: ['choice:class.subclass'] },
      { level: 4, choiceSetIds: ['choice:feat.selection'] },
      { level: 8, choiceSetIds: ['choice:feat.selection'] },
      { level: 12, choiceSetIds: ['choice:feat.selection'] },
      { level: 16, choiceSetIds: ['choice:feat.selection'] }
    ])
  })

  it('every OTHER real Barbarian corpus feature (Weapon Mastery, Epic Boon, subclass-internal features) is a classified KNOWN-MISSING gap, not silently absent', () => {
    const blocked = blockedLedgerEntries('barbarian-xphb')
    const featureNames = blocked.map((entry) => entry.featureName)
    expect(featureNames).toContain('Weapon Mastery')
    expect(featureNames).toContain('Epic Boon')
    for (const entry of blocked) {
      expect(entry.blockerReason, `${entry.featureName} must have a stated blocker reason`).toBeTruthy()
    }
  })
})
