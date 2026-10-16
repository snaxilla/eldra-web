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

// UNIT-ISOLATION (classified in tests/rules/completeness-stub-policy.test.ts): this file asserts MECHANICS
// only. The completeness authority is replaced by the explicit stub in tests/helpers/completeness-stub.ts, so it
// makes no claim that a real PHB character can be created or progressed.
vi.mock('../../../../../../app/lib/content-rules/creation-completeness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../app/lib/content-rules/creation-completeness')>()),
  ...(await import('../../../../../helpers/completeness-stub')).MECHANICS_ONLY_COMPLETENESS
}))
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
import { resolveDnd5eItemMechanics } from '../../../../../../app/lib/item-mechanics/dnd5e'
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
// HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human's own Versatile free Origin-feat choice
// (a content choice, not a Definition choice) is now MANDATORY at creation, exactly like Fighter's
// own Fighting Style/Weapon Mastery above -- every test in this file using Human as its species
// needs a legal answer or the request is refused before it ever reaches the mechanics these tests
// exist to prove. Answered with Tough (a plain Origin feat with no nested choices of its own), so
// it never interferes with the Fighting Style/Origin-feat-routing mechanics this file tests.
const ORIGIN_SELECTION_KEY = progressionChoiceKey('species', 1, 'choice:feat.origin-selection')
const ORIGIN_SELECTION_ANSWER = [`${CONTENT_PACKAGE}::tough-xphb`]

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
// PHASE 2C.3A -- Criminal: a supported Background whose grants (Sleight of Hand, Stealth) do not
// touch a Fighter's own skill choice. (Sage is ALSO supported now -- FEAT-OWNED SPELL ACQUISITION
// PHASE -- but is not used here since this describe's own concern is unrelated to spells.)
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })
// P1 -- Artisan: its Origin feat (Crafter) has a representable tool choice, so it is the Background that
// exercises a rules_choices answer at creation.
const ARTISAN = entry({ title: 'Artisan', slug: 'artisan-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'artisan-xphb') ?? undefined })

// D&D 2024 Character Rules P3.3 -- the real Wizard facet used above now carries real
// spellRequirements, so every `bodyWith` call (Wizard is this file's own default class, unrelated
// to the mechanics each test actually asserts on) needs a legal spell answer or the request is
// refused before it ever reaches the rules_choices/Origin-feat mechanics these tests exist to
// prove. A small, fixed, always-legal spell catalogue + answer set, built once.
const WIZARD_SPELL_SLUGS = [...'abcdef']
const WIZARD_CANTRIP_SLUGS = [...'xyz']
const WIZARD_SPELLS = [
  ...WIZARD_SPELL_SLUGS.map((s) => ({ packageId: CONTENT_PACKAGE, slug: `wiz-${s}`, title: `Wizard Spell ${s.toUpperCase()}`, spellMechanics: { level: 1, concentration: false, ritual: false, resolution: null, classLists: ['Wizard'] } })),
  ...WIZARD_CANTRIP_SLUGS.map((s) => ({ packageId: CONTENT_PACKAGE, slug: `wiz-cantrip-${s}`, title: `Wizard Cantrip ${s.toUpperCase()}`, spellMechanics: { level: 0, concentration: false, ritual: false, resolution: null, classLists: ['Wizard'] } }))
]

// FEAT-OWNED SPELL ACQUISITION PHASE -- Acolyte's own Origin Feat (Magic Initiate) is fixed to
// the Cleric list, needing its own Cleric-tagged cantrips/Level-1 spell -- the Wizard-only
// catalogue above has none. A small, fixed, always-legal Cleric spell set, mirroring
// WIZARD_SPELLS's own posture exactly.
const CLERIC_SPELL_SLUGS = [...'gh']
const CLERIC_CANTRIP_SLUGS = [...'uv']
const CLERIC_SPELLS = [
  ...CLERIC_SPELL_SLUGS.map((s) => ({ packageId: CONTENT_PACKAGE, slug: `cleric-${s}`, title: `Cleric Spell ${s.toUpperCase()}`, spellMechanics: { level: 1, concentration: false, ritual: false, resolution: null, classLists: ['Cleric'] } })),
  ...CLERIC_CANTRIP_SLUGS.map((s) => ({ packageId: CONTENT_PACKAGE, slug: `cleric-cantrip-${s}`, title: `Cleric Cantrip ${s.toUpperCase()}`, spellMechanics: { level: 0, concentration: false, ritual: false, resolution: null, classLists: ['Cleric'] } }))
]

function magicInitiateClericSpellSelections() {
  const requirements = findRulesFacet('dnd5e.2024', 'feat', 'magic-initiate-xphb')!.spellRequirements!
  const cantripId = requirements.find((r) => r.pool === 'cantrip' && r.filter.classList?.includes('Cleric'))!.id
  const spellId = requirements.find((r) => r.pool === 'fixed' && r.filter.classList?.includes('Cleric'))!.id
  const cantripRefs = CLERIC_CANTRIP_SLUGS.map((s) => ({ packageId: CONTENT_PACKAGE, slug: `cleric-cantrip-${s}` }))
  const spellRef = { packageId: CONTENT_PACKAGE, slug: `cleric-${CLERIC_SPELL_SLUGS[0]}` }
  return [
    ...cantripRefs.map((ref) => ({ requirementId: cantripId, ref })),
    { requirementId: spellId, ref: spellRef }
  ]
}

function wizardSpellSelections() {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
  const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
  const spellId = requirements.find((r) => r.pool === 'spell')!.id
  const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
  const spellRefs = WIZARD_SPELL_SLUGS.map((s) => ({ packageId: CONTENT_PACKAGE, slug: `wiz-${s}` }))
  const cantripRefs = WIZARD_CANTRIP_SLUGS.map((s) => ({ packageId: CONTENT_PACKAGE, slug: `wiz-cantrip-${s}` }))
  return [
    ...spellRefs.map((ref) => ({ requirementId: spellbookId, ref })),
    ...spellRefs.slice(0, 4).map((ref) => ({ requirementId: spellId, ref })),
    ...cantripRefs.map((ref) => ({ requirementId: cantripId, ref }))
  ]
}

// Weapon Mastery phase -- Fighter's own Level-1 Weapon Mastery choice (3 distinct weapon kinds,
// Simple or Martial, melee or ranged) needs real weapon-shaped catalogue entries; this file's
// mechanics otherwise have nothing to do with Weapon Mastery, so three arbitrary, clearly
// legal-for-a-Fighter weapons suffice (real 5etools shape, resolved through the real resolver,
// never hand-typed CanonicalItemMechanics).
function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...entry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
const DAGGER = weaponEntry('Dagger', 'dagger-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB', 'T|XPHB'], mastery: ['Nick|XPHB'] })
const LONGSWORD = weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] })
const WARHAMMER = weaponEntry('Warhammer', 'warhammer-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Push|XPHB'] })
const WEAPONS = [DAGGER, LONGSWORD, WARHAMMER]

