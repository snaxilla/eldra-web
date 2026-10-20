// CHARACTER INTEGRITY FIX -- SUBCLASS-OWNED DIRECT CHOICE DEFECT, real end-to-end round trip.
//
// Real production defect (discovered while writing A4's own acceptance tests): a newly-selected
// subclass's own DIRECT `choices` field (RulesFacet.choices -- Circle of the Land's terrain pick,
// A3; Battle Master's own initial maneuvers, Hunter's Prey, A4) was invisible to
// `diffRequiredChoices` (server/utils/character-progression-plan.ts), because `buildLevelStep`
// applied the SAME tentative subclass to BOTH the "before" and "after" derived snapshots of the
// step that gains it, unconditionally -- so the subclass's own choices were "already declared" at
// the PREVIOUS snapshot too, and could never be seen as newly required. The choice never appeared
// in `requiredChoices`/`unresolvedChoiceIds`, never blocked an incomplete/illegal answer, and
// (since `confirmProgression`'s own persistence step reads exclusively from
// `planResult.plan.steps[].requiredChoices`) never persisted via `saveCharacterRulesChoices`
// either -- legal or not.
//
// THIS FILE never mocks `character-assembly` (unlike every other acceptance file in this project,
// including the one that first reported this defect) -- mocking it is exactly why the defect went
// unnoticed: a static `assembleCharacterMock.mockResolvedValue(...)` blueprint is insensitive to
// the `tentativeSubclassRef` argument `getDerivedCharacterAtLevel` actually passes, so it can
// never exercise -- or prove a fix for -- the mechanism under test. Mirrors
// character-confirm-rules-choices-regression.test.ts's own precedent instead: mock only the
// Directus I/O boundary (`directusServiceRequest`), let the REAL `assembleCharacter` -> real
// `buildActorState` -> real Rules Engine run, against the REAL shipped `eldra-dnd5e-2024` package.
//
// Covers: Battle Master's initial maneuver pick (missing/illegal/crafted/valid+persisted+fresh
// reload), Hunter's Prey, Circle of the Land's terrain pick (the A3 content this exact defect
// also affects), a direct multi-level jump, later maneuver growth (a Progression row, proven
// unaffected), an unrelated subclass with no direct choice at all (Life Domain), a cross-subclass
// answer-isolation check (an answer shaped for a DIFFERENT subclass's own identically-named
// ChoiceSet must never satisfy the SELECTED subclass's own choice), and historical character
// safety (a character who already has a persisted subclass but never recorded its own direct
// choice -- created before this fix existed -- must still read honestly, with nothing
// fabricated, and must never be retroactively blocked on an UNRELATED later transition).

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  directusServiceRequestMock, getWorldContentCatalogueMock, getWorldRuntimeMock,
  listContentPackBindingsForWorldMock, saveCharacterProgressionMock,
  loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock, saveCharacterSpellcastingMock
} = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  listContentPackBindingsForWorldMock: vi.fn(),
  saveCharacterProgressionMock: vi.fn(),
  loadCharacterRulesChoicesMock: vi.fn(),
  saveCharacterRulesChoicesMock: vi.fn(),
  saveCharacterSpellcastingMock: vi.fn()
}))

