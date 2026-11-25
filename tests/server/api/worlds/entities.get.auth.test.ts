// World Read Authorization pass. GET /api/worlds/:id/entities previously
// called neither `requireCapability` nor read `event.context.principal` at
// all -- any authenticated Eldra account, member or not, could list any
// World's full entity roster. These tests cover the security boundary this
// pass adds; the route's own data-shaping logic is exercised by
// entities.get.test.ts's existing coverage of buildCollectionTextFields.
//
// No explicit h3 imports exist in the source file (it uses Nitro's bare
// auto-imported identifiers) -- shimmed onto globalThis here, the same
// established pattern as entities.get.test.ts's own vi.hoisted block.
// Unqualified identifier lookups fall through to globalThis regardless of
// whether the source module itself declares an import, so this works
// without changing the source file's own import style.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Principal, WorldCapability } from '../../../../server/utils/authorization'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

const { getCatalogueBackedEntityRowsMock } = vi.hoisted(() => ({
  getCatalogueBackedEntityRowsMock: vi.fn()
}))

vi.mock('../../../../server/utils/catalogue-entity-bridge', () => ({
  getCatalogueBackedEntityRows: getCatalogueBackedEntityRowsMock,
  catalogueTemplateId: (packageId: string, slug: string) => `catalogue:${packageId}:${slug}`
}))

vi.hoisted(() => Object.assign(globalThis as any, {
  defineEventHandler: (handler: any) => handler,
  getRouterParam: (event: any, name: string) => event?.context?.params?.[name],
  getQuery: (event: any) => event?.context?.query || {},
  createError: (input: { statusCode: number; statusMessage?: string }) =>
    Object.assign(new Error(input.statusMessage || `Error ${input.statusCode}`), input)
}))

const { default: handler } = await import('../../../../server/api/worlds/[id]/entities.get')

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
  return { context: { params: { id: worldId }, query: {}, principal: p } } as unknown as H3Event
}

beforeEach(() => {
  directusServiceRequestMock.mockReset().mockResolvedValue({ data: [] })
  getCatalogueBackedEntityRowsMock.mockReset().mockResolvedValue([])
})

describe('GET /api/worlds/:id/entities -- authorization boundary', () => {
  it('unauthenticated caller: 401, no backend read attempted', async () => {
    await expect(handler(event(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
    expect(getCatalogueBackedEntityRowsMock).not.toHaveBeenCalled()
  })

  it('authenticated nonmember (no membership row for this World at all): 403, no backend read attempted', async () => {
    const p = principal({})
    await expect(handler(event(p))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('member of a DIFFERENT World only: 403 for this World, no backend read attempted', async () => {
    const p = principal({ '999': ['world.read'] })
    await expect(handler(event(p, WORLD_ID))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('authorized member (world.read on this World): request proceeds, existing response shape intact', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] })
    const result = await handler(event(p))
    expect(Array.isArray(result)).toBe(true)
    expect(directusServiceRequestMock).toHaveBeenCalled()
  })

  it('every membership role holds world.read -- an Observer is not denied', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] }) // Observer's exact, sole capability
    await expect(handler(event(p))).resolves.toBeDefined()
  })
})
