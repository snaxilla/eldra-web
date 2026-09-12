// Unit tests for GET /api/worlds/:id/rolls
// (server/api/worlds/[id]/rolls/index.get.ts). Phase 1 of
// .github/docs/architecture/eldra-roll-system.md §14.
//
// requireCapability/can are exercised for REAL (not mocked) -- proving
// this route uses the actual capability system for both world.read (the
// baseline gate) and world.roll.see_gm (which controls what
// listRollEvents is told to reveal), matching
// tests/server/api/worlds/index.get.test.ts's own precedent. listRollEvents
// itself is mocked -- this file is about query parsing and capability
// resolution, not persistence/visibility filtering
// (tests/server/utils/roll-events.test.ts covers that).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { listRollEventsMock } = vi.hoisted(() => ({
  listRollEventsMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/roll-events', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../server/utils/roll-events')>(
    '../../../../../../server/utils/roll-events'
  )
  return {
    ...actual,
    listRollEvents: listRollEventsMock
  }
})

import handler from '../../../../../../server/api/worlds/[id]/rolls/index.get'
import type { Principal } from '../../../../../../server/utils/authorization'

function playerPrincipal(worldId: string, accountId = 'account-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.roll.execute'])]]),
    temporarySingleUserMode: false
  }
}

function gmPrincipal(worldId: string, accountId = 'gm-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.roll.execute', 'world.roll.see_gm'])]]),
    temporarySingleUserMode: false
  }
}

// h3's getQuery(event) reads event.path (via ufo's getQuery) -- same
// convention already established in tests/server/api/accounts/search.get.test.ts.
function fakeEvent(worldId: string, principal: Principal | null, query: Record<string, string> = {}): H3Event {
  const search = new URLSearchParams(query).toString()
  return {
    context: { principal, params: { id: worldId } },
    path: `/api/worlds/${worldId}/rolls${search ? `?${search}` : ''}`
  } as unknown as H3Event
}

beforeEach(() => {
  listRollEventsMock.mockReset()
  listRollEventsMock.mockResolvedValue({ rolls: [], nextCursor: null })
})

describe('GET /api/worlds/:id/rolls', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(handler(fakeEvent('5', null))).rejects.toMatchObject({ statusCode: 401 })
    expect(listRollEventsMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a Principal lacking world.read', async () => {
    const noAccess: Principal = {
      accountId: 'outsider',
      platformCapabilities: new Set(),
      worldCapabilities: new Map([['5', new Set([])]]),
      temporarySingleUserMode: false
    }

    await expect(handler(fakeEvent('5', noAccess))).rejects.toMatchObject({ statusCode: 403 })
    expect(listRollEventsMock).not.toHaveBeenCalled()
  })

  it('resolves canSeeGm to false for an ordinary Player', async () => {
    await handler(fakeEvent('5', playerPrincipal('5')))

    expect(listRollEventsMock).toHaveBeenCalledWith(expect.objectContaining({ canSeeGm: false, requesterAccountId: 'account-1' }))
  })

  it('resolves canSeeGm to true for a GM', async () => {
    await handler(fakeEvent('5', gmPrincipal('5')))

    expect(listRollEventsMock).toHaveBeenCalledWith(expect.objectContaining({ canSeeGm: true }))
  })

  it('passes encounterId, actorCharacterId, and cursor through from the query string', async () => {
    await handler(
      fakeEvent('5', playerPrincipal('5'), {
        encounterId: '9',
        actorCharacterId: '42',
        cursor: 'abc123'
      })
    )

    expect(listRollEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({ encounterId: '9', actorCharacterId: '42', cursor: 'abc123' })
    )
  })

  it('omits encounterId/actorCharacterId/cursor as null when absent from the query', async () => {
    await handler(fakeEvent('5', playerPrincipal('5')))

    expect(listRollEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({ encounterId: null, actorCharacterId: null, cursor: null })
    )
  })

  it('parses a valid limit and clamps an out-of-range one', async () => {
    await handler(fakeEvent('5', playerPrincipal('5'), { limit: '10' }))
    expect(listRollEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10 }))

    await handler(fakeEvent('5', playerPrincipal('5'), { limit: '999999' }))
    expect(listRollEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 200 }))
  })

  it('ignores a non-numeric limit rather than passing it through verbatim', async () => {
    await handler(fakeEvent('5', playerPrincipal('5'), { limit: 'not-a-number' }))
    expect(listRollEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: undefined }))
  })

  it('returns exactly what listRollEvents produced -- rolls and nextCursor, unmodified', async () => {
    listRollEventsMock.mockResolvedValue({
      rolls: [{ id: 'roll-1', total: 12 }],
      nextCursor: 'next-page-cursor'
    })

    const result = await handler(fakeEvent('5', playerPrincipal('5')))

    expect(result).toEqual({ rolls: [{ id: 'roll-1', total: 12 }], nextCursor: 'next-page-cursor' })
  })
})
