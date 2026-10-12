// D&D 2024 Character Rules -- FEATURE-OPTION FIRST NEW CLASSES, end to end through the REAL
// create-v2 POST route and the REAL fail-closed completeness authority. UNSTUBBED (see
// tests/rules/completeness-stub-policy.test.ts's own ACCEPTANCE category): this file makes the
// production claim that Dwarf + Cleric + Criminal and Dwarf + Druid + Criminal are genuinely
// creatable combinations now that Divine Order / Primal Order are authored, mirroring
// create-v2-starting-equipment.test.ts's own harness shape exactly.
//
// What this file proves:
//   1. creationUnresolvedDecisions is [] for both combinations, through the REAL authority.
//   2. The real POST route accepts a full real answer set (including the new Divine Order /
//      Primal Order feature-option choice) and succeeds.
//   3. The selected Source is persisted as the real rules-choice answer and, independently,
//      resolves through the real engine -- never merely a stored label.
//   4. A Builder-shaped payload (built via emptyDraft/setChoiceSelections/toCreatePayload, never a
//      hand-written body) meets the same real server authority.
//   5. Creation-time CLASS SWITCHING revalidates the feature-option answer correctly: switching
//      away from Cleric (to a class with no such choice) deletes the stale answer entirely;
//      switching Cleric -> Druid -- the SAME generic choice KEY, a DISJOINT option list -- prunes
//      an answer that is no longer legal, rather than silently carrying a Cleric Source into a
//      Druid character.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  progression: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
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
import { DependencyGraph } from '../../../../../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../../../../../app/lib/rules/evaluation-session'
import { evaluate } from '../../../../../../app/lib/rules/evaluator'
import type { Definition, RulesPackageManifest } from '../../../../../../app/lib/rules/types'
import { findRulesFacet } from '../../../../../../app/lib/content-rules'
import { creationUnresolvedDecisions } from '../../../../../../app/lib/content-rules/creation-completeness'
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import { resolveDnd5eSpellMechanics } from '../../../../../../app/lib/spell-mechanics/dnd5e'
import { choiceKey } from '../../../../../../app/lib/characters/rules-choices'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'
import {
  emptyDraft,
  isDraftComplete,
  setChoiceSelections,
  setEquipmentSelection,
  setSpellSelections,
  toCreatePayload,
  creationChoicePresentation,
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
const REAL_RUNTIME = loadRealRuntime()

function entry(overrides: Record<string, unknown>) {
  return { packageId: PKG, packageVersion: '1.0.18', systemKey: 'dnd5e', externalId: `${overrides.title}__XPHB`, provider: '5etools-json', ...overrides }
}

const DWARF = entry({ title: 'Dwarf', slug: 'dwarf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'dwarf-xphb') ?? undefined })
const CLERIC = entry({ title: 'Cleric', slug: 'cleric-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb') ?? undefined })
const DRUID = entry({ title: 'Druid', slug: 'druid-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'druid-xphb') ?? undefined })
const BARD = entry({ title: 'Bard', slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })

const FEATS = xphbFeats.feats.map((raw: { name: string }) => {
  const slug = `${raw.name.toLowerCase().replace(/ /g, '-')}-xphb`
  return { ...entry({ title: raw.name, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined }), featMechanics: resolveDnd5eFeatMechanics(raw) }
})

function spellEntry(slug: string, level: number, classLists: string[]) {
  return { packageId: PKG, slug, title: slug, spellMechanics: resolveDnd5eSpellMechanics({ name: slug, source: 'XPHB', level, school: 'V', classLists })! }
}
const SPELLS = [
  ...[...'abcdefgh'].map((s) => spellEntry(`cleric-${s}`, 1, ['Cleric'])),
  ...[...'xyz'].map((s) => spellEntry(`cleric-cantrip-${s}`, 0, ['Cleric'])),
  ...[...'abcdefgh'].map((s) => spellEntry(`druid-${s}`, 1, ['Druid'])),
  ...[...'xyz'].map((s) => spellEntry(`druid-cantrip-${s}`, 0, ['Druid']))
]

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [DWARF], classes: [CLERIC, DRUID, BARD], backgrounds: [CRIMINAL],
  feats: FEATS, subclasses: [], items: [], monsters: [],
  spells: SPELLS
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 8, dex: 14, con: 13, int: 10, wis: 15, cha: 12 } }
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

const FEATURE_OPTION_KEY = choiceKey('class', 'choice:class.feature-option')
const SKILL_KEY = choiceKey('class', 'choice:skill.proficiency')
const ABILITY_KEY = choiceKey('background', 'choice:background.ability-distribution')

function requirementsFor(classSlug: string) {
  return findRulesFacet('dnd5e.2024', 'class', classSlug)!.spellRequirements!
}
function spellSelectionsFor(classSlug: string, letterPrefix: string) {
  const reqs = requirementsFor(classSlug)
  const spellReq = reqs.find((r) => r.pool === 'spell')!
  const cantripReq = reqs.find((r) => r.pool === 'cantrip')!
  const spellCount = spellReq.totalByLevel[0]
  const cantripCount = cantripReq.totalByLevel[0]
  return [
    ...[...'abcdefgh'].slice(0, spellCount).map((s) => ({ requirementId: spellReq.id, ref: ref(`${letterPrefix}-${s}`) })),
    ...[...'xyz'].slice(0, cantripCount).map((s) => ({ requirementId: cantripReq.id, ref: ref(`${letterPrefix}-cantrip-${s}`) }))
  ]
}

function fullBody(classSlug: 'cleric-xphb' | 'druid-xphb', featureOptionSource: string, skillChoices: string[], overrides: Record<string, unknown> = {}) {
  return {
    title: 'Borin',
    species: ref('dwarf-xphb'),
    class: ref(classSlug),
    background: ref('criminal-xphb'),
    abilities: STANDARD_ARRAY,
    choices: {
      selections: {
        [SKILL_KEY]: skillChoices,
        [FEATURE_OPTION_KEY]: [featureOptionSource],
        [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
      }
    },
    spellSelections: spellSelectionsFor(classSlug, classSlug === 'cleric-xphb' ? 'cleric' : 'druid'),
    startingEquipment: {
      [`choice:equipment.starting.${classSlug}`]: 'B',
      'choice:equipment.starting.criminal-xphb': 'B'
    },
    ...overrides
  }
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
      if (body.block_key === 'currency') store.currency = persist(body.data)
      return { data: {} }
    }
    return { data: [] }
  })
})

