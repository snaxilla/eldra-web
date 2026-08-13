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