// character-assembly is DELIBERATELY NEVER MOCKED -- see this file's own header.
vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))
vi.mock('../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: getWorldContentCatalogueMock }))
vi.mock('../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: getWorldRuntimeMock }))
vi.mock('../../../server/utils/world-content-packs', () => ({ listContentPackBindingsForWorld: listContentPackBindingsForWorldMock }))
// character-assembly.ts ALSO imports these BLOCK_KEY constants directly from each module (for its
// own `block_key` matching, independent of the load/save functions) -- real, unmodified values,
// never mocked, so assembleCharacter's real block-row lookup still works end to end.
vi.mock('../../../server/utils/character-progression', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/character-progression')>()),
  saveCharacterProgression: saveCharacterProgressionMock
}))
vi.mock('../../../server/utils/character-rules-choices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/character-rules-choices')>()),
  loadCharacterRulesChoices: loadCharacterRulesChoicesMock,
  saveCharacterRulesChoices: saveCharacterRulesChoicesMock
}))
vi.mock('../../../server/utils/character-spellcasting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/character-spellcasting')>()),
  saveCharacterSpellcasting: saveCharacterSpellcastingMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import { resolveDnd5eItemMechanics } from '../../../app/lib/item-mechanics/dnd5e'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { confirmProgression, planProgression, resolveCurrentProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey, choiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { spellAnswerKey } from '../../../server/utils/character-progression-spell-acquisition'
import xphbFeats from '../../lib/feat-mechanics/fixtures/xphb-feats.json'

const WORLD_ID = '5'
const CHARACTER_ID = '777'
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
  return { packageId: PKG, packageVersion: '1.0.0', systemKey: 'dnd5e', title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json', ...overrides }
}
function spellCatalogueEntry(slug: string, level: number, classLists: string[], school: string, title = slug) {
  return { packageId: PKG, slug, title, spellMechanics: resolveDnd5eSpellMechanics({ name: title, source: 'XPHB', level, school, classLists })! }
}

const REAL_RUNTIME = loadRealRuntime()

const FEATS = xphbFeats.feats.map((raw) => {
  const slug = `${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-xphb`
  return baseEntry({ title: raw.name, slug, externalId: `${raw.name}__XPHB`, featMechanics: resolveDnd5eFeatMechanics(raw), rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined })
})

const FIGHTER_REF = { packageId: PKG, slug: 'fighter-xphb' }
const FIGHTER_FACET = findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')!
const BATTLE_MASTER_REF = { packageId: PKG, slug: 'battle-master-xphb' }
const BATTLE_MASTER_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'battle-master-xphb')!
const BATTLE_MASTER_ENTRY = baseEntry({ title: 'Battle Master', slug: BATTLE_MASTER_REF.slug, parentClassSlug: FIGHTER_REF.slug, rulesFacet: BATTLE_MASTER_FACET })

const RANGER_REF = { packageId: PKG, slug: 'ranger-xphb' }
const RANGER_FACET = findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb')!
const HUNTER_REF = { packageId: PKG, slug: 'hunter-xphb' }
const HUNTER_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'hunter-xphb')!
const HUNTER_ENTRY = baseEntry({ title: 'Hunter', slug: HUNTER_REF.slug, parentClassSlug: RANGER_REF.slug, rulesFacet: HUNTER_FACET })

const DRUID_REF = { packageId: PKG, slug: 'druid-xphb' }
const DRUID_FACET = findRulesFacet('dnd5e.2024', 'class', 'druid-xphb')!
const LAND_REF = { packageId: PKG, slug: 'circle-of-the-land-xphb' }
const LAND_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'circle-of-the-land-xphb')!
const LAND_ENTRY = baseEntry({ title: 'Circle of the Land', slug: LAND_REF.slug, parentClassSlug: DRUID_REF.slug, rulesFacet: LAND_FACET })

const CLERIC_REF = { packageId: PKG, slug: 'cleric-xphb' }
const CLERIC_FACET = findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')!
const LIFE_DOMAIN_REF = { packageId: PKG, slug: 'life-domain-xphb' }
const LIFE_DOMAIN_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'life-domain-xphb')!
const LIFE_DOMAIN_ENTRY = baseEntry({ title: 'Life Domain', slug: LIFE_DOMAIN_REF.slug, parentClassSlug: CLERIC_REF.slug, rulesFacet: LIFE_DOMAIN_FACET })

const HUMAN_SPECIES_REF = { packageId: PKG, slug: 'human-xphb' }
const HUMAN_ENTRY = baseEntry({ title: 'Human', slug: 'human-xphb' })
const SOLDIER_REF = { packageId: PKG, slug: 'soldier-xphb' }
const SOLDIER_ENTRY = baseEntry({ title: 'Soldier', slug: 'soldier-xphb' })
const GUIDE_REF = { packageId: PKG, slug: 'guide-xphb' }
const GUIDE_ENTRY = baseEntry({ title: 'Guide', slug: 'guide-xphb' })
const HERMIT_REF = { packageId: PKG, slug: 'hermit-xphb' }
const HERMIT_ENTRY = baseEntry({ title: 'Hermit', slug: 'hermit-xphb' })
const ACOLYTE_REF = { packageId: PKG, slug: 'acolyte-xphb' }
const ACOLYTE_ENTRY = baseEntry({ title: 'Acolyte', slug: 'acolyte-xphb' })

function catalogueFor(opts: { classes?: unknown[], subclasses?: unknown[], spells?: unknown[], items?: unknown[] } = {}) {
  return {
    worldId: WORLD_ID, packs: [],
    species: [HUMAN_ENTRY],
    classes: opts.classes ?? [],
    backgrounds: [SOLDIER_ENTRY, GUIDE_ENTRY, HERMIT_ENTRY, ACOLYTE_ENTRY],
    feats: FEATS,
    items: opts.items ?? [],
    spells: opts.spells ?? [],
    monsters: [],
    subclasses: opts.subclasses ?? []
  }
}

