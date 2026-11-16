// Authorization and request handling for the Content Workspace entity
// editing routes -- Phase 4. Mirrors content-workspace-routes.test.ts's
// own convention exactly.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Principal, PlatformCapability, WorldCapability } from '../../../../server/utils/authorization'
import { ALL_WORLD_CAPABILITIES } from '../../../../server/utils/authorization'

import getEntity from '../../../../server/api/content/workspaces/[workspaceId]/entities/[contentEntityId]/index.get'
import patchEntity from '../../../../server/api/content/workspaces/[workspaceId]/entities/[contentEntityId]/index.patch'
import revertChannel from '../../../../server/api/content/workspaces/[workspaceId]/entities/[contentEntityId]/overrides/presentation.delete'
import revertPath from '../../../../server/api/content/workspaces/[workspaceId]/entities/[contentEntityId]/overrides/presentation/[path].delete'
import createCheckpoint from '../../../../server/api/content/workspaces/[workspaceId]/entities/[contentEntityId]/checkpoints.post'

type RouteHandler = (event: H3Event) => Promise<unknown>

const h3Mocks = vi.hoisted(() => ({ routerParams: {} as Record<string, string>, query: {} as Record<string, unknown>, body: null as unknown }))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRouterParam: (_event: unknown, name: string) => h3Mocks.routerParams[name],
    getQuery: () => h3Mocks.query,
    readBody: async () => h3Mocks.body
  }
})

const {
  getContentWorkspaceMock,
  getWorkspaceEntityDetailMock,
  applyPresentationEditsMock,
  revertPresentationChannelMock,
  revertPresentationPathMock,
  createEntityCheckpointMock,
  previewEntityPresentationMock
} = vi.hoisted(() => ({
  getContentWorkspaceMock: vi.fn(),
  getWorkspaceEntityDetailMock: vi.fn(),
  applyPresentationEditsMock: vi.fn(),
  revertPresentationChannelMock: vi.fn(),
  revertPresentationPathMock: vi.fn(),
  createEntityCheckpointMock: vi.fn(),
  previewEntityPresentationMock: vi.fn()
}))

const listWorldsBoundToWorkspaceMock = vi.hoisted(() => vi.fn())
vi.mock('../../../../server/utils/world-content-packs', () => ({ listWorldsBoundToWorkspace: listWorldsBoundToWorkspaceMock }))
vi.mock('../../../../server/utils/catalogue-entity-bridge', () => ({ catalogueEntryToBlocks: vi.fn(() => []) }))
vi.mock('../../../../server/utils/entity-collection-summary', () => ({ collectionSummaryMetaLines: vi.fn(() => []) }))
vi.mock('../../../../server/utils/content-workspaces', () => ({ getContentWorkspace: getContentWorkspaceMock }))
vi.mock('../../../../server/utils/content-workspace-entities', () => ({
  getWorkspaceEntityDetail: getWorkspaceEntityDetailMock,
  applyPresentationEdits: applyPresentationEditsMock,
  revertPresentationChannel: revertPresentationChannelMock,
  revertPresentationPath: revertPresentationPathMock,
  createEntityCheckpoint: createEntityCheckpointMock
}))
vi.mock('../../../../server/utils/content-workspace-presentation', () => ({
  previewEntityPresentation: previewEntityPresentationMock,
  resolveBasePresentation: vi.fn(() => null),
  computePresentationBaseValueHash: vi.fn(() => null)
}))

const WORKSPACE_ID = 'a1111111-1111-4111-8111-111111111111'
const CONTENT_ENTITY_ID = 'ce_abcdefghijklmnopqrstuvwxyz'
const WORLD_ID = '4'

