// D&D 2024 Character Rules -- WEAPON MASTERY FIRST NEW CLASSES, end to end through the REAL
// create-v2 POST route and the REAL fail-closed completeness authority. UNSTUBBED (see
// tests/rules/completeness-stub-policy.test.ts's own ACCEPTANCE category): this file makes the
// production claim that Dwarf + Barbarian/Fighter/Paladin/Ranger + Criminal are all genuinely
// creatable combinations now that Weapon Mastery is authored, mirroring create-v2-feature-
// option.test.ts's own harness shape exactly.
//
// What this file proves:
//   1. creationUnresolvedDecisions is [] for all four combinations, through the REAL authority.
//   2. The real POST route accepts a full real answer set (including the new Weapon Mastery
//      content choice) and succeeds, for all four classes.
//   3. The selected weapons are persisted as provenance through progression.items[] (never
//      inventory, never a new block) and independently resolve their own authored mastery
//      property through the real catalogue -- never merely a stored label.
//   4. A Builder-shaped payload (built via emptyDraft/setContentChoiceSelections/toCreatePayload,
//      never a hand-written body) meets the same real server authority.
//   5. Creation-time CLASS SWITCHING revalidates the Weapon Mastery answer correctly: switching
//      away from Fighter (to a class with no such choice, or to Barbarian -- a DIFFERENT
//      ChoiceSet id, `.melee-only`) makes the stale answer non-live, never silently satisfying a
//      different class's own ownership.
//   6. Coexistence: Fighter's own Fighting Style choice and Paladin's/Ranger's own Level-1 spell
//      acquisition both continue to work correctly alongside Weapon Mastery.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  progression: null as null | Record<string, unknown>,
  spellcasting: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
  currency: null as null | Record<string, unknown>,
  createdEntityId: 9303
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
import { resolveDnd5eItemMechanics } from '../../../../../../app/lib/item-mechanics/dnd5e'
import { resolveDnd5eSpellMechanics } from '../../../../../../app/lib/spell-mechanics/dnd5e'
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'
import { choiceKey, progressionChoiceKey } from '../../../../../../app/lib/characters/rules-choices'
import { normalizeStoredProgression, acquiredItemsFor } from '../../../../../../app/lib/characters/progression'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import {
  emptyDraft,
  isDraftComplete,
  setChoiceSelections,
  setContentChoiceSelections,
  setEquipmentSelection,
  setSpellSelections,
  toCreatePayload,
  creationContentPresentation,
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
  return { packageId: PKG, packageVersion: '1.0.21', systemKey: 'dnd5e', externalId: `${overrides.title}__XPHB`, provider: '5etools-json', ...overrides }
}

const DWARF = entry({ title: 'Dwarf', slug: 'dwarf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'dwarf-xphb') ?? undefined })
const BARBARIAN = entry({ title: 'Barbarian', slug: 'barbarian-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined })
const FIGHTER = entry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })
const PALADIN = entry({ title: 'Paladin', slug: 'paladin-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'paladin-xphb') ?? undefined })
const RANGER = entry({ title: 'Ranger', slug: 'ranger-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb') ?? undefined })
const BARD = entry({ title: 'Bard', slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })

function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...entry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
// Six distinct, real-shaped, all-MELEE weapons -- enough for Fighter's own creation count of 3
// and Barbarian's own melee-only count of 2, drawn from the SAME shared catalogue.
const WEAPONS = [
  weaponEntry('Dagger', 'dagger-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB', 'T|XPHB'], mastery: ['Nick|XPHB'] }),
  weaponEntry('Club', 'club-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['L|XPHB'], mastery: ['Slow|XPHB'] }),
  weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Warhammer', 'warhammer-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Push|XPHB'] }),
  weaponEntry('Battleaxe', 'battleaxe-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Topple|XPHB'] }),
  weaponEntry('Greataxe', 'greataxe-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['H|XPHB', '2H|XPHB'], mastery: ['Cleave|XPHB'] })
]

function spellEntry(slug: string, level: number, classLists: string[]) {
  return { packageId: PKG, slug, title: slug, spellMechanics: resolveDnd5eSpellMechanics({ name: slug, source: 'XPHB', level, school: 'V', classLists })! }
}
const SPELLS = [
  ...[...'ab'].map((s) => spellEntry(`pal-${s}`, 1, ['Paladin'])),
  ...[...'ab'].map((s) => spellEntry(`rgr-${s}`, 1, ['Ranger']))
]

// Every real XPHB feat, resolved the same way create-v2-fighter-mechanics.test.ts's own fixture
// does -- needed so Criminal's own fixed Origin Feat (Alert) and Fighter's own Fighting Style
// content choice (Archery) can actually resolve.
const FEATS = xphbFeats.feats.map((raw: { name: string }) => {
  const slug = `${raw.name.toLowerCase().replace(/ /g, '-')}-xphb`
  return { ...entry({ title: raw.name, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined }), featMechanics: resolveDnd5eFeatMechanics(raw) }
})
const FS_ARCHERY_KEY = progressionChoiceKey('class', 1, 'choice:feat.fighting-style.fs-only')
const ARCHERY_REF = { packageId: PKG, slug: 'archery-xphb' }

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [DWARF], classes: [BARBARIAN, FIGHTER, PALADIN, RANGER, BARD], backgrounds: [CRIMINAL],
  feats: FEATS, subclasses: [], items: WEAPONS, monsters: [],
  spells: SPELLS
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 } }
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

