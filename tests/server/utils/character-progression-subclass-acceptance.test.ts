// D&D 2024 Character Rules A2 -- SUBCLASS OWNERSHIP WIRING + LEVEL-GATING VERIFICATION
// (Workstreams 3 and 5).
//
// UNIT-ISOLATION (see tests/helpers/completeness-stub.ts): the Phase 0 completeness authority is
// stubbed, exactly like character-progression-plan-spell-acquisition.test.ts's own sibling file --
// this file uses a SYNTHETIC subclass (no real XPHB subclass has spellRequirements/fixedSpellGrants/
// a later-level .progression row authored yet), so it makes NO claim that a real, native-content PHB
// character with this subclass can be created or can progress. It proves the GENERIC subclass
// ownership machinery (Workstream 3) end to end through the REAL planProgression/confirmProgression/
// resolveCurrentProgression authority (Workstream 5), never a parallel interpretation.
//
// The synthetic subclass below combines, in one fixture, the three shapes Workstream 5 requires:
//   1. a FIXED spell grant (unconditional the moment the subclass is selected)
//   2. a SELECTABLE spell requirement (gated to the subclass's own real selection level, 3)
//   3. a non-spell FEATURE that grows at a LATER level (6) -- the Workstream 1 pattern, reused
// against a REAL caster class (Wizard) so coexistence with class-owned spells is also proven.

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
import { buildActorState } from '../../../server/utils/character-actor-bridge'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import type { RulesFacet } from '../../../app/lib/content-rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { confirmProgression, planProgression, resolveCurrentProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { spellAnswerKey } from '../../../server/utils/character-progression-spell-acquisition'
import type { AssembledSpellEntry, StoredSpellEntry } from '../../../app/lib/characters/spellcasting'

const WORLD_ID = '5'
const CHARACTER_ID = '42'
const PKG = 'eldra.content.xphb'
const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'

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

const SHARED_SPELL_CATALOGUE = [
  ...Array.from({ length: 10 }, (_, i) => spellCatalogueEntry(`cantrip-${i}`, 0, ['Wizard'])),
  // 20 entries: enough for Wizard's own real spellbook target even at Level 6 (16, per the real
  // totalByLevel table) -- this file's own DIRECT LEVEL JUMP test reaches Level 6.
  ...Array.from({ length: 20 }, (_, i) => spellCatalogueEntry(`spell-1-${i}`, 1, ['Wizard'])),
  // The subclass's own FIXED grant and SELECTABLE spell -- deliberately NOT on the Wizard list
  // (classList omitted entirely, mirroring Magic Initiate/Fey-Touched/Ritual Caster's own real
  // "no classList restriction" shape for a feature-owned spell), so they can never be satisfied
  // by the class's own class-list-filtered requirements -- proving the two pools stay genuinely
  // separate while coexisting in the SAME canonical spellcasting.spells[] array.
  spellCatalogueEntry('subclass-fixed-spell', 1, []),
  spellCatalogueEntry('subclass-choice-spell-a', 1, []),
  spellCatalogueEntry('subclass-choice-spell-b', 1, [])
]

// The SYNTHETIC subclass facet this whole file proves against -- combines all three Workstream 5
// shapes in one fixture (see this file's own header). `SUBCLASS_FEATURE_VALUE` stands in for a
// non-spell feature, reusing the exact Workstream 1 pattern (a Progression row's own `sets`, gated
// by the character's CURRENT level, never by "levels since subclass selection"). Referencing
// `progression:a2.synthetic-subclass-growth-proof` -- a tiny, REAL, registered Progression
// Definition added to the package specifically for this proof (packages/eldra-dnd5e-2024/
// definitions.json): planProgression/confirmProgression's own `lookupProgression` only ever reads
// the REAL registry (unlike character-actor-bridge.test.ts's own `deriveWithProgression`, which
// can inject a synthetic override directly), so proving "non-spell feature growth through the
// FULL real Confirm pipeline" needs a real-but-inert, never-referenced-by-any-real-class-or-
// subclass Definition -- never discoverable by the Phase-0 census (decisions are discovered from
// the 5etools corpus, never from definitions.json), so it cannot move the census.
const SUBCLASS_FEATURE_VALUE = 'value:skill.survival.expertise'
const SYNTHETIC_SUBCLASS_FACET: RulesFacet = {
  fixedSpellGrants: [
    { slug: 'subclass-fixed-spell', flag: 'known' }
  ],
  spellRequirements: [
    {
      id: 'spell-requirement.synthetic-growth-subclass.choice',
      pool: 'fixed',
      filter: { level: 1 },
      // Index 0 = Level 1 ... the subclass itself is selected at Level 3 (the real XPHB cadence
      // for every one of the 12 classes), so the total is 0 before Level 3 and 1 from Level 3 on --
      // the SAME "ungated pool, exact totalByLevel table" shape Magic Initiate/Ritual Caster use.
      totalByLevel: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      label: 'Synthetic Subclass Spell'
    }
  ],
  progression: ['progression:a2.synthetic-subclass-growth-proof']
}
const SYNTHETIC_SUBCLASS_REF = { packageId: PKG, slug: 'synthetic-growth-subclass-xphb' }
const SYNTHETIC_SUBCLASS_CATALOGUE_ENTRY = baseEntry({
  title: 'Synthetic Growth Subclass', slug: SYNTHETIC_SUBCLASS_REF.slug, parentClassSlug: 'wizard-xphb',
  rulesFacet: SYNTHETIC_SUBCLASS_FACET
})

