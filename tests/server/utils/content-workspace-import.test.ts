// Workspace import execution -- Content Workspaces & Studio Phase 3
// (§9.2 ordering, §16.3 re-import).
//
// The properties that matter here are about FAILURE, not the happy path:
// a snapshot must be durable before the row that depends on it, a
// partial import must never report success, and a retry must not
// duplicate an identity or advance a base twice.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importIntoWorkspace } from '../../../server/utils/content-workspace-import'
import { hashBaseData } from '../../../server/utils/content-workspace-keys'
import type { ContentWorkspace } from '../../../app/lib/content-workspaces/types'
import { sourceEntryKey } from '../../../app/lib/content-workspaces/import-plan'

const { directusServiceRequestMock, loadPublishedContentPackMock, listIdentitiesMock, touchWorkspaceMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  loadPublishedContentPackMock: vi.fn(),
  listIdentitiesMock: vi.fn(),
  touchWorkspaceMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))
vi.mock('../../../server/utils/content-packs', () => ({ loadPublishedContentPack: loadPublishedContentPackMock }))
vi.mock('../../../server/utils/content-workspaces', () => ({
  CONTENT_WORKSPACE_ENTITIES_COLLECTION: 'content_workspace_entities',
  CONTENT_ENTITY_SOURCE_SNAPSHOTS_COLLECTION: 'content_entity_source_snapshots',
  listWorkspaceEntityIdentities: listIdentitiesMock,
  touchContentWorkspace: touchWorkspaceMock
}))

const WORKSPACE_ID = 'a1111111-1111-4111-8111-111111111111'
const PACKAGE_ID = 'eldra.solaris.xphb'
const VERSION = '1.0.38'

const workspace: ContentWorkspace = {
  id: WORKSPACE_ID,
  workspaceKey: 'solaris-xphb',
  title: 'Solaris XPHB',
  description: null,
  systemKey: 'dnd5e',
  sourceGameSystemKey: null,
  sourceCollectionKey: null,
  status: 'active',
  ownerAccountId: null,
  createdAt: null,
  updatedAt: null
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    systemKey: 'dnd5e',
    entityType: 'item',
    title: 'Shortsword',
    slug: 'shortsword-xphb',
    externalId: 'Shortsword__XPHB',
    provider: '5etools',
    data: { name: 'Shortsword' },
    ...overrides
  }
}

function servePack(candidates: Record<string, unknown>[]) {
  loadPublishedContentPackMock.mockResolvedValue({
    ok: true,
    package: {
      packageId: PACKAGE_ID,
      version: VERSION,
      manifest: {
        packageId: PACKAGE_ID, version: VERSION, status: 'published', contentSchemaVersion: 1,
        title: "Player's Handbook (2024)", license: { id: 'proprietary' },
        origin: { kind: 'translated', adapterId: '5etools-json', sourceId: 'xphb' }
      },
      content: candidates,
      integrityHash: 'sha256-x'
    }
  })
}

// One Directus call's options, as directusServiceRequest passes them --
// typed so a mock reading the wrong shape fails to compile rather than
// silently matching nothing.
type DirectusCall = { method?: string, body?: unknown, query?: Record<string, unknown> }
type DirectusRow = Record<string, unknown>

// The snapshot keys arrive inside the `query` object, exactly as
// directusServiceRequest passes them -- never in the path.
function readSnapshotKeys(init: DirectusCall): string[] {
  const filter = init.query?.filter as { snapshot_key?: { _in?: unknown } } | undefined
  return Array.isArray(filter?.snapshot_key?._in) ? filter.snapshot_key._in as string[] : []
}

type Write = { collection: string, rows: DirectusRow[] }

// Records every write in order, so ordering can be asserted rather than
// assumed. `fail` lets one specific write throw, mid-import.
function recordWrites(options: { fail?: (collection: string, rows: DirectusRow[]) => unknown, existingSnapshots?: DirectusRow[] } = {}) {
  const writes: Write[] = []

  directusServiceRequestMock.mockImplementation(async (path: string, init: DirectusCall = {}) => {
    const collection = path.split('?')[0]!.replace('/items/', '')

    if ((init.method ?? 'GET') === 'GET') {
      if (collection.startsWith('content_entity_source_snapshots')) {
        return { data: options.existingSnapshots ?? [] }
      }
      return { data: [] }
    }

    const rows = (Array.isArray(init.body) ? init.body : [init.body]) as DirectusRow[]
    const failure = options.fail?.(collection, rows)
    if (failure) throw failure
    writes.push({ collection, rows })
    return { data: init.body }
  })

  return writes
}

const RELEASE_SOURCE = { kind: 'release' as const, packageId: PACKAGE_ID, version: VERSION }

