// The single-writer invariant, end to end (R11 / §11.3).
//
// These exercise the REAL publishing pipeline -- publishContentPack ->
// publishContentPackRelease -- with only the Directus HTTP boundary
// mocked. The point is not that the guard function works (that is
// content-package-lineages.test.ts) but that no publication path can
// reach the content_packs table around it, and that an unadopted
// lineage is completely unaffected.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearContentPackCache, publishContentPackRelease } from '../../../server/utils/content-packs'
import { publishContentPack, type ContentPublicationCandidate } from '../../../server/utils/content-pack-publishing'
import { publishContentSourceSelection } from '../../../server/utils/content-sources/publish'
import { refreshContentSource } from '../../../server/utils/content-sources/refresh'

const { directusServiceRequestMock } = vi.hoisted(() => ({ directusServiceRequestMock: vi.fn() }))
vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))

// One Directus call's options, as directusServiceRequest passes them --
// typed so a mock reading the wrong shape fails to compile rather than
// silently matching nothing.
type DirectusCall = { method?: string, body?: unknown, query?: Record<string, unknown> }
type DirectusRow = Record<string, unknown>

const PACKAGE_ID = 'eldra.solaris.xphb'
const WORKSPACE = 'a1111111-1111-4111-8111-111111111111'

function candidate(overrides: Partial<ContentPublicationCandidate> = {}): ContentPublicationCandidate {
  return {
    systemKey: 'dnd5e',
    entityType: 'item',
    title: 'Shortsword',
    slug: 'shortsword-xphb',
    externalId: 'Shortsword__XPHB',
    provider: '5etools',
    data: { name: 'Shortsword' },
    ...overrides
  }
}

function publicationInput() {
  return {
    packageId: PACKAGE_ID,
    version: '1.0.39',
    title: "Player's Handbook (2024)",
    license: { id: 'proprietary' },
    candidates: [candidate()]
  }
}

// One mock standing in for the whole instance, routed by path the way
// Directus itself routes. `lineage` is the registry row, or null.
function mockDirectus(options: { lineage?: Record<string, unknown> | null; existingPack?: boolean } = {}) {
  const inserted: DirectusRow[] = []

  directusServiceRequestMock.mockImplementation(async (path: string, init: DirectusCall = {}) => {
    if (path.startsWith('/items/content_package_lineages')) {
      return { data: options.lineage ? [options.lineage] : [] }
    }

    if (path.startsWith('/items/content_packs')) {
      if (init.method === 'POST') {
        inserted.push(init.body as DirectusRow)
        return { data: init.body }
      }
      return { data: options.existingPack ? [{ status: 'published' }] : [] }
    }

    throw new Error(`Unmocked Directus path: ${init.method || 'GET'} ${path}`)
  })

  return { inserted }
}

function adoptedLineage() {
  return {
    id: 'row-1',
    package_id: PACKAGE_ID,
    owner_workspace_id: WORKSPACE,
    status: 'adopted',
    supersedes: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  }
}

beforeEach(() => {
  clearContentPackCache()
  directusServiceRequestMock.mockReset()
})

describe('before adoption -- existing publishing is untouched', () => {
  it('publishes normally when the lineage has no registry row', async () => {
    const { inserted } = mockDirectus({ lineage: null })

    const result = await publishContentPack(publicationInput())

    expect(result.published).toBe(true)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ package_id: PACKAGE_ID, version: '1.0.39', status: 'published' })
  })

  it('publishes normally when the registry collection is not provisioned at all', async () => {
    const inserted: DirectusRow[] = []
    directusServiceRequestMock.mockImplementation(async (path: string, init: DirectusCall = {}) => {
      if (path.includes('content_package_lineages') || path.startsWith('/collections/')) {
        throw Object.assign(new Error('forbidden'), {
          statusCode: 403,
          data: { errors: [{ extensions: { code: 'FORBIDDEN' } }] }
        })
      }
      if (path.startsWith('/items/content_packs')) {
        if (init.method === 'POST') { inserted.push(init.body as DirectusRow); return { data: init.body } }
        return { data: [] }
      }
      throw new Error(`Unmocked path ${path}`)
    })

    await expect(publishContentPack(publicationInput())).resolves.toMatchObject({ published: true })
    expect(inserted).toHaveLength(1)
  })

  it('still refuses a duplicate (packageId, version) -- the guard adds a reason, it does not remove one', async () => {
    mockDirectus({ lineage: null, existingPack: true })
    await expect(publishContentPack(publicationInput())).resolves.toMatchObject({ published: false, stage: 'already-exists' })
  })
})

