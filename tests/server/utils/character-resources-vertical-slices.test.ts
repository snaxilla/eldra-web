// D&D 2024 Character Rules Phase 2A.2 -- GENERIC CHARACTER RESOURCES,
// VERTICAL SLICE / FULL ROUND-TRIP REGRESSION.
//
// Proves the whole chain -- persisted block_instances data -> real
// `assembleCharacter` -> real `character-actor-bridge.ts` -> real
// `evaluate()` -- against the REAL shipped `eldra-dnd5e-2024` package and
// the REAL authored `dnd5e-2024.ts` facet corpus, never a hand-typed
// fixture that could silently drift from either. Mirrors
// tests/server/utils/character-confirm-rules-choices-regression.test.ts's
// own precedent exactly (only `directusServiceRequest`/
// `getWorldContentCatalogue`/`getWorldRuntime` mocked; `assembleCharacter`
// itself is never mocked), because the previous phase's own real defect
// shipped unnoticed specifically BECAUSE every existing test mocked
// `assembleCharacter` directly.
//
// Three structurally different real resources, chosen per this phase's own
// VERTICAL SLICE REQUIREMENTS after the corpus audit:
//   1. Rage (Barbarian) -- TABLE-SHAPED max (a smooth per-level curve),
//      always-on from level 1, asymmetric Short-Rest(+1)/Long-Rest(full)
//      recovery.
//   2. Bardic Inspiration (Bard) -- ABILITY-DERIVED max (Charisma modifier,
//      NOT a level table), dice-valued presentation (die size scales
//      independently of count), Long-Rest-only recovery.
//   3. Superiority Dice (Battle Master, a SUBCLASS resource, proving
//      resource acquisition is not class-slot-specific) -- STEP-FUNCTION
//      max, dice-valued presentation, symmetric Short-Rest/Long-Rest(full)
//      recovery.
// Plus Fighter's Action Surge/Indomitable/Second Wind for PROGRESSION
// TESTING (level-gated acquisition) and Sorcerer's Sorcery Points for the
// "max is a direct `@value:level` reference" case.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock, getWorldContentCatalogueMock, getWorldRuntimeMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn(),
  getWorldRuntimeMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))
vi.mock('../../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))
vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { getDerivedCharacter } from '../../../server/utils/character-derived'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const WORLD_ID = '5'
const CHARACTER_ID = '77'

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

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

function catalogue(overrides: Record<string, unknown> = {}) {
  return {
    worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [],
    feats: [], items: [], spells: [], monsters: [], subclasses: [],
    ...overrides
  }
}

function mockEntityAndBlocks(input: {
  classSlug: string
  level: number
  subclassSlug?: string | null
  abilityScores: Record<string, number>
  resourcesExpended?: Record<string, number>
}) {
  const progression = {
    classes: [{
      classRef: { packageId: 'eldra.content.xphb', slug: input.classSlug },
      level: input.level,
      subclassRef: input.subclassSlug ? { packageId: 'eldra.content.xphb', slug: input.subclassSlug } : null
    }],
    feats: []
  }

  directusServiceRequestMock.mockImplementation(async (path: string) => {
    if (path === `/items/entities/${CHARACTER_ID}`) {
      return { data: { id: Number(CHARACTER_ID), world_id: Number(WORLD_ID), title: 'Slice Test', entity_type: 'pc' } }
    }
    if (path === '/items/block_instances') {
      return {
        data: [
          { block_key: 'catalogue_selection', data: { species: { packageId: 'eldra.content.xphb', slug: 'human-xphb' }, class: { packageId: 'eldra.content.xphb', slug: input.classSlug }, background: { packageId: 'eldra.content.xphb', slug: 'sage-xphb' } } },
          { block_key: 'ability_scores', data: { method: 'standard-array', scores: input.abilityScores } },
          { block_key: 'progression', data: progression },
          { block_key: 'resources', data: { expended: input.resourcesExpended ?? {} } }
        ]
      }
    }
    throw new Error(`unexpected directusServiceRequest path: ${path}`)
  })
}

function findResource(resources: readonly { id: string }[], id: string) {
  return resources.find((r) => r.id === id)
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  getWorldContentCatalogueMock.mockReset()
  getWorldRuntimeMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
})