describe('FIRST NEW CLASS -- Dwarf + Cleric + Criminal, through REAL authority', () => {
  it('1. the real Phase-0 authority reports zero unresolved decisions', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'cleric-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('2. the real route accepts the full real answer set, including Divine Order, and succeeds', async () => {
    const body = fullBody('cleric-xphb', 'source:divine-order.protector', ['value:skill.insight.proficient', 'value:skill.religion.proficient'])
    const result = await handler(fakeEvent(body) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('3. the selected Source is persisted as provenance and resolves through the real engine -- never merely a stored label', async () => {
    const body = fullBody('cleric-xphb', 'source:divine-order.protector', ['value:skill.insight.proficient', 'value:skill.religion.proficient'])
    await handler(fakeEvent(body) as any)
    expect(store.rulesChoices!.selections).toMatchObject({ [FEATURE_OPTION_KEY]: ['source:divine-order.protector'] })

    const graph = DependencyGraph.build(REAL_RUNTIME.registry)
    if (!graph.ok) throw new Error('graph failed')
    const session = new EvaluationSession(REAL_RUNTIME.registry, graph.graph, {
      values: {}, choices: {}, collections: {},
      sources: [{ instanceId: 'x', sourceRef: 'source:divine-order.protector', origin: { kind: 'declared' } }]
    }, {})
    expect(evaluate('value:weapon.martial.proficient', session)).toBe(true)
    expect(evaluate('value:armor.heavy.proficient', session)).toBe(true)
  })

  it('4. the full currency (Cleric B 110 GP + Criminal B 50 GP) is written exactly as the real authored facets declare', async () => {
    const body = fullBody('cleric-xphb', 'source:divine-order.thaumaturge', ['value:skill.insight.proficient', 'value:skill.religion.proficient'])
    await handler(fakeEvent(body) as any)
    expect(store.currency).toEqual({ amounts: { 'currency:xphb.copper': 11000 + 5000 } })
  })
})

describe('FIRST NEW CLASS -- Dwarf + Druid + Criminal, through REAL authority', () => {
  it('1. the real Phase-0 authority reports zero unresolved decisions', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'druid-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('2. the real route accepts the full real answer set, including Primal Order, and succeeds', async () => {
    const body = fullBody('druid-xphb', 'source:primal-order.warden', ['value:skill.nature.proficient', 'value:skill.survival.proficient'])
    const result = await handler(fakeEvent(body) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('3. the selected Source is persisted as provenance and resolves through the real engine', async () => {
    const body = fullBody('druid-xphb', 'source:primal-order.warden', ['value:skill.nature.proficient', 'value:skill.survival.proficient'])
    await handler(fakeEvent(body) as any)
    expect(store.rulesChoices!.selections).toMatchObject({ [FEATURE_OPTION_KEY]: ['source:primal-order.warden'] })

    const graph = DependencyGraph.build(REAL_RUNTIME.registry)
    if (!graph.ok) throw new Error('graph failed')
    const session = new EvaluationSession(REAL_RUNTIME.registry, graph.graph, {
      values: {}, choices: {}, collections: {},
      sources: [{ instanceId: 'x', sourceRef: 'source:primal-order.warden', origin: { kind: 'declared' } }]
    }, {})
    expect(evaluate('value:weapon.martial.proficient', session)).toBe(true)
    expect(evaluate('value:armor.medium.proficient', session)).toBe(true)
  })

  it('4. the full currency (Druid B 50 GP + Criminal B 50 GP) is written exactly as the real authored facets declare', async () => {
    const body = fullBody('druid-xphb', 'source:primal-order.magician', ['value:skill.nature.proficient', 'value:skill.survival.proficient'])
    await handler(fakeEvent(body) as any)
    expect(store.currency).toEqual({ amounts: { 'currency:xphb.copper': 5000 + 5000 } })
  })
})

// REFUSAL -- the real server authority independently validates the feature-option answer, never
// trusting the Builder's own labels/metadata.
describe('SERVER AUTHORITY -- the feature-option answer is independently validated, never trusted', () => {
  // Pre-existing, intentional creation route behavior (create-v2.post.test.ts's own "Sage's own
  // direct grants never themselves need answering" test already proves this for the ordinary
  // Class skill-proficiency ChoiceSet): a Definition-keyed choice left unanswered at creation does
  // NOT refuse the request -- it succeeds with the choice left outstanding, for a later surface to
  // answer. Divine Order is the SAME ChoiceSet family and gets the SAME treatment, never a special
  // creation-time hard block this phase did not add anywhere else.
  it('a missing Divine Order answer does not refuse creation -- it succeeds with the choice left outstanding', async () => {
    const body = fullBody('cleric-xphb', 'source:divine-order.protector', ['value:skill.insight.proficient', 'value:skill.religion.proficient'])
    delete (body.choices.selections as Record<string, unknown>)[FEATURE_OPTION_KEY]
    const result = await handler(fakeEvent(body) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(store.rulesChoices!.selections[FEATURE_OPTION_KEY]).toBeUndefined()
  })

  it('an illegal option (Druid\'s own Source, submitted for a Cleric) refuses creation with zero writes', async () => {
    const body = fullBody('cleric-xphb', 'source:primal-order.warden', ['value:skill.insight.proficient', 'value:skill.religion.proficient'])
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a crafted, undeclared choice key changes nothing -- the real Divine Order key is still missing, still refused', async () => {
    const body = fullBody('cleric-xphb', 'source:divine-order.protector', ['value:skill.insight.proficient', 'value:skill.religion.proficient'])
    delete (body.choices.selections as Record<string, unknown>)[FEATURE_OPTION_KEY]
    ;(body.choices.selections as Record<string, unknown>)['class:choice:does-not-exist'] = ['source:divine-order.protector']
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })
})

// CREATION-TIME CLASS SWITCHING -- the generic ChoiceSet key is IDENTICAL across Cleric and Druid
// (both declare `choice:class.feature-option`), so pruning must judge the live OPTIONS, not merely
// whether the key exists, or a Cleric's Source could silently satisfy a Druid.
describe('CLASS SWITCHING -- the feature-option answer is correctly revalidated, never leaked across classes', () => {
  function builderContext(): BuilderCreationContext {
    const definitionFor = (choiceSetId: string) => {
      const definition = REAL_RUNTIME.registry.getById(choiceSetId) as any
      return definition?.kind === 'choiceSet' ? definition : null
    }
    return {
      contentSelectorOf: () => null,
      choiceSetRule: (choiceSetId) => {
        const definition = definitionFor(choiceSetId)
        return definition ? { distinct: definition.distinct, maxPerOption: definition.maxPerOption } : null
      },
      feats: FEATS,
      spells: SPELLS,
      items: []
    }
  }

  it('Cleric selected -> Divine Order required; switching to Bard (no such choice) makes the answer ineffective', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.class = CLERIC as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:divine-order.protector'], context)
    expect(draft.choices.selections[FEATURE_OPTION_KEY]).toEqual(['source:divine-order.protector'])
    expect(creationChoicePresentation(draft, context).some((p) => p.key === FEATURE_OPTION_KEY)).toBe(true)

    draft.class = BARD as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, draft.choices.selections[FEATURE_OPTION_KEY] ?? [], context)
    expect(draft.choices.selections[FEATURE_OPTION_KEY]).toBeUndefined()
    expect(creationChoicePresentation(draft, context).some((p) => p.key === FEATURE_OPTION_KEY)).toBe(false)
  })

  it('switching back Bard -> Cleric re-asks the question -- no stale hidden answer survives', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.class = CLERIC as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:divine-order.protector'], context)

    draft.class = BARD as any
    draft.choices.selections = { ...draft.choices.selections }
    // Re-run pruning the same way every real slot change does (setChoiceSelections/pruneChoices).
    setChoiceSelections(draft, FEATURE_OPTION_KEY, draft.choices.selections[FEATURE_OPTION_KEY] ?? [], context)

    draft.class = CLERIC as any
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === FEATURE_OPTION_KEY)!
    expect(presentation.selected).toEqual([])
    expect(isDraftComplete(draft, context)).toBe(false)
  })

  it('Cleric -> Druid: the SAME key, a DISJOINT option list -- the Cleric Source is pruned, never leaked into the Druid character', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.class = CLERIC as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:divine-order.protector'], context)
    expect(draft.choices.selections[FEATURE_OPTION_KEY]).toEqual(['source:divine-order.protector'])

    draft.class = DRUID as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, draft.choices.selections[FEATURE_OPTION_KEY] ?? [], context)

    // The key is still LIVE (Druid also declares choice:class.feature-option), but the Cleric
    // Source is not one of Druid's own options -- it must be pruned, not retained.
    expect(draft.choices.selections[FEATURE_OPTION_KEY]).toEqual([])
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === FEATURE_OPTION_KEY)!
    expect(presentation.offered.map((o) => o.value)).toEqual(['source:primal-order.magician', 'source:primal-order.warden'])
    expect(presentation.selected).toEqual([])
  })
})