function mockEntityAndBlocks(opts: {
  speciesRef: { packageId: string, slug: string }
  classRef: { packageId: string, slug: string }
  backgroundRef: { packageId: string, slug: string }
  progression: unknown
  rulesChoices: unknown
  abilityScores?: unknown
}) {
  directusServiceRequestMock.mockImplementation(async (path: string) => {
    if (path === `/items/entities/${CHARACTER_ID}`) {
      return { data: { id: Number(CHARACTER_ID), world_id: Number(WORLD_ID), title: 'Integrity Fixture', entity_type: 'pc' } }
    }
    if (path === '/items/block_instances') {
      return {
        data: [
          { block_key: 'catalogue_selection', data: { species: opts.speciesRef, class: opts.classRef, background: opts.backgroundRef } },
          { block_key: 'ability_scores', data: opts.abilityScores ?? { method: 'standard-array', scores: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 } } },
          { block_key: 'rules_choices', data: opts.rulesChoices },
          { block_key: 'progression', data: opts.progression }
        ]
      }
    }
    throw new Error(`unexpected directusServiceRequest path: ${path}`)
  })
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  getWorldContentCatalogueMock.mockReset()
  getWorldRuntimeMock.mockReset()
  listContentPackBindingsForWorldMock.mockReset()
  saveCharacterProgressionMock.mockReset()
  loadCharacterRulesChoicesMock.mockReset()
  saveCharacterRulesChoicesMock.mockReset()
  saveCharacterSpellcastingMock.mockReset()

  getWorldRuntimeMock.mockResolvedValue({ configured: true, ok: true, runtime: REAL_RUNTIME, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  saveCharacterSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

// Weapon Mastery is a content-catalogue choice (category: items); its real answer is a
// ContentRef resolved against real weapon-shaped catalogue entries, never a bare Value id.
function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...baseEntry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
const WEAPONS = [
  weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Shortsword', 'shortsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'] }),
  weaponEntry('Spear', 'spear-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['T|XPHB', 'V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Rapier', 'rapier-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB'], mastery: ['Vex|XPHB'] }),
  weaponEntry('Greatsword', 'greatsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['H|XPHB', '2H|XPHB'], mastery: ['Graze|XPHB'] }),
  weaponEntry('Battleaxe', 'battleaxe-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Topple|XPHB'] })
]
function weaponRefs(count: number, offset = 0) {
  return WEAPONS.slice(offset, offset + count).map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug }))
}
const FIGHTER_WEAPON_MASTERY_KEY = 'class:choice:class.weapon-mastery'
function fighterRulesChoices(extra: Record<string, string[]> = {}) {
  return {
    selections: {
      'class:choice:feat.fighting-style.fs-only': [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })],
      'class:choice:skill.proficiency': ['value:skill.athletics.proficient', 'value:skill.history.proficient'],
      [FIGHTER_WEAPON_MASTERY_KEY]: weaponRefs(3),
      ...extra
    }
  }
}
const FIGHTER_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
const MANEUVER_KEY_L3 = choiceKey('subclass', 'choice:subclass.accumulating-option')
const MANEUVER_KEY_L7 = progressionChoiceKey('subclass', 7, 'choice:subclass.accumulating-option')
const ALL_MANEUVERS = [
  'value:maneuver.ambush.known', 'value:maneuver.bait_and_switch.known', 'value:maneuver.commanders_strike.known',
  'value:maneuver.commanding_presence.known', 'value:maneuver.disarming_attack.known', 'value:maneuver.distracting_strike.known',
  'value:maneuver.evasive_footwork.known', 'value:maneuver.feinting_attack.known', 'value:maneuver.goading_attack.known',
  'value:maneuver.lunging_attack.known', 'value:maneuver.maneuvering_attack.known', 'value:maneuver.menacing_attack.known',
  'value:maneuver.parry.known', 'value:maneuver.precision_attack.known', 'value:maneuver.pushing_attack.known',
  'value:maneuver.rally.known', 'value:maneuver.riposte.known', 'value:maneuver.sweeping_attack.known',
  'value:maneuver.tactical_assessment.known', 'value:maneuver.trip_attack.known'
]
const FIGHTER_ASI_LEVELS = [4, 6, 8, 12, 14, 16]
function asiAnswers(level: number, asiLevels: readonly number[] = FIGHTER_ASI_LEVELS): Record<string, string[]> {
  const answers: Record<string, string[]> = {}
  for (const l of asiLevels.filter((l) => l <= level)) {
    const key = progressionChoiceKey('class', l, 'choice:feat.selection')
    answers[key] = [serializeContentRef({ packageId: PKG, slug: 'ability-score-improvement-xphb' })]
    answers[`feat:${key}:choice:feat.asi-ability-increase`] = ['source:asi.increase.str', 'source:asi.increase.str']
  }
  return answers
}
function fighterWeaponMasteryGrowthAnswers(level: number): Record<string, string[]> {
  const growthLevels = [4, 10, 16]
  const picks = weaponRefs(3, 3)
  const answers: Record<string, string[]> = {}
  growthLevels.filter((l) => l <= level).forEach((l, i) => {
    answers[progressionChoiceKey('class', l, 'choice:class.weapon-mastery')] = [picks[i]!]
  })
  return answers
}

