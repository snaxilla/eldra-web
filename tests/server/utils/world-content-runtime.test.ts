// Unit tests for server/utils/world-content-runtime.ts -- Content
// Resolution Phase 1. Mirrors tests/server/utils/world-runtime-service.test.ts's
// own shape: the two composed functions (listContentPackBindingsForWorld,
// loadPublishedContentPack) are mocked at the boundary; resolveWorldContent/
// summarizeWorldContent's own composition and shaping logic run for real.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listContentPackBindingsForWorldMock, loadPublishedContentPackMock } = vi.hoisted(() => ({
  listContentPackBindingsForWorldMock: vi.fn(),
  loadPublishedContentPackMock: vi.fn()
}))

vi.mock('../../../server/utils/world-content-packs', () => ({
  listContentPackBindingsForWorld: listContentPackBindingsForWorldMock
}))

vi.mock('../../../server/utils/content-packs', () => ({
  loadPublishedContentPack: loadPublishedContentPackMock
}))

import { resolveWorldContent, summarizeWorldContent } from '../../../server/utils/world-content-runtime'

function binding(packageId: string, version = '1.0.0') {
  return {
    id: `${packageId}-binding`,
    worldId: '5',
    packageId,
    packageVersion: version,
    packageIntegrity: 'sha256-fake',
    createdAt: null,
    updatedAt: null
  }
}

function candidate(overrides: Partial<{
  systemKey: string
  entityType: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook: string
  sourcePage: string
  data: unknown
}> = {}) {
  return {
    systemKey: 'dnd5e',
    entityType: 'spell',
    title: 'Fire Bolt',
    slug: 'fire-bolt-phb',
    externalId: 'Fire Bolt__PHB',
    provider: '5etools-json',
    sourceBook: 'PHB',
    sourcePage: '211',
    data: { name: 'Fire Bolt', srd: true },
    ...overrides
  }
}

function loadedPack(packageId: string, version: string, content: any[], title = 'Test Pack') {
  return {
    ok: true as const,
    package: {
      packageId,
      version,
      manifest: {
        packageId,
        version,
        status: 'published' as const,
        contentSchemaVersion: 1,
        title,
        license: { id: 'OGL-1.0a' }
      },
      content,
      integrityHash: 'sha256-fake'
    }
  }
}

beforeEach(() => {
  listContentPackBindingsForWorldMock.mockReset()
  loadPublishedContentPackMock.mockReset()
})

