// PHASE 0 -- create-v2 POST is the server authority for creation, UNSTUBBED. A selection whose
// species, class, or background (or a feat acquired at creation) owns a mandatory decision Eldra
// cannot record is refused with HTTP 400 before any entity, progression, or other row is written.
// The Builder's disabled options are presentation; this file proves the server refuses the same
// selection on its own, so a crafted request cannot bypass the Builder.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const mocks = vi.hoisted(() => ({
  getWorldContentCatalogue: vi.fn(),
  getWorldRuntime: vi.fn(),
  createEntityRecord: vi.fn(),
  dxFetch: vi.fn(),
  saveCharacterAbilityScores: vi.fn(),
  saveCharacterRulesChoices: vi.fn(),
  saveCharacterProgression: vi.fn(),
  saveCharacterHealth: vi.fn(),
  getDerivedCharacter: vi.fn()
}))

vi.mock('../../../../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: mocks.getWorldContentCatalogue }))
vi.mock('../../../../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: mocks.getWorldRuntime }))
vi.mock('../../../../../../server/utils/entity-factory', () => ({ createEntityRecord: mocks.createEntityRecord, dxFetch: mocks.dxFetch }))
vi.mock('../../../../../../server/utils/character-ability-scores', () => ({ saveCharacterAbilityScores: mocks.saveCharacterAbilityScores }))
vi.mock('../../../../../../server/utils/character-rules-choices', () => ({ saveCharacterRulesChoices: mocks.saveCharacterRulesChoices, loadCharacterRulesChoices: vi.fn() }))
vi.mock('../../../../../../server/utils/character-progression', () => ({ saveCharacterProgression: mocks.saveCharacterProgression }))
vi.mock('../../../../../../server/utils/character-health', () => ({ saveCharacterHealth: mocks.saveCharacterHealth }))
vi.mock('../../../../../../server/utils/character-derived', () => ({ getDerivedCharacter: mocks.getDerivedCharacter }))

;(globalThis as any).createError = (input: { statusCode: number, statusMessage?: string }) =>
  Object.assign(new Error(input.statusMessage ?? 'error'), { statusCode: input.statusCode, message: input.statusMessage ?? 'error' })

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn(async (event: any) => event._requestBody) }
})

import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import { findRulesFacet } from '../../../../../../app/lib/content-rules'
import { resolveDnd5eFeatMechanics } from '../../../../../../app/lib/feat-mechanics/dnd5e'
import xphbFeats from '../../../../../lib/feat-mechanics/fixtures/xphb-feats.json'

const WORLD_ID = '5'
const PKG = 'eldra.solaris.xphb'
const slugOf = (name: string) => `${name.toLowerCase().replace(/ /g, '-')}-xphb`

const entry = (title: string, slug: string, facet: any) => ({
  packageId: PKG, packageVersion: '1.0.10', systemKey: 'dnd5e', title, slug, externalId: `${title}__XPHB`, provider: '5etools-json',
  rulesFacet: facet ?? undefined
})

