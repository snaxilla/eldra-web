// Unit tests for World <-> Content Pack Binding persistence
// (server/utils/world-content-packs.ts, Content Pack Infrastructure Phase
// 1). Directus is mocked at the module boundary (server/utils/directus.ts)
// -- that module relies on Nuxt auto-imports that do not exist under plain
// Vitest, exactly as tests/server/utils/world-rules-config.test.ts already
// documents.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import {
  findContentPackBinding,
  listContentPackBindingsForWorld,
  removeContentPackBinding,
  saveContentPackBinding
} from '../../../server/utils/world-content-packs'

type FakeRow = Record<string, any>

// A minimal in-memory stand-in for Directus, supporting exactly the four
// request shapes world-content-packs.ts issues: a GET filtered by
// world_id (+ optionally package_id), a POST that creates a row, a PATCH
// by id that updates one, and a DELETE by id -- mirrors
// world-rules-config.test.ts's createFakeDirectusStore, extended for
// multi-row-per-world queries.
function createFakeDirectusStore(initialRows: FakeRow[] = []) {
  const rows: FakeRow[] = initialRows.map((row) => ({ ...row }))
  let nextId = 1

  directusServiceRequestMock.mockImplementation(async (path: string, options: any = {}) => {
    const method = options.method || 'GET'

    if (method === 'GET') {
      const clauses: any[] = options.query?.filter?._and ?? (options.query?.filter ? [options.query.filter] : [])
      const matched = rows.filter((row) =>
        clauses.every((clause) => {
          const [field] = Object.keys(clause)
          return row[field] === clause[field]._eq
        })
      )
      const limited = options.query?.limit && options.query.limit > 0 ? matched.slice(0, options.query.limit) : matched
      return { data: limited }
    }

    if (method === 'POST') {
      const created = { id: String(nextId++), ...options.body }
      rows.push(created)
      return { data: created }
    }

    if (method === 'PATCH') {
      const match = /\/items\/world_content_pack_bindings\/(.+)$/.exec(path)
      const id = match?.[1]
      const index = rows.findIndex((row) => String(row.id) === id)
      if (index === -1) throw new Error(`createFakeDirectusStore: no row with id ${id}`)
      rows[index] = { ...rows[index], ...options.body }
      return { data: rows[index] }
    }

    if (method === 'DELETE') {
      const match = /\/items\/world_content_pack_bindings\/(.+)$/.exec(path)
      const id = match?.[1]
      const index = rows.findIndex((row) => String(row.id) === id)
      if (index === -1) throw new Error(`createFakeDirectusStore: no row with id ${id}`)
      rows.splice(index, 1)
      return { data: null }
    }

    throw new Error(`createFakeDirectusStore: unhandled method ${method}`)
  })

  return rows
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('findContentPackBinding -- missing binding', () => {
  it('returns null when no binding exists for (worldId, packageId), never an error', async () => {
    createFakeDirectusStore([])
    const result = await findContentPackBinding(42, 'eldra.srd-5.1')
    expect(result).toBeNull()
  })
})

describe('findContentPackBinding -- existing binding', () => {
  it('loads and translates an existing row to WorldContentPackBindingRecord shape', async () => {
    createFakeDirectusStore([
      {
        id: 'b1',
        world_id: 42,
        package_id: 'eldra.srd-5.1',
        package_version: '1.0.0',
        package_integrity: 'sha256-abc',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ])

    const result = await findContentPackBinding(42, 'eldra.srd-5.1')

    expect(result).toEqual({
      id: 'b1',
      worldId: '42',
      packageId: 'eldra.srd-5.1',
      packageVersion: '1.0.0',
      packageIntegrity: 'sha256-abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    })
  })

  it('a null package_integrity translates to null, not a missing field', async () => {
    createFakeDirectusStore([
      {
        id: 'b1',
        world_id: 5,
        package_id: 'eldra.homebrew-bestiary',
        package_version: '1.0.0',
        package_integrity: null,
        created_at: null,
        updated_at: null
      }
    ])

    const result = await findContentPackBinding(5, 'eldra.homebrew-bestiary')
    expect(result?.packageIntegrity).toBeNull()
  })
})

describe('listContentPackBindingsForWorld -- multiple packs per world', () => {
  it('returns every binding for the world, and none for a different world', async () => {
    createFakeDirectusStore([
      { id: 'b1', world_id: 1, package_id: 'eldra.srd-5.1', package_version: '1.0.0', package_integrity: null, created_at: null, updated_at: null },
      { id: 'b2', world_id: 1, package_id: 'eldra.homebrew-bestiary', package_version: '0.3.0', package_integrity: null, created_at: null, updated_at: null },
      { id: 'b3', world_id: 2, package_id: 'eldra.srd-5.1', package_version: '1.0.0', package_integrity: null, created_at: null, updated_at: null }
    ])

    const result = await listContentPackBindingsForWorld(1)

    expect(result).toHaveLength(2)
    expect(result.map((binding) => binding.packageId).sort()).toEqual(['eldra.homebrew-bestiary', 'eldra.srd-5.1'])
    expect(result.every((binding) => binding.worldId === '1')).toBe(true)
  })

  it('returns an empty array for a world with no bindings', async () => {
    createFakeDirectusStore([])
    expect(await listContentPackBindingsForWorld(9)).toEqual([])
  })
})

describe('saveContentPackBinding -- new binding', () => {
  it('creates a binding row', async () => {
    const rows = createFakeDirectusStore([])

    const result = await saveContentPackBinding(9, 'eldra.srd-5.1', { version: '1.0.0', integrity: 'sha256-abc' })

    expect(result.worldId).toBe('9')
    expect(result.packageId).toBe('eldra.srd-5.1')
    expect(result.packageVersion).toBe('1.0.0')
    expect(result.packageIntegrity).toBe('sha256-abc')
    expect(rows).toHaveLength(1)
  })

  it('two different packageIds for the same world produce two rows', async () => {
    const rows = createFakeDirectusStore([])

    await saveContentPackBinding(9, 'eldra.srd-5.1', { version: '1.0.0', integrity: null })
    await saveContentPackBinding(9, 'eldra.homebrew-bestiary', { version: '0.1.0', integrity: null })

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.package_id).sort()).toEqual(['eldra.homebrew-bestiary', 'eldra.srd-5.1'])
  })
})

describe('saveContentPackBinding -- repin an existing binding', () => {
  it('updates the same row in place rather than creating a second one', async () => {
    const rows = createFakeDirectusStore([
      {
        id: 'b1',
        world_id: 9,
        package_id: 'eldra.srd-5.1',
        package_version: '1.0.0',
        package_integrity: 'sha256-old',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      }
    ])

    const result = await saveContentPackBinding(9, 'eldra.srd-5.1', { version: '2.0.0', integrity: 'sha256-new' })

    expect(rows).toHaveLength(1)
    expect(result.id).toBe('b1')
    expect(result.packageVersion).toBe('2.0.0')
    expect(result.packageIntegrity).toBe('sha256-new')
  })

  it('does not disturb a different package_id binding for the same world', async () => {
    const rows = createFakeDirectusStore([
      { id: 'b1', world_id: 9, package_id: 'eldra.srd-5.1', package_version: '1.0.0', package_integrity: null, created_at: null, updated_at: null },
      { id: 'b2', world_id: 9, package_id: 'eldra.homebrew-bestiary', package_version: '0.1.0', package_integrity: null, created_at: null, updated_at: null }
    ])

    await saveContentPackBinding(9, 'eldra.srd-5.1', { version: '1.1.0', integrity: null })

    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.id === 'b2')?.package_version).toBe('0.1.0')
  })
})

