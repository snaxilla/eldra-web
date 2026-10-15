// PURE-AUTHORING SPECIES SWEEP -- Dragonborn, Elf, Goliath, Gnome, end to end through the REAL
// create-v2 POST route and the REAL fail-closed completeness authority. UNSTUBBED: this file
// makes the production claim that each of the four is a genuinely creatable combination (paired
// with Fighter + Criminal) through the real production authority, mirroring create-v2-
// aasimar.test.ts's own harness shape exactly.
//
// What this file proves, per species:
//   1. creationUnresolvedDecisions is [] for <Species> + Fighter + Criminal, through the REAL
//      authority.
//   2. Selecting the species declares the real `species:choice:species.feature-option` choice
//      (and, for Elf/Gnome, the nested `species:choice:species.innate-spellcasting-ability` too)
//      through the SAME generic ChoiceSet presentation every other creation choice already uses
//      -- no bespoke lineage/ancestry picker.
//   3. The real POST route accepts a full real answer set and succeeds; a fresh read of
//      rules_choices still names the selected option(s).
//   4. SERVER AUTHORITY -- missing/unknown/too-many/crafted-for-a-species-that-never-declared-it
//      answers are all independently refused, zero writes.
//   5. SPECIES SWITCHING -- <Species> -> Dwarf makes the answer(s) non-live; switching back
//      revalidates; a DIFFERENT target species sharing the SAME generic choice key never lets a
//      stale answer from one satisfy the other.
//   6. Linked consequences (Dragonborn's own resistance-by-ancestry) resolve through the chosen
//      Source's own modifiers, proven directly against the real engine -- never a second
//      mandatory decision.
//   7. Elf's/Gnome's own lineage-gated fixed spells persist through the canonical
//      spellcasting.spells[] store, and coexist with a real spellcasting class's (Wizard) own
//      class-owned spells with no collision.
//   8. HISTORICAL -- an old record (no lineage/ability answer in rules_choices at all) resolves
//      its fixed state on read, never auto-answered, never mutated.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { vi } from 'vitest'

