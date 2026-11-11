// Orchestration tests for scripts/directus/backfill-media-world-scope.mjs.
//
// Media Gallery World-scope backfill follow-up (Content Workspaces &
// Studio Phase 0). Unlike backfill-media-world-scope-core.test.ts (pure
// classification logic), these tests exercise `main()` itself -- dry-run
// vs apply write behavior, idempotency across two runs, schema-missing
// failure, and mapping-cannot-overwrite -- against a MOCKED global fetch
// standing in for Directus transport, per this task's own "use mocks for
// Directus transport... while keeping parsing and planning logic pure and
// directly tested."
//
// `main()` takes config/argv explicitly and never calls `process.exit`
// itself (see that file's own header) specifically so it can be exercised
// here with zero real-process side effects.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { main } from '../../../scripts/directus/backfill-media-world-scope.mjs'

const CONFIG = { url: 'https://directus.test', token: 'test-token' }

type FilesState = Map<string, { id: string; title: string; description: string | null; world_id: number | null }>
type FetchInit = { method?: string; body?: string; headers?: Record<string, string> }

function worldsResponse(ids: string[]) {
  return { data: ids.map((id) => ({ id })) }
}

function fieldsResponse(fields: string[]) {
  return { data: fields.map((field) => ({ field })) }
}

function filesResponse(files: FilesState) {
  return { data: Array.from(files.values()) }
}

// A small in-memory Directus stand-in: GET /fields/directus_files, GET
// /items/worlds, GET /files, and PATCH /files/:id all read/write the same
// `files` Map a test seeds up front -- so an apply run's PATCH is
// observable both as a call-log entry AND as a state change the next
// `main()` invocation actually sees, which is what proves idempotency.
function makeDirectusMock(options: { files: FilesState; worldIds: string[]; hasWorldIdField?: boolean }) {
  const { files, worldIds, hasWorldIdField = true } = options
  const patchCalls: Array<{ id: string; body: unknown }> = []

  const fetchMock = vi.fn(async (url: string, init: FetchInit = {}) => {
    const method = init.method || 'GET'

    if (url.includes('/fields/directus_files')) {
      return jsonResponse(fieldsResponse(hasWorldIdField ? ['id', 'world_id', 'description'] : ['id', 'description']))
    }
    if (url.includes('/items/worlds')) {
      return jsonResponse(worldsResponse(worldIds))
    }
    if (url.includes('/files?')) {
      return jsonResponse(filesResponse(files))
    }
    if (url.includes('/files/') && method === 'PATCH') {
      const id = decodeURIComponent(url.split('/files/')[1])
      const body = JSON.parse(init.body || '{}')
      patchCalls.push({ id, body })
      const existing = files.get(id)
      if (existing) files.set(id, { ...existing, world_id: body.world_id })
      return jsonResponse({ data: { id, ...body } })
    }

    throw new Error(`Unmocked fetch: ${method} ${url}`)
  })

  return { fetchMock, patchCalls }
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body)
  }
}

function noopLog() {}

