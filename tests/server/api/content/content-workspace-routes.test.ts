// Authorization and request validation for the Content Workspace routes.
//
// THE POINT OF THIS FILE: every gate below is enforced by the HANDLER.
// None of it depends on a button being hidden. In particular, a World
// owner with every World capability there is must still be refused --
// administering a World says nothing about who may author a
// platform-scoped content library that every World can bind.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Principal, PlatformCapability, WorldCapability } from '../../../../server/utils/authorization'
import { ALL_WORLD_CAPABILITIES } from '../../../../server/utils/authorization'
import { ContentWorkspaceSchemaError } from '../../../../server/utils/content-workspace-schema'
import listWorkspaces from '../../../../server/api/content/workspaces/index.get'
import createWorkspace from '../../../../server/api/content/workspaces/index.post'
import patchWorkspace from '../../../../server/api/content/workspaces/[workspaceId]/index.patch'
import listEntities from '../../../../server/api/content/workspaces/[workspaceId]/entities.get'
import importRoute from '../../../../server/api/content/workspaces/[workspaceId]/import.post'
import adoptLineage from '../../../../server/api/content/workspaces/[workspaceId]/adopt-lineage.post'
import studioSearch from '../../../../server/api/content/studio/search.get'

const h3Mocks = vi.hoisted(() => ({ routerParams: {} as Record<string, string>, query: {} as Record<string, unknown>, body: null as unknown }))

// Each route's default export, invoked directly with a stand-in event.
type RouteHandler = (event: H3Event) => Promise<unknown>

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
  listContentWorkspacesMock, getContentWorkspaceMock, createContentWorkspaceMock,
  updateContentWorkspaceMock, countWorkspaceEntitiesMock, listWorkspaceEntitiesMock,
  appendWorkspaceRevisionMock, importIntoWorkspaceMock, adoptPackageLineageMock,
  listPackageLineagesMock, checkLineageSystemCompatibilityMock, getWorldContentCatalogueMock
} = vi.hoisted(() => ({
  listContentWorkspacesMock: vi.fn(),
  getContentWorkspaceMock: vi.fn(),
  createContentWorkspaceMock: vi.fn(),
  updateContentWorkspaceMock: vi.fn(),
  countWorkspaceEntitiesMock: vi.fn(),
  listWorkspaceEntitiesMock: vi.fn(),
  appendWorkspaceRevisionMock: vi.fn(),
  importIntoWorkspaceMock: vi.fn(),
  adoptPackageLineageMock: vi.fn(),
  listPackageLineagesMock: vi.fn(),
  checkLineageSystemCompatibilityMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn()
}))

