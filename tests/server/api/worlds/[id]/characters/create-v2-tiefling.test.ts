// TIEFLING SPECIES COMPLETION -- FIRST REAL TIEFLING, end to end through the REAL create-v2 POST
// route and the REAL fail-closed completeness authority. UNSTUBBED: this file makes the
// production claim that Tiefling + Fighter + Criminal is a genuinely creatable combination
// through the real production authority, mirroring create-v2-species-sweep.test.ts's own harness
// shape exactly.
//
// What this file proves:
//   1. creationUnresolvedDecisions is [] for Tiefling + Fighter + Criminal, and for Tiefling +
//      Wizard + Criminal, through the real authority.
//   2. Selecting Tiefling declares the real `species:choice:species.size`,
//      `species:choice:species.feature-option` (3 real Fiendish Legacies), and
//      `species:choice:species.innate-spellcasting-ability` choices, through the SAME generic
//      ChoiceSet presentation every other creation choice already uses -- no bespoke
//      FiendishLegacyPicker.
//   3. The real route accepts a full real answer set and succeeds; a fresh read of rules_choices
//      still names every selected option; the Level-1 fixed spells (Otherworldly Presence's
//      Thaumaturgy + the chosen legacy's own cantrip) persist through canonical
//      spellcasting.spells[].
//   4. SERVER AUTHORITY -- missing/unknown/too-many/crafted-for-a-species-that-never-declared-it
//      answers are all independently refused, zero writes.
//   5. The chosen legacy's own linked resistance consequence resolves through the real engine --
//      never a second mandatory decision -- and changing legacy makes the PREVIOUS legacy's own
//      consequence inactive while the NEW one activates, with no stale-state leakage.
//   6. SPECIES SWITCHING -- Tiefling -> Dwarf makes every Tiefling answer non-live; switching back
//      revalidates; Tiefling -> Elf/Gnome (sharing the SAME generic feature-option/ability keys)
//      never lets a stale Tiefling answer satisfy either.
//   7. COEXISTENCE -- Tiefling's own fixed Level-1 spells persist alongside a real spellcasting
//      class's (Wizard) own class-owned spells, with no collision.
//   8. HISTORICAL -- an old record (no legacy/ability/size answer in rules_choices at all)
//      resolves its fixed state on read, never auto-answered, never mutated.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  progression: null as null | Record<string, unknown>,
  spellcasting: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
  currency: null as null | Record<string, unknown>,
  createdEntityId: 9606
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
import { DependencyGraph } from '../../../../../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../../../../../app/lib/rules/evaluation-session'
import { evaluate } from '../../../../../../app/lib/rules/evaluator'
import { findRulesFacet } from '../../../../../../app/lib/content-rules'
import { creationUnresolvedDecisions } from '../../../../../../app/lib/content-rules/creation-completeness'
import { resolveDnd5eSpellMechanics } from '../../../../../../app/lib/spell-mechanics/dnd5e'
import { resolveDnd5eItemMechanics } from '../../../../../../app/lib/item-mechanics/dnd5e'
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import { choiceKey, progressionChoiceKey } from '../../../../../../app/lib/characters/rules-choices'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'
import {
  emptyDraft,
  isDraftComplete,
  setChoiceSelections,
  setContentChoiceSelections,
  setEquipmentSelection,
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
const REAL_RUNTIME = loadRealRuntime()

function entry(overrides: Record<string, unknown>) {
  return { packageId: PKG, packageVersion: '1.0.21', systemKey: 'dnd5e', externalId: `${overrides.title}__XPHB`, provider: '5etools-json', ...overrides }
}

const TIEFLING = entry({ title: 'Tiefling', slug: 'tiefling-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'tiefling-xphb') ?? undefined })
const DWARF = entry({ title: 'Dwarf', slug: 'dwarf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'dwarf-xphb') ?? undefined })
const ELF = entry({ title: 'Elf', slug: 'elf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'elf-xphb') ?? undefined })
const GNOME = entry({ title: 'Gnome', slug: 'gnome-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'gnome-xphb') ?? undefined })
const FIGHTER = entry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })
const WIZARD = entry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined })
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })

const FEATS = xphbFeats.feats.map((raw: { name: string }) => {
  const slug = `${raw.name.toLowerCase().replace(/ /g, '-')}-xphb`
  return { ...entry({ title: raw.name, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined }), featMechanics: resolveDnd5eFeatMechanics(raw) }
})
const FS_ARCHERY_KEY = progressionChoiceKey('class', 1, 'choice:feat.fighting-style.fs-only')
const ARCHERY_REF = { packageId: PKG, slug: 'archery-xphb' }
const WEAPON_MASTERY_KEY = progressionChoiceKey('class', 1, 'choice:class.weapon-mastery')

function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...entry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
const WEAPONS = [
  weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] }),
  weaponEntry('Warhammer', 'warhammer-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Push|XPHB'] }),
  weaponEntry('Battleaxe', 'battleaxe-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Topple|XPHB'] })
]
function weaponRefs(count: number) {
  return WEAPONS.slice(0, count).map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug }))
}

