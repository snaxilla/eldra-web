// Unit tests for World <-> Content Pack Binding business logic
// (server/utils/world-content-pack-binding.ts, Content Pack Infrastructure
// Phase 1). loadPublishedContentPack (./content-packs) and the binding
// persistence functions (./world-content-packs) are mocked directly,
// backed by a small stateful in-memory store -- mirrors
// world-rules-activation.test.ts's own approach.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  loadPublishedContentPackMock,
  findContentPackBindingMock,
  saveContentPackBindingMock,
  removeContentPackBindingMock
} = vi.hoisted(() => ({
  loadPublishedContentPackMock: vi.fn(),
  findContentPackBindingMock: vi.fn(),
  saveContentPackBindingMock: vi.fn(),
  removeContentPackBindingMock: vi.fn()
}))

vi.mock('../../../server/utils/content-packs', () => ({
  loadPublishedContentPack: loadPublishedContentPackMock
}))

vi.mock('../../../server/utils/world-content-packs', () => ({
  findContentPackBinding: findContentPackBindingMock,
  saveContentPackBinding: saveContentPackBindingMock,
  removeContentPackBinding: removeContentPackBindingMock
}))

import { bindContentPackToWorld, unbindContentPackFromWorld } from '../../../server/utils/world-content-pack-binding'
import type { WorldContentPackBindingRecord } from '../../../server/utils/world-content-packs'

function publishedPackResult(overrides: { packageId?: string; version?: string; integrityHash?: string } = {}) {
  return {
    ok: true as const,
    package: {
      packageId: overrides.packageId ?? 'eldra.srd-5.1',
      version: overrides.version ?? '1.0.0',
      manifest: { packageId: 'eldra.srd-5.1', version: '1.0.0', status: 'published', contentSchemaVersion: 1, title: 'SRD 5.1', license: { id: 'CC0-1.0' } },
      content: [{ id: 'item:torch' }],
      integrityHash: overrides.integrityHash ?? 'sha256-abc'
    }
  }
}