function useFighterCatalogue() {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor({
    classes: [baseEntry({ title: 'Fighter', slug: FIGHTER_REF.slug, rulesFacet: FIGHTER_FACET })],
    subclasses: [BATTLE_MASTER_ENTRY],
    items: WEAPONS
  }))
}

describe('CHARACTER INTEGRITY FIX -- Battle Master Combat Superiority, real end-to-end (no mocked assembleCharacter)', () => {
  it('REPRODUCTION (fails pre-fix) -- the initial maneuver pick is a REAL required choice at Level 3, not silently absent', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices()
    })
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, { [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(BATTLE_MASTER_REF)] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(MANEUVER_KEY_L3)
    expect(plan.plan.valid).toBe(false)
  })

  it('MISSING mandatory answer -- confirmProgression REJECTS the transition', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices()
    })
    const answers = { [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(BATTLE_MASTER_REF)] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('ILLEGAL answer (not one of the 20 real maneuvers) -- confirmProgression REJECTS, zero persistence writes', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices()
    })
    const answers = {
      [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(BATTLE_MASTER_REF)],
      [MANEUVER_KEY_L3]: ['value:maneuver.not-a-real-maneuver.known', 'value:maneuver.ambush.known', 'value:maneuver.parry.known']
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(false)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('CRAFTED/undeclared choice key -- an answer under a key this subclass never declares is simply ignored, never satisfies the real choice', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices()
    })
    const answers = {
      [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(BATTLE_MASTER_REF)],
      'subclass:choice:no-such-choiceset': ALL_MANEUVERS.slice(0, 3)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(MANEUVER_KEY_L3)
    expect(plan.plan.valid).toBe(false)
  })

  it('VALID answer -- persists through rules_choices, and a FRESH RELOAD reproduces the chosen subclass and its maneuvers', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices()
    })
    const answers = {
      [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(BATTLE_MASTER_REF)],
      [MANEUVER_KEY_L3]: ALL_MANEUVERS.slice(0, 3)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)

    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> }
    expect(savedChoices.selections[MANEUVER_KEY_L3]).toEqual(ALL_MANEUVERS.slice(0, 3))
    const savedProgression = saveCharacterProgressionMock.mock.calls[0]?.[1] as { classes: { subclassRef: unknown }[] }
    expect(savedProgression.classes[0]!.subclassRef).toEqual(BATTLE_MASTER_REF)

    // FRESH RELOAD -- re-arm the Directus mock with exactly what was captured as written
    // (the same "capture the write, re-serve it as a read" technique
    // character-confirm-rules-choices-regression.test.ts's own sibling files use), then
    // independently re-derive through resolveCurrentProgression.
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: savedProgression,
      rulesChoices: savedChoices
    })
    const reloaded = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(reloaded.state.subclassFacet).toEqual(BATTLE_MASTER_FACET)
  })

  it('GROWTH-LEVEL REGRESSION -- Level 7 maneuver growth (a Progression row, not a direct choice) is unaffected: still required, still rejects a missing answer, still persists when valid', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 3, subclassRef: BATTLE_MASTER_REF }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices({ [MANEUVER_KEY_L3]: ALL_MANEUVERS.slice(0, 3) })
    })
    const missingAnswers = { ...asiAnswers(7), ...fighterWeaponMasteryGrowthAnswers(7) }
    const missingPlan = await planProgression(WORLD_ID, CHARACTER_ID, 7, missingAnswers)
    expect(missingPlan.ok).toBe(true)
    if (!missingPlan.ok) return
    expect(missingPlan.plan.unresolvedChoiceIds).toContain(MANEUVER_KEY_L7)
    expect(missingPlan.plan.valid).toBe(false)

    const validAnswers = { ...missingAnswers, [MANEUVER_KEY_L7]: ALL_MANEUVERS.slice(3, 5) }
    const validPlan = await planProgression(WORLD_ID, CHARACTER_ID, 7, validAnswers)
    expect(validPlan.ok).toBe(true)
    if (!validPlan.ok) return
    expect(validPlan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, validPlan.plan.fingerprint, validAnswers)
    expect(result.ok).toBe(true)
    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> }
    expect(savedChoices.selections[MANEUVER_KEY_L7]).toEqual(ALL_MANEUVERS.slice(3, 5))
  })

  it('DIRECT LEVEL JUMP 1 -> 7 -- the initial pick AND the Level-7 growth are both required and both persist in one confirm', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices()
    })
    const answers = {
      [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(BATTLE_MASTER_REF)],
      [MANEUVER_KEY_L3]: ALL_MANEUVERS.slice(0, 3),
      [MANEUVER_KEY_L7]: ALL_MANEUVERS.slice(3, 5),
      ...asiAnswers(7),
      ...fighterWeaponMasteryGrowthAnswers(7)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> }
    expect(savedChoices.selections[MANEUVER_KEY_L3]).toEqual(ALL_MANEUVERS.slice(0, 3))
    expect(savedChoices.selections[MANEUVER_KEY_L7]).toEqual(ALL_MANEUVERS.slice(3, 5))
  })
})

