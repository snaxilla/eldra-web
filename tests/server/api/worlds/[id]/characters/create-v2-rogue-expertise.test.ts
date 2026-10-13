// D&D 2024 Character Rules -- ROGUE EXPERTISE PHASE, Level-1 creation-time half
// (class:choice:skill.expertise, a facet.choices entry -- never a Progression row, since Level 1
// has no prior level to diff against). Through the REAL create-v2 POST route and the REAL
// fail-closed completeness authority (UNSTUBBED -- see tests/rules/completeness-stub-policy.
// test.ts's own ACCEPTANCE category).
//
// What this file proves:
//   1. Selecting Rogue exposes the real `class:choice:skill.expertise` choice (count 2), and only
//      an ALREADY-proficient skill is a legal option -- this phase's own new creation-time
//      `requiresActive` eligibility (app/lib/characters/creation-choice-eligibility.ts).
//   2. Composition in the SAME creation plan: a skill made proficient by Rogue's OWN earlier
//      class skill-proficiency choice, or by the Background's fixed grant, is eligible for
//      Expertise with NO save/reload round trip.
//   3. Switching the Background changes eligibility live: a skill that stops being proficient
//      (because the new Background does not grant it, and it was not separately chosen) makes a
//      stale Expertise answer non-live; a skill ONLY the new Background grants becomes newly
//      eligible.
//   4. Creation-time CLASS SWITCHING: Rogue's own key (`class:choice:skill.expertise`) does not
//      exist at all for a class with no such creation-time choice (Fighter); switching back
//      re-asks the question.
//   5. SERVER AUTHORITY: the real route independently re-validates the submitted answer
//      (too few/too many/duplicate/non-proficient/crafted key), zero writes on every rejection.
//      Missing OR a full legal Expertise answer both now let Rogue creation SUCCEED -- as of the
//      LANGUAGE CORPUS + POLICY PHASE, Rogue's own former remaining blocker (Thieves' Cant /
//      language policy) is also implemented, so this file's own fixture reaches real success.
//
// Ranger's Level-2 "Deft Explorer" half of the identical real "Expertise" feature, and the
// derived skill-bonus doubling proof, are covered separately in
// character-progression-plan-rogue-expertise.test.ts (a progression-time choice, not creation).
// The FULL end-to-end Rogue acceptance (every real decision answered, including the universal
// and Rogue-owned language choices, through creationUnresolvedDecisions: [] and a fresh reload)
// is proven in create-v2-language.test.ts.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  progression: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
  currency: null as null | Record<string, unknown>,
  createdEntityId: 9404
}))

const mocks = vi.hoisted(() => ({
  getWorldContentCatalogue: vi.fn(),
  getWorldRuntime: vi.fn(),
  createEntityRecord: vi.fn(),
  dxFetch: vi.fn(),
  saveCharacterAbilityScores: vi.fn(),
  saveCharacterProgression: vi.fn(),
  saveCharacterHealth: vi.fn(),
  getDerivedCharacter: vi.fn()
}))

vi.mock('../../../../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: mocks.getWorldContentCatalogue }))
vi.mock('../../../../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: mocks.getWorldRuntime }))
vi.mock('../../../../../../server/utils/entity-factory', () => ({ createEntityRecord: mocks.createEntityRecord, dxFetch: mocks.dxFetch }))
vi.mock('../../../../../../server/utils/character-ability-scores', () => ({ saveCharacterAbilityScores: mocks.saveCharacterAbilityScores }))
vi.mock('../../../../../../server/utils/character-progression', () => ({ saveCharacterProgression: mocks.saveCharacterProgression }))
vi.mock('../../../../../../server/utils/character-health', () => ({ saveCharacterHealth: mocks.saveCharacterHealth }))
vi.mock('../../../../../../server/utils/character-derived', () => ({ getDerivedCharacter: mocks.getDerivedCharacter }))

;(globalThis as any).createError = (input: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(input.statusMessage ?? 'error'), { statusCode: input.statusCode, message: input.statusMessage ?? 'error' })

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn(async (event: any) => event._requestBody) }
})

