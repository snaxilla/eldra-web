// Unit tests for scripts/directus/cleanup-orphaned-entities.mjs.
//
// This script deletes rows from block_instances/entity_actions/
// entity_statblocks/monster_profiles whose entity_id references no
// `entities` row -- pure orphan garbage collection, not a gameplay reset
// (see the script's own header for why entity_type is never involved).
//
// The script guards its own `main()` behind an entry-point check
// (`import.meta.url === file://process.argv[1]`, the same pattern already
// established in reset-rules-platform.mjs / publish-starter-package.mjs)
// so it can be imported here without triggering a real, destructive run.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHUNK_SIZE, chunk, deleteByIds, findOrphanedIds } from '../../../scripts/directus/cleanup-orphaned-entities.mjs'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body)
  }
}

describe('findOrphanedIds -- orphan detection', () => {
  it('returns the ids of rows whose entity_id is not in the live entity set', () => {
    const live = new Set([1, 2, 3])
    const rows = [
      { id: 10, entity_id: 1 }, // live -> kept
      { id: 11, entity_id: 99 }, // dangling -> orphaned
      { id: 12, entity_id: 2 }, // live -> kept
      { id: 13, entity_id: 100 } // dangling -> orphaned
    ]

    expect(findOrphanedIds(rows, live)).toEqual([11, 13])
  })

  it('never treats a null entity_id as orphaned', () => {
    const live = new Set([1])
    const rows = [{ id: 20, entity_id: null }]

    expect(findOrphanedIds(rows, live)).toEqual([])
  })

  it('never treats an undefined entity_id as orphaned', () => {
    const live = new Set([1])
    const rows = [{ id: 21 }]

    expect(findOrphanedIds(rows, live)).toEqual([])
  })

  it('returns an empty array when every row references a live entity', () => {
    const live = new Set([5, 6])
    const rows = [
      { id: 30, entity_id: 5 },
      { id: 31, entity_id: 6 }
    ]

    expect(findOrphanedIds(rows, live)).toEqual([])
  })

  it('does not inspect entity_type -- only presence in the live id set matters', () => {
    // Deliberately includes an entity_type field the function must ignore:
    // membership in `live` is the only signal, per the script's own design.
    const live = new Set([1])
    const rows = [{ id: 40, entity_id: 999, entity_type: 'location' }]

    expect(findOrphanedIds(rows, live)).toEqual([40])
  })
})

describe('deleteByIds -- batching', () => {
  it('issues one DELETE request per chunk of CHUNK_SIZE', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1) // 3 chunks at CHUNK_SIZE=200
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }))

    const deleted = await deleteByIds('block_instances', ids)

    expect(deleted).toBe(450)
    expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(ids.length / CHUNK_SIZE))
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).toBe('DELETE')
      const body = JSON.parse(init.body)
      expect(body.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('CHUNK_SIZE matches chunk()', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]])
    expect(CHUNK_SIZE).toBeGreaterThan(0)
  })

  it('issues zero requests for an empty id list', async () => {
    const deleted = await deleteByIds('block_instances', [])

    expect(deleted).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fail-fast: propagates a request failure uncaught, from any chunk', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i + 1) // 2 chunks
    let call = 0
    fetchMock.mockImplementation(async () => {
      call++
      if (call === 2) {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => JSON.stringify({ errors: [{ message: 'boom' }] })
        }
      }
      return jsonResponse({ data: [] })
    })

    await expect(deleteByIds('block_instances', ids)).rejects.toThrow(/500/)
  })
})

// ---------------------------------------------------------------------------
// main() -- full orchestration, safety, and resumability
// ---------------------------------------------------------------------------
// `main` is dynamically re-imported per test (vi.resetModules + await
// import) rather than using the static import above, because
// DIRECTUS_TOKEN is read from process.env into a top-level const at
// module-evaluation time (must be stubbed *before* the module body runs),
// and `runningTotal` is module-level mutable state that must not leak
// between test cases.

async function importFreshScript() {
  vi.resetModules()
  return import('../../../scripts/directus/cleanup-orphaned-entities.mjs')
}

