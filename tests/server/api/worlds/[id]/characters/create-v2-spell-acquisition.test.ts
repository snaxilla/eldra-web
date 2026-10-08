// D&D 2024 Character Rules P3.3 -- V2 CREATION SPELL ACQUISITION, end to end through the REAL
// create-v2 POST route. UNIT-ISOLATION (completeness stubbed, classified in
// tests/rules/completeness-stub-policy.test.ts): equipment and other unrelated Phase-0 blockers
// are not what this file proves, so it stubs the completeness authority -- exactly like
// create-v2-fighter-mechanics.test.ts already does for the SAME reason. What is REAL here: the
// route's own validation/authority/write-order, the real Dnd5e 2024 Rules Package and its registry
// (for the real Level-1 slot derivation), and the real `planSpellAcquisition`/`validateSpellRequirements`
// authority. The Directus boundary is a small in-memory store capturing exactly what the handler
// writes, keyed by block_key -- never a second, independently-maintained persistence model.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../../app/lib/content-rules/creation-completeness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../app/lib/content-rules/creation-completeness')>()),
  ...(await import('../../../../../helpers/completeness-stub')).MECHANICS_ONLY_COMPLETENESS
}))
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  catalogueSelection: null as null | Record<string, unknown>,
  progression: null as null | Record<string, unknown>,
  spellcasting: null as null | Record<string, unknown>,
  createdEntityId: 9001
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
import { normalizeStoredSpellcasting } from '../../../../../../app/lib/characters/spellcasting'
import { validateSpellRequirements, spellIdentityOf } from '../../../../../../app/lib/characters/spell-requirements'
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import { progressionChoiceKey } from '../../../../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../../../../app/lib/characters/progression-plan'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
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
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  const result = createWorldRuntime(manifest, definitions, WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function persist(value: unknown) {
  return JSON.parse(JSON.stringify(value))
}

function entry(overrides: Record<string, unknown>) {
  return { packageId: PKG, packageVersion: '1.0.10', systemKey: 'dnd5e', externalId: `${overrides.title}__XPHB`, provider: '5etools-json', ...overrides }
}

const HUMAN = entry({ title: 'Human', slug: 'human-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'human-xphb') ?? undefined })
const ACOLYTE_UNBLOCKED = (() => {
  const facet = findRulesFacet('dnd5e.2024', 'background', 'soldier-xphb') ?? undefined
  return entry({ title: 'Soldier', slug: 'soldier-xphb', rulesFacet: facet })
})()

function classEntry(slug: string, title: string) {
  return entry({ title, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', slug) ?? undefined })
}

// Every real XPHB feat, resolved the same way create-v2-fail-closed.test.ts's own fixture does --
// needed so Soldier's fixed Origin Feat (and Fighter's Fighting Style content choice, used in the
// non-caster regression below) can actually resolve, instead of a 500 "illegal" from an
// unresolvable Origin feat declaration this file never meant to exercise.
const FEATS = xphbFeats.feats.map((raw: { name: string }) => {
  const slug = `${raw.name.toLowerCase().replace(/ /g, '-')}-xphb`
  return { ...entry({ title: raw.name, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined }), featMechanics: resolveDnd5eFeatMechanics(raw) }
})
const FS_ONLY_KEY = progressionChoiceKey('class', 1, 'choice:feat.fighting-style.fs-only')
const ARCHERY = { packageId: PKG, slug: 'archery-xphb' }

const CLASSES = {
  bard: classEntry('bard-xphb', 'Bard'),
  cleric: classEntry('cleric-xphb', 'Cleric'),
  wizard: classEntry('wizard-xphb', 'Wizard'),
  paladin: classEntry('paladin-xphb', 'Paladin'),
  warlock: classEntry('warlock-xphb', 'Warlock')
}

function spellEntry(slug: string, level: number, classLists: string[], title = slug) {
  return { packageId: PKG, slug, title, spellMechanics: { level, concentration: false, ritual: false, resolution: null, classLists } }
}

// A generous, real-shaped synthetic spell catalogue covering every class exercised below -- real
// requirement ids (derived per-test from the real facet), synthetic spell identities (no real
// catalogue of 5etools spell data is needed to prove the MECHANISM).
const SPELLS = [
  ...[...'abcdefgh'].map((s) => spellEntry(`bard-${s}`, 1, ['Bard'])),
  ...[...'xy'].map((s) => spellEntry(`bard-cantrip-${s}`, 0, ['Bard'])),
  ...[...'abcdefgh'].map((s) => spellEntry(`cleric-${s}`, 1, ['Cleric'])),
  ...[...'xyz'].map((s) => spellEntry(`cleric-cantrip-${s}`, 0, ['Cleric'])),
  ...[...'abcdefgh'].map((s) => spellEntry(`wiz-${s}`, 1, ['Wizard'])),
  ...[...'xyz'].map((s) => spellEntry(`wiz-cantrip-${s}`, 0, ['Wizard'])),
  ...[...'ab'].map((s) => spellEntry(`pal-${s}`, 1, ['Paladin'])),
  ...[...'ab'].map((s) => spellEntry(`lock-${s}`, 1, ['Warlock'])),
  ...[...'xy'].map((s) => spellEntry(`lock-cantrip-${s}`, 0, ['Warlock'])),
  spellEntry('wrong-class', 1, ['Cleric']), // for the wrong-class-list rejection case
  spellEntry('too-high', 3, ['Bard']) // for the wrong-level rejection case
]

function catalogueWith(classSlugs: readonly (keyof typeof CLASSES)[]) {
  return {
    worldId: WORLD_ID, packs: [],
    species: [HUMAN],
    classes: classSlugs.map((slug) => CLASSES[slug]),
    backgrounds: [ACOLYTE_UNBLOCKED],
    feats: FEATS, subclasses: [], items: [], monsters: [],
    spells: SPELLS
  }
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }
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

function bodyWith(classSlug: string, spellSelections: unknown, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Elowen',
    species: ref('human-xphb'),
    class: ref(classSlug),
    background: ref('soldier-xphb'),
    abilities: STANDARD_ARRAY,
    spellSelections,
    ...overrides
  }
}

function requirementsFor(slug: string) {
  return findRulesFacet('dnd5e.2024', 'class', slug)!.spellRequirements!
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  store.catalogueSelection = null
  store.progression = null
  store.spellcasting = null

  const runtime = loadRealRuntime()
  mocks.getWorldRuntime.mockResolvedValue({ configured: true, ok: true, runtime, integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  mocks.createEntityRecord.mockImplementation(async () => ({ id: store.createdEntityId }))
  mocks.saveCharacterProgression.mockImplementation(async (_id: unknown, data: unknown) => { store.progression = persist(data) })
  mocks.saveCharacterAbilityScores.mockImplementation(async (_id: unknown, data: unknown) => data)
  mocks.getDerivedCharacter.mockResolvedValue({ available: false, reason: 'rules-unconfigured', message: 'no rules package' })

  mocks.dxFetch.mockImplementation(async (url: string, options?: { method?: string, body?: string }) => {
    if (url === '/items/block_instances' && options?.method === 'POST') {
      const body = JSON.parse(options.body!)
      if (body.block_key === 'catalogue_selection') store.catalogueSelection = persist(body.data)
      if (body.block_key === 'spellcasting') store.spellcasting = persist(body.data)
      return { data: {} }
    }
    // Existing-row lookups (spellcasting's own find-before-write) -- no existing row at creation.
    return { data: [] }
  })
})

async function postCreate(body: unknown) {
  return handler(fakeEvent(body) as any)
}

// ---------------------------------------------------------------------------
// SUCCESS MATRIX
// ---------------------------------------------------------------------------
describe('P3.3 SUCCESS MATRIX -- real facets, real planner, real write-through', () => {
  beforeEach(() => {
    mocks.getWorldContentCatalogue.mockResolvedValue(catalogueWith(['bard', 'cleric', 'wizard', 'paladin', 'warlock']))
  })

  it('A. cantrip + ordinary caster (Bard): creation succeeds, canonical spellcasting written with real requirementIds', async () => {
    const requirements = requirementsFor('bard-xphb')
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripTarget = requirements.find((r) => r.pool === 'cantrip')!.totalByLevel[0]!
    const spellTarget = requirements.find((r) => r.pool === 'spell')!.totalByLevel[0]!

    const spellSelections = [
      ...[...'xy'].slice(0, cantripTarget).map((s) => ({ requirementId: cantripId, ref: ref(`bard-cantrip-${s}`) })),
      ...[...'abcdefgh'].slice(0, spellTarget).map((s) => ({ requirementId: spellId, ref: ref(`bard-${s}`) }))
    ]

    const result = await postCreate(bodyWith('bard-xphb', spellSelections))
    expect(result.id).toBe(store.createdEntityId)
    expect(store.spellcasting).not.toBeNull()
    expect((store.spellcasting as any).spells).toHaveLength(cantripTarget + spellTarget)
    for (const row of (store.spellcasting as any).spells) expect(row.requirementIds?.length).toBeGreaterThan(0)
  })

  it('B. prepared caster (Cleric): creation succeeds with real cantrip + prepared targets', async () => {
    const requirements = requirementsFor('cleric-xphb')
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripTarget = requirements.find((r) => r.pool === 'cantrip')!.totalByLevel[0]!
    const spellTarget = requirements.find((r) => r.pool === 'spell')!.totalByLevel[0]!

    const spellSelections = [
      ...[...'xyz'].slice(0, cantripTarget).map((s) => ({ requirementId: cantripId, ref: ref(`cleric-cantrip-${s}`) })),
      ...[...'abcdefgh'].slice(0, spellTarget).map((s) => ({ requirementId: spellId, ref: ref(`cleric-${s}`) }))
    ]

    const result = await postCreate(bodyWith('cleric-xphb', spellSelections))
    expect(result.id).toBe(store.createdEntityId)
    expect((store.spellcasting as any).spells).toHaveLength(cantripTarget + spellTarget)
  })

  it('C. Wizard: spellbook -> prepared dependency resolves in one submission, canonical merged row proof', async () => {
    const requirements = requirementsFor('wizard-xphb')
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id

    const spellSelections = [
      ...[...'abcdef'].map((s) => ({ requirementId: spellbookId, ref: ref(`wiz-${s}`) })),
      ...[...'abcd'].map((s) => ({ requirementId: spellId, ref: ref(`wiz-${s}`) })),
      ...[...'xyz'].map((s) => ({ requirementId: cantripId, ref: ref(`wiz-cantrip-${s}`) }))
    ]

    const result = await postCreate(bodyWith('wizard-xphb', spellSelections))
    expect(result.id).toBe(store.createdEntityId)

    const spells = (store.spellcasting as any).spells
    expect(spells).toHaveLength(9) // 6 spellbook + 3 cantrip -- 4 of the 6 merge into the SAME row as prepared
    const mergedRow = spells.find((s: any) => s.ref?.slug === 'wiz-a')
    expect(mergedRow.known).toBe(true)
    expect(mergedRow.prepared).toBe(true)
    expect(mergedRow.requirementIds).toEqual(expect.arrayContaining([spellbookId, spellId]))
  })

  it('D. half caster (Paladin) at Level 1: legal maximum spell level is 1 via the real corrected slot table (Rules 0.21.0)', async () => {
    const requirements = requirementsFor('paladin-xphb')
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const spellTarget = requirements.find((r) => r.pool === 'spell')!.totalByLevel[0]!
    expect(spellTarget).toBeGreaterThan(0) // 2024 RAW: Paladin prepares spells starting at Level 1

    const spellSelections = [...'ab'].slice(0, spellTarget).map((s) => ({ requirementId: spellId, ref: ref(`pal-${s}`) }))
    const result = await postCreate(bodyWith('paladin-xphb', spellSelections))
    expect(result.id).toBe(store.createdEntityId)
    expect((store.spellcasting as any).spells).toHaveLength(spellTarget)
  })

  it('E. Warlock: ordinary Level-1 pools succeed; no Mystic Arcanum selection is required or offered', async () => {
    const requirements = requirementsFor('warlock-xphb')
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const arcanum6Target = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 6)!.totalByLevel[0]!
    expect(arcanum6Target).toBe(0) // Mystic Arcanum is not reachable at Level 1

    const cantripTarget = requirements.find((r) => r.pool === 'cantrip')!.totalByLevel[0]!
    const spellTarget = requirements.find((r) => r.pool === 'spell')!.totalByLevel[0]!
    const spellSelections = [
      ...[...'xy'].slice(0, cantripTarget).map((s) => ({ requirementId: cantripId, ref: ref(`lock-cantrip-${s}`) })),
      ...[...'ab'].slice(0, spellTarget).map((s) => ({ requirementId: spellId, ref: ref(`lock-${s}`) }))
    ]

    const result = await postCreate(bodyWith('warlock-xphb', spellSelections))
    expect(result.id).toBe(store.createdEntityId)
    expect((store.spellcasting as any).spells).toHaveLength(cantripTarget + spellTarget)
  })
})

// ---------------------------------------------------------------------------
// FRESH-RELOAD ROUND TRIP
// ---------------------------------------------------------------------------
describe('P3.3 ROUND TRIP -- fresh persisted read, no Builder/tentative state involved', () => {
  it('Wizard: the PERSISTED spellcasting write alone (independently re-validated) satisfies validateSpellRequirements', async () => {
    mocks.getWorldContentCatalogue.mockResolvedValue(catalogueWith(['wizard']))
    const requirements = requirementsFor('wizard-xphb')
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id

    const spellSelections = [
      ...[...'abcdef'].map((s) => ({ requirementId: spellbookId, ref: ref(`wiz-${s}`) })),
      ...[...'abcd'].map((s) => ({ requirementId: spellId, ref: ref(`wiz-${s}`) })),
      ...[...'xyz'].map((s) => ({ requirementId: cantripId, ref: ref(`wiz-cantrip-${s}`) }))
    ]
    await postCreate(bodyWith('wizard-xphb', spellSelections))

    // A FRESH read: normalize exactly what was persisted, resolve against the catalogue, and
    // validate -- no reference to `spellSelections`, the Builder, or any tentative state.
    const persisted = normalizeStoredSpellcasting(store.spellcasting)!
    const catalogueByRef = new Map(SPELLS.map((entry) => [`${entry.packageId}::${entry.slug}`, entry]))
    const candidates = persisted.spells.map((entry) => ({
      identity: spellIdentityOf(entry),
      known: entry.known,
      prepared: entry.prepared,
      mechanics: catalogueByRef.get(`${entry.ref!.packageId}::${entry.ref!.slug}`)?.spellMechanics ?? null,
      ...(entry.requirementIds ? { requirementIds: entry.requirementIds } : {})
    }))

    const results = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: [{ level: 1, max: 2, expended: 0 }], candidates })
    expect(results.every((r) => r.satisfied)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SERVER REJECTION MATRIX -- every case refused BEFORE createEntityRecord, zero writes
// ---------------------------------------------------------------------------
describe('P3.3 SERVER REJECTION MATRIX -- zero writes on any rejection', () => {
  beforeEach(() => {
    mocks.getWorldContentCatalogue.mockResolvedValue(catalogueWith(['bard', 'cleric', 'wizard', 'paladin', 'warlock']))
  })

  function expectNoWrites() {
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  }

  it('1. missing required spell selection (empty answer)', async () => {
    await expect(postCreate(bodyWith('bard-xphb', []))).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('2. unknown requirement id', async () => {
    await expect(postCreate(bodyWith('bard-xphb', [{ requirementId: 'spell-requirement.bogus', ref: ref('bard-a') }])))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('3. unknown spell ref (not in the World catalogue)', async () => {
    const spellId = requirementsFor('bard-xphb').find((r) => r.pool === 'spell')!.id
    await expect(postCreate(bodyWith('bard-xphb', [{ requirementId: spellId, ref: ref('does-not-exist') }])))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('4. wrong package (ref names a packageId not in this World\'s catalogue)', async () => {
    const spellId = requirementsFor('bard-xphb').find((r) => r.pool === 'spell')!.id
    await expect(postCreate(bodyWith('bard-xphb', [{ requirementId: spellId, ref: { packageId: 'eldra.other.pack', slug: 'bard-a' } }])))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('5. wrong class list (a Cleric-list spell submitted for Bard)', async () => {
    const spellId = requirementsFor('bard-xphb').find((r) => r.pool === 'spell')!.id
    await expect(postCreate(bodyWith('bard-xphb', [{ requirementId: spellId, ref: ref('wrong-class') }])))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('6. wrong spell level (above the legal maximum at Level 1)', async () => {
    const spellId = requirementsFor('bard-xphb').find((r) => r.pool === 'spell')!.id
    await expect(postCreate(bodyWith('bard-xphb', [{ requirementId: spellId, ref: ref('too-high') }])))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('7. duplicate same-requirement spell', async () => {
    const spellId = requirementsFor('bard-xphb').find((r) => r.pool === 'spell')!.id
    await expect(postCreate(bodyWith('bard-xphb', [
      { requirementId: spellId, ref: ref('bard-a') },
      { requirementId: spellId, ref: ref('bard-a') }
    ]))).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('8. Wizard prepared spell not in the effective spellbook', async () => {
    const requirements = requirementsFor('wizard-xphb')
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    await expect(postCreate(bodyWith('wizard-xphb', [
      ...[...'abcdef'].map((s) => ({ requirementId: spellbookId, ref: ref(`wiz-${s}`) })),
      { requirementId: spellId, ref: ref('wiz-g') } // never added to the spellbook
    ]))).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('9. extra selection beyond target (over-count)', async () => {
    // The ordinary pool has 8 distinct real options -- enough to submit one MORE than the real
    // Level-1 target and still be distinct, legal spells individually (the over-count issue, not
    // a duplicate or wrong-class/level issue).
    const spellId = requirementsFor('bard-xphb').find((r) => r.pool === 'spell')!.id
    const spellTarget = requirementsFor('bard-xphb').find((r) => r.pool === 'spell')!.totalByLevel[0]!
    const overCount = [...'abcdefgh'].slice(0, spellTarget + 1).map((s) => ({ requirementId: spellId, ref: ref(`bard-${s}`) }))
    await expect(postCreate(bodyWith('bard-xphb', overCount))).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('10. malformed requirement dependency (requiresMembershipPool pointing at an unknown id) -- injected via a crafted facet', async () => {
    const brokenFacet = {
      ...CLASSES.wizard.rulesFacet,
      spellRequirements: [
        { id: 'req.broken', pool: 'spell' as const, filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.does-not-exist' }
      ]
    }
    mocks.getWorldContentCatalogue.mockResolvedValue({
      ...catalogueWith(['wizard']),
      classes: [{ ...CLASSES.wizard, rulesFacet: brokenFacet }]
    })
    await expect(postCreate(bodyWith('wizard-xphb', [{ requirementId: 'req.broken', ref: ref('wiz-a') }])))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('malformed spellSelections shape is rejected before any write', async () => {
    await expect(postCreate(bodyWith('bard-xphb', 'not-an-array'))).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('a non-caster class (no spellRequirements) requires no spellSelections and writes no spellcasting block at all', async () => {
    mocks.getWorldContentCatalogue.mockResolvedValue({ ...catalogueWith(['wizard']), classes: [classEntry('fighter-xphb', 'Fighter')] })
    const result = await postCreate(bodyWith('fighter-xphb', undefined, { contentChoices: { [FS_ONLY_KEY]: [serializeContentRef(ARCHERY)] } }))
    expect(result.id).toBe(store.createdEntityId)
    expect(store.spellcasting).toBeNull() // no unnecessary write
  })
})