const ABILITY_KEY = choiceKey('background', 'choice:background.ability-distribution')
const SKILL_KEY = choiceKey('class', 'choice:skill.proficiency')
const WEAPON_MASTERY_KEY = progressionChoiceKey('class', 1, 'choice:class.weapon-mastery')
const WEAPON_MASTERY_MELEE_ONLY_KEY = progressionChoiceKey('class', 1, 'choice:class.weapon-mastery.melee-only')

function weaponRefs(count: number) {
  return WEAPONS.slice(0, count).map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug }))
}
function skillAnswer(classSlug: string) {
  const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)!
  const choice = facet.choices!.find((c) => c.choiceSet === 'choice:skill.proficiency')!
  return (choice.from ?? []).slice(0, choice.count)
}

type ClassFixture = { slug: string; weaponKey: string; weaponCount: number; needsSpells?: boolean }
const CLASS_FIXTURES: Record<string, ClassFixture> = {
  barbarian: { slug: 'barbarian-xphb', weaponKey: WEAPON_MASTERY_MELEE_ONLY_KEY, weaponCount: 2 },
  fighter: { slug: 'fighter-xphb', weaponKey: WEAPON_MASTERY_KEY, weaponCount: 3 },
  paladin: { slug: 'paladin-xphb', weaponKey: WEAPON_MASTERY_KEY, weaponCount: 2, needsSpells: true },
  ranger: { slug: 'ranger-xphb', weaponKey: WEAPON_MASTERY_KEY, weaponCount: 2, needsSpells: true }
}

function spellSelectionsFor(classSlug: string, prefix: string) {
  if (classSlug !== 'paladin-xphb' && classSlug !== 'ranger-xphb') return []
  const requirement = findRulesFacet('dnd5e.2024', 'class', classSlug)!.spellRequirements!.find((r) => r.pool === 'spell')!
  const count = requirement.totalByLevel[0]!
  return [...'ab'].slice(0, count).map((s) => ({ requirementId: requirement.id, ref: ref(`${prefix}-${s}`) }))
}

