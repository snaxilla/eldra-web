// World Read Authorization pass. GET /api/worlds/:id/maps previously
// called neither `requireCapability` nor read `event.context.principal` --
// see entities.get.auth.test.ts's own header for the shared rationale and
// the globalThis-shim technique this file reuses identically. This route
// has no own local `directusServiceRequest`-style import -- it builds its
// own `dxFetch` against `fetch` directly, so the backend boundary mocked
// here is the global `fetch`.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Principal, WorldCapability } from '../../../../server/utils/authorization'

const fetchMock = vi.fn()

vi.hoisted(() => Object.assign(globalThis as any, {
  defineEventHandler: (handler: any) => handler,
  getRouterParam: (event: any, name: string) => event?.context?.params?.[name],
  createError: (input: { statusCode: number; statusMessage?: string }) =>
    Object.assign(new Error(input.statusMessage || `Error ${input.statusCode}`), input)
}))

const { default: handler } = await import('../../../../server/api/worlds/[id]/maps.get')

const WORLD_ID = '5'

function principal(worldCaps: Record<string, WorldCapability[]>): Principal {
  return {
    accountId: 'acct-1',
    accountLookupKeys: ['acct-1'],
    platformCapabilities: new Set(),
    worldCapabilities: new Map(Object.entries(worldCaps).map(([world, caps]) => [world, new Set(caps)]))
  }
}

function event(p: Principal | null, worldId: string = WORLD_ID): H3Event {
  return { context: { params: { id: worldId }, principal: p } } as unknown as H3Event
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ data: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
})

describe('GET /api/worlds/:id/maps -- authorization boundary', () => {
  it('unauthenticated caller: 401, no backend read attempted', async () => {
    await expect(handler(event(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('authenticated nonmember: 403, no backend read attempted', async () => {
    const p = principal({})
    await expect(handler(event(p))).rejects.toMatchObject({ statusCode: 403 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('member of a DIFFERENT World only: 403 for this World', async () => {
    const p = principal({ '999': ['world.read'] })
    await expect(handler(event(p, WORLD_ID))).rejects.toMatchObject({ statusCode: 403 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('authorized member: request proceeds, existing response shape intact', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] })
    const result = await handler(event(p))
    expect(Array.isArray(result)).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })
})