function runImport(overrides: Record<string, unknown> = {}) {
  return importIntoWorkspace({
    workspace,
    source: RELEASE_SOURCE,
    dryRun: false,
    actorAccountId: 'acct-1',
    ...overrides
  })
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  loadPublishedContentPackMock.mockReset()
  listIdentitiesMock.mockReset().mockResolvedValue([])
  touchWorkspaceMock.mockReset().mockResolvedValue(undefined)
})

describe('dry run', () => {
  it('plans without writing anything', async () => {
    servePack([candidate()])
    const writes = recordWrites()

    const outcome = await runImport({ dryRun: true })

    expect(outcome).toMatchObject({ ok: true, applied: false })
    expect(writes).toHaveLength(0)
    if (!outcome.ok) return
    expect(outcome.report.counts).toMatchObject({ added: 1, unchanged: 0 })
  })
})

describe('snapshot-before-write ordering', () => {
  it('writes the source snapshot BEFORE the entity row it backs', async () => {
    servePack([candidate()])
    const writes = recordWrites()

    await runImport()

    expect(writes.map((write) => write.collection)).toEqual([
      'content_entity_source_snapshots',
      'content_workspace_entities'
    ])
  })

  it('records the first import with no previous base, which is what makes it a first import', async () => {
    servePack([candidate()])
    const writes = recordWrites()

    await runImport()

    expect(writes[0]!.rows[0]).toMatchObject({
      disposition: 'accepted',
      previous_base_data: null,
      previous_base_data_hash: null,
      reconciliation: { classification: 'first-import' }
    })
  })

  it('ABANDONS the entity write when the snapshot write fails', async () => {
    servePack([candidate()])
    const writes = recordWrites({
      fail: (collection) => collection === 'content_entity_source_snapshots' ? new Error('snapshot store unavailable') : undefined
    })

    const outcome = await runImport()

    expect(outcome.ok).toBe(false)
    expect(writes).toHaveLength(0)
    if (outcome.ok) return
    expect(outcome.progress).toMatchObject({ entitiesCreated: 0, snapshotsWritten: 0 })
  })

  it('preserves provenance, license, and attribution on the stored base reference', async () => {
    servePack([candidate({ sourceBook: 'XPHB', sourcePage: '213' })])
    const writes = recordWrites()

    await runImport()

    expect(writes[1]!.rows[0].base_source_ref).toMatchObject({
      provider: '5etools',
      externalId: 'Shortsword__XPHB',
      packageId: PACKAGE_ID,
      version: VERSION,
      sourceBook: 'XPHB',
      sourcePage: '213',
      license: { id: 'proprietary' },
      origin: { adapterId: '5etools-json', sourceId: 'xphb' }
    })
  })

  it('records the OBSERVED legacy address as explicit equivalence evidence', async () => {
    servePack([candidate()])
    const writes = recordWrites()

    await runImport()

    expect(writes[1]!.rows[0].base_refs).toEqual([
      { packageId: PACKAGE_ID, systemKey: 'dnd5e', entityType: 'item', slug: 'shortsword-xphb' }
    ])
  })

  it('stores the raw source payload as the accepted base, unaltered', async () => {
    const raw = candidate({ data: { name: 'Shortsword', weight: 2, nested: { fluff: ['x'] } } })
    servePack([raw])
    const writes = recordWrites()

    await runImport()

    const row = writes[1]!.rows[0]
    expect(row.base_data).toEqual(raw)
    expect(row.base_data_hash).toBe(hashBaseData(raw))
    // The override channels start empty; import never authors anything.
    expect(row).toMatchObject({ authored_presentation: [], authored_mechanics: [], authored_facet: null, origin: 'imported' })
  })
})