const CATALOGUE = {
  worldId: WORLD_ID,
  packs: [],
  species: [HUMAN],
  classes: [FIGHTER, WIZARD],
  backgrounds: [CRIMINAL, ARTISAN],
  feats: FEATS,
  subclasses: [], items: WEAPONS, spells: [...WIZARD_SPELLS, ...CLERIC_SPELLS], monsters: []
}

const ref = (packageId: string, slug: string) => ({ packageId, slug })
const archery = ref(CONTENT_PACKAGE, 'archery-xphb')
const WEAPON_MASTERY_KEY = progressionChoiceKey('class', 1, 'choice:class.weapon-mastery')
const fighterWeaponSelections = () => WEAPONS.map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug }))

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

// D&D 2024 Character Rules P8 -- Fighter's own pure-currency bundle is 'C' (its 'A'/'B' are both
// physical gear, see dnd5e-2024.ts's own Fighter facet); Criminal's is 'B'. Neither needs any
// catalogue item to resolve, matching this file's own items-less synthetic catalogue.
function fighterBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Brenna',
    species: ref(CONTENT_PACKAGE, 'human-xphb'),
    class: ref(CONTENT_PACKAGE, 'fighter-xphb'),
    background: ref(CONTENT_PACKAGE, 'criminal-xphb'),
    abilities: STANDARD_ARRAY,
    // Weapon Mastery phase -- Fighter's own real Level-1 choice (3 distinct weapon kinds) is
    // MANDATORY at creation (a content choice, not a Definition choice) -- every one of this
    // file's own mechanics tests needs a legal answer or the request is refused before it ever
    // reaches the Fighting Style/Origin Feat mechanics these tests exist to prove.
    contentChoices: { [FS_ONLY_KEY]: [serializeContentRef(archery)], [WEAPON_MASTERY_KEY]: fighterWeaponSelections(), [ORIGIN_SELECTION_KEY]: ORIGIN_SELECTION_ANSWER },
    startingEquipment: { 'choice:equipment.starting.fighter-xphb': 'C', 'choice:equipment.starting.criminal-xphb': 'B' },
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

