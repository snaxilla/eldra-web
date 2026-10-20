// D&D 2024 Character Rules A4 -- REMAINING MANDATORY DECISION CLOSURE, real-content acceptance.
//
// PRODUCTION-PATH ACCEPTANCE -- with the REAL completeness authority (tests/rules/completeness
// -stub-policy.test.ts's own ACCEPTANCE_REAL classification): a transition that still crosses a
// genuinely blocked decision is refused here exactly as it would be for a real player, through
// the same planProgression/confirmProgression authority every other acceptance file in this
// family uses. Mirrors character-progression-third-caster-spell-acceptance.test.ts's own mocking
// boundary and Fighter fixture.
//
// Covers six A4 workstreams, each reusing an EXISTING generic primitive under a subclass owner
// (never a new engine mechanism):
//   - Battle Master (Fighter): Combat Superiority maneuvers via choice:subclass.accumulating
//     -option (the SAME shape Eldritch Invocations/Sorcerer Metamagic already use) -- initial
//     pick, growth, and an illegal re-pick of an already-known maneuver.
//   - Champion (Fighter): Additional Fighting Style via the SAME choice:feat.fighting-style.fs
//     -only content pick the class already grants at Level 1 -- a second, distinct style, and an
//     illegal re-pick of the SAME style.
//   - Path of the Wild Heart (Barbarian): Aspect of the Wilds via choice:subclass.feature-option,
//     AND proof that Rage of the Wilds (a per-use runtime choice, not a build decision) requires
//     no answer at all.
//   - Hunter (Ranger): Hunter's Prey via choice:subclass.feature-option.
//   - Draconic Sorcery (Sorcerer): Elemental Affinity via its own dedicated damage-type ChoiceSet.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { confirmProgression, planProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey, choiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { spellAnswerKey } from '../../../server/utils/character-progression-spell-acquisition'
import xphbFeats from '../../lib/feat-mechanics/fixtures/xphb-feats.json'

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

function spellCatalogueEntry(slug: string, level: number, classLists: string[], school: string, title = slug) {
  return { packageId: PKG, slug, title, spellMechanics: resolveDnd5eSpellMechanics({ name: title, source: 'XPHB', level, school, classLists })! }
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

// The real XPHB feat corpus (fixture, re-derived through the real resolver), giving every real
// Fighting Style/ASI/Epic Boon feat catalogue entry for free -- never hand-typed.
const FEATS = xphbFeats.feats.map((raw) => {
  const slug = `${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-xphb`
  return baseEntry({
    title: raw.name, slug, externalId: `${raw.name}__XPHB`,
    featMechanics: resolveDnd5eFeatMechanics(raw),
    rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined
  })
})

function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...baseEntry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
const WEAPONS = [
  weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Shortsword', 'shortsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'] }),
  weaponEntry('Spear', 'spear-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['T|XPHB', 'V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Rapier', 'rapier-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB'], mastery: ['Vex|XPHB'] }),
  weaponEntry('Greatsword', 'greatsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['H|XPHB', '2H|XPHB'], mastery: ['Graze|XPHB'] }),
  weaponEntry('Battleaxe', 'battleaxe-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Topple|XPHB'] }),
  weaponEntry('Handaxe', 'handaxe-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['L|XPHB', 'T|XPHB'], mastery: ['Vex|XPHB'] })
]
function weaponRefs(count: number, offset = 0) {
  return WEAPONS.slice(offset, offset + count).map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug }))
}

const ASI_FEAT_REF = { packageId: PKG, slug: 'ability-score-improvement-xphb' }
function asiAnswers(level: number, asiLevels: readonly number[]): Record<string, string[]> {
  const answers: Record<string, string[]> = {}
  for (const l of asiLevels.filter((l) => l <= level)) {
    const key = progressionChoiceKey('class', l, 'choice:feat.selection')
    answers[key] = [serializeContentRef(ASI_FEAT_REF)]
    answers[`feat:${key}:choice:feat.asi-ability-increase`] = ['source:asi.increase.str', 'source:asi.increase.str']
  }
  return answers
}

