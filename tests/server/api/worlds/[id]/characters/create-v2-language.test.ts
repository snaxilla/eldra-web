// D&D 2024 Character Rules -- LANGUAGE CORPUS + POLICY PHASE, the FULL native-XPHB language
// build model, end to end through the REAL create-v2 POST route and the REAL fail-closed
// completeness authority (UNSTUBBED -- see tests/rules/completeness-stub-policy.test.ts's own
// ACCEPTANCE category). Proves, for the first time, the universal "Choose Languages" creation
// rule (PHB chapter 2, p.37 -- Common plus two Standard languages, owned by the PACKAGE, never
// any one piece of content) alongside Rogue's own Thieves' Cant language choice.
//
// What this file proves:
//   1. The universal `universal:choice:language.known` choice now exists for EVERY class
//      (proven here for Fighter, which owns no language decision of its own at all) -- it did
//      not exist before this phase. A legal Standard-language answer lets Fighter creation
//      succeed.
//   2. Dwarf + Rogue + Criminal, answering EVERY real decision (ability distribution, class
//      skill proficiency, Weapon Mastery, Expertise, the universal +2 Standard languages, and
//      Rogue's own +1 Standard-or-Rare language), reaches `creationUnresolvedDecisions: []` and
//      succeeds through the real, unstubbed route -- both a hand-written body and a Builder-
//      shaped payload (emptyDraft/setChoiceSelections/toCreatePayload).
//   3. SERVER AUTHORITY: Common and Thieves' Cant (both FIXED grants) cannot be selected again
//      (excludeIfAlreadyActive); a Rare language cannot satisfy the Standard-only universal
//      choice; a language already picked by an EARLIER slot's own answer in the SAME creation
//      plan cannot be picked again by a LATER slot (cross-slot composition, no save/reload).
//   4. PERSISTENCE: the submitted answers persist through `rules_choices` (never a new
//      `character.languages[]` store), and feeding them back through the real `buildActorState`
//      bridge (server/utils/character-actor-bridge.ts) makes Common, both universal picks,
//      Thieves' Cant, and Rogue's own extra language all evaluate as active `value:language.
//      *.known` Values -- the canonical derived fact, never a second notion of "known".

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const store = vi.hoisted(() => ({
  progression: null as null | Record<string, unknown>,
  rulesChoices: null as null | Record<string, unknown>,
  createdEntityId: 9501
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
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'
import { serializeContentRef } from '../../../../../../app/lib/characters/progression-plan'
import { progressionChoiceKey, choiceKey } from '../../../../../../app/lib/characters/rules-choices'
import { buildActorState } from '../../../../../../server/utils/character-actor-bridge'
import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
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
const ROGUE = entry({ title: 'Rogue', slug: 'rogue-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb') ?? undefined })
const FIGHTER = entry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })
const CRIMINAL = entry({ title: 'Criminal', slug: 'criminal-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })

function weaponEntry(title: string, slug: string, raw: Record<string, unknown>) {
  return { ...entry({ title, slug }), itemMechanics: resolveDnd5eItemMechanics(raw) }
}
const WEAPONS = [
  weaponEntry('Dagger', 'dagger-xphb', { weaponCategory: 'simple', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB', 'T|XPHB'], mastery: ['Nick|XPHB'] }),
  weaponEntry('Shortsword', 'shortsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'] }),
  weaponEntry('Longsword', 'longsword-xphb', { weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] })
]
const WEAPON_MASTERY_KEY = progressionChoiceKey('class', 1, 'choice:class.weapon-mastery')
// Rogue's own real count is 2; Fighter's own real count is 3 -- `weaponRefs(count)` slices the
// SAME shared catalogue so both fixtures draw from one list.
function weaponRefs(count = 2) {
  return WEAPONS.slice(0, count).map((w) => serializeContentRef({ packageId: w.packageId, slug: w.slug }))
}

const FS_ARCHERY_KEY = progressionChoiceKey('class', 1, 'choice:feat.fighting-style.fs-only')
const ARCHERY_REF = { packageId: PKG, slug: 'archery-xphb' }

const FEATS = xphbFeats.feats.map((raw: { name: string }) => {
  const slug = `${raw.name.toLowerCase().replace(/ /g, '-')}-xphb`
  return { ...entry({ title: raw.name, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slug) ?? undefined }), featMechanics: resolveDnd5eFeatMechanics(raw) }
})

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [DWARF], classes: [ROGUE, FIGHTER], backgrounds: [CRIMINAL],
  feats: FEATS, subclasses: [], items: WEAPONS, monsters: [], spells: []
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 10, dex: 15, con: 13, int: 12, wis: 14, cha: 8 } }
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