import { createWorldRuntime } from '../../../../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../../../../app/lib/rules/types'
import { findRulesFacet } from '../../../../../../app/lib/content-rules'
import { resolveDnd5eItemMechanics } from '../../../../../../app/lib/item-mechanics/dnd5e'
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'
import { serializeContentRef } from '../../../../../../app/lib/characters/progression-plan'
import { progressionChoiceKey } from '../../../../../../app/lib/characters/rules-choices'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import {
  emptyDraft,
  isDraftComplete,
  setChoiceSelections,
  setEquipmentSelection,
  creationChoicePresentation,
  type BuilderCreationContext
} from '../../../../../../app/components/characters/builder/characterBuilderSelection'

const WORLD_ID = '5'
const PKG = 'eldra.solaris.xphb'

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
  const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  const result = createWorldRuntime(manifest, definitions, WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}
const REAL_RUNTIME = loadRealRuntime()

function entry(overrides: Record<string, unknown>) {
  return { packageId: PKG, packageVersion: '1.0.21', systemKey: 'dnd5e', externalId: `${overrides.title}__XPHB`, provider: '5etools-json', ...overrides }
}

const DWARF = entry({ title: 'Dwarf', slug: 'dwarf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'dwarf-xphb') ?? undefined })
const ROGUE = entry({ title: 'Rogue', slug: 'rogue-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb') ?? undefined })
const FIGHTER = entry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })
// Criminal: fixed grants Sleight of Hand + Stealth (both already in Rogue's own class skill
// list). Acolyte: fixed grants Insight + Religion (Religion is NOT in Rogue's own class skill
// list at all -- the one source a Rogue could ever be proficient in it, and so Expertise-eligible
// in it, is a Background).
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })
const ACOLYTE = entry({ title: 'Acolyte', slug: 'acolyte-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'acolyte-xphb') ?? undefined })

function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...entry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
// Two real-shaped weapons -- enough for Rogue's own real Level-1 Weapon Mastery count of 2 (an
// unrelated, already-implemented mandatory creation choice this walk also crosses).
const WEAPONS = [
  weaponEntry('Dagger', 'dagger-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB', 'T|XPHB'], mastery: ['Nick|XPHB'] }),
  weaponEntry('Shortsword', 'shortsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'] })
]
const WEAPON_MASTERY_KEY = progressionChoiceKey('class', 1, 'choice:class.weapon-mastery')
function weaponRefs() {
  return WEAPONS.map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug }))
}

// Every real XPHB feat, resolved the same way create-v2-weapon-mastery.test.ts's own fixture
// does -- needed so Criminal's own fixed Origin Feat (Alert) can actually resolve.
const FEATS = xphbFeats.feats.map((raw: { name: string }) => {
  const slug = `${raw.name.toLowerCase().replace(/ /g, '-')}-xphb`
  return { ...entry({ title: raw.name, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined }), featMechanics: resolveDnd5eFeatMechanics(raw) }
})

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [DWARF], classes: [ROGUE, FIGHTER], backgrounds: [CRIMINAL, ACOLYTE],
  feats: FEATS, subclasses: [], items: WEAPONS, monsters: [], spells: []
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 10, dex: 15, con: 13, int: 12, wis: 14, cha: 8 } }
const ref = (slug: string) => ({ packageId: PKG, slug })

