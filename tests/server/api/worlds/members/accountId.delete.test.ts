// Unit tests for DELETE /api/worlds/:id/members/:accountId
// (server/api/worlds/[id]/members/[accountId].delete.ts).
// requireCapability/can are exercised for REAL; removeMember is mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { removeMemberMock } = vi.hoisted(() => ({
  removeMemberMock: vi.fn()
}))

vi.mock('../../../../../server/utils/world-memberships', () => ({
  removeMember: removeMemberMock
}))

import handler from '../../../../../server/api/worlds/[id]/members/[accountId].delete'
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

function fakeEvent(worldId: string, accountId: string, principal: Principal | null): H3Event {
  return {
    context: { principal, params: { id: worldId, accountId } }
  } as unknown as H3Event
}

beforeEach(() => {
  removeMemberMock.mockReset()
})

describe('DELETE /api/worlds/:id/members/:accountId', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(handler(fakeEvent('5', 'account-2', null))).rejects.toMatchObject({ statusCode: 401 })
    expect(removeMemberMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a Player', async () => {
    await expect(handler(fakeEvent('5', 'account-2', playerPrincipal('5')))).rejects.toMatchObject({ statusCode: 403 })
    expect(removeMemberMock).not.toHaveBeenCalled()
  })

  it('succeeds for an Owner -- removal works', async () => {
    removeMemberMock.mockResolvedValue(undefined)

    const result = await handler(fakeEvent('5', 'account-2', ownerPrincipal('5')))

    expect(result).toEqual({ removed: true })
    expect(removeMemberMock).toHaveBeenCalledWith('5', 'account-2')
  })

  it('propagates a refusal to remove the owner', async () => {
    removeMemberMock.mockRejectedValue(Object.assign(new Error('cannot remove owner'), { statusCode: 400 }))

    await expect(handler(fakeEvent('5', 'account-owner', ownerPrincipal('5')))).rejects.toMatchObject({ statusCode: 400 })
  })
})
