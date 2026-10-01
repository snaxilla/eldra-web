// Unit tests for server/utils/character-resources.ts -- D&D 2024 Character
// Rules Phase 2A.2, GENERIC CHARACTER RESOURCES persistence +
// server-authoritative manual expend/restore. `dxFetch` mocked at the
// module boundary, mirroring every other `block_instances`-backed
// persistence module's own test precedent in this codebase.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dxFetchMock } = vi.hoisted(() => ({ dxFetchMock: vi.fn() }))

vi.mock('../../../server/utils/entity-factory', () => ({
  dxFetch: dxFetchMock
}))

import {
  expendResourceAuthoritatively,
  loadCharacterResources,
  restoreResourceAuthoritatively,
  saveCharacterResources
} from '../../../server/utils/character-resources'

beforeEach(() => {
  dxFetchMock.mockReset()
})

describe('loadCharacterResources', () => {
  it('returns null when nothing was ever recorded', async () => {
    dxFetchMock.mockResolvedValue({ data: [] })
    expect(await loadCharacterResources('42')).toBeNull()
  })

  it('reads a well-formed persisted record', async () => {
    dxFetchMock.mockResolvedValue({ data: [{ data: { expended: { 'resource:barbarian.rage': 1 } } }] })
    expect(await loadCharacterResources('42')).toEqual({ expended: { 'resource:barbarian.rage': 1 } })
  })
})

describe('saveCharacterResources -- upsert', () => {
  it('PATCHes an existing block when one is found', async () => {
    dxFetchMock.mockImplementation(async (path: string, options: any) => {
      if (path.includes('fields%5B%5D=id') || path.includes('fields[]=id')) return { data: [{ id: 9 }] }
      expect(options.method).toBe('PATCH')
      expect(path).toBe('/items/block_instances/9')
      return {}
    })

    const saved = await saveCharacterResources('42', { expended: { 'resource:a': 1 } })
    expect(saved).toEqual({ expended: { 'resource:a': 1 } })
  })

  it('POSTs a new block when none exists, with the generic block_key -- never one block per class', async () => {
    dxFetchMock.mockImplementation(async (path: string, options: any) => {
      if (path.includes('fields%5B%5D=id') || path.includes('fields[]=id')) return { data: [] }
      expect(options.method).toBe('POST')
      const body = JSON.parse(options.body)
      expect(body.block_key).toBe('resources')
      return {}
    })

    await saveCharacterResources('42', { expended: {} })
  })
})

describe('expendResourceAuthoritatively -- MAXIMUM AUTHORITY', () => {
  it('increments expenditure when below the caller-supplied authoritative max', async () => {
    dxFetchMock.mockImplementation(async (path: string) => {
      if (path.includes('data')) return { data: [{ data: { expended: { 'resource:a': 1 } } }] }
      return { data: [] }
    })

    const saved = await expendResourceAuthoritatively('42', 'resource:a', 3)
    expect(saved.expended['resource:a']).toBe(2)
  })

  it('cannot exceed the authoritative max, no matter what the caller requests', async () => {
    dxFetchMock.mockImplementation(async (path: string) => {
      if (path.includes('data')) return { data: [{ data: { expended: { 'resource:a': 3 } } }] }
      return { data: [] }
    })

    const saved = await expendResourceAuthoritatively('42', 'resource:a', 3)
    expect(saved.expended['resource:a']).toBe(3)
  })
})

describe('restoreResourceAuthoritatively', () => {
  it('cannot restore below zero expended', async () => {
    dxFetchMock.mockImplementation(async (path: string) => {
      if (path.includes('data')) return { data: [] }
      return { data: [] }
    })

    const saved = await restoreResourceAuthoritatively('42', 'resource:a')
    expect(saved.expended['resource:a']).toBeUndefined()
  })
})

describe('expendResourceAuthoritatively -- VARIABLE AMOUNT, still server-bounded (large-pool follow-up)', () => {
  it('a caller-supplied amount greater than 1 (e.g. a points-style "spend 20") is honored up to the authoritative max', async () => {
    dxFetchMock.mockImplementation(async (path: string) => {
      if (path.includes('data')) return { data: [{ data: { expended: { 'resource:lay_on_hands': 10 } } }] }
      return { data: [] }
    })

    const saved = await expendResourceAuthoritatively('42', 'resource:lay_on_hands', 100, 20)
    expect(saved.expended['resource:lay_on_hands']).toBe(30)
  })

  it('an amount that would overshoot the max is clamped exactly to max, never beyond', async () => {
    dxFetchMock.mockImplementation(async (path: string) => {
      if (path.includes('data')) return { data: [{ data: { expended: { 'resource:lay_on_hands': 90 } } }] }
      return { data: [] }
    })

    const saved = await expendResourceAuthoritatively('42', 'resource:lay_on_hands', 100, 50)
    expect(saved.expended['resource:lay_on_hands']).toBe(100)
  })

  it('restoring a large amount is clamped at zero, never negative', async () => {
    dxFetchMock.mockImplementation(async (path: string) => {
      if (path.includes('data')) return { data: [{ data: { expended: { 'resource:lay_on_hands': 10 } } }] }
      return { data: [] }
    })

    const saved = await restoreResourceAuthoritatively('42', 'resource:lay_on_hands', 999)
    expect(saved.expended['resource:lay_on_hands']).toBeUndefined()
  })
})