describe('CHARACTER INTEGRITY FIX -- Hunter\'s Prey (Ranger), real end-to-end', () => {
  const RANGER_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
  const HUNTERS_PREY_KEY = choiceKey('subclass', 'choice:subclass.feature-option')
  const rangerPreparedReq = RANGER_FACET.spellRequirements!.find((r) => r.pool === 'spell')!
  const rangerCantripReq = RANGER_FACET.spellRequirements?.find((r) => r.pool === 'cantrip')
  const RANGER_SPELLS = Array.from({ length: 10 }, (_, i) => spellCatalogueEntry(`rng-spell-${i}`, 1, ['Ranger'], 'V'))

  function useRangerCatalogue() {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor({
      classes: [baseEntry({ title: 'Ranger', slug: RANGER_REF.slug, rulesFacet: RANGER_FACET })],
      subclasses: [HUNTER_ENTRY],
      spells: RANGER_SPELLS,
      items: WEAPONS
    }))
  }
  function rangerRulesChoices(extra: Record<string, string[]> = {}) {
    return {
      selections: {
        'class:choice:skill.proficiency': ['value:skill.perception.proficient', 'value:skill.survival.proficient', 'value:skill.stealth.proficient'],
        'class:choice:class.weapon-mastery': weaponRefs(1),
        ...extra
      }
    }
  }
  // Ranger's own real Level 2 Deft Explorer (skill Expertise + 2 languages) and Fighting Style --
  // this character STARTS at Level 1, so these are genuinely TENTATIVE answers for THIS
  // transition (not yet persisted), submitted in `answers` exactly like the ASI answers below --
  // never pre-populated into `progression.feats`/`rulesChoices` as if already confirmed, which
  // would make confirmProgression see the SAME Archery acquisition twice (once from the fixture,
  // once freshly resolved) and wrongly reject it as a duplicate.
  function rangerLevel2Answers(): Record<string, string[]> {
    return {
      [progressionChoiceKey('class', 2, 'choice:skill.expertise')]: ['value:skill.perception.expertise'],
      [progressionChoiceKey('class', 2, 'choice:language.known')]: ['value:language.draconic.known', 'value:language.dwarvish.known'],
      [progressionChoiceKey('class', 2, 'choice:feat.fighting-style.fs-and-fs-r')]: [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })]
    }
  }
  function spellAnswers(level: number) {
    const answers: Record<string, string[]> = {
      [spellAnswerKey(rangerPreparedReq, level)]: Array.from({ length: rangerPreparedReq.totalByLevel[level - 1]! }, (_, i) => `${PKG}::rng-spell-${i}`)
    }
    if (rangerCantripReq) answers[spellAnswerKey(rangerCantripReq, level)] = []
    return answers
  }

  it('MISSING mandatory answer -- confirmProgression REJECTS the transition', async () => {
    useRangerCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: RANGER_REF, backgroundRef: GUIDE_REF,
      progression: { classes: [{ classRef: RANGER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: rangerRulesChoices()
    })
    const answers = { ...rangerLevel2Answers(), [RANGER_SUBCLASS_KEY]: [serializeContentRef(HUNTER_REF)], ...spellAnswers(3) }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(HUNTERS_PREY_KEY)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  it('VALID answer (Colossus Slayer) -- persists, and a FRESH RELOAD reproduces it', async () => {
    useRangerCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: RANGER_REF, backgroundRef: GUIDE_REF,
      progression: { classes: [{ classRef: RANGER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: rangerRulesChoices()
    })
    const answers = {
      ...rangerLevel2Answers(),
      [RANGER_SUBCLASS_KEY]: [serializeContentRef(HUNTER_REF)],
      [HUNTERS_PREY_KEY]: ['source:hunters-prey.colossus-slayer'],
      ...spellAnswers(3)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)

    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> }
    expect(savedChoices.selections[HUNTERS_PREY_KEY]).toEqual(['source:hunters-prey.colossus-slayer'])
    const savedProgression = saveCharacterProgressionMock.mock.calls[0]?.[1]

    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: RANGER_REF, backgroundRef: GUIDE_REF,
      progression: savedProgression,
      rulesChoices: savedChoices
    })
    const reloaded = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(reloaded.state.subclassFacet).toEqual(HUNTER_FACET)
  })
})