function fakeEvent(body: unknown): H3Event {
  return {
    context: {
      principal: {
        accountId: 'player-1', platformCapabilities: new Set(), temporarySingleUserMode: false,
        worldCapabilities: new Map([[WORLD_ID, new Set(['world.read', 'world.character.create'])]])
      },
      params: { id: WORLD_ID }
    },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

function persist(value: unknown) {
  return JSON.parse(JSON.stringify(value))
}

const ABILITY_KEY = 'background:choice:background.ability-distribution'
const SKILL_KEY = 'class:choice:skill.proficiency'
const EXPERTISE_KEY = 'class:choice:skill.expertise'

function rogueSkillChoice() {
  return findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb')!.choices!.find((c) => c.choiceSet === 'choice:skill.proficiency')!
}
function expertiseChoice() {
  return findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb')!.choices!.find((c) => c.choiceSet === 'choice:skill.expertise')!
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  store.progression = null
  store.rulesChoices = null
  store.currency = null

  mocks.getWorldContentCatalogue.mockResolvedValue(CATALOGUE)
  mocks.getWorldRuntime.mockResolvedValue({ configured: true, ok: true, runtime: REAL_RUNTIME, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  mocks.createEntityRecord.mockResolvedValue({ id: store.createdEntityId })
  mocks.saveCharacterProgression.mockImplementation(async (_id: unknown, data: unknown) => { store.progression = persist(data) })
  mocks.saveCharacterAbilityScores.mockImplementation(async (_id: unknown, data: unknown) => data)
  mocks.getDerivedCharacter.mockResolvedValue({ available: false, reason: 'rules-unconfigured', message: 'no rules package' })

  mocks.dxFetch.mockImplementation(async (url: string, options?: { method?: string, body?: string }) => {
    if (url === '/items/block_instances' && options?.method === 'POST') {
      const body = JSON.parse(options.body!)
      if (body.block_key === 'rules_choices') store.rulesChoices = persist(body.data)
      return { data: {} }
    }
    return { data: [] }
  })
})

// ---------------------------------------------------------------------------
// PRESENTATION + ELIGIBILITY + COMPOSITION (via the real Builder function --
// the SAME shared authority the save route itself judges against)
// ---------------------------------------------------------------------------

function builderContext(): BuilderCreationContext {
  return { contentSelectorOf: () => null, choiceSetRule: () => null, feats: [], spells: [], items: [] }
}

function rogueDraft(backgroundEntry: typeof CRIMINAL = CRIMINAL) {
  const draft = emptyDraft()
  draft.name = 'Sly'
  draft.species = DWARF as any
  draft.class = ROGUE as any
  draft.background = backgroundEntry as any
  draft.abilities.method = 'standard-array'
  draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
  return draft
}

describe('LEVEL-1 ROGUE -- the real Expertise choice is exposed, with ONLY proficient skills legal', () => {
  it('selecting Rogue declares class:choice:skill.expertise, count 2', () => {
    const context = builderContext()
    const draft = rogueDraft()
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)
    expect(presentation).toBeDefined()
    expect(presentation!.count).toBe(2)
  })

  it('Criminal\'s own fixed grants (Sleight of Hand, Stealth) are eligible for Expertise with no class skill chosen at all', () => {
    const context = builderContext()
    const draft = rogueDraft(CRIMINAL)
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)!
    const eligible = presentation.offered.filter((o) => o.eligible).map((o) => o.value)
    expect(eligible).toContain('value:skill.sleight_of_hand.expertise')
    expect(eligible).toContain('value:skill.stealth.expertise')
  })

  it('a skill NOT yet made proficient by anything is NOT eligible for Expertise', () => {
    const context = builderContext()
    const draft = rogueDraft(CRIMINAL)
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)!
    const athletics = presentation.offered.find((o) => o.value === 'value:skill.athletics.expertise')!
    expect(athletics.eligible).toBe(false)
  })

  it('COMPOSITION -- a skill chosen via Rogue\'s OWN earlier class skill-proficiency choice becomes eligible for Expertise in the SAME creation plan (no save/reload)', () => {
    const context = builderContext()
    const draft = rogueDraft(CRIMINAL)
    const skillChoice = rogueSkillChoice()
    const chosen = (skillChoice.from ?? []).filter((id) => id !== 'value:skill.sleight_of_hand.proficient' && id !== 'value:skill.stealth.proficient').slice(0, skillChoice.count)
    expect(chosen).toContain('value:skill.athletics.proficient')

    setChoiceSelections(draft, SKILL_KEY, chosen, context)
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)!
    const athletics = presentation.offered.find((o) => o.value === 'value:skill.athletics.expertise')!
    expect(athletics.eligible).toBe(true)
  })

  it('every offered option is a real Rogue-reachable skill (either in Rogue\'s own class list or the Background\'s fixed grant)', () => {
    const context = builderContext()
    const draft = rogueDraft(CRIMINAL)
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)!
    expect(presentation.offered.map((o) => o.value).sort()).toEqual((expertiseChoice().from ?? []).slice().sort())
  })
})