describe('SLICE 1 -- Rage (Barbarian): table-shaped max, asymmetric SR/LR recovery', () => {
  it('a level-1 Barbarian has Rage with max 2, full remaining', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'barbarian-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'barbarian-xphb', level: 1, abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    const rage = findResource(result.derived.resources, 'resource:rage')
    expect(rage).toMatchObject({ max: 2, expended: 0, remaining: 2 })
    expect(rage?.recovery).toEqual([
      { trigger: 'short-rest', amount: 1 },
      { trigger: 'long-rest', amount: 'full' }
    ])
  })

  it('Rage max scales up at the real XPHB level breakpoints (3, 6, 12, 17)', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'barbarian-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined })]
    }))

    const expectations: [number, number][] = [[2, 2], [5, 3], [11, 4], [16, 5], [20, 6]]
    for (const [level, expectedMax] of expectations) {
      mockEntityAndBlocks({ classSlug: 'barbarian-xphb', level, abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })
      const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
      expect(result.available).toBe(true)
      if (!result.available) continue
      expect(findResource(result.derived.resources, 'resource:rage')?.max).toBe(expectedMax)
    }
  })

  it('persisted expenditure round-trips (2 of 3 spent at level 5)', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'barbarian-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({
      classSlug: 'barbarian-xphb', level: 5,
      abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
      resourcesExpended: { 'resource:rage': 2 }
    })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:rage')).toMatchObject({ max: 3, expended: 2, remaining: 1 })
  })

  it('MAX-CHANGE SAFETY: expended above a (lower-level) max normalizes to max, never a negative remaining', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'barbarian-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined })]
    }))
    // Max at level 1 is 2, but 5 were persisted as expended (e.g. a
    // subsequent level-DOWN or package change) -- must clamp, never crash
    // or go negative.
    mockEntityAndBlocks({
      classSlug: 'barbarian-xphb', level: 1,
      abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
      resourcesExpended: { 'resource:rage': 5 }
    })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:rage')).toMatchObject({ max: 2, expended: 2, remaining: 0 })
  })

  it('RELOAD TEST: repeated independent reads are byte-identical, never drift', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'barbarian-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({
      classSlug: 'barbarian-xphb', level: 5,
      abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
      resourcesExpended: { 'resource:rage': 1 }
    })

    const first = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    const second = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(first.available && second.available).toBe(true)
    if (!first.available || !second.available) return
    expect(findResource(first.derived.resources, 'resource:rage'))
      .toEqual(findResource(second.derived.resources, 'resource:rage'))
  })
})

describe('SLICE 2 -- Bardic Inspiration (Bard): ability-derived max, dice presentation, Long-Rest-only', () => {
  it('max equals the Charisma modifier (CHA 16 -> +3), never a level table', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'bard-xphb', level: 1, abilityScores: { str: 8, dex: 12, con: 10, int: 10, wis: 10, cha: 16 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    const bardic = findResource(result.derived.resources, 'resource:bardic_inspiration')
    expect(bardic).toMatchObject({ max: 3, expended: 0, remaining: 3 })
    expect(bardic?.recovery).toEqual([{ trigger: 'long-rest', amount: 'full' }])
    expect(bardic?.presentation).toEqual({ style: 'dice', dieFaces: 6 })
  })

  it('a minimum of 1 even with a Charisma PENALTY (RAW "minimum of once")', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'bard-xphb', level: 1, abilityScores: { str: 8, dex: 12, con: 10, int: 10, wis: 10, cha: 8 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:bardic_inspiration')?.max).toBe(1)
  })

  it('die size scales independently of count at levels 5/10/15', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })]
    }))

    const expectations: [number, number][] = [[4, 6], [5, 8], [9, 8], [10, 10], [14, 10], [15, 12], [20, 12]]
    for (const [level, dieFaces] of expectations) {
      mockEntityAndBlocks({ classSlug: 'bard-xphb', level, abilityScores: { str: 8, dex: 12, con: 10, int: 10, wis: 10, cha: 16 } })
      const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
      expect(result.available).toBe(true)
      if (!result.available) continue
      expect(findResource(result.derived.resources, 'resource:bardic_inspiration')?.presentation.dieFaces).toBe(dieFaces)
      // die size scaling is independent of count: max stays the CHA modifier at every level above.
      expect(findResource(result.derived.resources, 'resource:bardic_inspiration')?.max).toBe(3)
    }
  })
})

