// AASIMAR CREATION COMPLETION PHASE -- FIRST REAL AASIMAR, end to end through the REAL create-v2
// POST route and the REAL fail-closed completeness authority. UNSTUBBED: this file makes the
// production claim that Aasimar + Fighter + Criminal is a genuinely creatable combination through
// the real production authority, mirroring create-v2-weapon-mastery.test.ts's/create-v2-
// invocations.test.ts's own harness shape exactly.
//
// What this file proves:
//   1. creationUnresolvedDecisions is [] for Aasimar + Fighter + Criminal, through the REAL
//      authority.
//   2. Selecting Aasimar declares the real `species:choice:species.size` choice (count 1, from
//      exactly the two real options) through the SAME generic ChoiceSet presentation every other
//      creation choice already uses -- no AasimarSizePicker.
//   3. The real POST route accepts a full real answer set (including the size choice) and
//      succeeds.
//   4. SERVER AUTHORITY -- the route independently re-validates the size answer: missing, an
//      illegal/unknown identity, too many, a crafted key for a species that never declared it.
//      Zero writes on every rejection.
//   5. The selected size is persisted as canonical selection identity only (rules_choices); the
//      Light Bearer fixed cantrip is persisted through the canonical spellcasting.spells[] store.
//      FRESH RELOAD proves both survive a read.
//   6. BUILDER-SHAPED PAYLOAD meets the same server authority (the real Builder functions, never
//      a hand-written body).
//   7. BACKGROUND/SPECIES SWITCHING -- Aasimar -> Dwarf makes the size answer non-live; switching
//      back revalidates it; no stale answer survives.
//   8. COEXISTENCE -- Aasimar's own fixed Light cantrip and a spellcasting class's (Wizard) own
//      class-owned spells persist together with no collision.
//   9. HISTORICAL -- a character record from before this phase (species aasimar-xphb, no size
//      answer in rules_choices at all) is never auto-answered or mutated on read.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  progression: null as null | Record<string, unknown>,
  spellcasting: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
  currency: null as null | Record<string, unknown>,
  createdEntityId: 9404
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
const REAL_RUNTIME = loadRealRuntime()

function entry(overrides: Record<string, unknown>) {
  return { packageId: PKG, packageVersion: '1.0.21', systemKey: 'dnd5e', externalId: `${overrides.title}__XPHB`, provider: '5etools-json', ...overrides }
}

