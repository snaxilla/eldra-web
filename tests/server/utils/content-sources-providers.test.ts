// Unit tests for the 5etools Source Collection Providers -- srd51Provider
// and xphbProvider (server/utils/content-sources/dnd5e/*) -- and for the
// Foundry-companion-file exclusion in 5etools-dataset.ts's
// fileLooksRelevant that both depend on.
//
// Everything except the dataset itself runs for real: the real membership
// predicates, the real file walk, the real preview5eTools* parsers, and the
// real publication adapter. Only `node:fs/promises` is mocked, standing in
// for the on-disk 5etools dataset (which lives outside this repo at
// /opt/eldra/datasets and must not be a test dependency) -- the same split
// every other content-pack test in this suite already uses.
//
// The fixture deliberately reproduces the three dataset facts that make
// this collection pair hard, all verified against the real dataset:
//   1. PHB and XPHB entries SHARE files (class/class-fighter.json,
//      items.json) -- so collection membership must be an entry-level
//      predicate, never a file-name filter (architecture doc §2.3).
//   2. 5etools ships Foundry VTT companion exports in the same tree
//      (foundry-races.json, class/foundry.json, spells/foundry.json) whose
//      entries carry a real `source` but a Foundry-shaped body that parses
//      into blank husks.
//   3. Foundry entries carry no `srd` flag -- which is why this defect was
//      invisible until a source-code-keyed collection (XPHB) existed.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

const FIXTURE_FILES: Record<string, string> = {
  // Shared by PHB and XPHB -- fact 1.
  [`${DATA_ROOT}/class/class-fighter.json`]: JSON.stringify({
    class: [
      { name: 'Fighter', source: 'PHB', srd: true, page: 70, hd: { faces: 10 } },
      { name: 'Fighter', source: 'XPHB', page: 50, edition: 'one', hd: { faces: 10 }, primaryAbility: [{ str: true }] }
    ]
  }),
  [`${DATA_ROOT}/items.json`]: JSON.stringify({
    item: [
      { name: 'Longsword', source: 'PHB', srd: true, page: 149 },
      { name: 'Longsword', source: 'XPHB', page: 215 },
      { name: 'Bag of Holding', source: 'DMG', page: 153 },
      { name: '+1 Rod of the Pact Keeper', source: 'XDMG', page: 232 }
    ]
  }),
  [`${DATA_ROOT}/races.json`]: JSON.stringify({
    race: [
      { name: 'Human', source: 'PHB', srd: true, page: 31, ability: [{ str: 1 }] },
      { name: 'Human', source: 'XPHB', page: 194, edition: 'one' }
    ]
  }),
  [`${DATA_ROOT}/spells/spells-xphb.json`]: JSON.stringify({
    spell: [{ name: 'Fire Bolt', source: 'XPHB', page: 275, level: 0, school: 'V', entries: ['A mote of fire.'] }]
  }),

  // Foundry VTT companion exports -- fact 2. Same `source`, Foundry body.
  [`${DATA_ROOT}/foundry-races.json`]: JSON.stringify({
    race: [{ name: 'Dragonborn (Black)', source: 'XPHB', advancement: [{ type: 'ScaleValue' }], migrationVersion: 3 }]
  }),
  [`${DATA_ROOT}/class/foundry.json`]: JSON.stringify({
    class: [{ name: 'Fighter', source: 'XPHB', advancement: [{ type: 'ScaleValue' }], migrationVersion: 3 }]
  }),
  [`${DATA_ROOT}/spells/foundry.json`]: JSON.stringify({
    spell: [{ name: 'Aid', source: 'XPHB', activities: [{ type: 'heal' }], migrationVersion: 3 }]
  }),
  [`${DATA_ROOT}/foundry-items.json`]: JSON.stringify({
    item: [{ name: 'Acid', source: 'XPHB', activities: [{ type: 'save' }], migrationVersion: 3 }]
  })
}

