// Unit tests for server/utils/catalogue-entity-bridge.ts -- Content Pack
// Browsers Regression Repair. Mirrors
// tests/server/utils/world-content-catalogue.test.ts's own shape:
// resolveWorldContent (the one I/O boundary this module composes) is
// mocked; every `preview5eTools*` importer function runs for REAL (they are
// already pure and already tested elsewhere), so these tests prove the
// actual `.blocks`/`statblock`/`actions` shape produced from a realistic
// raw 5etools payload, not a mocked stand-in for it.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveWorldContentMock } = vi.hoisted(() => ({
  resolveWorldContentMock: vi.fn()
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

import {
  getCatalogueBackedEntityRows,
  getCatalogueBackedEnemyRows
} from '../../../server/utils/catalogue-entity-bridge'
import type { WorldContentCatalogue, WorldContentEntry } from '../../../server/utils/world-content-runtime'

function entry(overrides: Partial<WorldContentEntry> = {}): WorldContentEntry {
  return {
    systemKey: 'dnd5e',
    entityType: 'spell',
    title: 'Fire Bolt',
    slug: 'fire-bolt-phb',
    externalId: 'Fire Bolt__PHB',
    provider: '5etools-json',
    sourceBook: 'PHB',
    sourcePage: '211',
    data: { name: 'Fire Bolt', source: 'PHB', level: 0, school: 'E' },
    packageId: 'eldra.content.srd-5.1',
    packageVersion: '1.0.0',
    ...overrides
  }
}

function byEntityType(entries: WorldContentEntry[]): WorldContentCatalogue['byEntityType'] {
  const grouped: WorldContentCatalogue['byEntityType'] = {}
  for (const e of entries) {
    grouped[e.entityType] = grouped[e.entityType] || []
    grouped[e.entityType].push(e)
  }
  return grouped
}

function resolved(entries: WorldContentEntry[]): WorldContentCatalogue {
  return {
    worldId: '5',
    packs: [],
    entries,
    byEntityType: byEntityType(entries)
  }
}

beforeEach(() => {
  resolveWorldContentMock.mockReset()
})

describe('getCatalogueBackedEntityRows', () => {
  it('resolves each of the five catalogue-backed browser types to the correct published entries', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved([
      entry({ entityType: 'spell', title: 'Fire Bolt', slug: 'fire-bolt-phb', data: { name: 'Fire Bolt', source: 'PHB', level: 0, school: 'E', range: { type: 'point', distance: { type: 'feet', amount: 120 } } } }),
      entry({ entityType: 'species', title: 'Human', slug: 'human-phb', data: { name: 'Human', source: 'PHB', size: ['M'], speed: 30 } }),
      entry({ entityType: 'item', title: 'Potion of Healing', slug: 'potion-of-healing-phb', data: { name: 'Potion of Healing', source: 'PHB', rarity: 'common' } }),
      entry({ entityType: 'class', title: 'Fighter', slug: 'fighter-phb', data: { name: 'Fighter', source: 'PHB', hd: { number: 1, faces: 10 } } }),
      entry({ entityType: 'feat', title: 'Grappler', slug: 'grappler-phb', data: { name: 'Grappler', source: 'PHB', category: 'G' } }),
      // Not a catalogue-backed category -- must not appear in any output row.
      entry({ entityType: 'background', title: 'Acolyte', slug: 'acolyte-phb', data: { name: 'Acolyte', source: 'PHB' } })
    ]))

    const rows = await getCatalogueBackedEntityRows('5', ['spell', 'species', 'race', 'item', 'class', 'feat'])

    expect(rows.map((r) => r.entity_type).sort()).toEqual(['class', 'feat', 'item', 'species', 'spell'])
    expect(rows.every((r) => r.__source === 'catalogue')).toBe(true)
    expect(rows.every((r) => r.world_id === '5')).toBe(true)

    const spellRow = rows.find((r) => r.entity_type === 'spell')!
    const spellCore = spellRow.blocks.find((b) => b.blockKey === 'spell_core')?.data
    expect(spellCore?.level).toBe(0)
    expect(spellCore?.school).toBe('E')

    const itemRow = rows.find((r) => r.entity_type === 'item')!
    expect(itemRow.blocks.find((b) => b.blockKey === 'item_core')?.data?.rarity).toBe('common')

    const classRow = rows.find((r) => r.entity_type === 'class')!
    expect(classRow.blocks.find((b) => b.blockKey === 'class_core')?.data?.hit_die).toBeTruthy()

    const featRow = rows.find((r) => r.entity_type === 'feat')!
    expect(featRow.blocks.find((b) => b.blockKey === 'feat_core')?.data?.category).toBe('G')

    const speciesRow = rows.find((r) => r.entity_type === 'species')!
    expect(speciesRow.blocks.find((b) => b.blockKey === 'species_core')?.data?.speed).toBeTruthy()
  })

  it('produces stable, unique ids derived from the published pack and slug (not a Directus id -- there is no backing entities row)', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved([
      entry({ entityType: 'item', title: 'Rope', slug: 'rope-phb', packageId: 'eldra.content.srd-5.1' })
    ]))

    const [row] = await getCatalogueBackedEntityRows('5', ['item'])

    expect(row.id).toBe('catalogue:eldra.content.srd-5.1:rope-phb')
  })

  it('passes the worldId through to resolveWorldContent unchanged (world scoping/authorization is resolveWorldContent\'s own concern)', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved([]))

    await getCatalogueBackedEntityRows('42', ['spell'])

    expect(resolveWorldContentMock).toHaveBeenCalledWith('42')
  })

  it('does not call resolveWorldContent at all for a type filter with no catalogue-backed category (e.g. location/character)', async () => {
    const rows = await getCatalogueBackedEntityRows('5', ['location', 'character', 'npc'])

    expect(rows).toEqual([])
    expect(resolveWorldContentMock).not.toHaveBeenCalled()
  })

  it('returns a genuinely empty list for a requested type with zero published entries -- a real empty state, not an error', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved([
      entry({ entityType: 'spell', title: 'Fire Bolt' })
      // no 'item' entries bound at all
    ]))

    const rows = await getCatalogueBackedEntityRows('5', ['item'])

    expect(rows).toEqual([])
  })

  it('degrades one malformed entry to empty blocks rather than failing the whole browser', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved([
      // `data` is not an object a spell previewer can read entries out of
      // (extractSpellsFromPayload expects an array/object) -- this must not
      // throw out of getCatalogueBackedEntityRows.
      entry({ entityType: 'spell', title: 'Broken Entry', slug: 'broken-entry', data: null }),
      entry({ entityType: 'spell', title: 'Fire Bolt', slug: 'fire-bolt-phb' })
    ]))

    const rows = await getCatalogueBackedEntityRows('5', ['spell'])

    expect(rows).toHaveLength(2)
    const healthy = rows.find((r) => r.slug === 'fire-bolt-phb')!
    expect(healthy.blocks.find((b) => b.blockKey === 'spell_core')).toBeTruthy()
  })
})

