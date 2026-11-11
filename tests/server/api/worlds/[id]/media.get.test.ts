// Unit tests for GET /api/worlds/:id/media (server/api/worlds/[id]/media.get.ts).
//
// Content Workspaces & Studio Phase 0, Area 1 -- Media Gallery World
// scoping. Confirmed root cause: this route required no capability at
// all, and its Directus query never filtered by World -- it returned
// every image file in the instance to any authenticated caller. These
// tests prove (a) the route is now gated behind `world.entity.edit`,
// matching upload/delete, and (b) the Directus query is now scoped to the
// requesting World via the new `world_id` field
// (scripts/directus/create-media-world-scope-schema.mjs), so World A's
// listing can never surface World B's files.
//
// requireCapability is exercised for REAL (not mocked), matching
// tests/server/api/worlds/[id]/rolls/index.get.test.ts's own precedent --
// this is about proving the real authorization system gates this route,
// not about re-testing requireCapability itself.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import type { Principal } from '../../../../../server/utils/authorization'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

const handlerModule = await import('../../../../../server/api/worlds/[id]/media.get')
const handler = handlerModule.default

function adminPrincipal(worldId: string, accountId = 'admin-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.entity.edit'])]]),
    accountLookupKeys: []
  }
}

// A real membership that holds no edit capability -- not "no membership
// at all" -- so this exercises `can()`'s own capability-set check, not
// just its "no membership row" branch.
function playerPrincipal(worldId: string, accountId = 'player-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read'])]]),
    accountLookupKeys: []
  }
}

// h3's getQuery(event) reads event.path (via ufo's getQuery) -- same
// convention as tests/server/api/worlds/[id]/rolls/index.get.test.ts.
function fakeEvent(worldId: string, principal: Principal | null, query: Record<string, string> = {}): H3Event {
  const search = new URLSearchParams(query).toString()
  return {
    context: { principal, params: { id: worldId } },
    path: `/api/worlds/${worldId}/media${search ? `?${search}` : ''}`
  } as unknown as H3Event
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  directusServiceRequestMock.mockResolvedValue({ data: [] })
})

describe('GET /api/worlds/:id/media', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(handler(fakeEvent('6', null))).rejects.toMatchObject({ statusCode: 401 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for an authenticated Principal who lacks world.entity.edit for this World', async () => {
    await expect(handler(fakeEvent('6', playerPrincipal('6')))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a World this Principal holds no membership in at all -- "missing/nonexistent World" follows the same established behavior as every other capability-gated route, with no separate 404 branch', async () => {
    // adminPrincipal('6') holds a membership for World 6 only; requesting World 999
    // (which does not exist) resolves to no membership row, exactly like a World
    // that genuinely does not exist -- can()'s own "no membership row means no
    // access" rule, unchanged by this fix.
    await expect(handler(fakeEvent('999', adminPrincipal('6')))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('allows a Principal holding world.entity.edit for this World to list media', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({
      data: [{ id: 'file-1', title: 'Shortsword', filename_download: 'shortsword.png', type: 'image/png', filesize: 10 }]
    })

    const result = await handler(fakeEvent('6', adminPrincipal('6')))

    expect(result.files).toHaveLength(1)
    expect(result.files[0].id).toBe('file-1')
  })

  it('scopes the Directus query to the requesting World via world_id, in addition to the image-type filter', async () => {
    await handler(fakeEvent('6', adminPrincipal('6')))

    expect(directusServiceRequestMock).toHaveBeenCalledWith('/files', expect.objectContaining({
      method: 'GET',
      query: expect.objectContaining({
        filter: expect.objectContaining({
          world_id: { _eq: 6 },
          type: { _starts_with: 'image/' }
        })
      })
    }))
  })

  it('World A access does not expose World B media -- two differently-scoped requests query with two different world_id filters', async () => {
    directusServiceRequestMock
      .mockResolvedValueOnce({ data: [{ id: 'world-6-file', title: 'A' }] })
      .mockResolvedValueOnce({ data: [{ id: 'world-7-file', title: 'B' }] })

    const resultA = await handler(fakeEvent('6', adminPrincipal('6')))
    const resultB = await handler(fakeEvent('7', adminPrincipal('7')))

    expect(resultA.files.map((f) => f.id)).toEqual(['world-6-file'])
    expect(resultB.files.map((f) => f.id)).toEqual(['world-7-file'])

    const [, firstCallOptions] = directusServiceRequestMock.mock.calls[0]
    const [, secondCallOptions] = directusServiceRequestMock.mock.calls[1]
    expect(firstCallOptions.query.filter.world_id).toEqual({ _eq: 6 })
    expect(secondCallOptions.query.filter.world_id).toEqual({ _eq: 7 })
  })

  it('a Principal authorized for World 6 cannot use that authorization to list World 7 media', async () => {
    await expect(handler(fakeEvent('7', adminPrincipal('6')))).rejects.toMatchObject({ statusCode: 403 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('combines world_id scoping with a search term using the existing _or shape, unchanged', async () => {
    await handler(fakeEvent('6', adminPrincipal('6'), { search: 'sword' }))

    expect(directusServiceRequestMock).toHaveBeenCalledWith('/files', expect.objectContaining({
      query: expect.objectContaining({
        filter: expect.objectContaining({
          world_id: { _eq: 6 },
          type: { _starts_with: 'image/' },
          _or: [
            { title: { _icontains: 'sword' } },
            { filename_download: { _icontains: 'sword' } },
            { filename_disk: { _icontains: 'sword' } },
            { description: { _icontains: 'sword' } }
          ]
        })
      })
    }))
  })

  it('does not leak file metadata when unauthorized -- rejects before any Directus call and before the response is shaped', async () => {
    let rejected = false
    try {
      await handler(fakeEvent('6', playerPrincipal('6')))
    } catch (error) {
      rejected = true
      expect((error as { statusCode: number }).statusCode).toBe(403)
      // The established structured-error shape carries no file list, ids, or counts.
      expect(JSON.stringify(error)).not.toMatch(/file-|filename|filesize/)
    }
    expect(rejected).toBe(true)
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})