const FIXTURE_DIRS: Record<string, string[]> = {
  [DATA_ROOT]: ['class', 'spells', 'items.json', 'races.json', 'foundry-races.json', 'foundry-items.json'],
  [`${DATA_ROOT}/class`]: ['class-fighter.json', 'foundry.json'],
  [`${DATA_ROOT}/spells`]: ['spells-xphb.json', 'foundry.json']
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

import { srd51Provider } from '../../../server/utils/content-sources/dnd5e/srd-5-1'
import { xdmgProvider } from '../../../server/utils/content-sources/dnd5e/xdmg'
import { xphbProvider } from '../../../server/utils/content-sources/dnd5e/xphb'
import { fileLooksRelevant, isEntryFromSource } from '../../../server/utils/content-sources/dnd5e/5etools-dataset'
import { getProvider } from '../../../server/utils/content-sources'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fileLooksRelevant -- Foundry companion exclusion', () => {
  it('excludes root-level foundry-*.json files from every category', () => {
    expect(fileLooksRelevant('species', `${DATA_ROOT}/foundry-races.json`)).toBe(false)
    expect(fileLooksRelevant('items', `${DATA_ROOT}/foundry-items.json`)).toBe(false)
    expect(fileLooksRelevant('feats', `${DATA_ROOT}/foundry-feats.json`)).toBe(false)
  })

  it('excludes nested foundry.json files from every category', () => {
    expect(fileLooksRelevant('classes', `${DATA_ROOT}/class/foundry.json`)).toBe(false)
    expect(fileLooksRelevant('spells', `${DATA_ROOT}/spells/foundry.json`)).toBe(false)
  })

  it('still accepts the real 5etools content files it always did', () => {
    expect(fileLooksRelevant('species', `${DATA_ROOT}/races.json`)).toBe(true)
    expect(fileLooksRelevant('classes', `${DATA_ROOT}/class/class-fighter.json`)).toBe(true)
    expect(fileLooksRelevant('items', `${DATA_ROOT}/items.json`)).toBe(true)
    expect(fileLooksRelevant('spells', `${DATA_ROOT}/spells/spells-xphb.json`)).toBe(true)
  })
})

describe('isEntryFromSource', () => {
  it('matches on exact source code and nothing else', () => {
    const isXphb = isEntryFromSource('XPHB')
    expect(isXphb({ source: 'XPHB' })).toBe(true)
    expect(isXphb({ source: 'PHB' })).toBe(false)
    expect(isXphb({ source: 'xphb' })).toBe(false)
    expect(isXphb({ edition: 'one' })).toBe(false)
    expect(isXphb(null)).toBe(false)
    expect(isXphb(undefined)).toBe(false)
    expect(isXphb('XPHB')).toBe(false)
  })
})

describe('xphbProvider', () => {
  it('is registered and resolvable by (gameSystemKey, collectionKey)', () => {
    expect(getProvider('dnd5e', 'xphb')).toBe(xphbProvider)
    expect(xphbProvider.gameSystemKey).toBe('dnd5e')
    expect(xphbProvider.collectionKey).toBe('xphb')
    expect(xphbProvider.adapterId).toBe('5etools-json')
    expect(xphbProvider.categories.map((c) => c.key)).toEqual(['species', 'classes', 'backgrounds', 'feats', 'items', 'spells'])
  })

  it('selects the XPHB entry from a file it SHARES with PHB -- entry-level membership, never a file filter', async () => {
    const { candidates } = await xphbProvider.loadCategory('classes')

    expect(candidates).toHaveLength(1)
    expect(candidates[0].title).toBe('Fighter')
    expect(candidates[0].sourceBook).toBe('XPHB')
    expect(candidates[0].sourcePage).toBe('50')
  })

  it('never admits Foundry companion entries, in any category', async () => {
    for (const key of ['species', 'classes', 'items', 'spells']) {
      const { candidates } = await xphbProvider.loadCategory(key)
      for (const candidate of candidates) {
        expect(candidate.data).not.toHaveProperty('migrationVersion')
        expect(candidate.data).not.toHaveProperty('activities')
        expect(candidate.data).not.toHaveProperty('advancement')
      }
    }

    // Concretely: the Foundry-only species/spell never appear.
    const species = await xphbProvider.loadCategory('species')
    expect(species.candidates.map((c) => c.title)).toEqual(['Human'])
    const spells = await xphbProvider.loadCategory('spells')
    expect(spells.candidates.map((c) => c.title)).toEqual(['Fire Bolt'])
  })

  it('excludes entries belonging to other books entirely', async () => {
    const { candidates } = await xphbProvider.loadCategory('items')
    expect(candidates.map((c) => c.sourceBook)).toEqual(['XPHB'])
    expect(candidates.map((c) => c.title)).not.toContain('Bag of Holding')
    expect(candidates.map((c) => c.title)).not.toContain('+1 Rod of the Pact Keeper')
  })

  it('publishes Item Rules Facets through the SAME attachRulesFacets step species/classes/backgrounds already use -- no second mechanism', async () => {
    // This suite's own fixture (this file's header) is deliberately minimal
    // -- Longsword is its one item that also has an authored Rules Facet
    // (dnd5e-2024.ts's `item` corpus), which is enough to prove the
    // PUBLICATION PATH carries a facet through unchanged. The facet's own
    // CONTENT (category/slot for armor, shields, every measured weapon) is
    // exercised against the real, full corpus by
    // tests/server/utils/character-actor-bridge.test.ts's "item facets"
    // suite -- not duplicated here.
    const { candidates } = await xphbProvider.loadCategory('items')

    const longsword = candidates.find((c) => c.slug === 'longsword-xphb')
    expect(longsword?.rulesFacet?.collectionFields).toEqual([
      { collection: 'collection:equipment', fields: { category: 'weapon', slot: 'held' } }
    ])

    // Bag of Holding never reaches this collection (wrong book -- DMG), but
    // even if it did, it would publish candidate-only: the corpus has no
    // facet for it, and content with none presents but does not mechanise
    // (§8.2 rule 4), same as a Species with no skill facet already does.
    expect(candidates.map((c) => c.title)).not.toContain('Bag of Holding')
  })
})