function fullBody(fixtureKey: keyof typeof CLASS_FIXTURES, overrides: Record<string, unknown> = {}) {
  const fixture = CLASS_FIXTURES[fixtureKey]!
  const prefix = fixtureKey === 'paladin' ? 'pal' : 'rgr'
  return {
    title: 'Borin',
    species: ref('dwarf-xphb'),
    class: ref(fixture.slug),
    background: ref('criminal-xphb'),
    abilities: STANDARD_ARRAY,
    choices: { selections: { [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } },
    // Fighter's own Fighting Style content choice is a SEPARATE, unrelated mandatory content
    // choice this walk also crosses -- answered here purely so Weapon Mastery can be isolated,
    // exactly mirroring how P8/Feature-Option's own fixtures already answer every sibling
    // content choice a real class declares.
    contentChoices: {
      [fixture.weaponKey]: weaponRefs(fixture.weaponCount),
      ...(fixture.slug === 'fighter-xphb' ? { [FS_ARCHERY_KEY]: [serializeContentRef(ARCHERY_REF)] } : {})
    },
    spellSelections: spellSelectionsFor(fixture.slug, prefix),
    startingEquipment: {
      [`choice:equipment.starting.${fixture.slug}`]: fixture.slug === 'fighter-xphb' ? 'C' : 'B',
      'choice:equipment.starting.criminal-xphb': 'B'
    },
    ...overrides
  }
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  store.progression = null
  store.spellcasting = null
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
      if (body.block_key === 'spellcasting') store.spellcasting = persist(body.data)
      return { data: {} }
    }
    return { data: [] }
  })
})

