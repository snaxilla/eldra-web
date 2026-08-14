// Unit tests for PATCH /api/worlds/:id/members/:accountId
// (server/api/worlds/[id]/members/[accountId].patch.ts).
// requireCapability/can are exercised for REAL; updateMemberRole is mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { updateMemberRoleMock } = vi.hoisted(() => ({
  updateMemberRoleMock: vi.fn()
}))

vi.mock('../../../../../server/utils/world-memberships', () => ({
  updateMemberRole: updateMemberRoleMock
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

import handler from '../../../../../server/api/worlds/[id]/members/[accountId].patch'
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

function fakeEvent(worldId: string, accountId: string, principal: Principal | null, body: unknown): H3Event {
  return {
    context: { principal, params: { id: worldId, accountId } },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

beforeEach(() => {
  updateMemberRoleMock.mockReset()
})

describe('PATCH /api/worlds/:id/members/:accountId', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(handler(fakeEvent('5', 'account-2', null, { role: 'gm' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(updateMemberRoleMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a Player', async () => {
    await expect(handler(fakeEvent('5', 'account-2', playerPrincipal('5'), { role: 'gm' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(updateMemberRoleMock).not.toHaveBeenCalled()
  })

  it('rejects an unassignable role with 400', async () => {
    await expect(handler(fakeEvent('5', 'account-2', ownerPrincipal('5'), { role: 'owner' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(updateMemberRoleMock).not.toHaveBeenCalled()
  })

  it('succeeds for an Owner changing a role -- role change works', async () => {
    updateMemberRoleMock.mockResolvedValue({ id: 'm2', worldId: '5', accountId: 'account-2', role: 'gm', createdAt: null })

    const result = await handler(fakeEvent('5', 'account-2', ownerPrincipal('5'), { role: 'gm' }))

    expect(result).toEqual({ membership: { id: 'm2', worldId: '5', accountId: 'account-2', role: 'gm', createdAt: null } })
    expect(updateMemberRoleMock).toHaveBeenCalledWith('5', 'account-2', 'gm')
  })
})