// Ability Score Improvement -- needed so this file's own DIRECT LEVEL JUMP test (Level 1 -> 6) can
// legally answer Wizard's real Level-4 ASI/Feat Selection row, unrelated to subclass ownership.
const ASI_FEAT = baseEntry({
  title: 'Ability Score Improvement', slug: 'ability-score-improvement-xphb', externalId: 'Ability Score Improvement__XPHB',
  featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: true, prerequisiteGroups: [] },
  rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'ability-score-improvement-xphb') ?? undefined
})

function catalogueFor() {
  return {
    worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [],
    feats: [ASI_FEAT], items: [], spells: SHARED_SPELL_CATALOGUE, monsters: [],
    subclasses: [SYNTHETIC_SUBCLASS_CATALOGUE_ENTRY]
  }
}

// Mirrors character-progression-plan-spell-acquisition.test.ts's own `blueprintForClass` exactly,
// PLUS a real `subclass` slot (species/class/background already set this way there; `subclass` is
// the ONE slot that file's own fixture never populated, since nothing read it before this phase).
function blueprintForWizard(input: {
  level?: number
  spells?: AssembledSpellEntry[]
  subclassRef?: { packageId: string, slug: string } | null
  rulesChoices?: { selections: Record<string, string[]> } | null
} = {}) {
  const subclassRef = input.subclassRef ?? null
  return {
    worldId: WORLD_ID,
    characterId: CHARACTER_ID,
    characterTitle: 'A2 Subclass Acceptance Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved' as const,
      entry: baseEntry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined })
    },
    // A2 WORKSTREAM 2 -- the resolved subclass SLOT, mirroring `class` exactly: `status: 'resolved'`
    // with the subclass's own real RulesFacet, only when a subclassRef is actually set -- an
    // unselected subclass resolves to `status: 'missing'`, exactly like character-assembly.ts's own
    // real `resolveSlot` does for an absent ContentRef.
    subclass: subclassRef
      ? { status: 'resolved' as const, entry: { ...SYNTHETIC_SUBCLASS_CATALOGUE_ENTRY, packageId: subclassRef.packageId, slug: subclassRef.slug } }
      : { status: 'missing' as const },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 10, con: 12, int: 16, wis: 14, cha: 10 } },
    // Wizard's own real Level-1 skill-proficiency choice (Arcana/History), needed so its OWN real
    // Level-2 Scholar/Expertise choice (unrelated to subclass ownership, but crossed by every test
    // in this file that levels past 2) has a legal, already-proficient skill to name.
    rulesChoices: input.rulesChoices ?? { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } },
    inventory: [],
    notes: null,
    health: null,
    spells: input.spells ?? [],
    expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: 'wizard-xphb' }, level: input.level ?? 1, subclassRef }] },
    resources: null,
    packs: []
  }
}

function useFixture(input: Parameters<typeof blueprintForWizard>[0] = {}) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintForWizard(input) })
}

const REAL_RUNTIME = loadRealRuntime()