const ABILITY_KEY = 'background:choice:background.ability-distribution'
const SKILL_KEY = 'class:choice:skill.proficiency'
const EXPERTISE_KEY = 'class:choice:skill.expertise'
const ROGUE_LANGUAGE_KEY = 'class:choice:language.known'
const UNIVERSAL_LANGUAGE_KEY = choiceKey('universal', 'choice:language.known')

function rogueSkillChoice() {
  return findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb')!.choices!.find((c) => c.choiceSet === 'choice:skill.proficiency')!
}
function fighterSkillChoice() {
  return findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')!.choices!.find((c) => c.choiceSet === 'choice:skill.proficiency')!
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  store.progression = null
  store.rulesChoices = null

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
      return { data: {} }
    }
    return { data: [] }
  })
})

describe('UNIVERSAL CHOICE -- "Choose Languages" now exists for every class, Fighter included', () => {
  function fighterBody(overrides: Record<string, unknown> = {}) {
    return {
      title: 'Brom',
      species: ref('dwarf-xphb'),
      class: ref('fighter-xphb'),
      background: ref('criminal-xphb'),
      abilities: STANDARD_ARRAY,
      choices: {
        selections: {
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'],
          [SKILL_KEY]: (fighterSkillChoice().from ?? []).slice(0, fighterSkillChoice().count),
          [UNIVERSAL_LANGUAGE_KEY]: ['value:language.draconic.known', 'value:language.dwarvish.known']
        }
      },
      contentChoices: { [FS_ARCHERY_KEY]: [serializeContentRef(ARCHERY_REF)], [WEAPON_MASTERY_KEY]: weaponRefs(3) },
      startingEquipment: { 'choice:equipment.starting.fighter-xphb': 'C', 'choice:equipment.starting.criminal-xphb': 'B' },
      ...overrides
    }
  }

  it('the universal choice is declared for Fighter, a class that owns no language decision of its own', () => {
    const context: BuilderCreationContext = { contentSelectorOf: () => null, choiceSetRule: () => null, feats: [], spells: [], items: [], universalFacet: REAL_RUNTIME.manifest.universalCreation ?? null }
    const draft = emptyDraft()
    draft.class = FIGHTER as any
    const presentation = creationChoicePresentation(draft, context).find((p) => p.key === UNIVERSAL_LANGUAGE_KEY)
    expect(presentation).toBeDefined()
    expect(presentation!.count).toBe(2)
  })

  it('a legal Standard-language answer (2, excluding Common) lets Fighter creation succeed', async () => {
    const result = await handler(fakeEvent(fighterBody()) as any) as any
    expect(result.id).toBe(store.createdEntityId)
    expect(store.rulesChoices).toMatchObject({ selections: { [UNIVERSAL_LANGUAGE_KEY]: ['value:language.draconic.known', 'value:language.dwarvish.known'] } })
  })

  it('SERVER AUTHORITY -- Common cannot be selected again (already fixed-known), zero writes', async () => {
    const body = fighterBody({ choices: { selections: { ...fighterBody().choices.selections, [UNIVERSAL_LANGUAGE_KEY]: ['value:language.common.known', 'value:language.draconic.known'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('SERVER AUTHORITY -- a Rare language cannot satisfy the Standard-only universal choice, zero writes', async () => {
    const body = fighterBody({ choices: { selections: { ...fighterBody().choices.selections, [UNIVERSAL_LANGUAGE_KEY]: ['value:language.abyssal.known', 'value:language.draconic.known'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('SERVER AUTHORITY -- too few (1 of 2) is rejected, zero writes', async () => {
    const body = fighterBody({ choices: { selections: { ...fighterBody().choices.selections, [UNIVERSAL_LANGUAGE_KEY]: ['value:language.draconic.known'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('exactly 2') })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('SERVER AUTHORITY -- a duplicate within the same answer is rejected, zero writes', async () => {
    const body = fighterBody({ choices: { selections: { ...fighterBody().choices.selections, [UNIVERSAL_LANGUAGE_KEY]: ['value:language.draconic.known', 'value:language.draconic.known'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })
})

describe('FIRST REAL LANGUAGE ACCEPTANCE -- Dwarf + Rogue + Criminal, every real decision answered', () => {
  function rogueBody(overrides: Record<string, unknown> = {}) {
    return {
      title: 'Sly',
      species: ref('dwarf-xphb'),
      class: ref('rogue-xphb'),
      background: ref('criminal-xphb'),
      abilities: STANDARD_ARRAY,
      choices: {
        selections: {
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'],
          [SKILL_KEY]: (rogueSkillChoice().from ?? []).filter((id) => id !== 'value:skill.sleight_of_hand.proficient' && id !== 'value:skill.stealth.proficient').slice(0, rogueSkillChoice().count),
          [EXPERTISE_KEY]: ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise'],
          [UNIVERSAL_LANGUAGE_KEY]: ['value:language.draconic.known', 'value:language.dwarvish.known'],
          [ROGUE_LANGUAGE_KEY]: ['value:language.abyssal.known']
        }
      },
      contentChoices: { [WEAPON_MASTERY_KEY]: weaponRefs() },
      startingEquipment: { 'choice:equipment.starting.rogue-xphb': 'B', 'choice:equipment.starting.criminal-xphb': 'B' },
      ...overrides
    }
  }

  it('the real Phase-0 authority reports zero unresolved decisions for Dwarf + Rogue + Criminal', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'rogue-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })

  it('the real route accepts the full real answer set and succeeds', async () => {
    const result = await handler(fakeEvent(rogueBody()) as any) as any
    expect(result.id).toBe(store.createdEntityId)
  })

  it('PERSISTENCE + DERIVED STATE -- Common, both universal picks, Thieves\' Cant, and Rogue\'s own extra language all evaluate active through the real bridge', async () => {
    await handler(fakeEvent(rogueBody()) as any)
    expect(store.rulesChoices).toMatchObject({
      selections: {
        [UNIVERSAL_LANGUAGE_KEY]: ['value:language.draconic.known', 'value:language.dwarvish.known'],
        [ROGUE_LANGUAGE_KEY]: ['value:language.abyssal.known']
      }
    })

    // Feed the real persisted rulesChoices back through the REAL character-actor-bridge, the
    // SAME translation layer a fresh Sheet/derived read would use -- never a second notion of
    // "which languages are known."
    const blueprint = {
      characterId: '1', worldId: WORLD_ID, characterTitle: 'Sly',
      species: { status: 'resolved' as const, entry: DWARF as any },
      class: { status: 'resolved' as const, entry: ROGUE as any },
      background: { status: 'resolved' as const, entry: CRIMINAL as any },
      abilityScores: { method: 'standard-array' as const, scores: STANDARD_ARRAY.scores },
      rulesChoices: store.rulesChoices as any,
      inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
      progression: { classes: [{ classRef: { packageId: PKG, slug: 'rogue-xphb' }, level: 1 }], items: [], feats: [] },
      resources: null, packs: []
    }
    const bridged = buildActorState({
      blueprint: blueprint as any,
      packageId: REAL_RUNTIME.packageId,
      packageVersion: REAL_RUNTIME.packageVersion,
      stateSchemaVersion: REAL_RUNTIME.manifest.stateSchemaVersion,
      knownDefinition: (id) => REAL_RUNTIME.registry.has(id),
      rulesChoices: store.rulesChoices as any,
      universalFacet: REAL_RUNTIME.manifest.universalCreation ?? null
    })

    expect(bridged.actorState.values['value:language.common.known']).toBe(true)
    expect(bridged.actorState.values['value:language.draconic.known']).toBe(true)
    expect(bridged.actorState.values['value:language.dwarvish.known']).toBe(true)
    expect(bridged.actorState.values['value:language.thieves_cant.known']).toBe(true)
    expect(bridged.actorState.values['value:language.abyssal.known']).toBe(true)
    // Nothing else is silently marked known.
    expect(bridged.actorState.values['value:language.elvish.known']).not.toBe(true)
  })

  it('BUILDER-SHAPED PAYLOAD -- the real Builder draft reaches complete and the real route accepts it', async () => {
    const context: BuilderCreationContext = {
      contentSelectorOf: (choiceSetId) => {
        const definition = REAL_RUNTIME.registry.getById(choiceSetId) as any
        return definition?.from?.kind === 'fromContentCatalogue' ? { category: definition.from.category, filter: definition.from.filter } : null
      },
      choiceSetRule: (choiceSetId) => {
        const definition = REAL_RUNTIME.registry.getById(choiceSetId) as any
        return definition ? { distinct: definition.distinct, maxPerOption: definition.maxPerOption } : null
      },
      feats: FEATS, spells: [], items: WEAPONS,
      universalFacet: REAL_RUNTIME.manifest.universalCreation ?? null
    }
    const draft = emptyDraft()
    draft.name = 'Sly'
    draft.species = DWARF as any
    draft.class = ROGUE as any
    draft.background = CRIMINAL as any
    draft.abilities.method = 'standard-array'
    draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY.scores }

    setChoiceSelections(draft, ABILITY_KEY, ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'], context)
    const skillChoice = rogueSkillChoice()
    setChoiceSelections(draft, SKILL_KEY, (skillChoice.from ?? []).filter((id) => id !== 'value:skill.sleight_of_hand.proficient' && id !== 'value:skill.stealth.proficient').slice(0, skillChoice.count), context)
    setChoiceSelections(draft, EXPERTISE_KEY, ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise'], context)
    setChoiceSelections(draft, UNIVERSAL_LANGUAGE_KEY, ['value:language.draconic.known', 'value:language.dwarvish.known'], context)
    setChoiceSelections(draft, ROGUE_LANGUAGE_KEY, ['value:language.abyssal.known'], context)
    setContentChoiceSelections(draft, WEAPON_MASTERY_KEY, weaponRefs(), context)
    setEquipmentSelection(draft, 'choice:equipment.starting.rogue-xphb', 'B')
    setEquipmentSelection(draft, 'choice:equipment.starting.criminal-xphb', 'B')

    expect(isDraftComplete(draft, context)).toBe(true)

    const payload = toCreatePayload(draft, context)!
    const result = await handler(fakeEvent(payload) as any) as any
    expect(result.id).toBe(store.createdEntityId)
  })
})

describe('SERVER AUTHORITY -- cross-slot composition, no save/reload round trip', () => {
  function rogueBody(overrides: Record<string, unknown> = {}) {
    return {
      title: 'Sly',
      species: ref('dwarf-xphb'),
      class: ref('rogue-xphb'),
      background: ref('criminal-xphb'),
      abilities: STANDARD_ARRAY,
      choices: {
        selections: {
          [ABILITY_KEY]: ['source:background.increase.dex', 'source:background.increase.con', 'source:background.increase.int'],
          [SKILL_KEY]: (rogueSkillChoice().from ?? []).filter((id) => id !== 'value:skill.sleight_of_hand.proficient' && id !== 'value:skill.stealth.proficient').slice(0, rogueSkillChoice().count),
          [EXPERTISE_KEY]: ['value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise'],
          [UNIVERSAL_LANGUAGE_KEY]: ['value:language.draconic.known', 'value:language.dwarvish.known'],
          [ROGUE_LANGUAGE_KEY]: ['value:language.abyssal.known']
        }
      },
      contentChoices: { [WEAPON_MASTERY_KEY]: weaponRefs() },
      startingEquipment: { 'choice:equipment.starting.rogue-xphb': 'B', 'choice:equipment.starting.criminal-xphb': 'B' },
      ...overrides
    }
  }

  it('a language already picked by the universal choice cannot ALSO be picked by Rogue\'s own choice in the SAME creation plan, zero writes', async () => {
    const body = rogueBody({ choices: { selections: { ...rogueBody().choices.selections, [ROGUE_LANGUAGE_KEY]: ['value:language.draconic.known'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })

  it('Thieves\' Cant cannot be selected again by Rogue\'s own language choice (already fixed-known), zero writes', async () => {
    const body = rogueBody({ choices: { selections: { ...rogueBody().choices.selections, [ROGUE_LANGUAGE_KEY]: ['value:language.thieves_cant.known'] } } })
    await expect(handler(fakeEvent(body) as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  })
})