// ---------------------------------------------------------------------------
// FIGHTER fixture (Battle Master, Champion) -- no spellcasting.
// ---------------------------------------------------------------------------
const FIGHTER_FACET = findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')!
const BATTLE_MASTER_REF = { packageId: PKG, slug: 'battle-master-xphb' }
const BATTLE_MASTER_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'battle-master-xphb')!
const CHAMPION_REF = { packageId: PKG, slug: 'champion-xphb' }
const CHAMPION_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'champion-xphb')!

const BATTLE_MASTER_ENTRY = baseEntry({ title: 'Battle Master', slug: BATTLE_MASTER_REF.slug, parentClassSlug: 'fighter-xphb', rulesFacet: BATTLE_MASTER_FACET })
const CHAMPION_ENTRY = baseEntry({ title: 'Champion', slug: CHAMPION_REF.slug, parentClassSlug: 'fighter-xphb', rulesFacet: CHAMPION_FACET })

function fighterCatalogueFor() {
  return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats: FEATS, items: WEAPONS, spells: [], monsters: [], subclasses: [BATTLE_MASTER_ENTRY, CHAMPION_ENTRY] }
}

const FIGHTER_WEAPON_MASTERY_KEY = 'class:choice:class.weapon-mastery'
// The L1 Fighting Style pick is a content-catalogue choice (choice:feat.fighting-style.fs-only,
// category: 'feats') -- its real answer is a ContentRef, never a bare Source id, so
// `findIllegalRepeatAcquisition` (character-progression-plan.ts) can actually see it as the
// SAME real feat acquisition a later, duplicate pick of 'archery-xphb' would collide with.
const ARCHERY_L1_KEY = 'class:choice:feat.fighting-style.fs-only'
function fighterRulesChoices(extra: Record<string, string[]> = {}) {
  return {
    selections: {
      [ARCHERY_L1_KEY]: [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })],
      'class:choice:skill.proficiency': ['value:skill.athletics.proficient', 'value:skill.history.proficient'],
      [FIGHTER_WEAPON_MASTERY_KEY]: weaponRefs(3),
      ...extra
    }
  }
}

function fighterBlueprint(level: number, subclassRef: { packageId: string, slug: string } | null, rulesChoices: ReturnType<typeof fighterRulesChoices>, facet: typeof BATTLE_MASTER_FACET) {
  return {
    worldId: WORLD_ID, characterId: CHARACTER_ID, characterTitle: 'A4 Fighter Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: FIGHTER_FACET }) },
    subclass: subclassRef
      ? { status: 'resolved' as const, entry: baseEntry({ title: subclassRef.slug, slug: subclassRef.slug, parentClassSlug: 'fighter-xphb', rulesFacet: facet }) }
      : { status: 'missing' as const },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Soldier', slug: 'soldier-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 16, dex: 12, con: 14, int: 12, wis: 10, cha: 10 } },
    rulesChoices,
    inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
    // The L1 Archery pick is ALSO a real StoredAcquiredFeat (the top-level, separate
    // `progression.feats` array `findIllegalRepeatAcquisition` actually reads -- never
    // `rulesChoices.selections`, which is a DIFFERENT persistence layer entirely).
    progression: {
      classes: [{ classRef: { packageId: PKG, slug: 'fighter-xphb' }, level, subclassRef }],
      feats: [{ featRef: { packageId: PKG, slug: 'archery-xphb' }, choiceKey: ARCHERY_L1_KEY }],
      items: []
    },
    resources: null, packs: []
  }
}

function useFighterFixture(level: number, subclassRef: { packageId: string, slug: string } | null, rulesChoices: ReturnType<typeof fighterRulesChoices>, facet: typeof BATTLE_MASTER_FACET) {
  getWorldContentCatalogueMock.mockResolvedValue(fighterCatalogueFor())
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: fighterBlueprint(level, subclassRef, rulesChoices, facet) })
}