describe('SLICE 3 -- Superiority Dice (Battle Master subclass): SUBCLASS RESOURCE PROOF, step-function max, SR+LR recovery', () => {
  it('a Fighter with NO subclass selected does not expose Superiority Dice', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'fighter-xphb', level: 3, abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:superiority_dice')).toBeUndefined()
  })

  it('a Fighter with the Battle Master subclass selected exposes Superiority Dice -- proves acquisition is not class-slot-specific', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })],
      subclasses: [baseEntry({ slug: 'battle-master-xphb', parentClassSlug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'subclass', 'battle-master-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'fighter-xphb', level: 3, subclassSlug: 'battle-master-xphb', abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    const dice = findResource(result.derived.resources, 'resource:superiority_dice')
    expect(dice).toMatchObject({ max: 4, expended: 0, remaining: 4 })
    expect(dice?.presentation).toEqual({ style: 'dice', dieFaces: 8 })
    expect(dice?.recovery).toEqual([
      { trigger: 'short-rest', amount: 'full' },
      { trigger: 'long-rest', amount: 'full' }
    ])
  })

  it('Superiority Dice count and die size both scale at the real step levels (7/15 count, 10/18 die)', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })],
      subclasses: [baseEntry({ slug: 'battle-master-xphb', parentClassSlug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'subclass', 'battle-master-xphb') ?? undefined })]
    }))

    const expectations: [number, number, number][] = [[6, 4, 8], [7, 5, 8], [9, 5, 8], [10, 5, 10], [14, 5, 10], [15, 6, 10], [18, 6, 12]]
    for (const [level, count, dieFaces] of expectations) {
      mockEntityAndBlocks({ classSlug: 'fighter-xphb', level, subclassSlug: 'battle-master-xphb', abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })
      const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
      expect(result.available).toBe(true)
      if (!result.available) continue
      const dice = findResource(result.derived.resources, 'resource:superiority_dice')
      expect(dice?.max).toBe(count)
      expect(dice?.presentation.dieFaces).toBe(dieFaces)
    }
  })
})

describe('PROGRESSION TESTING -- level-gated resource acquisition (Fighter: Second Wind / Action Surge / Indomitable)', () => {
  it('resource absent before acquisition level: Action Surge and Indomitable do not exist at level 1', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'fighter-xphb', level: 1, abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:second_wind')).toBeDefined()
    expect(findResource(result.derived.resources, 'resource:action_surge')).toBeUndefined()
    expect(findResource(result.derived.resources, 'resource:indomitable')).toBeUndefined()
  })

  it('resource APPEARS at its real acquisition level: Action Surge at 2, Indomitable at 9', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'fighter-xphb', level: 2, abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })

    let result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (result.available) {
      expect(findResource(result.derived.resources, 'resource:action_surge')).toBeDefined()
      expect(findResource(result.derived.resources, 'resource:indomitable')).toBeUndefined()
    }

    mockEntityAndBlocks({ classSlug: 'fighter-xphb', level: 9, abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })
    result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:indomitable')).toBeDefined()
  })

  it('scaling maximum changes at the correct levels: Action Surge 1 -> 2 at level 17', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })]
    }))

    mockEntityAndBlocks({ classSlug: 'fighter-xphb', level: 16, abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })
    let result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available && findResource(result.available ? result.derived.resources : [], 'resource:action_surge')?.max).toBe(1)

    mockEntityAndBlocks({ classSlug: 'fighter-xphb', level: 17, abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } })
    result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:action_surge')?.max).toBe(2)
  })
})