describe('changed upstream content', () => {
  it('records a pending-review snapshot and does NOT advance the accepted base', async () => {
    const updated = candidate({ data: { name: 'Shortsword', damage: '1d6' } })
    servePack([updated])
    listIdentitiesMock.mockResolvedValue([{
      contentEntityId: 'ce_abcdefghijklmnopqrstuvwxyz',
      systemKey: 'dnd5e', entityType: 'item', slug: 'shortsword-xphb', title: 'Shortsword',
      sourceKey: sourceEntryKey({ kind: 'release', packageId: PACKAGE_ID }, 'dnd5e', 'item', 'shortsword-xphb'),
      baseDataHash: 'sha256-the-old-one'
    }])
    const writes = recordWrites()

    const outcome = await runImport()

    // One snapshot, no entity write at all: base_data is untouched.
    expect(writes.map((write) => write.collection)).toEqual(['content_entity_source_snapshots'])
    expect(writes[0]!.rows[0]).toMatchObject({
      disposition: 'pending-review',
      content_entity_id: 'ce_abcdefghijklmnopqrstuvwxyz',
      reconciliation: { classification: 'changed-needs-review' }
    })
    expect(writes[0]!.rows[0].incoming_base_data).toEqual(updated)

    if (!outcome.ok) return
    expect(outcome.report.counts).toMatchObject({ changedNeedsReview: 1, added: 0, unchanged: 0 })
    expect(outcome.progress.pendingReviewsRecorded).toBe(1)
  })

  it('never reports a changed base as accepted merely because the write succeeded', async () => {
    servePack([candidate({ data: { changed: true } })])
    listIdentitiesMock.mockResolvedValue([{
      contentEntityId: 'ce_abcdefghijklmnopqrstuvwxyz',
      systemKey: 'dnd5e', entityType: 'item', slug: 'shortsword-xphb', title: 'Shortsword',
      sourceKey: sourceEntryKey({ kind: 'release', packageId: PACKAGE_ID }, 'dnd5e', 'item', 'shortsword-xphb'),
      baseDataHash: 'sha256-old'
    }])
    const writes = recordWrites()

    await runImport()

    expect(writes.every((write) => write.rows.every((row) => row.disposition !== 'accepted'))).toBe(true)
  })
})

describe('repeated import', () => {
  it('identical input is idempotent -- zero writes', async () => {
    const entry = candidate()
    servePack([entry])
    listIdentitiesMock.mockResolvedValue([{
      contentEntityId: 'ce_abcdefghijklmnopqrstuvwxyz',
      systemKey: 'dnd5e', entityType: 'item', slug: 'shortsword-xphb', title: 'Shortsword',
      sourceKey: sourceEntryKey({ kind: 'release', packageId: PACKAGE_ID }, 'dnd5e', 'item', 'shortsword-xphb'),
      baseDataHash: hashBaseData(entry)
    }])
    const writes = recordWrites()

    const outcome = await runImport()

    expect(writes).toHaveLength(0)
    expect(touchWorkspaceMock).not.toHaveBeenCalled()
    if (!outcome.ok) return
    expect(outcome.report.counts).toMatchObject({ unchanged: 1, added: 0, changedNeedsReview: 0 })
  })
})

describe('retry safety', () => {
  it('a retry after a failed entity write REUSES the snapshot\'s id instead of minting a second identity', async () => {
    const entry = candidate()
    servePack([entry])

    // The interrupted run left this snapshot behind, carrying the id it
    // had already chosen.
    const snapshotKeyPrefix = `${WORKSPACE_ID}::`
    directusServiceRequestMock.mockImplementation(async (path: string, init: DirectusCall = {}) => {
      if ((init.method ?? 'GET') === 'GET' && path.includes('content_entity_source_snapshots')) {
        // The keys arrive as a `query` object, exactly as
        // directusServiceRequest passes them -- not in the path.
        const keys = readSnapshotKeys(init)
        return { data: keys.map((key) => ({ snapshot_key: key, content_entity_id: 'ce_fromtheinterruptedrun00' })) }
      }
      if ((init.method ?? 'GET') === 'GET') return { data: [] }
      return { data: init.body }
    })

    await runImport({ mint: () => 'ce_freshlymintedshouldnotbe' })

    const entityWrite = directusServiceRequestMock.mock.calls.find(
      ([path, init]) => String(path).includes('content_workspace_entities') && init?.method === 'POST'
    )
    expect(entityWrite).toBeDefined()
    expect(entityWrite![1].body[0].content_entity_id).toBe('ce_fromtheinterruptedrun00')
    expect(String(entityWrite![1].body[0].identity_key)).toContain(snapshotKeyPrefix)
  })

  it('does not rewrite a snapshot that already exists', async () => {
    const entry = candidate()
    servePack([entry])
    directusServiceRequestMock.mockImplementation(async (path: string, init: DirectusCall = {}) => {
      if ((init.method ?? 'GET') === 'GET' && path.includes('content_entity_source_snapshots')) {
        const keys = readSnapshotKeys(init)
        return { data: keys.map((key) => ({ snapshot_key: key, content_entity_id: 'ce_abcdefghijklmnopqrstuvwxyz' })) }
      }
      if ((init.method ?? 'GET') === 'GET') return { data: [] }
      return { data: init.body }
    })

    const outcome = await runImport()

    const snapshotWrites = directusServiceRequestMock.mock.calls.filter(
      ([path, init]) => String(path).includes('content_entity_source_snapshots') && init?.method === 'POST'
    )
    expect(snapshotWrites).toHaveLength(0)
    if (!outcome.ok) return
    expect(outcome.progress.snapshotsWritten).toBe(0)
  })
})