describe('getCatalogueBackedEnemyRows', () => {
  it('rebuilds the same statblock/actions/monsterProfile shape enemies.get.ts already queries for a legacy enemy, traced from preview5eToolsMonsters', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved([
      entry({
        entityType: 'enemy',
        title: 'Goblin',
        slug: 'goblin-mm',
        data: {
          name: 'Goblin',
          source: 'MM',
          size: ['S'],
          type: 'humanoid',
          alignment: ['N', 'E'],
          ac: [15],
          hp: { average: 7, formula: '2d6' },
          str: 8,
          dex: 14,
          con: 10,
          int: 10,
          wis: 8,
          cha: 8,
          cr: '1/4',
          action: [{ name: 'Scimitar', entries: ['Melee Weapon Attack: +4 to hit.'] }]
        }
      })
    ]))

    const [row] = await getCatalogueBackedEnemyRows('5')

    expect(row.entityType).toBe('enemy')
    expect(row.__source).toBe('catalogue')
    expect(row.statblock?.armor_class).toBe(15)
    expect(row.statblock?.hit_points_average).toBe(7)
    expect(row.statblock?.str_score).toBe(8)
    expect(row.statblock?.challenge_rating).toBe('1/4')
    expect(row.actions).toHaveLength(1)
    expect(row.actions[0]).toMatchObject({ action_type: 'action', name: 'Scimitar' })
  })

  it('returns a genuinely empty list when the World has no bound "enemy" entries', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved([entry({ entityType: 'spell' })]))

    const rows = await getCatalogueBackedEnemyRows('5')

    expect(rows).toEqual([])
  })

  it('does not let one malformed entry take down the whole roster -- the healthy entry alongside it still resolves fully', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved([
      // preview5eToolsMonsters is defensive (optional-chains every field), so a
      // degenerate `data` does not throw -- it just produces a mostly-blank
      // entry. The contract this proves is the one that actually matters:
      // one bad entry never prevents the REST of the roster from resolving.
      entry({ entityType: 'enemy', title: 'Broken', slug: 'broken', data: null }),
      entry({ entityType: 'enemy', title: 'Goblin', slug: 'goblin-mm', data: { name: 'Goblin', source: 'MM', ac: [15] } })
    ]))

    const rows = await getCatalogueBackedEnemyRows('5')

    expect(rows).toHaveLength(2)
    const healthy = rows.find((r) => r.slug === 'goblin-mm')!
    expect(healthy.statblock?.armor_class).toBe(15)
  })
})
