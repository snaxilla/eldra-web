// Unit tests for the batching fix in
// scripts/directus/reset-rules-platform.mjs.
//
// Context: a production run hit HTTP 431 "Request Header Fields Too
// Large" because step 3 embedded all ~1,476 doomed entity ids in one
// GET request's `_in` filter (which travels in the URL, unlike a
// DELETE's JSON body). `fetchIdsWhereAnyFieldIn` fixes this by chunking
// the id list across multiple requests and unioning the results -- these
// tests exercise exactly that chunking/dedup logic, with the global
// `fetch` mocked so nothing here reaches a real Directus instance.
//
// The script guards its own `main()` behind an entry-point check
// (`import.meta.url === file://process.argv[1]`, the same pattern
// scripts/directus/publish-starter-package.mjs already uses) specifically
// so it can be imported here without triggering a real, destructive run.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHUNK_SIZE, chunk, fetchIdsWhereAnyFieldIn } from '../../../scripts/directus/reset-rules-platform.mjs'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  // The script reads DIRECTUS_TOKEN/DIRECTUS_URL at module load time (top
  // level), before this test file's stubs exist -- but dxRequest reads
  // process.env.DIRECTUS_URL indirectly only through the already-captured
  // module-level DIRECTUS_URL constant, which defaults to the real
  // production URL. That default is never dereferenced here: fetchMock
  // intercepts every call regardless of the URL passed to it, so no
  // request reaches the network either way.
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body)
  }
}

describe('chunk', () => {
  it('splits an array into groups of exactly `size`, with a shorter final group', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns one chunk when the array is smaller than size', () => {
    expect(chunk([1, 2], 200)).toEqual([[1, 2]])
  })

  it('returns no chunks for an empty array', () => {
    expect(chunk([], 200)).toEqual([])
  })

  it('CHUNK_SIZE is within the requested conservative range (100-250)', () => {
    expect(CHUNK_SIZE).toBeGreaterThanOrEqual(100)
    expect(CHUNK_SIZE).toBeLessThanOrEqual(250)
  })
})

describe('fetchIdsWhereAnyFieldIn -- the HTTP 431 fix', () => {
  it('issues one request per chunk, never one request for the whole id list', async () => {
    const values = Array.from({ length: 1476 }, (_, i) => i + 1) // reproduces the production count
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }))

    await fetchIdsWhereAnyFieldIn('entity_relationships', ['source_entity_id', 'target_entity_id'], values)

    const expectedRequests = Math.ceil(values.length / CHUNK_SIZE)
    expect(fetchMock).toHaveBeenCalledTimes(expectedRequests)
    expect(expectedRequests).toBeGreaterThan(1) // proves batching actually happened
  })

  it('no single request URL embeds more than CHUNK_SIZE ids -- the literal fix for HTTP 431', async () => {
    const values = Array.from({ length: 1476 }, (_, i) => i + 1)
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }))

    await fetchIdsWhereAnyFieldIn('block_instances', ['entity_id'], values)

    for (const [url] of fetchMock.mock.calls) {
      const filter = JSON.parse(new URL(url).searchParams.get('filter'))
      expect(filter.entity_id._in.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('returns [] immediately (zero requests) for an empty id list', async () => {
    const result = await fetchIdsWhereAnyFieldIn('block_instances', ['entity_id'], [])
    expect(result).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('unions matching ids across chunks into a single flat result', async () => {
    const values = Array.from({ length: 250 }, (_, i) => i + 1) // 2 chunks at CHUNK_SIZE=200
    let call = 0
    fetchMock.mockImplementation(async () => {
      call++
      return jsonResponse({ data: call === 1 ? [{ id: 10 }, { id: 20 }] : [{ id: 30 }] })
    })

    const result = await fetchIdsWhereAnyFieldIn('block_instances', ['entity_id'], values)

    expect(result.sort((a, b) => a - b)).toEqual([10, 20, 30])
  })

  it('deduplicates a row found via two different fields in two different chunks (the OR case)', async () => {
    // Reproduces exactly the entity_relationships hazard the header
    // comment describes: one row whose source_entity_id falls in chunk 1
    // and whose target_entity_id falls in chunk 2 must be counted ONCE.
    const values = Array.from({ length: 250 }, (_, i) => i + 1)
    let call = 0
    fetchMock.mockImplementation(async () => {
      call++
      // Both chunks "find" the SAME relationship row (id: 99) -- once via
      // source_entity_id, once via target_entity_id.
      return jsonResponse({ data: [{ id: 99 }] })
    })

    const result = await fetchIdsWhereAnyFieldIn('entity_relationships', ['source_entity_id', 'target_entity_id'], values)

    expect(call).toBe(2) // both chunks were actually queried
    expect(result).toEqual([99]) // but the row is reported only once
  })

  it('single-field lookups never use _or (would be a stricter, wrong filter for entity_id)', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }))

    await fetchIdsWhereAnyFieldIn('block_instances', ['entity_id'], [1, 2, 3])

    const [url] = fetchMock.mock.calls[0]
    const filter = JSON.parse(new URL(url).searchParams.get('filter'))
    expect(filter).toEqual({ entity_id: { _in: [1, 2, 3] } })
    expect(filter._or).toBeUndefined()
  })

  it('multi-field lookups use _or across the named fields', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }))

    await fetchIdsWhereAnyFieldIn('entity_relationships', ['source_entity_id', 'target_entity_id'], [1, 2, 3])

    const [url] = fetchMock.mock.calls[0]
    const filter = JSON.parse(new URL(url).searchParams.get('filter'))
    expect(filter).toEqual({
      _or: [{ source_entity_id: { _in: [1, 2, 3] } }, { target_entity_id: { _in: [1, 2, 3] } }]
    })
  })

  it('fail-fast: propagates a request failure uncaught, from any chunk', async () => {
    const values = Array.from({ length: 250 }, (_, i) => i + 1) // 2 chunks
    let call = 0
    fetchMock.mockImplementation(async () => {
      call++
      if (call === 2) {
        return {
          ok: false,
          status: 431,
          statusText: 'Request Header Fields Too Large',
          text: async () => JSON.stringify({ errors: [{ message: 'too large' }] })
        }
      }
      return jsonResponse({ data: [] })
    })

    await expect(fetchIdsWhereAnyFieldIn('block_instances', ['entity_id'], values)).rejects.toThrow(/431/)
  })

  it('resumability: a fresh call with the same inputs re-queries current state rather than reusing a cached result', async () => {
    const values = [1, 2, 3]
    fetchMock.mockImplementation(async () => jsonResponse({ data: [{ id: 1 }] }))

    const first = await fetchIdsWhereAnyFieldIn('block_instances', ['entity_id'], values)
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] })) // simulates: those rows are now already deleted
    const second = await fetchIdsWhereAnyFieldIn('block_instances', ['entity_id'], values)

    expect(first).toEqual([1])
    expect(second).toEqual([]) // no stale/cached result carried over
  })
})