// A minimal, stateful stand-in for world-content-packs.ts's own
// persistence, mirroring its already-tested semantics
// (world-content-packs.test.ts): at most one binding per (worldId,
// packageId); saving repins an existing binding in place.
function createFakeBindingStore(initial: Record<string, WorldContentPackBindingRecord> = {}) {
  const store: Record<string, WorldContentPackBindingRecord> = { ...initial }
  let nextId = 1
  const key = (worldId: string | number, packageId: string) => `${worldId}::${packageId}`

  findContentPackBindingMock.mockImplementation(async (worldId: string | number, packageId: string) => {
    return store[key(worldId, packageId)] ?? null
  })

  saveContentPackBindingMock.mockImplementation(
    async (worldId: string | number, packageId: string, input: { version: string; integrity: string | null }) => {
      const k = key(worldId, packageId)
      const existing = store[k]

      const updated: WorldContentPackBindingRecord = {
        id: existing?.id ?? `b${nextId++}`,
        worldId: String(worldId),
        packageId,
        packageVersion: input.version,
        packageIntegrity: input.integrity,
        createdAt: existing?.createdAt ?? '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }

      store[k] = updated
      return updated
    }
  )

  removeContentPackBindingMock.mockImplementation(async (worldId: string | number, packageId: string) => {
    const k = key(worldId, packageId)
    if (!(k in store)) return false
    delete store[k]
    return true
  })

  return store
}

beforeEach(() => {
  loadPublishedContentPackMock.mockReset()
  findContentPackBindingMock.mockReset()
  saveContentPackBindingMock.mockReset()
  removeContentPackBindingMock.mockReset()
})

describe('bindContentPackToWorld -- bind a published pack', () => {
  it('binds the World, returns bound:true with the binding record', async () => {
    createFakeBindingStore()
    loadPublishedContentPackMock.mockResolvedValue(publishedPackResult())

    const result = await bindContentPackToWorld(1, 'eldra.srd-5.1', '1.0.0')

    expect(result.bound).toBe(true)
    if (!result.bound) throw new Error('expected binding to succeed')
    expect(result.binding.packageId).toBe('eldra.srd-5.1')
    expect(result.binding.packageVersion).toBe('1.0.0')
    expect(result.binding.packageIntegrity).toBe('sha256-abc')
  })

  it('persists via saveContentPackBinding using the loaded package\'s own identity', async () => {
    const store = createFakeBindingStore()
    loadPublishedContentPackMock.mockResolvedValue(publishedPackResult())

    await bindContentPackToWorld(1, 'eldra.srd-5.1', '1.0.0')

    expect(store['1::eldra.srd-5.1'].packageVersion).toBe('1.0.0')
    expect(store['1::eldra.srd-5.1'].packageIntegrity).toBe('sha256-abc')
  })
})

describe('bindContentPackToWorld -- rejections write nothing', () => {
  it('rejects a missing pack', async () => {
    const store = createFakeBindingStore()
    loadPublishedContentPackMock.mockResolvedValueOnce({ ok: false, stage: 'not-found', packageId: 'eldra.missing', version: '1.0.0' })

    const result = await bindContentPackToWorld(1, 'eldra.missing', '1.0.0')

    expect(result.bound).toBe(false)
    if (result.bound) throw new Error('expected rejection')
    expect(result.stage).toBe('package-load')
    expect(result.failure).toEqual({ stage: 'not-found', packageId: 'eldra.missing', version: '1.0.0' })
    expect(saveContentPackBindingMock).not.toHaveBeenCalled()
    expect(store['1::eldra.missing']).toBeUndefined()
  })

  it('rejects a draft pack', async () => {
    createFakeBindingStore()
    loadPublishedContentPackMock.mockResolvedValueOnce({ ok: false, stage: 'not-published', status: 'draft' })

    const result = await bindContentPackToWorld(1, 'eldra.srd-5.1', '1.0.0')

    expect(result.bound).toBe(false)
    if (result.bound) throw new Error('expected rejection')
    expect(result.failure).toEqual({ stage: 'not-published', status: 'draft' })
    expect(saveContentPackBindingMock).not.toHaveBeenCalled()
  })

  it('rejects an integrity mismatch', async () => {
    createFakeBindingStore()
    loadPublishedContentPackMock.mockResolvedValueOnce({
      ok: false,
      stage: 'integrity-mismatch',
      expected: 'sha256-aaa',
      computed: 'sha256-bbb'
    })

    const result = await bindContentPackToWorld(1, 'eldra.srd-5.1', '1.0.0')

    expect(result.bound).toBe(false)
    if (result.bound) throw new Error('expected rejection')
    expect(result.failure).toEqual({ stage: 'integrity-mismatch', expected: 'sha256-aaa', computed: 'sha256-bbb' })
    expect(saveContentPackBindingMock).not.toHaveBeenCalled()
  })
})

describe('bindContentPackToWorld -- repin', () => {
  it('binding the same packageId again with a different version repins in place, not a second binding', async () => {
    const store = createFakeBindingStore()

    loadPublishedContentPackMock.mockResolvedValue(publishedPackResult())
    await bindContentPackToWorld(1, 'eldra.srd-5.1', '1.0.0')

    loadPublishedContentPackMock.mockResolvedValue(publishedPackResult({ version: '2.0.0', integrityHash: 'sha256-def' }))
    const second = await bindContentPackToWorld(1, 'eldra.srd-5.1', '2.0.0')

    expect(second.bound).toBe(true)
    expect(Object.keys(store)).toEqual(['1::eldra.srd-5.1'])
    expect(store['1::eldra.srd-5.1'].packageVersion).toBe('2.0.0')
    expect(store['1::eldra.srd-5.1'].packageIntegrity).toBe('sha256-def')
  })
})

describe('bindContentPackToWorld -- multiple packs per world', () => {
  it('binding two different packageIds to the same world produces two independent bindings', async () => {
    const store = createFakeBindingStore()

    loadPublishedContentPackMock.mockResolvedValue(publishedPackResult({ packageId: 'eldra.srd-5.1' }))
    await bindContentPackToWorld(1, 'eldra.srd-5.1', '1.0.0')

    loadPublishedContentPackMock.mockResolvedValue(publishedPackResult({ packageId: 'eldra.homebrew-bestiary', version: '0.1.0' }))
    await bindContentPackToWorld(1, 'eldra.homebrew-bestiary', '0.1.0')

    expect(Object.keys(store).sort()).toEqual(['1::eldra.homebrew-bestiary', '1::eldra.srd-5.1'])
  })
})

describe('unbindContentPackFromWorld', () => {
  it('removes an existing binding', async () => {
    const store = createFakeBindingStore({
      '1::eldra.srd-5.1': {
        id: 'b1',
        worldId: '1',
        packageId: 'eldra.srd-5.1',
        packageVersion: '1.0.0',
        packageIntegrity: 'sha256-abc',
        createdAt: null,
        updatedAt: null
      }
    })

    const result = await unbindContentPackFromWorld(1, 'eldra.srd-5.1')

    expect(result.unbound).toBe(true)
    expect(store['1::eldra.srd-5.1']).toBeUndefined()
  })

  it('reports unbound:false, never throws, when the World was never bound to that pack', async () => {
    createFakeBindingStore()

    const result = await unbindContentPackFromWorld(1, 'eldra.srd-5.1')

    expect(result.unbound).toBe(false)
    if (result.unbound) throw new Error('expected not-bound')
    expect(result.stage).toBe('not-bound')
  })
})
