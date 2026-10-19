// D&D 2024 Character Rules A3 WORKSTREAM -- THIRD-CASTER LEVELED SPELL ACQUISITION.
//
// PRODUCTION-PATH ACCEPTANCE -- with the REAL completeness authority. This file never stubs
// creation-completeness (tests/rules/completeness-stub-policy.test.ts's own ACCEPTANCE_REAL
// classification): a transition that still crosses a genuinely blocked decision is refused here
// exactly as it would be for a real player, through the same planProgression/confirmProgression/
// resolveCurrentProgression authority every other acceptance file in this family uses. Mirrors
// character-progression-fail-closed.test.ts's own mocking boundary (assembleCharacter/
// getWorldRuntime/saveCharacterProgression/rulesChoices/content-pack-bindings/content-catalogue
// mocked; the Rules Runtime built REAL via createWorldRuntime from the actual package on disk).
//
// Proves the fix: `effectiveCasterTypeOf` (server/utils/character-spell-acquisition.ts) lets a
// character's effective caster type be granted by EITHER the class facet (every ordinary full/
// half/pact caster, UNCHANGED) or the subclass facet (Eldritch Knight's/Arcane Trickster's own
// third-caster progression, newly reachable) -- never a silent precedence, never a second
// evaluator, no class/subclass name in the resolver itself.
//
// Covers: EK/AT initial Level-3 leveled spells, growth, direct level jumps, illegal/missing
// selection rejection, cross-subclass isolation, persistence, fresh reload, AND regression for
// Wizard (full), Cleric (half via Paladin instead, see below), Ranger (half), and a noncaster
// Fighter with no third-caster subclass -- proving the generalization changed nothing for any of
// them. Multiclass: the engine already refuses true multiclassing outright
// (`multiclass-not-supported`, character-progression-plan.ts) before this resolver is ever
// reached with two real class facets at once -- re-confirmed live, not merely cited.

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
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { resolveDnd5eItemMechanics } from '../../../app/lib/item-mechanics/dnd5e'
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

const EK_REF = { packageId: PKG, slug: 'eldritch-knight-xphb' }
const EK_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'eldritch-knight-xphb')!
const FIGHTER_FACET = findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')!
const ekCantripReq = EK_FACET.spellRequirements!.find((r) => r.pool === 'cantrip')!
const ekSpellReq = EK_FACET.spellRequirements!.find((r) => r.pool === 'spell')!

const AT_REF = { packageId: PKG, slug: 'arcane-trickster-xphb' }
const AT_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'arcane-trickster-xphb')!
const ROGUE_FACET = findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb')!
const atCantripReq = AT_FACET.spellRequirements!.find((r) => r.pool === 'cantrip')!
const atSpellReq = AT_FACET.spellRequirements!.find((r) => r.pool === 'spell')!

const WIZARD_SPELL_CATALOGUE = [
  ...Array.from({ length: 5 }, (_, i) => spellCatalogueEntry(`wiz-cantrip-${i}`, 0, ['Wizard'], 'V')),
  ...Array.from({ length: 25 }, (_, i) => spellCatalogueEntry(`wiz-spell-${i}`, 1, ['Wizard'], 'V')),
  // A real Cleric spell -- never legal for either subclass's own Wizard-restricted pool.
  spellCatalogueEntry('cleric-only-spell', 1, ['Cleric'], 'V'),
  // Arcane Trickster's own Level-3 fixed grant (no "of your choice" clause).
  spellCatalogueEntry('mage-hand-xphb', 0, ['Wizard'], 'C', 'Mage Hand')
]