const FIGHTER_SUBCLASS_SELECTION_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
const FIGHTER_ASI_LEVELS = [4, 6, 8, 12, 14, 16]
const FIGHTER_WEAPON_MASTERY_GROWTH_LEVELS = [4, 10, 16]
function fighterWeaponMasteryGrowthAnswers(level: number): Record<string, string[]> {
  const answers: Record<string, string[]> = {}
  const picks = weaponRefs(3, 3)
  FIGHTER_WEAPON_MASTERY_GROWTH_LEVELS.filter((l) => l <= level).forEach((l, i) => {
    answers[progressionChoiceKey('class', l, 'choice:class.weapon-mastery')] = [picks[i]!]
  })
  return answers
}

const ALL_MANEUVERS = [
  'value:maneuver.ambush.known', 'value:maneuver.bait_and_switch.known', 'value:maneuver.commanders_strike.known',
  'value:maneuver.commanding_presence.known', 'value:maneuver.disarming_attack.known', 'value:maneuver.distracting_strike.known',
  'value:maneuver.evasive_footwork.known', 'value:maneuver.feinting_attack.known', 'value:maneuver.goading_attack.known',
  'value:maneuver.lunging_attack.known', 'value:maneuver.maneuvering_attack.known', 'value:maneuver.menacing_attack.known',
  'value:maneuver.parry.known', 'value:maneuver.precision_attack.known', 'value:maneuver.pushing_attack.known',
  'value:maneuver.rally.known', 'value:maneuver.riposte.known', 'value:maneuver.sweeping_attack.known',
  'value:maneuver.tactical_assessment.known', 'value:maneuver.trip_attack.known'
]
// The INITIAL pick (Level 3, the SAME level the subclass is selected) is the subclass facet's
// own DIRECT `choices` field -- consumed by character-actor-bridge.ts's generic SLOT_ORDER loop
// under the PLAIN `choiceKey(slot, choiceSetId)` convention every owner's own baseline choices
// use (re-verified directly by reading that loop: `toResolvableChoice(slotKey, ...)`, never
// `progressionChoiceKey`). Only a LATER Progression-row growth pick (L7/10/15) uses the
// `progression:<at>` infix.
const MANEUVER_KEY_L3 = choiceKey('subclass', 'choice:subclass.accumulating-option')
const MANEUVER_KEY_L7 = progressionChoiceKey('subclass', 7, 'choice:subclass.accumulating-option')