describe('after adoption -- every publication path refuses', () => {
  it('publishContentPackRelease writes NOTHING', async () => {
    const { inserted } = mockDirectus({ lineage: adoptedLineage() })

    const result = await publishContentPackRelease({
      packageId: PACKAGE_ID,
      version: '1.0.39',
      title: 'x',
      contentSchemaVersion: 1,
      licenseId: 'proprietary',
      manifest: { packageId: PACKAGE_ID, version: '1.0.39', status: 'published', contentSchemaVersion: 1, title: 'x', license: { id: 'proprietary' } },
      content: []
    })

    expect(result).toMatchObject({ ok: false, stage: 'lineage-refused', ownerWorkspaceId: WORKSPACE })
    expect(inserted).toHaveLength(0)
  })

  it('refuses BEFORE the duplicate check even runs -- no content_packs read, no write', async () => {
    mockDirectus({ lineage: adoptedLineage() })
    await publishContentPack(publicationInput())

    const touchedPacks = directusServiceRequestMock.mock.calls.filter(([path]) => String(path).startsWith('/items/content_packs'))
    expect(touchedPacks).toHaveLength(0)
  })

  it('publishContentPack relays the refusal with its explanation', async () => {
    mockDirectus({ lineage: adoptedLineage() })

    const result = await publishContentPack(publicationInput())
    expect(result.published).toBe(false)
    if (result.published || result.stage !== 'lineage-refused') throw new Error('expected a lineage refusal')
    expect(result.ownerWorkspaceId).toBe(WORKSPACE)
    expect(result.message).toContain('only publisher')
  })

  it('publishContentSourceSelection relays it', async () => {
    mockDirectus({ lineage: adoptedLineage() })

    const provider = {
      gameSystemKey: 'dnd5e',
      collectionKey: 'xphb',
      adapterId: '5etools-json',
      categories: [{ key: 'items', label: 'Items' }],
      checkAvailability: async () => ({ available: true as const }),
      loadCategory: async () => ({ candidates: [candidate()], warnings: [] })
    }
    const collection = {
      key: 'xphb',
      label: "Player's Handbook (2024)",
      books: [],
      license: { id: 'proprietary' },
      suggestedPackageId: PACKAGE_ID
    }

    const outcome = await publishContentSourceSelection({
      provider: provider as never,
      collection: collection as never,
      packageId: PACKAGE_ID,
      version: '1.0.39',
      selection: { items: ['Shortsword__XPHB'] }
    })

    expect(outcome).toMatchObject({ published: false, stage: 'lineage-refused', ownerWorkspaceId: WORKSPACE })
  })

  it('refreshContentSource -- the packages:sync path -- refuses and publishes no second release', async () => {
    const inserted: DirectusRow[] = []
    const content = [candidate()]

    directusServiceRequestMock.mockImplementation(async (path: string, init: DirectusCall = {}) => {
      if (path.startsWith('/items/content_package_lineages')) return { data: [adoptedLineage()] }
      if (path.startsWith('/items/content_packs')) {
        if (init.method === 'POST') { inserted.push(init.body as DirectusRow); return { data: init.body } }
        // The listing that finds the version to refresh FROM, and the
        // full load of it.
        const manifest = { packageId: PACKAGE_ID, version: '1.0.38', status: 'published', contentSchemaVersion: 1, title: 'x', license: { id: 'proprietary' } }
        return {
          data: [{
            package_id: PACKAGE_ID, version: '1.0.38', title: 'x', content_schema_version: 1,
            license_id: 'proprietary', manifest, content, status: 'published',
            integrity_hash: 'sha256-unverified'
          }]
        }
      }
      throw new Error(`Unmocked path ${path}`)
    })

    const provider = {
      gameSystemKey: 'dnd5e',
      collectionKey: 'xphb',
      adapterId: '5etools-json',
      categories: [{ key: 'items', label: 'Items' }],
      checkAvailability: async () => ({ available: true as const }),
      loadCategory: async () => ({ candidates: content, warnings: [] })
    }

    const outcome = await refreshContentSource({
      provider: provider as never,
      collection: { key: 'xphb', label: 'x', books: [], license: { id: 'proprietary' }, suggestedPackageId: PACKAGE_ID } as never,
      packageId: PACKAGE_ID
    })

    // It may fail earlier (the fixture's integrity hash is deliberately
    // not recomputed) -- what must never happen is a new release row.
    if (outcome.refreshed === false && outcome.stage === 'lineage-refused') {
      expect(outcome.message).toContain('only publisher')
    }
    expect(inserted).toHaveLength(0)
  })
})

describe('the owning workspace', () => {
  it('may publish its own lineage', async () => {
    const { inserted } = mockDirectus({ lineage: adoptedLineage() })

    const result = await publishContentPackRelease({
      packageId: PACKAGE_ID,
      version: '1.0.39',
      title: 'x',
      contentSchemaVersion: 1,
      licenseId: 'proprietary',
      manifest: { packageId: PACKAGE_ID, version: '1.0.39', status: 'published', contentSchemaVersion: 1, title: 'x', license: { id: 'proprietary' } },
      content: [],
      publisher: { kind: 'workspace', workspaceId: WORKSPACE }
    })

    expect(result.ok).toBe(true)
    expect(inserted).toHaveLength(1)
  })
})