function principal(platform: PlatformCapability[], world: WorldCapability[] = []): Principal {
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

function run(handler: RouteHandler, p: Principal | null) {
  return handler(event(p))
}

const workspace = {
  id: WORKSPACE_ID, workspaceKey: 'solaris-xphb', title: 'Solaris XPHB', description: null,
  systemKey: 'dnd5e', sourceGameSystemKey: null, sourceCollectionKey: null,
  status: 'active' as const, ownerAccountId: null, createdAt: null, updatedAt: null
}

const entityDetail = {
  id: 'e1', workspaceId: WORKSPACE_ID, contentEntityId: CONTENT_ENTITY_ID, systemKey: 'dnd5e', entityType: 'item',
  slug: 'shortsword-xphb', title: 'Shortsword', origin: 'imported' as const, state: 'active' as const, revision: 0,
  baseData: null, baseDataHash: null, baseSourceRef: null, baseMissing: false, baseRefs: [], slugAliases: [],
  authoredData: null, authoredPresentation: [], authoredMechanics: [], createdAt: null, updatedAt: null
}

const WORLD_OWNER = ALL_WORLD_CAPABILITIES as unknown as WorldCapability[]

beforeEach(() => {
  h3Mocks.routerParams = { workspaceId: WORKSPACE_ID, contentEntityId: CONTENT_ENTITY_ID, path: 'name' }
  h3Mocks.query = {}
  h3Mocks.body = { expectedRevision: 0, edits: [{ path: 'name', value: 'Fine Shortsword' }] }

  for (const mock of [
    getContentWorkspaceMock, getWorkspaceEntityDetailMock, applyPresentationEditsMock,
    revertPresentationChannelMock, revertPresentationPathMock, createEntityCheckpointMock, previewEntityPresentationMock,
    listWorldsBoundToWorkspaceMock
  ]) mock.mockReset()

  getContentWorkspaceMock.mockResolvedValue(workspace)
  getWorkspaceEntityDetailMock.mockResolvedValue(entityDetail)
  previewEntityPresentationMock.mockResolvedValue({ basePresentation: null, effectivePresentation: null, imageUnavailable: false })
  applyPresentationEditsMock.mockResolvedValue({ ok: true, entity: { ...entityDetail, revision: 1 } })
  revertPresentationChannelMock.mockResolvedValue({ ok: true, entity: entityDetail })
  revertPresentationPathMock.mockResolvedValue({ ok: true, entity: entityDetail })
  createEntityCheckpointMock.mockResolvedValue({ ok: true, revisionId: 'rev-1' })
})

describe('authentication', () => {
  it.each([
    ['get entity', getEntity],
    ['patch entity', patchEntity],
    ['revert channel', revertChannel],
    ['revert path', revertPath],
    ['create checkpoint', createCheckpoint]
  ])('%s refuses an unauthenticated request with 401', async (_name, handler) => {
    await expect(run(handler as RouteHandler, null)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('platform capability gates', () => {
  it('get entity needs platform.contentworkspace.view', async () => {
    await expect(run(getEntity, principal([]))).rejects.toMatchObject({ statusCode: 403, statusMessage: "Missing capability 'platform.contentworkspace.view'" })
    await expect(run(getEntity, principal(['platform.contentworkspace.view']))).resolves.toBeDefined()
  })

  it.each([
    ['patch entity', patchEntity],
    ['revert channel', revertChannel],
    ['revert path', revertPath],
    ['create checkpoint', createCheckpoint]
  ])('%s needs platform.contentworkspace.edit, not merely .view', async (_name, handler) => {
    await expect(run(handler as RouteHandler, principal(['platform.contentworkspace.view']))).rejects
      .toMatchObject({ statusCode: 403, statusMessage: "Missing capability 'platform.contentworkspace.edit'" })
  })

  it('A WORLD OWNER IS NOT A PLATFORM CONTENT AUTHOR -- every World capability, still refused on every route', async () => {
    const worldOwner = principal([], WORLD_OWNER)
    for (const handler of [getEntity, patchEntity, revertChannel, revertPath, createCheckpoint]) {
      await expect(run(handler as RouteHandler, worldOwner)).rejects.toMatchObject({ statusCode: 403 })
    }
  })
})

// Direct-edit consolidation pass: the SAME shared editor is now also
// reachable by an ordinary World admin (world.entity.edit), WITHOUT any
// platform capability -- but ONLY when the caller's claimed worldId is
// ACTUALLY among the Worlds this workspace is live-bound to right now.
// A World capability alone (the test above) is never enough; a worldId
// for an UNRELATED World is never enough either.
describe('World-scoped access (no platform capability, direct-edit entry point)', () => {
  it('a World admin succeeds when the workspace is actually bound to their claimed World', async () => {
    listWorldsBoundToWorkspaceMock.mockResolvedValue([WORLD_ID])
    h3Mocks.query = { worldId: WORLD_ID }
    const worldAdmin = principal([], ['world.entity.edit'])

    h3Mocks.body = { worldId: WORLD_ID, expectedRevision: 0, edits: [{ path: 'name', value: 'Fine Shortsword' }] }
    for (const handler of [getEntity, patchEntity, revertChannel, revertPath]) {
      await expect(run(handler as RouteHandler, worldAdmin)).resolves.toBeDefined()
    }

    h3Mocks.body = { worldId: WORLD_ID, label: 'Checkpoint' }
    await expect(run(createCheckpoint, worldAdmin)).resolves.toBeDefined()
  })

  it('refused when the workspace is NOT bound to the claimed World (worldbuilder in a different World)', async () => {
    listWorldsBoundToWorkspaceMock.mockResolvedValue(['6']) // bound to a DIFFERENT World
    h3Mocks.query = { worldId: WORLD_ID }
    h3Mocks.body = { worldId: WORLD_ID, expectedRevision: 0, edits: [{ path: 'name', value: 'x' }] }
    const worldAdmin = principal([], ['world.entity.edit'])

    await expect(run(getEntity, worldAdmin)).rejects.toMatchObject({ statusCode: 403 })
    await expect(run(patchEntity, worldAdmin)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refused when the World capability itself is missing, even if the workspace IS bound to that World', async () => {
    listWorldsBoundToWorkspaceMock.mockResolvedValue([WORLD_ID])
    h3Mocks.query = { worldId: WORLD_ID }
    h3Mocks.body = { worldId: WORLD_ID, expectedRevision: 0, edits: [{ path: 'name', value: 'x' }] }
    const noCapability = principal([], [])

    await expect(run(getEntity, noCapability)).rejects.toMatchObject({ statusCode: 403 })
  })
})

// Pre-commit boundary review, round two: a second review found the FIRST
// fix for this gap still wrong. Two Worlds (WORLD_ID='4' and
// OTHER_WORLD_ID='6') share ONE workspace. A caller authorized ONLY in
// WORLD_ID (holding `world.entity.edit` there, never touching
// OTHER_WORLD_ID) must be able to READ the shared entity (their own
// World legitimately shows it), but every WRITE
// (PATCH/revert-channel/revert-path/checkpoint) must be refused --
// NO World-scoped capability grants it, not even `world.content.bind_workspace`
// held on the correct World. Binding authorizes attaching/detaching a
// workspace FROM a World; it is not shared-content edit authority, and
// must never substitute for the real platform `platform.contentworkspace.edit`
// capability -- that is exactly the mistake the first version of this fix
// made. The correct path for a World-only editor to change a shared
// entity is "Customize for this World" (`splitSharedEntityToLocalWorkspace`),
// covered separately in content-entity-direct-edit.test.ts. Every one of
// the 5 routes is exercised directly here, not just one representative
// route.
describe('Two Worlds sharing ONE workspace -- the write-escalation boundary', () => {
  const OTHER_WORLD_ID = '6'
  const writeHandlers: [string, RouteHandler][] = [
    ['patch entity', patchEntity as RouteHandler],
    ['revert channel', revertChannel as RouteHandler],
    ['revert path', revertPath as RouteHandler],
    ['create checkpoint', createCheckpoint as RouteHandler]
  ]

  beforeEach(() => {
    // Bound to BOTH Worlds -- a genuinely shared workspace.
    listWorldsBoundToWorkspaceMock.mockResolvedValue([WORLD_ID, OTHER_WORLD_ID])
    h3Mocks.query = { worldId: WORLD_ID }
  })

  it('a caller authorized in only WORLD_ID may READ the shared entity', async () => {
    h3Mocks.body = { worldId: WORLD_ID }
    const worldAOnly = principal([], ['world.entity.edit'])
    await expect(run(getEntity, worldAOnly)).resolves.toBeDefined()
  })

  it.each(writeHandlers)('%s is REFUSED for a caller holding only world.entity.edit on the shared workspace', async (_name, handler) => {
    h3Mocks.body = { worldId: WORLD_ID, expectedRevision: 0, edits: [{ path: 'name', value: 'x' }], label: 'cp' }
    const worldAOnly = principal([], ['world.entity.edit'])
    await expect(run(handler, worldAOnly)).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each(writeHandlers)('%s is STILL REFUSED even when the caller holds world.content.bind_workspace on that SAME World -- binding authority is not shared-content edit authority', async (_name, handler) => {
    h3Mocks.body = { worldId: WORLD_ID, expectedRevision: 0, edits: [{ path: 'name', value: 'x' }], label: 'cp' }
    const bindOnly = principal([], ['world.entity.edit', 'world.content.bind_workspace'])
    await expect(run(handler, bindOnly)).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each(writeHandlers)('%s is REFUSED even when the caller holds EVERY World capability there is on World A, with no platform workspace-edit authority -- the required regression', async (_name, handler) => {
    h3Mocks.body = { worldId: WORLD_ID, expectedRevision: 0, edits: [{ path: 'name', value: 'x' }], label: 'cp' }
    const everyWorldCapability = principal([], ALL_WORLD_CAPABILITIES as unknown as WorldCapability[])
    await expect(run(handler, everyWorldCapability)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('claiming the OTHER World (which the caller is NOT actually a member of) is refused outright, never silently falling back to WORLD_ID', async () => {
    h3Mocks.query = { worldId: OTHER_WORLD_ID }
    h3Mocks.body = { worldId: OTHER_WORLD_ID, expectedRevision: 0, edits: [{ path: 'name', value: 'x' }] }
    const worldAOnly = principal([], ['world.entity.edit', 'world.content.bind_workspace']) // capabilities keyed to WORLD_ID, not OTHER_WORLD_ID
    await expect(run(patchEntity, worldAOnly)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('a caller with NO membership in either World is refused on every route, including read', async () => {
    h3Mocks.body = { worldId: WORLD_ID, expectedRevision: 0, edits: [{ path: 'name', value: 'x' }], label: 'cp' }
    const stranger = principal([], [])
    for (const handler of [getEntity as RouteHandler, ...writeHandlers.map(([, h]) => h)]) {
      await expect(run(handler, stranger)).rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('platform-authorized shared editing remains fully supported, unaffected by any of the above', async () => {
    h3Mocks.body = { expectedRevision: 0, edits: [{ path: 'name', value: 'x' }], label: 'cp' }
    const platformEditor = principal(['platform.contentworkspace.view', 'platform.contentworkspace.edit'])
    await expect(run(getEntity, platformEditor)).resolves.toBeDefined()
    for (const [, handler] of writeHandlers) {
      await expect(run(handler, platformEditor)).resolves.toBeDefined()
    }
  })
})

describe('PATCH -- applying presentation edits', () => {
  const editor = principal(['platform.contentworkspace.edit'])

  it('accepts a well-formed edit and returns the updated entity', async () => {
    const result = await run(patchEntity, editor) as { entity: typeof entityDetail }
    expect(result.entity.revision).toBe(1)
    expect(applyPresentationEditsMock).toHaveBeenCalledWith(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, expect.any(Array), 'acct-1')
  })

  it('400s a malformed body before calling the server util at all', async () => {
    h3Mocks.body = { expectedRevision: -1, edits: [] }
    await expect(run(patchEntity, editor)).rejects.toMatchObject({ statusCode: 400 })
    expect(applyPresentationEditsMock).not.toHaveBeenCalled()
  })

  it('404s when the entity does not exist', async () => {
    getWorkspaceEntityDetailMock.mockResolvedValueOnce(null)
    await expect(run(patchEntity, editor)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('surfaces a revision conflict as 409, carrying the current entity -- never silently overwrites', async () => {
    applyPresentationEditsMock.mockResolvedValueOnce({ ok: false, stage: 'conflict', current: { ...entityDetail, revision: 5 } })
    await expect(run(patchEntity, editor)).rejects.toMatchObject({
      statusCode: 409,
      data: { code: 'revision-conflict', current: { revision: 5 } }
    })
  })

  it('refuses a request on an archived workspace', async () => {
    getContentWorkspaceMock.mockResolvedValueOnce({ ...workspace, status: 'archived' })
    await expect(run(patchEntity, editor)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('503s distinctly (never a 409) when the atomic persistence layer is unconfigured/unreachable', async () => {
    applyPresentationEditsMock.mockResolvedValueOnce({ ok: false, stage: 'persistence-unavailable', message: 'ELDRA_WORKSPACE_DB_URL is not configured' })
    await expect(run(patchEntity, editor)).rejects.toMatchObject({
      statusCode: 503,
      data: { code: 'content-workspace-persistence-unavailable' }
    })
  })
})

describe('DELETE overrides/presentation (revert all)', () => {
  const editor = principal(['platform.contentworkspace.edit'])

  beforeEach(() => { h3Mocks.body = { expectedRevision: 0 } })

  it('reverts the whole channel', async () => {
    await run(revertChannel, editor)
    expect(revertPresentationChannelMock).toHaveBeenCalledWith(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, 'acct-1')
  })

  it('surfaces a conflict as 409', async () => {
    revertPresentationChannelMock.mockResolvedValueOnce({ ok: false, stage: 'conflict', current: entityDetail })
    await expect(run(revertChannel, editor)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('503s distinctly when the atomic persistence layer is unavailable', async () => {
    revertPresentationChannelMock.mockResolvedValueOnce({ ok: false, stage: 'persistence-unavailable', message: 'unreachable' })
    await expect(run(revertChannel, editor)).rejects.toMatchObject({ statusCode: 503, data: { code: 'content-workspace-persistence-unavailable' } })
  })
})

describe('DELETE overrides/presentation/:path (revert one field)', () => {
  const editor = principal(['platform.contentworkspace.edit'])

  beforeEach(() => { h3Mocks.body = { expectedRevision: 0 } })

  it('reverts exactly the named path', async () => {
    await run(revertPath, editor)
    expect(revertPresentationPathMock).toHaveBeenCalledWith(WORKSPACE_ID, CONTENT_ENTITY_ID, 0, 'name', 'acct-1')
  })

  it('400s a path outside the presentation allowlist before calling anything', async () => {
    h3Mocks.routerParams.path = 'data'
    await expect(run(revertPath, editor)).rejects.toMatchObject({ statusCode: 400 })
    expect(revertPresentationPathMock).not.toHaveBeenCalled()
  })

  it('503s distinctly when the atomic persistence layer is unavailable', async () => {
    revertPresentationPathMock.mockResolvedValueOnce({ ok: false, stage: 'persistence-unavailable', message: 'unreachable' })
    await expect(run(revertPath, editor)).rejects.toMatchObject({ statusCode: 503, data: { code: 'content-workspace-persistence-unavailable' } })
  })
})

describe('POST checkpoints', () => {
  const editor = principal(['platform.contentworkspace.edit'])

  beforeEach(() => { h3Mocks.body = { label: 'Before the big revision' } })

  it('creates a checkpoint and returns its revision id', async () => {
    const result = await run(createCheckpoint, editor) as { revisionId: string }
    expect(result.revisionId).toBe('rev-1')
  })

  it('requires a non-empty label', async () => {
    h3Mocks.body = { label: '' }
    await expect(run(createCheckpoint, editor)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('404s for a nonexistent entity', async () => {
    createEntityCheckpointMock.mockResolvedValueOnce({ ok: false, stage: 'not-found' })
    await expect(run(createCheckpoint, editor)).rejects.toMatchObject({ statusCode: 404 })
  })
})
