// GET .../edit-target and POST .../customize -- Direct Content Editing
// consolidation pass. What matters: the GET route is read-only (never
// touches customizeEntityForWorld), the POST route gates ordinary saves
// on `world.entity.edit` but, for an already-SHARED workspace, requires
// REAL platform `platform.contentworkspace.edit` authority -- NO
// World-scoped capability, including `world.content.bind_workspace`,
// ever substitutes (second boundary review; the first fix's escalation
// to `world.content.bind_workspace` was itself wrong) -- and malformed/
// oversized edit arrays are rejected before the workflow ever runs.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { PlatformCapability, Principal, WorldCapability } from '../../../../server/utils/authorization'
import { ALL_WORLD_CAPABILITIES } from '../../../../server/utils/authorization'
import editTargetRoute from '../../../../server/api/worlds/[id]/entities/[entityType]/[slug]/edit-target.get'
import customizeRoute from '../../../../server/api/worlds/[id]/entities/[entityType]/[slug]/customize.post'

const h3Mocks = vi.hoisted(() => ({ routerParams: {} as Record<string, string>, body: null as unknown }))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRouterParam: (_event: unknown, name: string) => h3Mocks.routerParams[name],
    readBody: async () => h3Mocks.body
  }
})

const {
  resolveDirectEditTargetMock, customizeEntityForWorldMock, getWorldSystemKeyMock, catalogueEntryToBlocksMock, splitSharedEntityToLocalWorkspaceMock,
  listWorldsBoundToWorkspaceMock
} = vi.hoisted(() => ({
  resolveDirectEditTargetMock: vi.fn(),
  splitSharedEntityToLocalWorkspaceMock: vi.fn(),
  customizeEntityForWorldMock: vi.fn(),
  getWorldSystemKeyMock: vi.fn(),
  catalogueEntryToBlocksMock: vi.fn(),
  listWorldsBoundToWorkspaceMock: vi.fn()
}))

vi.mock('../../../../server/utils/content-entity-direct-edit', () => ({
  resolveDirectEditTarget: resolveDirectEditTargetMock,
  customizeEntityForWorld: customizeEntityForWorldMock,
  splitSharedEntityToLocalWorkspace: splitSharedEntityToLocalWorkspaceMock
}))
vi.mock('../../../../server/utils/entity-factory', () => ({ getWorldSystemKey: getWorldSystemKeyMock }))
vi.mock('../../../../server/utils/catalogue-entity-bridge', () => ({ catalogueEntryToBlocks: catalogueEntryToBlocksMock }))
// requireWorkspaceEntityAccess (content-workspace-http.ts) is REAL here --
// only its own I/O dependency is mocked, so the escalation logic under
// test is the actual shared helper, not a stand-in for it.
vi.mock('../../../../server/utils/world-content-packs', () => ({ listWorldsBoundToWorkspace: listWorldsBoundToWorkspaceMock }))

const WORLD_ID = '4'

function principal(world: WorldCapability[], platform: PlatformCapability[] = []): Principal {
  return {
    accountId: 'acct-1',
    accountLookupKeys: ['acct-1'],
    platformCapabilities: new Set(platform),
    worldCapabilities: new Map([[WORLD_ID, new Set(world)]])
  }
}

function event(p: Principal | null): H3Event {
  return { context: { principal: p } } as unknown as H3Event
}

beforeEach(() => {
  vi.clearAllMocks()
  h3Mocks.routerParams = { id: WORLD_ID, entityType: 'item', slug: 'shortsword-xphb' }
  h3Mocks.body = null
  getWorldSystemKeyMock.mockResolvedValue('dnd5e')
  catalogueEntryToBlocksMock.mockReturnValue([])
})