describe('A4 -- Battle Master (Fighter): Combat Superiority maneuvers, real completeness authority', () => {
  it('CONFIRM at Level 3 -- three maneuvers persist as known', async () => {
    useFighterFixture(1, null, fighterRulesChoices(), BATTLE_MASTER_FACET)
    const answers = {
      [FIGHTER_SUBCLASS_SELECTION_KEY]: [serializeContentRef(BATTLE_MASTER_REF)],
      [MANEUVER_KEY_L3]: ALL_MANEUVERS.slice(0, 3)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
  })

  // CHARACTER INTEGRITY FIX -- a prior pass through this file reported, as an "architectural
  // note," that a NEWLY-selected subclass's own DIRECT `choices` field (Combat Superiority at
  // Level 3, the same level Battle Master itself is chosen) was not enforced as mandatory within
  // that same transition, and that `confirmProgression` accepted the transition with ZERO
  // maneuvers answered. That diagnosis was INCOMPLETE: it was an artifact of this file's own
  // UNIT_STUBBING mock (`assembleCharacterMock.mockResolvedValue(...)` returns a STATIC blueprint,
  // insensitive to the `tentativeSubclassRef` argument `getDerivedCharacterAtLevel` actually
  // passes -- so it can never exercise, or prove a fix for, the real mechanism). The REAL defect
  // (buildLevelStep applying the tentative subclass unconditionally to both ends of the step that
  // gains it, so its own facet choices were never seen as newly required) is real, was fixed
  // generically in `buildLevelStep` (character-progression-plan.ts), and is proven fixed by
  // `tests/server/utils/character-progression-subclass-direct-choice-acceptance.test.ts` -- the
  // dedicated real end-to-end file that, unlike this one, never mocks `character-assembly`. See
  // that file for the actual missing/illegal/crafted/persisted/fresh-reload proof.

  it('REJECTS a plan missing the mandatory GROWTH maneuver selection at Level 7 (subclass already persisted)', async () => {
    useFighterFixture(3, BATTLE_MASTER_REF, fighterRulesChoices({ [MANEUVER_KEY_L3]: ALL_MANEUVERS.slice(0, 3) }), BATTLE_MASTER_FACET)
    const answers = { ...asiAnswers(7, FIGHTER_ASI_LEVELS), ...fighterWeaponMasteryGrowthAnswers(7) }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(MANEUVER_KEY_L7)
    expect(plan.plan.valid).toBe(false)
  })

  it('LEVEL-UP 3 -> 7 -- two ADDITIONAL, distinct maneuvers are legal growth', async () => {
    useFighterFixture(3, BATTLE_MASTER_REF, fighterRulesChoices({ [MANEUVER_KEY_L3]: ALL_MANEUVERS.slice(0, 3) }), BATTLE_MASTER_FACET)
    const answers = {
      ...asiAnswers(7, FIGHTER_ASI_LEVELS),
      ...fighterWeaponMasteryGrowthAnswers(7),
      [MANEUVER_KEY_L7]: ALL_MANEUVERS.slice(3, 5)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
  })

  it('REJECTS re-picking an ALREADY-known maneuver as growth (excludeIfAlreadyActive narrows the legal pool)', async () => {
    useFighterFixture(3, BATTLE_MASTER_REF, fighterRulesChoices({ [MANEUVER_KEY_L3]: ALL_MANEUVERS.slice(0, 3) }), BATTLE_MASTER_FACET)
    const answers = {
      ...asiAnswers(7, FIGHTER_ASI_LEVELS),
      ...fighterWeaponMasteryGrowthAnswers(7),
      // Re-answers with ONE already-known maneuver (index 0) plus one new one -- illegal.
      [MANEUVER_KEY_L7]: [ALL_MANEUVERS[0]!, ALL_MANEUVERS[4]!]
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    require('node:fs').writeFileSync('/tmp/claude-0/-opt-eldra-eldra-web/a4b8af87-c24f-4806-a632-6359f533a3ee/scratchpad/debug-bm-growth.json', JSON.stringify(plan.plan, null, 2))
    expect(plan.plan.valid).toBe(false)
  })
})

const FIGHTING_STYLE_KEY_L1 = 'class:choice:feat.fighting-style.fs-only'
const FIGHTING_STYLE_KEY_L7 = progressionChoiceKey('subclass', 7, 'choice:feat.fighting-style.fs-only')

describe('A4 -- Champion (Fighter): Additional Fighting Style, real completeness authority', () => {
  it('CONFIRM at Level 7 -- a second, DISTINCT Fighting Style is legal growth', async () => {
    useFighterFixture(3, CHAMPION_REF, fighterRulesChoices(), CHAMPION_FACET)
    const answers = {
      ...asiAnswers(7, FIGHTER_ASI_LEVELS),
      ...fighterWeaponMasteryGrowthAnswers(7),
      [FIGHTING_STYLE_KEY_L7]: [serializeContentRef({ packageId: PKG, slug: 'defense-xphb' })]
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
  })

  it('REJECTS a plan missing the mandatory Additional Fighting Style selection', async () => {
    useFighterFixture(3, CHAMPION_REF, fighterRulesChoices(), CHAMPION_FACET)
    const answers = { ...asiAnswers(7, FIGHTER_ASI_LEVELS), ...fighterWeaponMasteryGrowthAnswers(7) }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.unresolvedChoiceIds).toContain(FIGHTING_STYLE_KEY_L7)
    expect(plan.plan.valid).toBe(false)
  })

  it('REJECTS re-picking the SAME Fighting Style already held (Archery twice)', async () => {
    useFighterFixture(3, CHAMPION_REF, fighterRulesChoices(), CHAMPION_FACET)
    const answers = {
      ...asiAnswers(7, FIGHTER_ASI_LEVELS),
      ...fighterWeaponMasteryGrowthAnswers(7),
      [FIGHTING_STYLE_KEY_L7]: [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })]
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('illegal-feat-selection')
  })
})

// ---------------------------------------------------------------------------
// BARBARIAN fixture (Path of the Wild Heart) -- no spellcasting.
// ---------------------------------------------------------------------------
const BARBARIAN_FACET = findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb')!
const WILD_HEART_REF = { packageId: PKG, slug: 'path-of-the-wild-heart-xphb' }
const WILD_HEART_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'path-of-the-wild-heart-xphb')!
const WILD_HEART_ENTRY = baseEntry({ title: 'Path of the Wild Heart', slug: WILD_HEART_REF.slug, parentClassSlug: 'barbarian-xphb', rulesFacet: WILD_HEART_FACET })

function barbarianCatalogueFor() {
  return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats: FEATS, items: WEAPONS, spells: [], monsters: [], subclasses: [WILD_HEART_ENTRY] }
}

