// Unit tests for server/utils/homebrew-spell-catalogue.ts -- Character
// Sheet Homebrew Spell Picker. The deployed bug: a custom spell ("Aids 2:
// The Squeakquel") appeared on the World's Spells list but never in the
// Character Sheet's Add Spell dialog, because that dialog's search is
// backed exclusively by getWorldContentCatalogue's Content-Pack-sourced
// `spells` category -- it never reads the legacy `entities` table a
// Homebrew spell lives in. getHomebrewSpellCatalogueEntries/
// getWorldGameplayCatalogueWithHomebrewSpells are the fix. Mirrors
// world-content-catalogue.test.ts's own mocking shape: resolveWorldContent
// is mocked so getWorldContentCatalogue's real mapping logic still runs;
// directusServiceRequest is mocked as the legacy-entities read boundary,
// matching tests/server/utils/homebrew.test.ts's own convention.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveWorldContentMock, directusServiceRequestMock } = vi.hoisted(() => ({
  resolveWorldContentMock: vi.fn(),
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/world-content-runtime', async () => {
  const actual = await vi.importActual<typeof import('../../../server/utils/world-content-runtime')>(
    '../../../server/utils/world-content-runtime'
  )
  return {
    ...actual,
    resolveWorldContent: resolveWorldContentMock
  }
})

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import {
  getHomebrewSpellCatalogueEntries,
  getWorldGameplayCatalogueWithHomebrewSpells,
  HOMEBREW_SPELL_PACKAGE_ID
} from '../../../server/utils/homebrew-spell-catalogue'
import type { WorldContentEntry } from '../../../server/utils/world-content-runtime'

function publishedEntry(overrides: Partial<WorldContentEntry> = {}): WorldContentEntry {
  return {
    systemKey: 'dnd5e',
    entityType: 'spell',
    title: 'Aid',
    slug: 'aid-xphb',
    externalId: 'Aid__XPHB',
    provider: '5etools-json',
    sourceBook: 'XPHB',
    sourcePage: '239',
    data: { name: 'Aid', level: 2, school: 'A' },
    packageId: 'eldra.content.srd-5.1',
    packageVersion: '1.0.0',
    ...overrides
  }
}

function resolvedCatalogue(entries: WorldContentEntry[]) {
  const byEntityType: Record<string, WorldContentEntry[]> = {}
  for (const e of entries) {
    byEntityType[e.entityType] = byEntityType[e.entityType] || []
    byEntityType[e.entityType].push(e)
  }
  return { worldId: '5', packs: [], entries, byEntityType }
}

function homebrewRow(overrides: Partial<{ id: number; title: string; slug: string; world_id: number; entity_type: string; system_key: string }> = {}) {
  return {
    id: 90,
    title: 'Aids 2: The Squeakquel',
    slug: 'aids-2-the-squeakquel',
    world_id: 5,
    entity_type: 'spell',
    system_key: 'dnd5e',
    ...overrides
  }
}

function mockEntitiesStore(rows: any[]) {
  directusServiceRequestMock.mockImplementation(async (path: string, options: any = {}) => {
    if (path === '/items/entities' && (options.method || 'GET') === 'GET') {
      const and: any[] = options.query?.filter?._and || []
      const worldFilter = and.find((f: any) => f.world_id)
      const typeFilter = and.find((f: any) => f.entity_type)
      const worldId = worldFilter?.world_id?._eq
      const entityType = typeFilter?.entity_type?._eq

      return {
        data: rows.filter((row) =>
          String(row.world_id) === String(worldId) && row.entity_type === entityType
        )
      }
    }

    return { data: [] }
  })
}

beforeEach(() => {
  resolveWorldContentMock.mockReset()
  directusServiceRequestMock.mockReset()
})

describe('getHomebrewSpellCatalogueEntries', () => {
  it('finds this World\'s Homebrew spell by its exact authored name, with no "Homebrew:" prefix', async () => {
    mockEntitiesStore([homebrewRow()])

    const entries = await getHomebrewSpellCatalogueEntries(5)

    expect(entries).toHaveLength(1)
    expect(entries[0].title).toBe('Aids 2: The Squeakquel')
    expect(entries[0].title.startsWith('Homebrew')).toBe(false)
  })

  it('carries explicit source identity (provider/sourceBook) without touching the authored title', async () => {
    mockEntitiesStore([homebrewRow()])

    const [entry] = await getHomebrewSpellCatalogueEntries(5)

    expect(entry.provider).toBe('eldra-homebrew')
    expect(entry.sourceBook).toBe('Homebrew')
    expect(entry.title).toBe('Aids 2: The Squeakquel')
  })

  it('uses a stable sentinel packageId paired with the entity\'s own slug, never a real published packageId', async () => {
    mockEntitiesStore([homebrewRow()])

    const [entry] = await getHomebrewSpellCatalogueEntries(5)

    expect(entry.packageId).toBe(HOMEBREW_SPELL_PACKAGE_ID)
    expect(entry.packageId).not.toMatch(/^eldra\.content\./)
    expect(entry.slug).toBe('aids-2-the-squeakquel')
  })

  it('never returns a spell authored in a different World', async () => {
    mockEntitiesStore([homebrewRow({ id: 91, world_id: 7, title: 'Some Other World\'s Spell', slug: 'some-other-worlds-spell' })])

    const entries = await getHomebrewSpellCatalogueEntries(5)

    expect(entries).toEqual([])
  })

  it('returns an empty list for a World with no Homebrew spells', async () => {
    mockEntitiesStore([])

    expect(await getHomebrewSpellCatalogueEntries(5)).toEqual([])
  })
})

describe('getWorldGameplayCatalogueWithHomebrewSpells', () => {
  it('keeps every published-pack spell exactly as getWorldContentCatalogue produced it', async () => {
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([publishedEntry()]))
    mockEntitiesStore([])

    const catalogue = await getWorldGameplayCatalogueWithHomebrewSpells(5)

    expect(catalogue.spells).toHaveLength(1)
    expect(catalogue.spells[0]).toMatchObject({ packageId: 'eldra.content.srd-5.1', slug: 'aid-xphb', title: 'Aid' })
  })

  it('additively appends this World\'s Homebrew spells alongside published ones, in the same `spells` category', async () => {
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([publishedEntry()]))
    mockEntitiesStore([homebrewRow()])

    const catalogue = await getWorldGameplayCatalogueWithHomebrewSpells(5)

    expect(catalogue.spells).toHaveLength(2)
    const titles = catalogue.spells.map((entry) => entry.title)
    expect(titles).toContain('Aid')
    expect(titles).toContain('Aids 2: The Squeakquel')
  })

  it('leaves every other catalogue category (species/classes/items/etc.) completely untouched', async () => {
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([
      publishedEntry(),
      publishedEntry({ entityType: 'item', title: 'Potion of Healing', slug: 'potion-of-healing-phb' })
    ]))
    mockEntitiesStore([homebrewRow()])

    const catalogue = await getWorldGameplayCatalogueWithHomebrewSpells(5)

    expect(catalogue.items).toHaveLength(1)
    expect(catalogue.items[0].title).toBe('Potion of Healing')
  })

  it('returns exactly getWorldContentCatalogue\'s own result, unchanged, when this World has no Homebrew spells', async () => {
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([publishedEntry()]))
    mockEntitiesStore([])

    const catalogue = await getWorldGameplayCatalogueWithHomebrewSpells(5)

    expect(catalogue.spells).toHaveLength(1)
    expect(catalogue.spells[0].packageId).toBe('eldra.content.srd-5.1')
  })
})