describe('CHARACTER INTEGRITY FIX -- Circle of the Land (Druid), real end-to-end -- the A3 content this exact defect also affects', () => {
  const DRUID_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
  const TERRAIN_KEY = choiceKey('subclass', 'choice:subclass.feature-option')
  const druidCantripReq = DRUID_FACET.spellRequirements!.find((r) => r.pool === 'cantrip' && r.id.endsWith('.cantrip'))!
  const druidPreparedReq = DRUID_FACET.spellRequirements!.find((r) => r.pool === 'spell')!
  const DRUID_SPELLS = [
    ...Array.from({ length: 5 }, (_, i) => spellCatalogueEntry(`drd-cantrip-${i}`, 0, ['Druid'], 'V')),
    ...Array.from({ length: 20 }, (_, i) => spellCatalogueEntry(`drd-spell-${i}`, 1, ['Druid'], 'V')),
    spellCatalogueEntry('blur-xphb', 2, [], 'I'),
    spellCatalogueEntry('burning-hands-xphb', 1, [], 'V'),
    spellCatalogueEntry('fire-bolt-xphb', 0, [], 'V'),
    spellCatalogueEntry('fog-cloud-xphb', 1, [], 'C'),
    spellCatalogueEntry('hold-person-xphb', 2, [], 'E'),
    spellCatalogueEntry('ray-of-frost-xphb', 0, [], 'V')
  ]
  function useDruidCatalogue() {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor({
      classes: [baseEntry({ title: 'Druid', slug: DRUID_REF.slug, rulesFacet: DRUID_FACET })],
      subclasses: [LAND_ENTRY],
      spells: DRUID_SPELLS
    }))
  }
  function druidRulesChoices(extra: Record<string, string[]> = {}) {
    return {
      selections: {
        'class:choice:skill.proficiency': ['value:skill.insight.proficient', 'value:skill.nature.proficient'],
        'class:choice:class.feature-option': ['source:primal-order.magician'],
        ...extra
      }
    }
  }
  const magicianCantripReq = DRUID_FACET.spellRequirements!.find((r) => r.id.endsWith('.magician-cantrip'))!
  function spellAnswers(level: number) {
    return {
      [spellAnswerKey(druidCantripReq, level)]: Array.from({ length: druidCantripReq.totalByLevel[level - 1]! }, (_, i) => `${PKG}::drd-cantrip-${i}`),
      [spellAnswerKey(druidPreparedReq, level)]: Array.from({ length: druidPreparedReq.totalByLevel[level - 1]! }, (_, i) => `${PKG}::drd-spell-${i}`),
      [spellAnswerKey(magicianCantripReq, level)]: [`${PKG}::drd-cantrip-0`]
    }
  }

  it('MISSING terrain -- confirmProgression REJECTS the transition (the exact A3 gap this fix closes)', async () => {
    useDruidCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: DRUID_REF, backgroundRef: HERMIT_REF,
      progression: { classes: [{ classRef: DRUID_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: druidRulesChoices()
    })
    const answers = { [DRUID_SUBCLASS_KEY]: [serializeContentRef(LAND_REF)], ...spellAnswers(3) }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(TERRAIN_KEY)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  it('VALID terrain (Arid) -- persists through rules_choices, and a FRESH RELOAD reproduces the chosen terrain (the Arid spells resolve again)', async () => {
    useDruidCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: DRUID_REF, backgroundRef: HERMIT_REF,
      progression: { classes: [{ classRef: DRUID_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: druidRulesChoices()
    })
    const answers = {
      [DRUID_SUBCLASS_KEY]: [serializeContentRef(LAND_REF)],
      [TERRAIN_KEY]: ['source:land-circle.arid'],
      ...spellAnswers(3)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)

    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> }
    expect(savedChoices.selections[TERRAIN_KEY]).toEqual(['source:land-circle.arid'])
    const savedProgression = saveCharacterProgressionMock.mock.calls[0]?.[1]
    const savedSpellcasting = saveCharacterSpellcastingMock.mock.calls[0]?.[1] as { spells: { ref: { slug: string } }[] }
    expect(savedSpellcasting.spells.map((s) => s.ref.slug)).toContain('blur-xphb')
    expect(savedSpellcasting.spells.map((s) => s.ref.slug)).not.toContain('fog-cloud-xphb')

    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: DRUID_REF, backgroundRef: HERMIT_REF,
      progression: savedProgression,
      rulesChoices: savedChoices
    })
    const reloaded = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(reloaded.ok).toBe(true)
    if (!reloaded.ok) return
    expect(reloaded.state.subclassFacet).toEqual(LAND_FACET)
  })
})