vi.mock('../../../../server/utils/content-workspaces', () => ({
  listContentWorkspaces: listContentWorkspacesMock,
  getContentWorkspace: getContentWorkspaceMock,
  createContentWorkspace: createContentWorkspaceMock,
  updateContentWorkspace: updateContentWorkspaceMock,
  countWorkspaceEntities: countWorkspaceEntitiesMock,
  listWorkspaceEntities: listWorkspaceEntitiesMock,
  appendWorkspaceRevision: appendWorkspaceRevisionMock
}))
vi.mock('../../../../server/utils/content-workspace-import', () => ({ importIntoWorkspace: importIntoWorkspaceMock }))
vi.mock('../../../../server/utils/content-package-lineages', () => ({
  adoptPackageLineage: adoptPackageLineageMock,
  listPackageLineages: listPackageLineagesMock
}))
vi.mock('../../../../server/utils/content-lineage-compatibility', () => ({
  checkLineageSystemCompatibility: checkLineageSystemCompatibilityMock
}))
vi.mock('../../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: getWorldContentCatalogueMock }))

const WORKSPACE_ID = 'a1111111-1111-4111-8111-111111111111'
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

// A World owner holds every World capability there is.
const WORLD_OWNER = ALL_WORLD_CAPABILITIES as unknown as WorldCapability[]

beforeEach(() => {
  h3Mocks.routerParams = { workspaceId: WORKSPACE_ID }
  h3Mocks.query = {}
  h3Mocks.body = null

  for (const mock of [
    listContentWorkspacesMock, getContentWorkspaceMock, createContentWorkspaceMock,
    updateContentWorkspaceMock, countWorkspaceEntitiesMock, listWorkspaceEntitiesMock,
    appendWorkspaceRevisionMock, importIntoWorkspaceMock, adoptPackageLineageMock,
    listPackageLineagesMock, checkLineageSystemCompatibilityMock, getWorldContentCatalogueMock
  ]) {
    mock.mockReset()
  }

  listContentWorkspacesMock.mockResolvedValue([workspace])
  getContentWorkspaceMock.mockResolvedValue(workspace)
  countWorkspaceEntitiesMock.mockResolvedValue(0)
  listWorkspaceEntitiesMock.mockResolvedValue({ entities: [], total: 0 })
  listPackageLineagesMock.mockResolvedValue([])
  appendWorkspaceRevisionMock.mockResolvedValue({})
  checkLineageSystemCompatibilityMock.mockResolvedValue({ compatible: true, lineageSystemKeys: ['dnd5e'], inspectedVersion: null })
})

describe('authentication', () => {
  it.each([
    ['list workspaces', listWorkspaces],
    ['create workspace', createWorkspace],
    ['patch workspace', patchWorkspace],
    ['list entities', listEntities],
    ['import', importRoute],
    ['adopt lineage', adoptLineage],
    ['studio search', studioSearch]
  ])('%s refuses an unauthenticated request with 401', async (_name, handler) => {
    await expect(run(handler, null)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('platform capability gates', () => {
  it.each([
    ['list workspaces', listWorkspaces, 'platform.contentworkspace.view'],
    ['create workspace', createWorkspace, 'platform.contentworkspace.create'],
    ['patch workspace', patchWorkspace, 'platform.contentworkspace.edit'],
    ['list entities', listEntities, 'platform.contentworkspace.view'],
    ['import', importRoute, 'platform.contentworkspace.edit'],
    ['adopt lineage', adoptLineage, 'platform.contentpack.publish']
  ])('%s refuses a Principal holding no platform capability', async (_name, handler) => {
    await expect(run(handler, principal([]))).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each([
    ['list workspaces', listWorkspaces, 'platform.contentworkspace.view'],
    ['create workspace', createWorkspace, 'platform.contentworkspace.create'],
    ['import', importRoute, 'platform.contentworkspace.edit'],
    ['adopt lineage', adoptLineage, 'platform.contentpack.publish']
  ])('%s names the capability it requires', async (_name, handler, capability) => {
    await expect(run(handler, principal([]))).rejects.toMatchObject({ statusMessage: `Missing capability '${capability}'` })
  })

  it('A WORLD OWNER IS NOT A PLATFORM CONTENT AUTHOR -- every World capability, still refused', async () => {
    const worldOwner = principal([], WORLD_OWNER)

    for (const handler of [listWorkspaces, createWorkspace, patchWorkspace, listEntities, importRoute, adoptLineage]) {
      await expect(run(handler, worldOwner)).rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('a workspace VIEWER cannot create, edit, import, or adopt', async () => {
    const viewer = principal(['platform.contentworkspace.view'])

    h3Mocks.body = { workspaceKey: 'new-one', title: 'New', systemKey: 'dnd5e' }
    await expect(run(createWorkspace, viewer)).rejects.toMatchObject({ statusCode: 403 })

    h3Mocks.body = { title: 'Renamed' }
    await expect(run(patchWorkspace, viewer)).rejects.toMatchObject({ statusCode: 403 })

    h3Mocks.body = { source: { kind: 'release', packageId: 'eldra.a.b', version: '1.0.0' } }
    await expect(run(importRoute, viewer)).rejects.toMatchObject({ statusCode: 403 })

    h3Mocks.body = { packageId: 'eldra.a.b' }
    await expect(run(adoptLineage, viewer)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('an EDITOR cannot adopt a lineage -- that is a publishing decision', async () => {
    h3Mocks.body = { packageId: 'eldra.solaris.xphb' }
    await expect(run(adoptLineage, principal(['platform.contentworkspace.edit']))).rejects
      .toMatchObject({ statusCode: 403, statusMessage: "Missing capability 'platform.contentpack.publish'" })
  })

  it('archiving needs the create capability, not merely edit', async () => {
    h3Mocks.body = { status: 'archived' }
    await expect(run(patchWorkspace, principal(['platform.contentworkspace.edit']))).rejects
      .toMatchObject({ statusCode: 403, statusMessage: "Missing capability 'platform.contentworkspace.create'" })

    updateContentWorkspaceMock.mockResolvedValue({ ...workspace, status: 'archived' })
    h3Mocks.body = { status: 'archived' }
    await expect(run(patchWorkspace, principal(['platform.contentworkspace.edit', 'platform.contentworkspace.create']))).resolves.toBeDefined()
  })
})

describe('Studio search permissions', () => {
  beforeEach(() => {
    h3Mocks.query = { worldId: WORLD_ID }
    getWorldContentCatalogueMock.mockResolvedValue({ packs: [], items: [], spells: [] })
  })

  it('needs the platform capability', async () => {
    await expect(run(studioSearch, principal([], ['world.read']))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('ALSO needs access to the specific World -- a platform author is not a member of every World', async () => {
    const platformOnly: Principal = {
      accountId: 'acct-1',
      accountLookupKeys: ['acct-1'],
      platformCapabilities: new Set<PlatformCapability>(['platform.contentworkspace.view']),
      worldCapabilities: new Map()
    }
    await expect(run(studioSearch, platformOnly)).rejects
      .toMatchObject({ statusCode: 403, statusMessage: "Missing capability 'world.read'" })
  })

  it('succeeds with both, and reads the World catalogue rather than a second pipeline', async () => {
    const result = await run(studioSearch, principal(['platform.contentworkspace.view'], ['world.read']))
    expect(getWorldContentCatalogueMock).toHaveBeenCalledWith(WORLD_ID)
    expect(result).toMatchObject({ worldId: WORLD_ID, total: 0 })
  })

  it('requires a worldId rather than silently searching nothing', async () => {
    h3Mocks.query = {}
    await expect(run(studioSearch, principal(['platform.contentworkspace.view'], ['world.read']))).rejects
      .toMatchObject({ statusCode: 400 })
  })

  it('rejects a malformed filter with every problem listed', async () => {
    h3Mocks.query = { worldId: WORLD_ID, category: 'weapons', limit: '9999' }
    await expect(run(studioSearch, principal(['platform.contentworkspace.view'], ['world.read']))).rejects
      .toMatchObject({ statusCode: 400, data: { problems: expect.arrayContaining([expect.stringContaining('weapons')]) } })
  })

  it('surfaces a bound pack that failed to load instead of quietly returning fewer rows', async () => {
    getWorldContentCatalogueMock.mockResolvedValue({
      packs: [{ ok: false, packageId: 'eldra.broken.pack', version: '1.0.0', failure: { stage: 'integrity-mismatch' } }],
      items: []
    })
    const result = await run(studioSearch, principal(['platform.contentworkspace.view'], ['world.read']))
    expect(result.unavailablePacks).toEqual([{ packageId: 'eldra.broken.pack', version: '1.0.0', reason: 'integrity-mismatch' }])
  })
})

describe('request validation', () => {
  const editor = principal(['platform.contentworkspace.edit'])

  it('refuses a PATCH that tries to change identity or provenance', async () => {
    for (const forbidden of ['workspaceKey', 'systemKey', 'ownerAccountId', 'baseRefs', 'authoredPresentation']) {
      h3Mocks.body = { [forbidden]: 'anything' }
      await expect(run(patchWorkspace, editor)).rejects.toMatchObject({ statusCode: 400 })
      expect(updateContentWorkspaceMock).not.toHaveBeenCalled()
    }
  })

  it('refuses a malformed workspace id before reaching the store', async () => {
    h3Mocks.routerParams = { workspaceId: 'not-a-uuid' }
    h3Mocks.body = { title: 'x' }
    await expect(run(patchWorkspace, editor)).rejects.toMatchObject({ statusCode: 400 })
    expect(getContentWorkspaceMock).not.toHaveBeenCalled()
  })

  it('refuses an unregistered game system on create', async () => {
    h3Mocks.body = { workspaceKey: 'abc', title: 'T', systemKey: 'made-up' }
    await expect(run(createWorkspace, principal(['platform.contentworkspace.create']))).rejects
      .toMatchObject({ statusCode: 400 })
    expect(createContentWorkspaceMock).not.toHaveBeenCalled()
  })

  it('reports a taken workspace key as a conflict', async () => {
    createContentWorkspaceMock.mockResolvedValue({ ok: false, stage: 'key-taken', workspaceKey: 'abc' })
    h3Mocks.body = { workspaceKey: 'abc', title: 'T', systemKey: 'dnd5e' }
    await expect(run(createWorkspace, principal(['platform.contentworkspace.create']))).rejects
      .toMatchObject({ statusCode: 409 })
  })

  it('caps the entity listing page size', async () => {
    h3Mocks.query = { limit: '5000' }
    await expect(run(listEntities, principal(['platform.contentworkspace.view']))).rejects
      .toMatchObject({ statusCode: 400 })
  })

  it('404s a workspace that does not exist', async () => {
    getContentWorkspaceMock.mockResolvedValue(null)
    await expect(run(listEntities, principal(['platform.contentworkspace.view']))).rejects
      .toMatchObject({ statusCode: 404 })
  })

  it('refuses to write into an archived workspace, but still allows reading it', async () => {
    getContentWorkspaceMock.mockResolvedValue({ ...workspace, status: 'archived' })

    h3Mocks.body = { source: { kind: 'release', packageId: 'eldra.a.b', version: '1.0.0' } }
    await expect(run(importRoute, editor)).rejects.toMatchObject({ statusCode: 409 })

    await expect(run(listEntities, principal(['platform.contentworkspace.view']))).resolves.toBeDefined()
  })
})

describe('import route outcomes', () => {
  const editor = principal(['platform.contentworkspace.edit'])

  beforeEach(() => {
    h3Mocks.body = { source: { kind: 'release', packageId: 'eldra.solaris.xphb', version: '1.0.38' } }
  })

  it('returns the report on success', async () => {
    importIntoWorkspaceMock.mockResolvedValue({
      ok: true, applied: true,
      report: { counts: { added: 2, unchanged: 0, changedNeedsReview: 0, unresolved: 0, absentUpstream: 0 } },
      progress: { entitiesCreated: 2, snapshotsWritten: 2, pendingReviewsRecorded: 0 }
    })

    await expect(run(importRoute, editor)).resolves.toMatchObject({ applied: true, progress: { entitiesCreated: 2 } })
  })

  it('NEVER reports success for a partial import, and says a retry is safe', async () => {
    importIntoWorkspaceMock.mockResolvedValue({
      ok: false, stage: 'write-failed', message: 'The import stopped before it finished. Run the import again to complete it.',
      progress: { entitiesCreated: 12, snapshotsWritten: 12, pendingReviewsRecorded: 0 }, retrySafe: true
    })

    await expect(run(importRoute, editor)).rejects.toMatchObject({
      statusCode: 502,
      data: { code: 'write-failed', retrySafe: true, progress: { entitiesCreated: 12 } }
    })
  })

  it('maps an unreachable source to 502 and an unknown one to 404', async () => {
    importIntoWorkspaceMock.mockResolvedValue({ ok: false, stage: 'source-unavailable', message: 'dataset missing' })
    await expect(run(importRoute, editor)).rejects.toMatchObject({ statusCode: 502 })

    importIntoWorkspaceMock.mockResolvedValue({ ok: false, stage: 'source-not-found', message: 'no such pack' })
    await expect(run(importRoute, editor)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects an unknown source kind before touching the executor', async () => {
    h3Mocks.body = { source: { kind: 'workspace', workspaceId: WORKSPACE_ID } }
    await expect(run(importRoute, editor)).rejects.toMatchObject({ statusCode: 400 })
    expect(importIntoWorkspaceMock).not.toHaveBeenCalled()
  })
})

describe('lineage adoption outcomes', () => {
  const publisher = principal(['platform.contentpack.publish'])

  beforeEach(() => {
    h3Mocks.body = { packageId: 'eldra.solaris.xphb' }
  })

  it('adopts, and records the ownership change in history', async () => {
    adoptPackageLineageMock.mockResolvedValue({ ok: true, changed: true, lineage: { packageId: 'eldra.solaris.xphb' } })

    await expect(run(adoptLineage, publisher)).resolves.toMatchObject({ alreadyOwned: false })
    expect(appendWorkspaceRevisionMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'adopt' }))
  })

  it('reports a conflict when another workspace owns the lineage', async () => {
    adoptPackageLineageMock.mockResolvedValue({ ok: false, stage: 'owned-by-other', ownerWorkspaceId: 'other-ws' })

    await expect(run(adoptLineage, publisher)).rejects.toMatchObject({
      statusCode: 409, data: { code: 'owned-by-other', ownerWorkspaceId: 'other-ws' }
    })
    expect(appendWorkspaceRevisionMock).not.toHaveBeenCalled()
  })

  it('refuses a lineage whose content is for another game system', async () => {
    checkLineageSystemCompatibilityMock.mockResolvedValue({
      compatible: false, lineageSystemKeys: ['pf2e'], inspectedVersion: '1.0.0',
      message: "Package publishes 'pf2e' content, which this 'dnd5e' workspace cannot publish."
    })

    await expect(run(adoptLineage, publisher)).rejects.toMatchObject({ statusCode: 409 })
    expect(adoptPackageLineageMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed packageId', async () => {
    h3Mocks.body = { packageId: 'nodots' }
    await expect(run(adoptLineage, publisher)).rejects.toMatchObject({ statusCode: 400 })
    expect(adoptPackageLineageMock).not.toHaveBeenCalled()
  })

  it('is idempotent for the workspace that already owns it', async () => {
    adoptPackageLineageMock.mockResolvedValue({ ok: true, changed: false, lineage: { packageId: 'eldra.solaris.xphb' } })
    await expect(run(adoptLineage, publisher)).resolves.toMatchObject({ alreadyOwned: true })
    expect(appendWorkspaceRevisionMock).not.toHaveBeenCalled()
  })
})

describe('unprovisioned schema', () => {
  it('answers 503 with the operator remedy, never an empty success', async () => {
    listContentWorkspacesMock.mockImplementation(() => Promise.reject(new ContentWorkspaceSchemaError('content_workspaces')))

    await expect(run(listWorkspaces, principal(['platform.contentworkspace.view']))).rejects.toMatchObject({
      statusCode: 503,
      data: { code: 'content-workspace-schema-unavailable', collection: 'content_workspaces' }
    })
  })

  it('still refuses an unauthorized caller BEFORE reporting a schema problem', async () => {
    listContentWorkspacesMock.mockImplementation(() => Promise.reject(new ContentWorkspaceSchemaError('content_workspaces')))
    await expect(run(listWorkspaces, principal([]))).rejects.toMatchObject({ statusCode: 403 })
  })
})
