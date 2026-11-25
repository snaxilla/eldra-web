// World Read Authorization pass. GET /api/worlds/:id/entities/:entityId
// already correctly checked `entity.world_id !== worldId` (a World B entity
// id never resolved through a World A route) -- that protection is
// unchanged and re-verified here. What it never checked is WHO may ask at
// all: no `requireCapability`, no read of `event.context.principal`. A
// protected list does not secure an unprotected detail route.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Principal, WorldCapability } from '../../../../server/utils/authorization'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.hoisted(() => Object.assign(globalThis as any, {
  defineEventHandler: (handler: any) => handler,
  getRouterParam: (event: any, name: string) => event?.context?.params?.[name],
  createError: (input: { statusCode: number; statusMessage?: string }) =>
    Object.assign(new Error(input.statusMessage || `Error ${input.statusCode}`), input)
}))

const { default: handler } = await import('../../../../server/api/worlds/[id]/entities/[entityId].get')

const WORLD_ID = '5'
const ENTITY_ID = '42'

function principal(worldCaps: Record<string, WorldCapability[]>): Principal {
  return {
    accountId: 'acct-1',
    accountLookupKeys: ['acct-1'],
    platformCapabilities: new Set(),
    worldCapabilities: new Map(Object.entries(worldCaps).map(([world, caps]) => [world, new Set(caps)]))
  }
}

function event(p: Principal | null, worldId: string = WORLD_ID, entityId: string = ENTITY_ID): H3Event {
  return { context: { params: { id: worldId, entityId }, principal: p } } as unknown as H3Event
}

function entityRowFor(worldId: string) {
  return { id: Number(ENTITY_ID), world_id: Number(worldId), title: 'A Location', entity_type: 'location' }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('GET /api/worlds/:id/entities/:entityId -- authorization boundary', () => {
  it('unauthenticated caller: 401, no backend read attempted', async () => {
    await expect(handler(event(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
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

  it('World A route with a World B entity id: 404, never returns World B content (pre-existing guard, re-verified)', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] })
    directusServiceRequestMock.mockResolvedValueOnce({ data: entityRowFor('999') })
    await expect(handler(event(p, WORLD_ID))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('authorized member, entity genuinely in this World: request proceeds, existing response shape intact', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] })
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: entityRowFor(WORLD_ID) }) // the entity itself
      .mockResolvedValueOnce({ data: [] }) // block_instances
      .mockResolvedValueOnce({ data: [] }) // entity_statblocks
      .mockResolvedValueOnce({ data: [] }) // entity_actions
      .mockResolvedValueOnce({ data: [] }) // monster_profiles

    const result = await handler(event(p, WORLD_ID))
    expect(result.title).toBe('A Location')
    expect(result.blocks).toEqual([])
  })
})
