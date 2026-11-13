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
    revertPresentationChannelMock, revertPresentationPathMock, createEntityCheckpointMock, previewEntityPresentationMock
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
