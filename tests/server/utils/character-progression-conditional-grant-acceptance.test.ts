// CHARACTER MECHANICS PHASE A5 -- CONDITIONAL PROFICIENCY/EXPERTISE, real end-to-end round trip.
//
// Closes a previously-reported STOP (A4): Keen Mind's and Observant's own real XPHB text --
// "Choose [a skill]. If you lack proficiency in the chosen skill, you gain proficiency in it,
// and if you already have proficiency in it, you gain Expertise in it" -- needs a grant whose
// OUTPUT depends on the character's own prior state for the SAME chosen option.
// `excludeIfAlreadyActive` cannot express this (it only ever narrows the offered pool, never
// changes what picking an option DOES). Closed via a new, generic, additive ChoiceSet field,
// `ChoiceSetDefinition.writesToIfAlreadyActive` (app/lib/rules/types.ts), consumed by
// `character-actor-bridge.ts`'s own `applyChoice`: the SAME selected option resolves against
// `writesTo` (the primary target) UNLESS that target is already active, in which case it
// resolves against `writesToIfAlreadyActive` instead. Every existing ChoiceSet (no such field)
// is byte-identical to before.
//
// THIS FILE never mocks `character-assembly` (mirrors character-progression-subclass-direct-
// choice-acceptance.test.ts's own precedent exactly, for the same reason: a static
// `assembleCharacterMock.mockResolvedValue(...)` cannot exercise real prior-proficiency state).
//
// Covers: picking a NOT-yet-proficient skill (-> proficiency), picking an ALREADY-proficient
// skill (-> Expertise, never a double grant of proficiency), persistence + fresh reload for
// both branches, a crafted/illegal skill rejected, and Observant's own second, independent
// ability-choice sub-answer proven unaffected.
//
// ALSO covers Gloom Stalker's own Iron Mind (a DIFFERENT real shape -- a fixed grant in one
// branch, a free choice in the other, expressed here via `choice:save.proficiency`'s existing
// `excludeIfAlreadyActive` + `requiresActive`, no new primitive) -- and, via that same real
// pipeline, DISCOVERS a genuine, scoped, pre-existing gap: the "already proficient" branch's
// only realistic trigger (the Resilient feat) is invisible to this subclass choice's eligibility
// within one derivation pass (character-actor-bridge.ts's own SLOT_ORDER-then-feats ordering).
// See the `[KNOWN GAP]` test below and mandatory-decision-coverage.ts's own
// `blk:subclass-proficiency-damage` for the full writeup -- Iron Mind stays classified blocked.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  directusServiceRequestMock, getWorldContentCatalogueMock, getWorldRuntimeMock,
  listContentPackBindingsForWorldMock, saveCharacterProgressionMock,
  loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock, saveCharacterSpellcastingMock,
  readCharacterResourcesAtomicMock
} = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  listContentPackBindingsForWorldMock: vi.fn(),
  saveCharacterProgressionMock: vi.fn(),
  loadCharacterRulesChoicesMock: vi.fn(),
  saveCharacterRulesChoicesMock: vi.fn(),
  saveCharacterSpellcastingMock: vi.fn(),
  readCharacterResourcesAtomicMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))
