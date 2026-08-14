// Unit tests for POST /api/worlds/:id/members (server/api/worlds/[id]/members/index.post.ts).
// requireCapability/can are exercised for REAL; addMember is mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { addMemberMock } = vi.hoisted(() => ({
  addMemberMock: vi.fn()
}))

vi.mock('../../../../../server/utils/world-memberships', () => ({
  addMember: addMemberMock
}))

// h3's real readBody needs a live Node request stream this test has no
// interest in constructing -- same shim as tests/server/api/worlds/index.post.test.ts.
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

import handler from '../../../../../server/api/worlds/[id]/members/index.post'
import type { Principal } from '../../../../../server/utils/authorization'

function ownerPrincipal(worldId: string, accountId = 'owner-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([
      [worldId, new Set(['world.read', 'world.member.invite', 'world.member.assign_role', 'world.member.remove'])]
    ]),
    temporarySingleUserMode: false
  }
}

function playerPrincipal(worldId: string, accountId = 'player-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.roll.execute'])]]),
    temporarySingleUserMode: false
  }
}

function fakeEvent(worldId: string, principal: Principal | null, body: unknown): H3Event {
  return {
    context: { principal, params: { id: worldId } },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

beforeEach(() => {
  addMemberMock.mockReset()
})

describe('POST /api/worlds/:id/members', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(handler(fakeEvent('5', null, { accountId: 'account-2', role: 'player' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(addMemberMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a Player', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { accountId: 'account-2', role: 'player' }))
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(addMemberMock).not.toHaveBeenCalled()
  })

  it('rejects a missing accountId with 400', async () => {
    await expect(handler(fakeEvent('5', ownerPrincipal('5'), { role: 'player' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(addMemberMock).not.toHaveBeenCalled()
  })

  it('rejects an unassignable role with 400', async () => {
    await expect(
      handler(fakeEvent('5', ownerPrincipal('5'), { accountId: 'account-2', role: 'owner' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(addMemberMock).not.toHaveBeenCalled()
  })

  it('succeeds for an Owner adding a new member', async () => {
    addMemberMock.mockResolvedValue({ id: 'm2', worldId: '5', accountId: 'account-2', role: 'player', createdAt: null })

    const result = await handler(fakeEvent('5', ownerPrincipal('5'), { accountId: 'account-2', role: 'player' }))

    expect(result).toEqual({ membership: { id: 'm2', worldId: '5', accountId: 'account-2', role: 'player', createdAt: null } })
    expect(addMemberMock).toHaveBeenCalledWith('5', 'account-2', 'player')
  })

  it('propagates a duplicate-membership rejection from addMember', async () => {
    addMemberMock.mockRejectedValue(Object.assign(new Error('conflict'), { statusCode: 409 }))

    await expect(
      handler(fakeEvent('5', ownerPrincipal('5'), { accountId: 'account-2', role: 'player' }))
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})