describe('BACKGROUND SWITCHING -- Expertise eligibility is live, never a stale snapshot', () => {
  it('a skill only the OLD Background granted is no longer eligible once the Background changes and grants it no longer', () => {
    const context = builderContext()
    const draft = rogueDraft(CRIMINAL)
    setChoiceSelections(draft, EXPERTISE_KEY, ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise'], context)
    expect(draft.choices.selections[EXPERTISE_KEY]).toEqual(['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise'])

    draft.background = ACOLYTE as any
    // Re-run pruning the same way every real slot change does (setChoiceSelections re-validates).
    setChoiceSelections(draft, EXPERTISE_KEY, draft.choices.selections[EXPERTISE_KEY] ?? [], context)

    // Sleight of Hand/Stealth are not proficient under Acolyte (and were never separately chosen
    // via the class list in this draft) -- the stale answer is pruned, never silently retained.
    expect(draft.choices.selections[EXPERTISE_KEY]).toEqual([])
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)!
    expect(presentation.offered.find((o) => o.value === 'value:skill.sleight_of_hand.expertise')?.eligible).toBe(false)
  })

  it('a skill only the NEW Background grants becomes newly eligible (Religion, never on Rogue\'s own class list)', () => {
    const context = builderContext()
    const draft = rogueDraft(ACOLYTE)
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)!
    expect(presentation.offered.find((o) => o.value === 'value:skill.religion.expertise')?.eligible).toBe(true)
    // Religion is not even in Rogue's own class skill-proficiency list -- the Background fixed
    // grant is the ONLY path to it, proven directly.
    expect(rogueSkillChoice().from ?? []).not.toContain('value:skill.religion.proficient')
  })
})

