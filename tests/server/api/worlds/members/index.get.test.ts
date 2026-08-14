// Unit tests for GET /api/worlds/:id/members (server/api/worlds/[id]/members/index.get.ts).
// requireCapability/can are exercised for REAL (not mocked); listMembersForWorld
// is mocked -- this file is about authorization + request handling, not
// Directus persistence (tests/server/utils/world-memberships.test.ts covers that).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { listMembersForWorldMock } = vi.hoisted(() => ({
  listMembersForWorldMock: vi.fn()
}))

vi.mock('../../../../../server/utils/world-memberships', () => ({
  listMembersForWorld: listMembersForWorldMock
}))

import handler from '../../../../../server/api/worlds/[id]/members/index.get'
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
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.character.create', 'world.character.edit_own', 'world.roll.execute'])]]),
    temporarySingleUserMode: false
  }
}

function fakeEvent(worldId: string, principal: Principal | null): H3Event {
  return {
    context: { principal, params: { id: worldId } }
  } as unknown as H3Event
}

beforeEach(() => {
  listMembersForWorldMock.mockReset()
})

describe('GET /api/worlds/:id/members', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(handler(fakeEvent('5', null))).rejects.toMatchObject({ statusCode: 401 })
    expect(listMembersForWorldMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a Player -- owner can manage members, player cannot', async () => {
    await expect(handler(fakeEvent('5', playerPrincipal('5')))).rejects.toMatchObject({ statusCode: 403 })
    expect(listMembersForWorldMock).not.toHaveBeenCalled()
  })

  it('succeeds for an Owner and returns the member list', async () => {
    listMembersForWorldMock.mockResolvedValue([{ id: 'm1', worldId: '5', accountId: 'owner-1', role: 'owner', displayName: 'Owen', createdAt: null }])

    const result = await handler(fakeEvent('5', ownerPrincipal('5')))

    expect(result).toEqual({ members: [{ id: 'm1', worldId: '5', accountId: 'owner-1', role: 'owner', displayName: 'Owen', createdAt: null }] })
    expect(listMembersForWorldMock).toHaveBeenCalledWith('5')
  })
})