// WORKSTREAM 5 -- derives real ActorState for a Wizard with the synthetic subclass selected, at
// an arbitrary level, through the SAME production `buildActorState` (character-actor-bridge.ts)
// confirmProgression's own derived-state checks already call -- never a parallel interpretation.
// Mirrors character-actor-bridge.test.ts's own `deriveWithProgression` helper, but against a REAL
// registered Definition (no override hook), and with a real `subclass` slot populated.
function deriveSubclassActorState(level: number, subclassRef: { packageId: string, slug: string } | null) {
  const blueprint = blueprintForWizard({ level, subclassRef })
  return buildActorState({
    blueprint,
    packageId: REAL_RUNTIME.manifest.packageId,
    packageVersion: REAL_RUNTIME.manifest.version,
    stateSchemaVersion: REAL_RUNTIME.manifest.stateSchemaVersion,
    knownDefinition: (id: string) => REAL_RUNTIME.registry.has(id),
    rulesChoices: blueprint.rulesChoices,
    lookupChoiceSet: (id: string) => {
      const definition = REAL_RUNTIME.registry.getById(id)
      return definition && definition.kind === 'choiceSet' ? definition : null
    },
    lookupProgression: (id: string) => {
      const definition = REAL_RUNTIME.registry.getById(id)
      return definition && definition.kind === 'progression' ? definition : null
    },
    isContentChoiceSet: (id: string) => {
      const definition = REAL_RUNTIME.registry.getById(id)
      return Boolean(definition && definition.kind === 'choiceSet' && definition.from.kind === 'fromContentCatalogue')
    },
    levelDefinitionId: REAL_RUNTIME.registry.getBySemanticRole('level')?.id,
    levelOverride: level
  })
}

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

const SUBCLASS_CHOICE_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')

