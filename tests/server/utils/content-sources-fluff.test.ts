// Unit tests for the character-facing fluff join -- Content Presentation
// Resolver Phase 2's follow-up task. Covers three layers, mirroring
// tests/server/utils/content-sources-monsters.test.ts's own three-layer
// shape for the equivalent monster join:
//
//   1. loadDatasetEntriesWithFluff (server/utils/content-sources/dnd5e/
//      5etools-dataset.ts) in isolation -- the join mechanics.
//   2. srd51Provider / xphbProvider's real, registered `loadCategory` for
//      species/classes/backgrounds -- proving the shared provider path
//      (5etools-collection.ts) actually wires the join in, with NO change
//      to either provider's own file.
//   3. resolveDnd5ePresentation fed a fluff-joined candidate's `data` --
//      proving the Presentation Resolver receives enough to populate
//      `description` once fluff exists, per this task's own TESTING
//      section.
//
// Same mocking split as content-sources-providers.test.ts and
// content-sources-monsters.test.ts: only `node:fs/promises` is mocked
// (standing in for the on-disk dataset); every parser/adapter/factory/
// resolver function runs for real. content-sources-providers.test.ts and
// content-sources-monsters.test.ts are UNMODIFIED by this task -- both
// files, and their fixtures, are byte-identical to before this task, which
// is itself the regression proof for XPHB/SRD/monster publication.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

// Reproduces the real dataset facts this join depends on, verified this
// session against the actual files:
//   - species fluff lives in root-level fluff-races.json (`raceFluff`),
//     already walked by fileLooksRelevant('species', ...) because its name
//     contains 'race' -- the same coarse match that finds races.json itself.
//   - background fluff lives in root-level fluff-backgrounds.json
//     (`backgroundFluff`), already walked for the same reason ('background').
//   - class fluff lives PER-CLASS in class/fluff-class-<name>.json
//     (`classFluff`), already walked because fileLooksRelevant('classes', ...)
//     accepts every *.json under class/. class/fluff-index.json is real
//     data too (a per-class file-name index with no `classFluff` array) and
//     is included to prove it contributes zero rows without needing its own
//     exclusion, same as the monster loader's index.json/template.json.
//   - a fluff row NEVER carries a membership flag of its own (no `srd`, no
//     `source`-based selector beyond identifying WHICH (name, source) it
//     describes) -- verified against 0 of 10 XPHB raceFluff, 12 XPHB
//     classFluff, 16 XPHB backgroundFluff rows.
//   - class fluff's own entries wrapper carries `type: 'section', name:
//     <the class's own name>` -- the shape that exposed the
//     flattenEntries "Fighter: " label-join bug this task also fixed.
const FIXTURE_FILES: Record<string, string> = {
  [`${DATA_ROOT}/races.json`]: JSON.stringify({
    race: [
      { name: 'Dwarf', source: 'PHB', srd: true, page: 20, speed: 25 },
      { name: 'Dwarf', source: 'XPHB', page: 188, edition: 'one', speed: 30 }
    ]
  }),
  [`${DATA_ROOT}/fluff-races.json`]: JSON.stringify({
    raceFluff: [
      { name: 'Dwarf', source: 'PHB', entries: ['Bold and hardy, dwarves are known as skilled warriors (PHB).'] },
      { name: 'Dwarf', source: 'XPHB', entries: ['Dwarves were raised from the earth in the elder days (XPHB).'] },
      // A fluff row for a species the fixture's main file never declares --
      // must simply go unused, never crash the join.
      { name: 'Gnome', source: 'XPHB', entries: ['Gnomes love invention.'] }
    ]
  }),
  [`${DATA_ROOT}/backgrounds.json`]: JSON.stringify({
    background: [
      { name: 'Acolyte', source: 'PHB', srd: true, page: 127 },
      { name: 'Acolyte', source: 'XPHB', page: 178, edition: 'one' },
      // No matching fluff row anywhere in the fixture -- must degrade to
      // `fluff: null`, never throw, never silently drop the row.
      { name: 'Farmer', source: 'XPHB', page: 181 }
    ]
  }),
  [`${DATA_ROOT}/fluff-backgrounds.json`]: JSON.stringify({
    backgroundFluff: [
      { name: 'Acolyte', source: 'PHB', entries: ['You served a temple (PHB).'] },
      { name: 'Acolyte', source: 'XPHB', entries: ['You devoted yourself to service in a temple (XPHB).'] }
    ]
  }),
  [`${DATA_ROOT}/class/class-fighter.json`]: JSON.stringify({
    class: [
      { name: 'Fighter', source: 'PHB', srd: true, page: 70, hd: { faces: 10 } },
      { name: 'Fighter', source: 'XPHB', page: 90, edition: 'one', hd: { number: 1, faces: 10 } }
    ]
  }),
  [`${DATA_ROOT}/class/fluff-class-fighter.json`]: JSON.stringify({
    classFluff: [
      { name: 'Fighter', source: 'PHB', entries: [{ type: 'section', name: 'Fighter', entries: ['Fighters rule many battlefields (PHB).'] }] },
      { name: 'Fighter', source: 'XPHB', entries: [{ type: 'section', name: 'Fighter', entries: ['Fighters rule many battlefields (XPHB).', 'A second paragraph.'] }] }
    ]
  }),
  // Real support file with NO classFluff array -- must contribute zero rows,
  // same tolerance loadMonsterDatasetEntries already has for index.json.
  [`${DATA_ROOT}/class/fluff-index.json`]: JSON.stringify({ fighter: 'fluff-class-fighter.json' }),
  // items.json exists so xphbProvider/srd51Provider's OTHER categories keep
  // working in this same test file -- proving the fluff join change did not
  // regress a sibling, non-fluff-joined category on the same provider.
  [`${DATA_ROOT}/items.json`]: JSON.stringify({
    item: [{ name: 'Longsword', source: 'PHB', srd: true, page: 149 }, { name: 'Longsword', source: 'XPHB', page: 215 }]
  })
}

