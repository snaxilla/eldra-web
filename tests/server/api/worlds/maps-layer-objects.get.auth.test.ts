// World Read Authorization pass. GET /api/worlds/:id/maps/:mapId/layer-objects
// previously read neither the World id route param (present, simply
// unused) nor `event.context.principal` -- ANY authenticated account could
// request ANY mapId's layer objects regardless of which World it belonged
// to. This file covers both the new membership check and the new
// map-belongs-to-this-World check.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Principal, WorldCapability } from '../../../../server/utils/authorization'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

const { listLayerObjectsMock } = vi.hoisted(() => ({
  listLayerObjectsMock: vi.fn()
}))

vi.mock('../../../../server/utils/scene-layer-objects', () => ({
  listLayerObjects: listLayerObjectsMock
}))

vi.hoisted(() => Object.assign(globalThis as any, {
  defineEventHandler: (handler: any) => handler,
  getRouterParam: (event: any, name: string) => event?.context?.params?.[name],
  getQuery: (event: any) => event?.context?.query || {},
  createError: (input: { statusCode: number; statusMessage?: string }) =>
    Object.assign(new Error(input.statusMessage || `Error ${input.statusCode}`), input)
}))

const { default: handler } = await import('../../../../server/api/worlds/[id]/maps/[mapId]/layer-objects/index.get')

const WORLD_ID = '5'
const MAP_ID = 'map-1'

function principal(worldCaps: Record<string, WorldCapability[]>): Principal {
  return {
    accountId: 'acct-1',
    accountLookupKeys: ['acct-1'],
    platformCapabilities: new Set(),
    worldCapabilities: new Map(Object.entries(worldCaps).map(([world, caps]) => [world, new Set(caps)]))
  }
}

function event(p: Principal | null, worldId: string = WORLD_ID, mapId: string = MAP_ID): H3Event {
  return { context: { params: { id: worldId, mapId }, query: {}, principal: p } } as unknown as H3Event
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  listLayerObjectsMock.mockReset().mockResolvedValue([])
})

describe('GET /api/worlds/:id/maps/:mapId/layer-objects -- authorization boundary', () => {
  it('unauthenticated caller: 401, no backend read attempted', async () => {
    await expect(handler(event(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
    expect(listLayerObjectsMock).not.toHaveBeenCalled()
  })

  it('authenticated nonmember: 403, no backend read attempted', async () => {
    const p = principal({})
    await expect(handler(event(p))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('member of a DIFFERENT World only: 403 for this World', async () => {
    const p = principal({ '999': ['world.read'] })
    await expect(handler(event(p, WORLD_ID))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('World A route with a World B map id: 404, never returns World B layer objects', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] })
    directusServiceRequestMock.mockResolvedValueOnce({ data: [{ id: MAP_ID, world: 999 }] })
    await expect(handler(event(p, WORLD_ID))).rejects.toMatchObject({ statusCode: 404 })
    expect(listLayerObjectsMock).not.toHaveBeenCalled()
  })

  it('authorized member, map genuinely in this World: request proceeds, existing response shape intact', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] })
    directusServiceRequestMock.mockResolvedValueOnce({ data: [{ id: MAP_ID, world: Number(WORLD_ID) }] })

    const result = await handler(event(p, WORLD_ID))
    expect(result).toEqual({ objects: [] })
    expect(listLayerObjectsMock).toHaveBeenCalledWith(MAP_ID, undefined)
  })
})