describe('GET edit-target', () => {
  it('requires world.entity.edit, and reads only -- never calls the save workflow', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'needs-preparation', packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37', entityType: 'item', slug: 'shortsword-xphb', presentation: null, data: {} })
    const result = await editTargetRoute(event(principal(['world.entity.edit'])))
    expect(result).toMatchObject({ mode: 'needs-preparation', packageId: 'eldra.solaris.xphb' })
    expect(customizeEntityForWorldMock).not.toHaveBeenCalled()
  })

  it('denies a principal without world.entity.edit', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'needs-preparation' })
    await expect(editTargetRoute(event(principal(['world.read'])))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('denies an unauthenticated request', async () => {
    await expect(editTargetRoute(event(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('reports resolver-disabled as a 200 with a plain-language message, not an error', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'resolver-disabled' })
    const result = await editTargetRoute(event(principal(['world.entity.edit'])))
    expect(result).toMatchObject({ mode: 'resolver-disabled' })
  })

  it('404s when the entity does not resolve in this World', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'not-found' })
    await expect(editTargetRoute(event(principal(['world.entity.edit'])))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('passes through an already-customized (existing-workspace) target as-is', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'existing-workspace', workspaceId: 'ws-1', contentEntityId: 'ce_1', scope: 'shared', sharedWithWorldCount: 2 })
    const result = await editTargetRoute(event(principal(['world.entity.edit'])))
    expect(result).toEqual({ mode: 'existing-workspace', workspaceId: 'ws-1', contentEntityId: 'ce_1', scope: 'shared', sharedWithWorldCount: 2 })
  })
})

describe('POST customize', () => {
  beforeEach(() => {
    h3Mocks.body = { edits: [{ path: 'description', value: ['A fine blade.'] }], expectedRevision: null }
  })

  it('denies a principal without world.entity.edit, before the workflow runs', async () => {
    await expect(customizeRoute(event(principal(['world.read'])))).rejects.toMatchObject({ statusCode: 403 })
    expect(customizeEntityForWorldMock).not.toHaveBeenCalled()
  })

  it('rejects an empty edits array before resolving anything', async () => {
    h3Mocks.body = { edits: [], expectedRevision: null }
    await expect(customizeRoute(event(principal(['world.entity.edit'])))).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveDirectEditTargetMock).not.toHaveBeenCalled()
  })

  it('rejects an edit path that is not an allowed presentation field', async () => {
    h3Mocks.body = { edits: [{ path: 'mechanics.damage', value: '2d6' }], expectedRevision: null }
    await expect(customizeRoute(event(principal(['world.entity.edit'])))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('a LOCAL target (not shared) runs with only world.entity.edit -- no escalated check', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'needs-preparation' })
    customizeEntityForWorldMock.mockResolvedValue({ ok: true, workspaceId: 'ws-1', contentEntityId: 'ce_1', entity: { revision: 1 } })

    const result = await customizeRoute(event(principal(['world.entity.edit'])))

    expect(result).toEqual({ workspaceId: 'ws-1', contentEntityId: 'ce_1', entity: { revision: 1 } })
    expect(customizeEntityForWorldMock).toHaveBeenCalledWith(
      expect.objectContaining({ worldId: WORLD_ID, entityType: 'item', slug: 'shortsword-xphb', actorAccountId: 'acct-1', expectedRevision: null }),
      'dnd5e'
    )
  })

  it('a SHARED existing-workspace target is refused for a caller holding only world.entity.edit', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'existing-workspace', workspaceId: 'ws-1', contentEntityId: 'ce_1', scope: 'shared', sharedWithWorldCount: 2 })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([WORLD_ID, '6', '9']) // actually shared, per the REAL check
    h3Mocks.body = { edits: [{ path: 'description', value: ['x'] }], expectedRevision: 3 }

    await expect(customizeRoute(event(principal(['world.entity.edit'])))).rejects.toMatchObject({ statusCode: 403 })
    expect(customizeEntityForWorldMock).not.toHaveBeenCalled()
  })

  it('a SHARED existing-workspace target is STILL refused even with world.content.bind_workspace too -- binding authority is not shared-content edit authority', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'existing-workspace', workspaceId: 'ws-1', contentEntityId: 'ce_1', scope: 'shared', sharedWithWorldCount: 2 })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([WORLD_ID, '6', '9'])
    h3Mocks.body = { edits: [{ path: 'description', value: ['x'] }], expectedRevision: 3 }

    await expect(customizeRoute(event(principal(['world.entity.edit', 'world.content.bind_workspace'])))).rejects.toMatchObject({ statusCode: 403 })
    expect(customizeEntityForWorldMock).not.toHaveBeenCalled()
  })

  // Required regression: EVERY World capability there is in World A --
  // entity edit, workspace binding, all of it -- still does not reach a
  // workspace shared with another World, because none of it is platform
  // workspace-edit authority.
  it('a SHARED existing-workspace target is refused even for a caller holding EVERY World capability in World A, with no platform authority', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'existing-workspace', workspaceId: 'ws-1', contentEntityId: 'ce_1', scope: 'shared', sharedWithWorldCount: 2 })
    listWorldsBoundToWorkspaceMock.mockResolvedValue([WORLD_ID, '6', '9'])
    h3Mocks.body = { edits: [{ path: 'description', value: ['x'] }], expectedRevision: 3 }

    const everyWorldCapability = principal(ALL_WORLD_CAPABILITIES as unknown as WorldCapability[])
    await expect(customizeRoute(event(everyWorldCapability))).rejects.toMatchObject({ statusCode: 403 })
    expect(customizeEntityForWorldMock).not.toHaveBeenCalled()
  })

  // NOTE: this World-facing route unconditionally requires
  // `world.entity.edit` as its very first check (before any target
  // resolution), by design -- it is the ordinary-World-admin entry
  // point, not a platform one. A platform-authorized editor with no
  // World capability therefore cannot reach it at all, and correctly
  // so: "explicit shared editing by a platform-authorized editor" is
  // proven on the Studio routes themselves (PATCH/revert/checkpoint, in
  // content-workspace-entity-routes.test.ts's own
  // "platform-authorized shared editing remains fully supported" test)
  // -- the SAME routes `WorldEntityDirectEditDialog.vue`'s "Edit the
  // shared collection" choice actually calls once chosen.

  it('a resolver-disabled failure is a 409 with the feature-flag code, not a generic error', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'needs-preparation' })
    customizeEntityForWorldMock.mockResolvedValue({ ok: false, stage: 'resolver-disabled', message: 'not set up' })
    const error = await customizeRoute(event(principal(['world.entity.edit']))).catch((e: unknown) => e)
    expect(error).toMatchObject({ statusCode: 409, data: { code: 'effective-content-disabled' } })
  })

  it('a conflict failure is a 409 carrying the current state for recovery', async () => {
    resolveDirectEditTargetMock.mockResolvedValue({ mode: 'needs-preparation' })
    customizeEntityForWorldMock.mockResolvedValue({ ok: false, stage: 'conflict', message: 'changed', current: { revision: 9 } })
    const error = await customizeRoute(event(principal(['world.entity.edit']))).catch((e: unknown) => e)
    expect(error).toMatchObject({ statusCode: 409, data: { code: 'revision-conflict', current: { revision: 9 } } })
  })
})