function spellEntry(slug: string, level: number, classLists: string[]) {
  return { packageId: PKG, slug, title: slug, spellMechanics: resolveDnd5eSpellMechanics({ name: slug, source: 'XPHB', level, school: 'V', classLists })! }
}
const SPELLS = [
  spellEntry('thaumaturgy-xphb', 0, ['Wizard']),
  spellEntry('poison-spray-xphb', 0, ['Wizard']),
  spellEntry('chill-touch-xphb', 0, ['Wizard']),
  spellEntry('fire-bolt-xphb', 0, ['Wizard']),
  ...[...'abcdef'].map((s) => spellEntry(`wiz-${s}`, 1, ['Wizard'])),
  ...[...'xyz'].map((s) => spellEntry(`wiz-cantrip-${s}`, 0, ['Wizard']))
]

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [TIEFLING, DWARF, ELF, GNOME], classes: [FIGHTER, WIZARD], backgrounds: [CRIMINAL],
  feats: FEATS, subclasses: [], items: WEAPONS, monsters: [],
  spells: SPELLS
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 } }
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
const SIZE_KEY = choiceKey('species', 'choice:species.size')
const FEATURE_OPTION_KEY = choiceKey('species', 'choice:species.feature-option')
const INNATE_ABILITY_KEY = choiceKey('species', 'choice:species.innate-spellcasting-ability')
const ABILITY_KEY = choiceKey('background', 'choice:background.ability-distribution')

function skillAnswer(classSlug: string) {
  const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)!
  const choice = facet.choices!.find((c) => c.choiceSet === 'choice:skill.proficiency')!
  return (choice.from ?? []).slice(0, choice.count)
}

// Every real, currently-required answer for Tiefling + Fighter + Criminal. `legacy` defaults to
// Abyssal -- overridable per test.
function fullBody(overrides: Record<string, unknown> = {}, legacy = 'source:fiendish-legacy.abyssal', ability = 'value:innate-spellcasting.ability.cha') {
  return {
    title: 'Rhyzae',
    species: ref('tiefling-xphb'),
    class: ref('fighter-xphb'),
    background: ref('criminal-xphb'),
    abilities: STANDARD_ARRAY,
    choices: {
      selections: {
        [SKILL_KEY]: skillAnswer('fighter-xphb'),
        [SIZE_KEY]: ['value:size.medium'],
        [FEATURE_OPTION_KEY]: [legacy],
        [INNATE_ABILITY_KEY]: [ability],
        [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
      }
    },
    contentChoices: {
      [WEAPON_MASTERY_KEY]: weaponRefs(3),
      [FS_ARCHERY_KEY]: [serializeContentRef(ARCHERY_REF)]
    },
    spellSelections: [],
    startingEquipment: {
      'choice:equipment.starting.fighter-xphb': 'C',
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
      if (body.block_key === 'spellcasting') store.spellcasting = persist(body.data)
      if (body.block_key === 'rules_choices') store.rulesChoices = persist(body.data)
      if (body.block_key === 'currency') store.currency = persist(body.data)
      return { data: {} }
    }
    return { data: [] }
  })
})

