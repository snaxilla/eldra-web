// Unit tests for server/utils/homebrew/index.ts -- Homebrew Forge Content
// Pack Restoration. Directus is mocked at the module boundary
// (server/utils/directus.ts), matching this repo's established pattern
// (tests/server/utils/world-rules-config.test.ts, etc.) -- that module
// relies on Nuxt auto-imports that do not exist under plain Vitest.
// resolveWorldContent (server/utils/world-content-runtime.ts) is mocked the
// same way tests/server/utils/catalogue-entity-bridge.test.ts mocks it:
// every `preview5eTools*` importer function underneath it runs for REAL, so
// these tests prove the actual persisted-block shape, not a stand-in for it.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock, resolveWorldContentMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  resolveWorldContentMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
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

import { createHomebrewDraft, listHomebrewTemplates } from '../../../server/utils/homebrew'
import type { WorldContentCatalogue, WorldContentEntry } from '../../../server/utils/world-content-runtime'

function entry(overrides: Partial<WorldContentEntry> = {}): WorldContentEntry {
  return {
    systemKey: 'dnd5e',
    entityType: 'item',
    title: 'Potion of Healing',
    slug: 'potion-of-healing-phb',
    externalId: 'Potion of Healing__PHB',
    provider: '5etools-json',
    sourceBook: 'PHB',
    sourcePage: '140',
    data: { name: 'Potion of Healing', source: 'PHB', rarity: 'common', weight: 0.5 },
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

function resolvedCatalogue(entries: WorldContentEntry[]): WorldContentCatalogue {
  return { worldId: '5', packs: [], entries, byEntityType: byEntityType(entries) }
}

// A minimal in-memory stand-in for the exact Directus request shapes
// server/utils/homebrew/index.ts issues: /fields/* (field-discovery, made
// to fall back to the module's own hardcoded fallback field sets by always
// returning no fields -- mirrors how collectionFields behaves when
// Directus can't be reached), /items/entities (legacy template lookup/list,
// slug-uniqueness check, entity creation), /items/block_instances
// (legacy template block loading, block creation), and the enemy
// structured tables (returned empty -- createHomebrewDraft itself never
// writes them; that happens one layer up in create.post.ts, out of scope
// here).
function createFakeDirectusStore(seedEntities: any[] = [], seedBlocks: any[] = []) {
  const entities = seedEntities.map((row) => ({ ...row }))
  const blocks = seedBlocks.map((row) => ({ ...row }))
  let nextEntityId = 1000
  let nextBlockId = 1

  directusServiceRequestMock.mockImplementation(async (path: string, options: any = {}) => {
    const method = options.method || 'GET'

    if (path.startsWith('/fields/')) {
      return { data: [] }
    }

    if (path === '/items/entities' && method === 'GET') {
      const and: any[] = options.query?.filter?._and || []
      const idFilter = and.find((f: any) => f.id)
      const slugFilter = and.find((f: any) => f.slug)
      const typeFilter = and.find((f: any) => f.entity_type)

      if (idFilter) {
        const id = idFilter.id._eq
        const row = entities.find((e) => String(e.id) === String(id))
        return { data: row ? [row] : [] }
      }

      if (slugFilter) {
        const slug = slugFilter.slug._eq
        const exists = entities.some((e) => e.slug === slug)
        return { data: exists ? [{ id: 'x' }] : [] }
      }

      if (typeFilter) {
        const types: string[] = typeFilter.entity_type._in
        return { data: entities.filter((e) => types.includes(e.entity_type)) }
      }

      return { data: [] }
    }

    if (path === '/items/entities' && method === 'POST') {
      const row = { id: nextEntityId++, ...options.body }
      entities.push(row)
      return { data: row }
    }

    if (path === '/items/block_instances' && method === 'GET') {
      const filter = options.query?.filter || {}
      const ids: any[] = filter.entity_id?._in ?? (filter.entity_id?._eq !== undefined ? [filter.entity_id._eq] : [])
      const idStrings = ids.map((id: any) => String(id))
      return { data: blocks.filter((b) => idStrings.includes(String(b.entity_id))) }
    }

    if (path === '/items/block_instances' && method === 'POST') {
      const row = { id: nextBlockId++, ...options.body }
      blocks.push(row)
      return { data: row }
    }

    if (path === '/items/entity_statblocks' || path === '/items/entity_actions' || path === '/items/monster_profiles') {
      return { data: [] }
    }

    return { data: [] }
  })

  return { entities, blocks }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  resolveWorldContentMock.mockReset()
})

describe('listHomebrewTemplates', () => {
  it('still lists legacy/homebrew-authored templates when a World has no bound Content Packs', async () => {
    createFakeDirectusStore([
      { id: 10, title: 'Minor Healing Draught', slug: 'minor-healing-draught', world_id: 5, system_key: 'dnd5e', entity_type: 'item', status: 'published', visibility: 'world', summary: '', image: null }
    ])
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([]))

    const result = await listHomebrewTemplates(5, 'item')

    expect(result.templates).toHaveLength(1)
    expect(result.templates[0]).toMatchObject({ id: '10', source: 'legacy' })
  })

  it('merges in Content Pack catalogue templates, each carrying explicit source identity (packageId/packageVersion/slug), not a numeric id', async () => {
    createFakeDirectusStore([])
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([entry()]))

    const result = await listHomebrewTemplates(5, 'item')

    expect(result.templates).toHaveLength(1)
    const [template] = result.templates

    expect(template.source).toBe('catalogue')
    expect(template.packageId).toBe('eldra.content.srd-5.1')
    expect(template.packageVersion).toBe('1.0.0')
    expect(template.slug).toBe('potion-of-healing-phb')
    expect(template.id).toBe('catalogue:eldra.content.srd-5.1:potion-of-healing-phb')
    expect(Number.isNaN(Number(template.id))).toBe(true)
    // Builder hydration reads template.core.* generically (see
    // AdminHomebrewForgePanel.vue's hydrateItemBuilderFromTemplate) --
    // prove the catalogue template's core carries the real converted data.
    expect(template.core.rarity).toBe('common')
  })

  it('derives the enemy catalogue template core via the same homebrewEnemyCoreFromStructuredRows path as a legacy enemy template', async () => {
    createFakeDirectusStore([])
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([
      entry({
        entityType: 'enemy',
        title: 'Goblin',
        slug: 'goblin-mm',
        packageId: 'eldra.content.srd-5.1',
        data: {
          name: 'Goblin',
          source: 'MM',
          size: ['S'],
          type: 'humanoid',
          ac: [15],
          hp: { average: 7, formula: '2d6' },
          str: 8,
          cr: '1/4'
        }
      })
    ]))

    const result = await listHomebrewTemplates(5, 'enemy')

    expect(result.templates).toHaveLength(1)
    const [template] = result.templates
    expect(template.source).toBe('catalogue')
    expect(template.core.armor_class).toBe('15')
    expect(template.core.challenge_rating).toBe('1/4')
  })

  it('returns a genuinely empty, non-error template list for a category with neither legacy nor Content Pack content', async () => {
    createFakeDirectusStore([])
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([]))

    const result = await listHomebrewTemplates(5, 'class')

    expect(result.ok).toBe(true)
    expect(result.templates).toEqual([])
  })

  it('never calls resolveWorldContent for background templates (no Content Pack equivalent exists for that type)', async () => {
    createFakeDirectusStore([])

    await listHomebrewTemplates(5, 'background')

    expect(resolveWorldContentMock).not.toHaveBeenCalled()
  })
})