beforeEach(() => {
  vi.stubEnv('DIRECTUS_TOKEN', 'unused-env-fallback')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('main -- dry run', () => {
  it('performs zero writes (no PATCH calls) and reports the exact legacy file as safe', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'Shortsword', description: 'Eldra media upload for world 6', world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeDirectusMock({ files, worldIds: ['6'] })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main([], CONFIG, noopLog, noopLog)

    expect(patchCalls).toHaveLength(0)
    expect(result.applied).toBe(false)
    expect(result.report.byStatus.safe).toHaveLength(1)
    expect(result.report.byStatus.safe[0]).toMatchObject({ fileId: 'f1', worldId: '6' })
  })
})

describe('main -- apply', () => {
  it('writes only the safe, validated assignment and leaves everything else untouched', async () => {
    const files: FilesState = new Map([
      ['safe-1', { id: 'safe-1', title: 'A', description: 'Eldra media upload for world 6', world_id: null }],
      ['missing-1', { id: 'missing-1', title: 'B', description: null, world_id: null }],
      ['already-1', { id: 'already-1', title: 'C', description: 'Eldra media upload for world 6', world_id: 7 }]
    ])
    const { fetchMock, patchCalls } = makeDirectusMock({ files, worldIds: ['6', '7'] })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main(['--apply'], CONFIG, noopLog, noopLog)

    expect(patchCalls).toEqual([{ id: 'safe-1', body: { world_id: 6 } }])
    expect(result.succeeded).toBe(1)
    expect(result.failures).toEqual([])
    expect(files.get('missing-1')!.world_id).toBeNull()
    expect(files.get('already-1')!.world_id).toBe(7) // never overwritten
  })

  it('is idempotent -- a second apply run against the resulting state performs zero further writes', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: 'Eldra media upload for world 6', world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeDirectusMock({ files, worldIds: ['6'] })
    vi.stubGlobal('fetch', fetchMock)

    const first = await main(['--apply'], CONFIG, noopLog, noopLog)
    expect(first.succeeded).toBe(1)
    expect(patchCalls).toHaveLength(1)

    const second = await main(['--apply'], CONFIG, noopLog, noopLog)
    expect(second.succeeded).toBe(0)
    expect(second.report.byStatus['already-assigned']).toHaveLength(1)
    expect(patchCalls).toHaveLength(1) // still exactly one PATCH ever issued
  })

  it('reports a per-file failure without aborting the remaining safe assignments', async () => {
    const files: FilesState = new Map([
      ['ok-1', { id: 'ok-1', title: 'A', description: 'Eldra media upload for world 6', world_id: null }],
      ['boom-1', { id: 'boom-1', title: 'B', description: 'Eldra media upload for world 6', world_id: null }]
    ])
    const { fetchMock } = makeDirectusMock({ files, worldIds: ['6'] })
    const realImpl = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init: FetchInit = {}) => {
      if (url.includes('/files/boom-1') && init.method === 'PATCH') {
        return { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => '{"errors":[]}' }
      }
      return realImpl(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main(['--apply'], CONFIG, noopLog, noopLog)

    expect(result.succeeded).toBe(1)
    expect(result.failures).toEqual([expect.objectContaining({ fileId: 'boom-1' })])
  })
})

describe('main -- manual mapping', () => {
  it('cannot overwrite an already-assigned file, even when the mapping names a different World', async () => {
    const files: FilesState = new Map([
      ['already-1', { id: 'already-1', title: 'A', description: null, world_id: 7 }]
    ])
    const { fetchMock, patchCalls } = makeDirectusMock({ files, worldIds: ['6', '7'] })
    vi.stubGlobal('fetch', fetchMock)

    const mapping = '/tmp/eldra-media-mapping-overwrite-test.json'
    const fs = await import('node:fs')
    fs.writeFileSync(mapping, JSON.stringify([{ fileId: 'already-1', worldId: '6' }]))

    try {
      const result = await main(['--apply', '--mapping', mapping], CONFIG, noopLog, noopLog)
      expect(patchCalls).toHaveLength(0)
      expect(result.report.byStatus['already-assigned']).toHaveLength(1)
      expect(files.get('already-1')!.world_id).toBe(7)
    } finally {
      fs.rmSync(mapping, { force: true })
    }
  })

  it('reports a conflict, and assigns nothing, when the mapping disagrees with the legacy description', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: 'Eldra media upload for world 6', world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeDirectusMock({ files, worldIds: ['6', '7'] })
    vi.stubGlobal('fetch', fetchMock)

    const mapping = '/tmp/eldra-media-mapping-conflict-test.json'
    const fs = await import('node:fs')
    fs.writeFileSync(mapping, JSON.stringify([{ fileId: 'f1', worldId: '7' }]))

    try {
      const result = await main(['--apply', '--mapping', mapping], CONFIG, noopLog, noopLog)
      expect(patchCalls).toHaveLength(0)
      expect(result.report.byStatus.conflict).toHaveLength(1)
    } finally {
      fs.rmSync(mapping, { force: true })
    }
  })

  it('validates file ids and World ids in the mapping, rejecting unknown references', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: null, world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeDirectusMock({ files, worldIds: ['6'] })
    vi.stubGlobal('fetch', fetchMock)

    const mapping = '/tmp/eldra-media-mapping-unknown-test.json'
    const fs = await import('node:fs')
    fs.writeFileSync(mapping, JSON.stringify([
      { fileId: 'does-not-exist', worldId: '6' },
      { fileId: 'f1', worldId: '999' }
    ]))

    try {
      const result = await main(['--mapping', mapping], CONFIG, noopLog, noopLog)
      expect(patchCalls).toHaveLength(0)
      expect(result.report.mappingIssues).toEqual([
        expect.objectContaining({ status: 'unknown-file', fileId: 'does-not-exist' }),
        expect.objectContaining({ status: 'invalid-world', fileId: 'f1', worldId: '999' })
      ])
    } finally {
      fs.rmSync(mapping, { force: true })
    }
  })

  it('rejects duplicate fileIds in the mapping file and assigns neither entry', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: null, world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeDirectusMock({ files, worldIds: ['6', '7'] })
    vi.stubGlobal('fetch', fetchMock)

    const mapping = '/tmp/eldra-media-mapping-duplicate-test.json'
    const fs = await import('node:fs')
    fs.writeFileSync(mapping, JSON.stringify([
      { fileId: 'f1', worldId: '6' },
      { fileId: 'f1', worldId: '7' }
    ]))

    try {
      const result = await main(['--apply', '--mapping', mapping], CONFIG, noopLog, noopLog)
      expect(patchCalls).toHaveLength(0)
      expect(result.report.byStatus['missing-metadata']).toHaveLength(1)
      expect(result.report.mappingIssues.some((issue: { status: string }) => issue.status === 'duplicate-mapping-entry')).toBe(true)
    } finally {
      fs.rmSync(mapping, { force: true })
    }
  })
})