// ---------------------------------------------------------------------------
// --purge-monsters (opt-in follow-up flag)
// ---------------------------------------------------------------------------
// These tests exercise main() itself, not just the chunking helper above,
// because --purge-monsters is an orchestration-level change (an extra
// conditional block of steps appended after the existing nine). `main` is
// dynamically re-imported per test (vi.resetModules + await import) rather
// than using the static import at the top of this file, for two reasons:
// (1) DIRECTUS_TOKEN is read from process.env at module-evaluation time
//     into a top-level const, so it must be stubbed *before* the module
//     body runs; (2) `runningTotal` is module-level mutable state that
//     must not leak between test cases.

function jsonResponseFor(data: unknown) {
  return jsonResponse({ data })
}

// A single reusable fetch mock for main()'s full orchestration. It never
// asserts anything itself -- it just answers the two entity_type lookups
// the script can make (doomed types via 'character', monster types via
// 'enemy') and returns no rows for every other lookup, so deletion steps
// with no ids simply issue zero DELETE calls. Assertions live in each test,
// inspecting `mock.calls` afterwards.
function makeMainFetchMock({ doomedIds = [1, 2], monsterIds = [100, 101] } = {}) {
  return vi.fn(async (url: string, init?: { method?: string }) => {
    if (init?.method === 'DELETE') return jsonResponseFor([])

    const parsed = new URL(url)
    const collection = parsed.pathname.replace('/items/', '')
    const filterParam = parsed.searchParams.get('filter')
    const filter = filterParam ? JSON.parse(filterParam) : null

    if (collection === 'entities' && filter?.entity_type?._in?.includes('character')) {
      return jsonResponseFor(doomedIds.map((id) => ({ id })))
    }
    if (collection === 'entities' && filter?.entity_type?._in?.includes('enemy')) {
      return jsonResponseFor(monsterIds.map((id) => ({ id })))
    }
    return jsonResponseFor([])
  })
}

async function importFreshScript() {
  vi.stubEnv('DIRECTUS_TOKEN', 'test-token')
  vi.resetModules()
  return import('../../../scripts/directus/reset-rules-platform.mjs')
}

async function runMain(argvExtra: string[], fetchMockForMain: ReturnType<typeof vi.fn>) {
  const mod = await importFreshScript()
  vi.stubGlobal('fetch', fetchMockForMain)

  const originalArgv = process.argv
  process.argv = [...originalArgv, ...argvExtra]
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  let logged = ''
  try {
    await mod.main()
    // Captured before mockRestore(), which clears .mock.calls as part of
    // restoring the original console.log -- reading it after would always
    // see an empty call list.
    logged = logSpy.mock.calls.flat().join('\n')
  } finally {
    process.argv = originalArgv
    logSpy.mockRestore()
  }

  return { mod, logged }
}