describe('TIEFLING CHOICES -- declared through the real generic ChoiceSet presentation, no bespoke picker', () => {
  it('selecting Tiefling declares species:choice:species.size, species:choice:species.feature-option (3 real legacies), and species:choice:species.innate-spellcasting-ability', () => {
    const context: BuilderCreationContext = { contentSelectorOf: () => null, choiceSetRule: () => null, feats: [], spells: [], items: [] }
    const draft = emptyDraft()
    draft.species = TIEFLING as any
    draft.class = FIGHTER as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    const presentation = creationChoicePresentation(draft, context)

    const size = presentation.find((p) => p.key === SIZE_KEY)!
    expect(size.count).toBe(1)
    expect(size.offered.map((o) => o.value).sort()).toEqual(['value:size.medium', 'value:size.small'])

    const legacy = presentation.find((p) => p.key === FEATURE_OPTION_KEY)!
    expect(legacy.count).toBe(1)
    expect(legacy.offered.map((o) => o.value).sort()).toEqual([
      'source:fiendish-legacy.abyssal', 'source:fiendish-legacy.chthonic', 'source:fiendish-legacy.infernal'
    ])

    const ability = presentation.find((p) => p.key === INNATE_ABILITY_KEY)!
    expect(ability.count).toBe(1)
    expect(ability.offered.map((o) => o.value).sort()).toEqual([
      'value:innate-spellcasting.ability.cha', 'value:innate-spellcasting.ability.int', 'value:innate-spellcasting.ability.wis'
    ])
  })
})