describe('Fighter Level-1 Fighting Style routing (mechanics; completeness authority stubbed)', () => {
  it('a Fighting Style answer is routed to the entity write (mechanics)', async () => {
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
    // PHASE 2C.3A -- the default Background (Criminal) grants Alert as a fixed Origin
    // feat, so the Fighter holds BOTH; the Fighting Style stays under its own key.
    // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- also holds its own freely-chosen
    // Versatile feat (fighterBody's own default answer, Tough), a THIRD distinct acquisition.
    expect(progression.feats).toHaveLength(3)
    expect(progression.feats).toEqual(expect.arrayContaining([
      { featRef: archery, choiceKey: FS_ONLY_KEY },
      { featRef: ref(CONTENT_PACKAGE, 'alert-xphb'), choiceKey: 'background:progression:1:grant:origin' },
      { featRef: ref(CONTENT_PACKAGE, 'tough-xphb'), choiceKey: ORIGIN_SELECTION_KEY }
    ]))
    expect(FS_ONLY_KEY).toBe('class:progression:1:choice:feat.fighting-style.fs-only')
    // D&D 2024 Character Rules P8 -- rules_choices is no longer null: it now carries the
    // starting-equipment bundle provenance this request's own fighterBody() submits. The
    // assertion this test exists for still holds -- Fighting Style is NOT one of its keys.
    expect(Object.keys((store.rules as any).selections)).not.toContain(FS_ONLY_KEY)
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
    expect(assembled.feats).toHaveLength(3)
    expect(assembled.feats).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'resolved', choiceKey: FS_ONLY_KEY, entry: expect.objectContaining({ slug: 'archery-xphb' }) }),
      expect.objectContaining({ status: 'resolved', choiceKey: 'background:progression:1:grant:origin', entry: expect.objectContaining({ slug: 'alert-xphb' }) }),
      expect.objectContaining({ status: 'resolved', choiceKey: ORIGIN_SELECTION_KEY, entry: expect.objectContaining({ slug: 'tough-xphb' }) })
    ]))
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