describe('main() -- --purge-monsters flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('default behavior is unchanged: without the flag, monster entities are never resolved or deleted', async () => {
    const fetchMockForMain = makeMainFetchMock()
    const { logged } = await runMain(['--confirm'], fetchMockForMain)

    const entityTypeFilters = fetchMockForMain.mock.calls
      .map(([url]: [string]) => new URL(url).searchParams.get('filter'))
      .filter((f): f is string => Boolean(f))
      .map((f) => JSON.parse(f))
      .filter((f) => f.entity_type)

    expect(entityTypeFilters).toHaveLength(1) // only the base doomed-types resolution
    expect(entityTypeFilters[0].entity_type._in).not.toContain('enemy')
    expect(entityTypeFilters[0].entity_type._in).not.toContain('monster')

    expect(logged).not.toContain('--purge-monsters enabled')
    expect(logged).not.toContain('9/14') // proves the run used the 9-step (not 14-step) denominator
    expect(logged).toContain('9/9 entities')
  })

  it('with --purge-monsters, additionally resolves monster entities and deletes their child collections, in order', async () => {
    const fetchMockForMain = makeMainFetchMock({ monsterIds: [100, 101, 102] })
    const { mod, logged } = await runMain(['--confirm', '--purge-monsters'], fetchMockForMain)

    const filters = fetchMockForMain.mock.calls
      .map(([url]: [string]) => new URL(url).searchParams.get('filter'))
      .filter((f): f is string => Boolean(f))
      .map((f) => JSON.parse(f))

    const monsterTypeFilter = filters.find((f) => f.entity_type?._in?.includes('enemy'))
    expect(monsterTypeFilter?.entity_type._in).toEqual(mod.MONSTER_ENTITY_TYPES)

    for (const collection of mod.MONSTER_CHILD_COLLECTIONS) {
      const queried = fetchMockForMain.mock.calls.some(
        ([url]: [string]) => new URL(url).pathname === `/items/${collection}`
      )
      expect(queried).toBe(true)
    }

    // Base reset deletes 'entities' once (doomed ids); --purge-monsters
    // deletes 'entities' a second time (monster ids) -- same collection,
    // two separate steps, exactly as specified.
    const deleteEntitiesCalls = fetchMockForMain.mock.calls.filter(
      ([url, init]: [string, { method?: string }]) => new URL(url).pathname === '/items/entities' && init?.method === 'DELETE'
    )
    expect(deleteEntitiesCalls).toHaveLength(2)

    expect(logged).toContain('--purge-monsters enabled')
    expect(logged).toContain('14/14 entities')
  })

  it('batching still applies to --purge-monsters: a large monster id set is chunked per collection', async () => {
    const manyMonsterIds = Array.from({ length: 450 }, (_, i) => 1000 + i) // 3 chunks at CHUNK_SIZE=200
    const fetchMockForMain = makeMainFetchMock({ monsterIds: manyMonsterIds })
    const { mod } = await runMain(['--confirm', '--purge-monsters'], fetchMockForMain)

    const expectedChunks = Math.ceil(manyMonsterIds.length / mod.CHUNK_SIZE)
    for (const collection of mod.MONSTER_CHILD_COLLECTIONS) {
      // entity_actions/entity_statblocks/monster_profiles are ALSO queried
      // by the base reset's own ENTITY_CHILD_COLLECTIONS pass (against the
      // default doomedIds [1, 2], one small unbatched request) -- isolate
      // the --purge-monsters pass by its id range (manyMonsterIds starts at
      // 1000) so this test measures only the batching this task added.
      const getCalls = fetchMockForMain.mock.calls.filter(([url, init]: [string, { method?: string } | undefined]) => {
        if (new URL(url).pathname !== `/items/${collection}` || init?.method === 'DELETE') return false
        const filter = JSON.parse(new URL(url).searchParams.get('filter')!)
        return (filter.entity_id?._in ?? []).some((id: number) => id >= 1000)
      })
      expect(getCalls).toHaveLength(expectedChunks)
      for (const [url] of getCalls as [string][]) {
        const filter = JSON.parse(new URL(url).searchParams.get('filter')!)
        expect(filter.entity_id._in.length).toBeLessThanOrEqual(mod.CHUNK_SIZE)
      }
    }
  })

  it('never touches Rules Platform or other preserved collections, with or without --purge-monsters', async () => {
    const preserved = [
      'worlds',
      'maps',
      'map_pins',
      'scene_layer_objects',
      'events',
      'eras',
      'articles',
      'world_page_presentations',
      'app_settings',
      'rules_packages',
      'world_rules_config'
    ]

    for (const argvExtra of [['--confirm'], ['--confirm', '--purge-monsters']]) {
      const fetchMockForMain = makeMainFetchMock()
      await runMain(argvExtra, fetchMockForMain)

      for (const [url] of fetchMockForMain.mock.calls as [string][]) {
        const collection = new URL(url).pathname.replace('/items/', '')
        expect(preserved).not.toContain(collection)
      }

      const entityTypeFilters = fetchMockForMain.mock.calls
        .map(([url]: [string]) => new URL(url).searchParams.get('filter'))
        .filter((f): f is string => Boolean(f))
        .map((f) => JSON.parse(f))
        .filter((f) => f.entity_type)

      for (const f of entityTypeFilters) {
        expect(f.entity_type._in).not.toContain('location')
      }
    }
  })
})