describe.each([
  ['barbarian', 'Dwarf + Barbarian + Criminal'],
  ['fighter', 'Dwarf + Fighter + Criminal'],
  ['paladin', 'Dwarf + Paladin + Criminal'],
  ['ranger', 'Dwarf + Ranger + Criminal']
] as const)('FIRST NEW CLASS -- %s (%s), through REAL authority', (fixtureKey) => {
  const fixture = CLASS_FIXTURES[fixtureKey]!

  it('1. the real Phase-0 authority reports zero unresolved decisions', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: fixture.slug, background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('2. the real route accepts the full real answer set, including Weapon Mastery, and succeeds', async () => {
    const result = await handler(fakeEvent(fullBody(fixtureKey)) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('3. the selected weapons persist through progression.items[], never inventory, and resolve their real authored mastery property', async () => {
    await handler(fakeEvent(fullBody(fixtureKey)) as any)
    const progression = normalizeStoredProgression(store.progression)!
    const owned = acquiredItemsFor(progression, fixture.weaponKey.split(':').slice(2).join(':'))
    expect(owned).toHaveLength(fixture.weaponCount)
    for (const itemRef of owned) {
      const catalogueEntry = WEAPONS.find((w) => w.slug === itemRef.slug)!
      expect(catalogueEntry.itemMechanics?.masteryProperty, itemRef.slug).toBeTruthy()
    }
  })
})

describe('SERVER AUTHORITY -- the Weapon Mastery answer is independently validated, never trusted', () => {
  // Content choices (Weapon Mastery included) are STRICTLY mandatory at creation, unlike a
  // Definition-keyed choice (e.g. ordinary skill proficiency) -- `create-v2.post.ts`'s own content
  // choice loop checks EVERY declared content choice's own `presentation.valid`, submitted or
  // not. Too few is therefore a hard rejection, never a tolerated "left outstanding" state.
  it('too few selections is rejected, zero writes', async () => {
    const body = fullBody('fighter', { contentChoices: { [FS_ARCHERY_KEY]: [serializeContentRef(ARCHERY_REF)], [WEAPON_MASTERY_KEY]: weaponRefs(1) } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('choose 3') })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('too many selections is rejected, zero writes', async () => {
    const body = fullBody('fighter', { contentChoices: { [FS_ARCHERY_KEY]: [serializeContentRef(ARCHERY_REF)], [WEAPON_MASTERY_KEY]: weaponRefs(4) } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a duplicate weapon in the same answer is rejected, zero writes', async () => {
    const body = fullBody('fighter', { contentChoices: { [FS_ARCHERY_KEY]: [serializeContentRef(ARCHERY_REF)], [WEAPON_MASTERY_KEY]: [weaponRefs(1)[0]!, weaponRefs(1)[0]!, weaponRefs(2)[1]!] } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('an unresolvable/unknown ContentRef is rejected, zero writes', async () => {
    const body = fullBody('fighter', { contentChoices: { [FS_ARCHERY_KEY]: [serializeContentRef(ARCHERY_REF)], [WEAPON_MASTERY_KEY]: [`${PKG}::not-a-real-weapon-xphb`, weaponRefs(2)[1]!, weaponRefs(3)[2]!] } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a Barbarian submitting a martial RANGED weapon is rejected (the real melee-only restriction), zero writes', async () => {
    const rangedEntry = weaponEntry('Shortbow', 'shortbow-xphb', { weaponCategory: 'simple', type: 'R|XPHB', property: ['A|XPHB'], mastery: ['Vex|XPHB'] })
    mocks.getWorldContentCatalogue.mockResolvedValue({ ...CATALOGUE, items: [...WEAPONS, rangedEntry] })
    const body = fullBody('barbarian', { contentChoices: { [WEAPON_MASTERY_MELEE_ONLY_KEY]: [weaponRefs(1)[0]!, serializeContentRef({ packageId: PKG, slug: 'shortbow-xphb' })] } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a crafted, undeclared choice key is rejected outright -- the real Weapon Mastery key was never actually answered', async () => {
    const body = fullBody('fighter', { contentChoices: { 'class:progression:1:choice:does-not-exist': weaponRefs(3) } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('does-not-exist') })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('a stale OTHER-class key (Barbarian\'s melee-only key submitted for a Fighter) is rejected as undeclared', async () => {
    const body = fullBody('fighter', { contentChoices: { [WEAPON_MASTERY_MELEE_ONLY_KEY]: weaponRefs(2) } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('weapon-mastery.melee-only') })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })
})

// CREATION-TIME CLASS SWITCHING -- Fighter's own Weapon Mastery key (`choice:class.weapon-
// mastery`) and Barbarian's own (`choice:class.weapon-mastery.melee-only`) are DIFFERENT
// ChoiceSet ids entirely -- ownership is explicit through the key identity itself, never shared.
describe('CLASS SWITCHING -- the Weapon Mastery answer is correctly revalidated, never leaked across classes', () => {
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
      feats: FEATS,
      spells: SPELLS,
      items: WEAPONS
    }
  }

  it('Fighter selected -> Weapon Mastery required; switching to Bard (no such choice) makes the answer non-live', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.class = FIGHTER as any
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, weaponRefs(3), context)
    expect(draft.contentChoices[WEAPON_MASTERY_KEY]).toEqual(weaponRefs(3))
    expect(creationContentPresentation(draft, context).some((p) => p.key === WEAPON_MASTERY_KEY)).toBe(true)

    draft.class = BARD as any
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, draft.contentChoices[WEAPON_MASTERY_KEY] ?? [], context)
    expect(draft.contentChoices[WEAPON_MASTERY_KEY]).toBeUndefined()
    expect(creationContentPresentation(draft, context).some((p) => p.key === WEAPON_MASTERY_KEY)).toBe(false)
  })

  it('Fighter -> Barbarian: a DIFFERENT ChoiceSet key entirely -- Fighter\'s own answer never satisfies Barbarian\'s own, separately-keyed requirement', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.class = FIGHTER as any
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, weaponRefs(3), context)

    draft.class = BARBARIAN as any
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, draft.contentChoices[WEAPON_MASTERY_KEY] ?? [], context)

    // Fighter's own key is gone (Barbarian never declares it).
    expect(draft.contentChoices[WEAPON_MASTERY_KEY]).toBeUndefined()
    // Barbarian's own, separately-keyed requirement is declared but genuinely unanswered --
    // never silently satisfied by Fighter's stale selection.
    const barbarianPresentation = creationContentPresentation(draft, context).find((p) => p.key === WEAPON_MASTERY_MELEE_ONLY_KEY)!
    expect(barbarianPresentation).toBeDefined()
    expect(barbarianPresentation.selected).toEqual([])
    expect(barbarianPresentation.valid).toBe(false)
    expect(isDraftComplete(draft, context)).toBe(false)
  })

  it('switching back Bard -> Fighter re-asks the question -- no stale hidden answer survives', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.class = FIGHTER as any
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, weaponRefs(3), context)

    draft.class = BARD as any
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, draft.contentChoices[WEAPON_MASTERY_KEY] ?? [], context)

    draft.class = FIGHTER as any
    const presentation = creationContentPresentation(draft, context).find((p) => p.key === WEAPON_MASTERY_KEY)!
    expect(presentation.selected).toEqual([])
    expect(isDraftComplete(draft, context)).toBe(false)
  })
})

// BUILDER-SHAPED PAYLOAD meets the REAL server authority -- built via the real Builder functions
// (emptyDraft/setContentChoiceSelections/toCreatePayload), never a hand-written body object.
describe('BUILDER-SHAPED PAYLOAD meets REAL server authority (Dwarf + Fighter + Criminal)', () => {
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
      feats: FEATS,
      spells: SPELLS,
      items: WEAPONS
    }
  }

  function builderDraft() {
    const draft = emptyDraft()
    draft.name = 'Borin'
    draft.species = DWARF as any
    draft.class = FIGHTER as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    return draft
  }

  function answerEveryRealChoice(draft: ReturnType<typeof builderDraft>, context: BuilderCreationContext) {
    setChoiceSelections(draft, ABILITY_KEY, ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'], context)
    // Fighter's own class skill-proficiency Definition choice is a SEPARATE, unrelated choice
    // the Builder's own isDraftComplete requires (unlike the bare server round-trip, which
    // tolerates a Definition choice left outstanding) -- answered here so the draft can
    // genuinely reach complete.
    setChoiceSelections(draft, SKILL_KEY, skillAnswer('fighter-xphb'), context)
    // Fighter's own Fighting Style content choice is a SEPARATE, unrelated mandatory content
    // choice this draft also declares -- answered here so the draft can genuinely reach complete.
    setContentChoiceSelections(draft, FS_ARCHERY_KEY, [serializeContentRef(ARCHERY_REF)], context)
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, weaponRefs(3), context)
    setEquipmentSelection(draft, 'choice:equipment.starting.fighter-xphb', 'C')
    setEquipmentSelection(draft, 'choice:equipment.starting.criminal-xphb', 'B')
  }

  it('the Builder reports the draft complete once Weapon Mastery (and every other real choice) is answered', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)
  })

  it('an unanswered Weapon Mastery alone keeps the Builder draft incomplete', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    delete draft.contentChoices[WEAPON_MASTERY_KEY]
    expect(isDraftComplete(draft, context)).toBe(false)
  })

  it('the real Builder payload succeeds through the real route and persists exactly what the hand-written body already proved', async () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    expect(payload.contentChoices[WEAPON_MASTERY_KEY]).toEqual(weaponRefs(3))

    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    const progression = normalizeStoredProgression(store.progression)!
    expect(acquiredItemsFor(progression, 'choice:class.weapon-mastery')).toHaveLength(3)
  })
})

describe('COEXISTENCE -- Weapon Mastery alongside other real Level-1 creation decisions', () => {
  it('Fighter: Fighting Style and Weapon Mastery both persist independently', async () => {
    const result = await handler(fakeEvent(fullBody('fighter')) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    const progression = normalizeStoredProgression(store.progression)!
    expect(progression.feats.some((f) => f.featRef.slug === 'archery-xphb')).toBe(true)
    expect(acquiredItemsFor(progression, 'choice:class.weapon-mastery')).toHaveLength(3)
  })

  it('Paladin: Level-1 spell acquisition and Weapon Mastery both persist independently', async () => {
    const result = await handler(fakeEvent(fullBody('paladin')) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect((store.spellcasting as any).spells.length).toBeGreaterThan(0)
    const progression = normalizeStoredProgression(store.progression)!
    expect(acquiredItemsFor(progression, 'choice:class.weapon-mastery')).toHaveLength(2)
  })

  it('Ranger: Level-1 spell acquisition and Weapon Mastery both persist independently', async () => {
    const result = await handler(fakeEvent(fullBody('ranger')) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect((store.spellcasting as any).spells.length).toBeGreaterThan(0)
    const progression = normalizeStoredProgression(store.progression)!
    expect(acquiredItemsFor(progression, 'choice:class.weapon-mastery')).toHaveLength(2)
  })
})
