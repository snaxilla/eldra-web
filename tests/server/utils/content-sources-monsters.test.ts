// Unit tests for the Monster publication pipeline pieces added as the
// architecture's monster acceptance task (see
// .github/docs/architecture/content-source-architecture.md and this
// task's own design write-up): loadMonsterDatasetEntries/walkBestiaryFiles
// (server/utils/content-sources/dnd5e/5etools-dataset.ts),
// toMonsterContentPublicationCandidates
// (server/utils/content-pack-monsters-adapter.ts), and the optional
// `loadCandidates` per-category escape hatch on create5eToolsCollectionProvider
// (server/utils/content-sources/dnd5e/5etools-collection.ts).
//
// The plumbing tests below prove the mechanics in isolation, the same way
// srd51Provider's dataset helpers were provable before any route ever
// called them. The final `describe('xmmProvider', ...)` block exercises the
// REAL, registered Monster Manual (2025) collection
// (server/utils/content-sources/dnd5e/xmm.ts) end-to-end against this same
// fixture, proving the plumbing and the actual collection agree.
//
// Same mocking split as content-sources-providers.test.ts: only
// `node:fs/promises` is mocked (standing in for the on-disk dataset); every
// parser/adapter/factory function runs for real.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

// Fluff is listed BEFORE the stat-block file in FIXTURE_DIRS below, on
// purpose: loadMonsterDatasetEntries must join correctly regardless of
// which file family is walked first (see its own header).
const FIXTURE_FILES: Record<string, string> = {
  [`${DATA_ROOT}/bestiary/fluff-bestiary-xmm.json`]: JSON.stringify({
    monsterFluff: [
      { name: 'Goblin', source: 'XMM', entries: ['A small, vicious humanoid that lives to cause trouble.'] }
    ]
  }),
  [`${DATA_ROOT}/bestiary/bestiary-xmm.json`]: JSON.stringify({
    monster: [
      {
        name: 'Goblin',
        source: 'XMM',
        page: 166,
        size: ['S'],
        type: 'humanoid',
        ac: [15],
        hp: { average: 7, formula: '2d6' },
        str: 8,
        dex: 14,
        con: 10,
        int: 10,
        wis: 8,
        cha: 8,
        cr: '1/4'
      },
      // Same shared file also carries a non-XMM entry -- membership must be
      // entry-level here too, same as every other category (architecture
      // doc §2.3).
      { name: 'Owlbear', source: 'MM', page: 249, size: ['L'], type: 'monstrosity', ac: [13], hp: { average: 59 } }
    ]
  }),
  // Foundry VTT companion export -- same exclusion rule as every other
  // category (isFoundryCompanionFile), carries a DUPLICATE Goblin/XMM entry
  // under a Foundry-shaped body that must never leak in.
  [`${DATA_ROOT}/bestiary/foundry.json`]: JSON.stringify({
    monster: [{ name: 'Goblin', source: 'XMM', advancement: [{ type: 'ScaleValue' }], migrationVersion: 3 }]
  }),
  // Support files that share the /bestiary/ directory but carry neither a
  // `monster` nor `monsterFluff` array -- must contribute zero rows without
  // needing their own exclusion rule (5etools-dataset.ts's own header).
  [`${DATA_ROOT}/bestiary/index.json`]: JSON.stringify({ XMM: { random: 'index data' } }),
  [`${DATA_ROOT}/bestiary/legendarygroups.json`]: JSON.stringify({ legendaryGroup: [{ name: 'Some Group', source: 'XMM' }] }),
  [`${DATA_ROOT}/bestiary/template.json`]: JSON.stringify({ monsterTemplate: [{ name: 'Some Template' }] })
}

const FIXTURE_DIRS: Record<string, string[]> = {
  [DATA_ROOT]: ['bestiary'],
  [`${DATA_ROOT}/bestiary`]: [
    'fluff-bestiary-xmm.json',
    'bestiary-xmm.json',
    'foundry.json',
    'index.json',
    'legendarygroups.json',
    'template.json'
  ]
}

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(async (dirPath: string) => {
    const names = FIXTURE_DIRS[dirPath] ?? []
    return names.map((name) => {
      const full = `${dirPath}/${name}`
      const isDir = Object.prototype.hasOwnProperty.call(FIXTURE_DIRS, full)
      return { name, isDirectory: () => isDir, isFile: () => !isDir }
    })
  }),
  readFile: vi.fn(async (filePath: string) => {
    const content = FIXTURE_FILES[filePath]
    if (content === undefined) throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' })
    return content
  })
}))

import { DATA_ROOT as DATASET_ROOT, isEntryFromSource, loadDatasetEntries, loadMonsterDatasetEntries, walkJsonFiles } from '../../../server/utils/content-sources/dnd5e/5etools-dataset'
import { toMonsterContentPublicationCandidates } from '../../../server/utils/content-pack-monsters-adapter'
import { create5eToolsCollectionProvider } from '../../../server/utils/content-sources/dnd5e/5etools-collection'
import { validateContentPackForPublication } from '../../../server/utils/content-pack-publishing'
import { xmmProvider } from '../../../server/utils/content-sources/dnd5e/xmm'
import { getProvider } from '../../../server/utils/content-sources'