const EK_CATALOGUE_ENTRY = baseEntry({ title: 'Eldritch Knight', slug: EK_REF.slug, parentClassSlug: 'fighter-xphb', rulesFacet: EK_FACET })
const AT_CATALOGUE_ENTRY = baseEntry({ title: 'Arcane Trickster', slug: AT_REF.slug, parentClassSlug: 'rogue-xphb', rulesFacet: AT_FACET })
const BATTLE_MASTER_REF = { packageId: PKG, slug: 'battle-master-xphb' }
const BATTLE_MASTER_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'battle-master-xphb')!
const BATTLE_MASTER_CATALOGUE_ENTRY = baseEntry({ title: 'Battle Master', slug: BATTLE_MASTER_REF.slug, parentClassSlug: 'fighter-xphb', rulesFacet: BATTLE_MASTER_FACET })

// ASI feat, needed by every direct-level-jump/high-level test in this file (Fighter's/Rogue's
// own real Level-4+ ASI/Feat Selection rows), re-derived from the real package facet, never
// hand-typed.
const ASI_FEAT = baseEntry({
  title: 'Ability Score Improvement', slug: 'ability-score-improvement-xphb', externalId: 'Ability Score Improvement__XPHB',
  featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: true, prerequisiteGroups: [] },
  rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'ability-score-improvement-xphb') ?? undefined
})
// Epic Boon, needed by the Level-19 direct jump (Fighter's own real `progression:class.epic
// -boon` row, a SEPARATE ChoiceSet from ordinary ASI/Feat Selection -- `choice:feat.epic-boon`,
// filtered to `featMechanics.category === 'epic-boon'`). No package rulesFacet is authored for
// any real Epic Boon feat (deliberately, per the package's own Feats header) -- only a
// catalogue entry with the right category is needed to answer the choice itself.
const EPIC_BOON_FEAT = baseEntry({
  title: 'Boon of Fortitude', slug: 'boon-of-fortitude-xphb', externalId: 'Boon of Fortitude__XPHB',
  featMechanics: { category: 'epic-boon', variant: 'EB', unsupportedPrerequisites: [], repeatable: false, prerequisiteGroups: [] }
})

// Weapon Mastery answers are item-catalogue ContentRefs, never bare Value ids (confirmed against
// create-v2-weapon-mastery.test.ts's own real fixture) -- 6 distinct real-shaped melee weapons,
// enough for Fighter's own Level-1 count of 3 plus its own Level-4/10/16 growth (1 each), and
// Rogue's own Level-1 count of 2 (Rogue has no growth row).
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
// Level 1's own Weapon Mastery pick is a FACET choice (`facet.choices`), keyed like every other
// creation-time choice (`choiceKey`, plain `slot:choiceSetId` -- no `progression:<at>` infix);
// only the L4/10/16 GROWTH rows below are real Progression Definition rows, keyed by
// `progressionChoiceKey`.
const FIGHTER_WEAPON_MASTERY_KEY = 'class:choice:class.weapon-mastery'
const ROGUE_WEAPON_MASTERY_KEY = 'class:choice:class.weapon-mastery'

function catalogueFor(extraSubclasses: ReturnType<typeof baseEntry>[] = []) {
  return {
    worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [],
    feats: [ASI_FEAT, EPIC_BOON_FEAT], items: WEAPONS, spells: WIZARD_SPELL_CATALOGUE, monsters: [],
    subclasses: [EK_CATALOGUE_ENTRY, AT_CATALOGUE_ENTRY, BATTLE_MASTER_CATALOGUE_ENTRY, ...extraSubclasses]
  }
}

// Fighter's own real Level-1 choices (Fighting Style, 2 skills, 3 Weapon Mastery kinds),
// preset as already-persisted `rulesChoices` -- unrelated to subclass ownership, but crossed by
// every test in this file (the REAL completeness/unresolved-choice gate is active, unlike the
// earlier UNIT-ISOLATION pass).
function fighterRulesChoices(extra: Record<string, string[]> = {}) {
  return {
    selections: {
      'class:choice:feat.fighting-style.fs-only': ['source:fighting-style.defense'],
      'class:choice:skill.proficiency': ['value:skill.athletics.proficient', 'value:skill.history.proficient'],
      [FIGHTER_WEAPON_MASTERY_KEY]: weaponRefs(3),
      ...extra
    }
  }
}