describe('SORCERY POINTS -- max as a direct @value:level reference (no table, no ability, the simplest possible case)', () => {
  it('max equals the character level exactly, once acquired at level 2', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'sorcerer-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'sorcerer-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'sorcerer-xphb', level: 7, abilityScores: { str: 8, dex: 12, con: 12, int: 10, wis: 10, cha: 14 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:sorcery_points')).toMatchObject({ max: 7, expended: 0, remaining: 7 })
  })

  it('absent at level 1 (not yet acquired)', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'sorcerer-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'sorcerer-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'sorcerer-xphb', level: 1, abilityScores: { str: 8, dex: 12, con: 12, int: 10, wis: 10, cha: 14 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:sorcery_points')).toBeUndefined()
  })
})

describe('UNRESOLVED RESOURCE IDS -- a persisted expenditure key for a resource the package no longer declares', () => {
  it('does not crash assembly or derivation, and is simply absent from the result', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'barbarian-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'barbarian-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({
      classSlug: 'barbarian-xphb', level: 1,
      abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
      resourcesExpended: { 'resource:no-longer-published-feature': 3, 'resource:rage': 1 }
    })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.derived.resources.map((r) => r.id)).not.toContain('resource:no-longer-published-feature')
    expect(findResource(result.derived.resources, 'resource:rage')).toMatchObject({ expended: 1, remaining: 1 })
  })
})

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules Phase 2A.2 (follow-up) -- RANGER COMPLETENESS.
// ---------------------------------------------------------------------------