const BARBARIAN_WEAPON_MASTERY_KEY = 'class:choice:class.weapon-mastery.melee-only'
function barbarianRulesChoices(extra: Record<string, string[]> = {}) {
  return {
    selections: {
      'class:choice:skill.proficiency': ['value:skill.athletics.proficient', 'value:skill.survival.proficient'],
      [BARBARIAN_WEAPON_MASTERY_KEY]: weaponRefs(2),
      [progressionChoiceKey('class', 3, 'choice:skill.proficiency')]: ['value:skill.intimidation.proficient'],
      ...extra
    }
  }
}

function barbarianBlueprint(level: number, subclassRef: { packageId: string, slug: string } | null, rulesChoices: ReturnType<typeof barbarianRulesChoices>) {
  return {
    worldId: WORLD_ID, characterId: CHARACTER_ID, characterTitle: 'A4 Barbarian Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: 'Barbarian', slug: 'barbarian-xphb', rulesFacet: BARBARIAN_FACET }) },
    subclass: subclassRef
      ? { status: 'resolved' as const, entry: baseEntry({ title: 'Path of the Wild Heart', slug: subclassRef.slug, parentClassSlug: 'barbarian-xphb', rulesFacet: WILD_HEART_FACET }) }
      : { status: 'missing' as const },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Soldier', slug: 'soldier-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 16, dex: 12, con: 15, int: 10, wis: 10, cha: 10 } },
    rulesChoices,
    inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: 'barbarian-xphb' }, level, subclassRef }] },
    resources: null, packs: []
  }
}

function useBarbarianFixture(level: number, subclassRef: { packageId: string, slug: string } | null, rulesChoices: ReturnType<typeof barbarianRulesChoices>) {
  getWorldContentCatalogueMock.mockResolvedValue(barbarianCatalogueFor())
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: barbarianBlueprint(level, subclassRef, rulesChoices) })
}

const BARBARIAN_ASI_LEVELS = [4, 8, 12, 16]
const ASPECT_KEY = progressionChoiceKey('subclass', 6, 'choice:subclass.feature-option')
const WEAPON_MASTERY_GROWTH_4_10_KEY = (level: number) => progressionChoiceKey('class', level, 'choice:class.weapon-mastery.melee-only')

