// loadWorkspaceAsSource -- Content Workspaces & Studio Phase 6. What
// matters: materializes a workspace's entities into candidate shape with
// the authored overlay already merged; resolves media images in ONE
// batched lookup, never N+1; never broadens an image across Worlds; and
// caches correctly keyed by (workspaceId, worldId) + the workspace's own
// revision counter, never a timestamp.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWorkspaceSourceCache, loadWorkspaceAsSource } from '../../../server/utils/world-content-sources'

const { directusServiceRequestMock, getContentWorkspaceMock, listAllWorkspaceEntityDetailsMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  getContentWorkspaceMock: vi.fn(),
  listAllWorkspaceEntityDetailsMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))
vi.mock('../../../server/utils/content-workspaces', () => ({ getContentWorkspace: getContentWorkspaceMock }))
vi.mock('../../../server/utils/content-workspace-entities', () => ({ listAllWorkspaceEntityDetails: listAllWorkspaceEntityDetailsMock }))

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

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  getContentWorkspaceMock.mockReset()
  listAllWorkspaceEntityDetailsMock.mockReset()
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
    listAllWorkspaceEntityDetailsMock.mockResolvedValue([entityDetail()])

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ packageId: `workspace.${WORKSPACE_ID}`, packageVersion: 'live', state: 'active', slug: 'shortsword-xphb' })
  })

  it('applies the authored presentation overlay to the materialized entry', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue([
      entityDetail({ authoredPresentation: [{ channel: 'presentation', path: 'name', value: 'Fine Shortsword', authoredBy: 'acct-1', authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] })
    ])

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    if (!result.ok) throw new Error('expected ok')
    expect(result.entries[0]!.presentation?.name).toBe('Fine Shortsword')
  })

  it('resolves a media image ref in ONE batched /files lookup, never one per entity', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue([
      entityDetail({ contentEntityId: 'ce_1', slug: 'item-1', authoredPresentation: [{ channel: 'presentation', path: 'image', value: { kind: 'media', fileId: 'f1' }, authoredBy: null, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] }),
      entityDetail({ contentEntityId: 'ce_2', slug: 'item-2', authoredPresentation: [{ channel: 'presentation', path: 'image', value: { kind: 'media', fileId: 'f2' }, authoredBy: null, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] })
    ])
    directusServiceRequestMock.mockResolvedValueOnce({ data: [{ id: 'f1', world_id: Number(WORLD_ID) }, { id: 'f2', world_id: Number(WORLD_ID) }] })

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    if (!result.ok) throw new Error('expected ok')

    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
    expect(result.entries[0]!.presentation?.image).toEqual({ url: '/api/assets/f1' })
    expect(result.entries[1]!.presentation?.image).toEqual({ url: '/api/assets/f2' })
  })

  it('never broadens access -- an image belonging to a different World resolves to no image, not a leak', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace())
    listAllWorkspaceEntityDetailsMock.mockResolvedValue([
      entityDetail({ authoredPresentation: [{ channel: 'presentation', path: 'image', value: { kind: 'media', fileId: 'f1' }, authoredBy: null, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }] })
    ])
    directusServiceRequestMock.mockResolvedValueOnce({ data: [{ id: 'f1', world_id: Number(OTHER_WORLD_ID) }] })

    const result = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    if (!result.ok) throw new Error('expected ok')
    expect(result.entries[0]!.presentation?.image).toBeNull()
  })

  it('caches by (workspaceId, worldId) + revision -- a second call at the same revision does not re-fetch entities', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace(0))
    listAllWorkspaceEntityDetailsMock.mockResolvedValue([entityDetail()])

    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates the cache when the workspace revision advances -- a save is visible on the next resolve', async () => {
    getContentWorkspaceMock.mockResolvedValueOnce(workspace(0))
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce([entityDetail({ title: 'Shortsword' })])
    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    getContentWorkspaceMock.mockResolvedValueOnce(workspace(1))
    listAllWorkspaceEntityDetailsMock.mockResolvedValueOnce([entityDetail({ title: 'Fine Shortsword' })])
    const second = await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)

    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(2)
    if (second.ok) expect(second.entries[0]!.title).toBe('Fine Shortsword')
  })

  it('does NOT share a cache entry across two different Worlds for the same workspace', async () => {
    getContentWorkspaceMock.mockResolvedValue(workspace(0))
    listAllWorkspaceEntityDetailsMock.mockResolvedValue([entityDetail()])

    await loadWorkspaceAsSource(WORKSPACE_ID, WORLD_ID)
    await loadWorkspaceAsSource(WORKSPACE_ID, OTHER_WORLD_ID)

    expect(listAllWorkspaceEntityDetailsMock).toHaveBeenCalledTimes(2)
  })
})
