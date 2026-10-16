// HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- the MANDATORY integration proof, end to end
// through the REAL create-v2 POST route and the REAL fail-closed completeness authority.
// UNSTUBBED (see tests/rules/completeness-stub-policy.test.ts's own ACCEPTANCE category): this
// file makes the production claim that Human + Fighter + Acolyte, with Human's own Versatile
// freely selecting a SECOND, independent Magic Initiate (Wizard) alongside Acolyte's own
// Background-fixed Magic Initiate (Cleric), is genuinely creatable -- not merely representable at
// the unit level. Nothing here stubs `creation-completeness`, mocks the acquisition planner, or
// bypasses server authority; the only stand-in is the Directus boundary (an in-memory store,
// exactly mirroring create-v2-weapon-mastery.test.ts's own established ACCEPTANCE harness shape).

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  catalogueSelection: null as null | Record<string, unknown>,
  progression: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
  spellcasting: null as null | Record<string, unknown>,
  createdEntityId: 7001
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
  getDerivedCharacter: vi.fn(),
  assembleCharacter: vi.fn()
}))

vi.mock('../../../../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: mocks.getWorldContentCatalogue }))
vi.mock('../../../../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: mocks.getWorldRuntime }))
vi.mock('../../../../../../server/utils/entity-factory', () => ({ createEntityRecord: mocks.createEntityRecord, dxFetch: mocks.dxFetch }))
vi.mock('../../../../../../server/utils/character-ability-scores', () => ({ saveCharacterAbilityScores: mocks.saveCharacterAbilityScores }))
vi.mock('../../../../../../server/utils/character-rules-choices', () => ({
  saveCharacterRulesChoices: mocks.saveCharacterRulesChoices,
  loadCharacterRulesChoices: mocks.loadCharacterRulesChoices
}))
vi.mock('../../../../../../server/utils/character-progression', () => ({ saveCharacterProgression: mocks.saveCharacterProgression }))
vi.mock('../../../../../../server/utils/character-health', () => ({ saveCharacterHealth: mocks.saveCharacterHealth }))
vi.mock('../../../../../../server/utils/character-derived', () => ({ getDerivedCharacter: mocks.getDerivedCharacter }))
vi.mock('../../../../../../server/utils/character-assembly', () => ({ assembleCharacter: mocks.assembleCharacter }))

;(globalThis as any).createError = (input: { statusCode: number; statusMessage?: string }) =>
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
import { resolveDnd5eItemMechanics } from '../../../../../../app/lib/item-mechanics/dnd5e'
import { normalizeStoredProgression } from '../../../../../../app/lib/characters/progression'
import { choiceKey, progressionChoiceKey, normalizeStoredRulesChoices } from '../../../../../../app/lib/characters/rules-choices'
import { serializeContentRef, type ContentRef } from '../../../../../../app/lib/characters/progression-plan'
import { normalizeStoredSpellcasting } from '../../../../../../app/lib/characters/spellcasting'
import { gatherSpellRequirements } from '../../../../../../app/lib/characters/spell-requirement-ownership'
import { resolveCurrentProgression } from '../../../../../../server/utils/character-progression-plan'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import {
  emptyDraft,
  isDraftComplete,
  setChoiceSelections,
  setContentChoiceSelections,
  setEquipmentSelection,
  setSpellSelections,
  spellRequirementsFor,
  creationChoicePresentation,
  toCreatePayload,
  type BuilderCatalogueEntry,
  type BuilderCreationContext
} from '../../../../../../app/components/characters/builder/characterBuilderSelection'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'

const WORLD_ID = '5'
const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const CONTENT_PACKAGE = 'eldra.solaris.xphb'

// ---- real package ------------------------------------------------------------

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
const REAL_RUNTIME = loadRealRuntime()

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
    title: raw.name, slug, externalId: `${raw.name}__XPHB`,
    featMechanics: resolveDnd5eFeatMechanics(raw),
    rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined
  })
})

const HUMAN = entry({ title: 'Human', slug: 'human-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'human-xphb') ?? undefined })
const FIGHTER = entry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })
const ACOLYTE = entry({ title: 'Acolyte', slug: 'acolyte-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'acolyte-xphb') ?? undefined })
// REJECTION 7 -- a Background whose own fixed Origin feat (Alert, non-repeatable) can be targeted
// by Human's own Versatile pick to prove a non-repeatable duplicate is rejected.
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })

function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...entry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
const DAGGER = weaponEntry('Dagger', 'dagger-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB', 'T|XPHB'], mastery: ['Nick|XPHB'] })
const LONGSWORD = weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] })
const WARHAMMER = weaponEntry('Warhammer', 'warhammer-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Push|XPHB'] })
const WEAPONS = [DAGGER, LONGSWORD, WARHAMMER]