beforeEach(() => {
  vi.clearAllMocks()
})

describe("the 'monsters' DatasetKey", () => {
  it('locates both bestiary file families through the shared walk, excluding the Foundry companion export', async () => {
    const files = await walkJsonFiles(DATASET_ROOT, 'monsters')

    expect(files).toContain(`${DATA_ROOT}/bestiary/bestiary-xmm.json`)
    expect(files).toContain(`${DATA_ROOT}/bestiary/fluff-bestiary-xmm.json`)
    expect(files).not.toContain(`${DATA_ROOT}/bestiary/foundry.json`)
  })

  it('is rejected by loadDatasetEntries -- the one-key loader would silently drop the fluff join', async () => {
    await expect(loadDatasetEntries('monsters', () => true)).rejects.toThrow(/loadMonsterDatasetEntries/)
  })

  it('is absent from DATASETS, so no existing provider gains a monsters category', async () => {
    const { DATASETS } = await import('../../../server/utils/content-sources/dnd5e/5etools-dataset')
    expect(DATASETS).not.toContain('monsters')
    expect(DATASETS).toHaveLength(6)
  })
})

describe('loadMonsterDatasetEntries', () => {
  it('selects only the entry matching the membership predicate, from a file it shares with other sources', async () => {
    const rows = await loadMonsterDatasetEntries(isEntryFromSource('XMM'))

    expect(rows.map((r) => r.name)).toEqual(['Goblin'])
    expect(rows.map((r) => r.source)).toEqual(['XMM'])
  })

  it('joins fluff from the separate fluff-bestiary file by (name, source), regardless of file walk order', async () => {
    const rows = await loadMonsterDatasetEntries(isEntryFromSource('XMM'))

    expect(rows).toHaveLength(1)
    expect(rows[0].fluff).toMatchObject({
      name: 'Goblin',
      source: 'XMM',
      entries: ['A small, vicious humanoid that lives to cause trouble.']
    })
  })

  it('never admits the Foundry companion duplicate, even though it shares the real entry\'s (name, source)', async () => {
    const rows = await loadMonsterDatasetEntries(isEntryFromSource('XMM'))

    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('migrationVersion')
    expect(rows[0]).not.toHaveProperty('advancement')
  })

  it('produces no rows for a source with no bestiary presence', async () => {
    const rows = await loadMonsterDatasetEntries(isEntryFromSource('XDMG'))
    expect(rows).toEqual([])
  })
})

