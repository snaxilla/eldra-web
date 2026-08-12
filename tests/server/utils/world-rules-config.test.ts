// Unit tests for World Rules Configuration persistence
// (server/utils/world-rules-config.ts, Infrastructure Commit 5). Directus
// is mocked at the module boundary (server/utils/directus.ts) -- that
// module relies on Nuxt auto-imports that do not exist under plain
// Vitest, exactly as tests/server/utils/rules-packages.test.ts already
// documents.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { loadWorldRulesConfig, saveWorldRulesConfig } from '../../../server/utils/world-rules-config'

type FakeRow = Record<string, any>

// A minimal in-memory stand-in for Directus, supporting exactly the three
// request shapes world-rules-config.ts issues: a GET filtered by
// `world_id`, a POST that creates a row, and a PATCH by id that updates
// one. Returned directly from the mock so each test can inspect the raw
// stored rows (e.g. to prove a rejected save wrote nothing).
function createFakeDirectusStore(initialRows: FakeRow[] = []) {
  const rows: FakeRow[] = initialRows.map((row) => ({ ...row }))
  let nextId = 1

  directusServiceRequestMock.mockImplementation(async (path: string, options: any = {}) => {
    const method = options.method || 'GET'

    if (method === 'GET') {
      const worldId = options.query?.filter?.world_id?._eq
      const matched = rows.filter((row) => row.world_id === worldId)
      const limited = options.query?.limit ? matched.slice(0, options.query.limit) : matched
      return { data: limited }
    }

    if (method === 'POST') {
      const created = { id: String(nextId++), ...options.body }
      rows.push(created)
      return { data: created }
    }

    if (method === 'PATCH') {
      const match = /\/items\/world_rules_config\/(.+)$/.exec(path)
      const id = match?.[1]
      const index = rows.findIndex((row) => String(row.id) === id)
      if (index === -1) throw new Error(`createFakeDirectusStore: no row with id ${id}`)
      rows[index] = { ...rows[index], ...options.body }
      return { data: rows[index] }
    }

    throw new Error(`createFakeDirectusStore: unhandled method ${method}`)
  })

  return rows
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('loadWorldRulesConfig -- missing row', () => {
  it('returns null when no row exists for the World, never an error', async () => {
    createFakeDirectusStore([])
    const result = await loadWorldRulesConfig(42)
    expect(result).toBeNull()
  })
})

describe('loadWorldRulesConfig -- existing row', () => {
  it('loads and translates an existing row to StoredWorldRulesConfig shape', async () => {
    createFakeDirectusStore([
      {
        id: 'r1',
        world_id: 42,
        active_package_id: 'eldra.starter.generic-d20',
        active_package_version: '0.1.0',
        active_package_integrity: 'sha256-abc',
        world_config_version: 3,
        settings: { rules: { gritty: true } },
        roll_types: { luck: { enabled: true } }
      }
    ])

    const result = await loadWorldRulesConfig(42)

    expect(result).toEqual({
      worldId: '42',
      activePackageId: 'eldra.starter.generic-d20',
      activePackageVersion: '0.1.0',
      activePackageIntegrity: 'sha256-abc',
      worldConfigVersion: 3,
      settings: { rules: { gritty: true } },
      rollTypes: { luck: { enabled: true } }
    })
  })

  it('tolerates settings/roll_types stored as JSON-encoded strings', async () => {
    createFakeDirectusStore([
      {
        id: 'r1',
        world_id: 7,
        active_package_id: 'pkg',
        active_package_version: '1.0.0',
        active_package_integrity: null,
        world_config_version: 1,
        settings: JSON.stringify({ rules: {} }),
        roll_types: JSON.stringify({})
      }
    ])

    const result = await loadWorldRulesConfig(7)
    expect(result?.settings).toEqual({ rules: {} })
    expect(result?.rollTypes).toEqual({})
  })

  it('a null active_package_integrity translates to null, not a missing field', async () => {
    createFakeDirectusStore([
      {
        id: 'r1',
        world_id: 5,
        active_package_id: 'pkg',
        active_package_version: '1.0.0',
        active_package_integrity: null,
        world_config_version: 1,
        settings: {},
        roll_types: {}
      }
    ])

    const result = await loadWorldRulesConfig(5)
    expect(result?.activePackageIntegrity).toBeNull()
  })
})

describe('saveWorldRulesConfig -- new row', () => {
  it('creates a row starting at worldConfigVersion 1', async () => {
    createFakeDirectusStore([])

    const result = await saveWorldRulesConfig(9, {
      activePackageId: 'eldra.starter.generic-d20',
      activePackageVersion: '0.1.0'
    })

    expect(result.worldConfigVersion).toBe(1)
    expect(result.worldId).toBe('9')
    expect(result.activePackageId).toBe('eldra.starter.generic-d20')
    expect(result.activePackageVersion).toBe('0.1.0')
    expect(result.settings).toEqual({})
    expect(result.rollTypes).toEqual({})
  })

  it('rejects creating a row without activePackageId/activePackageVersion, and writes nothing', async () => {
    const rows = createFakeDirectusStore([])

    await expect(saveWorldRulesConfig(9, { settings: { rules: {} } })).rejects.toThrow()

    expect(rows).toHaveLength(0)
  })

  it('rejects creating a row with only one of activePackageId/activePackageVersion supplied', async () => {
    const rows = createFakeDirectusStore([])

    await expect(saveWorldRulesConfig(9, { activePackageId: 'pkg' })).rejects.toThrow()

    expect(rows).toHaveLength(0)
  })
})

describe('saveWorldRulesConfig -- existing row', () => {
  it('increments worldConfigVersion on every save', async () => {
    createFakeDirectusStore([
      {
        id: 'r1',
        world_id: 9,
        active_package_id: 'pkg',
        active_package_version: '1.0.0',
        active_package_integrity: null,
        world_config_version: 4,
        settings: {},
        roll_types: {}
      }
    ])

    const result = await saveWorldRulesConfig(9, { settings: { rules: { gritty: true } } })
    expect(result.worldConfigVersion).toBe(5)
  })

  it('is a partial patch -- an omitted field keeps its previously stored value', async () => {
    createFakeDirectusStore([
      {
        id: 'r1',
        world_id: 9,
        active_package_id: 'pkg',
        active_package_version: '1.0.0',
        active_package_integrity: 'sha256-xyz',
        world_config_version: 1,
        settings: { rules: { gritty: true } },
        roll_types: { luck: { enabled: true } }
      }
    ])

    const result = await saveWorldRulesConfig(9, { settings: { rules: { gritty: false } } })

    expect(result.settings).toEqual({ rules: { gritty: false } })
    expect(result.rollTypes).toEqual({ luck: { enabled: true } })
    expect(result.activePackageId).toBe('pkg')
    expect(result.activePackageIntegrity).toBe('sha256-xyz')
  })

  it('updates the same row rather than creating a second one', async () => {
    const rows = createFakeDirectusStore([
      {
        id: 'r1',
        world_id: 9,
        active_package_id: 'pkg',
        active_package_version: '1.0.0',
        active_package_integrity: null,
        world_config_version: 1,
        settings: {},
        roll_types: {}
      }
    ])

    await saveWorldRulesConfig(9, { settings: { rules: {} } })
    expect(rows).toHaveLength(1)
  })
})

describe('saveWorldRulesConfig -- deterministic repeated saves', () => {
  it('version increases monotonically and earlier fields survive later partial saves', async () => {
    createFakeDirectusStore([])

    const first = await saveWorldRulesConfig(9, { activePackageId: 'pkg', activePackageVersion: '1.0.0' })
    const second = await saveWorldRulesConfig(9, { settings: { rules: {} } })
    const third = await saveWorldRulesConfig(9, { rollTypes: { check: { enabled: true } } })

    expect([first.worldConfigVersion, second.worldConfigVersion, third.worldConfigVersion]).toEqual([1, 2, 3])
    expect(third.activePackageId).toBe('pkg')
    expect(third.activePackageVersion).toBe('1.0.0')
    expect(third.settings).toEqual({ rules: {} })
    expect(third.rollTypes).toEqual({ check: { enabled: true } })
  })
})

describe('translation correctness', () => {
  it('round-trips a save through a subsequent load with identical content', async () => {
    createFakeDirectusStore([])

    const saved = await saveWorldRulesConfig(11, {
      activePackageId: 'eldra.starter.generic-d20',
      activePackageVersion: '0.1.0',
      activePackageIntegrity: 'sha256-abc',
      settings: { rules: { gritty: true } },
      rollTypes: { check: { enabled: true, order: 1 } }
    })

    const loaded = await loadWorldRulesConfig(11)
    expect(loaded).toEqual(saved)
  })
})