describe('main() -- safety preconditions', () => {
  it('refuses to run without DIRECTUS_TOKEN, before any Directus call', async () => {
    vi.stubEnv('DIRECTUS_TOKEN', '')
    vi.stubEnv('DIRECTUS_SCHEMA_TOKEN', '')
    vi.stubEnv('NUXT_DIRECTUS_TOKEN', '')
    vi.stubEnv('NITRO_DIRECTUS_TOKEN', '')
    const mod = await importFreshScript()

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const originalArgv = process.argv
    process.argv = [...originalArgv, '--confirm']
    try {
      await expect(mod.main()).rejects.toThrow('process.exit called')
      // Asserted before mockRestore(): restoring a spy also clears its
      // recorded .mock.calls, so checking afterward would always see zero.
      expect(exitSpy).toHaveBeenCalledWith(1)
    } finally {
      process.argv = originalArgv
      exitSpy.mockRestore()
      errorSpy.mockRestore()
    }

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to run without --confirm, before any Directus call', async () => {
    vi.stubEnv('DIRECTUS_TOKEN', 'test-token')
    const mod = await importFreshScript()

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await expect(mod.main()).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
    } finally {
      exitSpy.mockRestore()
      errorSpy.mockRestore()
    }

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function makeMainFetchMock(state: {
  entities: number[]
  block_instances: Array<{ id: number; entity_id: number | null }>
  entity_actions: Array<{ id: number; entity_id: number | null }>
  entity_statblocks: Array<{ id: number; entity_id: number | null }>
  monster_profiles: Array<{ id: number; entity_id: number | null }>
}) {
  return vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const parsed = new URL(url)
    const collection = parsed.pathname.replace('/items/', '')

    if (init?.method === 'DELETE') {
      const ids = JSON.parse(init.body as string) as number[]
      const key = collection as keyof typeof state
      if (Array.isArray(state[key])) {
        ;(state[key] as Array<{ id: number }>) = (state[key] as Array<{ id: number }>).filter((row) => !ids.includes(row.id))
      }
      return jsonResponse({ data: [] })
    }

    if (collection === 'entities') {
      return jsonResponse({ data: state.entities.map((id) => ({ id })) })
    }
    if (collection in state) {
      return jsonResponse({ data: state[collection as keyof typeof state] })
    }
    return jsonResponse({ data: [] })
  })
}

describe('main() -- orchestration', () => {
  it('deletes only rows whose entity_id references no live entity, across all four collections', async () => {
    vi.stubEnv('DIRECTUS_TOKEN', 'test-token')
    const mod = await importFreshScript()

    const state = {
      entities: [1, 2],
      block_instances: [
        { id: 100, entity_id: 1 }, // live -> survives
        { id: 101, entity_id: 999 } // orphaned -> deleted
      ],
      entity_actions: [{ id: 200, entity_id: 999 }], // orphaned -> deleted
      entity_statblocks: [{ id: 300, entity_id: 2 }], // live -> survives
      monster_profiles: [{ id: 400, entity_id: null }] // null -> survives
    }
    const fetchMockForMain = makeMainFetchMock(state)
    vi.stubGlobal('fetch', fetchMockForMain)

    const originalArgv = process.argv
    process.argv = [...originalArgv, '--confirm']
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    let logged = ''
    try {
      await mod.main()
      logged = logSpy.mock.calls.flat().join('\n')
    } finally {
      process.argv = originalArgv
      logSpy.mockRestore()
    }

    expect(state.block_instances).toEqual([{ id: 100, entity_id: 1 }])
    expect(state.entity_actions).toEqual([])
    expect(state.entity_statblocks).toEqual([{ id: 300, entity_id: 2 }])
    expect(state.monster_profiles).toEqual([{ id: 400, entity_id: null }])
    expect(logged).toContain('Orphan cleanup complete.')
    expect(logged).toContain('Total rows deleted: 2')

    // Never touches entities, maps, or Rules Platform collections.
    for (const [url, init] of fetchMockForMain.mock.calls) {
      if (init?.method === 'DELETE') {
        const collection = new URL(url).pathname.replace('/items/', '')
        expect(['block_instances', 'entity_actions', 'entity_statblocks', 'monster_profiles']).toContain(collection)
      }
    }
  })

  it('resumability: a second run finds and deletes nothing once orphans are already gone', async () => {
    vi.stubEnv('DIRECTUS_TOKEN', 'test-token')
    const mod1 = await importFreshScript()

    const state = {
      entities: [1],
      block_instances: [{ id: 100, entity_id: 999 }], // orphaned
      entity_actions: [] as Array<{ id: number; entity_id: number | null }>,
      entity_statblocks: [] as Array<{ id: number; entity_id: number | null }>,
      monster_profiles: [] as Array<{ id: number; entity_id: number | null }>
    }
    const fetchMockForMain = makeMainFetchMock(state)
    vi.stubGlobal('fetch', fetchMockForMain)

    const originalArgv = process.argv
    process.argv = [...originalArgv, '--confirm']
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await mod1.main() // first run: deletes the one orphaned block_instances row
    expect(state.block_instances).toEqual([])

    const callsBeforeSecondRun = fetchMockForMain.mock.calls.length

    const mod2 = await importFreshScript() // fresh module instance -> fresh runningTotal
    vi.stubGlobal('fetch', fetchMockForMain) // resetModules cleared the stub; reapply the same mock/state
    await mod2.main()

    process.argv = originalArgv

    const callsDuringSecondRun = fetchMockForMain.mock.calls.slice(callsBeforeSecondRun)
    const deleteCallsDuringSecondRun = callsDuringSecondRun.filter(([, init]) => init?.method === 'DELETE')
    expect(deleteCallsDuringSecondRun).toHaveLength(0) // nothing left to delete -- re-detected, not re-deleted
  })
})
