// ELDRITCH INVOCATIONS PHASE -- FIRST REAL WARLOCK, end to end through the REAL create-v2 POST
// route and the REAL fail-closed completeness authority. UNSTUBBED: this file makes the
// production claim that Dwarf + Warlock + Criminal is a genuinely creatable combination through
// the real production authority, so it must never stub `creation-completeness`. Only the Directus
// I/O boundary is mocked, mirroring the exact harness create-v2-starting-equipment.test.ts (the
// Bard acceptance walk) already establishes.
//
// What this file proves, each its own test:
//   1. creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'warlock-xphb', background:
//      'criminal-xphb' }) is [] through the REAL authority -- Warlock's own real remaining
//      blocker (Eldritch Invocations) is now implemented.
//   2. Selecting Warlock declares the real Level-1 `class:choice:class.accumulating-option`
//      choice (count 1), legal ONLY for the 5 real XPHB options with no prerequisite at all.
//   3. The real POST route accepts a full, real answer set (abilities, skill proficiency, the
//      Level-1 Invocation pick, Criminal's ability distribution + fixed Origin feat, Warlock's
//      real Level-1 spell acquisition, both starting-equipment bundles) and succeeds.
//   4. SERVER AUTHORITY -- the route independently re-validates the submitted Invocation answer:
//      too few/too many/duplicate/unknown identity/an option outside the Level-1 family (one that
//      carries a real prerequisite not yet met)/a crafted key for a class that never declared it.
//      Zero writes on every rejection.
//   5. The selected Invocation is persisted as canonical selection identity only (through
//      rules_choices, the same mechanism every other creation choice already reuses) -- never a
//      bespoke `warlockInvocations[]`-shaped field.
//   6. BUILDER-SHAPED PAYLOAD meets the same server authority (the real Builder functions, never
//      a hand-written body), proving generic ChoiceSet presentation needed no new component.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  catalogueSelection: null as null | Record<string, unknown>,
  progression: null as null | Record<string, unknown>,
  spellcasting: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
  inventory: null as null | Record<string, unknown>,
  currency: null as null | Record<string, unknown>,
  createdEntityId: 9202
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
import { creationUnresolvedDecisions } from '../../../../../../app/lib/content-rules/creation-completeness'
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import { choiceKey } from '../../../../../../app/lib/characters/rules-choices'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'
import {
  emptyDraft,
  isDraftComplete,
  setChoiceSelections,
  setEquipmentSelection,
  setSpellSelections,
  creationChoicePresentation,
  toCreatePayload,
  type BuilderCreationContext
} from '../../../../../../app/components/characters/builder/characterBuilderSelection'
import { serializeContentRef } from '../../../../../../app/lib/characters/progression-plan'

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

function entry(overrides: Record<string, unknown>) {
  return { packageId: PKG, packageVersion: '1.0.21', systemKey: 'dnd5e', externalId: `${overrides.title}__XPHB`, provider: '5etools-json', ...overrides }
}

const DWARF = entry({ title: 'Dwarf', slug: 'dwarf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'dwarf-xphb') ?? undefined })
const WARLOCK = entry({ title: 'Warlock', slug: 'warlock-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb') ?? undefined })
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })

const FEATS = xphbFeats.feats.map((raw: { name: string }) => {
  const slug = `${raw.name.toLowerCase().replace(/ /g, '-')}-xphb`
  return { ...entry({ title: raw.name, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined }), featMechanics: resolveDnd5eFeatMechanics(raw) }
})

function spellEntry(slug: string, level: number, classLists: string[]) {
  return { packageId: PKG, slug, title: slug, spellMechanics: { level, concentration: false, ritual: false, resolution: null, classLists } }
}
const SPELLS = [
  ...[...'ab'].map((s) => spellEntry(`warlock-${s}`, 1, ['Warlock'])),
  ...[...'xy'].map((s) => spellEntry(`warlock-cantrip-${s}`, 0, ['Warlock']))
]

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [DWARF], classes: [WARLOCK], backgrounds: [CRIMINAL],
  feats: FEATS, subclasses: [], items: [], monsters: [],
  spells: SPELLS
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 } }
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

const SKILL_KEY = choiceKey('class', 'choice:skill.proficiency')
const INVOCATION_KEY = choiceKey('class', 'choice:class.accumulating-option')
const ABILITY_KEY = choiceKey('background', 'choice:background.ability-distribution')

const warlockRequirements = () => findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!

function warlockSpellSelections() {
  const spellReq = warlockRequirements().find((r) => r.pool === 'spell')!
  const cantripReq = warlockRequirements().find((r) => r.pool === 'cantrip')!
  const spellCount = spellReq.totalByLevel[0]
  const cantripCount = cantripReq.totalByLevel[0]
  return [
    ...[...'ab'].slice(0, spellCount).map((s) => ({ requirementId: spellReq.id, ref: ref(`warlock-${s}`) })),
    ...[...'xy'].slice(0, cantripCount).map((s) => ({ requirementId: cantripReq.id, ref: ref(`warlock-cantrip-${s}`) }))
  ]
}