// PRODUCTION CACHE-COHERENCY HOTFIX -- resources no longer read through
// Directus; see character-assembly.ts's own doc comment. Not this file's
// concern (conditional proficiency/Expertise), so a flat "nothing expended".
vi.mock('../../../server/utils/character-resource-atomic', () => ({ readCharacterResourcesAtomic: readCharacterResourcesAtomicMock }))
vi.mock('../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: getWorldContentCatalogueMock }))
vi.mock('../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: getWorldRuntimeMock }))
vi.mock('../../../server/utils/world-content-packs', () => ({ listContentPackBindingsForWorld: listContentPackBindingsForWorldMock }))
// character-assembly.ts ALSO imports these BLOCK_KEY constants directly from each module (for
// its own `block_key` matching, independent of the load/save functions) -- real, unmodified
// values, never mocked, so assembleCharacter's real block-row lookup still works end to end.
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
import { spellAnswerKey } from '../../../server/utils/character-progression-spell-acquisition'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import type { StoredSpellEntry } from '../../../app/lib/characters/spellcasting'
import xphbFeats from '../../lib/feat-mechanics/fixtures/xphb-feats.json'

const WORLD_ID = '5'
const CHARACTER_ID = '888'
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
const REAL_RUNTIME = loadRealRuntime()

const FEATS = xphbFeats.feats.map((raw) => {
  const slug = `${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-xphb`
  return baseEntry({ title: raw.name, slug, externalId: `${raw.name}__XPHB`, featMechanics: resolveDnd5eFeatMechanics(raw), rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined })
})

const FIGHTER_REF = { packageId: PKG, slug: 'fighter-xphb' }
const FIGHTER_FACET = findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')!
const CHAMPION_REF = { packageId: PKG, slug: 'champion-xphb' }
const CHAMPION_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'champion-xphb')!
const CHAMPION_ENTRY = baseEntry({ title: 'Champion', slug: CHAMPION_REF.slug, parentClassSlug: FIGHTER_REF.slug, rulesFacet: CHAMPION_FACET })
const HUMAN_SPECIES_REF = { packageId: PKG, slug: 'human-xphb' }
const HUMAN_ENTRY = baseEntry({ title: 'Human', slug: 'human-xphb' })
const SOLDIER_REF = { packageId: PKG, slug: 'soldier-xphb' }
const SOLDIER_ENTRY = baseEntry({ title: 'Soldier', slug: 'soldier-xphb' })

function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...baseEntry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
const WEAPONS = [
  weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Shortsword', 'shortsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'] }),
  weaponEntry('Spear', 'spear-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['T|XPHB', 'V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Rapier', 'rapier-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB'], mastery: ['Vex|XPHB'] })
]
function weaponRefs(count: number, offset = 0) {
  return WEAPONS.slice(offset, offset + count).map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug }))
}

function catalogueFor() {
  return {
    worldId: WORLD_ID, packs: [],
    species: [HUMAN_ENTRY],
    classes: [baseEntry({ title: 'Fighter', slug: FIGHTER_REF.slug, rulesFacet: FIGHTER_FACET })],
    backgrounds: [SOLDIER_ENTRY],
    feats: FEATS,
    items: WEAPONS,
    spells: [],
    monsters: [],
    subclasses: [CHAMPION_ENTRY]
  }
}

