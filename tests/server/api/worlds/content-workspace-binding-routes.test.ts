// POST/DELETE /api/worlds/:id/content-workspace-binding(/:workspaceId) --
// Content Workspaces & Studio Phase 6. What matters: a distinct
// capability from world.content.bind_pack, a resolver-disabled refusal
// that writes nothing, and unbind working even with the flag off.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Principal, WorldCapability } from '../../../../server/utils/authorization'
import bindRoute from '../../../../server/api/worlds/[id]/content-workspace-binding.post'
import unbindRoute from '../../../../server/api/worlds/[id]/content-workspace-binding/[workspaceId].delete'

const h3Mocks = vi.hoisted(() => ({ routerParams: {} as Record<string, string>, body: null as unknown }))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRouterParam: (_event: unknown, name: string) => h3Mocks.routerParams[name],
    readBody: async () => h3Mocks.body
  }
})

const { bindWorkspaceLiveToWorldMock, unbindWorkspaceFromWorldMock } = vi.hoisted(() => ({
  bindWorkspaceLiveToWorldMock: vi.fn(),
  unbindWorkspaceFromWorldMock: vi.fn()
}))

vi.mock('../../../../server/utils/world-content-pack-binding', () => ({
  bindWorkspaceLiveToWorld: bindWorkspaceLiveToWorldMock,
  unbindWorkspaceFromWorld: unbindWorkspaceFromWorldMock
}))

const WORLD_ID = '4'
const WORKSPACE_ID = 'w1'

function principal(world: WorldCapability[]): Principal {
  return {
    accountId: 'acct-1',
    accountLookupKeys: ['acct-1'],
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[WORLD_ID, new Set(world)]])
  }
}

function event(p: Principal | null): H3Event {
  return { context: { principal: p } } as unknown as H3Event
}

beforeEach(() => {
  h3Mocks.routerParams = { id: WORLD_ID, workspaceId: WORKSPACE_ID }
  h3Mocks.body = { workspaceId: WORKSPACE_ID }
  bindWorkspaceLiveToWorldMock.mockReset()
  unbindWorkspaceFromWorldMock.mockReset()
})

describe('POST content-workspace-binding', () => {
  it('401s an unauthenticated request', async () => {
    await expect(bindRoute(event(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('needs world.content.bind_workspace -- distinct from world.content.bind_pack', async () => {
    await expect(bindRoute(event(principal(['world.content.bind_pack'])))).rejects
      .toMatchObject({ statusCode: 403, statusMessage: "Missing capability 'world.content.bind_workspace'" })
  })

  it('binds and returns the binding on success', async () => {
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: true, binding: { id: 'b1' } })
    const result = await bindRoute(event(principal(['world.content.bind_workspace']))) as { bound: boolean }
    expect(result.bound).toBe(true)
    expect(bindWorkspaceLiveToWorldMock).toHaveBeenCalledWith(WORLD_ID, WORKSPACE_ID)
  })

  it('409s with a clear reason when the effective resolver is disabled, and writes nothing', async () => {
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: false, stage: 'resolver-disabled' })
    await expect(bindRoute(event(principal(['world.content.bind_workspace'])))).rejects
      .toMatchObject({ statusCode: 409, data: { code: 'effective-content-disabled' } })
  })

  it('404s when the workspace does not exist', async () => {
    bindWorkspaceLiveToWorldMock.mockResolvedValue({ bound: false, stage: 'workspace-not-found' })
    await expect(bindRoute(event(principal(['world.content.bind_workspace'])))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('400s a missing workspaceId before calling anything', async () => {
    h3Mocks.body = {}
    await expect(bindRoute(event(principal(['world.content.bind_workspace'])))).rejects.toMatchObject({ statusCode: 400 })
    expect(bindWorkspaceLiveToWorldMock).not.toHaveBeenCalled()
  })
})

describe('DELETE content-workspace-binding/:workspaceId', () => {
  it('401s an unauthenticated request', async () => {
    await expect(unbindRoute(event(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('needs world.content.bind_workspace', async () => {
    await expect(unbindRoute(event(principal([])))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('unbinds successfully', async () => {
    unbindWorkspaceFromWorldMock.mockResolvedValue({ unbound: true })
    const result = await unbindRoute(event(principal(['world.content.bind_workspace']))) as { unbound: boolean }
    expect(result.unbound).toBe(true)
  })

  it('404s when there was no such binding', async () => {
    unbindWorkspaceFromWorldMock.mockResolvedValue({ unbound: false, stage: 'not-bound' })
    await expect(unbindRoute(event(principal(['world.content.bind_workspace'])))).rejects.toMatchObject({ statusCode: 404 })
  })
})