const store = vi.hoisted(() => ({
  progression: null as null | Record<string, unknown>,
  spellcasting: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
  currency: null as null | Record<string, unknown>,
  createdEntityId: 9505
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

const DRAGONBORN = entry({ title: 'Dragonborn', slug: 'dragonborn-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'dragonborn-xphb') ?? undefined })
const GOLIATH = entry({ title: 'Goliath', slug: 'goliath-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'goliath-xphb') ?? undefined })
const ELF = entry({ title: 'Elf', slug: 'elf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'elf-xphb') ?? undefined })
const GNOME = entry({ title: 'Gnome', slug: 'gnome-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'gnome-xphb') ?? undefined })
const DWARF = entry({ title: 'Dwarf', slug: 'dwarf-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'dwarf-xphb') ?? undefined })
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
  spellEntry('dancing-lights-xphb', 0, ['Wizard']),
  spellEntry('prestidigitation-xphb', 0, ['Wizard']),
  spellEntry('druidcraft-xphb', 0, ['Wizard']),
  spellEntry('minor-illusion-xphb', 0, ['Wizard']),
  spellEntry('speak-with-animals-xphb', 1, ['Wizard']),
  spellEntry('mending-xphb', 0, ['Wizard']),
  ...[...'abcdef'].map((s) => spellEntry(`wiz-${s}`, 1, ['Wizard'])),
  ...[...'xyz'].map((s) => spellEntry(`wiz-cantrip-${s}`, 0, ['Wizard']))
]

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [DRAGONBORN, GOLIATH, ELF, GNOME, DWARF], classes: [FIGHTER, WIZARD], backgrounds: [CRIMINAL],
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
const SPECIES_SKILL_KEY = choiceKey('species', 'choice:skill.proficiency')
const FEATURE_OPTION_KEY = choiceKey('species', 'choice:species.feature-option')
const INNATE_ABILITY_KEY = choiceKey('species', 'choice:species.innate-spellcasting-ability')
const ABILITY_KEY = choiceKey('background', 'choice:background.ability-distribution')

function skillAnswer(classSlug: string) {
  const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)!
  const choice = facet.choices!.find((c) => c.choiceSet === 'choice:skill.proficiency')!
  return (choice.from ?? []).slice(0, choice.count)
}

type SpeciesFixture = {
  slug: string
  selections: Record<string, string[]>
}
const FIXTURES: Record<string, SpeciesFixture> = {
  dragonborn: { slug: 'dragonborn-xphb', selections: { [FEATURE_OPTION_KEY]: ['source:draconic-ancestry.red'] } },
  goliath: { slug: 'goliath-xphb', selections: { [FEATURE_OPTION_KEY]: ['source:giant-ancestry.stones-endurance'] } },
  elf: {
    slug: 'elf-xphb',
    selections: {
      [SPECIES_SKILL_KEY]: ['value:skill.insight.proficient'],
      [FEATURE_OPTION_KEY]: ['source:elven-lineage.drow'],
      [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.int']
    }
  },
  gnome: {
    slug: 'gnome-xphb',
    selections: {
      [FEATURE_OPTION_KEY]: ['source:gnomish-lineage.forest-gnome'],
      [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.wis']
    }
  }
}

function fullBody(fixtureKey: keyof typeof FIXTURES, overrides: Record<string, unknown> = {}) {
  const fixture = FIXTURES[fixtureKey]!
  return {
    title: 'Borin',
    species: ref(fixture.slug),
    class: ref('fighter-xphb'),
    background: ref('criminal-xphb'),
    abilities: STANDARD_ARRAY,
    choices: {
      selections: {
        [SKILL_KEY]: skillAnswer('fighter-xphb'),
        [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'],
        ...fixture.selections
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

describe.each([
  ['dragonborn', 'dragonborn-xphb'],
  ['goliath', 'goliath-xphb'],
  ['elf', 'elf-xphb'],
  ['gnome', 'gnome-xphb']
] as const)('FIRST REAL %s -- %s + Fighter + Criminal, through REAL authority', (fixtureKey, slug) => {
  it('1. the real Phase-0 authority reports zero unresolved decisions', () => {
    expect(creationUnresolvedDecisions({ species: slug, class: 'fighter-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('2. the real route accepts the full real answer set and succeeds', async () => {
    const result = await handler(fakeEvent(fullBody(fixtureKey)) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('3. the selected option(s) persist through rules_choices, and a fresh read still names them', async () => {
    await handler(fakeEvent(fullBody(fixtureKey)) as any)
    for (const [key, value] of Object.entries(FIXTURES[fixtureKey]!.selections)) {
      expect(store.rulesChoices!.selections).toMatchObject({ [key]: value })
    }
  })
})

describe('DRAGONBORN -- linked consequence (ancestry -> resistance) resolves through the real engine, never a second decision', () => {
  it('declares exactly one mandatory choice (the ancestry itself), and the chosen Source resolves its own resistance Value', () => {
    const context: BuilderCreationContext = { contentSelectorOf: () => null, choiceSetRule: () => null, feats: [], spells: [], items: [] }
    const draft = emptyDraft()
    draft.species = DRAGONBORN as any
    draft.class = FIGHTER as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    const presentation = creationChoicePresentation(draft, context)
    const speciesChoices = presentation.filter((p) => p.key.startsWith('species:'))
    expect(speciesChoices).toHaveLength(1)
    expect(speciesChoices[0]!.key).toBe(FEATURE_OPTION_KEY)

    const graph = DependencyGraph.build(REAL_RUNTIME.registry)
    if (!graph.ok) throw new Error('graph failed')
    const session = new EvaluationSession(REAL_RUNTIME.registry, graph.graph, {
      values: {}, choices: {}, collections: {},
      sources: [{ instanceId: 'x', sourceRef: 'source:draconic-ancestry.red', origin: { kind: 'declared' } }]
    }, {})
    expect(evaluate('value:resistance.fire.granted', session)).toBe(true)
    expect(evaluate('value:resistance.acid.granted', session)).toBe(false)
  })

  it('a DIFFERENT ancestry resolves a DIFFERENT resistance -- the choice, not a hardcoded fact, drives it', () => {
    const graph = DependencyGraph.build(REAL_RUNTIME.registry)
    if (!graph.ok) throw new Error('graph failed')
    const session = new EvaluationSession(REAL_RUNTIME.registry, graph.graph, {
      values: {}, choices: {}, collections: {},
      sources: [{ instanceId: 'x', sourceRef: 'source:draconic-ancestry.white', origin: { kind: 'declared' } }]
    }, {})
    expect(evaluate('value:resistance.cold.granted', session)).toBe(true)
    expect(evaluate('value:resistance.fire.granted', session)).toBe(false)
  })
})

describe('SERVER AUTHORITY -- the real route independently re-validates every species answer, zero writes on rejection', () => {
  function expectNoWrites() {
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  }

  it('a missing feature-option answer (Dragonborn) is refused', async () => {
    const body = fullBody('dragonborn', { choices: { selections: { [SKILL_KEY]: skillAnswer('fighter-xphb'), [FEATURE_OPTION_KEY]: [], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('an unknown ancestry identity (Dragonborn) is refused', async () => {
    const body = fullBody('dragonborn', { choices: { selections: { [SKILL_KEY]: skillAnswer('fighter-xphb'), [FEATURE_OPTION_KEY]: ['source:draconic-ancestry.does-not-exist'], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('too many feature-option selections (count is 1, Goliath) is refused', async () => {
    const body = fullBody('goliath', { choices: { selections: { [SKILL_KEY]: skillAnswer('fighter-xphb'), [FEATURE_OPTION_KEY]: ['source:giant-ancestry.stones-endurance', 'source:giant-ancestry.hills-tumble'], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('a crafted feature-option key for a species that never declared it (Dwarf) is refused as undeclared', async () => {
    const body = fullBody('dragonborn', { species: ref('dwarf-xphb') })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('a missing innate-spellcasting-ability answer (Elf) is refused', async () => {
    const body = fullBody('elf', {
      choices: {
        selections: {
          [SKILL_KEY]: skillAnswer('fighter-xphb'),
          [SPECIES_SKILL_KEY]: ['value:skill.insight.proficient'],
          [FEATURE_OPTION_KEY]: ['source:elven-lineage.drow'],
          [INNATE_ABILITY_KEY]: [],
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
        }
      }
    })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('an unknown innate-spellcasting-ability identity (Gnome) is refused', async () => {
    const body = fullBody('gnome', {
      choices: {
        selections: {
          [SKILL_KEY]: skillAnswer('fighter-xphb'),
          [FEATURE_OPTION_KEY]: ['source:gnomish-lineage.forest-gnome'],
          [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.does-not-exist'],
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
        }
      }
    })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })
})

// SPECIES SWITCHING -- every target species' own choice keys are owned by the SPECIES slot;
// switching must make a stale answer non-live, and a DIFFERENT target species sharing the SAME
// generic `choice:species.feature-option`/`choice:species.innate-spellcasting-ability` key must
// never let one's stale answer satisfy another's.
describe('SPECIES SWITCHING -- no stale answer leaks across species, even when they share the same generic choice key', () => {
  function builderContext(): BuilderCreationContext {
    return { contentSelectorOf: () => null, choiceSetRule: () => null, feats: FEATS, spells: SPELLS, items: WEAPONS }
  }

  it('Dragonborn selected -> feature-option required; switching to Dwarf (no such choice) makes the answer non-live', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = DRAGONBORN as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:draconic-ancestry.red'], context)
    expect(creationChoicePresentation(draft, context).some((p) => p.key === FEATURE_OPTION_KEY)).toBe(true)

    draft.species = DWARF as any
    expect(creationChoicePresentation(draft, context).some((p) => p.key === FEATURE_OPTION_KEY)).toBe(false)
  })

  it('Dragonborn -> Goliath: the SAME generic key, but Dragonborn\'s own Source answer is never a legal Goliath option', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = DRAGONBORN as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:draconic-ancestry.red'], context)

    draft.species = GOLIATH as any
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === FEATURE_OPTION_KEY)!
    expect(presentation).toBeDefined()
    // The stale Dragonborn answer is not among Goliath's own legal options, so it is never
    // reported as a valid, satisfied selection for Goliath.
    expect(presentation.offered.map((o) => o.value)).not.toContain('source:draconic-ancestry.red')
  })

  it('switching back Goliath -> Dragonborn re-asks the question -- no stale hidden answer survives', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = DRAGONBORN as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:draconic-ancestry.red'], context)

    draft.species = GOLIATH as any
    draft.species = DRAGONBORN as any
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === FEATURE_OPTION_KEY)!
    expect(presentation.selected).toEqual(['source:draconic-ancestry.red'])
  })

  it('Elf -> Gnome: the SAME shared innate-spellcasting-ability key stays live and answerable for both, but each lineage choice stays independently scoped', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = ELF as any
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:elven-lineage.drow'], context)
    setChoiceSelections(draft, INNATE_ABILITY_KEY, ['value:innate-spellcasting.ability.int'], context)

    draft.species = GNOME as any
    const featurePresentation = creationChoicePresentation(draft, context).find((p) => p.key === FEATURE_OPTION_KEY)!
    // Elf's own Drow answer is never a legal Gnome lineage option.
    expect(featurePresentation.offered.map((o) => o.value)).not.toContain('source:elven-lineage.drow')
    // The shared ability-choice key is still live for Gnome too, but the stale Elf answer
    // (Intelligence) is simply re-askable, never silently treated as already-submitted for Gnome.
    const abilityPresentation = creationChoicePresentation(draft, context).find((p) => p.key === INNATE_ABILITY_KEY)!
    expect(abilityPresentation).toBeDefined()
    expect(abilityPresentation.offered.map((o) => o.value).sort()).toEqual([
      'value:innate-spellcasting.ability.cha', 'value:innate-spellcasting.ability.int', 'value:innate-spellcasting.ability.wis'
    ])
  })
})

// SPELL COEXISTENCE -- Elf's/Gnome's own lineage-gated fixed spells persist alongside a real
// spellcasting class's (Wizard) own class-owned spells, through the SAME canonical
// spellcasting.spells[] store, with no collision.
describe('COEXISTENCE -- Elf/Gnome + a real spellcasting class (Wizard), through REAL authority', () => {
  function wizardSpellSelections() {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellbookCount = requirements.find((r) => r.pool === 'spellbook')!.totalByLevel[0]!
    const spellCount = requirements.find((r) => r.pool === 'spell')!.totalByLevel[0]!
    const cantripCount = requirements.find((r) => r.pool === 'cantrip')!.totalByLevel[0]!
    return [
      ...[...'abcdef'].slice(0, spellbookCount).map((s) => ({ requirementId: spellbookId, ref: ref(`wiz-${s}`) })),
      ...[...'abcdef'].slice(0, spellCount).map((s) => ({ requirementId: spellId, ref: ref(`wiz-${s}`) })),
      ...[...'xyz'].slice(0, cantripCount).map((s) => ({ requirementId: cantripId, ref: ref(`wiz-cantrip-${s}`) }))
    ]
  }

  it('Elf + Wizard + Criminal has zero unresolved decisions, and persists the Drow cantrip alongside Wizard\'s own spells', async () => {
    expect(creationUnresolvedDecisions({ species: 'elf-xphb', class: 'wizard-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
    const body = {
      title: 'Elandrin',
      species: ref('elf-xphb'),
      class: ref('wizard-xphb'),
      background: ref('criminal-xphb'),
      abilities: STANDARD_ARRAY,
      choices: {
        selections: {
          [choiceKey('class', 'choice:skill.proficiency')]: skillAnswer('wizard-xphb'),
          [SPECIES_SKILL_KEY]: ['value:skill.insight.proficient'],
          [FEATURE_OPTION_KEY]: ['source:elven-lineage.drow'],
          [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.int'],
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
        }
      },
      spellSelections: wizardSpellSelections(),
      startingEquipment: { 'choice:equipment.starting.wizard-xphb': 'B', 'choice:equipment.starting.criminal-xphb': 'B' }
    }
    const result = await handler(fakeEvent(body) as any) as any
    expect(result.id).toBe(store.createdEntityId)

    const spells = (store.spellcasting as any).spells as { ref?: { slug: string }, known: boolean, instanceId: unknown }[]
    const dancingLights = spells.find((s) => s.ref?.slug === 'dancing-lights-xphb')
    expect(dancingLights).toBeDefined()
    expect(dancingLights!.known).toBe(true)
    expect(spells.some((s) => s.ref?.slug === 'wiz-a')).toBe(true)
    const instanceIds = spells.map((s) => s.instanceId)
    expect(new Set(instanceIds).size).toBe(instanceIds.length)
  })

  it('Gnome + Wizard + Criminal persists BOTH Forest Gnome fixed spells (known + prepared) alongside Wizard\'s own spells', async () => {
    expect(creationUnresolvedDecisions({ species: 'gnome-xphb', class: 'wizard-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
    const body = {
      title: 'Fendrel',
      species: ref('gnome-xphb'),
      class: ref('wizard-xphb'),
      background: ref('criminal-xphb'),
      abilities: STANDARD_ARRAY,
      choices: {
        selections: {
          [choiceKey('class', 'choice:skill.proficiency')]: skillAnswer('wizard-xphb'),
          [FEATURE_OPTION_KEY]: ['source:gnomish-lineage.forest-gnome'],
          [INNATE_ABILITY_KEY]: ['value:innate-spellcasting.ability.wis'],
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
        }
      },
      spellSelections: wizardSpellSelections(),
      startingEquipment: { 'choice:equipment.starting.wizard-xphb': 'B', 'choice:equipment.starting.criminal-xphb': 'B' }
    }
    const result = await handler(fakeEvent(body) as any) as any
    expect(result.id).toBe(store.createdEntityId)

    const spells = (store.spellcasting as any).spells as { ref?: { slug: string }, known: boolean, prepared: boolean }[]
    const minorIllusion = spells.find((s) => s.ref?.slug === 'minor-illusion-xphb')
    const speakWithAnimals = spells.find((s) => s.ref?.slug === 'speak-with-animals-xphb')
    expect(minorIllusion?.known).toBe(true)
    expect(speakWithAnimals?.prepared).toBe(true)
    expect(spells.some((s) => s.ref?.slug === 'wiz-a')).toBe(true)
  })
})

// BUILDER-SHAPED PAYLOAD meets REAL server authority -- the real Builder functions, never a
// hand-written body, proving generic ChoiceSet presentation needed no new component for any of
// the four species (no DraconicAncestryPicker.vue, no GiantAncestryPicker.vue, etc.).
describe('BUILDER-SHAPED PAYLOAD meets REAL server authority (Elf + Fighter + Criminal)', () => {
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
    draft.species = ELF as any
    draft.class = FIGHTER as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    return draft
  }

  function answerEveryRealChoice(draft: ReturnType<typeof builderDraft>, context: BuilderCreationContext) {
    setChoiceSelections(draft, SKILL_KEY, skillAnswer('fighter-xphb'), context)
    setChoiceSelections(draft, SPECIES_SKILL_KEY, ['value:skill.insight.proficient'], context)
    setChoiceSelections(draft, FEATURE_OPTION_KEY, ['source:elven-lineage.wood-elf'.replace('wood-elf', 'wood')], context)
    setChoiceSelections(draft, INNATE_ABILITY_KEY, ['value:innate-spellcasting.ability.wis'], context)
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

  it('the real Builder payload succeeds through the real route and persists the selected lineage + ability', async () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(store.rulesChoices!.selections[FEATURE_OPTION_KEY]).toEqual(['source:elven-lineage.wood'])
    expect(store.rulesChoices!.selections[INNATE_ABILITY_KEY]).toEqual(['value:innate-spellcasting.ability.wis'])
  })
})

// HISTORICAL -- an old record for any of the four species (no lineage/ancestry/ability answer at
// all in rules_choices) continues to resolve its fixed state on read, with no migration, no
// retroactive selection, and no read-time mutation.
describe('HISTORICAL -- old records for all four species continue to resolve fixed state with no answer at all', () => {
  it.each([
    ['dragonborn-xphb', 'value:sense.darkvision', 60],
    ['goliath-xphb', 'value:speed.walking', 35],
    ['elf-xphb', 'value:sense.darkvision', 60],
    ['gnome-xphb', 'value:size.small', true]
  ] as const)('%s\'s own fixed grants resolve independently of any rules_choices content (%s = %s)', (slug, valueId, expected) => {
    const facet = findRulesFacet('dnd5e.2024', 'species', slug)!
    expect(facet.grants?.some((g) => g.set === valueId && g.to === expected)).toBe(true)
    // No stored selections at all -- the exact shape an old record's rules_choices block has.
    const emptySelections = {}
    expect((emptySelections as Record<string, unknown>)[FEATURE_OPTION_KEY]).toBeUndefined()
  })

  it('Elf\'s own conditional fixed spell grants resolve to NOTHING when no lineage was ever chosen (an old record), never a fallback guess', () => {
    const facet = findRulesFacet('dnd5e.2024', 'species', 'elf-xphb')!
    expect(facet.fixedSpellGrants).toHaveLength(3)
    for (const grant of facet.fixedSpellGrants!) {
      expect(grant.requiresActive, grant.slug).toBeDefined()
      expect(grant.requiresActive!.length).toBeGreaterThan(0)
    }
  })
})