// Rogue's own real Level-1 choices: 4 skills, 2 Weapon Mastery kinds (no later growth -- Rogue's
// own progression array carries no weapon-mastery-growth row, confirmed by direct read), 2
// skill Expertise picks, and the Thieves' Cant feature's own embedded language choice.
function rogueRulesChoices(extra: Record<string, string[]> = {}) {
  return {
    selections: {
      'class:choice:skill.proficiency': [
        'value:skill.stealth.proficient', 'value:skill.sleight_of_hand.proficient',
        'value:skill.deception.proficient', 'value:skill.investigation.proficient'
      ],
      [ROGUE_WEAPON_MASTERY_KEY]: weaponRefs(2),
      'class:choice:skill.expertise': ['value:skill.stealth.expertise', 'value:skill.sleight_of_hand.expertise'],
      'class:choice:language.known': ['value:language.thieves_cant.known'],
      ...extra
    }
  }
}

function fighterBlueprint(level: number, subclassRef: { packageId: string, slug: string } | null, spells: AssembledSpellEntry[] = [], rulesChoices = fighterRulesChoices(), facetOverride = EK_FACET) {
  return {
    worldId: WORLD_ID, characterId: CHARACTER_ID, characterTitle: 'A3 Eldritch Knight Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: FIGHTER_FACET }) },
    subclass: subclassRef
      ? { status: 'resolved' as const, entry: baseEntry({ title: 'Eldritch Knight', slug: subclassRef.slug, parentClassSlug: 'fighter-xphb', rulesFacet: facetOverride }) }
      : { status: 'missing' as const },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Soldier', slug: 'soldier-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 16, dex: 12, con: 14, int: 12, wis: 10, cha: 10 } },
    rulesChoices,
    inventory: [], notes: null, health: null, spells, expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: 'fighter-xphb' }, level, subclassRef }] },
    resources: null, packs: []
  }
}

function rogueBlueprint(level: number, subclassRef: { packageId: string, slug: string } | null, spells: AssembledSpellEntry[] = [], rulesChoices = rogueRulesChoices()) {
  return {
    worldId: WORLD_ID, characterId: CHARACTER_ID, characterTitle: 'A3 Arcane Trickster Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved' as const, entry: baseEntry({ title: 'Rogue', slug: 'rogue-xphb', rulesFacet: ROGUE_FACET }) },
    subclass: subclassRef
      ? { status: 'resolved' as const, entry: baseEntry({ title: 'Arcane Trickster', slug: subclassRef.slug, parentClassSlug: 'rogue-xphb', rulesFacet: AT_FACET }) }
      : { status: 'missing' as const },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Criminal', slug: 'criminal-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 16, con: 14, int: 12, wis: 10, cha: 10 } },
    rulesChoices,
    inventory: [], notes: null, health: null, spells, expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: PKG, slug: 'rogue-xphb' }, level, subclassRef }] },
    resources: null, packs: []
  }
}

function useFighterFixture(level: number, subclassRef: { packageId: string, slug: string } | null = null, spells: AssembledSpellEntry[] = [], rulesChoices?: ReturnType<typeof fighterRulesChoices>, facetOverride?: typeof EK_FACET) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: fighterBlueprint(level, subclassRef, spells, rulesChoices ?? fighterRulesChoices(), facetOverride ?? EK_FACET) })
}

function useRogueFixture(level: number, subclassRef: { packageId: string, slug: string } | null = null, spells: AssembledSpellEntry[] = [], rulesChoices?: ReturnType<typeof rogueRulesChoices>) {
  getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: rogueBlueprint(level, subclassRef, spells, rulesChoices ?? rogueRulesChoices()) })
}

const FIGHTER_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
const ROGUE_SUBCLASS_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')

// Re-derived directly from the real package Progression Definitions (progression:class.asi
// -extended / asi-frequent / epic-boon / weapon-mastery-growth-4-10-16), never hand-typed.
const FIGHTER_ASI_LEVELS = [4, 6, 8, 12, 14, 16]
const ROGUE_ASI_LEVELS = [4, 8, 10, 12, 16]
const FIGHTER_WEAPON_MASTERY_GROWTH_LEVELS = [4, 10, 16]