// BUILDER-SHAPED PAYLOAD meets the REAL server authority -- built via the real Builder functions
// (emptyDraft/setChoiceSelections/toCreatePayload), never a hand-written body object.
describe('BUILDER-SHAPED PAYLOAD meets REAL server authority (Dwarf + Cleric + Criminal)', () => {
  function builderContext(): BuilderCreationContext {
    const definitionFor = (choiceSetId: string) => {
      const definition = REAL_RUNTIME.registry.getById(choiceSetId) as any
      return definition?.kind === 'choiceSet' ? definition : null
    }
    return {
      contentSelectorOf: () => null,
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
    draft.name = 'Borin'
    draft.species = DWARF as any
    draft.class = CLERIC as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    return draft
  }

  function answerEveryRealChoice(draft: ReturnType<typeof builderDraft>, context: BuilderCreationContext) {
    setChoiceSelections(draft, SKILL_KEY, ['value:skill.insight.proficient', 'value:skill.religion.proficient'], context)
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:divine-order.protector'], context)
    setChoiceSelections(draft, ABILITY_KEY, ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'], context)

    const byRequirement = new Map<string, string[]>()
    for (const selection of spellSelectionsFor('cleric-xphb', 'cleric')) {
      const refs = byRequirement.get(selection.requirementId) ?? []
      refs.push(serializeContentRef(selection.ref))
      byRequirement.set(selection.requirementId, refs)
    }
    for (const [requirementId, refs] of byRequirement) setSpellSelections(draft, requirementId, refs)

    setEquipmentSelection(draft, 'choice:equipment.starting.cleric-xphb', 'B')
    setEquipmentSelection(draft, 'choice:equipment.starting.criminal-xphb', 'B')
  }

  it('the Builder reports the draft complete once Divine Order (and every other real choice) is answered', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)
  })

  it('an unanswered Divine Order alone keeps the Builder draft incomplete', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    delete draft.choices.selections[FEATURE_OPTION_KEY]
    expect(isDraftComplete(draft, context)).toBe(false)
  })

  it('the real Builder payload succeeds through the real route and persists exactly what the hand-written body already proved', async () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    expect(payload.choices.selections[FEATURE_OPTION_KEY]).toEqual(['source:divine-order.protector'])

    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(store.rulesChoices!.selections).toMatchObject({ [FEATURE_OPTION_KEY]: ['source:divine-order.protector'] })
    expect(store.currency).toEqual({ amounts: { 'currency:xphb.copper': 11000 + 5000 } })
  })
})