describe('RANGER -- Favored Enemy (always-on) and Tireless (level-gated)', () => {
  it('a level-1 Ranger has Favored Enemy (max 2) but not Tireless (not yet acquired)', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'ranger-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'ranger-xphb', level: 1, abilityScores: { str: 12, dex: 16, con: 14, int: 8, wis: 14, cha: 10 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:favored_enemy')).toMatchObject({ max: 2, expended: 0, remaining: 2 })
    expect(findResource(result.derived.resources, 'resource:tireless')).toBeUndefined()
  })

  it('Favored Enemy scales at the real breakpoints (5/9/13/17), Long-Rest-only recovery', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'ranger-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb') ?? undefined })]
    }))
    const expectations: [number, number][] = [[4, 2], [5, 3], [8, 3], [9, 4], [12, 4], [13, 5], [16, 5], [17, 6]]
    for (const [level, max] of expectations) {
      mockEntityAndBlocks({ classSlug: 'ranger-xphb', level, abilityScores: { str: 12, dex: 16, con: 14, int: 8, wis: 14, cha: 10 } })
      const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
      expect(result.available).toBe(true)
      if (!result.available) continue
      const fe = findResource(result.derived.resources, 'resource:favored_enemy')
      expect(fe?.max).toBe(max)
      expect(fe?.recovery).toEqual([{ trigger: 'long-rest', amount: 'full' }])
    }
  })

  it('Tireless appears at level 10, max = Wisdom modifier (min 1), Long-Rest-only', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'ranger-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'ranger-xphb', level: 9, abilityScores: { str: 12, dex: 16, con: 14, int: 8, wis: 16, cha: 10 } })
    let result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (result.available) expect(findResource(result.derived.resources, 'resource:tireless')).toBeUndefined()

    mockEntityAndBlocks({ classSlug: 'ranger-xphb', level: 10, abilityScores: { str: 12, dex: 16, con: 14, int: 8, wis: 16, cha: 10 } })
    result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:tireless')).toMatchObject({ max: 3, remaining: 3 })
  })

  it('Tireless with a Wisdom PENALTY still has a minimum of 1 (RAW "minimum of once")', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'ranger-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'ranger-xphb', level: 10, abilityScores: { str: 12, dex: 16, con: 14, int: 8, wis: 8, cha: 10 } })
    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:tireless')?.max).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules Phase 2A.2 (follow-up) -- BARD FONT OF
// INSPIRATION. Proves the level-gated recovery-rule architecture
// (ResourceRecoveryRule.condition) against the real authored resource, with
// ZERO Bard-specific branching anywhere in character-recovery.ts (verified
// by reading the diff -- that file only ever reads the already-resolved
// `DerivedResource.recovery` array).
// ---------------------------------------------------------------------------

describe('BARD -- Font of Inspiration (level-gated recovery-rule upgrade)', () => {
  it('below level 5: Bardic Inspiration recovers on Long Rest ONLY -- no Short Rest entry at all', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'bard-xphb', level: 4, abilityScores: { str: 8, dex: 12, con: 10, int: 10, wis: 10, cha: 16 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    const bardic = findResource(result.derived.resources, 'resource:bardic_inspiration')
    expect(bardic?.recovery).toEqual([{ trigger: 'long-rest', amount: 'full' }])
  })

  it('at level 5+: Bardic Inspiration ALSO recovers on Short Rest -- the Font of Inspiration upgrade, derived generically', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'bard-xphb', level: 5, abilityScores: { str: 8, dex: 12, con: 10, int: 10, wis: 10, cha: 16 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    const bardic = findResource(result.derived.resources, 'resource:bardic_inspiration')
    expect(bardic?.recovery).toEqual([
      { trigger: 'long-rest', amount: 'full' },
      { trigger: 'short-rest', amount: 'full' }
    ])
  })

  it('stays upgraded at higher levels (20) -- the condition is level>=5, not level===5', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'bard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'bard-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'bard-xphb', level: 20, abilityScores: { str: 8, dex: 12, con: 10, int: 10, wis: 10, cha: 16 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    const bardic = findResource(result.derived.resources, 'resource:bardic_inspiration')
    expect(bardic?.recovery).toContainEqual({ trigger: 'short-rest', amount: 'full' })
  })
})

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules Phase 2A.2 (follow-up) -- LARGE NUMERIC POOL
// ACCEPTANCE (Lay on Hands, 'points' presentation).
// ---------------------------------------------------------------------------

describe('LARGE POOL -- Lay on Hands at level 20 (max 100)', () => {
  it('resolves max 100 and selects the points presentation style', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'paladin-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'paladin-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({ classSlug: 'paladin-xphb', level: 20, abilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 } })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    const loh = findResource(result.derived.resources, 'resource:lay_on_hands')
    expect(loh).toMatchObject({ max: 100, expended: 0, remaining: 100 })
    expect(loh?.presentation).toEqual({ style: 'points' })
  })

  it('persisted expenditure (e.g. 83 spent) round-trips correctly at level 20', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'paladin-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'paladin-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({
      classSlug: 'paladin-xphb', level: 20,
      abilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 },
      resourcesExpended: { 'resource:lay_on_hands': 83 }
    })

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(findResource(result.derived.resources, 'resource:lay_on_hands')).toMatchObject({ max: 100, expended: 83, remaining: 17 })
  })

  it('RELOAD TEST: repeated independent reads at level 20 are byte-identical', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogue({
      classes: [baseEntry({ slug: 'paladin-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'paladin-xphb') ?? undefined })]
    }))
    mockEntityAndBlocks({
      classSlug: 'paladin-xphb', level: 20,
      abilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 },
      resourcesExpended: { 'resource:lay_on_hands': 42 }
    })

    const first = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    const second = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(first.available && second.available).toBe(true)
    if (!first.available || !second.available) return
    expect(findResource(first.derived.resources, 'resource:lay_on_hands'))
      .toEqual(findResource(second.derived.resources, 'resource:lay_on_hands'))
  })
})