// Magic Initiate's own spellRequirements filter on classList ['Cleric']/['Druid']/['Wizard'] at
// levels 0 (cantrip x2) and 1 (fixed spell x1) -- a small, fixed, always-legal spell catalogue for
// BOTH lists this file actually exercises (Cleric, Wizard; Druid is never reached, so none needed).
function spellEntry(slug: string, level: number, classList: string) {
  return { packageId: CONTENT_PACKAGE, slug, title: slug, spellMechanics: { level, concentration: false, ritual: false, resolution: null, classLists: [classList] } }
}
const CLERIC_CANTRIPS = ['cleric-cantrip-a', 'cleric-cantrip-b'].map((s) => spellEntry(s, 0, 'Cleric'))
const CLERIC_SPELL = spellEntry('cleric-spell-a', 1, 'Cleric')
const WIZARD_CANTRIPS = ['wizard-cantrip-a', 'wizard-cantrip-b'].map((s) => spellEntry(s, 0, 'Wizard'))
const WIZARD_SPELL = spellEntry('wizard-spell-a', 1, 'Wizard')
const SPELLS = [...CLERIC_CANTRIPS, CLERIC_SPELL, ...WIZARD_CANTRIPS, WIZARD_SPELL]

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [HUMAN], classes: [FIGHTER], backgrounds: [ACOLYTE, CRIMINAL],
  feats: FEATS, subclasses: [], items: WEAPONS, spells: SPELLS, monsters: []
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }
const ref = (slug: string) => ({ packageId: CONTENT_PACKAGE, slug })
const archery = ref('archery-xphb')

// ---- canonical keys, re-derived the SAME way the server builds them, never hand-guessed -------

const SIZE_KEY = choiceKey('species', 'choice:species.size')
const SPECIES_SKILL_KEY = choiceKey('species', 'choice:skill.proficiency')
const CLASS_SKILL_KEY = choiceKey('class', 'choice:skill.proficiency')
const BACKGROUND_ABILITY_KEY = choiceKey('background', 'choice:background.ability-distribution')
const FS_KEY = progressionChoiceKey('class', 1, 'choice:feat.fighting-style.fs-only')
const WEAPON_MASTERY_KEY = progressionChoiceKey('class', 1, 'choice:class.weapon-mastery')
const ORIGIN_SELECTION_KEY = progressionChoiceKey('species', 1, 'choice:feat.origin-selection')
const ACOLYTE_ORIGIN_KEY = progressionChoiceKey('background', 1, 'grant:origin')
const HUMAN_FEAT_OWNER_KEY = `feat:${ORIGIN_SELECTION_KEY}`
const ACOLYTE_FEAT_OWNER_KEY = `feat:${ACOLYTE_ORIGIN_KEY}`
const HUMAN_MI_LIST_KEY = choiceKey(HUMAN_FEAT_OWNER_KEY, 'choice:feat.magic-initiate.list')
const ACOLYTE_MI_LIST_KEY = choiceKey(ACOLYTE_FEAT_OWNER_KEY, 'choice:feat.magic-initiate.list')
const CLERIC_LIST_VALUE = 'value:magic-initiate.list.1.active'
const WIZARD_LIST_VALUE = 'value:magic-initiate.list.3.active'

// The REAL requirement objects both acquisitions produce, computed through the SAME
// `gatherSpellRequirements` the server/Builder call -- never hand-typed ids.
function magicInitiateRequirements(acolyteList: string, humanList: string) {
  const facet = findRulesFacet('dnd5e.2024', 'feat', 'magic-initiate-xphb')!
  return gatherSpellRequirements(
    [
      { packageId: CONTENT_PACKAGE, facet, ownerKey: ACOLYTE_FEAT_OWNER_KEY },
      { packageId: CONTENT_PACKAGE, facet, ownerKey: HUMAN_FEAT_OWNER_KEY }
    ],
    { [ACOLYTE_MI_LIST_KEY]: [acolyteList], [HUMAN_MI_LIST_KEY]: [humanList] }
  )
}