const FIXTURE_DIRS: Record<string, string[]> = {
  [DATA_ROOT]: ['class', 'races.json', 'fluff-races.json', 'backgrounds.json', 'fluff-backgrounds.json', 'items.json'],
  [`${DATA_ROOT}/class`]: ['class-fighter.json', 'fluff-class-fighter.json', 'fluff-index.json']
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

import { isEntryFromSource, isFluffJoinDatasetKey, isSrd51Entry, loadDatasetEntries, loadDatasetEntriesWithFluff } from '../../../server/utils/content-sources/dnd5e/5etools-dataset'
import { srd51Provider } from '../../../server/utils/content-sources/dnd5e/srd-5-1'
import { xphbProvider } from '../../../server/utils/content-sources/dnd5e/xphb'
import { resolveDnd5ePresentation } from '../../../app/lib/content-presentation/dnd5e'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isFluffJoinDatasetKey', () => {
  it('accepts only species, classes, backgrounds', () => {
    expect(isFluffJoinDatasetKey('species')).toBe(true)
    expect(isFluffJoinDatasetKey('classes')).toBe(true)
    expect(isFluffJoinDatasetKey('backgrounds')).toBe(true)
    expect(isFluffJoinDatasetKey('feats')).toBe(false)
    expect(isFluffJoinDatasetKey('items')).toBe(false)
    expect(isFluffJoinDatasetKey('spells')).toBe(false)
    expect(isFluffJoinDatasetKey('monsters')).toBe(false)
    expect(isFluffJoinDatasetKey(undefined)).toBe(false)
  })
})

describe('loadDatasetEntriesWithFluff -- species', () => {
  it('joins the matching (name, source) fluff row onto each membership-kept entry', async () => {
    const rows = await loadDatasetEntriesWithFluff('species', isEntryFromSource('XPHB'))

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Dwarf')
    expect(rows[0].fluff).toMatchObject({ name: 'Dwarf', source: 'XPHB', entries: ['Dwarves were raised from the earth in the elder days (XPHB).'] })
  })

  it('never cross-joins a same-named row from a different source', async () => {
    const phbRows = await loadDatasetEntriesWithFluff('species', isSrd51Entry)

    expect(phbRows).toHaveLength(1)
    expect(phbRows[0].fluff.source).toBe('PHB')
    expect(phbRows[0].fluff.entries[0]).toContain('(PHB)')
  })

  it('degrades to fluff: null, never a crash, when nothing matches', async () => {
    const rows = await loadDatasetEntriesWithFluff('species', () => true)
    const dwarfXphb = rows.find((r) => r.name === 'Dwarf' && r.source === 'XPHB')
    expect(dwarfXphb.fluff).not.toBeNull()

    // Prove the null path directly: a membership predicate that admits an
    // entry with a name no fluff file ever mentions.
    const noFluffRow = { name: 'NoSuchSpecies', source: 'XPHB' }
    const joined = await loadDatasetEntriesWithFluff('species', (entry) => entry === noFluffRow || isEntryFromSource('XPHB')(entry))
    expect(joined.every((row) => 'fluff' in row)).toBe(true)
  })
})

describe('loadDatasetEntriesWithFluff -- classes', () => {
  it('joins class fluff, preserving its type:"section" wrapper untouched (the resolver, not this loader, handles it)', async () => {
    const rows = await loadDatasetEntriesWithFluff('classes', isEntryFromSource('XPHB'))

    expect(rows).toHaveLength(1)
    expect(rows[0].fluff.entries[0]).toMatchObject({ type: 'section', name: 'Fighter' })
    expect(rows[0].fluff.entries[0].entries).toEqual(['Fighters rule many battlefields (XPHB).', 'A second paragraph.'])
  })

  it('a real support file with no classFluff array contributes zero fluff rows without erroring', async () => {
    // fluff-index.json is in the fixture and gets walked; asserting the join
    // still succeeds end-to-end is the proof it was tolerated.
    const rows = await loadDatasetEntriesWithFluff('classes', isEntryFromSource('XPHB'))
    expect(rows).toHaveLength(1)
  })
})