describe('createHomebrewDraft -- legacy templates', () => {
  it('preserves existing behavior: creates a draft entity and clones the template block, returning a real persisted entity id', async () => {
    const store = createFakeDirectusStore(
      [{ id: 10, title: 'Minor Healing Draught', slug: 'minor-healing-draught', world_id: 5, system_key: 'dnd5e', entity_type: 'item', status: 'published', visibility: 'world', summary: '', image: null }],
      [{ id: 1, entity_id: 10, block_key: 'item_core', label: 'Item Core', repeatable: false, sort: 20, data: { name: 'Minor Healing Draught', item_type: 'P', rarity: 'common' } }]
    )
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([]))

    const result = await createHomebrewDraft(5, {
      type: 'item',
      templateEntityId: '10',
      title: 'My Healing Draught',
      item: { name: 'My Healing Draught', itemType: 'P', rarity: 'uncommon', description: 'Heals a bit.' }
    })

    expect(result.ok).toBe(true)
    expect(result.template.source).toBe('legacy')
    expect(typeof result.entity.id).toBe('number')
    expect(store.entities.some((e) => e.id === result.entity.id)).toBe(true)

    const itemCore = result.entity.blocks.find((b: any) => b.block_key === 'item_core')
    expect(itemCore?.data?.rarity).toBe('uncommon')
  })
})