describe('Fighter creation -- write-order mechanics (completeness stubbed)', () => {
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

  // P1 -- a proficiency answer made at creation is a rules choice. Its write fails LOUDLY (no
  // swallowed .catch): a completed-looking character must not silently lack the tool it chose.
  // Creation answers are keyed `slot:choiceSetId` (resolveCreationChoices), not the progression key form.
  const ARTISAN_TOOL_KEY = 'background:choice:proficiency.artisan-tool.background'
  const CARPENTERS = 'value:tool.carpenters_tools.proficient'
  // D&D 2024 Character Rules A1 -- Crafter (Artisan's own Origin feat) now has its own real
  // nested "choose 3 tools" choice, so a legal Artisan creation answer must supply it too, keyed
  // under the Origin feat's own fixed acquisition (ORIGIN_FEAT_SLOT/ORIGIN_FEAT_GRANT_SEGMENT,
  // app/lib/characters/creation-origin-feat.ts).
  const CRAFTER_TOOLS_KEY = 'feat:background:progression:1:grant:origin:choice:feat.crafter.tools'
  const CRAFTER_TOOLS = ['value:tool.leatherworkers_tools.proficient', 'value:tool.masons_tools.proficient', 'value:tool.potters_tools.proficient']

  it('a P1 Artisan tool answer is persisted through rules_choices and survives a fresh read', async () => {
    await postCreate(bodyWith('Artisan', { choices: { selections: { [ARTISAN_TOOL_KEY]: [CARPENTERS], [CRAFTER_TOOLS_KEY]: CRAFTER_TOOLS } } }))
    expect(mocks.saveCharacterRulesChoices).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(store.rules)).toContain(CARPENTERS)
  })

  it('a failed rules_choices write fails the request, and no health is written after it', async () => {
    mocks.saveCharacterRulesChoices.mockRejectedValueOnce(new Error('rules_choices write failed'))
    await expect(postCreate(bodyWith('Artisan', { choices: { selections: { [ARTISAN_TOOL_KEY]: [CARPENTERS], [CRAFTER_TOOLS_KEY]: CRAFTER_TOOLS } } })))
      .rejects.toThrow('rules_choices write failed')
    expect(mocks.saveCharacterHealth).not.toHaveBeenCalled()
  })

  // P7 -- ROUND-TRIP ACCEPTANCE (MECHANICS ISOLATION, completeness stubbed; this file is on the
  // policy's UNIT_STUBBING list). Creation through the REAL route, with Criminal's own real three
  // abilities (dex, con, int). Real-authority creation of Criminal is refused today by its OWN
  // separate, unrelated blocker (starting equipment, P8) -- this proves PERSISTENCE through
  // rules_choices, not that a real Criminal character can be created end to end; that claim is
  // deliberately NOT made here.
  const BACKGROUND_ABILITY_KEY = 'background:choice:background.ability-distribution'
  const DEX_INCREASE = 'source:background.increase.dex'
  const CON_INCREASE = 'source:background.increase.con'
  const INT_INCREASE = 'source:background.increase.int'

  it('a P7 +2/+1 Background ability answer is persisted through rules_choices and survives a fresh read', async () => {
    await postCreate(bodyWith('Criminal', { choices: { selections: { [BACKGROUND_ABILITY_KEY]: [DEX_INCREASE, DEX_INCREASE, CON_INCREASE] } } }))
    expect(mocks.saveCharacterRulesChoices).toHaveBeenCalledTimes(1)
    const persisted = JSON.parse(JSON.stringify(store.rules))
    expect(persisted.selections[BACKGROUND_ABILITY_KEY]).toEqual([DEX_INCREASE, DEX_INCREASE, CON_INCREASE])
  })

  it('a P7 +1/+1/+1 Background ability answer is persisted through rules_choices and survives a fresh read', async () => {
    await postCreate(bodyWith('Criminal', { choices: { selections: { [BACKGROUND_ABILITY_KEY]: [DEX_INCREASE, CON_INCREASE, INT_INCREASE] } } }))
    expect(mocks.saveCharacterRulesChoices).toHaveBeenCalledTimes(1)
    const persisted = JSON.parse(JSON.stringify(store.rules))
    expect(persisted.selections[BACKGROUND_ABILITY_KEY]).toEqual([DEX_INCREASE, CON_INCREASE, INT_INCREASE])
  })

  it('a crafted +3-to-one-ability answer is rejected before any write (choice validation runs before the entity is created)', async () => {
    await expect(postCreate(bodyWith('Criminal', { choices: { selections: { [BACKGROUND_ABILITY_KEY]: [DEX_INCREASE, DEX_INCREASE, DEX_INCREASE] } } })))
      .rejects.toThrow()
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
    expect(mocks.saveCharacterRulesChoices).not.toHaveBeenCalled()
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

// ---- PHASE 2C.3A -- fixed Origin Feat acquisition, through the real POST route -

const ORIGIN_KEY = progressionChoiceKey('background', 1, 'grant:origin')
const ALL_BACKGROUND_NAMES = [
  'Acolyte', 'Artisan', 'Charlatan', 'Criminal', 'Entertainer', 'Farmer', 'Guard', 'Guide',
  'Hermit', 'Merchant', 'Noble', 'Sage', 'Sailor', 'Scribe', 'Soldier', 'Wayfarer'
]
const ALL_BACKGROUNDS = ALL_BACKGROUND_NAMES.map((name) => entry({
  title: name, slug: slugOf(name), rulesFacet: findRulesFacet('dnd5e.2024', 'background', slugOf(name)) ?? undefined
}))
// Fixture-level expectations (the real XPHB corpus), never application branching.
const SUPPORTED_ORIGIN: [string, string][] = [
  ['Criminal', 'alert-xphb'], ['Guard', 'alert-xphb'], ['Farmer', 'tough-xphb'], ['Hermit', 'healer-xphb'],
  ['Merchant', 'lucky-xphb'], ['Wayfarer', 'lucky-xphb'], ['Sailor', 'tavern-brawler-xphb'], ['Soldier', 'savage-attacker-xphb']
]
// HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human's own Versatile answer must never name
// the SAME feat this test's own Background already fixes (Tough is NOT repeatable, so Human +
// Farmer both picking Tough would be an illegal duplicate acquisition, correctly rejected by
// findIllegalRepeatAcquisition) -- picks any other plain, no-nested-choice Origin feat instead.
const SIMPLE_ORIGIN_FEATS = ['alert-xphb', 'healer-xphb', 'lucky-xphb', 'savage-attacker-xphb', 'tavern-brawler-xphb', 'tough-xphb']
function originSelectionAnswerAvoiding(ownFeatSlug?: string): string[] {
  const pick = SIMPLE_ORIGIN_FEATS.find((slug) => slug !== ownFeatSlug) ?? SIMPLE_ORIGIN_FEATS[0]
  return [`${CONTENT_PACKAGE}::${pick}`]
}
function bodyWith(backgroundName: string, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Brenna',
    species: ref(CONTENT_PACKAGE, 'human-xphb'),
    class: ref(CONTENT_PACKAGE, 'wizard-xphb'),
    background: ref(CONTENT_PACKAGE, slugOf(backgroundName)),
    abilities: STANDARD_ARRAY,
    contentChoices: { [ORIGIN_SELECTION_KEY]: originSelectionAnswerAvoiding(SUPPORTED_ORIGIN.find(([name]) => name === backgroundName)?.[1]) },
    // D&D 2024 Character Rules P3.3 -- this file's own default class (Wizard) now has real Level-1
    // spell requirements; a legal answer is supplied by default so every pre-existing test here
    // keeps asserting exactly what it always asserted (rules_choices/Origin-feat mechanics), not
    // spell completeness. A test that needs to prove something ABOUT spells overrides this key.
    spellSelections: wizardSpellSelections(),
    // D&D 2024 Character Rules P8 -- same "supply the pure-currency default" posture as this
    // file's own spellSelections default immediately above: Wizard's and every one of the 16
    // backgrounds' own 'B' bundle is pure currency, needing no catalogue item.
    startingEquipment: { 'choice:equipment.starting.wizard-xphb': 'B', [`choice:equipment.starting.${slugOf(backgroundName)}`]: 'B' },
    ...overrides
  }
}

describe('PHASE 2C.3A -- fixed Origin Feat routing (mechanics; completeness stubbed)', () => {
  beforeEach(() => {
    mocks.getWorldContentCatalogue.mockResolvedValue({ ...CATALOGUE, backgrounds: ALL_BACKGROUNDS })
  })

  it('the Origin grant key is the canonical background-source key, distinct from every class-side key', () => {
    expect(ORIGIN_KEY).toBe('background:progression:1:grant:origin')
    expect(new Set([ORIGIN_KEY, FS_ONLY_KEY, progressionChoiceKey('class', 19, 'choice:feat.epic-boon'), progressionChoiceKey('class', 4, 'choice:feat.selection')]).size).toBe(4)
  })

  it.each(SUPPORTED_ORIGIN)('%s acquires %s from the server-derived Background facet, with no client-supplied feat', async (background, feat) => {
    await postCreate(bodyWith(background))
    // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- also acquires its own freely-chosen
    // Versatile feat, via the SAME avoidance logic bodyWith's own default answer uses.
    const versatile = originSelectionAnswerAvoiding(feat)[0]!.split('::')[1]
    expect((store.progression as any).feats).toEqual(expect.arrayContaining([
      { featRef: ref(CONTENT_PACKAGE, feat), choiceKey: ORIGIN_KEY },
      { featRef: ref(CONTENT_PACKAGE, versatile), choiceKey: ORIGIN_SELECTION_KEY }
    ]))
    expect((store.progression as any).feats).toHaveLength(2)
  })

  it('Fighter + Criminal: progression.feats[] holds BOTH the Fighting Style and the Origin feat under distinct keys, and a fresh read keeps both', async () => {
    await postCreate(fighterBody({ background: ref(CONTENT_PACKAGE, 'criminal-xphb') }))
    const feats = (store.progression as any).feats as { featRef: ContentRef; choiceKey: string }[]
    // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- also acquires its own freely-chosen
    // Versatile feat (fighterBody's own default answer, Tough), a THIRD distinct acquisition.
    expect(feats).toHaveLength(3)
    expect(feats).toEqual(expect.arrayContaining([
      { featRef: archery, choiceKey: FS_ONLY_KEY },
      { featRef: ref(CONTENT_PACKAGE, 'alert-xphb'), choiceKey: ORIGIN_KEY },
      { featRef: ref(CONTENT_PACKAGE, 'tough-xphb'), choiceKey: ORIGIN_SELECTION_KEY }
    ]))
    const fresh = blueprintFromStore('4242')
    expect(fresh.feats.map((feat) => feat.choiceKey).sort()).toEqual([FS_ONLY_KEY, ORIGIN_KEY, ORIGIN_SELECTION_KEY].sort())
  })

  it('a NON-Fighter with a supported Background owns the Origin feat, its own freely-chosen Versatile feat, and NO Fighting Style', async () => {
    await postCreate(bodyWith('Criminal'))
    const feats = (store.progression as any).feats as { choiceKey: string }[]
    expect(feats.map((feat) => feat.choiceKey)).toEqual([ORIGIN_KEY, ORIGIN_SELECTION_KEY])
    expect(feats.some((feat) => feat.choiceKey.includes('fighting-style'))).toBe(false)
  })


  it('a crafted contentChoices entry naming the Origin key is rejected as an undeclared choice, and nothing is written', async () => {
    const body = bodyWith('Criminal', { contentChoices: { [ORIGIN_KEY]: [serializeContentRef(ref(CONTENT_PACKAGE, 'tough-xphb'))] } })
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a crafted choices.selections entry naming the Origin key is rejected as an undeclared choice', async () => {
    const body = bodyWith('Criminal', { choices: { selections: { [ORIGIN_KEY]: ['x'] } } })
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('client-supplied fixed-feat fields are IGNORED: a Criminal cannot be substituted with Tough', async () => {
    await postCreate(bodyWith('Criminal', { fixedFeats: [serializeContentRef(ref(CONTENT_PACKAGE, 'tough-xphb'))], originFeat: 'tough-xphb' }))
    expect((store.progression as any).feats).toEqual(expect.arrayContaining([
      { featRef: ref(CONTENT_PACKAGE, 'alert-xphb'), choiceKey: ORIGIN_KEY }
    ]))
  })

  it('an Origin feat missing from the World catalogue fails CLOSED before any entity exists', async () => {
    mocks.getWorldContentCatalogue.mockResolvedValue({ ...CATALOGUE, backgrounds: ALL_BACKGROUNDS, feats: FEATS.filter((feat) => feat.slug !== 'alert-xphb') })
    await expect(postCreate(bodyWith('Criminal'))).rejects.toMatchObject({ statusCode: 500 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('the CURRENT Background\'s Origin feat is routed, with no stale Origin carried over (mechanics; stubbed)', async () => {
    // FEAT-OWNED SPELL ACQUISITION PHASE -- Acolyte's own Origin Feat (Magic Initiate) is now
    // fixed-supported too (no longer `creationUnavailable`); it routes exactly like every other
    // Background's own fixed Origin Feat, proven here alongside Criminal/Farmer's own swap. Its
    // own real spellRequirements (fixed to the Cleric list) need a real answer, same as this
    // file's own default Wizard class spell answer.
    await postCreate(bodyWith('Acolyte', { spellSelections: [...wizardSpellSelections(), ...magicInitiateClericSpellSelections()] }))
    expect((store.progression as any).feats.map((feat: { featRef: ContentRef }) => feat.featRef.slug)).toEqual(['magic-initiate-xphb', 'alert-xphb'])

    resetStore()
    await postCreate(bodyWith('Criminal'))
    expect((store.progression as any).feats.map((feat: { featRef: ContentRef }) => feat.featRef.slug)).toEqual(['alert-xphb', 'healer-xphb'])

    resetStore()
    await postCreate(bodyWith('Farmer'))
    expect((store.progression as any).feats.map((feat: { featRef: ContentRef }) => feat.featRef.slug)).toEqual(['tough-xphb', 'alert-xphb'])
  })

  it('an OLD Criminal character (catalogue_selection only, no progression) carries NO retroactive Origin grant on read', () => {
    store.catalogueSelection = {
      species: { packageId: CONTENT_PACKAGE, slug: 'human-xphb' },
      class: { packageId: CONTENT_PACKAGE, slug: 'wizard-xphb' },
      background: { packageId: CONTENT_PACKAGE, slug: 'criminal-xphb' }
    }
    store.progression = null
    expect(blueprintFromStore('4242').feats).toEqual([])
  })
})