describe('resolveWorldContent', () => {
  it('empty worlds (zero bindings) resolve to an empty catalogue, never an error', async () => {
    listContentPackBindingsForWorldMock.mockResolvedValue([])

    const catalogue = await resolveWorldContent('5')

    expect(catalogue).toEqual({
      worldId: '5',
      packs: [],
      entries: [],
      byEntityType: {}
    })
    expect(loadPublishedContentPackMock).not.toHaveBeenCalled()
  })

  it('a bound pack resolves correctly -- entries carry the pack they came from, data untouched', async () => {
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('eldra.content.srd-5.1')])
    loadPublishedContentPackMock.mockResolvedValue(
      loadedPack('eldra.content.srd-5.1', '1.0.0', [
        candidate({ title: 'Fire Bolt', entityType: 'spell' }),
        candidate({ title: 'Acolyte', entityType: 'background', slug: 'acolyte-phb' })
      ], '5th Edition SRD 5.1')
    )

    const catalogue = await resolveWorldContent('5')

    expect(catalogue.packs).toEqual([
      { ok: true, packageId: 'eldra.content.srd-5.1', version: '1.0.0', title: '5th Edition SRD 5.1', entryCount: 2 }
    ])
    expect(catalogue.entries).toHaveLength(2)
    expect(catalogue.entries[0]).toMatchObject({
      title: 'Fire Bolt',
      entityType: 'spell',
      packageId: 'eldra.content.srd-5.1',
      packageVersion: '1.0.0',
      data: { name: 'Fire Bolt', srd: true }
    })
    expect(catalogue.byEntityType.spell).toHaveLength(1)
    expect(catalogue.byEntityType.background).toHaveLength(1)
  })

  it('integrity is enforced -- an integrity-mismatched binding is reported broken, never silently included', async () => {
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('eldra.content.srd-5.1')])
    loadPublishedContentPackMock.mockResolvedValue({
      ok: false,
      stage: 'integrity-mismatch',
      expected: 'sha256-stored',
      computed: 'sha256-different'
    })

    const catalogue = await resolveWorldContent('5')

    expect(catalogue.packs).toEqual([
      {
        ok: false,
        packageId: 'eldra.content.srd-5.1',
        version: '1.0.0',
        failure: { stage: 'integrity-mismatch', expected: 'sha256-stored', computed: 'sha256-different' }
      }
    ])
    // The broken binding contributes nothing to the resolved catalogue.
    expect(catalogue.entries).toEqual([])
    expect(catalogue.byEntityType).toEqual({})
  })

  it('multiple bound packs compose -- entries and byEntityType merge across packs', async () => {
    listContentPackBindingsForWorldMock.mockResolvedValue([
      binding('eldra.content.srd-5.1'),
      binding('eldra.content.homebrew-pack')
    ])

    loadPublishedContentPackMock.mockImplementation(async (packageId: string) => {
      if (packageId === 'eldra.content.srd-5.1') {
        return loadedPack(packageId, '1.0.0', [candidate({ title: 'Fire Bolt', entityType: 'spell' })], 'SRD 5.1')
      }
      return loadedPack(packageId, '1.0.0', [candidate({ title: 'Homebrew Sword', entityType: 'item', slug: 'homebrew-sword' })], 'Homebrew Pack')
    })

    const catalogue = await resolveWorldContent('5')

    expect(catalogue.packs).toHaveLength(2)
    expect(catalogue.packs.every((p) => p.ok)).toBe(true)
    expect(catalogue.entries).toHaveLength(2)
    expect(catalogue.byEntityType.spell).toHaveLength(1)
    expect(catalogue.byEntityType.item).toHaveLength(1)
    expect(catalogue.byEntityType.item[0].title).toBe('Homebrew Sword')
  })

  it('one broken binding does not block another bound pack from resolving -- partial success, not all-or-nothing', async () => {
    listContentPackBindingsForWorldMock.mockResolvedValue([
      binding('eldra.content.broken-pack'),
      binding('eldra.content.srd-5.1')
    ])

    loadPublishedContentPackMock.mockImplementation(async (packageId: string) => {
      if (packageId === 'eldra.content.broken-pack') {
        return { ok: false, stage: 'not-found', packageId, version: '1.0.0' }
      }
      return loadedPack(packageId, '1.0.0', [candidate({ title: 'Fire Bolt', entityType: 'spell' })], 'SRD 5.1')
    })

    const catalogue = await resolveWorldContent('5')

    const broken = catalogue.packs.find((p) => p.packageId === 'eldra.content.broken-pack')
    const ok = catalogue.packs.find((p) => p.packageId === 'eldra.content.srd-5.1')

    expect(broken).toMatchObject({ ok: false, failure: { stage: 'not-found' } })
    expect(ok).toMatchObject({ ok: true, entryCount: 1 })
    expect(catalogue.entries).toHaveLength(1)
  })
})

describe('summarizeWorldContent', () => {
  it('strips `data` from every entry -- discovery, not full gameplay content', async () => {
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('eldra.content.srd-5.1')])
    loadPublishedContentPackMock.mockResolvedValue(
      loadedPack('eldra.content.srd-5.1', '1.0.0', [candidate({ data: { name: 'Fire Bolt', hugePayload: 'x'.repeat(10000) } })])
    )

    const catalogue = await resolveWorldContent('5')
    const summary = summarizeWorldContent(catalogue)

    expect(summary.totalEntries).toBe(1)
    const entry = summary.byEntityType.spell[0]
    expect(entry).not.toHaveProperty('data')
    expect(entry).toMatchObject({
      systemKey: 'dnd5e',
      entityType: 'spell',
      title: 'Fire Bolt',
      slug: 'fire-bolt-phb',
      externalId: 'Fire Bolt__PHB',
      provider: '5etools-json',
      sourceBook: 'PHB',
      sourcePage: '211',
      packageId: 'eldra.content.srd-5.1',
      packageVersion: '1.0.0'
    })
  })

  it('preserves the per-pack resolution list (including broken bindings) in the summary', async () => {
    listContentPackBindingsForWorldMock.mockResolvedValue([binding('eldra.content.broken')])
    loadPublishedContentPackMock.mockResolvedValue({ ok: false, stage: 'not-found', packageId: 'eldra.content.broken', version: '1.0.0' })

    const catalogue = await resolveWorldContent('5')
    const summary = summarizeWorldContent(catalogue)

    expect(summary.packs).toEqual([
      { ok: false, packageId: 'eldra.content.broken', version: '1.0.0', failure: { stage: 'not-found', packageId: 'eldra.content.broken', version: '1.0.0' } }
    ])
    expect(summary.totalEntries).toBe(0)
    expect(summary.byEntityType).toEqual({})
  })

  it('empty worlds summarize to an empty summary', async () => {
    listContentPackBindingsForWorldMock.mockResolvedValue([])

    const catalogue = await resolveWorldContent('5')
    const summary = summarizeWorldContent(catalogue)

    expect(summary).toEqual({
      worldId: '5',
      packs: [],
      totalEntries: 0,
      byEntityType: {}
    })
  })
})