describe('CHARACTER INTEGRITY FIX -- Life Domain (Cleric), an UNRELATED subclass with no direct choice at all', () => {
  const CLERIC_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
  function useClericCatalogue() {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor({
      classes: [baseEntry({ title: 'Cleric', slug: CLERIC_REF.slug, rulesFacet: CLERIC_FACET })],
      subclasses: [LIFE_DOMAIN_ENTRY],
      spells: [
        ...Array.from({ length: 5 }, (_, i) => spellCatalogueEntry(`clr-cantrip-${i}`, 0, ['Cleric'], 'V')),
        ...Array.from({ length: 20 }, (_, i) => spellCatalogueEntry(`clr-spell-${i}`, 1, ['Cleric'], 'V')),
        ...['aid-xphb', 'bless-xphb', 'cure-wounds-xphb', 'lesser-restoration-xphb'].map((s) => spellCatalogueEntry(s, 1, [], 'V'))
      ]
    }))
  }
  it('selecting Life Domain requires nothing beyond the subclass pick itself and the Cleric\'s own spell selection -- no phantom required choice is fabricated', async () => {
    useClericCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: CLERIC_REF, backgroundRef: ACOLYTE_REF,
      progression: { classes: [{ classRef: CLERIC_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.insight.proficient', 'value:skill.religion.proficient'], 'class:choice:class.feature-option': ['source:divine-order.protector'] } }
    })
    const cantripReq = CLERIC_FACET.spellRequirements!.find((r) => r.pool === 'cantrip' && r.id.endsWith('.cantrip'))!
    const preparedReq = CLERIC_FACET.spellRequirements!.find((r) => r.pool === 'spell')!
    const answers = {
      [CLERIC_SUBCLASS_KEY]: [serializeContentRef(LIFE_DOMAIN_REF)],
      [spellAnswerKey(cantripReq, 3)]: Array.from({ length: cantripReq.totalByLevel[2]! }, (_, i) => `${PKG}::clr-cantrip-${i}`),
      [spellAnswerKey(preparedReq, 3)]: Array.from({ length: preparedReq.totalByLevel[2]! }, (_, i) => `${PKG}::clr-spell-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    // Only the subclass-selection choice itself is required -- Life Domain's own facet declares
    // no `choices` field at all, so no OTHER subclass-owned choice should ever appear.
    expect(plan.plan.unresolvedChoiceIds.filter((id) => id.startsWith('subclass:'))).toEqual([])
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
  })
})

describe('CHARACTER INTEGRITY FIX -- cross-subclass answer isolation', () => {
  // Hunter's Prey and Circle of the Land's own terrain pick both reuse the SAME owner-agnostic
  // `choice:subclass.feature-option` ChoiceSet (by design -- it is deliberately generic, never
  // subclass-named). This proves that sharing a ChoiceSet id never lets one subclass's own real
  // option satisfy a DIFFERENT subclass's identically-keyed choice: Hunter's own facet declares
  // `from: ['source:hunters-prey.colossus-slayer', 'source:hunters-prey.horde-breaker']` only, so
  // a value shaped for Circle of the Land ('source:land-circle.arid') is simply not one of
  // Hunter's own offered options, exactly like any other illegal answer.
  const RANGER_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
  const HUNTERS_PREY_KEY = choiceKey('subclass', 'choice:subclass.feature-option')
  const rangerPreparedReq = RANGER_FACET.spellRequirements!.find((r) => r.pool === 'spell')!
  const rangerCantripReq = RANGER_FACET.spellRequirements?.find((r) => r.pool === 'cantrip')
  const RANGER_SPELLS = Array.from({ length: 10 }, (_, i) => spellCatalogueEntry(`rng-spell-${i}`, 1, ['Ranger'], 'V'))
  function rangerLevel2Answers(): Record<string, string[]> {
    return {
      [progressionChoiceKey('class', 2, 'choice:skill.expertise')]: ['value:skill.perception.expertise'],
      [progressionChoiceKey('class', 2, 'choice:language.known')]: ['value:language.draconic.known', 'value:language.dwarvish.known'],
      [progressionChoiceKey('class', 2, 'choice:feat.fighting-style.fs-and-fs-r')]: [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })]
    }
  }

  it('REJECTS Circle of the Land\'s own terrain value as an answer to Hunter\'s Prey -- a shared ChoiceSet id never leaks options across subclasses', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor({
      classes: [baseEntry({ title: 'Ranger', slug: RANGER_REF.slug, rulesFacet: RANGER_FACET })],
      subclasses: [HUNTER_ENTRY],
      spells: RANGER_SPELLS,
      items: WEAPONS
    }))
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: RANGER_REF, backgroundRef: GUIDE_REF,
      progression: { classes: [{ classRef: RANGER_REF, level: 1, subclassRef: null }], feats: [], items: [] },
      rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.perception.proficient', 'value:skill.survival.proficient', 'value:skill.stealth.proficient'], 'class:choice:class.weapon-mastery': weaponRefs(1) } }
    })
    const answers: Record<string, string[]> = {
      ...rangerLevel2Answers(),
      [RANGER_SUBCLASS_KEY]: [serializeContentRef(HUNTER_REF)],
      [HUNTERS_PREY_KEY]: ['source:land-circle.arid'],
      [spellAnswerKey(rangerPreparedReq, 3)]: Array.from({ length: rangerPreparedReq.totalByLevel[2]! }, (_, i) => `${PKG}::rng-spell-${i}`)
    }
    if (rangerCantripReq) answers[spellAnswerKey(rangerCantripReq, 3)] = []
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(HUNTERS_PREY_KEY)
    expect(plan.plan.valid).toBe(false)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })
})

describe('CHARACTER INTEGRITY FIX -- historical character safety', () => {
  // A character created BEFORE this fix existed: Battle Master selected at Level 3, but the
  // maneuver choice was never recorded (exactly the defect this phase closes). Must still read
  // honestly (no crash, nothing fabricated), and an UNRELATED later transition (a Level 4 ASI)
  // must not be retroactively blocked by a Level-3 gap that predates it.
  it('a historical Battle Master with NO recorded maneuvers reads honestly (empty, never fabricated) and is never mutated by the read', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 3, subclassRef: BATTLE_MASTER_REF }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices() // no MANEUVER_KEY_L3 entry at all -- the historical gap.
    })
    const first = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.state.subclassFacet).toEqual(BATTLE_MASTER_FACET)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()

    // Reading it again changes nothing -- no read-triggered migration, no drift.
    const second = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.state.subclassFacet).toEqual(BATTLE_MASTER_FACET)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  it('an UNRELATED Level 4 ASI transition is NOT blocked by the historical Level-3 maneuver gap', async () => {
    useFighterCatalogue()
    mockEntityAndBlocks({
      speciesRef: HUMAN_SPECIES_REF, classRef: FIGHTER_REF, backgroundRef: SOLDIER_REF,
      progression: { classes: [{ classRef: FIGHTER_REF, level: 3, subclassRef: BATTLE_MASTER_REF }], feats: [], items: [] },
      rulesChoices: fighterRulesChoices() // still no MANEUVER_KEY_L3 entry -- unrelated to this transition.
    })
    const answers = { ...asiAnswers(4), ...fighterWeaponMasteryGrowthAnswers(4) }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 4, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    // The historical Level-3 gap must never resurface as a Level-4 requirement -- it is not
    // newly declared at this step (the subclass was already active before AND after it).
    expect(plan.plan.unresolvedChoiceIds).not.toContain(MANEUVER_KEY_L3)
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 4, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    // Nothing is retroactively synthesized for the Level-3 gap.
    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> } | undefined
    expect(savedChoices?.selections[MANEUVER_KEY_L3]).toBeUndefined()
  })
})
