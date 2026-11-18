// loadWorkspaceAsSource -- Content Workspaces & Studio Phase 6. What
// matters: materializes a workspace's entities into candidate shape with
// the authored overlay already merged; resolves media images in ONE
// batched lookup, never N+1; never broadens an image across Worlds; and
// caches correctly keyed by (workspaceId, worldId) + the workspace's own
// revision counter, never a timestamp.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWorkspaceSourceCache, loadWorkspaceAsSource } from '../../../server/utils/world-content-sources'
import { resolveContentActions } from '../../../app/lib/content-actions'
import { resolveItemMechanics } from '../../../app/lib/item-mechanics'
import { ContentWorkspacePersistenceUnavailableError } from '../../../server/utils/content-workspace-schema'

const { directusServiceRequestMock, getContentWorkspaceMock, listAllWorkspaceEntityDetailsMock, readWorkspaceRevisionAtomicMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  getContentWorkspaceMock: vi.fn(),
  listAllWorkspaceEntityDetailsMock: vi.fn(),
  readWorkspaceRevisionAtomicMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))
vi.mock('../../../server/utils/content-workspaces', () => ({ getContentWorkspace: getContentWorkspaceMock }))
vi.mock('../../../server/utils/content-workspace-entities', () => ({ listAllWorkspaceEntityDetails: listAllWorkspaceEntityDetailsMock }))
// Mocked explicitly (never the real direct-Postgres implementation here)
// so every test's behavior is deterministic rather than depending on
// whether THIS process happens to have ELDRA_WORKSPACE_DB_URL set. The
// default (set in beforeEach) is "unconfigured" -- the common case for a
// deployment that has never set up editing -- proving the fallback to
// Directus's own `workspace.revision` fires correctly; a few tests below
// override this to prove the authoritative value is used when it IS
// available, and that an unrelated error still propagates.
vi.mock('../../../server/utils/content-workspace-entity-atomic', () => ({ readWorkspaceRevisionAtomic: readWorkspaceRevisionAtomicMock }))

const WORKSPACE_ID = 'w1'
const WORLD_ID = '4'
const OTHER_WORLD_ID = '6'

function workspace(revision = 0) {
  return { id: WORKSPACE_ID, workspaceKey: 'solaris-curated', title: 'Solaris Curated', description: null, systemKey: 'dnd5e', sourceGameSystemKey: null, sourceCollectionKey: null, status: 'active' as const, ownerAccountId: null, revision, createdAt: null, updatedAt: null }
}

function entityDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1', workspaceId: WORKSPACE_ID, contentEntityId: 'ce_x', systemKey: 'dnd5e', entityType: 'item',
    slug: 'shortsword-xphb', title: 'Shortsword', origin: 'imported' as const, state: 'active' as const, revision: 0,
    baseData: { systemKey: 'dnd5e', entityType: 'item', title: 'Shortsword', slug: 'shortsword-xphb', externalId: 'x', provider: '5etools', data: { name: 'Shortsword' } },
    baseDataHash: 'sha256-base', baseSourceRef: null, baseMissing: false, baseRefs: [], slugAliases: [],
    authoredData: null, authoredPresentation: [], authoredMechanics: [], createdAt: null, updatedAt: null,
    ...overrides
  }
}


// Catalogue cache-fix follow-up: listAllWorkspaceEntityDetails now returns
// {entities, source} instead of a plain array -- this wraps a test's
// array literal the same way the real function's two paths do, defaulting
// to 'postgres' (the healthy case) unless a test is specifically
// exercising the Directus-fallback path.
function entityListResult(entities: unknown[], source: 'postgres' | 'directus-fallback' = 'postgres') {
  return { entities, source }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  getContentWorkspaceMock.mockReset()
  listAllWorkspaceEntityDetailsMock.mockReset()
  readWorkspaceRevisionAtomicMock.mockReset()
  readWorkspaceRevisionAtomicMock.mockRejectedValue(new ContentWorkspacePersistenceUnavailableError('ELDRA_WORKSPACE_DB_URL is not configured'))
  clearWorkspaceSourceCache()
})