// Every real, currently-required answer for Dwarf + Warlock + Criminal. `invocation` defaults to
// 'value:invocation.armor_of_shadows.known' (one of the 5 real options with no prerequisite at
// all, the only ones legal at Level 1) -- overridable per test.
function fullBody(overrides: Record<string, unknown> = {}, equipmentBundle: 'A' | 'B' = 'B', invocation = 'value:invocation.armor_of_shadows.known') {
  return {
    title: 'Brenna',
    species: ref('dwarf-xphb'),
    class: ref('warlock-xphb'),
    background: ref('criminal-xphb'),
    abilities: STANDARD_ARRAY,
    choices: {
      selections: {
        [SKILL_KEY]: ['value:skill.arcana.proficient', 'value:skill.deception.proficient'],
        [INVOCATION_KEY]: [invocation],
        [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
      }
    },
    spellSelections: warlockSpellSelections(),
    startingEquipment: {
      'choice:equipment.starting.warlock-xphb': equipmentBundle,
      'choice:equipment.starting.criminal-xphb': equipmentBundle
    },
    ...overrides
  }
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  store.catalogueSelection = null
  store.progression = null
  store.spellcasting = null
  store.rulesChoices = null
  store.inventory = null
  store.currency = null

  mocks.getWorldContentCatalogue.mockResolvedValue(CATALOGUE)
  const runtime = loadRealRuntime()
  mocks.getWorldRuntime.mockResolvedValue({ configured: true, ok: true, runtime, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  mocks.createEntityRecord.mockResolvedValue({ id: store.createdEntityId })
  mocks.saveCharacterProgression.mockImplementation(async (_id: unknown, data: unknown) => { store.progression = persist(data) })
  mocks.saveCharacterAbilityScores.mockImplementation(async (_id: unknown, data: unknown) => data)
  mocks.getDerivedCharacter.mockResolvedValue({ available: false, reason: 'rules-unconfigured', message: 'no rules package' })

  mocks.dxFetch.mockImplementation(async (url: string, options?: { method?: string, body?: string }) => {
    if (url === '/items/block_instances' && options?.method === 'POST') {
      const body = JSON.parse(options.body!)
      if (body.block_key === 'catalogue_selection') store.catalogueSelection = persist(body.data)
      if (body.block_key === 'spellcasting') store.spellcasting = persist(body.data)
      if (body.block_key === 'rules_choices') store.rulesChoices = persist(body.data)
      if (body.block_key === 'inventory') store.inventory = persist(body.data)
      if (body.block_key === 'currency') store.currency = persist(body.data)
      return { data: {} }
    }
    return { data: [] }
  })
})

describe('LEVEL-1 WARLOCK -- the real Eldritch Invocation choice is exposed, legal only for the 5 no-prerequisite options', () => {
  it('selecting Warlock declares class:choice:class.accumulating-option, count 1, from exactly the 5 real no-prerequisite XPHB options', () => {
    const context: BuilderCreationContext = { contentSelectorOf: () => null, choiceSetRule: () => null, feats: [], spells: [], items: [] }
    const draft = emptyDraft()
    draft.species = DWARF as any
    draft.class = WARLOCK as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === INVOCATION_KEY)
    expect(presentation).toBeDefined()
    expect(presentation!.count).toBe(1)
    const eligible = presentation!.offered.filter((o) => o.eligible).map((o) => o.value)
    expect(eligible.sort()).toEqual([
      'value:invocation.armor_of_shadows.known',
      'value:invocation.eldritch_mind.known',
      'value:invocation.pact_of_the_blade.known',
      'value:invocation.pact_of_the_chain.known',
      'value:invocation.pact_of_the_tome.known'
    ].sort())
  })
})

describe('FIRST REAL WARLOCK -- Dwarf + Warlock + Criminal, through REAL authority', () => {
  it('1. the real Phase-0 authority reports zero unresolved decisions for this exact combination', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'warlock-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('2. the real route accepts the full real answer set, including the Level-1 Invocation pick, and succeeds', async () => {
    const result = await handler(fakeEvent(fullBody()) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('3. the selected Invocation is persisted as canonical selection identity ONLY, through rules_choices', async () => {
    await handler(fakeEvent(fullBody(undefined, 'B', 'value:invocation.pact_of_the_blade.known')) as any)
    expect(store.rulesChoices!.selections).toMatchObject({
      [INVOCATION_KEY]: ['value:invocation.pact_of_the_blade.known']
    })
  })

  it('4. FRESH RELOAD -- a fresh read of the persisted rules_choices still names exactly the selected Invocation', async () => {
    await handler(fakeEvent(fullBody(undefined, 'B', 'value:invocation.eldritch_mind.known')) as any)
    expect(store.rulesChoices!.selections[INVOCATION_KEY]).toEqual(['value:invocation.eldritch_mind.known'])
  })
})

describe('SERVER AUTHORITY -- the real route independently re-validates the Invocation answer, zero writes on rejection', () => {
  function expectNoWrites() {
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  }

  it('too few (zero selections) is refused', async () => {
    await expect(handler(fakeEvent(fullBody({ choices: { selections: { [SKILL_KEY]: ['value:skill.arcana.proficient', 'value:skill.deception.proficient'], [INVOCATION_KEY]: [], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })) as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('too many (two selections, count is 1) is refused', async () => {
    await expect(handler(fakeEvent(fullBody({ choices: { selections: { [SKILL_KEY]: ['value:skill.arcana.proficient', 'value:skill.deception.proficient'], [INVOCATION_KEY]: ['value:invocation.armor_of_shadows.known', 'value:invocation.eldritch_mind.known'], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })) as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('a duplicate selection is refused', async () => {
    await expect(handler(fakeEvent(fullBody({ choices: { selections: { [SKILL_KEY]: ['value:skill.arcana.proficient', 'value:skill.deception.proficient'], [INVOCATION_KEY]: ['value:invocation.armor_of_shadows.known', 'value:invocation.armor_of_shadows.known'], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })) as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('an unknown Invocation identity is refused', async () => {
    await expect(handler(fakeEvent(fullBody(undefined, 'B', 'value:invocation.does_not_exist.known')) as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('an option outside the Level-1 family (one that carries a real, unmet prerequisite) is refused', async () => {
    // "Devil's Sight" is a real XPHB Invocation, but it requires Warlock Level 2 -- not legal at
    // Level-1 creation. The server must reject it on its own, never trusting the Builder alone.
    await expect(handler(fakeEvent(fullBody(undefined, 'B', 'value:invocation.devils_sight.known')) as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('a crafted key for a class that never declared this choice (Wizard) is refused', async () => {
    const WIZARD = entry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined })
    mocks.getWorldContentCatalogue.mockResolvedValue({ ...CATALOGUE, classes: [WARLOCK, WIZARD] })
    const body = fullBody({ class: ref('wizard-xphb') }, 'B')
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })
})

// BUILDER-SHAPED PAYLOAD meets REAL server authority -- the real Builder functions, never a
// hand-written body, proving generic ChoiceSet presentation needed no new component
// (no EldritchInvocationPicker.vue).
describe('P8B-STYLE -- BUILDER-SHAPED PAYLOAD meets REAL server authority (Dwarf + Warlock + Criminal)', () => {
  function builderContext(): BuilderCreationContext {
    const runtime = loadRealRuntime()
    const definitionFor = (choiceSetId: string) => {
      const definition = runtime.registry.getById(choiceSetId) as any
      return definition?.kind === 'choiceSet' ? definition : null
    }
    return {
      contentSelectorOf: (choiceSetId) => {
        const definition = definitionFor(choiceSetId)
        return definition?.from?.kind === 'fromContentCatalogue' ? { category: definition.from.category, filter: definition.from.filter } : null
      },
      choiceSetRule: (choiceSetId) => {
        const definition = definitionFor(choiceSetId)
        return definition ? { distinct: definition.distinct, maxPerOption: definition.maxPerOption } : null
      },
      feats: FEATS,
      spells: SPELLS,
      items: []
    }
  }

  function builderDraft() {
    const draft = emptyDraft()
    draft.name = 'Brenna'
    draft.species = DWARF as any
    draft.class = WARLOCK as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    return draft
  }

  function answerEveryRealChoice(draft: ReturnType<typeof builderDraft>, context: BuilderCreationContext, equipmentBundle: 'A' | 'B') {
    setChoiceSelections(draft, SKILL_KEY, ['value:skill.arcana.proficient', 'value:skill.deception.proficient'], context)
    setChoiceSelections(draft, INVOCATION_KEY, ['value:invocation.pact_of_the_tome.known'], context)
    setChoiceSelections(draft, ABILITY_KEY, ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'], context)

    const byRequirement = new Map<string, string[]>()
    for (const selection of warlockSpellSelections()) {
      const refs = byRequirement.get(selection.requirementId) ?? []
      refs.push(serializeContentRef(selection.ref))
      byRequirement.set(selection.requirementId, refs)
    }
    for (const [requirementId, refs] of byRequirement) setSpellSelections(draft, requirementId, refs)

    setEquipmentSelection(draft, 'choice:equipment.starting.warlock-xphb', equipmentBundle)
    setEquipmentSelection(draft, 'choice:equipment.starting.criminal-xphb', equipmentBundle)
  }

  it('the Builder itself reports the draft complete once every real choice (including the Invocation pick) is answered', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context, 'B')
    expect(isDraftComplete(draft, context)).toBe(true)
  })

  it('an unanswered Invocation choice alone keeps the Builder draft incomplete', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context, 'B')
    delete draft.choices.selections[INVOCATION_KEY]
    expect(isDraftComplete(draft, context)).toBe(false)
  })

  it('the real Builder payload succeeds through the real route and persists the selected Invocation', async () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context, 'B')
    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(store.rulesChoices!.selections[INVOCATION_KEY]).toEqual(['value:invocation.pact_of_the_tome.known'])
  })
})