describe('POST split-local', () => {
  it('requires world.entity.edit only -- never the escalated bind_workspace capability', async () => {
    const splitRoute = (await import('../../../../server/api/worlds/[id]/entities/[entityType]/[slug]/split-local.post')).default
    splitSharedEntityToLocalWorkspaceMock.mockResolvedValue({ ok: true, workspaceId: 'ws-1', contentEntityId: 'ce_1', entity: { revision: 0 } })
    await expect(splitRoute(event(principal(['world.entity.edit'])))).resolves.toMatchObject({ workspaceId: 'ws-1' })
  })

  it('denies a principal without world.entity.edit', async () => {
    const splitRoute = (await import('../../../../server/api/worlds/[id]/entities/[entityType]/[slug]/split-local.post')).default
    await expect(splitRoute(event(principal(['world.read'])))).rejects.toMatchObject({ statusCode: 403 })
    expect(splitSharedEntityToLocalWorkspaceMock).not.toHaveBeenCalled()
  })

  it('a not-shared refusal is a 400, never silently treated as success', async () => {
    const splitRoute = (await import('../../../../server/api/worlds/[id]/entities/[entityType]/[slug]/split-local.post')).default
    splitSharedEntityToLocalWorkspaceMock.mockResolvedValue({ ok: false, stage: 'not-shared', message: 'not shared' })
    await expect(splitRoute(event(principal(['world.entity.edit'])))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('a no-base-reference refusal is reported with its own distinct code', async () => {
    const splitRoute = (await import('../../../../server/api/worlds/[id]/entities/[entityType]/[slug]/split-local.post')).default
    splitSharedEntityToLocalWorkspaceMock.mockResolvedValue({ ok: false, stage: 'no-base-reference', message: 'authored, no base' })
    const error = await splitRoute(event(principal(['world.entity.edit']))).catch((e: unknown) => e)
    expect(error).toMatchObject({ statusCode: 409, data: { code: 'split-no-base-reference' } })
  })
})