describe('A4 -- Path of the Wild Heart (Barbarian): Aspect of the Wilds, and Rage of the Wilds needs no answer', () => {
  it('LEVEL-UP 3 -> 6 -- Aspect of the Wilds (Owl) is a legal, mandatory pick; Rage of the Wilds is answered by NOTHING', async () => {
    useBarbarianFixture(3, WILD_HEART_REF, barbarianRulesChoices())
    const answers = {
      ...asiAnswers(6, BARBARIAN_ASI_LEVELS),
      [WEAPON_MASTERY_GROWTH_4_10_KEY(4)]: [weaponRefs(1, 2)[0]!],
      [ASPECT_KEY]: ['source:aspect-of-the-wilds.owl']
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 6, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 6, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
  })

  it('REJECTS a plan missing the mandatory Aspect of the Wilds selection', async () => {
    useBarbarianFixture(3, WILD_HEART_REF, barbarianRulesChoices())
    const answers = {
      ...asiAnswers(6, BARBARIAN_ASI_LEVELS),
      [WEAPON_MASTERY_GROWTH_4_10_KEY(4)]: [weaponRefs(1, 2)[0]!]
      // No ASPECT_KEY answer at all.
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 6, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// RANGER fixture (Hunter) -- half-caster, needs a minimal real spell catalogue.
// ---------------------------------------------------------------------------
const RANGER_FACET = findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb')!
const HUNTER_REF = { packageId: PKG, slug: 'hunter-xphb' }
const HUNTER_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'hunter-xphb')!
const HUNTER_ENTRY = baseEntry({ title: 'Hunter', slug: HUNTER_REF.slug, parentClassSlug: 'ranger-xphb', rulesFacet: HUNTER_FACET })
const rangerCantripReq = RANGER_FACET.spellRequirements?.find((r) => r.pool === 'cantrip')
const rangerPreparedReq = RANGER_FACET.spellRequirements!.find((r) => r.pool === 'spell')!

const RANGER_SPELLS = Array.from({ length: 10 }, (_, i) => spellCatalogueEntry(`rng-spell-${i}`, 1, ['Ranger'], 'V'))

function rangerCatalogueFor() {
  return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats: FEATS, items: WEAPONS, spells: RANGER_SPELLS, monsters: [], subclasses: [HUNTER_ENTRY] }
}

function rangerBlueprint(level: number, subclassRef: { packageId: string, slug: string } | null) {
  return {
    worldId: WORLD_ID, characterId: CHARACTER_ID, characterTitle: 'A4 Hunter Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: 'Ranger', slug: 'ranger-xphb', rulesFacet: RANGER_FACET }) },
    subclass: subclassRef
      ? { status: 'resolved' as const, entry: baseEntry({ title: 'Hunter', slug: subclassRef.slug, parentClassSlug: 'ranger-xphb', rulesFacet: HUNTER_FACET }) }
      : { status: 'missing' as const },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Guide', slug: 'guide-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 10 } },
    rulesChoices: {
      selections: {
        'class:choice:skill.proficiency': ['value:skill.perception.proficient', 'value:skill.survival.proficient', 'value:skill.stealth.proficient'],
        'class:choice:class.weapon-mastery': weaponRefs(1)
      }
    },
    inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: 'ranger-xphb' }, level, subclassRef }] },
    resources: null, packs: []
  }
}

function useRangerFixture(level: number, subclassRef: { packageId: string, slug: string } | null = null) {
  getWorldContentCatalogueMock.mockResolvedValue(rangerCatalogueFor())
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: rangerBlueprint(level, subclassRef) })
}

const RANGER_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
// Same reasoning as Battle Master's own MANEUVER_KEY_L3 above: Hunter's Prey is at Level 3, the
// SAME level the Ranger selects its subclass, so it is a DIRECT facet choice (plain choiceKey).
const HUNTERS_PREY_KEY = choiceKey('subclass', 'choice:subclass.feature-option')