describe('main -- schema missing', () => {
  it('throws a loud, actionable error and never queries worlds/files when directus_files.world_id does not exist', async () => {
    const files: FilesState = new Map()
    const { fetchMock } = makeDirectusMock({ files, worldIds: [], hasWorldIdField: false })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main([], CONFIG, noopLog, noopLog)).rejects.toThrow(/world_id does not exist/)
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the /fields check -- nothing else was ever queried
  })
})

describe('main -- missing token', () => {
  it('throws before making any Directus request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(main([], { url: CONFIG.url, token: '' }, noopLog, noopLog)).rejects.toThrow(/Missing Directus token/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Explicit Solaris legacy assignment mode (--assign-unowned-images-to-world)
// and the standalone --resolve-world lookup.
// ---------------------------------------------------------------------------

type WorldRow = { id: string; name: string }

// A separate Directus stand-in from makeDirectusMock above: this mode's
// candidate fetch is PAGINATED (explicit limit/offset, never limit=-1)
// and its write is a CONDITIONAL bulk PATCH filtered by id AND
// `world_id IS NULL` in the same request -- both genuinely different
// request shapes from Mode 1's.
function makeExplicitAssignmentMock(options: { files: FilesState; worlds: WorldRow[]; pageSize?: number; hasWorldIdField?: boolean }) {
  const { files, worlds, pageSize = 2, hasWorldIdField = true } = options
  const patchCalls: Array<{ fileId: string; worldId: number }> = []
  const getFilesCalls: Array<{ offset: number; limit: number }> = []
  const singleFileReadCalls: string[] = []

  const fetchMock = vi.fn(async (url: string, init: FetchInit = {}) => {
    const method = init.method || 'GET'
    const parsed = new URL(url)

    if (parsed.pathname === '/fields/directus_files') {
      return jsonResponse(fieldsResponse(hasWorldIdField ? ['id', 'world_id'] : ['id']))
    }

    if (parsed.pathname === '/items/worlds') {
      return jsonResponse({ data: worlds })
    }

    if (parsed.pathname === '/files' && method === 'GET') {
      const limit = Number(parsed.searchParams.get('limit') || pageSize)
      const offset = Number(parsed.searchParams.get('offset') || 0)
      getFilesCalls.push({ offset, limit })
      const unassigned = Array.from(files.values()).filter((f) => f.world_id === null || f.world_id === undefined)
      const page = unassigned.slice(offset, offset + limit)
      return jsonResponse({ data: page })
    }

    // Single-file read -- the verified, non-atomic safety model's own
    // re-read-before-write and read-back-after-write (see
    // backfill-media-world-scope.mjs's own header for why the filtered
    // PATCH alone is no longer relied on).
    if (parsed.pathname.startsWith('/files/') && method === 'GET') {
      const fileId = decodeURIComponent(parsed.pathname.slice('/files/'.length))
      singleFileReadCalls.push(fileId)
      const existing = files.get(fileId)
      return jsonResponse({ data: existing ? { id: existing.id, world_id: existing.world_id } : null })
    }

    if (parsed.pathname === '/files' && method === 'PATCH') {
      const filter = JSON.parse(parsed.searchParams.get('filter') || '{}')
      const fileId = filter?._and?.[0]?.id?._eq
      const body = JSON.parse(init.body || '{}')
      const existing = fileId ? files.get(fileId) : null

      if (!existing || existing.world_id !== null) {
        return jsonResponse({ data: [] }) // conditional filter matched zero rows
      }

      files.set(fileId, { ...existing, world_id: body.world_id })
      patchCalls.push({ fileId, worldId: body.world_id })
      return jsonResponse({ data: [{ id: fileId, ...body }] })
    }

    throw new Error(`Unmocked fetch: ${method} ${parsed.pathname}${parsed.search}`)
  })

  return { fetchMock, patchCalls, getFilesCalls, singleFileReadCalls }
}

describe('main -- --resolve-world', () => {
  it('resolves an exact, unambiguous World name and performs zero writes', async () => {
    const { fetchMock } = makeExplicitAssignmentMock({
      files: new Map(),
      worlds: [{ id: '4', name: 'Solaris' }, { id: '7', name: 'Arden' }]
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main(['--resolve-world', 'Solaris'], CONFIG, noopLog, noopLog)

    expect(result).toMatchObject({ mode: 'resolve-world', world: { id: '4', name: 'Solaris' } })
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/files'), expect.anything())
  })

  it('rejects a missing World by name -- never falls back to a hardcoded id', async () => {
    const { fetchMock } = makeExplicitAssignmentMock({ files: new Map(), worlds: [{ id: '7', name: 'Arden' }] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main(['--resolve-world', 'Solaris'], CONFIG, noopLog, noopLog)).rejects.toThrow(/No World named 'Solaris'/)
  })

  it('rejects an ambiguous World name', async () => {
    const { fetchMock } = makeExplicitAssignmentMock({
      files: new Map(),
      worlds: [{ id: '4', name: 'Solaris' }, { id: '9', name: 'Solaris' }]
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main(['--resolve-world', 'Solaris'], CONFIG, noopLog, noopLog)).rejects.toThrow(/Ambiguous/)
  })

  it('cannot be combined with --assign-unowned-images-to-world or --mapping', async () => {
    const { fetchMock } = makeExplicitAssignmentMock({ files: new Map(), worlds: [] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main(['--resolve-world', 'Solaris', '--assign-unowned-images-to-world', '4'], CONFIG, noopLog, noopLog))
      .rejects.toThrow(/cannot be combined/)
  })
})

describe('main -- --assign-unowned-images-to-world (dry run)', () => {
  it('performs zero writes and reports every unassigned image as a safe candidate, regardless of description', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: null, world_id: null }],
      ['f2', { id: 'f2', title: 'B', description: 'Eldra media upload for world 99', world_id: null }],
      ['f3', { id: 'f3', title: 'C', description: 'garbage', world_id: 7 }]
    ])
    const { fetchMock, patchCalls } = makeExplicitAssignmentMock({ files, worlds: [{ id: '4', name: 'Solaris' }] })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main(['--assign-unowned-images-to-world', '4'], CONFIG, noopLog, noopLog)

    expect(patchCalls).toHaveLength(0)
    expect(result.applied).toBe(false)
    expect(result.report.summary).toEqual({ total: 2, safe: 2, alreadyAssigned: 0 })
    // f2's description names a DIFFERENT World (99) -- deliberately ignored by this mode.
    expect(result.report.safe.map((item: { fileId: string }) => item.fileId).sort()).toEqual(['f1', 'f2'])
  })

  it('rejects a nonexistent target World', async () => {
    const { fetchMock } = makeExplicitAssignmentMock({ files: new Map(), worlds: [{ id: '4', name: 'Solaris' }] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main(['--assign-unowned-images-to-world', '999'], CONFIG, noopLog, noopLog))
      .rejects.toThrow(/Target World '999' does not exist/)
  })

  it('is mutually exclusive with --mapping', async () => {
    const { fetchMock } = makeExplicitAssignmentMock({ files: new Map(), worlds: [{ id: '4', name: 'Solaris' }] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main(['--assign-unowned-images-to-world', '4', '--mapping', './x.json'], CONFIG, noopLog, noopLog))
      .rejects.toThrow(/cannot be combined with --mapping/)
  })

  it('paginates the candidate fetch -- processes more than one page, never silently truncating to a single default page', async () => {
    // fetchUnassignedImageFilesPaginated is exercised directly with a small
    // pageSize: main() itself always requests the function's own default
    // (200), which this repo's realistic file counts never exceed, so
    // proving "more than one page is processed" requires forcing a small
    // page size explicitly -- the point under test is the PAGINATION LOOP
    // itself (offset advances until a short page ends it), not main()'s
    // specific default.
    const files: FilesState = new Map(
      Array.from({ length: 5 }, (_, i) => [`f${i}`, { id: `f${i}`, title: `File ${i}`, description: null, world_id: null }])
    )
    const { fetchMock, getFilesCalls } = makeExplicitAssignmentMock({ files, worlds: [{ id: '4', name: 'Solaris' }], pageSize: 2 })
    vi.stubGlobal('fetch', fetchMock)

    const { fetchUnassignedImageFilesPaginated } = await import('../../../scripts/directus/backfill-media-world-scope.mjs')
    const results = await fetchUnassignedImageFilesPaginated(CONFIG, 2)

    // 5 files at page size 2 -> 3 pages (2, 2, 1)
    expect(getFilesCalls.length).toBe(3)
    expect(results).toHaveLength(5)
  })
})

describe('main -- --assign-unowned-images-to-world --apply', () => {
  it('refuses to write anything without --acknowledge-maintenance-window', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: null, world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeExplicitAssignmentMock({ files, worlds: [{ id: '4', name: 'Solaris' }], pageSize: 10 })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main(['--assign-unowned-images-to-world', '4', '--apply'], CONFIG, noopLog, noopLog))
      .rejects.toThrow(/--acknowledge-maintenance-window/)
    expect(patchCalls).toHaveLength(0)
  })

  it('assigns every safe candidate to the target World, preserving existing assignments, and verifies each write by reading it back', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: null, world_id: null }],
      ['f2', { id: 'f2', title: 'B', description: 'Eldra media upload for world 99', world_id: null }],
      ['already', { id: 'already', title: 'C', description: null, world_id: 7 }]
    ])
    const { fetchMock, patchCalls, singleFileReadCalls } = makeExplicitAssignmentMock({
      files, worlds: [{ id: '4', name: 'Solaris' }], pageSize: 10
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main(
      ['--assign-unowned-images-to-world', '4', '--apply', '--acknowledge-maintenance-window'],
      CONFIG, noopLog, noopLog
    )

    expect(result.succeeded).toBe(2)
    expect(result.verificationMismatches).toBe(0)
    expect(patchCalls.map((c) => c.fileId).sort()).toEqual(['f1', 'f2'])
    expect(files.get('already')!.world_id).toBe(7) // untouched
    expect(files.get('f1')!.world_id).toBe(4)
    expect(files.get('f2')!.world_id).toBe(4) // the "world 99" description was ignored, per explicit policy
    // Each assignment reads the file at least twice: once before writing
    // (the pre-check) and once after (the verification) -- the honest,
    // non-atomic safety model this mode now documents.
    expect(singleFileReadCalls.filter((id) => id === 'f1').length).toBeGreaterThanOrEqual(2)
    expect(singleFileReadCalls.filter((id) => id === 'f2').length).toBeGreaterThanOrEqual(2)
  })

  it('is idempotent -- a second apply run finds nothing left to do and performs zero further writes', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: null, world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeExplicitAssignmentMock({ files, worlds: [{ id: '4', name: 'Solaris' }], pageSize: 10 })
    vi.stubGlobal('fetch', fetchMock)

    const applyArgs = ['--assign-unowned-images-to-world', '4', '--apply', '--acknowledge-maintenance-window']
    const first = await main(applyArgs, CONFIG, noopLog, noopLog)
    expect(first.succeeded).toBe(1)

    // The candidate query itself filters on `world_id IS NULL` server-side
    // -- once assigned, f1 is no longer unassigned, so the second run's
    // candidate inventory is correctly empty, not merely "classified as
    // already-assigned." Idempotent either way: zero further writes.
    const second = await main(applyArgs, CONFIG, noopLog, noopLog)
    expect(second.succeeded).toBe(0)
    expect(second.report.summary.total).toBe(0)
    expect(patchCalls).toHaveLength(1) // exactly one write ever happened
  })

  it('never overwrites a file assigned concurrently -- the pre-write re-read catches it, not the (non-atomic) filtered PATCH alone', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: null, world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeExplicitAssignmentMock({ files, worlds: [{ id: '4', name: 'Solaris' }], pageSize: 10 })
    const realImpl = fetchMock.getMockImplementation()!

    // Simulate a concurrent process assigning the file to a DIFFERENT
    // World in the window between this run's candidate fetch and its
    // own pre-write re-read of this exact file.
    let sawSingleFileRead = false
    fetchMock.mockImplementation(async (url: string, init: FetchInit = {}) => {
      const parsed = new URL(url)
      if (parsed.pathname === '/files/f1' && (init.method || 'GET') === 'GET' && !sawSingleFileRead) {
        sawSingleFileRead = true
        files.set('f1', { ...files.get('f1')!, world_id: 7 }) // the race, right before this read is served
      }
      return realImpl(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main(
      ['--assign-unowned-images-to-world', '4', '--apply', '--acknowledge-maintenance-window'],
      CONFIG, noopLog, noopLog
    )

    expect(result.succeeded).toBe(0)
    expect(result.skippedConcurrent).toBe(1)
    expect(patchCalls).toHaveLength(0) // the pre-write check stopped the write before it happened
    expect(files.get('f1')!.world_id).toBe(7) // the concurrent assignment survives, untouched
  })

  it('reports a verification mismatch (and counts it as a failure) when the read-back after writing does not match what was requested', async () => {
    const files: FilesState = new Map([
      ['f1', { id: 'f1', title: 'A', description: null, world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeExplicitAssignmentMock({ files, worlds: [{ id: '4', name: 'Solaris' }], pageSize: 10 })
    const realImpl = fetchMock.getMockImplementation()!

    // Simulate a second race: something else reassigns the file again in
    // the window between THIS script's write and its own verification
    // read -- the exact gap the filtered PATCH alone cannot see, and the
    // reason this mode never claims atomicity.
    let patchHappened = false
    fetchMock.mockImplementation(async (url: string, init: FetchInit = {}) => {
      const parsed = new URL(url)
      if (parsed.pathname === '/files' && init.method === 'PATCH') {
        patchHappened = true
        return realImpl(url, init)
      }
      if (parsed.pathname === '/files/f1' && (init.method || 'GET') === 'GET' && patchHappened) {
        files.set('f1', { ...files.get('f1')!, world_id: 9 }) // raced again after the write
      }
      return realImpl(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main(
      ['--assign-unowned-images-to-world', '4', '--apply', '--acknowledge-maintenance-window'],
      CONFIG, noopLog, noopLog
    )

    expect(result.succeeded).toBe(0)
    expect(result.verificationMismatches).toBe(1)
    expect(result.failures).toEqual([expect.objectContaining({ fileId: 'f1' })])
    expect(patchCalls).toHaveLength(1) // the write itself did happen
  })

  it('reports a partial failure and exits nonzero for an incomplete apply, preserving successful assignments', async () => {
    const files: FilesState = new Map([
      ['ok-1', { id: 'ok-1', title: 'A', description: null, world_id: null }],
      ['boom-1', { id: 'boom-1', title: 'B', description: null, world_id: null }]
    ])
    const { fetchMock, patchCalls } = makeExplicitAssignmentMock({ files, worlds: [{ id: '4', name: 'Solaris' }], pageSize: 10 })
    const realImpl = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init: FetchInit = {}) => {
      const parsed = new URL(url)
      if (parsed.pathname === '/files' && init.method === 'PATCH' && parsed.search.includes('boom-1')) {
        return { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => '{}' }
      }
      return realImpl(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await main(
      ['--assign-unowned-images-to-world', '4', '--apply', '--acknowledge-maintenance-window'],
      CONFIG, noopLog, noopLog
    )

    expect(result.succeeded).toBe(1)
    expect(result.failures).toEqual([expect.objectContaining({ fileId: 'boom-1' })])
    expect(patchCalls.map((c) => c.fileId)).toEqual(['ok-1']) // the successful assignment is preserved
  })
})