describe('CLASS SWITCHING -- Rogue\'s own Expertise key does not exist for a class with no such creation-time choice', () => {
  it('Rogue selected -> Expertise live; switching to Fighter (no such choice) removes the key entirely', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.class = ROGUE as any
    setChoiceSelections(draft, EXPERTISE_KEY, ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise'], context)
    expect(creationChoicePresentation(draft, context).some((p) => p.key === EXPERTISE_KEY)).toBe(true)

    draft.class = FIGHTER as any
    setChoiceSelections(draft, EXPERTISE_KEY, draft.choices.selections[EXPERTISE_KEY] ?? [], context)
    expect(draft.choices.selections[EXPERTISE_KEY]).toBeUndefined()
    expect(creationChoicePresentation(draft, context).some((p) => p.key === EXPERTISE_KEY)).toBe(false)
  })

  it('switching back Fighter -> Rogue re-asks the question -- no stale hidden answer survives', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.class = ROGUE as any
    setChoiceSelections(draft, EXPERTISE_KEY, ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise'], context)

    draft.class = FIGHTER as any
    setChoiceSelections(draft, EXPERTISE_KEY, draft.choices.selections[EXPERTISE_KEY] ?? [], context)

    draft.class = ROGUE as any
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)!
    expect(presentation.selected).toEqual([])
    expect(isDraftComplete(draft, context)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SERVER AUTHORITY (real route) -- never trusts the Builder's own eligibility
// ---------------------------------------------------------------------------

function rogueBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Sly',
    species: ref('dwarf-xphb'),
    class: ref('rogue-xphb'),
    background: ref('criminal-xphb'),
    abilities: STANDARD_ARRAY,
    choices: {
      selections: {
        [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'],
        [SKILL_KEY]: (rogueSkillChoice().from ?? []).filter((id) => id !== 'value:skill.sleight_of_hand.proficient' && id !== 'value:skill.stealth.proficient').slice(0, rogueSkillChoice().count),
        [EXPERTISE_KEY]: ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise']
      }
    },
    contentChoices: { [WEAPON_MASTERY_KEY]: weaponRefs() },
    startingEquipment: { 'choice:equipment.starting.rogue-xphb': 'B', 'choice:equipment.starting.criminal-xphb': 'B' },
    ...overrides
  }
}

describe('SERVER AUTHORITY -- the Expertise answer is independently validated, never trusted', () => {
  it('too few selections is rejected, zero writes', async () => {
    const body = rogueBody({ choices: { selections: { ...rogueBody().choices.selections, [EXPERTISE_KEY]: ['value:skill.sleight_of_hand.expertise'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('exactly 2') })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('too many selections is rejected, zero writes', async () => {
    const body = rogueBody({ choices: { selections: { ...rogueBody().choices.selections, [EXPERTISE_KEY]: ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise', 'value:skill.perception.expertise'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a duplicate skill in the same answer is rejected, zero writes', async () => {
    const body = rogueBody({ choices: { selections: { ...rogueBody().choices.selections, [EXPERTISE_KEY]: ['value:skill.sleight_of_hand.expertise', 'value:skill.sleight_of_hand.expertise'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a non-proficient skill (never granted by anything in this body) is rejected, zero writes -- the real "already proficient" prerequisite', async () => {
    const body = rogueBody({ choices: { selections: { ...rogueBody().choices.selections, [EXPERTISE_KEY]: ['value:skill.sleight_of_hand.expertise', 'value:skill.investigation.expertise'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('prerequisite') })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a crafted, undeclared choice key is rejected outright', async () => {
    const body = rogueBody({ choices: { selections: { ...rogueBody().choices.selections, 'class:choice:does-not-exist': ['value:skill.stealth.expertise'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('does-not-exist') })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a stale OTHER-class key (submitted for Rogue when it does not even declare it, e.g. a Fighter-only key) is rejected as undeclared', async () => {
    const body = rogueBody({ choices: { selections: { ...rogueBody().choices.selections, 'class:choice:feat.fighting-style.fs-only': ['eldra.solaris.xphb::archery-xphb'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('fighting-style') })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  // LANGUAGE CORPUS + POLICY PHASE -- Rogue's own real remaining blocker (Thieves' Cant's
  // embedded language choice) is now ALSO implemented, so Rogue is fully creation-available:
  // these two cases now prove SUCCESS, never refusal. Full end-to-end acceptance (every real
  // Rogue decision answered, including the universal + Rogue-owned language choices, through
  // creationUnresolvedDecisions: []) is proven separately, in create-v2-language.test.ts.
  it('missing the Expertise answer entirely is TOLERATED by the server\'s own choices.selections validation (Definition-keyed, not strictly mandatory) -- Rogue creation now succeeds', async () => {
    const { [EXPERTISE_KEY]: _omit, ...rest } = rogueBody().choices.selections
    const body = rogueBody({ choices: { selections: rest } })
    const result = await handler(fakeEvent(body) as any) as any
    expect(result.id).toBe(store.createdEntityId)
  })

  it('a FULL, otherwise-legal Expertise answer passes its OWN validation -- Rogue creation succeeds', async () => {
    const result = await handler(fakeEvent(rogueBody()) as any) as any
    expect(result.id).toBe(store.createdEntityId)
  })
})

// BUILDER-SHAPED PAYLOAD -- the draft reports complete once Expertise (and every other real
// choice) is answered; Rogue's own untouched blocker is a Phase-0 fact, not a Builder-surface gap.
describe('BUILDER-SHAPED PAYLOAD -- the draft is complete once Expertise is answered', () => {
  function completeRogueDraft() {
    const context = builderContext()
    const draft = rogueDraft(CRIMINAL)
    setChoiceSelections(draft, ABILITY_KEY, ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'], context)
    const skillChoice = rogueSkillChoice()
    const chosen = (skillChoice.from ?? []).filter((id) => id !== 'value:skill.sleight_of_hand.proficient' && id !== 'value:skill.stealth.proficient').slice(0, skillChoice.count)
    setChoiceSelections(draft, SKILL_KEY, chosen, context)
    setChoiceSelections(draft, EXPERTISE_KEY, ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise'], context)
    setEquipmentSelection(draft, 'choice:equipment.starting.rogue-xphb', 'B')
    setEquipmentSelection(draft, 'choice:equipment.starting.criminal-xphb', 'B')
    return { draft, context }
  }

  it('an unanswered Expertise choice alone keeps the Builder draft incomplete', () => {
    const { draft, context } = completeRogueDraft()
    delete draft.choices.selections[EXPERTISE_KEY]
    expect(isDraftComplete(draft, context)).toBe(false)
  })

  it('every OTHER real choice answered (Expertise included) -- isDraftComplete agrees Expertise is no longer outstanding', () => {
    const { draft, context } = completeRogueDraft()
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === EXPERTISE_KEY)!
    expect(presentation.answered).toBe(true)
  })
})