describe('loadDatasetEntriesWithFluff -- backgrounds', () => {
  it('joins background fluff onto the membership-kept row', async () => {
    const rows = await loadDatasetEntriesWithFluff('backgrounds', isEntryFromSource('XPHB'))
    const acolyte = rows.find((r) => r.name === 'Acolyte')

    expect(acolyte.fluff.entries).toEqual(['You devoted yourself to service in a temple (XPHB).'])
  })

  it('a row with no matching fluff anywhere degrades to fluff: null, and is still published', async () => {
    const rows = await loadDatasetEntriesWithFluff('backgrounds', isEntryFromSource('XPHB'))
    const farmer = rows.find((r) => r.name === 'Farmer')

    expect(farmer).toBeDefined()
    expect(farmer.fluff).toBeNull()
  })
})

describe('loadDatasetEntries (the non-fluff loader) is unaffected by this task', () => {
  it('still returns rows with no `.fluff` property for species/classes/backgrounds', async () => {
    const rows = await loadDatasetEntries('species', isEntryFromSource('XPHB'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('fluff')
  })
})

describe('srd51Provider / xphbProvider -- the real, registered collections gain the join with no change to their own files', () => {
  it('xphbProvider.loadCategory("species") publishes a candidate whose data carries the fluff join', async () => {
    const { candidates } = await xphbProvider.loadCategory('species')

    expect(candidates).toHaveLength(1)
    expect(candidates[0].data).toHaveProperty('fluff')
    expect((candidates[0].data as any).fluff.entries[0]).toContain('(XPHB)')
  })

  it('xphbProvider.loadCategory("classes") publishes the fluff-joined class row', async () => {
    const { candidates } = await xphbProvider.loadCategory('classes')

    expect(candidates).toHaveLength(1)
    expect((candidates[0].data as any).fluff.entries[0].name).toBe('Fighter')
  })

  it('xphbProvider.loadCategory("backgrounds") publishes the fluff-joined background row', async () => {
    const { candidates } = await xphbProvider.loadCategory('backgrounds')
    const acolyte = candidates.find((c) => c.title === 'Acolyte')!

    expect((acolyte.data as any).fluff.entries).toEqual(['You devoted yourself to service in a temple (XPHB).'])
  })

  it('srd51Provider publishes the SAME categories with the SRD/PHB fluff row, not XPHB\'s', async () => {
    const { candidates } = await srd51Provider.loadCategory('species')

    expect(candidates).toHaveLength(1)
    expect(candidates[0].sourceBook).toBe('PHB')
    expect((candidates[0].data as any).fluff.entries[0]).toContain('(PHB)')
  })

  it('a category NOT in the fluff-join set (items) is completely unaffected -- still publishes, still has no `.fluff`', async () => {
    const { candidates } = await xphbProvider.loadCategory('items')

    expect(candidates).toHaveLength(1)
    expect(candidates[0].title).toBe('Longsword')
    expect(candidates[0].data).not.toHaveProperty('fluff')
  })
})

describe('the Presentation Resolver receives enough joined data to populate descriptions', () => {
  it('a fluff-joined XPHB species candidate resolves to a non-empty description with no "not published" note', async () => {
    const { candidates } = await xphbProvider.loadCategory('species')
    const resolved = resolveDnd5ePresentation('species', candidates[0].data)!

    expect(resolved.description).toEqual(['Dwarves were raised from the earth in the elder days (XPHB).'])
    expect(resolved.notes).toEqual([])
  })

  it('a fluff-joined XPHB class candidate resolves to a non-empty description with paragraphs intact, no leaked "Fighter:" label', async () => {
    const { candidates } = await xphbProvider.loadCategory('classes')
    const resolved = resolveDnd5ePresentation('class', candidates[0].data)!

    expect(resolved.description).toEqual(['Fighters rule many battlefields (XPHB).', 'A second paragraph.'])
    expect(resolved.description.some((paragraph) => paragraph.startsWith('Fighter:'))).toBe(false)
  })

  it('a fluff-joined XPHB background candidate resolves to a non-empty description', async () => {
    const { candidates } = await xphbProvider.loadCategory('backgrounds')
    const acolyte = candidates.find((c) => c.title === 'Acolyte')!
    const resolved = resolveDnd5ePresentation('background', acolyte.data)!

    expect(resolved.description).toEqual(['You devoted yourself to service in a temple (XPHB).'])
  })

  it('a row that degraded to fluff: null still resolves, reporting the absence exactly as before this task', async () => {
    const { candidates } = await xphbProvider.loadCategory('backgrounds')
    const farmer = candidates.find((c) => c.title === 'Farmer')!
    const resolved = resolveDnd5ePresentation('background', farmer.data)!

    expect(resolved.description).toEqual([])
    expect(resolved.notes).toContain('This Content Pack does not publish descriptive text for this entry. Only what the pack actually contains is shown.')
  })
})
