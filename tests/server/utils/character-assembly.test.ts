// Unit tests for server/utils/character-assembly.ts -- Character Assembly
// Phase 1. getWorldContentCatalogue is mocked at the module boundary
// (already independently tested by world-content-catalogue.test.ts); this
// file is about resolution/reporting logic, not catalogue composition.
// directusServiceRequest (the entities/block_instances reads) is mocked as
// the Directus I/O boundary, mirroring create-v2.post.test.ts's own split.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorldContentCatalogueMock, directusServiceRequestMock } = vi.hoisted(() => ({
  getWorldContentCatalogueMock: vi.fn(),
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { assembleCharacter } from '../../../server/utils/character-assembly'

function catalogueEntry(overrides: Partial<{ packageId: string; slug: string; title: string }> = {}) {
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

function fullCatalogue(overrides: Partial<{ species: any[]; classes: any[]; backgrounds: any[]; packs: any[] }> = {}) {
  return {
    worldId: '5',
    packs: [{ ok: true, packageId: 'eldra.content.srd-5.1', version: '1.0.0', title: 'SRD 5.1', entryCount: 3 }],
    species: [catalogueEntry({ title: 'Human', slug: 'human' })],
    classes: [catalogueEntry({ title: 'Fighter', slug: 'fighter' })],
    backgrounds: [catalogueEntry({ title: 'Acolyte', slug: 'acolyte' })],
    feats: [],
    items: [],
    spells: [],
    ...overrides
  }
}

function selectionRef(entry: ReturnType<typeof catalogueEntry>) {
  return { ...entry }
}

function mockEntityAndBlock(entity: any, blockData: any) {
  directusServiceRequestMock.mockImplementation(async (path: string) => {
    if (path === '/items/entities/42') {
      return { data: entity }
    }
    if (path === '/items/block_instances') {
      return { data: blockData ? [{ data: blockData }] : [] }
    }
    throw new Error(`Unexpected Directus path in test: ${path}`)
  })
}

beforeEach(() => {
  getWorldContentCatalogueMock.mockReset()
  directusServiceRequestMock.mockReset()
})

describe('assembleCharacter', () => {
  it('resolves species, class, and background from the current catalogue', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      { species: selectionRef(catalogue.species[0]), class: selectionRef(catalogue.classes[0]), background: selectionRef(catalogue.backgrounds[0]) }
    )

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.blueprint.worldId).toBe('5')
    expect(result.blueprint.characterId).toBe('42')
    expect(result.blueprint.characterTitle).toBe('Aria')

    expect(result.blueprint.species).toEqual({ status: 'resolved', entry: catalogue.species[0] })
    expect(result.blueprint.class).toEqual({ status: 'resolved', entry: catalogue.classes[0] })
    expect(result.blueprint.background).toEqual({ status: 'resolved', entry: catalogue.backgrounds[0] })
    expect(result.blueprint.packs).toEqual(catalogue.packs)
  })

  it('reports character-not-found for an entity that does not exist', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/entities/999') return { data: null }
      throw new Error(`Unexpected Directus path in test: ${path}`)
    })

    const result = await assembleCharacter('5', '999')

    expect(result).toEqual({ available: false, reason: 'character-not-found' })
    expect(getWorldContentCatalogueMock).not.toHaveBeenCalled()
  })

  it('reports character-not-found for an entity that exists but belongs to a different World', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/entities/42') return { data: { id: 42, world_id: 9, title: 'Aria' } }
      throw new Error(`Unexpected Directus path in test: ${path}`)
    })

    const result = await assembleCharacter('5', '42')

    expect(result).toEqual({ available: false, reason: 'character-not-found' })
  })

  it('reports character-not-found (not a crash) when the entity lookup itself throws -- Directus returns 403, not an empty result, for a nonexistent id', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/entities/99999999') {
        throw new Error('403 Forbidden')
      }
      throw new Error(`Unexpected Directus path in test: ${path}`)
    })

    const result = await assembleCharacter('5', '99999999')

    expect(result).toEqual({ available: false, reason: 'character-not-found' })
    expect(getWorldContentCatalogueMock).not.toHaveBeenCalled()
  })

  it('reports no-catalogue-selection for a character with no catalogue_selection block (e.g. a V1 character)', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    mockEntityAndBlock({ id: 42, world_id: 5, title: 'Aria' }, null)

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toBe('no-catalogue-selection')
    expect(getWorldContentCatalogueMock).not.toHaveBeenCalled()
  })

  it('reports a missing slot (with a clear reason) when a recorded choice is no longer offered by its pack', async () => {
    const catalogue = fullCatalogue({ species: [] }) // Human removed from the current catalogue
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: { packageId: 'eldra.content.srd-5.1', slug: 'human' },
        class: selectionRef(fullCatalogue().classes[0]),
        background: selectionRef(fullCatalogue().backgrounds[0])
      }
    )

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.species).toMatchObject({ status: 'missing', packageId: 'eldra.content.srd-5.1', slug: 'human' })
    expect((result.blueprint.species as any).reason).toMatch(/no longer offered/)
    // The other two slots are unaffected by one missing slot.
    expect(result.blueprint.class.status).toBe('resolved')
    expect(result.blueprint.background.status).toBe('resolved')
  })

  it('reports a missing slot with a distinct reason when the choice depends on a Content Pack that failed to load', async () => {
    const catalogue = fullCatalogue({
      species: [],
      packs: [
        { ok: false, packageId: 'eldra.content.srd-5.1', version: '1.0.0', failure: { stage: 'not-found', packageId: 'eldra.content.srd-5.1', version: '1.0.0' } }
      ]
    })
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: { packageId: 'eldra.content.srd-5.1', slug: 'human' },
        class: selectionRef(fullCatalogue().classes[0]),
        background: selectionRef(fullCatalogue().backgrounds[0])
      }
    )

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.species).toMatchObject({ status: 'missing', packageId: 'eldra.content.srd-5.1', slug: 'human' })
    expect((result.blueprint.species as any).reason).toMatch(/failed to load/)
    expect(result.blueprint.packs.some((p) => !p.ok)).toBe(true)
  })

  it('reports a missing slot when a choice was never recorded at all', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      { class: selectionRef(catalogue.classes[0]), background: selectionRef(catalogue.backgrounds[0]) } // no species key at all
    )

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.species).toMatchObject({ status: 'missing', packageId: '', slug: '' })
    expect((result.blueprint.species as any).reason).toMatch(/No Species was recorded/)
  })
})