function asiAnswers(level: number, asiLevels: readonly number[]): Record<string, string[]> {
  const answers: Record<string, string[]> = {}
  for (const l of asiLevels.filter((l) => l <= level)) {
    const key = progressionChoiceKey('class', l, 'choice:feat.selection')
    answers[key] = [serializeContentRef({ packageId: PKG, slug: 'ability-score-improvement-xphb' })]
    answers[`feat:${key}:choice:feat.asi-ability-increase`] = ['source:asi.increase.str', 'source:asi.increase.str']
  }
  return answers
}

function epicBoonAnswer(level: number): Record<string, string[]> {
  if (level < 19) return {}
  return { [progressionChoiceKey('class', 19, 'choice:feat.epic-boon')]: [serializeContentRef({ packageId: PKG, slug: 'boon-of-fortitude-xphb' })] }
}

function fighterWeaponMasteryGrowthAnswers(level: number): Record<string, string[]> {
  const answers: Record<string, string[]> = {}
  // The 3 weapons NOT already selected at Level 1 (weaponRefs(3), offset 0) -- one newly-distinct
  // weapon per growth level, matching the real "a kind you don't already have" dedup rule.
  const picks = weaponRefs(3, 3)
  FIGHTER_WEAPON_MASTERY_GROWTH_LEVELS.filter((l) => l <= level).forEach((l, i) => {
    answers[progressionChoiceKey('class', l, 'choice:class.weapon-mastery')] = [picks[i]!]
  })
  return answers
}

function fighterAnswers(level: number): Record<string, string[]> {
  return { ...asiAnswers(level, FIGHTER_ASI_LEVELS), ...epicBoonAnswer(level), ...fighterWeaponMasteryGrowthAnswers(level) }
}

function rogueAnswers(level: number): Record<string, string[]> {
  const expertiseGrowth = level >= 6
    ? { [progressionChoiceKey('class', 6, 'choice:skill.expertise')]: ['value:skill.deception.expertise', 'value:skill.investigation.expertise'] }
    : {}
  return { ...asiAnswers(level, ROGUE_ASI_LEVELS), ...epicBoonAnswer(level), ...expertiseGrowth }
}

