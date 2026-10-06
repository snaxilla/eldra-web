// PHASE 2C.2B -- Fighter Level-1 creation, end to end through the REAL route.
//
// What is real here: the create-v2 POST handler (validation, authority, write
// order), the real Dnd5e 2024 Rules Package and its registry, the real derived
// projection (getDerivedCharacter / getDerivedCharacterAtLevel), the real Level
// Manager (planProgression), and the real feat authority and corpus-derived feat
// mechanics. The catalogue entries are real XPHB shapes (feat mechanics resolved
// from the corpus fixture; facets from the real content corpus).
//
// What is stood in: the Directus boundary. An in-memory store takes every write
// the handler makes, JSON round-trips it (so only what a real store keeps
// survives), and the blueprint assembler reads ONLY that store on a fresh read --
// never the request body, never a tentative argument. The assembler's own
// fallback code is not exercised here; the legacy-character regression states
// that honestly rather than pretending the stand-in proves it.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  catalogueSelection: null as null | Record<string, unknown>,
  progression: null as null | Record<string, unknown>,
  rules: null as null | Record<string, unknown>,
  abilities: null as null | Record<string, unknown>,
  createdEntityId: 4242,
  failCatalogueSelection: false,
  failProgression: false
}))

const mocks = vi.hoisted(() => ({
  getWorldContentCatalogue: vi.fn(),
  getWorldRuntime: vi.fn(),
  createEntityRecord: vi.fn(),
  dxFetch: vi.fn(),
  saveCharacterAbilityScores: vi.fn(),
  saveCharacterRulesChoices: vi.fn(),
  loadCharacterRulesChoices: vi.fn(),
  saveCharacterProgression: vi.fn(),
  saveCharacterHealth: vi.fn(),
  listContentPackBindingsForWorld: vi.fn(),
  assembleCharacter: vi.fn()
}))

vi.mock('../../../../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: mocks.getWorldContentCatalogue }))
vi.mock('../../../../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: mocks.getWorldRuntime }))
vi.mock('../../../../../../server/utils/entity-factory', () => ({ createEntityRecord: mocks.createEntityRecord, dxFetch: mocks.dxFetch }))
vi.mock('../../../../../../server/utils/character-ability-scores', () => ({
  saveCharacterAbilityScores: mocks.saveCharacterAbilityScores
}))
vi.mock('../../../../../../server/utils/character-rules-choices', () => ({
  saveCharacterRulesChoices: mocks.saveCharacterRulesChoices,
  loadCharacterRulesChoices: mocks.loadCharacterRulesChoices
}))
vi.mock('../../../../../../server/utils/character-progression', () => ({
  saveCharacterProgression: mocks.saveCharacterProgression
}))
vi.mock('../../../../../../server/utils/character-health', () => ({ saveCharacterHealth: mocks.saveCharacterHealth }))
vi.mock('../../../../../../server/utils/world-content-packs', () => ({ listContentPackBindingsForWorld: mocks.listContentPackBindingsForWorld }))
vi.mock('../../../../../../server/utils/character-assembly', () => ({ assembleCharacter: mocks.assembleCharacter }))

;(globalThis as any).createError = (input: { statusCode: number; statusMessage?: string; data?: unknown }) =>
  Object.assign(new Error(input.statusMessage ?? 'error'), { statusCode: input.statusCode })

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn(async (event: any) => event._requestBody) }
})

import { createWorldRuntime } from '../../../../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../../../../app/lib/rules/types'
import { findRulesFacet } from '../../../../../../app/lib/content-rules'
import { normalizeStoredProgression } from '../../../../../../app/lib/characters/progression'
import { normalizeStoredRulesChoices, progressionChoiceKey } from '../../../../../../app/lib/characters/rules-choices'
import { parseContentRef, serializeContentRef, type ContentRef } from '../../../../../../app/lib/characters/progression-plan'
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import { getDerivedCharacterAtLevel, type DerivedCharacter } from '../../../../../../server/utils/character-derived'
import { planProgression } from '../../../../../../server/utils/character-progression-plan'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const WORLD_ID = '5'
const PACKAGE_ID = 'eldra.rules.dnd5e-2024'
const CONTENT_PACKAGE = 'eldra.solaris.xphb'
const FS_ONLY_KEY = progressionChoiceKey('class', 1, 'choice:feat.fighting-style.fs-only')
const FEATURE = 'value:feature.fighting-style'