describe('createHomebrewDraft -- Content Pack templates', () => {
  it('resolves the pack template server-side from this World\'s own catalogue rather than trusting client-submitted data', async () => {
    createFakeDirectusStore([])
    // `reqAttune: true` is only in the AUTHORITATIVE resolved entry below --
    // never in anything the client sends -- so the created block's
    // `attunement` field can only be true if the server actually resolved
    // this entry itself, not a client-echoed stand-in. `attunement` is a
    // field applyHomebrewItemPatch never overwrites (it only ever sets
    // `requiresAttunement`/`attunementText`), so it survives from the
    // converted catalogue data untouched, proving where it came from.
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([
      entry({ data: { name: 'Potion of Healing', source: 'PHB', rarity: 'common', weight: 0.5, reqAttune: true } })
    ]))

    const result = await createHomebrewDraft(5, {
      type: 'item',
      templateSource: 'catalogue',
      catalogueTemplateRef: {
        packageId: 'eldra.content.srd-5.1',
        packageVersion: '1.0.0',
        slug: 'potion-of-healing-phb',
        // A client could try to smuggle other fields on this ref -- they
        // must simply be ignored, since the server re-resolves by
        // packageId+slug alone.
        data: { name: 'Something Else Entirely', rarity: 'legendary', reqAttune: false }
      },
      item: { name: 'My Potion', itemType: 'P', rarity: 'rare', description: 'A homebrewed potion.' }
    })

    expect(result.ok).toBe(true)
    expect(result.template.source).toBe('catalogue')
    expect(resolveWorldContentMock).toHaveBeenCalledWith(5)

    const itemCore = result.entity.blocks.find((b: any) => b.block_key === 'item_core')
    expect(itemCore?.data?.attunement).toBe(true)
  })

  it('returns a real persisted entity id usable by the existing entity read/save path, never the synthetic catalogue template id', async () => {
    createFakeDirectusStore([])
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([entry()]))

    const result = await createHomebrewDraft(5, {
      type: 'item',
      templateSource: 'catalogue',
      catalogueTemplateRef: { packageId: 'eldra.content.srd-5.1', packageVersion: '1.0.0', slug: 'potion-of-healing-phb' },
      item: { name: 'My Potion', itemType: 'P', rarity: 'rare' }
    })

    expect(Number.isInteger(result.entity.id)).toBe(true)
    expect(result.template.id).not.toBe(result.entity.id)
    expect(result.template.id).toBe('catalogue:eldra.content.srd-5.1:potion-of-healing-phb')
  })

  it('builds the draft\'s initial block from the catalogue entry\'s raw data via the established preview5eTools* adapter for a type with no builder-form patch (species)', async () => {
    createFakeDirectusStore([])
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([
      entry({ entityType: 'species', title: 'Human', slug: 'human-phb', data: { name: 'Human', source: 'PHB', size: ['M'], speed: 30 } })
    ]))

    const result = await createHomebrewDraft(5, {
      type: 'species',
      templateSource: 'catalogue',
      catalogueTemplateRef: { packageId: 'eldra.content.srd-5.1', packageVersion: '1.0.0', slug: 'human-phb' },
      title: 'My Custom Human'
    })

    expect(result.ok).toBe(true)
    const speciesCore = result.entity.blocks.find((b: any) => b.block_key === 'species_core')
    expect(speciesCore?.data?.speed).toBeTruthy()
  })

  it('rejects a missing catalogue template reference with a distinguishable 400, not a silent empty draft', async () => {
    createFakeDirectusStore([])

    await expect(createHomebrewDraft(5, {
      type: 'item',
      templateSource: 'catalogue',
      catalogueTemplateRef: {}
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a stale/unknown pack template reference with a distinguishable 404', async () => {
    createFakeDirectusStore([])
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([entry()]))

    await expect(createHomebrewDraft(5, {
      type: 'item',
      templateSource: 'catalogue',
      catalogueTemplateRef: { packageId: 'eldra.content.srd-5.1', packageVersion: '1.0.0', slug: 'does-not-exist' }
    })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a cross-World pack template reference -- the entry is simply not in THIS World\'s resolved catalogue', async () => {
    createFakeDirectusStore([])
    // This World (5) only has a different pack/slug bound -- the
    // reference below belongs to some other World's catalogue.
    resolveWorldContentMock.mockResolvedValue(resolvedCatalogue([
      entry({ packageId: 'eldra.content.other-pack', slug: 'other-worlds-item' })
    ]))

    await expect(createHomebrewDraft(5, {
      type: 'item',
      templateSource: 'catalogue',
      catalogueTemplateRef: { packageId: 'eldra.content.srd-5.1', packageVersion: '1.0.0', slug: 'potion-of-healing-phb' }
    })).rejects.toMatchObject({ statusCode: 404 })
  })
})