describe('loadWorkspaceAsSource', () => {
  it('reports workspace-not-found rather than an empty list', async () => {
    getContentWorkspaceMock.mockResolvedValue(null)
    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    expect(result).toEqual({ ok: false, failure: { reason: 'workspace-not-found', message: expect.stringContaining(WORKSPACE_ID) } })
  })

  it('materializes an entity with its packageId/packageVersion/state set for the workspace source', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([entityDetail()]))

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ packageId: `workspace.${WORKSPACE_ID}`, packageVersion: 'live', state: 'active', slug: 'shortsword-xphb' })
  })

  it('applies the authored presentation overlay to the materialized entry', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([
      entityDetail({ authoredPresentation: [{ channel: 'presentation', path: 'name', value: 'Fine Shortsword', authoredBy: 'acct-1', authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] })
    ]))

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    if (!result.ok) throw new Error('expected ok')
    expect(result.entries[0]!.presentation?.name).toBe('Fine Shortsword')
  })

  it('resolves a media image ref in ONE batched /files lookup, never one per entity', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([
      entityDetail({ contentEntityId: 'ce_1', slug: 'item-1', authoredPresentation: [{ channel: 'presentation', path: 'image', value: { kind: 'media', fileId: 'f1' }, authoredBy: null, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] }),
      entityDetail({ contentEntityId: 'ce_2', slug: 'item-2', authoredPresentation: [{ channel: 'presentation', path: 'image', value: { kind: 'media', fileId: 'f2' }, authoredBy: null, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] })
    ]))
    directusServiceRequestMock.mockResolvedValueOnce({ data: [{ id: 'f1', world_id: Number(WORLD_ID) }, { id: 'f2', world_id: Number(WORLD_ID) }] })

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    if (!result.ok) throw new Error('expected ok')

    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
    expect(result.entries[0]!.presentation?.image).toEqual({ url: '/api/assets/f1' })
    expect(result.entries[1]!.presentation?.image).toEqual({ url: '/api/assets/f2' })
  })

  it('never broadens access -- an image belonging to a different World resolves to no image, not a leak', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([
      entityDetail({ authoredPresentation: [{ channel: 'presentation', path: 'image', value: { kind: 'media', fileId: 'f1' }, authoredBy: null, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] })
    ]))
    directusServiceRequestMock.mockResolvedValueOnce({ data: [{ id: 'f1', world_id: Number(OTHER_WORLD_ID) }] })

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    if (!result.ok) throw new Error('expected ok')
    expect(result.entries[0]!.presentation?.image).toBeNull()
  })

  it('caches by (workspaceId, worldId) + revision -- a second call at the same revision does not re-fetch entities', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace(0))
    readWorkspaceRevisionAtomicMock.mockResolvedValue(0) // authoritative, so the cache this test is proving is actually trusted
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([entityDetail()]))

    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates the cache when the workspace revision advances -- a save is visible on the next resolve', async () => {
    getContentWorkspaceMock.mockResolvedValueOnce(workspace(0))
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce(entityListResult([entityDetail({ title: 'Shortsword' })]))
    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    getContentWorkspaceMock.mockResolvedValueOnce(workspace(1))
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce(entityListResult([entityDetail({ title: 'Fine Shortsword' })]))
    const second = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(2)
    if (second.ok) expect(second.entries[0]!.title).toBe('Fine Shortsword')
  })

  // Catalogue freshness fix -- the actual bug: Directus's own
  // `workspace.revision` field can be served stale (its response cache is
  // never invalidated by the atomic module's direct-Postgres write). If
  // sourceCache's invalidation check used ONLY that value, two calls at
  // the SAME (stale) Directus revision would wrongly look identical even
  // though a save landed in between. Proven here by holding Directus's
  // own revision FIXED at 0 across both calls while the authoritative
  // read reports the real, advancing value.
  it('invalidates the cache using the AUTHORITATIVE revision even when Directus\'s own workspace.revision field is stale', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace(0)) // Directus: NEVER changes, simulating its stale cache
    readWorkspaceRevisionAtomicMock.mockResolvedValueOnce(5)
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce(entityListResult([entityDetail({ title: 'Shortsword' })]))
    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    readWorkspaceRevisionAtomicMock.mockResolvedValueOnce(6) // the real, post-save revision
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce(entityListResult([entityDetail({ title: 'Fine Shortsword' })]))
    const second = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(2) // refetched despite Directus's own field never moving
    if (second.ok) expect(second.entries[0]!.title).toBe('Fine Shortsword')
  })

  it('does NOT refetch when the authoritative revision is unchanged, even across repeated calls', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace(0))
    readWorkspaceRevisionAtomicMock.mockResolvedValue(5)
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([entityDetail()]))

    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(1) // still a real cache, not disabled
  })

  it('falls back to Directus\'s own workspace.revision when the authoritative read is unavailable (unconfigured deployment) -- reading still works, but a non-authoritative revision is NEVER cached', async () => {
    getContentWorkspaceMock.mockResolvedValueOnce(workspace(0))
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce(entityListResult([entityDetail({ title: 'Shortsword' })]))
    const first = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    expect(first.ok).toBe(true)
    expect(readWorkspaceRevisionAtomicMock).toHaveBeenCalledWith(WORKSPACE_ID)

    // Same (stale) Directus revision, second call -- catalogue cache fix
    // follow-up: a non-authoritative revision can NEVER satisfy or
    // populate the cache (revision + entity-list are one coordinated
    // source choice -- see loadWorkspaceAsSource's own caching guard), so
    // this refetches every time while running in fallback mode. This is
    // the deliberate, correctness-over-performance tradeoff for a
    // deployment that has never configured ELDRA_WORKSPACE_DB_URL at all
    // -- reading still works (gameplay is never broken), it's just never
    // cached, which is strictly safer than the pre-fix behavior of
    // trusting Directus's own (equally stale-prone) revision field as a
    // cache key.
    getContentWorkspaceMock.mockResolvedValueOnce(workspace(0))
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce(entityListResult([entityDetail({ title: 'Shortsword' })]))
    const second = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    expect(second.ok).toBe(true)
    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(2)
  })

  // Catalogue cache-fix regression -- the actual scenario this fix closes:
  // the REVISION read is authoritative (healthy), but the ENTITY-LIST read
  // specifically falls back to Directus (a transient Postgres hiccup on
  // just that one query), which returns OLDER data. If the resulting
  // entries were cached under the authoritative revision number, a LATER
  // call -- once Postgres has recovered, at the SAME authoritative
  // revision (nothing else changed) -- would wrongly be satisfied by that
  // stale cache entry forever, never seeing the current entities. Proven
  // here: the entity-list read fails and falls back once, then succeeds
  // (recovers) on the next call: the second resolution MUST refetch and
  // return the CURRENT entities, not the cached older ones.
  it('never caches fallback entity data under an authoritative revision -- a later healthy read is not poisoned by an earlier transient failure', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace(0))
    readWorkspaceRevisionAtomicMock.mockResolvedValue(7) // authoritative revision read succeeds, unchanged across both calls

    // Entity-list Postgres read fails; Directus returns older data.
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce(entityListResult([entityDetail({ title: 'Shortsword' })], 'directus-fallback'))
    const first = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    expect(first.ok).toBe(true)
    if (first.ok) expect(first.entries[0]!.title).toBe('Shortsword')

    // Postgres recovers: the entity-list read now succeeds directly, and
    // reports the CURRENT (different) title -- simulating a save that
    // landed while the entity-list read was unavailable.
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce(entityListResult([entityDetail({ title: 'Fine Shortsword' })], 'postgres'))
    const second = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    // The next resolution fetches current entities rather than accepting
    // cached fallback data under the (unchanged) authoritative revision.
    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(2)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.entries[0]!.title).toBe('Fine Shortsword')

    // And NOW that both reads were authoritative/Postgres-sourced
    // together, the cache is finally trustworthy: a THIRD call at the
    // same revision does not refetch again.
    const third = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(2)
    if (third.ok) expect(third.entries[0]!.title).toBe('Fine Shortsword')
  })

  it('an unexpected error from the authoritative revision read propagates -- never silently treated as "unconfigured"', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace(0))
    readWorkspaceRevisionAtomicMock.mockRejectedValueOnce(new Error('connection reset'))

    await expect(loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)).rejects.toThrow('connection reset')
    expect(listAllWorkspaceEntityDetailsMock).not.toHaveBeenCalled()
  })

  // Items Mechanics Editing, release one -- the end-to-end guarantee: once
  // a mechanics override exists, every consumer reading `entry.data`
  // (resolveItemMechanics, resolveContentActions/resolveWeaponAction) sees
  // the EDITED value, not the base value, with zero changes to those
  // resolvers themselves. This is the mechanism character-assembly.ts's
  // own resolveInventory relies on for "an existing equipped weapon's
  // action uses the edited damage dice after refresh" -- it joins a fresh
  // catalogue resolution (which reads this same `data`) on every request.
  it('a mechanics override on the entity is merged into `data`, and the real weapon action resolver reflects it', async () => {
    const SHORTSWORD_RAW = {
      name: 'Shortsword', source: 'XPHB', type: 'M|XPHB', weaponCategory: 'martial',
      property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'], dmg1: '1d6', dmgType: 'P', weapon: true
    }
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([
      entityDetail({
        baseData: { systemKey: 'dnd5e', entityType: 'item', title: 'Shortsword', slug: 'shortsword-xphb', externalId: 'x', provider: '5etools', data: SHORTSWORD_RAW },
        authoredMechanics: [{ channel: 'mechanics', path: 'damage', value: { dice: '3d8', damageType: 'S' }, authoredBy: 'acct-1', authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }]
      })
    ]))

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    if (!result.ok) throw new Error('expected ok')
    const data = result.entries[0]!.data as Record<string, unknown>

    expect(data.dmg1).toBe('3d8')
    expect(data.dmgType).toBe('S')
    expect(data.weaponCategory).toBe('martial') // untouched field preserved

    // The real resolvers, unchanged, both see the edit through `data`.
    expect(resolveItemMechanics('dnd5e', data)).toMatchObject({ kind: 'weapon', weaponCategory: 'martial' })
    const [action] = resolveContentActions('dnd5e', 'item', data)
    expect(action?.damageRoll).toEqual({ count: 3, faces: 8 })
    expect(action?.damage).toContain('3d8')
  })

  it('an entity with no mechanics overrides resolves `data` byte-identical to its base payload', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([entityDetail()]))

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    if (!result.ok) throw new Error('expected ok')
    expect(result.entries[0]!.data).toEqual({ name: 'Shortsword' })
  })

  it('does NOT share a cache entry across two different Worlds for the same workspace', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace(0))
    listAllWorkspaceEntityDetailsMock.mockResolvedValue(entityListResult([entityDetail()]))

    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    await loadWorkspaceAsSource(WORKSPACE_ID, OTHER_WORLD_ID)

    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(2)
  })
})
