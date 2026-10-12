// D&D 2024 Character Rules P8 -- FIRST REAL CHARACTER, end to end through the REAL create-v2 POST
// route and the REAL fail-closed completeness authority. UNSTUBBED (see
// tests/rules/completeness-stub-policy.test.ts's own ACCEPTANCE category): this file makes the
// production claim that Dwarf + Bard + Criminal is a genuinely creatable combination through the
// real production authority, so it must never stub `creation-completeness`. Only the Directus I/O
// boundary (entity-factory.ts's own dxFetch, the various block save helpers) is mocked, as a small
// in-memory store capturing exactly what the handler writes -- the same harness shape
// create-v2-fail-closed.test.ts already establishes for the identical reason.
//
// What this file proves, each its own test:
//   1. creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'bard-xphb', background:
//      'criminal-xphb' }) is [] through the REAL authority (the Phase-0 gate the Builder's own
//      disabled-option logic and this route both read).
//   2. The real POST route accepts a full, real answer set (abilities, Bard's skill + instrument
//      proficiency choices, Criminal's ability distribution, the real fixed Origin feat routing,
//      Bard's real Level-1 spell acquisition, and BOTH starting-equipment bundles) and succeeds.
//   3. The equipment/currency actually written are exactly what the real authored facets declare
//      -- never a stub, never the client's own submitted summary.
//   4. A pure-currency alternative (bundle B for both class and background) persists correctly
//      with zero physical items and the package's own opaque denomination id, never a hardcoded
//      "GP"/"gold" anywhere this test can see.
//   5. "Fresh reload" -- the exact bytes `saveCharacterInventory`/`saveCharacterCurrency` were
//      called with round-trip cleanly through `normalizeStoredInventory`/`normalizeStoredCurrency`,
//      the SAME normalization server/utils/character-assembly.ts applies on every real read -- the
//      lightest faithful proxy for "a fresh read sees this" without re-mocking the whole assembly
//      pipeline's own Directus boundary a second time in this file.

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
  createdEntityId: 9101
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
import { normalizeStoredInventory } from '../../../../../../app/lib/characters/inventory'
import { normalizeStoredCurrency } from '../../../../../../app/lib/characters/currency'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'
import {
  emptyDraft,
  isDraftComplete,
  setChoiceSelections,
  setEquipmentSelection,
  setSpellSelections,
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
  return { packageId: PKG, packageVersion: '1.0.18', systemKey: 'dnd5e', externalId: `${overrides.title}__XPHB`, provider: '5etools-json', ...overrides }
}