describe('xdmgProvider', () => {
  it('is registered and resolvable by (gameSystemKey, collectionKey)', () => {
    expect(getProvider('dnd5e', 'xdmg')).toBe(xdmgProvider)
    expect(xdmgProvider.gameSystemKey).toBe('dnd5e')
    expect(xdmgProvider.collectionKey).toBe('xdmg')
    expect(xdmgProvider.adapterId).toBe('5etools-json')
  })

  it('declares only the categories XDMG actually populates -- items, not the other five', () => {
    // Measured against the real dataset (xdmg.ts's own header): XDMG has
    // zero species/classes/backgrounds/feats/spells entries. The provider
    // must reflect that rather than declaring artificial empty categories.
    expect(xdmgProvider.categories.map((c) => c.key)).toEqual(['items'])
  })

  it('selects only the XDMG entry from items.json, which it shares with PHB/XPHB/DMG', async () => {
    const { candidates } = await xdmgProvider.loadCategory('items')
    expect(candidates.map((c) => c.title)).toEqual(['+1 Rod of the Pact Keeper'])
    expect(candidates[0].sourceBook).toBe('XDMG')
  })

  it('rejects a category it never declared', async () => {
    await expect(xdmgProvider.loadCategory('spells')).rejects.toThrow(/unknown category/i)
  })
})

describe('srd51Provider is unaffected by the Foundry exclusion', () => {
  it('still selects exactly its srd-flagged entries from shared files', async () => {
    const classes = await srd51Provider.loadCategory('classes')
    expect(classes.candidates).toHaveLength(1)
    expect(classes.candidates[0].sourceBook).toBe('PHB')

    const items = await srd51Provider.loadCategory('items')
    expect(items.candidates.map((c) => c.title)).toEqual(['Longsword'])
    expect(items.candidates[0].sourceBook).toBe('PHB')

    const species = await srd51Provider.loadCategory('species')
    expect(species.candidates.map((c) => c.title)).toEqual(['Human'])
    expect(species.candidates[0].sourceBook).toBe('PHB')
  })

  it('produces candidate identities distinct from XPHB\'s for the same-named entry -- both can coexist in one catalogue', async () => {
    const srdClasses = await srd51Provider.loadCategory('classes')
    const xphbClasses = await xphbProvider.loadCategory('classes')

    expect(srdClasses.candidates[0].title).toBe(xphbClasses.candidates[0].title)
    expect(srdClasses.candidates[0].slug).not.toBe(xphbClasses.candidates[0].slug)
    expect(srdClasses.candidates[0].externalId).not.toBe(xphbClasses.candidates[0].externalId)
  })
})