const SPECIES = {
  elf: entry('Elf', 'elf-xphb', findRulesFacet('dnd5e.2024', 'species', 'elf-xphb')),
  tiefling: entry('Tiefling', 'tiefling-xphb', findRulesFacet('dnd5e.2024', 'species', 'tiefling-xphb')),
  human: entry('Human', 'human-xphb', findRulesFacet('dnd5e.2024', 'species', 'human-xphb')),
  dwarf: entry('Dwarf', 'dwarf-xphb', null)
}
const CLASSES = {
  fighter: entry('Fighter', 'fighter-xphb', findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')),
  cleric: entry('Cleric', 'cleric-xphb', findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')),
  wizard: entry('Wizard', 'wizard-xphb', findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')),
  warlock: entry('Warlock', 'warlock-xphb', findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')),
  rogue: entry('Rogue', 'rogue-xphb', findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb'))
}
const BACKGROUNDS = {
  criminal: entry('Criminal', 'criminal-xphb', findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb')),
  artisan: entry('Artisan', 'artisan-xphb', findRulesFacet('dnd5e.2024', 'background', 'artisan-xphb'))
}
// Every XPHB background whose own Origin choice is unrecordable (its creation facet is unavailable).
// FEAT-OWNED SPELL ACQUISITION PHASE -- Acolyte/Guide/Sage are REMOVED from this list: their shared
// blocker (Magic Initiate's own spell decisions) is now representable (facet:spellRequirements), so
// they are no longer creation-unavailable at Phase 0. With this fixture's bare catalogue (no spell
// entries, no spell answers supplied) they still reject -- but for an entirely different, mechanics-
// level reason (Wizard's own unanswered spellbook requirement), not an unrecordable decision, so they
// no longer belong in a list asserting "cannot be chosen at creation yet". A real acceptance walk for
// Acolyte/Guide/Sage lives in create-v2-fighter-mechanics.test.ts.
// D&D 2024 Character Rules A1 -- Artisan/Charlatan/Entertainer/Noble/Scribe are REMOVED too:
// Crafter/Musician/Skilled's own nested tool/instrument/skill-or-tool choices are now representable
// (each has its own real RulesFacet), so none of these 5 is creation-unavailable at Phase 0 anymore.
// Requesting one WITHOUT its own nested answer still rejects -- but for the same mechanics-level
// "this feat's own choice must be answered" reason Crafter's own facet now enforces, not an
// unrecordable decision. A real acceptance walk for Artisan lives in create-v2-fighter-mechanics.test.ts.
const CREATION_UNAVAILABLE_BACKGROUNDS: ReturnType<typeof entry>[] = []

// The World catalogue carries the real feat mechanics (the Criminal Origin feat is resolved first).
const FEATS = xphbFeats.feats.map((raw) => ({
  ...entry(raw.name, slugOf(raw.name), findRulesFacet('dnd5e.2024', 'feat', slugOf(raw.name))),
  featMechanics: resolveDnd5eFeatMechanics(raw)
}))

const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: Object.values(SPECIES), classes: Object.values(CLASSES), backgrounds: [...Object.values(BACKGROUNDS), ...CREATION_UNAVAILABLE_BACKGROUNDS],
  feats: FEATS, subclasses: [], items: [], spells: [], monsters: []
}

const STANDARD_ARRAY = { method: 'standard-array', scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }
const ref = (slug: string) => ({ packageId: PKG, slug })

function bodyWith(species: string, cls: string, background: string, overrides: Record<string, unknown> = {}) {
  return { title: 'Brenna', species: ref(species), class: ref(cls), background: ref(background), abilities: STANDARD_ARRAY, ...overrides }
}

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

function expectNoWrites() {
  expect(mocks.createEntityRecord).not.toHaveBeenCalled()
  expect(mocks.dxFetch).not.toHaveBeenCalled()
  expect(mocks.saveCharacterProgression).not.toHaveBeenCalled()
  expect(mocks.saveCharacterAbilityScores).not.toHaveBeenCalled()
  expect(mocks.saveCharacterRulesChoices).not.toHaveBeenCalled()
  expect(mocks.saveCharacterHealth).not.toHaveBeenCalled()
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.getWorldContentCatalogue.mockResolvedValue(CATALOGUE)
  mocks.getWorldRuntime.mockResolvedValue({ configured: false, ok: false })
  mocks.createEntityRecord.mockResolvedValue({ id: 4242 })
  mocks.getDerivedCharacter.mockResolvedValue({ available: false, reason: 'rules-unconfigured', message: 'no rules package' })
})

describe('PHASE 0 -- creation is refused, with zero writes, when a selected entity owns an unrecordable decision', () => {
  // PURE-AUTHORING SPECIES SWEEP -- Elf's own lineage choice is now representable (choice:species
  // .feature-option); Tiefling replaced it last phase. TIEFLING SPECIES COMPLETION -- Tiefling
  // itself is now REMOVED too (all 3 of its own decisions are implemented). HUMAN + GENERIC
  // SELECTED-FEAT ACTIVATION PHASE -- Human (this test's own prior example) is REMOVED too: its
  // own size choice and free Origin-feat choice (Versatile) are both representable now (Species
  // 10/10, see creation-availability.test.ts). No species remains that Phase 0 refuses alone; a
  // real Human acceptance walk (with its own new mandatory answers correctly supplied) lives in
  // create-v2-fighter-mechanics.test.ts.

  // WEAPON MASTERY PHASE -- Dwarf + Fighter + Criminal is now creation-complete through the real
  // authority (see create-v2-weapon-mastery.test.ts). ROGUE EXPERTISE PHASE -- Rogue's Expertise
  // was then implemented too, but its own remaining real blocker (Thieves' Cant / language
  // policy) was still untouched. LANGUAGE CORPUS + POLICY PHASE -- that blocker is now ALSO
  // implemented (the real decision was Thieves' Cant's own embedded "one other language", not
  // Thieves' Cant itself, which is a fixed grant). Dwarf + Rogue + Criminal is now creation-
  // complete through the real authority (see create-v2-rogue-expertise.test.ts's own FIRST REAL
  // LANGUAGE ACCEPTANCE block). ELDRITCH INVOCATIONS PHASE -- Warlock's own remaining Eldritch
  // Invocations blocker is now ALSO implemented (see create-v2-invocations.test.ts for the full
  // acceptance walk) -- Dwarf + Warlock + Criminal is now creation-complete too. This file's own
  // remaining real refusal case for Warlock is therefore no longer "the whole class is blocked"
  // (nothing is, anymore) but "a genuinely mandatory creation-time choice was left unanswered" --
  // proven here exactly as every other creation-time ChoiceSet's own missing-answer case is.
  it('a Warlock whose Level-1 Eldritch Invocation choice is left unanswered is refused with zero writes', async () => {
    await expect(handler(fakeEvent(bodyWith('dwarf-xphb', 'warlock-xphb', 'criminal-xphb')) as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  // The generic choice:class.accumulating-option ChoiceSet is deliberately feature/class-name-
  // agnostic (per this phase's own homebrew-reuse requirement), so an unknown/outside-the-family
  // option id is rejected the same way any other illegal ChoiceSet answer is -- never by matching
  // on the word "Invocation".
  it('a Warlock request naming an unknown Invocation identity is refused with zero writes', async () => {
    const crafted = bodyWith('dwarf-xphb', 'warlock-xphb', 'criminal-xphb', {
      choices: { selections: { 'class:choice:class.accumulating-option': ['value:invocation.does_not_exist.known'] } }
    })
    await expect(handler(fakeEvent(crafted) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it('the refusal message never exposes an internal identifier', async () => {
    const rejected = await handler(fakeEvent(bodyWith('elf-xphb', 'fighter-xphb', 'artisan-xphb')) as any).catch((error: any) => error)
    expect(rejected.statusCode).toBe(400)
    expect(rejected.message).not.toMatch(/blk:|ENGINE_BLOCKED|CONTENT_BLOCKED|startingProficiencies|additionalSpells|toolProficiencies|anyFromCategory|\bfeats\./)
    expectNoWrites()
  })

  it('a crafted request that names a fixed Origin feat or an undeclared content key is still refused, with zero writes', async () => {
    const crafted = bodyWith('dwarf-xphb', 'wizard-xphb', 'criminal-xphb', {
      contentChoices: { 'background:progression:1:grant:origin': ['x::tough-xphb'] },
      originFeat: 'tough-xphb'
    })
    await expect(handler(fakeEvent(crafted) as any)).rejects.toMatchObject({ statusCode: 400 })
    expectNoWrites()
  })

  it.each(CREATION_UNAVAILABLE_BACKGROUNDS.map((b) => b.title))('%s is refused by the real authority before any write', async (name) => {
    await expect(handler(fakeEvent(bodyWith('dwarf-xphb', 'wizard-xphb', slugOf(name))) as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/cannot be chosen at creation yet|cannot be completed yet/) })
    expectNoWrites()
  })

  // FEAT-OWNED SPELL ACQUISITION PHASE -- Acolyte/Guide/Sage no longer carry an unrecordable
  // decision at all; this fixture's bare catalogue still refuses them, but only because Wizard's
  // own spellbook requirement is left unanswered here, never because of their shared Magic
  // Initiate blocker (which is implemented). Proves the two rejections are not the same one.
  it.each(['Acolyte', 'Guide', 'Sage'])('%s is refused here for an unrelated, unanswered spell choice, not an unrecordable decision', async (name) => {
    const rejected = await handler(fakeEvent(bodyWith('dwarf-xphb', 'wizard-xphb', slugOf(name))) as any).catch((error: any) => error)
    expect(rejected.statusCode).toBe(400)
    expect(rejected.message).not.toMatch(/cannot be chosen at creation yet|cannot be completed yet/)
    expectNoWrites()
  })
})