function acolyteSpellSelections(requirements: ReturnType<typeof magicInitiateRequirements>) {
  const cantripId = requirements.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.cleric.cantrip'))!.id
  const spellId = requirements.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.cleric.spell'))!.id
  return [
    ...CLERIC_CANTRIPS.map((s) => ({ requirementId: cantripId, ref: ref(s.slug) })),
    { requirementId: spellId, ref: ref(CLERIC_SPELL.slug) }
  ]
}
function humanSpellSelections(requirements: ReturnType<typeof magicInitiateRequirements>) {
  const cantripId = requirements.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.wizard.cantrip'))!.id
  const spellId = requirements.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.wizard.spell'))!.id
  return [
    ...WIZARD_CANTRIPS.map((s) => ({ requirementId: cantripId, ref: ref(s.slug) })),
    { requirementId: spellId, ref: ref(WIZARD_SPELL.slug) }
  ]
}

function legalBody(overrides: Record<string, unknown> = {}) {
  const requirements = magicInitiateRequirements(CLERIC_LIST_VALUE, WIZARD_LIST_VALUE)
  return {
    title: 'Elanna',
    species: ref('human-xphb'),
    class: ref('fighter-xphb'),
    background: ref('acolyte-xphb'),
    abilities: STANDARD_ARRAY,
    choices: {
      selections: {
        [SIZE_KEY]: ['value:size.medium'],
        [SPECIES_SKILL_KEY]: ['value:skill.arcana.proficient'],
        [CLASS_SKILL_KEY]: ['value:skill.athletics.proficient', 'value:skill.perception.proficient'],
        [BACKGROUND_ABILITY_KEY]: ['source:background.increase.int', 'source:background.increase.int', 'source:background.increase.wis'],
        [HUMAN_MI_LIST_KEY]: [WIZARD_LIST_VALUE]
      }
    },
    contentChoices: {
      [FS_KEY]: [serializeContentRef(archery)],
      [WEAPON_MASTERY_KEY]: WEAPONS.map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug })),
      [ORIGIN_SELECTION_KEY]: [serializeContentRef({ packageId: CONTENT_PACKAGE, slug: 'magic-initiate-xphb' })]
    },
    spellSelections: [...acolyteSpellSelections(requirements), ...humanSpellSelections(requirements)],
    startingEquipment: {
      'choice:equipment.starting.fighter-xphb': 'C',
      'choice:equipment.starting.acolyte-xphb': 'B'
    },
    ...overrides
  }
}

// ---- request + store plumbing ------------------------------------------------

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

async function postCreate(body: unknown) {
  return handler(fakeEvent(body) as any)
}

function resetStore() {
  store.catalogueSelection = null
  store.progression = null
  store.rulesChoices = null
  store.spellcasting = null
}

