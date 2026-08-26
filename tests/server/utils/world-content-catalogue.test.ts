// Unit tests for server/utils/world-content-catalogue.ts -- Content
// Consumers Phase 1. Mirrors tests/server/utils/world-content-runtime.test.ts's
// own shape: resolveWorldContent (the one function this module composes)
// is mocked at the boundary; getWorldContentCatalogue's own mapping logic
// runs for real.

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

import { getWorldContentCatalogue } from '../../../server/utils/world-content-catalogue'
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
    data: { name: 'Fire Bolt', srd: true, level: 0, damage: '1d10' },
    packageId: 'eldra.content.srd-5.1',
    packageVersion: '1.0.0',
    ...overrides
  }
}

function resolved(overrides: Partial<WorldContentCatalogue> = {}): WorldContentCatalogue {
  return {
    worldId: '5',
    packs: [],
    entries: [],
    byEntityType: {},
    ...overrides
  }
}

beforeEach(() => {
  resolveWorldContentMock.mockReset()
})

describe('getWorldContentCatalogue', () => {
  it('generates a typed catalogue, mapping each entityType into its own named collection', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      packs: [{ ok: true, packageId: 'eldra.content.srd-5.1', version: '1.0.0', title: 'SRD 5.1', entryCount: 6 }],
      entries: [
        entry({ entityType: 'spell', title: 'Fire Bolt' }),
        entry({ entityType: 'item', title: 'Potion of Healing', slug: 'potion-of-healing' }),
        entry({ entityType: 'feat', title: 'Grappler', slug: 'grappler' }),
        entry({ entityType: 'background', title: 'Acolyte', slug: 'acolyte' }),
        entry({ entityType: 'species', title: 'Human', slug: 'human' }),
        entry({ entityType: 'class', title: 'Fighter', slug: 'fighter' }),
        entry({ entityType: 'enemy', title: 'Goblin', slug: 'goblin' })
      ]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue.spells.map((e) => e.title)).toEqual(['Fire Bolt'])
    expect(catalogue.items.map((e) => e.title)).toEqual(['Potion of Healing'])
    expect(catalogue.feats.map((e) => e.title)).toEqual(['Grappler'])
    expect(catalogue.backgrounds.map((e) => e.title)).toEqual(['Acolyte'])
    expect(catalogue.species.map((e) => e.title)).toEqual(['Human'])
    expect(catalogue.classes.map((e) => e.title)).toEqual(['Fighter'])
    expect(catalogue.monsters.map((e) => e.title)).toEqual(['Goblin'])
    expect(catalogue.packs).toEqual([{ ok: true, packageId: 'eldra.content.srd-5.1', version: '1.0.0', title: 'SRD 5.1', entryCount: 6 }])
  })

  it('maps the "enemy" entityType (what preview5eToolsMonsters actually writes) into catalogue.monsters', async () => {
    // Deliberately NOT 'monster' -- app/lib/systems/dnd5e.ts registers the
    // entityType as 'monster', but the importer that actually produces
    // monster candidates (preview5eToolsMonsters) writes 'enemy'. This test
    // pins the mapping to the literal that is actually produced; see
    // content-pack-monsters-adapter.ts's own design decision 3 for why that
    // mismatch is deliberately left unresolved rather than papered over
    // here.
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [entry({ entityType: 'enemy', title: 'Owlbear', slug: 'owlbear' })]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue.monsters.map((e) => e.title)).toEqual(['Owlbear'])
  })

  it('exposes only identity and provenance for a category with no presentation model -- never `data`', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [entry({ entityType: 'spell' })]
    }))

    const catalogue = await getWorldContentCatalogue('5')
    const [spell] = catalogue.spells

    expect(spell).not.toHaveProperty('data')
    expect(spell).not.toHaveProperty('entityType')
    expect(Object.keys(spell).sort()).toEqual([
      // 'presentation' is absent -- spells have no PresentationKind (design
      // decision 1's original three). 'actions' IS present: the Character
      // Actions System resolves spell actions for the same category
      // 'presentation' still does not cover -- see this file's own note on
      // ACTION_CATEGORY_BY_CATALOGUE_CATEGORY.
      'actions',
      'externalId',
      'packageId',
      'packageVersion',
      'provider',
      'slug',
      'sourceBook',
      'sourcePage',
      'systemKey',
      'title'
    ])
    expect(spell).toEqual({
      packageId: 'eldra.content.srd-5.1',
      packageVersion: '1.0.0',
      systemKey: 'dnd5e',
      title: 'Fire Bolt',
      slug: 'fire-bolt-phb',
      externalId: 'Fire Bolt__PHB',
      provider: '5etools-json',
      sourceBook: 'PHB',
      sourcePage: '211',
      actions: [expect.objectContaining({ name: 'Fire Bolt', category: 'spell' })]
    })
  })

  it('multiple bound packs compose into the same typed collections', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      packs: [
        { ok: true, packageId: 'eldra.content.srd-5.1', version: '1.0.0', title: 'SRD 5.1', entryCount: 1 },
        { ok: true, packageId: 'eldra.content.homebrew', version: '1.0.0', title: 'Homebrew', entryCount: 1 }
      ],
      entries: [
        entry({ entityType: 'spell', title: 'Fire Bolt', packageId: 'eldra.content.srd-5.1' }),
        entry({ entityType: 'spell', title: 'Homebrew Zap', slug: 'homebrew-zap', packageId: 'eldra.content.homebrew' })
      ]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue.spells).toHaveLength(2)
    expect(catalogue.spells.map((e) => e.packageId).sort()).toEqual(['eldra.content.homebrew', 'eldra.content.srd-5.1'])
  })

  it('empty worlds (or worlds with no known categories) produce an empty catalogue in every collection', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved())

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue).toEqual({
      worldId: '5',
      packs: [],
      species: [],
      classes: [],
      backgrounds: [],
      feats: [],
      items: [],
      spells: [],
      monsters: []
    })
  })

  it('resolver failures are isolated -- a broken binding is visible in `packs` but never contaminates a typed collection', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      packs: [
        { ok: false, packageId: 'eldra.content.broken', version: '1.0.0', failure: { stage: 'not-found', packageId: 'eldra.content.broken', version: '1.0.0' } },
        { ok: true, packageId: 'eldra.content.srd-5.1', version: '1.0.0', title: 'SRD 5.1', entryCount: 1 }
      ],
      // resolveWorldContent already excludes a broken binding's own
      // entries (world-content-runtime.test.ts covers that directly) --
      // this test proves the catalogue layer does not need to re-derive
      // that guarantee and correctly reflects entries only from the pack
      // that actually loaded.
      entries: [entry({ entityType: 'spell', title: 'Fire Bolt', packageId: 'eldra.content.srd-5.1' })]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue.packs.some((p) => !p.ok)).toBe(true)
    expect(catalogue.spells).toHaveLength(1)
    expect(catalogue.spells[0].packageId).toBe('eldra.content.srd-5.1')
  })

  it('an entityType outside the known categories is silently excluded from every typed collection -- including "monster" itself, which is never produced', async () => {
    // 'monster' (singular, no 's') is app/lib/systems/dnd5e.ts's registered
    // entityType -- NOT what any importer actually writes (that's 'enemy',
    // covered above), so it must map to nothing, same as any other unknown
    // string.
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [
        entry({ entityType: 'monster', title: 'Goblin', slug: 'goblin' }),
        entry({ entityType: 'spell', title: 'Fire Bolt' })
      ]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue.spells).toHaveLength(1)
    const allEntries = [
      ...catalogue.species,
      ...catalogue.classes,
      ...catalogue.backgrounds,
      ...catalogue.feats,
      ...catalogue.items,
      ...catalogue.spells,
      ...catalogue.monsters
    ]
    expect(allEntries.find((e) => e.title === 'Goblin')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Character Builder / Character Sheet Phase 2 -- presentation resolution.
// ---------------------------------------------------------------------------
// The resolver itself is NOT mocked: app/lib/content-presentation is pure,
// so running it for real is both cheap and the only way these tests can
// prove the wiring (category -> kind) is right rather than merely present.
// The resolver's own behaviour is covered in
// tests/lib/content-presentation/dnd5e.test.ts.

describe('getWorldContentCatalogue -- presentation models', () => {
  const speciesData = {
    name: 'Dwarf',
    source: 'XPHB',
    page: 188,
    creatureTypes: ['humanoid'],
    size: ['M'],
    speed: 30,
    darkvision: 120,
    entries: [{ type: 'entries', name: 'Stonecunning', entries: ['You gain {@sense Tremorsense|XPHB}.'] }]
  }

  it('resolves a presentation model for species, classes and backgrounds', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [
        entry({ entityType: 'species', title: 'Dwarf', data: speciesData }),
        entry({ entityType: 'class', title: 'Fighter', data: { name: 'Fighter', source: 'XPHB', hd: { number: 1, faces: 10 } } }),
        entry({ entityType: 'background', title: 'Acolyte', data: { name: 'Acolyte', source: 'XPHB', skillProficiencies: [{ insight: true, religion: true }] } })
      ]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue.species[0]!.presentation).toMatchObject({ kind: 'species', name: 'Dwarf' })
    expect(catalogue.classes[0]!.presentation).toMatchObject({ kind: 'class', name: 'Fighter' })
    expect(catalogue.backgrounds[0]!.presentation).toMatchObject({ kind: 'background', name: 'Acolyte' })
  })

  it('maps each category to its OWN kind -- a class never resolves as a species', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [entry({ entityType: 'class', title: 'Fighter', data: { name: 'Fighter', hd: { faces: 10 } } })]
    }))

    const catalogue = await getWorldContentCatalogue('5')
    const presentation = catalogue.classes[0]!.presentation!

    expect(presentation.kind).toBe('class')
    expect(presentation.facts.map((fact) => fact.label)).toContain('Hit Die')
  })

  it('translates `data` without ever exposing it', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [entry({ entityType: 'species', title: 'Dwarf', data: speciesData })]
    }))

    const [species] = (await getWorldContentCatalogue('5')).species

    expect(species).not.toHaveProperty('data')
    // Markup resolved on the way through -- no consumer ever sees a raw tag.
    expect(JSON.stringify(species)).not.toContain('{@')
    expect(species!.presentation!.sections[0]!.paragraphs[0]).toBe('You gain Tremorsense.')
  })

  it('leaves feats, items, spells and monsters unresolved -- no reader, no cost', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [
        entry({ entityType: 'feat', title: 'Alert' }),
        entry({ entityType: 'item', title: 'Longsword' }),
        entry({ entityType: 'spell', title: 'Fire Bolt' }),
        entry({ entityType: 'enemy', title: 'Owlbear' })
      ]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    for (const collection of [catalogue.feats, catalogue.items, catalogue.spells, catalogue.monsters]) {
      expect(collection[0]).not.toHaveProperty('presentation')
    }
  })

  it('degrades a single unreadable entry to presentation: null, leaving its siblings intact', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [
        entry({ entityType: 'species', title: 'Broken', slug: 'broken', data: 'not an object' as never }),
        entry({ entityType: 'species', title: 'Dwarf', slug: 'dwarf', data: speciesData })
      ]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue.species[0]!.presentation).toBeNull()
    expect(catalogue.species[0]!.title).toBe('Broken')
    expect(catalogue.species[1]!.presentation).toMatchObject({ name: 'Dwarf' })
  })

  it('resolves to null for a pack from a game system Eldra cannot present yet', async () => {
    resolveWorldContentMock.mockResolvedValue(resolved({
      entries: [entry({ entityType: 'species', systemKey: 'pf2e', title: 'Goblin', data: { name: 'Goblin' } })]
    }))

    const catalogue = await getWorldContentCatalogue('5')

    expect(catalogue.species[0]!.presentation).toBeNull()
    expect(catalogue.species[0]!.title).toBe('Goblin')
  })

  describe('actions (Character Actions System)', () => {
    it('resolves a weapon item to a weapon action', async () => {
      resolveWorldContentMock.mockResolvedValue(resolved({
        entries: [entry({
          entityType: 'item',
          title: 'Longsword',
          data: { name: 'Longsword', weapon: true, type: 'M|XPHB', weaponCategory: 'martial', dmg1: '1d8', dmgType: 'S' }
        })]
      }))

      const catalogue = await getWorldContentCatalogue('5')
      expect(catalogue.items[0]!.actions).toEqual([
        expect.objectContaining({ name: 'Longsword', category: 'weapon', actionType: 'Melee Attack' })
      ])
    })

    it('omits the `actions` key entirely for a non-weapon item -- an empty list is not stored', async () => {
      resolveWorldContentMock.mockResolvedValue(resolved({
        entries: [entry({ entityType: 'item', title: 'Rope', data: { name: 'Rope' } })]
      }))

      const catalogue = await getWorldContentCatalogue('5')
      expect(catalogue.items[0]).not.toHaveProperty('actions')
    })

    it('a category with no ContentSourceCategory mapping (feats, monsters) never resolves actions', async () => {
      resolveWorldContentMock.mockResolvedValue(resolved({
        entries: [
          entry({ entityType: 'feat', title: 'Alert', data: { name: 'Alert' } }),
          entry({ entityType: 'enemy', title: 'Owlbear', data: { name: 'Owlbear' } })
        ]
      }))

      const catalogue = await getWorldContentCatalogue('5')
      expect(catalogue.feats[0]).not.toHaveProperty('actions')
      expect(catalogue.monsters[0]).not.toHaveProperty('actions')
    })

    it('a broken data payload degrades this entry to no actions, never breaking the catalogue', async () => {
      resolveWorldContentMock.mockResolvedValue(resolved({
        entries: [
          entry({ entityType: 'item', title: 'Bad', slug: 'bad', data: 'not-an-object' as any }),
          entry({ entityType: 'item', title: 'Good', slug: 'good', data: { name: 'Good', weapon: true, type: 'M|XPHB', dmg1: '1d6', dmgType: 'B' } })
        ]
      }))

      const catalogue = await getWorldContentCatalogue('5')
      expect(catalogue.items).toHaveLength(2)
      expect(catalogue.items[0]).not.toHaveProperty('actions')
      expect(catalogue.items[1]!.actions).toHaveLength(1)
    })
  })
})