describe('toMonsterContentPublicationCandidates', () => {
  it('builds a complete, valid ContentPublicationCandidate from a joined monster row', async () => {
    const rows = await loadMonsterDatasetEntries(isEntryFromSource('XMM'))
    const { candidates, warnings } = toMonsterContentPublicationCandidates(rows)

    expect(warnings).toEqual([])
    expect(candidates).toHaveLength(1)

    const [goblin] = candidates
    expect(goblin.systemKey).toBe('dnd5e')
    expect(goblin.entityType).toBe('enemy')
    expect(goblin.title).toBe('Goblin')
    expect(goblin.externalId).toBe('Goblin__XMM')
    expect(goblin.provider).toBe('5etools-json')
    expect(goblin.sourceBook).toBe('XMM')
    expect(goblin.sourcePage).toBe('166')
    // `data` is the untouched upstream row -- never `blocks`/`summary`/`_monsterData`.
    expect(goblin.data).toMatchObject({ name: 'Goblin', source: 'XMM', hp: { average: 7, formula: '2d6' } })
    expect(goblin).not.toHaveProperty('blocks')
    expect(goblin).not.toHaveProperty('summary')
    expect(goblin).not.toHaveProperty('_monsterData')
  })

  it('produces candidates that satisfy the real publication validator', async () => {
    const rows = await loadMonsterDatasetEntries(isEntryFromSource('XMM'))
    const { candidates } = toMonsterContentPublicationCandidates(rows)

    const result = validateContentPackForPublication(
      { packageId: 'eldra.content.xmm-test', version: '1.0.0', title: 'Monster Manual (2024)', license: { id: 'proprietary' } },
      candidates
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('skips an entry with no source data and warns, rather than publishing an incomplete candidate', () => {
    const { candidates, warnings } = toMonsterContentPublicationCandidates([null])

    expect(candidates).toEqual([])
    expect(warnings).toEqual(['Skipped \'Untitled Monster\': no source data to publish.'])
  })

  it('two monsters produce distinct identities even with the same name from different sources', () => {
    const { candidates } = toMonsterContentPublicationCandidates([
      { name: 'Wolf', source: 'MM', page: 341 },
      { name: 'Wolf', source: 'XMM', page: 342 }
    ])

    expect(candidates).toHaveLength(2)
    expect(candidates[0].externalId).not.toBe(candidates[1].externalId)
    expect(candidates[0].slug).not.toBe(candidates[1].slug)
  })
})

describe('create5eToolsCollectionProvider -- optional loadCandidates hook', () => {
  it('a category with loadCandidates bypasses the default dataset pipeline entirely', async () => {
    const customLoader = vi.fn(async (membership: (entry: any) => boolean) => ({
      candidates: [
        {
          systemKey: 'dnd5e',
          entityType: 'enemy',
          title: 'Goblin',
          slug: 'goblin-xmm',
          externalId: 'Goblin__XMM',
          provider: '5etools-json',
          sourceBook: 'XMM',
          sourcePage: '166',
          data: { name: 'Goblin' }
        }
      ],
      warnings: []
    }))

    const provider = create5eToolsCollectionProvider({
      collectionKey: 'xmm-test',
      label: 'Monster Manual (2024) [test]',
      membership: isEntryFromSource('XMM'),
      categories: [{ key: 'monsters', label: 'Monsters', loadCandidates: customLoader }]
    })

    const result = await provider.loadCategory('monsters')

    expect(customLoader).toHaveBeenCalledTimes(1)
    expect(customLoader).toHaveBeenCalledWith(expect.any(Function))
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].title).toBe('Goblin')
  })

  it('a datasetKey category on the same provider is unaffected by a sibling loadCandidates category', async () => {
    const provider = create5eToolsCollectionProvider({
      collectionKey: 'mixed-test',
      label: 'Mixed [test]',
      membership: isEntryFromSource('XMM'),
      categories: [
        { key: 'monsters', label: 'Monsters', loadCandidates: async () => ({ candidates: [], warnings: [] }) },
        { key: 'items', label: 'Items', datasetKey: 'items' }
      ]
    })

    // Uses the real (mocked-fs) dataset pipeline -- proves the two category
    // kinds coexist on one provider without interfering with each other.
    // The fixture above has no items.json, so this legitimately finds
    // nothing -- the point is that it runs the DEFAULT pipeline at all
    // (reaching preview5eToolsItems's own "no items found" warning) rather
    // than being redirected to the sibling category's loadCandidates.
    const result = await provider.loadCategory('items')
    expect(result.candidates).toEqual([])
    expect(result.warnings).toEqual(['No items found. Expected an array of items or an object with an "item" array.'])
  })

  it('throws a clear error for a category defined with neither datasetKey nor loadCandidates', async () => {
    const provider = create5eToolsCollectionProvider({
      collectionKey: 'broken-test',
      label: 'Broken [test]',
      membership: isEntryFromSource('XMM'),
      categories: [{ key: 'nothing', label: 'Nothing' } as any]
    })

    await expect(provider.loadCategory('nothing')).rejects.toThrow(/neither datasetKey nor loadCandidates/i)
  })

  it('still throws the existing unknown-category error for a key the provider never declared', async () => {
    const provider = create5eToolsCollectionProvider({
      collectionKey: 'xmm-test',
      label: 'Monster Manual (2024) [test]',
      membership: isEntryFromSource('XMM'),
      categories: [{ key: 'monsters', label: 'Monsters', loadCandidates: async () => ({ candidates: [], warnings: [] }) }]
    })

    await expect(provider.loadCategory('spells')).rejects.toThrow(/unknown category/i)
  })
})

describe('xmmProvider -- the real, registered Monster Manual (2025) collection', () => {
  it('is registered and resolvable by (gameSystemKey, collectionKey)', () => {
    expect(getProvider('dnd5e', 'xmm')).toBe(xmmProvider)
    expect(xmmProvider.gameSystemKey).toBe('dnd5e')
    expect(xmmProvider.collectionKey).toBe('xmm')
    expect(xmmProvider.adapterId).toBe('5etools-json')
  })

  it('declares exactly one category -- monsters', () => {
    expect(xmmProvider.categories.map((c) => c.key)).toEqual(['monsters'])
  })

  it('loadCategory("monsters") produces the same fluff-joined, Foundry-excluded candidate the plumbing tests above prove in isolation', async () => {
    const { candidates, warnings } = await xmmProvider.loadCategory('monsters')

    expect(warnings).toEqual([])
    expect(candidates).toHaveLength(1)

    const [goblin] = candidates
    expect(goblin.title).toBe('Goblin')
    expect(goblin.sourceBook).toBe('XMM')
    expect(goblin.externalId).toBe('Goblin__XMM')
    expect(goblin).not.toHaveProperty('_monsterData')

    const result = validateContentPackForPublication(
      { packageId: 'eldra.content.xmm', version: '1.0.0', title: 'Monster Manual (2025)', license: { id: 'proprietary' } },
      candidates
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a category key it never declared', async () => {
    await expect(xmmProvider.loadCategory('spells')).rejects.toThrow(/unknown category/i)
  })
})
