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
  dwarf: entry('Dwarf', 'dwarf-xphb', null)
}
const CLASSES = {
  fighter: entry('Fighter', 'fighter-xphb', findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')),
  cleric: entry('Cleric', 'cleric-xphb', findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')),
  wizard: entry('Wizard', 'wizard-xphb', findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb'))
}
const BACKGROUNDS = {
  criminal: entry('Criminal', 'criminal-xphb', findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb')),
  artisan: entry('Artisan', 'artisan-xphb', findRulesFacet('dnd5e.2024', 'background', 'artisan-xphb'))
}
// Every XPHB background whose own Origin choice is unrecordable (its creation facet is unavailable).
const CREATION_UNAVAILABLE_BACKGROUNDS = ['Acolyte', 'Artisan', 'Charlatan', 'Entertainer', 'Guide', 'Noble', 'Sage', 'Scribe']
  .map((name) => entry(name, slugOf(name), findRulesFacet('dnd5e.2024', 'background', slugOf(name))))

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
  it('an Elf (lineage choice) is refused before any entity is created', async () => {
    await expect(handler(fakeEvent(bodyWith('elf-xphb', 'wizard-xphb', 'criminal-xphb')) as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/cannot be completed yet.*lineage or ancestry choice/) })
    expectNoWrites()
  })

  it('a Fighter (Weapon Mastery and proficiencies) on a Dwarf with a Criminal background is refused with zero writes', async () => {
    await expect(handler(fakeEvent(bodyWith('dwarf-xphb', 'fighter-xphb', 'criminal-xphb')) as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('cannot be completed yet') })
    expectNoWrites()
  })

  it('a Cleric whose Level-1 Divine Order cannot be recorded is refused, and the reason names the feature', async () => {
    await expect(handler(fakeEvent(bodyWith('dwarf-xphb', 'cleric-xphb', 'criminal-xphb')) as any))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Divine Order') })
    expectNoWrites()
  })

  // P7: Criminal's ability bonus is now representable; starting equipment (P8, out of scope) is
  // its remaining blocker, and the refusal names it in plain words.
  it('a background whose starting equipment cannot be recorded is refused, and the reason names the decision in plain words', async () => {
    const rejected = await handler(fakeEvent(bodyWith('dwarf-xphb', 'fighter-xphb', 'criminal-xphb')) as any).catch((error: any) => error)
    expect(rejected.statusCode).toBe(400)
    expect(rejected.message).toMatch(/starting equipment/)
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
})