describe('removeContentPackBinding', () => {
  it('removes an existing binding and returns true', async () => {
    const rows = createFakeDirectusStore([
      { id: 'b1', world_id: 9, package_id: 'eldra.srd-5.1', package_version: '1.0.0', package_integrity: null, created_at: null, updated_at: null }
    ])

    const removed = await removeContentPackBinding(9, 'eldra.srd-5.1')

    expect(removed).toBe(true)
    expect(rows).toHaveLength(0)
  })

  it('returns false, and writes nothing, when no binding exists', async () => {
    const rows = createFakeDirectusStore([])

    const removed = await removeContentPackBinding(9, 'eldra.srd-5.1')

    expect(removed).toBe(false)
    expect(rows).toHaveLength(0)
  })

  it('removing one binding leaves the world\'s other bindings intact', async () => {
    const rows = createFakeDirectusStore([
      { id: 'b1', world_id: 9, package_id: 'eldra.srd-5.1', package_version: '1.0.0', package_integrity: null, created_at: null, updated_at: null },
      { id: 'b2', world_id: 9, package_id: 'eldra.homebrew-bestiary', package_version: '0.1.0', package_integrity: null, created_at: null, updated_at: null }
    ])

    await removeContentPackBinding(9, 'eldra.srd-5.1')

    expect(rows).toHaveLength(1)
    expect(rows[0].package_id).toBe('eldra.homebrew-bestiary')
  })
})

describe('translation correctness', () => {
  it('round-trips a save through a subsequent find with identical content', async () => {
    createFakeDirectusStore([])

    const saved = await saveContentPackBinding(11, 'eldra.srd-5.1', { version: '1.0.0', integrity: 'sha256-abc' })
    const found = await findContentPackBinding(11, 'eldra.srd-5.1')

    expect(found).toEqual(saved)
  })
})
