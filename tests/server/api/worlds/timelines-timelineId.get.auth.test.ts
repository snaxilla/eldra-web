// World Read Authorization pass. GET /api/worlds/:id/timelines/:timelineId
// previously called neither `requireCapability` nor read
// `event.context.principal` at all. `findTimeline`'s own slug-prefix check
// (unchanged) already prevents a World B timeline id/slug from resolving
// through a World A route -- covered here directly to confirm that
// pre-existing protection and the newly-added membership check compose
// correctly, not just that each exists in isolation.
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

const { default: handler } = await import('../../../../server/api/worlds/[id]/timelines/[timelineId].get')

const WORLD_ID = '5'
const TIMELINE_ID = '42'

function principal(worldCaps: Record<string, WorldCapability[]>): Principal {
  return {
    accountId: 'acct-1',
    accountLookupKeys: ['acct-1'],
    platformCapabilities: new Set(),
    worldCapabilities: new Map(Object.entries(worldCaps).map(([world, caps]) => [world, new Set(caps)]))
  }
}

function event(p: Principal | null, worldId: string = WORLD_ID, timelineId: string = TIMELINE_ID): H3Event {
  return { context: { params: { id: worldId, timelineId }, principal: p } } as unknown as H3Event
}

// findTimeline looks up by id first; a row whose slug does not start with
// this World's own `w<id>-` prefix is treated as not belonging to it.
function erasRowFor(worldId: string) {
  return { id: TIMELINE_ID, name: 'Age of Heroes', slug: `w${worldId}-age-of-heroes` }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('GET /api/worlds/:id/timelines/:timelineId -- authorization boundary', () => {
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

  it('World A route with a World B timeline id: 404, never returns World B content', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] })
    // The id exists, but belongs to World 999 (its slug carries that
    // prefix) -- findTimeline's own existing guard must still reject it,
    // even though the caller is now correctly authorized for World 5.
    // Queued twice: the byId lookup fails the prefix check, so findTimeline
    // falls through to its own bySlug lookup, which also finds nothing for
    // this World.
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [erasRowFor('999')] })
      .mockResolvedValueOnce({ data: [] })
    await expect(handler(event(p, WORLD_ID))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('authorized member, timeline genuinely in this World: request proceeds, existing response shape intact', async () => {
    const p = principal({ [WORLD_ID]: ['world.read'] })
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [erasRowFor(WORLD_ID)] }) // findTimeline byId
      .mockResolvedValueOnce({ data: [] }) // events

    const result = await handler(event(p, WORLD_ID))
    expect(result).toMatchObject({ worldId: Number(WORLD_ID), events: [] })
    expect(result.timeline?.title).toBe('Age of Heroes')
  })
})