describe('partial failure', () => {
  it('NEVER returns success, and reports what was durably written', async () => {
    servePack(Array.from({ length: 30 }, (_, index) => candidate({ slug: `item-${index}`, title: `Item ${index}`, externalId: `Item${index}__XPHB` })))

    let entityBatches = 0
    const writes = recordWrites({
      fail: (collection) => {
        if (collection !== 'content_workspace_entities') return undefined
        entityBatches += 1
        return entityBatches === 2 ? new Error('connection reset') : undefined
      }
    })

    const outcome = await runImport()

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.stage).toBe('write-failed')
    expect(outcome.retrySafe).toBe(true)
    expect(outcome.message).toMatch(/run the import again/i)
    // The first batch really did land, and the report says so.
    expect(outcome.progress.entitiesCreated).toBeGreaterThan(0)
    expect(writes.some((write) => write.collection === 'content_workspace_entities')).toBe(true)
  })

  it('reports a uniqueness collision as a conflict a retry can resolve', async () => {
    servePack([candidate()])
    recordWrites({
      fail: (collection) => collection === 'content_workspace_entities'
        ? Object.assign(new Error('not unique'), {
            statusCode: 400,
            data: { errors: [{ message: 'Value has to be unique.', extensions: { code: 'RECORD_NOT_UNIQUE' } }] }
          })
        : undefined
    })

    const outcome = await runImport()

    expect(outcome).toMatchObject({ ok: false, stage: 'conflict', retrySafe: true })
    if (outcome.ok) return
    expect(outcome.message).toMatch(/Nothing was overwritten/i)
  })
})

describe('bounded execution', () => {
  it('writes in bounded batches rather than one unbounded fan-out', async () => {
    servePack(Array.from({ length: 60 }, (_, index) => candidate({ slug: `item-${index}`, title: `Item ${index}`, externalId: `Item${index}__XPHB` })))
    const writes = recordWrites()

    await runImport()

    const entityWrites = writes.filter((write) => write.collection === 'content_workspace_entities')
    // 60 rows, at most 25 per batch -> 3 batches. Neither one giant
    // write nor sixty individual ones.
    expect(entityWrites.length).toBeGreaterThan(1)
    expect(entityWrites.length).toBeLessThanOrEqual(6)
    for (const write of entityWrites) expect(write.rows.length).toBeLessThanOrEqual(25)
    expect(entityWrites.reduce((sum, write) => sum + write.rows.length, 0)).toBe(60)
  })

  it('pairs every batch with its own snapshot batch, in order', async () => {
    servePack(Array.from({ length: 30 }, (_, index) => candidate({ slug: `item-${index}`, title: `Item ${index}`, externalId: `Item${index}__XPHB` })))
    const writes = recordWrites()

    await runImport()

    // snapshots, entities, snapshots, entities -- never an entity batch
    // before the snapshots that back it.
    const order = writes.map((write) => write.collection)
    for (let index = 0; index < order.length; index += 2) {
      expect(order[index]).toBe('content_entity_source_snapshots')
      expect(order[index + 1]).toBe('content_workspace_entities')
    }
  })
})

describe('source resolution', () => {
  it('reports a release that cannot be loaded, without writing', async () => {
    loadPublishedContentPackMock.mockResolvedValue({ ok: false, stage: 'not-found', packageId: PACKAGE_ID, version: VERSION })
    const writes = recordWrites()

    const outcome = await runImport()

    expect(outcome).toMatchObject({ ok: false, stage: 'source-not-found' })
    expect(writes).toHaveLength(0)
  })

  it('refuses an unknown provider collection', async () => {
    const outcome = await importIntoWorkspace({
      workspace,
      source: { kind: 'provider', gameSystemKey: 'dnd5e', collectionKey: 'no-such-collection', categories: null },
      dryRun: true,
      actorAccountId: null
    })
    expect(outcome).toMatchObject({ ok: false, stage: 'source-not-found' })
  })

  it('refuses a provider collection for another game system', async () => {
    const outcome = await importIntoWorkspace({
      workspace: { ...workspace, systemKey: 'pf2e' },
      source: { kind: 'provider', gameSystemKey: 'dnd5e', collectionKey: 'xphb', categories: null },
      dryRun: true,
      actorAccountId: null
    })
    expect(outcome).toMatchObject({ ok: false, stage: 'system-mismatch' })
  })

  it('reports an entry for the wrong system as unresolved instead of importing it', async () => {
    servePack([candidate({ systemKey: 'pf2e' })])
    const writes = recordWrites()

    const outcome = await runImport()

    expect(writes).toHaveLength(0)
    if (!outcome.ok) return
    expect(outcome.report.counts).toMatchObject({ unresolved: 1, added: 0 })
    expect(outcome.report.unresolved[0]).toMatchObject({ reason: 'system-mismatch' })
  })
})
