// Unit tests for POST /api/worlds/:id/characters/create-v2 -- Character
// Creation V2. requireCapability/can are exercised for REAL (not mocked);
// getWorldContentCatalogue and entity-factory.ts (createEntityRecord/
// dxFetch, the Directus I/O boundary) are mocked -- this file is about
// catalogue-driven validation and request handling, not Directus
// persistence (already covered by content-pack-publishing.test.ts /
// world-content-catalogue.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { getWorldContentCatalogueMock, createEntityRecordMock, dxFetchMock } = vi.hoisted(() => ({
  getWorldContentCatalogueMock: vi.fn(),
  createEntityRecordMock: vi.fn(),
  dxFetchMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))

vi.mock('../../../../../../server/utils/entity-factory', () => ({
  createEntityRecord: createEntityRecordMock,
  dxFetch: dxFetchMock
}))

import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import type { Principal } from '../../../../../../server/utils/authorization'

function catalogueEntry(overrides: Partial<{ packageId: string; packageVersion: string; slug: string; title: string }> = {}) {
  return {
    packageId: 'eldra.content.srd-5.1',
    packageVersion: '1.0.0',
    systemKey: 'dnd5e',
    title: 'Human',
    slug: 'human',
    externalId: 'Human__PHB',
    provider: '5etools-json',
    sourceBook: 'PHB',
    sourcePage: '31',
    ...overrides
  }
}

function fullCatalogue(overrides: Partial<{ species: any[]; classes: any[]; backgrounds: any[] }> = {}) {
  return {
    worldId: '5',
    packs: [],
    species: [catalogueEntry({ title: 'Human', slug: 'human' })],
    classes: [catalogueEntry({ title: 'Fighter', slug: 'fighter' })],
    backgrounds: [catalogueEntry({ title: 'Acolyte', slug: 'acolyte' })],
    feats: [],
    items: [],
    spells: [],
    ...overrides
  }
}

function playerPrincipal(worldId = '5'): Principal {
  return {
    accountId: 'player-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.character.create', 'world.character.edit_own', 'world.roll.execute'])]]),
    temporarySingleUserMode: false
  }
}

function observerPrincipal(worldId = '5'): Principal {
  return {
    accountId: 'observer-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read'])]]),
    temporarySingleUserMode: false
  }
}

function fakeEvent(worldId: string, principal: Principal | null, body: unknown): H3Event {
  return {
    context: { principal, params: { id: worldId } },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

function selectionOf(entry: ReturnType<typeof catalogueEntry>) {
  return { packageId: entry.packageId, slug: entry.slug, title: entry.title, externalId: entry.externalId }
}

beforeEach(() => {
  getWorldContentCatalogueMock.mockReset()
  createEntityRecordMock.mockReset()
  dxFetchMock.mockReset()
  dxFetchMock.mockResolvedValue({ data: {} })
})

describe('POST /api/worlds/:id/characters/create-v2', () => {
  it('fails with 401 when no principal is present', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())

    await expect(handler(fakeEvent('5', null, { title: 'Aria' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a principal lacking world.character.create', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())

    await expect(handler(fakeEvent('5', observerPrincipal(), { title: 'Aria' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('fails with 400 when the character name is missing', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())

    await expect(handler(fakeEvent('5', playerPrincipal(), { title: '   ' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('fails with 400 when a choice does not match any entry in the current catalogue -- no hardcoded/stale options accepted', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)

    const body = {
      title: 'Aria',
      species: { packageId: 'eldra.content.srd-5.1', slug: 'does-not-exist' },
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }

    await expect(handler(fakeEvent('5', playerPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('fails with 400 when the catalogue is empty for a category -- there is nothing valid to choose', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue({ species: [] }))

    const catalogue = fullCatalogue()
    const body = {
      title: 'Aria',
      species: { packageId: 'eldra.content.srd-5.1', slug: 'human' },
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }

    await expect(handler(fakeEvent('5', playerPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('succeeds for a Player choosing real catalogue entries -- creates a minimal pc entity and records the selection, nothing more', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    createEntityRecordMock.mockResolvedValue({ success: true, id: 42, title: 'Aria', entity_type: 'pc' })

    const body = {
      title: 'Aria',
      species: selectionOf(catalogue.species[0]),
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }

    const result = await handler(fakeEvent('5', playerPrincipal(), body))

    expect(createEntityRecordMock).toHaveBeenCalledWith({ worldId: '5', title: 'Aria', entityType: 'pc' })

    const blockCall = dxFetchMock.mock.calls.find(([path]) => path === '/items/block_instances')
    expect(blockCall).toBeTruthy()
    const blockBody = JSON.parse(blockCall![1].body)
    expect(blockBody).toMatchObject({
      entity_id: 42,
      block_key: 'catalogue_selection',
      data: {
        species: catalogue.species[0],
        class: catalogue.classes[0],
        background: catalogue.backgrounds[0]
      }
    })

    // No ability scores, no character_sheets write, no rules evaluation --
    // dxFetch is called exactly once, for the block, never for
    // /items/character_sheets.
    expect(dxFetchMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ id: 42, title: 'Aria' })
  })

  it('never persists the catalogue entry\'s presentation model into the character record', async () => {
    // ContentCatalogueEntry grew a `presentation` field in Character
    // Builder/Sheet Phase 2. Persisting the entry verbatim would have written
    // a rendered presentation snapshot per choice into every character, which
    // character-assembly.ts never reads -- it re-resolves by (packageId, slug)
    // against the CURRENT catalogue. The stored shape is pinned instead.
    const presentation = {
      kind: 'species',
      name: 'Human',
      description: [],
      facts: [{ label: 'Speed', value: '30 ft.' }],
      sections: [],
      notes: []
    }
    const catalogue = fullCatalogue({
      species: [{ ...catalogueEntry({ title: 'Human', slug: 'human' }), presentation }]
    })
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    createEntityRecordMock.mockResolvedValue({ id: 42, title: 'Aria' })

    await handler(fakeEvent('5', playerPrincipal(), {
      title: 'Aria',
      species: selectionOf(catalogue.species[0]),
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }))

    const blockCall = dxFetchMock.mock.calls.find(([path]) => path === '/items/block_instances')
    const stored = JSON.parse(blockCall![1].body).data

    expect(stored.species).not.toHaveProperty('presentation')
    expect(Object.keys(stored.species).sort()).toEqual([
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
  })
})