// ---- real package -----------------------------------------------------------

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
  const result = createWorldRuntime(manifest, loadRealDefinitions(), WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

// ---- real catalogue-shaped content ------------------------------------------

const slugOf = (name: string) => `${name.toLowerCase().replace(/ /g, '-')}-xphb`

function entry(overrides: Record<string, unknown>) {
  return {
    packageId: CONTENT_PACKAGE, packageVersion: '1.0.10', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'Thing__XPHB', provider: '5etools-json',
    ...overrides
  }
}

const FEATS = xphbFeats.feats.map((raw) => {
  const slug = slugOf(raw.name)
  return entry({
    title: raw.name,
    slug,
    externalId: `${raw.name}__XPHB`,
    featMechanics: resolveDnd5eFeatMechanics(raw),
    rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined
  })
})

const FIGHTER = entry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })
const WIZARD = entry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined })
const HUMAN = entry({ title: 'Human', slug: 'human-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'human-xphb') ?? undefined })
const SAGE = entry({ title: 'Sage', slug: 'sage-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'sage-xphb') ?? undefined })

const CATALOGUE = {
  worldId: WORLD_ID,
  packs: [],
  species: [HUMAN],
  classes: [FIGHTER, WIZARD],
  backgrounds: [SAGE],
  feats: FEATS,
  subclasses: [], items: [], spells: [], monsters: []
}

const ref = (packageId: string, slug: string) => ({ packageId, slug })
const archery = ref(CONTENT_PACKAGE, 'archery-xphb')

// ---- request + store plumbing ----------------------------------------------

function fakeEvent(body: unknown): H3Event {
  return {
    context: {
      principal: {
        accountId: 'player-1',
        platformCapabilities: new Set(),
        worldCapabilities: new Map([[WORLD_ID, new Set(['world.read', 'world.character.create'])]]),
        temporarySingleUserMode: false
      },
      params: { id: WORLD_ID }
    },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }

function fighterBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Brenna',
    species: ref(CONTENT_PACKAGE, 'human-xphb'),
    class: ref(CONTENT_PACKAGE, 'fighter-xphb'),
    background: ref(CONTENT_PACKAGE, 'sage-xphb'),
    abilities: STANDARD_ARRAY,
    contentChoices: { [FS_ONLY_KEY]: [serializeContentRef(archery)] },
    ...overrides
  }
}

function serializeContentRef(value: ContentRef) {
  return `${value.packageId}::${value.slug}`
}

// Persisted through the real stored-state boundary: JSON round-trip, so anything
// a real store would not keep (undefined, class instances) is lost exactly as it
// would be in production.
const persist = (value: unknown) => JSON.parse(JSON.stringify(value))

// Blueprint from STORE ALONE. Resolves the stored refs against the real catalogue.
function blueprintFromStore(characterId: string) {
  const selection = store.catalogueSelection as Record<string, any> | null
  if (!selection) throw new Error('no catalogue_selection stored')
  const resolve = (choice: any, list: any[]) => {
    const found = list.find((candidate) => candidate.packageId === choice.packageId && candidate.slug === choice.slug)
    return found ? { status: 'resolved' as const, entry: found } : { status: 'missing' as const, ref: choice }
  }
  const progression = normalizeStoredProgression(store.progression)
  const stored = normalizeStoredRulesChoices(store.rules)
  const abilities = (store.abilities as any) ?? STANDARD_ARRAY
  return {
    worldId: WORLD_ID,
    characterId,
    characterTitle: 'Brenna',
    species: resolve(selection.species, CATALOGUE.species),
    class: resolve(selection.class, CATALOGUE.classes),
    background: resolve(selection.background, CATALOGUE.backgrounds),
    subclass: null,
    abilityScores: { method: abilities.method, scores: abilities.scores },
    rulesChoices: stored ?? { selections: {} },
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    progression: progression ?? { classes: [{ classRef: { packageId: selection.class.packageId, slug: selection.class.slug }, level: 1 }], feats: [] },
    feats: (progression?.feats ?? []).map((feat) => {
      const found = CATALOGUE.feats.find((candidate) => candidate.packageId === feat.featRef.packageId && candidate.slug === feat.featRef.slug)
      return { status: 'resolved' as const, entry: { ...found, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', feat.featRef.slug) ?? undefined }, choiceKey: feat.choiceKey }
    }),
    resources: null,
    packs: []
  }
}

function findFlag(derived: DerivedCharacter, id: string): boolean | null {
  for (const entries of Object.values(derived.byCategory)) {
    const found = entries?.find((candidate) => candidate.id === id)
    if (found) return found.value === true
  }
  return null
}

function findNumber(derived: DerivedCharacter, id: string): number | null {
  for (const entries of Object.values(derived.byCategory)) {
    const found = entries?.find((candidate) => candidate.id === id)
    if (found) return typeof found.value === 'number' ? found.value : null
  }
  return null
}

async function postCreate(body: unknown) {
  return handler(fakeEvent(body) as any)
}

function resetStore() {
  store.catalogueSelection = null
  store.progression = null
  store.rules = null
  store.abilities = null
  store.failCatalogueSelection = false
  store.failProgression = false
}

beforeEach(() => {
  // Call history is per-test: a "writes nothing" assertion must not see earlier tests.
  for (const mock of Object.values(mocks)) mock.mockClear()
  resetStore()
  const runtime = loadRealRuntime()
  mocks.getWorldRuntime.mockResolvedValue({ configured: true, ok: true, runtime, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  mocks.getWorldContentCatalogue.mockResolvedValue(CATALOGUE)
  mocks.createEntityRecord.mockImplementation(async () => ({ id: store.createdEntityId }))
  mocks.dxFetch.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/items/block_instances' && options?.method === 'POST') {
      const body = JSON.parse(options.body!)
      if (body.block_key === 'catalogue_selection') {
        if (store.failCatalogueSelection) throw new Error('directus write failed: catalogue_selection')
        store.catalogueSelection = persist(body.data)
      }
      return { data: {} }
    }
    return { data: {} }
  })
  mocks.saveCharacterAbilityScores.mockImplementation(async (_id: unknown, scores: unknown) => { store.abilities = persist(scores) })
  mocks.saveCharacterRulesChoices.mockImplementation(async (_id: unknown, choices: unknown) => { store.rules = persist(choices) })
  mocks.loadCharacterRulesChoices.mockImplementation(async () => normalizeStoredRulesChoices(store.rules))
  mocks.saveCharacterProgression.mockImplementation(async (_id: unknown, progression: unknown) => {
    if (store.failProgression) throw new Error('directus write failed: progression')
    store.progression = persist(progression)
    return progression
  })
  mocks.saveCharacterHealth.mockResolvedValue(undefined)
  mocks.listContentPackBindingsForWorld.mockResolvedValue([])
  mocks.assembleCharacter.mockImplementation(async (_world: unknown, characterId: unknown) => {
    if (!store.catalogueSelection) return { available: false, reason: 'no-catalogue-selection', message: 'no selection' }
    return { available: true, blueprint: blueprintFromStore(String(characterId)) }
  })
})

// ---- the real Fighter, created through the real route -----------------------

describe('Fighter Level-1 creation -- accepted through the real POST route', () => {
  it('a legal ordinary Fighting Style is accepted and the entity is created', async () => {
    const result = await postCreate(fighterBody()) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('catalogue_selection records the Fighter, and canonical progression stores the SAME class ref byte-for-byte at Level 1', async () => {
    await postCreate(fighterBody())
    const selection = store.catalogueSelection as any
    const progression = store.progression as any
    expect(selection.class).toMatchObject({ packageId: CONTENT_PACKAGE, slug: 'fighter-xphb' })
    expect(progression.classes).toHaveLength(1)
    expect(progression.classes[0]).toEqual({
      classRef: { packageId: selection.class.packageId, slug: selection.class.slug },
      level: 1,
      subclassRef: null
    })
    expect(JSON.stringify(progression.classes[0].classRef)).toBe(JSON.stringify({ packageId: selection.class.packageId, slug: selection.class.slug }))
  })

  it('the selected Fighting Style is stored ONLY in progression.feats[] under a stable creation choice key', async () => {
    await postCreate(fighterBody())
    const progression = store.progression as any
    expect(progression.feats).toEqual([{ featRef: archery, choiceKey: FS_ONLY_KEY }])
    expect(FS_ONLY_KEY).toBe('class:progression:1:choice:feat.fighting-style.fs-only')
    expect(store.rules).toBeNull()
  })

  it('a FRESH persisted read (no Builder draft, no tentative argument) resolves Level 1, the owned style, and the feature Value', async () => {
    await postCreate(fighterBody())
    const fresh = await getDerivedCharacterAtLevel(WORLD_ID, String(store.createdEntityId), 1)
    expect(fresh.available).toBe(true)
    if (!fresh.available) return
    expect(findFlag(fresh.derived, FEATURE)).toBe(true)
    expect(findNumber(fresh.derived, 'value:ability.str')).toBe(15)
    // Ownership: the normal assembly derived state consumes resolves the feat slot
    // from progression.feats[] -- the same blueprint the derived read above used.
    const assembled = blueprintFromStore(String(store.createdEntityId))
    expect(assembled.feats).toEqual([
      expect.objectContaining({ status: 'resolved', choiceKey: FS_ONLY_KEY, entry: expect.objectContaining({ slug: 'archery-xphb' }) })
    ])
  })

  it('Level Manager sees the current Level 1 from the stored state, and the Fighter\'s next level plans from it', async () => {
    await postCreate(fighterBody())
    const plan = await planProgression(WORLD_ID, String(store.createdEntityId), 2)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.currentLevel).toBe(1)
    expect(plan.plan.targetLevel).toBe(2)
  })
})

// ---- authority: the crafted-request matrix ----------------------------------

describe('Fighter creation -- server authority rejects every illegal request', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['a General feat (Athlete)', { [FS_ONLY_KEY]: [serializeContentRef(ref(CONTENT_PACKAGE, 'athlete-xphb'))] }],
    ['an Origin feat (Alert)', { [FS_ONLY_KEY]: [serializeContentRef(ref(CONTENT_PACKAGE, 'alert-xphb'))] }],
    ['an Epic Boon (Fortitude)', { [FS_ONLY_KEY]: [serializeContentRef(ref(CONTENT_PACKAGE, 'boon-of-fortitude-xphb'))] }],
    ['Blessed Warrior (variant FS:P)', { [FS_ONLY_KEY]: [serializeContentRef(ref(CONTENT_PACKAGE, 'blessed-warrior-xphb'))] }],
    ['Druidic Warrior (variant FS:R)', { [FS_ONLY_KEY]: [serializeContentRef(ref(CONTENT_PACKAGE, 'druidic-warrior-xphb'))] }],
    ['an unknown ContentRef', { [FS_ONLY_KEY]: [serializeContentRef(ref(CONTENT_PACKAGE, 'not-a-feat-xphb'))] }],
    ['a wrong-package ContentRef', { [FS_ONLY_KEY]: [serializeContentRef(ref('eldra.content.srd-5.1', 'archery-xphb'))] }],
    ['a missing required Fighting Style', { [FS_ONLY_KEY]: [] }],
    ['an undeclared content choice key', { 'class:progression:1:choice:feat.epic-boon': [serializeContentRef(archery)] }]
  ]

  it.each(cases)('rejects %s with a 400 and writes nothing', async (_label, contentChoices) => {
    await expect(postCreate(fighterBody({ contentChoices }))).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
    expect(store.catalogueSelection).toBeNull()
    expect(store.progression).toBeNull()
  })

  it('a Wizard (not a Fighter) may not submit the Fighter\'s content key -- the class switch removes the declaration', async () => {
    await expect(postCreate(fighterBody({
      class: ref(CONTENT_PACKAGE, 'wizard-xphb'),
      contentChoices: { [FS_ONLY_KEY]: [serializeContentRef(archery)] }
    }))).rejects.toMatchObject({ statusCode: 400 })
    expect(store.progression).toBeNull()
  })
})

// ---- fail loudly ------------------------------------------------------------

describe('Fighter creation -- catalogue identity and progression fail loudly', () => {
  it('a failed catalogue_selection write fails the request (no silent success)', async () => {
    store.failCatalogueSelection = true
    await expect(postCreate(fighterBody())).rejects.toThrow('catalogue_selection')
    expect(store.progression).toBeNull()
  })

  it('a failed progression write fails the request, after the catalogue identity was saved', async () => {
    store.failProgression = true
    await expect(postCreate(fighterBody())).rejects.toThrow('progression')
    expect(store.catalogueSelection).not.toBeNull()
  })
})

// ---- backward compatibility and multiple creation acquisitions --------------

describe('creation progression -- backward compatibility and model coexistence', () => {
  it('an absent progression normalizes to null, so an OLD character keeps the catalogue_selection fallback', () => {
    expect(normalizeStoredProgression(null)).toBeNull()
    expect(normalizeStoredProgression(undefined)).toBeNull()
  })

  it('two DISTINCT creation feat acquisitions coexist in progression.feats[] with distinct stable keys and no overwrite', () => {
    const originKey = progressionChoiceKey('background', 1, 'choice:feat.origin-future-slot')
    const stored = normalizeStoredProgression({
      classes: [{ classRef: { packageId: CONTENT_PACKAGE, slug: 'fighter-xphb' }, level: 1, subclassRef: null }],
      feats: [
        { featRef: archery, choiceKey: FS_ONLY_KEY },
        { featRef: ref(CONTENT_PACKAGE, 'alert-xphb'), choiceKey: originKey }
      ]
    })
    expect(stored!.feats).toHaveLength(2)
    expect(new Set(stored!.feats.map((feat) => feat.choiceKey)).size).toBe(2)
    expect(stored!.feats.map((feat) => feat.choiceKey)).toEqual([FS_ONLY_KEY, originKey])
  })

  it('the creation key cannot collide with a Level-19 Epic Boon, a Level-4 General feat, or a Paladin/Ranger style', () => {
    const keys = [
      FS_ONLY_KEY,
      progressionChoiceKey('class', 19, 'choice:feat.epic-boon'),
      progressionChoiceKey('class', 4, 'choice:feat.selection'),
      progressionChoiceKey('class', 2, 'choice:feat.fighting-style.fs-and-fs-p')
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('the parsed ContentRef transport is the canonical packageId::slug encoding', () => {
    expect(parseContentRef(serializeContentRef(archery))).toEqual(archery)
  })
})