// Ranger's own real Level 2 Deft Explorer (skill Expertise + 2 languages) and Fighting Style --
// crossed by every test in this file that plans straight from Level 1 to Level 3, unrelated to
// Hunter's Prey itself but mandatory all the same under the real completeness authority.
function rangerLevel2Answers(): Record<string, string[]> {
  return {
    [progressionChoiceKey('class', 2, 'choice:skill.expertise')]: ['value:skill.perception.expertise'],
    [progressionChoiceKey('class', 2, 'choice:language.known')]: ['value:language.draconic.known', 'value:language.dwarvish.known'],
    [progressionChoiceKey('class', 2, 'choice:feat.fighting-style.fs-and-fs-r')]: [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })]
  }
}

describe('A4 -- Hunter (Ranger): Hunter\'s Prey, real completeness authority', () => {
  it('CONFIRM at Level 3 -- a legal Colossus Slayer answer does not block the transition, alongside the Ranger\'s own spell selection', async () => {
    useRangerFixture(1)
    const answers: Record<string, string[]> = {
      ...rangerLevel2Answers(),
      [RANGER_SUBCLASS_KEY]: [serializeContentRef(HUNTER_REF)],
      [HUNTERS_PREY_KEY]: ['source:hunters-prey.colossus-slayer'],
      [spellAnswerKey(rangerPreparedReq, 3)]: Array.from({ length: rangerPreparedReq.totalByLevel[2]! }, (_, i) => `${PKG}::rng-spell-${i}`)
    }
    if (rangerCantripReq) answers[spellAnswerKey(rangerCantripReq, 3)] = []
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
  })
})

// CHARACTER INTEGRITY FIX -- a prior pass through this file reported, as an "architectural
// note," that confirmProgression never persists a facet-direct subclass choice at all (legal or
// illegal), citing a direct read of confirmProgression's own persistence step. That diagnosis
// correctly identified the CODE PATH but drew the wrong conclusion about current behavior: this
// file's own UNIT_STUBBING mock makes `assembleCharacter` insensitive to `tentativeSubclassRef`,
// so it could only ever observe "never persists," regardless of whether the real engine's
// `diffRequiredChoices` correctly recognizes the choice as newly required in the first place.
// Fixed generically in `buildLevelStep` (character-progression-plan.ts) -- a legal answer now
// persists, an illegal one is now rejected before persistence is ever attempted, and a fresh
// reload reproduces it. Proven, for Hunter's Prey specifically, by
// `tests/server/utils/character-progression-subclass-direct-choice-acceptance.test.ts`'s own
// "VALID answer (Colossus Slayer)" test -- the dedicated real end-to-end file that never mocks
// `character-assembly`.

// ---------------------------------------------------------------------------
// SORCERER fixture (Draconic Sorcery) -- full caster, needs a minimal real spell catalogue.
// ---------------------------------------------------------------------------
const SORCERER_FACET = findRulesFacet('dnd5e.2024', 'class', 'sorcerer-xphb')!
const DRACONIC_SORCERY_REF = { packageId: PKG, slug: 'draconic-sorcery-xphb' }
const DRACONIC_SORCERY_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'draconic-sorcery-xphb')!
const DRACONIC_SORCERY_ENTRY = baseEntry({ title: 'Draconic Sorcery', slug: DRACONIC_SORCERY_REF.slug, parentClassSlug: 'sorcerer-xphb', rulesFacet: DRACONIC_SORCERY_FACET })

const DAMAGE_TYPE_KEY = progressionChoiceKey('subclass', 6, 'choice:subclass.elemental-affinity.damage-type')