// Blueprint from STORE ALONE -- resolves stored refs against the real catalogue, never the request.
function blueprintFromStore(characterId: string) {
  const selection = store.catalogueSelection as Record<string, any> | null
  if (!selection) throw new Error('no catalogue_selection stored')
  const resolve = (choiceRef: any, list: any[]) => {
    const found = list.find((candidate) => candidate.packageId === choiceRef.packageId && candidate.slug === choiceRef.slug)
    return found ? { status: 'resolved' as const, entry: found } : { status: 'missing' as const, ref: choiceRef }
  }
  const progression = normalizeStoredProgression(store.progression)
  const storedRules = normalizeStoredRulesChoices(store.rulesChoices)
  return {
    worldId: WORLD_ID,
    characterId,
    characterTitle: 'Elanna',
    species: resolve(selection.species, CATALOGUE.species),
    class: resolve(selection.class, CATALOGUE.classes),
    background: resolve(selection.background, CATALOGUE.backgrounds),
    subclass: null,
    abilityScores: { method: STANDARD_ARRAY.method, scores: STANDARD_ARRAY.scores },
    rulesChoices: storedRules ?? { selections: {} },
    inventory: [],
    notes: null,
    health: null,
    spells: normalizeStoredSpellcasting(store.spellcasting)?.spells ?? [],
    expendedSlots: {},
    progression: progression ?? { classes: [{ classRef: selection.class, level: 1 }], feats: [] },
    feats: (progression?.feats ?? []).map((feat) => ({
      status: 'resolved' as const,
      entry: { ...(CATALOGUE.feats.find((candidate) => candidate.packageId === feat.featRef.packageId && candidate.slug === feat.featRef.slug)), rulesFacet: findRulesFacet('dnd5e.2024', 'feat', feat.featRef.slug) ?? undefined },
      choiceKey: feat.choiceKey
    })),
    resources: null,
    packs: []
  }
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  resetStore()
  mocks.getWorldRuntime.mockResolvedValue({ configured: true, ok: true, runtime: REAL_RUNTIME, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  mocks.getWorldContentCatalogue.mockResolvedValue(CATALOGUE)
  mocks.createEntityRecord.mockImplementation(async () => ({ id: store.createdEntityId }))
  mocks.dxFetch.mockImplementation(async (url: string, options?: { method?: string, body?: string }) => {
    if (url === '/items/block_instances' && options?.method === 'POST') {
      const body = JSON.parse(options.body!)
      if (body.block_key === 'catalogue_selection') store.catalogueSelection = persist(body.data)
      if (body.block_key === 'spellcasting') store.spellcasting = persist(body.data)
      return { data: {} }
    }
    return { data: [] }
  })
  mocks.saveCharacterAbilityScores.mockImplementation(async () => undefined)
  mocks.saveCharacterRulesChoices.mockImplementation(async (_id: unknown, choices: unknown) => { store.rulesChoices = persist(choices) })
  mocks.loadCharacterRulesChoices.mockImplementation(async () => normalizeStoredRulesChoices(store.rulesChoices))
  mocks.saveCharacterProgression.mockImplementation(async (_id: unknown, progression: unknown) => { store.progression = persist(progression); return progression })
  mocks.saveCharacterHealth.mockResolvedValue(undefined)
  mocks.getDerivedCharacter.mockResolvedValue({ available: false, reason: 'rules-unconfigured', message: 'no rules package' })
  mocks.assembleCharacter.mockImplementation(async (_world: unknown, characterId: unknown) => {
    if (!store.catalogueSelection) return { available: false, reason: 'no-catalogue-selection', message: 'no selection' }
    return { available: true, blueprint: blueprintFromStore(String(characterId)) }
  })
})

function expectNoWrites() {
  expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  expect(mocks.saveCharacterProgression).not.toHaveBeenCalled()
  expect(mocks.saveCharacterRulesChoices).not.toHaveBeenCalled()
  expect(mocks.saveCharacterHealth).not.toHaveBeenCalled()
}

// ---------------------------------------------------------------------------
// ACCEPTANCE -- Human + Fighter + Acolyte, through the REAL route and authority
// ---------------------------------------------------------------------------

describe('ACCEPTANCE -- Human + Fighter + Acolyte, two independent Magic Initiate acquisitions', () => {
  it('the real Phase-0 authority reports zero unresolved decisions for this combination', () => {
    expect(creationUnresolvedDecisions({ species: 'human-xphb', class: 'fighter-xphb', background: 'acolyte-xphb', feats: ['magic-initiate-xphb'] })).toEqual([])
  })

  it('creation succeeds through the real route with zero stubbing of the acquisition authority', async () => {
    const result = await postCreate(legalBody()) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('progression.feats[] holds TWO distinct Magic Initiate acquisitions under distinct choiceKeys', async () => {
    await postCreate(legalBody())
    const progression = normalizeStoredProgression(store.progression)!
    const magicInitiate = progression.feats.filter((feat) => feat.featRef.slug === 'magic-initiate-xphb')
    expect(magicInitiate).toHaveLength(2)
    expect(new Set(magicInitiate.map((feat) => feat.choiceKey)).size).toBe(2)
    expect(magicInitiate.map((feat) => feat.choiceKey).sort()).toEqual([ACOLYTE_ORIGIN_KEY, ORIGIN_SELECTION_KEY].sort())
  })
})

// ---------------------------------------------------------------------------
// PERSISTENCE / RELOAD
// ---------------------------------------------------------------------------

describe('PERSISTENCE -- independent ownership, provenance, and fresh reload', () => {
  it('rules_choices holds BOTH list answers: Acolyte\'s own PRESET (never submitted) and Human\'s own real submission', async () => {
    await postCreate(legalBody())
    const selections = normalizeStoredRulesChoices(store.rulesChoices)!.selections
    expect(selections[ACOLYTE_MI_LIST_KEY]).toEqual([CLERIC_LIST_VALUE])
    expect(selections[HUMAN_MI_LIST_KEY]).toEqual([WIZARD_LIST_VALUE])
  })

  it('spellcasting.spells[] carries independent, correctly-scoped requirementIds -- no duplicate physical row', async () => {
    await postCreate(legalBody())
    const persisted = normalizeStoredSpellcasting(store.spellcasting)!
    const expected = magicInitiateRequirements(CLERIC_LIST_VALUE, WIZARD_LIST_VALUE)
    const cantripIdAcolyte = expected.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.cleric.cantrip'))!.id
    const spellIdAcolyte = expected.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.cleric.spell'))!.id
    const cantripIdHuman = expected.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.wizard.cantrip'))!.id
    const spellIdHuman = expected.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.wizard.spell'))!.id
    // Instance-scoped: the two acquisitions' own list requirements never share an id.
    expect(new Set([cantripIdAcolyte, spellIdAcolyte, cantripIdHuman, spellIdHuman]).size).toBe(4)

    const bySlug = new Map(persisted.spells.map((row) => [row.ref?.slug, row]))
    expect(bySlug.get('cleric-cantrip-a')?.requirementIds).toContain(cantripIdAcolyte)
    expect(bySlug.get('cleric-spell-a')?.requirementIds).toContain(spellIdAcolyte)
    expect(bySlug.get('wizard-cantrip-a')?.requirementIds).toContain(cantripIdHuman)
    expect(bySlug.get('wizard-spell-a')?.requirementIds).toContain(spellIdHuman)
    // No duplicate physical row: exactly one row per distinct spell ref.
    expect(persisted.spells.map((row) => row.ref?.slug)).toHaveLength(new Set(persisted.spells.map((row) => row.ref?.slug)).size)
    expect(persisted.spells).toHaveLength(6) // 2 Cleric cantrips + 1 Cleric spell + 2 Wizard cantrips + 1 Wizard spell
  })

  it('FRESH RELOAD (resolveCurrentProgression, no request body, no tentative state) independently reproduces both acquisitions', async () => {
    await postCreate(legalBody())
    const current = await resolveCurrentProgression(WORLD_ID, String(store.createdEntityId))
    expect(current.ok).toBe(true)
    if (!current.ok) return

    const magicInitiate = current.state.progression.feats.filter((feat) => feat.featRef.slug === 'magic-initiate-xphb')
    expect(magicInitiate).toHaveLength(2)

    // Acolyte's own preset is RE-DERIVED fresh on this read (never physically re-written) and
    // merged into the effective selections `resolveCurrentProgression` itself builds.
    expect(current.state.rulesChoiceSelections[ACOLYTE_MI_LIST_KEY]).toEqual([CLERIC_LIST_VALUE])
    expect(current.state.rulesChoiceSelections[HUMAN_MI_LIST_KEY]).toEqual([WIZARD_LIST_VALUE])

    const requirements = gatherSpellRequirements(
      [
        { packageId: '', facet: current.state.speciesFacet, ownerKey: 'species' },
        { packageId: '', facet: current.state.classFacet, ownerKey: 'class' },
        { packageId: '', facet: current.state.backgroundFacet, ownerKey: 'background' },
        ...current.state.featFacets.map((f) => ({ packageId: '', facet: f.facet, ownerKey: `feat:${f.choiceKey}` }))
      ],
      current.state.rulesChoiceSelections
    )
    const clericIds = requirements.filter((r) => r.id.includes('.cleric.')).map((r) => r.id)
    const wizardIds = requirements.filter((r) => r.id.includes('.wizard.')).map((r) => r.id)
    expect(clericIds).toHaveLength(2)
    expect(wizardIds).toHaveLength(2)
    expect(new Set([...clericIds, ...wizardIds]).size).toBe(4)
  })

  it('REORDERING acquisition enumeration does not change persisted requirement identities (frequency-based, not order-based)', () => {
    const forward = magicInitiateRequirements(CLERIC_LIST_VALUE, WIZARD_LIST_VALUE)
    const facet = findRulesFacet('dnd5e.2024', 'feat', 'magic-initiate-xphb')!
    const reversed = gatherSpellRequirements(
      [
        { packageId: CONTENT_PACKAGE, facet, ownerKey: HUMAN_FEAT_OWNER_KEY },
        { packageId: CONTENT_PACKAGE, facet, ownerKey: ACOLYTE_FEAT_OWNER_KEY }
      ],
      { [ACOLYTE_MI_LIST_KEY]: [CLERIC_LIST_VALUE], [HUMAN_MI_LIST_KEY]: [WIZARD_LIST_VALUE] }
    )
    expect(new Set(forward.map((r) => r.id))).toEqual(new Set(reversed.map((r) => r.id)))
  })
})

// ---------------------------------------------------------------------------
// REJECTION MATRIX -- all seven cases, zero writes on every rejection
// ---------------------------------------------------------------------------

describe('REJECTION MATRIX -- through the real server authority, zero entity writes on every case', () => {
  it('1. Human chooses Cleric again (the SAME list Acolyte already fixes) -- rejected, must differ', async () => {
    const body = legalBody({ choices: { selections: { ...legalBody().choices.selections, [HUMAN_MI_LIST_KEY]: [CLERIC_LIST_VALUE] } } })
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('2. Human omits its own list choice entirely -- rejected (feat-owned choice must be answered)', async () => {
    const base = legalBody()
    const selections = { ...base.choices.selections } as Record<string, unknown>
    delete selections[HUMAN_MI_LIST_KEY]
    const body = { ...base, choices: { selections } }
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('must be answered') })
    expectNoWrites()
  })

  it('3. Human supplies an illegal list value (not one of the three real options) -- rejected', async () => {
    const base = legalBody()
    const body = { ...base, choices: { selections: { ...base.choices.selections, [HUMAN_MI_LIST_KEY]: ['value:size.medium'] } } }
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('4. Human supplies a crafted, undeclared nested-choice key -- rejected', async () => {
    const base = legalBody()
    const crafted = `${HUMAN_FEAT_OWNER_KEY}:choice:not-a-real-choice`
    const body = { ...base, choices: { selections: { ...base.choices.selections, [crafted]: ['value:magic-initiate.list.1.active'] } } }
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('declares no choice') })
    expectNoWrites()
  })

  it('5. Human submits a valid Wizard list but an invalid (Cleric) spell for its own Wizard requirement -- rejected', async () => {
    const requirements = magicInitiateRequirements(CLERIC_LIST_VALUE, WIZARD_LIST_VALUE)
    const humanCantripId = requirements.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.wizard.cantrip'))!.id
    const humanSpellId = requirements.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.wizard.spell'))!.id
    const badSpellSelections = [
      ...acolyteSpellSelections(requirements),
      { requirementId: humanCantripId, ref: ref('cleric-cantrip-a') }, // wrong list entirely
      { requirementId: humanSpellId, ref: ref(WIZARD_SPELL.slug) }
    ]
    const body = legalBody({ spellSelections: badSpellSelections })
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('6. Human attempts to satisfy its own Wizard requirements using Acolyte\'s Cleric requirementId -- rejected, Wizard pool stays unmet', async () => {
    const requirements = magicInitiateRequirements(CLERIC_LIST_VALUE, WIZARD_LIST_VALUE)
    const acolyteCantripId = requirements.find((r) => r.id.startsWith('spell-requirement.magic-initiate-xphb.cleric.cantrip'))!.id
    // Submit Human's own Wizard spells, but tagged under Acolyte's OWN requirement id -- an
    // attempt to cross-wire ownership. Human's own Wizard requirement id never receives an
    // answer, so its own pool remains unsatisfied.
    const crossWiredSelections = [
      ...acolyteSpellSelections(requirements),
      { requirementId: acolyteCantripId, ref: ref('wizard-cantrip-a') }
    ]
    const body = legalBody({ spellSelections: crossWiredSelections })
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('7. A non-repeatable Origin feat (Alert) acquired twice -- Criminal\'s own fixed grant AND Human\'s Versatile pick -- rejected', async () => {
    const base = legalBody({ background: ref('criminal-xphb') })
    const body = {
      ...base,
      choices: { selections: Object.fromEntries(Object.entries(base.choices.selections).filter(([key]) => key !== BACKGROUND_ABILITY_KEY && key !== HUMAN_MI_LIST_KEY)) },
      contentChoices: { ...base.contentChoices, [ORIGIN_SELECTION_KEY]: [serializeContentRef(ref('alert-xphb'))] },
      spellSelections: [],
      startingEquipment: { 'choice:equipment.starting.fighter-xphb': 'C', 'choice:equipment.starting.criminal-xphb': 'B' }
    }
    await expect(postCreate(body)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })
})

// ---------------------------------------------------------------------------
// BUILDER-SHAPED ACCEPTANCE -- constructed through the real generic Builder helpers
// ---------------------------------------------------------------------------

describe('BUILDER-SHAPED ACCEPTANCE -- real Builder state/payload helpers, not a hand-written body', () => {
  function builderContext(): BuilderCreationContext {
    const definitionFor = (choiceSetId: string) => {
      const definition = REAL_RUNTIME.registry.getById(choiceSetId) as any
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
      feats: FEATS as unknown as BuilderCreationContext['feats'],
      spells: SPELLS as unknown as BuilderCreationContext['spells'],
      items: WEAPONS as unknown as BuilderCreationContext['items']
    }
  }

  function builderDraft() {
    const draft = emptyDraft()
    draft.name = 'Elanna'
    draft.species = HUMAN as unknown as BuilderCatalogueEntry
    draft.class = FIGHTER as unknown as BuilderCatalogueEntry
    draft.background = ACOLYTE as unknown as BuilderCatalogueEntry
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    return draft
  }

  it('Acolyte\'s own Magic Initiate list choice is PRESET, never presented as an outstanding question', () => {
    const context = builderContext()
    const draft = builderDraft()
    const presentations = creationChoicePresentation(draft, context)
    const acolyteList = presentations.find((p) => p.key === ACOLYTE_MI_LIST_KEY)
    expect(acolyteList, 'Acolyte\'s own list choice must be discoverable (preset, not absent)').toBeDefined()
    expect(acolyteList!.answered).toBe(true)
    expect(acolyteList!.selected).toEqual([CLERIC_LIST_VALUE])
  })

  it('Human\'s freely-chosen Magic Initiate exposes its OWN live Wizard list choice and nested Wizard spell requirements, once selected', () => {
    const context = builderContext()
    const draft = builderDraft()
    setContentChoiceSelections(draft, ORIGIN_SELECTION_KEY, [serializeContentRef({ packageId: CONTENT_PACKAGE, slug: 'magic-initiate-xphb' })], context)

    const beforeListAnswer = creationChoicePresentation(draft, context).find((p) => p.key === HUMAN_MI_LIST_KEY)
    expect(beforeListAnswer, 'Human\'s own list choice must be discoverable once the feat is selected').toBeDefined()
    expect(beforeListAnswer!.answered).toBe(false)

    setChoiceSelections(draft, HUMAN_MI_LIST_KEY, [WIZARD_LIST_VALUE], context)
    const afterListAnswer = creationChoicePresentation(draft, context).find((p) => p.key === HUMAN_MI_LIST_KEY)
    expect(afterListAnswer!.answered).toBe(true)

    const requirements = spellRequirementsFor(draft, context)
    expect(requirements.some((r) => r.id.includes('.wizard.cantrip'))).toBe(true)
    expect(requirements.some((r) => r.id.includes('.wizard.spell'))).toBe(true)
    // Druid's own requirements (the unselected third list) never appear -- the gate is genuinely
    // owner-scoped, not merely "any list chosen anywhere".
    expect(requirements.some((r) => r.id.includes('.druid.'))).toBe(false)
  })

  it('the real Builder payload succeeds through the real route with two independent acquisitions', async () => {
    const context = builderContext()
    const draft = builderDraft()
    setChoiceSelections(draft, SIZE_KEY, ['value:size.medium'], context)
    setChoiceSelections(draft, SPECIES_SKILL_KEY, ['value:skill.arcana.proficient'], context)
    setChoiceSelections(draft, CLASS_SKILL_KEY, ['value:skill.athletics.proficient', 'value:skill.perception.proficient'], context)
    setChoiceSelections(draft, BACKGROUND_ABILITY_KEY, ['source:background.increase.int', 'source:background.increase.int', 'source:background.increase.wis'], context)
    setContentChoiceSelections(draft, FS_KEY, [serializeContentRef(archery)], context)
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, WEAPONS.map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug })), context)
    setContentChoiceSelections(draft, ORIGIN_SELECTION_KEY, [serializeContentRef({ packageId: CONTENT_PACKAGE, slug: 'magic-initiate-xphb' })], context)
    setChoiceSelections(draft, HUMAN_MI_LIST_KEY, [WIZARD_LIST_VALUE], context)
    setEquipmentSelection(draft, 'choice:equipment.starting.fighter-xphb', 'C')
    setEquipmentSelection(draft, 'choice:equipment.starting.acolyte-xphb', 'B')

    const requirements = spellRequirementsFor(draft, context)
    for (const requirement of requirements) {
      const cantrip = requirement.id.includes('.cleric.cantrip') || requirement.id.includes('.wizard.cantrip')
      const list = requirement.id.includes('.cleric.') ? CLERIC_CANTRIPS.map((s) => s.slug) : WIZARD_CANTRIPS.map((s) => s.slug)
      const refs = cantrip ? list : [requirement.id.includes('.cleric.') ? CLERIC_SPELL.slug : WIZARD_SPELL.slug]
      setSpellSelections(draft, requirement.id, refs.map((slug) => serializeContentRef(ref(slug))))
    }

    expect(isDraftComplete(draft, context)).toBe(true)
    const payload = toCreatePayload(draft, context)!
    expect(payload).not.toBeNull()
    expect(payload.contentChoices[ORIGIN_SELECTION_KEY]).toEqual([serializeContentRef({ packageId: CONTENT_PACKAGE, slug: 'magic-initiate-xphb' })])
    expect(payload.choices.selections[HUMAN_MI_LIST_KEY]).toEqual([WIZARD_LIST_VALUE])
    // `pruneChoices` (the Builder's own established "keep the draft in sync with every currently-
    // live, answered presentation" rule, unchanged by this phase) writes Acolyte's own PRESET
    // answer back into the draft once it is discovered as `answered`, the SAME as it would any
    // other already-satisfied choice -- never a player action, and never a DIFFERENT value than
    // the preset itself, so submitting it changes nothing server-side (the server's own
    // preset-vs-submitted merge is idempotent whenever they agree). What must hold is that the
    // value is exactly the preset's own value, never something the player could have altered.
    if (ACOLYTE_MI_LIST_KEY in payload.choices.selections) {
      expect(payload.choices.selections[ACOLYTE_MI_LIST_KEY]).toEqual([CLERIC_LIST_VALUE])
    }

    const result = await postCreate(payload) as any
    expect(result.id).toBe(store.createdEntityId)
    const progression = normalizeStoredProgression(store.progression)!
    expect(progression.feats.filter((feat) => feat.featRef.slug === 'magic-initiate-xphb')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// HISTORICAL REGRESSION -- a pre-phase Acolyte character, no migration, no retroactive write
// ---------------------------------------------------------------------------

describe('HISTORICAL -- a pre-phase Acolyte character (no list answer ever persisted) continues loading', () => {
  it('a historical Acolyte character (single acquisition, PLAIN unscoped requirement ids) loads unchanged and keeps its spells', async () => {
    // Exactly what a character created BEFORE this phase has on disk: progression.feats[] names
    // the Background-fixed acquisition by its OWN canonical choiceKey; rules_choices has NO entry
    // for the list choice at all (it never existed before this phase); spellcasting.spells[] was
    // written with the OLD, plain (unscoped) requirement ids, since only one acquisition ever
    // existed on this character.
    store.catalogueSelection = { species: { packageId: CONTENT_PACKAGE, slug: 'human-xphb' }, class: { packageId: CONTENT_PACKAGE, slug: 'fighter-xphb' }, background: { packageId: CONTENT_PACKAGE, slug: 'acolyte-xphb' } }
    store.progression = { classes: [{ classRef: { packageId: CONTENT_PACKAGE, slug: 'fighter-xphb' }, level: 1 }], feats: [{ featRef: { packageId: CONTENT_PACKAGE, slug: 'magic-initiate-xphb' }, choiceKey: ACOLYTE_ORIGIN_KEY }] }
    store.rulesChoices = { selections: {} }
    store.spellcasting = {
      spells: [
        { instanceId: 'a', ref: ref('cleric-cantrip-a'), known: true, prepared: false, requirementIds: ['spell-requirement.magic-initiate-xphb.cleric.cantrip'] },
        { instanceId: 'b', ref: ref('cleric-cantrip-b'), known: true, prepared: false, requirementIds: ['spell-requirement.magic-initiate-xphb.cleric.cantrip'] },
        { instanceId: 'c', ref: ref('cleric-spell-a'), known: false, prepared: true, requirementIds: ['spell-requirement.magic-initiate-xphb.cleric.spell'] }
      ]
    }

    const current = await resolveCurrentProgression(WORLD_ID, '1234')
    expect(current.ok).toBe(true)
    if (!current.ok) return

    // No migration, no retroactive write: resetStore()/saveX mocks were never called by this read.
    expect(mocks.saveCharacterProgression).not.toHaveBeenCalled()
    expect(mocks.saveCharacterRulesChoices).not.toHaveBeenCalled()

    // The preset is re-derived fresh -- NOT because anything was migrated, but because it was
    // ALWAYS re-derived from the Background's own CURRENT facet, exactly as before this phase.
    expect(current.state.rulesChoiceSelections[ACOLYTE_MI_LIST_KEY]).toEqual([CLERIC_LIST_VALUE])

    // Single acquisition -> count 1 -> the SAME plain, unscoped ids as before this phase, so the
    // historically-persisted requirementIds still match on reload.
    const requirements = gatherSpellRequirements(
      [{ packageId: '', facet: current.state.backgroundFacet, ownerKey: 'background' }, ...current.state.featFacets.map((f) => ({ packageId: '', facet: f.facet, ownerKey: `feat:${f.choiceKey}` }))],
      current.state.rulesChoiceSelections
    )
    const cantripId = requirements.find((r) => r.id.includes('.cleric.cantrip'))!.id
    const spellId = requirements.find((r) => r.id.includes('.cleric.spell'))!.id
    expect(cantripId).toBe('spell-requirement.magic-initiate-xphb.cleric.cantrip')
    expect(spellId).toBe('spell-requirement.magic-initiate-xphb.cleric.spell')

    const persistedSpells = normalizeStoredSpellcasting(store.spellcasting)!.spells
    expect(persistedSpells).toHaveLength(3)
    for (const row of persistedSpells.filter((r) => r.ref?.slug?.startsWith('cleric-cantrip'))) {
      expect(row.requirementIds).toContain(cantripId)
    }
  })
})