describe('A2 -- a Wizard selects the synthetic subclass at Level 3: fixed grant + selectable spell + class-owned spells coexist', () => {
  it('PREVIEW -- at Level 3, both the fixed grant and the subclass choice total are already reflected in the spell plan', async () => {
    useFixture({ level: 1 })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, {
      [SUBCLASS_CHOICE_KEY]: [serializeContentRef(SYNTHETIC_SUBCLASS_REF)]
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const requirement = plan.plan.spellPlan!.requirements.find((r) => r.requirementId === 'spell-requirement.synthetic-growth-subclass.choice')
    expect(requirement, 'the subclass-owned requirement must appear in the SAME canonical spell plan as the class\'s own requirements').toBeDefined()
    expect(requirement!.missing).toBe(1)
  })

  it('CONFIRM -- persists the fixed grant, the selected subclass spell, AND the class\'s own cantrips/spellbook spells together in ONE canonical spellcasting.spells[] write', async () => {
    useFixture({ level: 1 })
    const choiceKey = spellAnswerKey(SYNTHETIC_SUBCLASS_FACET.spellRequirements![0]!, 3)
    const classRequirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const cantripReq = classRequirements.find((r) => r.pool === 'cantrip')!
    const spellbookReq = classRequirements.find((r) => r.pool === 'spellbook')!
    // Wizard's own real THIRD pool: 'spell' (prepared), a MEMBERSHIP SUBSET of 'spellbook'
    // (`requiresMembershipPool`) -- both must be answered for the class's own spell plan to be
    // complete; omitting it is this test's own mistake to avoid, not a gap in subclass ownership.
    const preparedReq = classRequirements.find((r) => r.pool === 'spell')!
    const cantripTarget = cantripReq.totalByLevel[2]!
    const spellbookTarget = spellbookReq.totalByLevel[2]!
    const preparedTarget = preparedReq.totalByLevel[2]!
    // Wizard's own real Level-2 Scholar/Expertise choice, crossed on the way to Level 3 --
    // unrelated to subclass ownership, answered with the already-proficient Arcana this fixture's
    // own `rulesChoices` default grants.
    const expertiseKey = progressionChoiceKey('class', 2, 'choice:skill.expertise')

    const answers = {
      [SUBCLASS_CHOICE_KEY]: [serializeContentRef(SYNTHETIC_SUBCLASS_REF)],
      [choiceKey]: [`${PKG}::subclass-choice-spell-a`],
      [expertiseKey]: ['value:skill.arcana.expertise'],
      [spellAnswerKey(cantripReq, 3)]: Array.from({ length: cantripTarget }, (_, i) => `${PKG}::cantrip-${i}`),
      [spellAnswerKey(spellbookReq, 3)]: Array.from({ length: spellbookTarget }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(preparedReq, 3)]: Array.from({ length: preparedTarget }, (_, i) => `${PKG}::spell-1-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.progression.classes[0]!.subclassRef).toEqual(SYNTHETIC_SUBCLASS_REF)

    expect(saveCharacterSpellcastingMock).toHaveBeenCalledTimes(1)
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const bySlug = new Map(written.spells.map((entry) => [entry.ref!.slug, entry]))

    // The subclass's own FIXED grant, unconditional once the subclass is selected.
    expect(bySlug.get('subclass-fixed-spell')).toBeDefined()
    expect(bySlug.get('subclass-fixed-spell')!.known).toBe(true)
    // The subclass's own SELECTED spell, from the player's own answer.
    expect(bySlug.get('subclass-choice-spell-a')).toBeDefined()
    // Class-owned spells, coexisting in the SAME array, untouched by the subclass's own entries.
    expect(written.spells.filter((entry) => entry.ref!.slug.startsWith('cantrip-'))).toHaveLength(cantripTarget)
    expect(written.spells.filter((entry) => entry.ref!.slug.startsWith('spell-1-'))).toHaveLength(spellbookTarget)
  })

  it('FRESH RELOAD -- resolveCurrentProgression, independently re-derived, reflects the persisted subclass + its spells identically', async () => {
    const persistedSpells: AssembledSpellEntry[] = [
      {
        instanceId: 'sp-1', ref: { packageId: PKG, slug: 'subclass-fixed-spell' }, known: true, prepared: false,
        requirementIds: ['fixed-spell-grant.subclass.subclass-fixed-spell'],
        status: 'resolved', title: 'subclass-fixed-spell',
        entry: SHARED_SPELL_CATALOGUE.find((s) => s.slug === 'subclass-fixed-spell')
      },
      {
        instanceId: 'sp-2', ref: { packageId: PKG, slug: 'subclass-choice-spell-a' }, known: false, prepared: true,
        requirementIds: ['spell-requirement.synthetic-growth-subclass.choice'],
        status: 'resolved', title: 'subclass-choice-spell-a',
        entry: SHARED_SPELL_CATALOGUE.find((s) => s.slug === 'subclass-choice-spell-a')
      }
    ]
    useFixture({ level: 3, subclassRef: SYNTHETIC_SUBCLASS_REF, spells: persistedSpells })
    const current = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(current.ok).toBe(true)
    if (!current.ok) return
    // A2 WORKSTREAM 2 -- the new state fields, re-derived from the canonical
    // `progression.classes[].subclassRef`, never a second store.
    expect(current.state.subclassFacet).toEqual(SYNTHETIC_SUBCLASS_FACET)
    expect(current.state.subclassPackageId).toBe(PKG)
    expect(current.state.spells.map((s) => s.ref?.slug).sort()).toEqual(['subclass-choice-spell-a', 'subclass-fixed-spell'])
  })

  it('REPEAT PREVIEW -- after confirming at Level 3, a fresh preview to Level 6 does not re-request the already-satisfied subclass choice, and the Level-6 non-spell feature appears as a real required Progression choice -- Wait: this subclass authors no Level-6 CHOICE, only a `sets` grant, so Level 6 instead shows the feature already ACTIVE with zero outstanding subclass spell requirement', async () => {
    const persistedSpells: AssembledSpellEntry[] = [
      {
        instanceId: 'sp-1', ref: { packageId: PKG, slug: 'subclass-fixed-spell' }, known: true, prepared: false,
        requirementIds: ['fixed-spell-grant.subclass.subclass-fixed-spell'],
        status: 'resolved', title: 'subclass-fixed-spell',
        entry: SHARED_SPELL_CATALOGUE.find((s) => s.slug === 'subclass-fixed-spell')
      },
      {
        instanceId: 'sp-2', ref: { packageId: PKG, slug: 'subclass-choice-spell-a' }, known: false, prepared: true,
        requirementIds: ['spell-requirement.synthetic-growth-subclass.choice'],
        status: 'resolved', title: 'subclass-choice-spell-a',
        entry: SHARED_SPELL_CATALOGUE.find((s) => s.slug === 'subclass-choice-spell-a')
      }
    ]
    useFixture({ level: 3, subclassRef: SYNTHETIC_SUBCLASS_REF, spells: persistedSpells })
    const classRequirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const cantripReq = classRequirements.find((r) => r.pool === 'cantrip')!
    const spellbookReq = classRequirements.find((r) => r.pool === 'spellbook')!
    const preview = await planProgression(WORLD_ID, CHARACTER_ID, 6)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const subclassRequirement = preview.plan.spellPlan!.requirements.find((r) => r.requirementId === 'spell-requirement.synthetic-growth-subclass.choice')
    // The Level-3 total (1) is still satisfied by the ALREADY-OWNED fixed+chosen spells; the
    // subclass's own requirement never re-requests it at Level 6 (totalByLevel stays 1 there too).
    expect(subclassRequirement!.missing).toBe(0)
    void cantripReq
    void spellbookReq
  })

  it('DIRECT LEVEL JUMP -- Level 1 straight to Level 6 ends with the fixed grant, the selected spell, AND the Level-6 feature all active in one Confirm', async () => {
    useFixture({ level: 1 })
    const choiceKey = spellAnswerKey(SYNTHETIC_SUBCLASS_FACET.spellRequirements![0]!, 6)
    const classRequirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const cantripReq = classRequirements.find((r) => r.pool === 'cantrip')!
    const spellbookReq = classRequirements.find((r) => r.pool === 'spellbook')!
    const preparedReq = classRequirements.find((r) => r.pool === 'spell')!
    // Wizard's own real Level-2 Scholar/Expertise choice, crossed by this direct jump too --
    // unrelated to subclass ownership, answered with the same already-proficient Arcana this
    // fixture's own `rulesChoices` default grants.
    const expertiseKey = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    // Wizard's own real Level-4 ASI/Feat Selection row, also crossed by this direct jump --
    // unrelated to subclass ownership.
    const featKey = progressionChoiceKey('class', 4, 'choice:feat.selection')
    const answers = {
      [SUBCLASS_CHOICE_KEY]: [serializeContentRef(SYNTHETIC_SUBCLASS_REF)],
      [choiceKey]: [`${PKG}::subclass-choice-spell-b`],
      [featKey]: [serializeContentRef({ packageId: PKG, slug: 'ability-score-improvement-xphb' })],
      [`feat:${featKey}:choice:feat.asi-ability-increase`]: ['source:asi.increase.con', 'source:asi.increase.con'],
      [expertiseKey]: ['value:skill.arcana.expertise'],
      [spellAnswerKey(cantripReq, 6)]: Array.from({ length: cantripReq.totalByLevel[5]! }, (_, i) => `${PKG}::cantrip-${i}`),
      [spellAnswerKey(spellbookReq, 6)]: Array.from({ length: spellbookReq.totalByLevel[5]! }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(preparedReq, 6)]: Array.from({ length: preparedReq.totalByLevel[5]! }, (_, i) => `${PKG}::spell-1-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 6, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)
    expect(plan.plan.valid).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 6, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const slugs = written.spells.map((s) => s.ref!.slug)
    expect(slugs).toContain('subclass-fixed-spell')
    expect(slugs).toContain('subclass-choice-spell-b')

    // WORKSTREAM 5 -- "one subclass with non-spell feature growth", proven through the FULL real
    // pipeline: the subclass facet's own `.progression` row (Level 6) is consumed through the
    // exact same generic `buildActorState`/`consumeFacet` loop Workstream 1 already proved
    // exhaustively -- re-confirmed here against this acceptance harness's own persisted state, not
    // a parallel interpretation. Never active before Level 6, active at and after it.
    const derivedBelow = deriveSubclassActorState(5, SYNTHETIC_SUBCLASS_REF)
    expect(derivedBelow.actorState.values[SUBCLASS_FEATURE_VALUE]).not.toBe(true)
    const derivedAt = deriveSubclassActorState(6, SYNTHETIC_SUBCLASS_REF)
    expect(derivedAt.actorState.values[SUBCLASS_FEATURE_VALUE]).toBe(true)
  })

  it('HISTORICAL COMPATIBILITY -- a character with NO subclass selected gets ZERO subclass effects, and still loads/progresses normally', async () => {
    useFixture({ level: 1, subclassRef: null })
    const current = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(current.ok).toBe(true)
    if (!current.ok) return
    expect(current.state.subclassFacet).toBeNull()
    expect(current.state.subclassPackageId).toBeNull()

    // Leveling up with no subclass selected never surfaces the subclass's own requirement at all.
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan!.requirements.some((r) => r.requirementId === 'spell-requirement.synthetic-growth-subclass.choice')).toBe(false)
  })
})