describe('A3 WORKSTREAM -- Eldritch Knight (Fighter): third-caster leveled spell acquisition, real completeness authority', () => {
  it('CONFIRM at Level 3 -- initial leveled spells (cantrips + 1st-level) persist together', async () => {
    useFighterFixture(1)
    const answers = {
      [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(EK_REF)],
      [spellAnswerKey(ekCantripReq, 3)]: Array.from({ length: ekCantripReq.totalByLevel[2]! }, (_, i) => `${PKG}::wiz-cantrip-${i}`),
      [spellAnswerKey(ekSpellReq, 3)]: Array.from({ length: ekSpellReq.totalByLevel[2]! }, (_, i) => `${PKG}::wiz-spell-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)
    expect(plan.plan.valid).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const bySlug = new Map(written.spells.map((e) => [e.ref!.slug, e]))
    expect(written.spells).toHaveLength(ekCantripReq.totalByLevel[2]! + ekSpellReq.totalByLevel[2]!)
    for (let i = 0; i < ekCantripReq.totalByLevel[2]!; i++) expect(bySlug.get(`wiz-cantrip-${i}`)!.known).toBe(true)
    for (let i = 0; i < ekSpellReq.totalByLevel[2]!; i++) {
      expect(bySlug.get(`wiz-spell-${i}`), `wiz-spell-${i}`).toBeDefined()
      expect(bySlug.get(`wiz-spell-${i}`)!.prepared).toBe(true)
    }
  })

  it('LEVEL-UP 3 -> 7 -- the leveled spell count grows (3 -> 4) and the 2nd-level cap unlocks', async () => {
    const persistedSpells: AssembledSpellEntry[] = [
      ...Array.from({ length: ekCantripReq.totalByLevel[2]! }, (_, i) => ({
        instanceId: `c${i}`, ref: { packageId: PKG, slug: `wiz-cantrip-${i}` }, known: true, prepared: false,
        requirementIds: [ekCantripReq.id], status: 'resolved' as const, title: `wiz-cantrip-${i}`,
        entry: WIZARD_SPELL_CATALOGUE.find((s) => s.slug === `wiz-cantrip-${i}`)
      })),
      ...Array.from({ length: ekSpellReq.totalByLevel[2]! }, (_, i) => ({
        instanceId: `s${i}`, ref: { packageId: PKG, slug: `wiz-spell-${i}` }, known: false, prepared: true,
        requirementIds: [ekSpellReq.id], status: 'resolved' as const, title: `wiz-spell-${i}`,
        entry: WIZARD_SPELL_CATALOGUE.find((s) => s.slug === `wiz-spell-${i}`)
      }))
    ]
    useFighterFixture(3, EK_REF, persistedSpells)
    const answers = {
      ...fighterAnswers(7),
      [spellAnswerKey(ekSpellReq, 7)]: Array.from({ length: ekSpellReq.totalByLevel[6]! }, (_, i) => `${PKG}::wiz-spell-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 7, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 7, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    expect(written.spells.filter((s) => s.ref!.slug.startsWith('wiz-spell-'))).toHaveLength(ekSpellReq.totalByLevel[6]!)
  })

  it('DIRECT LEVEL JUMP 1 -> 19 -- ends with the full Level-19 leveled spell count (12) and every ASI crossed', async () => {
    useFighterFixture(1)
    const answers = {
      [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(EK_REF)],
      ...fighterAnswers(19),
      [spellAnswerKey(ekCantripReq, 19)]: Array.from({ length: ekCantripReq.totalByLevel[18]! }, (_, i) => `${PKG}::wiz-cantrip-${i}`),
      [spellAnswerKey(ekSpellReq, 19)]: Array.from({ length: ekSpellReq.totalByLevel[18]! }, (_, i) => `${PKG}::wiz-spell-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 19, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)
    expect(plan.plan.valid).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 19, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    expect(written.spells.filter((s) => s.ref!.slug.startsWith('wiz-spell-'))).toHaveLength(ekSpellReq.totalByLevel[18]!)
    expect(ekSpellReq.totalByLevel[18]).toBe(12)
  })

  it('REJECTS an illegal selection -- a real Cleric spell does not satisfy the Wizard-restricted leveled pool', async () => {
    useFighterFixture(1)
    const answers = {
      [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(EK_REF)],
      [spellAnswerKey(ekCantripReq, 3)]: Array.from({ length: ekCantripReq.totalByLevel[2]! }, (_, i) => `${PKG}::wiz-cantrip-${i}`),
      [spellAnswerKey(ekSpellReq, 3)]: [`${PKG}::cleric-only-spell`, `${PKG}::wiz-spell-0`, `${PKG}::wiz-spell-1`]
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const requirement = plan.plan.spellPlan!.requirements.find((r) => r.requirementId === ekSpellReq.id)
    expect(requirement!.missing).toBeGreaterThan(0)
    expect(plan.plan.spellPlan!.complete).toBe(false)
  })

  it('REJECTS a plan missing the mandatory leveled-spell selection entirely', async () => {
    useFighterFixture(1)
    const answers = {
      [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(EK_REF)],
      [spellAnswerKey(ekCantripReq, 3)]: Array.from({ length: ekCantripReq.totalByLevel[2]! }, (_, i) => `${PKG}::wiz-cantrip-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const requirement = plan.plan.spellPlan!.requirements.find((r) => r.requirementId === ekSpellReq.id)
    expect(requirement!.missing).toBe(ekSpellReq.totalByLevel[2])
    expect(plan.plan.spellPlan!.complete).toBe(false)
  })

  it('FRESH RELOAD -- resolveCurrentProgression independently re-derives the same persisted leveled spells', async () => {
    const persistedSpells: AssembledSpellEntry[] = Array.from({ length: ekSpellReq.totalByLevel[2]! }, (_, i) => ({
      instanceId: `s${i}`, ref: { packageId: PKG, slug: `wiz-spell-${i}` }, known: false, prepared: true,
      requirementIds: [ekSpellReq.id], status: 'resolved' as const, title: `wiz-spell-${i}`,
      entry: WIZARD_SPELL_CATALOGUE.find((s) => s.slug === `wiz-spell-${i}`)
    }))
    useFighterFixture(3, EK_REF, persistedSpells)
    const current = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(current.ok).toBe(true)
    if (!current.ok) return
    expect(current.state.subclassFacet).toEqual(EK_FACET)
    expect(current.state.spells).toHaveLength(ekSpellReq.totalByLevel[2])
  })

  it('CROSS-SUBCLASS ISOLATION -- a Battle Master Fighter (a DIFFERENT subclass) gets zero Eldritch Knight spell requirements', async () => {
    useFighterFixture(1, null, [], fighterRulesChoices(), BATTLE_MASTER_FACET)
    const answers = { [FIGHTER_SUBCLASS_KEY]: [serializeContentRef(BATTLE_MASTER_REF)] }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    // Battle Master has no spellRequirements at all -- the plan carries no spell plan whatsoever.
    expect(plan.plan.spellPlan).toBeNull()
  })

  it('REGRESSION -- a plain Fighter with NO subclass selected (noncaster) gets zero spell plan at any level', async () => {
    useFighterFixture(1)
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 2)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan).toBeNull()
  })
})

describe('A3 WORKSTREAM -- Arcane Trickster (Rogue): the same fix, a second real third-caster subclass', () => {
  it('CONFIRM at Level 3 -- Mage Hand (fixed) + cantrips + 1st-level leveled spells all persist together', async () => {
    useRogueFixture(1)
    const answers = {
      [ROGUE_SUBCLASS_KEY]: [serializeContentRef(AT_REF)],
      [spellAnswerKey(atCantripReq, 3)]: Array.from({ length: atCantripReq.totalByLevel[2]! }, (_, i) => `${PKG}::wiz-cantrip-${i}`),
      [spellAnswerKey(atSpellReq, 3)]: Array.from({ length: atSpellReq.totalByLevel[2]! }, (_, i) => `${PKG}::wiz-spell-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const slugs = written.spells.map((s) => s.ref!.slug)
    expect(slugs).toContain('mage-hand-xphb')
    expect(written.spells.filter((s) => s.ref!.slug.startsWith('wiz-spell-'))).toHaveLength(atSpellReq.totalByLevel[2]!)
  })

  it('DIRECT LEVEL JUMP 1 -> 13 -- ends with the Level-13 leveled spell count (9), matching Eldritch Knight\'s identical real table', async () => {
    useRogueFixture(1)
    const answers = {
      [ROGUE_SUBCLASS_KEY]: [serializeContentRef(AT_REF)],
      ...rogueAnswers(13),
      [spellAnswerKey(atCantripReq, 13)]: Array.from({ length: atCantripReq.totalByLevel[12]! }, (_, i) => `${PKG}::wiz-cantrip-${i}`),
      [spellAnswerKey(atSpellReq, 13)]: Array.from({ length: atSpellReq.totalByLevel[12]! }, (_, i) => `${PKG}::wiz-spell-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 13, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 13, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    expect(written.spells.filter((s) => s.ref!.slug.startsWith('wiz-spell-'))).toHaveLength(9)
    expect(atSpellReq.totalByLevel[12]).toBe(9)
    expect(atSpellReq.totalByLevel).toEqual(ekSpellReq.totalByLevel)
  })
})

// ---------------------------------------------------------------------------
// REGRESSION -- ordinary full/half casters (class-granted caster type, no subclass grant at
// all) are completely unaffected by `effectiveCasterTypeOf`'s generalization. Re-verified
// directly against the real package facets, not merely cited from the prior report.
// ---------------------------------------------------------------------------
describe('A3 WORKSTREAM -- regression: ordinary caster types are unaffected by the generalization', () => {
  it('Wizard (full caster): casterTypeOf still resolves from the class facet alone', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!
    const grant = facet.grants?.find((g) => typeof g.set === 'string' && g.set.startsWith('value:spellcasting.caster_type.'))
    expect(grant?.set).toBe('value:spellcasting.caster_type.full')
    expect(facet.spellRequirements?.some((r) => r.pool === 'spellbook')).toBe(true)
  })

  it('Paladin (half caster): no subclass of Paladin\'s own grants a conflicting caster type', () => {
    const paladinFacet = findRulesFacet('dnd5e.2024', 'class', 'paladin-xphb')!
    const grant = paladinFacet.grants?.find((g) => typeof g.set === 'string' && g.set.startsWith('value:spellcasting.caster_type.'))
    expect(grant?.set).toBe('value:spellcasting.caster_type.half')
    for (const slug of ['oath-of-devotion-xphb', 'oath-of-glory-xphb', 'oath-of-the-ancients-xphb', 'oath-of-vengeance-xphb']) {
      const subclassFacet = findRulesFacet('dnd5e.2024', 'subclass', slug)
      expect(subclassFacet?.grants?.some((g) => typeof g.set === 'string' && g.set.startsWith('value:spellcasting.caster_type.')), slug).toBeFalsy()
    }
  })

  it('Ranger (half caster): no subclass of Ranger\'s own grants a conflicting caster type', () => {
    const rangerFacet = findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb')!
    const grant = rangerFacet.grants?.find((g) => typeof g.set === 'string' && g.set.startsWith('value:spellcasting.caster_type.'))
    expect(grant?.set).toBe('value:spellcasting.caster_type.half')
    for (const slug of ['fey-wanderer-xphb', 'gloom-stalker-xphb']) {
      const subclassFacet = findRulesFacet('dnd5e.2024', 'subclass', slug)
      expect(subclassFacet?.grants?.some((g) => typeof g.set === 'string' && g.set.startsWith('value:spellcasting.caster_type.')), slug).toBeFalsy()
    }
  })

  it('Only Eldritch Knight and Arcane Trickster, among every real subclass, grant a caster type at all', () => {
    const grantingSubclasses: string[] = []
    const catalogue = catalogueFor()
    for (const entry of catalogue.subclasses) {
      const facet = (entry as { rulesFacet?: { grants?: { set: string }[] } }).rulesFacet
      if (facet?.grants?.some((g) => g.set.startsWith('value:spellcasting.caster_type.'))) grantingSubclasses.push(entry.slug)
    }
    expect(grantingSubclasses.sort()).toEqual(['arcane-trickster-xphb', 'eldritch-knight-xphb'])
  })

  it('MULTICLASS -- a character recorded with two class entries is still refused outright, never reaching the caster-type resolver with two real class facets at once', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: {
        ...fighterBlueprint(3, EK_REF),
        progression: {
          classes: [
            { classRef: { packageId: PKG, slug: 'fighter-xphb' }, level: 3, subclassRef: EK_REF },
            { classRef: { packageId: PKG, slug: 'wizard-xphb' }, level: 1, subclassRef: null }
          ]
        }
      }
    })
    // The multiclass refusal lives in `confirmProgression` specifically (confirmed by direct
    // read: `base.classes.length > 1` is checked there, not in `planProgression`) -- Preview
    // still computes a plan (there is no real ambiguity in WHICH class's own slot-derivation the
    // generalized resolver would see here, since this blueprint's own fighter class entry is
    // `classes[0]`), but Confirm refuses outright before ever reaching the caster-type resolver
    // with two real class facets at once.
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 5)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 5, plan.plan.fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('multiclass-not-supported')
  })
})