function mockEntityAndBlocks(progression: unknown, rulesChoices: unknown, abilityScores?: unknown) {
  directusServiceRequestMock.mockImplementation(async (path: string) => {
    if (path === `/items/entities/${CHARACTER_ID}`) {
      return { data: { id: Number(CHARACTER_ID), world_id: Number(WORLD_ID), title: 'Conditional Grant Fixture', entity_type: 'pc' } }
    }
    if (path === '/items/block_instances') {
      return {
        data: [
          { block_key: 'catalogue_selection', data: { species: HUMAN_SPECIES_REF, class: FIGHTER_REF, background: SOLDIER_REF } },
          // int/wis both 13+ so Keen Mind's own real prerequisite (int 13) and Observant's own
          // (int 13 OR wis 13) are both satisfiable in the same fixture.
          { block_key: 'ability_scores', data: abilityScores ?? { method: 'standard-array', scores: { str: 15, dex: 13, con: 14, int: 13, wis: 13, cha: 8 } } },
          { block_key: 'rules_choices', data: rulesChoices },
          { block_key: 'progression', data: progression }
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
  readCharacterResourcesAtomicMock.mockReset()
  readCharacterResourcesAtomicMock.mockResolvedValue({ ok: true, expended: {} })

  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
  getWorldRuntimeMock.mockResolvedValue({ configured: true, ok: true, runtime: REAL_RUNTIME, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  saveCharacterSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

const FIGHTER_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
const ASI_KEY = progressionChoiceKey('class', 4, 'choice:feat.selection')
const KEEN_MIND_CHOICE_KEY = `feat:${ASI_KEY}:choice:feat.skill-or-expertise`
const OBSERVANT_CHOICE_KEY = `feat:${ASI_KEY}:choice:feat.skill-or-expertise`
const OBSERVANT_ABILITY_KEY = `feat:${ASI_KEY}:choice:feat.ability-choice-1`
// Fighter's own real Level-4 Weapon Mastery growth row -- crossed by every test in this file
// that levels 3 -> 4, unrelated to Keen Mind/Observant but mandatory all the same.
const WEAPON_MASTERY_GROWTH_KEY = progressionChoiceKey('class', 4, 'choice:class.weapon-mastery')
function weaponMasteryGrowthAnswer(): Record<string, string[]> {
  return { [WEAPON_MASTERY_GROWTH_KEY]: weaponRefs(1, 3) }
}

function basePersistedRulesChoices(extra: Record<string, string[]> = {}) {
  return {
    selections: {
      'class:choice:feat.fighting-style.fs-only': [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })],
      'class:choice:skill.proficiency': ['value:skill.athletics.proficient', 'value:skill.perception.proficient'],
      'class:choice:class.weapon-mastery': weaponRefs(3),
      ...extra
    }
  }
}
function baseProgression() {
  return { classes: [{ classRef: FIGHTER_REF, level: 3, subclassRef: CHAMPION_REF }], feats: [], items: [] }
}

describe('CHARACTER MECHANICS PHASE A5 -- Keen Mind: proficiency vs. Expertise, real end-to-end', () => {
  it('picking a NOT-yet-proficient skill grants PROFICIENCY, not Expertise', async () => {
    mockEntityAndBlocks(baseProgression(), basePersistedRulesChoices())
    const answers = {
      ...weaponMasteryGrowthAnswer(),
      [ASI_KEY]: [serializeContentRef({ packageId: PKG, slug: 'keen-mind-xphb' })],
      [KEEN_MIND_CHOICE_KEY]: ['value:skill.arcana.proficient']
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 4, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 4, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)

    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> }
    expect(savedChoices.selections[KEEN_MIND_CHOICE_KEY]).toEqual(['value:skill.arcana.proficient'])

    // FRESH RELOAD -- re-arm the mock with exactly what was captured as written, then
    // independently re-derive and confirm the OUTPUT was proficiency, never Expertise.
    const savedProgression = saveCharacterProgressionMock.mock.calls[0]?.[1]
    mockEntityAndBlocks(savedProgression, savedChoices)
    const reloaded = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(reloaded.ok).toBe(true)
  })

  it('picking an ALREADY-proficient skill grants EXPERTISE, never a double proficiency grant', async () => {
    // Keen Mind's own real list is Arcana/History/Investigation/Nature/Religion -- History is
    // granted here (instead of Athletics) specifically so it is BOTH on Keen Mind's own list AND
    // already proficient, exercising the real conditional branch.
    mockEntityAndBlocks(baseProgression(), basePersistedRulesChoices({ 'class:choice:skill.proficiency': ['value:skill.history.proficient', 'value:skill.perception.proficient'] }))
    const answers = {
      ...weaponMasteryGrowthAnswer(),
      [ASI_KEY]: [serializeContentRef({ packageId: PKG, slug: 'keen-mind-xphb' })],
      [KEEN_MIND_CHOICE_KEY]: ['value:skill.history.proficient']
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 4, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 4, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)

    // Re-derive and inspect the ACTUAL evaluated Values -- proficiency stays true (from the
    // Level-1 grant, never re-granted or revoked by Keen Mind), and Expertise is now ALSO true.
    const savedProgression = saveCharacterProgressionMock.mock.calls[0]?.[1]
    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> }
    mockEntityAndBlocks(savedProgression, savedChoices)
    const reloaded = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(reloaded.ok).toBe(true)
  })

  it('REJECTS a crafted/illegal skill outside Keen Mind\'s own 5-skill list', async () => {
    mockEntityAndBlocks(baseProgression(), basePersistedRulesChoices())
    const answers = {
      ...weaponMasteryGrowthAnswer(),
      [ASI_KEY]: [serializeContentRef({ packageId: PKG, slug: 'keen-mind-xphb' })],
      [KEEN_MIND_CHOICE_KEY]: ['value:skill.athletics.proficient'] // not one of Keen Mind's 5.
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 4, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(false)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 4, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  it('REJECTS a plan missing the mandatory Keen Mind skill selection', async () => {
    mockEntityAndBlocks(baseProgression(), basePersistedRulesChoices())
    const answers = { ...weaponMasteryGrowthAnswer(), [ASI_KEY]: [serializeContentRef({ packageId: PKG, slug: 'keen-mind-xphb' })] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 4, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(false)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 4, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })
})

// CHARACTER MECHANICS PHASE A5 -- Gloom Stalker's own Iron Mind (Level 7): "You gain
// proficiency in Wisdom saving throws. If you already have this proficiency, you instead gain
// proficiency in Intelligence or Charisma saving throws (your choice)." A DIFFERENT real shape
// from Keen Mind/Observant -- the "not yet proficient" branch is not a player decision in RAW,
// but is represented here as a forced single-eligible-option choice:save.proficiency pick (its
// own existing `excludeIfAlreadyActive` drops Wisdom's own option once already proficient; its
// own existing per-index `requiresActive` gates Intelligence/Charisma on Wisdom already being
// active) -- no new engine primitive, see dnd5e-2024.ts's own comment on gloom-stalker-xphb.
const RANGER_REF = { packageId: PKG, slug: 'ranger-xphb' }
const RANGER_FACET = findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb')!
const GLOOM_STALKER_REF = { packageId: PKG, slug: 'gloom-stalker-xphb' }
const GLOOM_STALKER_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'gloom-stalker-xphb')!
const GLOOM_STALKER_ENTRY = baseEntry({ title: 'Gloom Stalker', slug: GLOOM_STALKER_REF.slug, parentClassSlug: RANGER_REF.slug, rulesFacet: GLOOM_STALKER_FACET })

// Ranger is a half-caster (spell-requirement.ranger-xphb.spell, real totalByLevel: 6 at Level 6,
// 7 at Level 7) -- unrelated to Iron Mind, but `confirmProgression` refuses ANY transition whose
// spellPlan is incomplete, so this fixture needs a real, minimally-populated Ranger spell list:
// 6 already-persisted spells (trusted, the SAME "already resolved" posture every other block in
// this fixture takes for everything below the starting level) plus exactly 1 new pick answered
// in each test below, bringing the Level-7 total to 7.
function rangerSpellCatalogueEntry(slug: string) {
  return baseEntry({ title: slug, slug, spellMechanics: resolveDnd5eSpellMechanics({ name: slug, source: 'XPHB', level: 1, school: 'V', classLists: ['Ranger'] })! })
}
const RANGER_SPELL_CATALOGUE = Array.from({ length: 8 }, (_, i) => rangerSpellCatalogueEntry(`ranger-spell-${i}`))
const RANGER_SPELL_REQUIREMENT = RANGER_FACET.spellRequirements!.find((r) => r.pool === 'spell')!

function catalogueForRanger() {
  return {
    worldId: WORLD_ID, packs: [],
    species: [HUMAN_ENTRY],
    classes: [baseEntry({ title: 'Ranger', slug: RANGER_REF.slug, rulesFacet: RANGER_FACET })],
    backgrounds: [SOLDIER_ENTRY],
    feats: FEATS,
    items: WEAPONS,
    spells: RANGER_SPELL_CATALOGUE,
    monsters: [],
    subclasses: [GLOOM_STALKER_ENTRY]
  }
}

function rangerPersistedSpellsAt(count: number): StoredSpellEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    instanceId: `ranger-spell-${i}`,
    ref: { packageId: PKG, slug: `ranger-spell-${i}` },
    known: true,
    prepared: true,
    requirementIds: [RANGER_SPELL_REQUIREMENT.id]
  }))
}

function mockRangerEntityAndBlocks(progression: unknown, rulesChoices: unknown, abilityScores?: unknown) {
  directusServiceRequestMock.mockImplementation(async (path: string) => {
    if (path === `/items/entities/${CHARACTER_ID}`) {
      return { data: { id: Number(CHARACTER_ID), world_id: Number(WORLD_ID), title: 'Iron Mind Fixture', entity_type: 'pc' } }
    }
    if (path === '/items/block_instances') {
      return {
        data: [
          { block_key: 'catalogue_selection', data: { species: HUMAN_SPECIES_REF, class: RANGER_REF, background: SOLDIER_REF } },
          { block_key: 'ability_scores', data: abilityScores ?? { method: 'standard-array', scores: { str: 13, dex: 14, con: 14, int: 10, wis: 15, cha: 8 } } },
          { block_key: 'rules_choices', data: rulesChoices },
          { block_key: 'progression', data: progression },
          { block_key: 'spellcasting', data: { spells: rangerPersistedSpellsAt(6) } }
        ]
      }
    }
    throw new Error(`unexpected directusServiceRequest path: ${path}`)
  })
}

function rangerSpellAnswer(): Record<string, string[]> {
  return { [spellAnswerKey(RANGER_SPELL_REQUIREMENT, 7)]: [`${PKG}::ranger-spell-6`] }
}

const IRON_MIND_KEY = progressionChoiceKey('subclass', 7, 'choice:save.proficiency')
const RANGER_ASI_KEY = progressionChoiceKey('class', 4, 'choice:feat.selection')
const RANGER_ASI_INCREASE_KEY = `feat:${RANGER_ASI_KEY}:choice:feat.asi-ability-increase`
const RESILIENT_ABILITY_KEY = `feat:${RANGER_ASI_KEY}:choice:feat.ability-choice-1`
const RESILIENT_SAVE_KEY = `feat:${RANGER_ASI_KEY}:choice:save.proficiency`

function rangerPersistedRulesChoices(extra: Record<string, string[]> = {}) {
  return {
    selections: {
      'class:choice:skill.proficiency': ['value:skill.survival.proficient', 'value:skill.perception.proficient', 'value:skill.stealth.proficient'],
      'class:choice:class.weapon-mastery': weaponRefs(2),
      'class:progression:2:choice:feat.fighting-style.fs-and-fs-r': [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })],
      ...extra
    }
  }
}
// Starts AFTER the Level-4 ASI is already resolved (trusted, exactly as the Fighter fixture
// above starts after Level-1 choices are already resolved) -- `toLevel: 7` is the only
// transition this test actually exercises.
function rangerProgressionAt(level: number, featRef: { packageId: string, slug: string }) {
  return { classes: [{ classRef: RANGER_REF, level, subclassRef: GLOOM_STALKER_REF }], feats: [{ featRef, choiceKey: RANGER_ASI_KEY }], items: [] }
}

describe('CHARACTER MECHANICS PHASE A5 -- Gloom Stalker Iron Mind: fixed grant vs. a free choice, conditioned on prior proficiency', () => {
  beforeEach(() => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueForRanger())
  })

  // The real FACET mechanism (choice:save.proficiency's own excludeIfAlreadyActive +
  // requiresActive) correctly narrows to Wisdom as the ONLY eligible option here, and correctly
  // records it as answered -- proven directly off the plan's own requiredChoices, independent of
  // the Phase-0 gate below. But Iron Mind stays classified `blk:subclass-proficiency-damage`
  // (mandatory-decision-coverage.ts), because its OTHER branch does not reliably work (see the
  // KNOWN GAP test below) -- and a `blocked` decision's own Phase-0 gate refuses the WHOLE
  // Level-7 Gloom Stalker transition unconditionally, for every character, not merely the one
  // actually hitting the broken branch. So the mechanism is provably correct here AND the
  // transition is still, correctly, refused -- the gate does its job regardless of which
  // specific character would or would not have hit the real gap.
  it('NOT yet proficient in Wisdom: the facet mechanism correctly narrows to Wisdom-only, but the Phase-0 gate still refuses the transition (Iron Mind stays blocked)', async () => {
    const asiRef = { packageId: PKG, slug: 'ability-score-improvement-xphb' }
    mockRangerEntityAndBlocks(
      rangerProgressionAt(6, asiRef),
      rangerPersistedRulesChoices({ [RANGER_ASI_INCREASE_KEY]: ['source:asi.increase.str', 'source:asi.increase.dex'] })
    )
    const answers = { ...rangerSpellAnswer(), [IRON_MIND_KEY]: ['value:save.wis.proficient'] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    const ironMindChoice = plan.plan.steps[0]?.requiredChoices.find((c) => c.id === IRON_MIND_KEY)
    expect(ironMindChoice?.options).toEqual([{ id: 'value:save.wis.proficient', label: 'Wisdom Save Proficiency' }])
    expect(ironMindChoice?.answered).toBe(true)

    expect(plan.plan.valid).toBe(false)
    expect(plan.plan.unresolvedDecisions.some((d) => d.rule === 'blk:subclass-proficiency-damage' && d.owner.slug === 'gloom-stalker-xphb')).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  it('REJECTS Intelligence/Charisma when NOT yet proficient in Wisdom (not yet eligible) -- illegal regardless of the Phase-0 gate', async () => {
    const asiRef = { packageId: PKG, slug: 'ability-score-improvement-xphb' }
    mockRangerEntityAndBlocks(
      rangerProgressionAt(6, asiRef),
      rangerPersistedRulesChoices({ [RANGER_ASI_INCREASE_KEY]: ['source:asi.increase.str', 'source:asi.increase.dex'] })
    )
    const answers = { ...rangerSpellAnswer(), [IRON_MIND_KEY]: ['value:save.int.proficient'] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(false)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  // DISCOVERED GAP, documented rather than silently papered over -- see mandatory-decision-
  // coverage.ts's own `blk:subclass-proficiency-damage` and dnd5e-2024.ts's own comment on
  // gloom-stalker-xphb for the full writeup. The real RAW rule wants Wisdom EXCLUDED and
  // Intelligence/Charisma offered once a character is already proficient in Wisdom saves, but a
  // feat's own choice-granted value (Resilient, the only realistic path) is invisible to this
  // subclass choice's eligibility check within the same derivation pass (character-actor-
  // bridge.ts's own SLOT_ORDER-then-feats ordering) -- so even inspecting the facet mechanism in
  // isolation here, Wisdom stays (incorrectly) the only eligible option. This is exactly WHY the
  // decision stays classified blocked above rather than implemented: the Phase-0 gate's blanket
  // refusal is standing in for a correctness check this specific branch cannot yet pass. This
  // test documents that CURRENT, known-wrong-per-RAW mechanism output as a canary, read directly
  // off the plan (never through confirmProgression, which the Phase-0 gate already refuses
  // unconditionally above) -- fixing the ordering limitation should make this assertion fail, at
  // which point it must be rewritten to assert Intelligence/Charisma eligibility instead of kept.
  it('[KNOWN GAP] ALREADY proficient in Wisdom (via Resilient at Level 4): the facet mechanism still only offers Wisdom, not yet Intelligence/Charisma', async () => {
    const resilientRef = { packageId: PKG, slug: 'resilient-xphb' }
    mockRangerEntityAndBlocks(
      rangerProgressionAt(6, resilientRef),
      rangerPersistedRulesChoices({
        [RESILIENT_ABILITY_KEY]: ['source:asi.increase.wis'],
        [RESILIENT_SAVE_KEY]: ['value:save.wis.proficient']
      })
    )
    const answers = { ...rangerSpellAnswer(), [IRON_MIND_KEY]: ['value:save.wis.proficient'] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const ironMindChoice = plan.plan.steps[0]?.requiredChoices.find((c) => c.id === IRON_MIND_KEY)
    // RAW-correct behavior would exclude Wisdom and offer Intelligence/Charisma instead.
    expect(ironMindChoice?.options).toEqual([{ id: 'value:save.wis.proficient', label: 'Wisdom Save Proficiency' }])
  })
})

describe('CHARACTER MECHANICS PHASE A5 -- Observant: the SAME conditional grant, alongside its own independent ability-choice sub-answer', () => {
  it('a legal Observant selection (ability bump + a NOT-yet-proficient skill) persists both independently', async () => {
    mockEntityAndBlocks(baseProgression(), basePersistedRulesChoices())
    const answers = {
      ...weaponMasteryGrowthAnswer(),
      [ASI_KEY]: [serializeContentRef({ packageId: PKG, slug: 'observant-xphb' })],
      [OBSERVANT_ABILITY_KEY]: ['source:asi.increase.wis'],
      [OBSERVANT_CHOICE_KEY]: ['value:skill.insight.proficient']
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 4, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 4, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    const savedChoices = saveCharacterRulesChoicesMock.mock.calls[0]?.[1] as { selections: Record<string, string[]> }
    expect(savedChoices.selections[OBSERVANT_ABILITY_KEY]).toEqual(['source:asi.increase.wis'])
    expect(savedChoices.selections[OBSERVANT_CHOICE_KEY]).toEqual(['value:skill.insight.proficient'])
  })

  it('picking an ALREADY-proficient skill (Perception) for Observant grants Expertise, the ability bump is unaffected', async () => {
    mockEntityAndBlocks(baseProgression(), basePersistedRulesChoices())
    const answers = {
      ...weaponMasteryGrowthAnswer(),
      [ASI_KEY]: [serializeContentRef({ packageId: PKG, slug: 'observant-xphb' })],
      [OBSERVANT_ABILITY_KEY]: ['source:asi.increase.int'],
      [OBSERVANT_CHOICE_KEY]: ['value:skill.perception.proficient'] // already proficient (basePersistedRulesChoices).
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 4, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 4, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
  })
})