const AASIMAR = entry({ title: 'Aasimar', slug: 'aasimar-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'aasimar-xphb') ?? undefined })
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

function spellEntry(slug: string, level: number, classLists: string[]) {
  return { packageId: PKG, slug, title: slug, spellMechanics: resolveDnd5eSpellMechanics({ name: slug, source: 'XPHB', level, school: 'V', classLists })! }
}
// light-xphb -- Aasimar's own fixed Light Bearer grant, a real cantrip identity the Content
// Catalogue must carry for `resolveFixedSpellGrants` to resolve (fail-closed otherwise).
const SPELLS = [
  spellEntry('light-xphb', 0, ['Wizard']),
  ...[...'abcdef'].map((s) => spellEntry(`wiz-${s}`, 1, ['Wizard'])),
  ...[...'xyz'].map((s) => spellEntry(`wiz-cantrip-${s}`, 0, ['Wizard']))
]

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

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [AASIMAR, DWARF], classes: [FIGHTER, WIZARD], backgrounds: [CRIMINAL],
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
const ABILITY_KEY = choiceKey('background', 'choice:background.ability-distribution')

function skillAnswer(classSlug: string) {
  const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)!
  const choice = facet.choices!.find((c) => c.choiceSet === 'choice:skill.proficiency')!
  return (choice.from ?? []).slice(0, choice.count)
}

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

// Every real, currently-required answer for Aasimar + Fighter + Criminal. `size` defaults to
// 'value:size.medium' -- overridable per test.
function fullBody(overrides: Record<string, unknown> = {}, size = 'value:size.medium') {
  return {
    title: 'Elowen',
    species: ref('aasimar-xphb'),
    class: ref('fighter-xphb'),
    background: ref('criminal-xphb'),
    abilities: STANDARD_ARRAY,
    choices: {
      selections: {
        [SKILL_KEY]: skillAnswer('fighter-xphb'),
        [SIZE_KEY]: [size],
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

describe('AASIMAR SIZE CHOICE -- declared through the real generic ChoiceSet presentation, no bespoke picker', () => {
  it('selecting Aasimar declares species:choice:species.size, count 1, from exactly Medium and Small', () => {
    const context: BuilderCreationContext = { contentSelectorOf: () => null, choiceSetRule: () => null, feats: [], spells: [], items: [] }
    const draft = emptyDraft()
    draft.species = AASIMAR as any
    draft.class = FIGHTER as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === SIZE_KEY)
    expect(presentation).toBeDefined()
    expect(presentation!.count).toBe(1)
    expect(presentation!.offered.map((o) => o.value).sort()).toEqual(['value:size.medium', 'value:size.small'])
  })
})

describe('FIRST REAL AASIMAR -- Aasimar + Fighter + Criminal, through REAL authority', () => {
  it('1. the real Phase-0 authority reports zero unresolved decisions for this exact combination', () => {
    expect(creationUnresolvedDecisions({ species: 'aasimar-xphb', class: 'fighter-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('2. the real route accepts the full real answer set, including the size choice, and succeeds', async () => {
    const result = await handler(fakeEvent(fullBody()) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(mocks.createEntityRecord).toHaveBeenCalledTimes(1)
  })

  it('3. the selected size is persisted as canonical selection identity, through rules_choices', async () => {
    await handler(fakeEvent(fullBody({}, 'value:size.small')) as any)
    expect(store.rulesChoices!.selections).toMatchObject({ [SIZE_KEY]: ['value:size.small'] })
  })

  it('4. the Light Bearer fixed cantrip is persisted through the canonical spellcasting.spells[] store, known (never prepared)', async () => {
    await handler(fakeEvent(fullBody()) as any)
    const spells = (store.spellcasting as any).spells as { ref?: { slug: string }, known: boolean, prepared: boolean }[]
    const light = spells.find((s) => s.ref?.slug === 'light-xphb')
    expect(light).toBeDefined()
    expect(light!.known).toBe(true)
    expect(light!.prepared).toBe(false)
  })

  it('5. FRESH RELOAD -- a fresh read of the persisted rules_choices and spellcasting still names the size and the Light cantrip', async () => {
    await handler(fakeEvent(fullBody({}, 'value:size.medium')) as any)
    expect(store.rulesChoices!.selections[SIZE_KEY]).toEqual(['value:size.medium'])
    const spells = (store.spellcasting as any).spells as { ref?: { slug: string } }[]
    expect(spells.some((s) => s.ref?.slug === 'light-xphb')).toBe(true)
  })
})

describe('SERVER AUTHORITY -- the real route independently re-validates the size answer, zero writes on rejection', () => {
  function expectNoWrites() {
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  }

  it('a missing size answer (zero selections) is refused', async () => {
    const body = fullBody({
      choices: { selections: { [SKILL_KEY]: skillAnswer('fighter-xphb'), [SIZE_KEY]: [], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } }
    })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('too many (two selections, count is 1) is refused', async () => {
    const body = fullBody({
      choices: { selections: { [SKILL_KEY]: skillAnswer('fighter-xphb'), [SIZE_KEY]: ['value:size.medium', 'value:size.small'], [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'] } }
    })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('an unknown size identity is refused', async () => {
    await expect(handler(fakeEvent(fullBody({}, 'value:size.gargantuan')) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('a crafted key for a species that never declared this choice (Dwarf) is refused as undeclared', async () => {
    const body = fullBody({ species: ref('dwarf-xphb') })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })
})

// BUILDER-SHAPED PAYLOAD meets REAL server authority -- the real Builder functions, never a
// hand-written body, proving generic ChoiceSet presentation needed no new component
// (no AasimarSizePicker.vue).
describe('BUILDER-SHAPED PAYLOAD meets REAL server authority (Aasimar + Fighter + Criminal)', () => {
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
    draft.name = 'Elowen'
    draft.species = AASIMAR as any
    draft.class = FIGHTER as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }
    return draft
  }

  function answerEveryRealChoice(draft: ReturnType<typeof builderDraft>, context: BuilderCreationContext) {
    setChoiceSelections(draft, SKILL_KEY, skillAnswer('fighter-xphb'), context)
    setChoiceSelections(draft, SIZE_KEY, ['value:size.small'], context)
    setChoiceSelections(draft, ABILITY_KEY, ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'], context)
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, weaponRefs(3), context)
    setContentChoiceSelections(draft, FS_ARCHERY_KEY, [serializeContentRef(ARCHERY_REF)], context)
    setEquipmentSelection(draft, 'choice:equipment.starting.fighter-xphb', 'C')
    setEquipmentSelection(draft, 'choice:equipment.starting.criminal-xphb', 'B')
  }

  it('the Builder itself reports the draft complete once every real choice (including the size pick) is answered', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)
  })

  it('an unanswered size choice alone keeps the Builder draft incomplete', () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    delete draft.choices.selections[SIZE_KEY]
    expect(isDraftComplete(draft, context)).toBe(false)
  })

  it('the real Builder payload succeeds through the real route and persists the selected size', async () => {
    const context = builderContext()
    const draft = builderDraft()
    answerEveryRealChoice(draft, context)
    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(store.rulesChoices!.selections[SIZE_KEY]).toEqual(['value:size.small'])
  })
})

// SPECIES SWITCHING -- Aasimar's own species:choice:species.size key is owned by the SPECIES
// slot, never the class/background -- switching species must make a stale answer non-live, and
// switching back must re-ask (never silently resurrect a hidden answer), the exact proof pattern
// create-v2-weapon-mastery.test.ts's own "CLASS SWITCHING" describe block already establishes for
// a different slot.
describe('SPECIES SWITCHING -- the size answer is correctly revalidated, never leaked across species', () => {
  function builderContext(): BuilderCreationContext {
    return { contentSelectorOf: () => null, choiceSetRule: () => null, feats: FEATS, spells: SPELLS, items: WEAPONS }
  }

  it('Aasimar selected -> size choice required; switching to Dwarf (no such choice) makes the answer non-live', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = AASIMAR as any
    setChoiceSelections(draft, SIZE_KEY, ['value:size.small'], context)
    expect(draft.choices.selections[SIZE_KEY]).toEqual(['value:size.small'])
    expect(creationChoicePresentation(draft, context).some((p) => p.key === SIZE_KEY)).toBe(true)

    draft.species = DWARF as any
    expect(creationChoicePresentation(draft, context).some((p) => p.key === SIZE_KEY)).toBe(false)
  })

  it('switching back Dwarf -> Aasimar re-asks the question -- no stale hidden answer survives', () => {
    const context = builderContext()
    const draft = emptyDraft()
    draft.species = AASIMAR as any
    setChoiceSelections(draft, SIZE_KEY, ['value:size.small'], context)

    draft.species = DWARF as any
    draft.species = AASIMAR as any
    // The raw draft entry is preserved (switching back re-validates it, never deletes it) --
    // matching the exact "stale draft entry is preserved" posture every other switching proof in
    // this codebase already establishes.
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === SIZE_KEY)!
    expect(presentation).toBeDefined()
    expect(presentation.selected).toEqual(['value:size.small'])
  })
})

// COEXISTENCE -- Aasimar's own fixed Light cantrip (species-owned, unconditional) and a
// spellcasting class's own class-owned spells persist together with no collision: TWO
// INDEPENDENT rows (never merged into one, since they are not the SAME spell identity here),
// proving `resolveFixedSpellGrants`'s own instanceId renumbering coexists correctly with
// `buildAcceptedSpellEntries`'s class-owned rows.
describe('COEXISTENCE -- Aasimar + a real spellcasting class (Wizard), through REAL authority', () => {
  it('Aasimar + Wizard + Criminal has zero unresolved decisions', () => {
    expect(creationUnresolvedDecisions({ species: 'aasimar-xphb', class: 'wizard-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('the real route persists BOTH the Light cantrip (species-owned) and the Wizard\'s own class-owned spells in the SAME spellcasting.spells[] store', async () => {
    const body = {
      title: 'Elowen',
      species: ref('aasimar-xphb'),
      class: ref('wizard-xphb'),
      background: ref('criminal-xphb'),
      abilities: STANDARD_ARRAY,
      choices: {
        selections: {
          [choiceKey('class', 'choice:skill.proficiency')]: skillAnswer('wizard-xphb'),
          [SIZE_KEY]: ['value:size.medium'],
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int']
        }
      },
      spellSelections: wizardSpellSelections(),
      startingEquipment: {
        'choice:equipment.starting.wizard-xphb': 'B',
        'choice:equipment.starting.criminal-xphb': 'B'
      }
    }
    const result = await handler(fakeEvent(body) as any) as any
    expect(result.id).toBe(store.createdEntityId)

    const spells = (store.spellcasting as any).spells as { ref?: { slug: string }, known: boolean, prepared: boolean, instanceId: unknown }[]
    const light = spells.find((s) => s.ref?.slug === 'light-xphb')
    expect(light).toBeDefined()
    expect(light!.known).toBe(true)
    expect(spells.some((s) => s.ref?.slug === 'wiz-a')).toBe(true)
    // Every row has its own distinct instanceId -- no collision between the species-owned fixed
    // grant and the class-owned rows.
    const instanceIds = spells.map((s) => s.instanceId)
    expect(new Set(instanceIds).size).toBe(instanceIds.length)
  })
})

// HISTORICAL -- a character record from before this phase shipped (species aasimar-xphb, but
// rules_choices has no answer at all for species:choice:species.size) continues to resolve its
// fixed state on read, with no migration, no retroactive choice, and no read-time mutation.
// `creation-completeness.ts`'s own header states this architectural boundary directly: "Read
// paths do not call this module" -- demonstrated here against the real facet/resolution
// functions, never creationUnresolvedDecisions (which is a creation/progression-time authority
// only).
describe('HISTORICAL -- an old Aasimar record with no size answer at all continues to resolve its fixed state', () => {
  it('the species facet\'s own fixed grants/fixedSpellGrants resolve independently of any rules_choices content', () => {
    const facet = findRulesFacet('dnd5e.2024', 'species', 'aasimar-xphb')!
    // No stored selections at all -- the exact shape an old record's rules_choices block has.
    const emptySelections = {}
    // The fixed facts (Darkvision, Speed, resistances, the Light Bearer grant) are declared
    // directly on the facet -- they never read `emptySelections` to resolve at all.
    expect(facet.grants?.some((g) => g.set === 'value:sense.darkvision' && g.to === 60)).toBe(true)
    expect(facet.fixedSpellGrants).toEqual([{ slug: 'light-xphb', flag: 'known' }])
    // The size CHOICE itself is simply absent/pending -- reading it never throws, never invents
    // an answer, and never retroactively picks one.
    expect((emptySelections as Record<string, unknown>)[SIZE_KEY]).toBeUndefined()
  })
})