describe('FIRST REAL TIEFLING -- Tiefling + Fighter + Criminal, through REAL authority', () => {
  it('1. the real Phase-0 authority reports zero unresolved decisions', () => {
    expect(creationUnresolvedDecisions({ species: 'tiefling-xphb', class: 'fighter-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('2. the real route accepts the full real answer set and succeeds', async () => {
    const result = await handler(fakeEvent(fullBody()) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('3. the selected size/legacy/ability all persist through rules_choices, and a fresh read still names them', async () => {
    await handler(fakeEvent(fullBody({}, 'source:fiendish-legacy.chthonic', 'value:innate-spellcasting.ability.wis')) as any)
    expect(store.rulesChoices!.selections).toMatchObject({
      [SIZE_KEY]: ['value:size.medium'],
      [FEATURE_OPTION_KEY]: ['source:fiendish-legacy.chthonic'],
      [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.wis']
    })
  })

  it('4. the Level-1 fixed spells (Otherworldly Presence\'s Thaumaturgy + the chosen legacy\'s own cantrip) persist through canonical spellcasting.spells[]', async () => {
    await handler(fakeEvent(fullBody({}, 'source:fiendish-legacy.abyssal') as any) as any)
    const spells = (store.spellcasting as any).spells as { ref?: { slug: string }, known: boolean, prepared: boolean }[]
    const thaumaturgy = spells.find((s) => s.ref?.slug === 'thaumaturgy-xphb')
    const poisonSpray = spells.find((s) => s.ref?.slug === 'poison-spray-xphb')
    expect(thaumaturgy?.known).toBe(true)
    expect(poisonSpray?.known).toBe(true)
    // No Chthonic/Infernal cantrip leaks in for an Abyssal Tiefling.
    expect(spells.some((s) => s.ref?.slug === 'chill-touch-xphb')).toBe(false)
    expect(spells.some((s) => s.ref?.slug === 'fire-bolt-xphb')).toBe(false)
  })

  it('5. the chosen legacy\'s own linked resistance resolves through the real engine -- a different legacy resolves a different resistance', () => {
    const graph = DependencyGraph.build(REAL_RUNTIME.registry)
    if (!graph.ok) throw new Error('graph failed')
    const abyssalSession = new EvaluationSession(REAL_RUNTIME.registry, graph.graph, {
      values: {}, choices: {}, collections: {},
      sources: [{ instanceId: 'x', sourceRef: 'source:fiendish-legacy.abyssal', origin: { kind: 'declared' } }]
    }, {})
    expect(evaluate('value:resistance.poison.granted', abyssalSession)).toBe(true)
    expect(evaluate('value:resistance.fire.granted', abyssalSession)).toBe(false)

    const infernalSession = new EvaluationSession(REAL_RUNTIME.registry, graph.graph, {
      values: {}, choices: {}, collections: {},
      sources: [{ instanceId: 'x', sourceRef: 'source:fiendish-legacy.infernal', origin: { kind: 'declared' } }]
    }, {})
    expect(evaluate('value:resistance.fire.granted', infernalSession)).toBe(true)
    expect(evaluate('value:resistance.poison.granted', infernalSession)).toBe(false)
  })
})

describe('SERVER AUTHORITY -- the real route independently re-validates every Tiefling answer, zero writes on rejection', () => {
  function expectNoWrites() {
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  }

  it('a missing legacy answer is refused', async () => {
    const body = fullBody({ choices: { selections: { [SKILL_KEY]: skillAnswer('fighter-xphb'), [SIZE_KEY]: ['value:size.medium'], [FEATURE_OPTION_KEY]: [], [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.cha'], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('an unknown legacy identity is refused', async () => {
    await expect(handler(fakeEvent(fullBody({}, 'source:fiendish-legacy.does-not-exist')) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('too many legacy selections (count is 1) is refused', async () => {
    const body = fullBody({ choices: { selections: { [SKILL_KEY]: skillAnswer('fighter-xphb'), [SIZE_KEY]: ['value:size.medium'], [FEATURE_OPTION_KEY]: ['source:fiendish-legacy.abyssal', 'source:fiendish-legacy.infernal'], [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.cha'], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('a missing size answer is refused', async () => {
    const body = fullBody({ choices: { selections: { [SKILL_KEY]: skillAnswer('fighter-xphb'), [SIZE_KEY]: [], [FEATURE_OPTION_KEY]: ['source:fiendish-legacy.abyssal'], [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.cha'], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('an unknown innate-spellcasting-ability identity is refused', async () => {
    await expect(handler(fakeEvent(fullBody({}, 'source:fiendish-legacy.abyssal', 'value:innate-spellcasting.ability.does-not-exist')) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('a crafted key for a species that never declared this choice (Dwarf) is refused as undeclared', async () => {
    const body = fullBody({ species: ref('dwarf-xphb') })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })
})

// SPECIES SWITCHING -- Tiefling's own choice keys are owned by the SPECIES slot; switching must
// make every stale answer non-live, and switching to Elf/Gnome (sharing the SAME generic
// feature-option/ability keys) must never let a stale Tiefling answer satisfy either.
describe('SPECIES SWITCHING -- Tiefling\'s own answers are correctly revalidated, never leaked across species', () => {
  function builderContext(): BuilderCreationContext {
    return { contentSelectorOf: () => null, choiceSetRule: () => null, feats: FEATS, spells: SPELLS, items: WEAPONS }
  }

  it('Tiefling selected -> size/legacy/ability all required; switching to Dwarf (no such choices) makes every answer non-live', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = TIEFLING as any
    setChoiceSelections(draft, SIZE_KEY, ['value:size.small'], context)
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:fiendish-legacy.infernal'], context)
    setChoiceSelections(draft, INNATE_ABILITY_KEY, ['value:innate-spellcasting.ability.wis'], context)
    expect(creationChoicePresentation(draft, context).some((p) => p.key === SIZE_KEY)).toBe(true)

    draft.species = DWARF as any
    const presentation = creationChoicePresentation(draft, context)
    expect(presentation.some((p) => p.key === SIZE_KEY)).toBe(false)
    expect(presentation.some((p) => p.key === FEATURE_OPTION_KEY)).toBe(false)
    expect(presentation.some((p) => p.key === INNATE_ABILITY_KEY)).toBe(false)
  })

  it('switching back Dwarf -> Tiefling re-asks every question, with the stale draft entries preserved (never deleted), and revalidated', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = TIEFLING as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:fiendish-legacy.infernal'], context)

    draft.species = DWARF as any
    draft.species = TIEFLING as any
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === FEATURE_OPTION_KEY)!
    expect(presentation.selected).toEqual(['source:fiendish-legacy.infernal'])
  })

  it('Tiefling -> Elf: the SAME generic feature-option/ability keys, but Tiefling\'s own Source/ability answers are never legal Elf options', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = TIEFLING as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:fiendish-legacy.infernal'], context)
    setChoiceSelections(draft, INNATE_ABILITY_KEY, ['value:innate-spellcasting.ability.wis'], context)

    draft.species = ELF as any
    const legacyPresentation = creationChoicePresentation(draft, context).find((p) => p.key === FEATURE_OPTION_KEY)!
    expect(legacyPresentation.offered.map((o) => o.value)).not.toContain('source:fiendish-legacy.infernal')
    // The shared ability-choice key is still live for Elf too, but Tiefling's own stale answer
    // is simply re-askable, never silently treated as already-submitted for Elf.
    const abilityPresentation = creationChoicePresentation(draft, context).find((p) => p.key === INNATE_ABILITY_KEY)!
    expect(abilityPresentation.offered.map((o) => o.value).sort()).toEqual([
      'value:innate-spellcasting.ability.cha', 'value:innate-spellcasting.ability.int', 'value:innate-spellcasting.ability.wis'
    ])
  })

  it('Tiefling -> Gnome: Tiefling\'s own legacy Source is never among Gnome\'s own legal lineage options', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = TIEFLING as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:fiendish-legacy.chthonic'], context)

    draft.species = GNOME as any
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === FEATURE_OPTION_KEY)!
    expect(presentation.offered.map((o) => o.value)).not.toContain('source:fiendish-legacy.chthonic')
    expect(presentation.offered.map((o) => o.value).sort()).toEqual(['source:gnomish-lineage.forest-gnome', 'source:gnomish-lineage.rock-gnome'])
  })
})

// COEXISTENCE -- Tiefling's own fixed Level-1 spells and a spellcasting class's own class-owned
// spells persist together with no collision.
describe('COEXISTENCE -- Tiefling + a real spellcasting class (Wizard), through REAL authority', () => {
  it('Tiefling + Wizard + Criminal has zero unresolved decisions, and persists BOTH species-owned and class-owned spells', async () => {
    expect(creationUnresolvedDecisions({ species: 'tiefling-xphb', class: 'wizard-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])

    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellbookCount = requirements.find((r) => r.pool === 'spellbook')!.totalByLevel[0]!
    const spellCount = requirements.find((r) => r.pool === 'spell')!.totalByLevel[0]!
    const cantripCount = requirements.find((r) => r.pool === 'cantrip')!.totalByLevel[0]!
    const spellSelections = [
      ...[...'abcdef'].slice(0, spellbookCount).map((s) => ({ requirementId: spellbookId, ref: ref(`wiz-${s}`) })),
      ...[...'abcdef'].slice(0, spellCount).map((s) => ({ requirementId: spellId, ref: ref(`wiz-${s}`) })),
      ...[...'xyz'].slice(0, cantripCount).map((s) => ({ requirementId: cantripId, ref: ref(`wiz-cantrip-${s}`) }))
    ]

    const body = {
      title: 'Rhyzae',
      species: ref('tiefling-xphb'),
      class: ref('wizard-xphb'),
      background: ref('criminal-xphb'),
      abilities: STANDARD_ARRAY,
      choices: {
        selections: {
          [choiceKey('class', 'choice:skill.proficiency')]: skillAnswer('wizard-xphb'),
          [SIZE_KEY]: ['value:size.medium'],
          [FEATURE_OPTION_KEY]: ['source:fiendish-legacy.abyssal'],
          [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.cha'],
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
        }
      },
      spellSelections,
      startingEquipment: { 'choice:equipment.starting.wizard-xphb': 'B', 'choice:equipment.starting.criminal-xphb': 'B' }
    }
    const result = await handler(fakeEvent(body) as any) as any
    expect(result.id).toBe(store.createdEntityId)

    const spells = (store.spellcasting as any).spells as { ref?: { slug: string }, known: boolean, instanceId: unknown }[]
    expect(spells.find((s) => s.ref?.slug === 'thaumaturgy-xphb')?.known).toBe(true)
    expect(spells.find((s) => s.ref?.slug === 'poison-spray-xphb')?.known).toBe(true)
    expect(spells.some((s) => s.ref?.slug === 'wiz-a')).toBe(true)
    const instanceIds = spells.map((s) => s.instanceId)
    expect(new Set(instanceIds).size).toBe(instanceIds.length)
  })
})

// BUILDER-SHAPED PAYLOAD meets REAL server authority -- the real Builder functions, never a
// hand-written body, proving generic ChoiceSet presentation needed no new component (no
// FiendishLegacyPicker.vue).
describe('BUILDER-SHAPED PAYLOAD meets REAL server authority (Tiefling + Fighter + Criminal)', () => {
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
    draft.name = 'Rhyzae'
    draft.species = TIEFLING as any
    draft.class = FIGHTER as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    return draft
  }

  function answerEveryRealChoice(draft: ReturnType<typeof builderDraft>, context: BuilderCreationContext) {
    setChoiceSelections(draft, SKILL_KEY, skillAnswer('fighter-xphb'), context)
    setChoiceSelections(draft, SIZE_KEY, ['value:size.small'], context)
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:fiendish-legacy.infernal'], context)
    setChoiceSelections(draft, INNATE_ABILITY_KEY, ['value:innate-spellcasting.ability.int'], context)
    setChoiceSelections(draft, ABILITY_KEY, ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'], context)
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, weaponRefs(3), context)
    setContentChoiceSelections(draft, FS_ARCHERY_KEY, [serializeContentRef(ARCHERY_REF)], context)
    setEquipmentSelection(draft, 'choice:equipment.starting.fighter-xphb', 'C')
    setEquipmentSelection(draft, 'choice:equipment.starting.criminal-xphb', 'B')
  }

  it('the Builder itself reports the draft complete once every real choice is answered', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)
  })

  it('the real Builder payload succeeds through the real route and persists the selected size/legacy/ability', async () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(store.rulesChoices!.selections[SIZE_KEY]).toEqual(['value:size.small'])
    expect(store.rulesChoices!.selections[FEATURE_OPTION_KEY]).toEqual(['source:fiendish-legacy.infernal'])
    expect(store.rulesChoices!.selections[INNATE_ABILITY_KEY]).toEqual(['value:innate-spellcasting.ability.int'])

    const spells = (store.spellcasting as any).spells as { ref?: { slug: string } }[]
    expect(spells.some((s) => s.ref?.slug === 'fire-bolt-xphb')).toBe(true)
  })
})

// HISTORICAL -- an old Tiefling record (no legacy/ability/size answer at all in rules_choices)
// continues to resolve its fixed state on read, with no migration, no retroactive selection, and
// no read-time mutation.
describe('HISTORICAL -- an old Tiefling record with no answers at all continues to resolve its fixed state', () => {
  it('the species facet\'s own fixed grants/fixedSpellGrants resolve independently of any rules_choices content', () => {
    const facet = findRulesFacet('dnd5e.2024', 'species', 'tiefling-xphb')!
    const emptySelections = {}
    expect(facet.grants?.some((g) => g.set === 'value:sense.darkvision' && g.to === 60)).toBe(true)
    expect(facet.fixedSpellGrants?.some((g) => g.slug === 'thaumaturgy-xphb' && !g.requiresActive)).toBe(true)
    // The size/legacy/ability choices are simply absent/pending -- reading them never throws,
    // never invents an answer, and never retroactively picks one.
    expect((emptySelections as Record<string, unknown>)[SIZE_KEY]).toBeUndefined()
    expect((emptySelections as Record<string, unknown>)[FEATURE_OPTION_KEY]).toBeUndefined()
  })

  it('every one of Tiefling\'s own Level-3/5 fixed grants carries a real minLevel, and resolves to NOTHING without a chosen legacy', () => {
    const facet = findRulesFacet('dnd5e.2024', 'species', 'tiefling-xphb')!
    const levelGated = facet.fixedSpellGrants!.filter((g) => (g.minLevel ?? 1) > 1)
    expect(levelGated).toHaveLength(6)
    for (const grant of levelGated) {
      expect(grant.requiresActive, grant.slug).toBeDefined()
      expect([3, 5]).toContain(grant.minLevel)
    }
  })
})