const sorcererSpellReq = SORCERER_FACET.spellRequirements!.find((r) => r.pool === 'spell')!
const sorcererCantripReq = SORCERER_FACET.spellRequirements!.find((r) => r.pool === 'cantrip')!
const SORCERER_SPELLS = [
  ...Array.from({ length: 10 }, (_, i) => spellCatalogueEntry(`sorc-spell-${i}`, 1, ['Sorcerer'], 'V')),
  ...Array.from({ length: 5 }, (_, i) => spellCatalogueEntry(`sorc-cantrip-${i}`, 0, ['Sorcerer'], 'V')),
  // Draconic Sorcery's own real fixedSpellGrants crossed on the way from Level 3 to Level 6
  // (Level 3 AND Level 5 rows -- minLevel-windowed, both already due by Level 6).
  spellCatalogueEntry('alter-self-xphb', 2, [], 'T'),
  spellCatalogueEntry('chromatic-orb-xphb', 1, [], 'V'),
  spellCatalogueEntry('command-xphb', 1, [], 'E'),
  spellCatalogueEntry('dragons-breath-xphb', 2, [], 'T'),
  spellCatalogueEntry('fear-xphb', 3, [], 'I'),
  spellCatalogueEntry('fly-xphb', 3, [], 'T')
]
function sorcererSpellAnswers(level: number): Record<string, string[]> {
  return {
    [spellAnswerKey(sorcererSpellReq, level)]: Array.from({ length: sorcererSpellReq.totalByLevel[level - 1]! }, (_, i) => `${PKG}::sorc-spell-${i}`),
    [spellAnswerKey(sorcererCantripReq, level)]: Array.from({ length: sorcererCantripReq.totalByLevel[level - 1]! }, (_, i) => `${PKG}::sorc-cantrip-${i}`)
  }
}

function sorcererBlueprint(level: number) {
  return {
    worldId: WORLD_ID, characterId: CHARACTER_ID, characterTitle: 'A4 Draconic Sorcery Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: 'Sorcerer', slug: 'sorcerer-xphb', rulesFacet: SORCERER_FACET }) },
    subclass: { status: 'resolved' as const, entry: baseEntry({ title: 'Draconic Sorcery', slug: DRACONIC_SORCERY_REF.slug, parentClassSlug: 'sorcerer-xphb', rulesFacet: DRACONIC_SORCERY_FACET }) },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Hermit', slug: 'hermit-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 16 } },
    rulesChoices: { selections: {} },
    inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: 'sorcerer-xphb' }, level, subclassRef: DRACONIC_SORCERY_REF }] },
    resources: null, packs: []
  }
}
function useSorcererFixture(level: number) {
  getWorldContentCatalogueMock.mockResolvedValue({ worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats: FEATS, items: [], spells: SORCERER_SPELLS, monsters: [], subclasses: [DRACONIC_SORCERY_ENTRY] })
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: sorcererBlueprint(level) })
}
const SORCERER_ASI_LEVELS = [4, 8, 12, 16]

describe('A4 -- Draconic Sorcery (Sorcerer): Elemental Affinity, real completeness authority', () => {
  it('LEVEL-UP 3 -> 6 -- a free, standalone 5-option damage-type pick appears as its own unresolved choice until answered', async () => {
    useSorcererFixture(3)
    const withoutAnswer = await planProgression(WORLD_ID, CHARACTER_ID, 6, asiAnswers(6, SORCERER_ASI_LEVELS))
    expect(withoutAnswer.ok).toBe(true)
    if (!withoutAnswer.ok) return
    expect(withoutAnswer.plan.unresolvedChoiceIds).toContain(DAMAGE_TYPE_KEY)

    const withAnswer = await planProgression(WORLD_ID, CHARACTER_ID, 6, {
      ...asiAnswers(6, SORCERER_ASI_LEVELS),
      [DAMAGE_TYPE_KEY]: ['value:elemental-affinity.damage-type.fire.active']
    })
    expect(withAnswer.ok).toBe(true)
    if (!withAnswer.ok) return
    expect(withAnswer.plan.unresolvedChoiceIds).not.toContain(DAMAGE_TYPE_KEY)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 6, withAnswer.plan.fingerprint, {
      ...asiAnswers(6, SORCERER_ASI_LEVELS),
      ...sorcererSpellAnswers(6),
      [DAMAGE_TYPE_KEY]: ['value:elemental-affinity.damage-type.fire.active']
    })
    expect(result.ok).toBe(true)
  })
})