const DWARF = entry({ title: 'Dwarf', slug: 'dwarf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'dwarf-xphb') ?? undefined })
const BARD = entry({ title: 'Bard', slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })

const FEATS = xphbFeats.feats.map((raw: { name: string }) => {
  const slug = `${raw.name.toLowerCase().replace(/ /g, '-')}-xphb`
  return { ...entry({ title: raw.name, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined }), featMechanics: resolveDnd5eFeatMechanics(raw) }
})

function spellEntry(slug: string, level: number, classLists: string[]) {
  return { packageId: PKG, slug, title: slug, spellMechanics: { level, concentration: false, ritual: false, resolution: null, classLists } }
}
const SPELLS = [
  ...[...'abcdefgh'].map((s) => spellEntry(`bard-${s}`, 1, ['Bard'])),
  ...[...'xy'].map((s) => spellEntry(`bard-cantrip-${s}`, 0, ['Bard']))
]

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [DWARF], classes: [BARD], backgrounds: [CRIMINAL],
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
const INSTRUMENT_KEY = choiceKey('class', 'choice:proficiency.instrument.class')
const ABILITY_KEY = choiceKey('background', 'choice:background.ability-distribution')

const bardRequirements = () => findRulesFacet('dnd5e.2024', 'class', 'bard-xphb')!.spellRequirements!

function bardSpellSelections() {
  const spellReq = bardRequirements().find((r) => r.pool === 'spell')!
  const cantripReq = bardRequirements().find((r) => r.pool === 'cantrip')!
  const spellCount = spellReq.totalByLevel[0]
  const cantripCount = cantripReq.totalByLevel[0]
  return [
    ...[...'abcdefgh'].slice(0, spellCount).map((s) => ({ requirementId: spellReq.id, ref: ref(`bard-${s}`) })),
    ...[...'xy'].slice(0, cantripCount).map((s) => ({ requirementId: cantripReq.id, ref: ref(`bard-cantrip-${s}`) }))
  ]
}

// Every real, currently-required answer for Dwarf + Bard + Criminal -- Dwarf itself owns no
// decision (0 blocked, confirmed by the real availability authority), so only Bard's and
// Criminal's own real choices need answering. `equipmentBundle` defaults to 'B' for both (the
// pure-currency alternative) -- overridable per test.
function fullBody(overrides: Record<string, unknown> = {}, equipmentBundle: 'A' | 'B' = 'B') {
  return {
    title: 'Borin',
    species: ref('dwarf-xphb'),
    class: ref('bard-xphb'),
    background: ref('criminal-xphb'),
    abilities: STANDARD_ARRAY,
    choices: {
      selections: {
        [SKILL_KEY]: ['value:skill.deception.proficient', 'value:skill.persuasion.proficient', 'value:skill.performance.proficient'],
        [INSTRUMENT_KEY]: ['value:tool.lute.proficient', 'value:tool.lyre.proficient', 'value:tool.drum.proficient'],
        [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
      }
    },
    spellSelections: bardSpellSelections(),
    startingEquipment: {
      'choice:equipment.starting.bard-xphb': equipmentBundle,
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
    // Existing-row lookups (every block's own find-before-write) -- no existing row at creation.
    return { data: [] }
  })
})

describe('FIRST REAL CHARACTER -- Dwarf + Bard + Criminal, through REAL authority', () => {
  it('1. the real Phase-0 authority reports zero unresolved decisions for this exact combination', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'bard-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('2. the real route accepts the full real answer set and succeeds', async () => {
    const result = await handler(fakeEvent(fullBody()) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('3. the written currency is exactly Bard B (90 GP) + Criminal B (50 GP), in the package\'s own opaque copper denomination -- no item written, no "GP"/"gold" anywhere', async () => {
    await handler(fakeEvent(fullBody(undefined, 'B')) as any)
    expect(store.inventory).toBeNull()
    expect(store.currency).toEqual({ amounts: { 'currency:xphb.copper': 9000 + 5000 } })
    expect(JSON.stringify(store.currency)).not.toMatch(/\bgp\b|\bgold\b/i)
  })

  it('4. the written equipment (bundle A for both) is exactly the real authored grants, resolved against the catalogue -- never the client\'s own submission', async () => {
    const itemCatalogue = {
      ...CATALOGUE,
      items: [
        'leather-armor-xphb', 'dagger-xphb', 'entertainers-pack-xphb',
        'thieves-tools-xphb', 'crowbar-xphb', 'pouch-xphb', 'travelers-clothes-xphb'
      ].map((slug) => ({ packageId: PKG, slug }))
    }
    mocks.getWorldContentCatalogue.mockResolvedValue(itemCatalogue)

    await handler(fakeEvent(fullBody(undefined, 'A')) as any)

    const inventory = normalizeStoredInventory(store.inventory)!
    const named = (slug: string) => inventory.items.find((item) => item.ref?.slug === slug)
    expect(named('leather-armor-xphb')).toMatchObject({ quantity: 1 })
    // Bard's 2 daggers + Criminal's 2 daggers merge into ONE row of 4, never two separate rows.
    expect(named('dagger-xphb')).toMatchObject({ quantity: 4 })
    expect(named('entertainers-pack-xphb')).toMatchObject({ quantity: 1 })
    expect(named('thieves-tools-xphb')).toMatchObject({ quantity: 1 })
    expect(named('crowbar-xphb')).toMatchObject({ quantity: 1 })
    expect(named('pouch-xphb')).toMatchObject({ quantity: 2 })
    expect(named('travelers-clothes-xphb')).toMatchObject({ quantity: 1 })
    expect(inventory.items.some((item) => item.name === 'Musical Instrument')).toBe(true)
    expect(store.currency).toEqual({ amounts: { 'currency:xphb.copper': 1900 + 1600 } })
  })

  it('5. the selected bundle ids are persisted as provenance, through rules_choices -- the same mechanism every other creation choice already reuses', async () => {
    const itemCatalogue = {
      ...CATALOGUE,
      items: [
        'leather-armor-xphb', 'dagger-xphb', 'entertainers-pack-xphb',
        'thieves-tools-xphb', 'crowbar-xphb', 'pouch-xphb', 'travelers-clothes-xphb'
      ].map((slug) => ({ packageId: PKG, slug }))
    }
    mocks.getWorldContentCatalogue.mockResolvedValue(itemCatalogue)
    await handler(fakeEvent(fullBody(undefined, 'A')) as any)
    expect(store.rulesChoices!.selections).toMatchObject({
      'class:choice:equipment.starting.bard-xphb': ['A'],
      'background:choice:equipment.starting.criminal-xphb': ['A']
    })
  })

  it('6. FRESH RELOAD -- the persisted currency round-trips cleanly through the SAME normalization a real read applies', async () => {
    await handler(fakeEvent(fullBody(undefined, 'B')) as any)
    const reloaded = normalizeStoredCurrency(store.currency)
    expect(reloaded).toEqual({ amounts: { 'currency:xphb.copper': 14000 } })
  })

  it('6b. FRESH RELOAD -- the persisted inventory round-trips cleanly, and the equipment decision reads as answered', async () => {
    const itemCatalogue = { ...CATALOGUE, items: [{ packageId: PKG, slug: 'leather-armor-xphb' }, { packageId: PKG, slug: 'dagger-xphb' }, { packageId: PKG, slug: 'entertainers-pack-xphb' }, { packageId: PKG, slug: 'thieves-tools-xphb' }, { packageId: PKG, slug: 'crowbar-xphb' }, { packageId: PKG, slug: 'pouch-xphb' }, { packageId: PKG, slug: 'travelers-clothes-xphb' }] }
    mocks.getWorldContentCatalogue.mockResolvedValue(itemCatalogue)
    await handler(fakeEvent(fullBody(undefined, 'A')) as any)

    const reloadedInventory = normalizeStoredInventory(store.inventory)
    expect(reloadedInventory).not.toBeNull()
    expect(reloadedInventory!.items.length).toBeGreaterThan(0)
    expect(store.rulesChoices!.selections['class:choice:equipment.starting.bard-xphb']).toEqual(['A'])
  })
})

// D&D 2024 Character Rules P8B -- the CLIENT half meeting the SAME server authority above. Builds
// the request body through the REAL Builder (`emptyDraft`/`setEquipmentSelection`/`toCreatePayload`
// -- the exact functions `create-v2.vue` calls), never a hand-written body object, so this proves
// the Builder's own payload shape and the server's own validation genuinely agree -- not merely
// that each was tested in isolation. Extends the evidence boundary established above; does not
// replace it.
describe('P8B -- BUILDER-SHAPED PAYLOAD meets REAL server authority (Dwarf + Bard + Criminal)', () => {
  function builderContext(items: readonly { packageId: string; slug: string }[] = []): BuilderCreationContext {
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
      items: items.map((item) => ({ ...item, title: item.slug }))
    }
  }

  function builderDraft() {
    const draft = emptyDraft()
    draft.name = 'Borin'
    draft.species = DWARF as any
    draft.class = BARD as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    return draft
  }

  function answerEveryRealChoice(draft: ReturnType<typeof builderDraft>, context: BuilderCreationContext, equipmentBundle: 'A' | 'B') {
    setChoiceSelections(draft, SKILL_KEY, ['value:skill.deception.proficient', 'value:skill.persuasion.proficient', 'value:skill.performance.proficient'], context)
    setChoiceSelections(draft, INSTRUMENT_KEY, ['value:tool.lute.proficient', 'value:tool.lyre.proficient', 'value:tool.drum.proficient'], context)
    setChoiceSelections(draft, ABILITY_KEY, ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'], context)

    const byRequirement = new Map<string, string[]>()
    for (const selection of bardSpellSelections()) {
      const refs = byRequirement.get(selection.requirementId) ?? []
      refs.push(serializeContentRef(selection.ref))
      byRequirement.set(selection.requirementId, refs)
    }
    for (const [requirementId, refs] of byRequirement) {
      setSpellSelections(draft, requirementId, refs)
    }

    setEquipmentSelection(draft, 'choice:equipment.starting.bard-xphb', equipmentBundle)
    setEquipmentSelection(draft, 'choice:equipment.starting.criminal-xphb', equipmentBundle)
  }

  it('the Builder itself reports the draft complete once every real choice (including both equipment choices) is answered', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context, 'B')
    expect(isDraftComplete(draft, context)).toBe(true)
  })

  it('an unanswered equipment choice alone keeps the Builder draft incomplete', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context, 'B')
    delete draft.equipmentSelections['choice:equipment.starting.bard-xphb']
    expect(isDraftComplete(draft, context)).toBe(false)
  })

  it('an invalid/stale bundle id cannot make the Builder complete and cannot reach the effective payload', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context, 'B')
    setEquipmentSelection(draft, 'choice:equipment.starting.bard-xphb', 'Z')
    expect(isDraftComplete(draft, context)).toBe(false)
    expect(toCreatePayload(draft, context)).toBeNull()
  })

  it('the real Builder payload (bundle B, pure currency) succeeds through the real route and persists exactly what the hand-written body already proved', async () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context, 'B')
    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    expect(payload.startingEquipment).toEqual({
      'choice:equipment.starting.bard-xphb': 'B',
      'choice:equipment.starting.criminal-xphb': 'B'
    })
    // CLIENT NEVER SUBMITS AUTHORITATIVE GRANT DATA -- only the bundle identity string.
    for (const value of Object.values(payload.startingEquipment)) {
      expect(typeof value).toBe('string')
    }

    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(store.inventory).toBeNull()
    expect(store.currency).toEqual({ amounts: { 'currency:xphb.copper': 9000 + 5000 } })
    expect(store.rulesChoices!.selections).toMatchObject({
      'class:choice:equipment.starting.bard-xphb': ['B'],
      'background:choice:equipment.starting.criminal-xphb': ['B']
    })
  })

  it('the real Builder payload (bundle A, catalogue items) succeeds through the real route and persists the merged inventory', async () => {
    const items = [
      'leather-armor-xphb', 'dagger-xphb', 'entertainers-pack-xphb',
      'thieves-tools-xphb', 'crowbar-xphb', 'pouch-xphb', 'travelers-clothes-xphb'
    ].map((slug) => ({ packageId: PKG, slug }))
    mocks.getWorldContentCatalogue.mockResolvedValue({ ...CATALOGUE, items })

    const context = builderContext(items)
    const draft = builderDraft()
    answerEveryRealChoice(draft, context, 'A')
    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)

    const inventory = normalizeStoredInventory(store.inventory)!
    expect(inventory.items.find((item) => item.ref?.slug === 'dagger-xphb')).toMatchObject({ quantity: 4 })
    expect(inventory.items.some((item) => item.name === 'Musical Instrument')).toBe(true)
    expect(store.currency).toEqual({ amounts: { 'currency:xphb.copper': 1900 + 1600 } })
  })
})
