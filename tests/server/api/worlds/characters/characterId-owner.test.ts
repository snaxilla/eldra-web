// Route tests for GET/PUT/DELETE /api/worlds/:id/characters/:characterId/owner.
// Thin by design (parse params -> requireCapability -> call
// server/utils/character-ownership.ts -> return); these tests cover
// routing/authorization, not the ownership rules themselves (covered in
// tests/server/utils/character-ownership.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const {
  getCharacterOwnershipMock,
  listOwnershipHistoryMock,
  assignCharacterOwnerMock,
  unassignCharacterOwnerMock,
  resolveAccountDisplayNamesMock
} = vi.hoisted(() => ({
  getCharacterOwnershipMock: vi.fn(),
  listOwnershipHistoryMock: vi.fn(),
  assignCharacterOwnerMock: vi.fn(),
  unassignCharacterOwnerMock: vi.fn(),
  resolveAccountDisplayNamesMock: vi.fn()
}))

vi.mock('../../../../../server/utils/character-ownership', () => ({
  getCharacterOwnership: getCharacterOwnershipMock,
  listOwnershipHistory: listOwnershipHistoryMock,
  assignCharacterOwner: assignCharacterOwnerMock,
  unassignCharacterOwner: unassignCharacterOwnerMock
}))

vi.mock('../../../../../server/utils/eldra-accounts', () => ({
  resolveAccountDisplayNames: resolveAccountDisplayNamesMock
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

import getHandler from '../../../../../server/api/worlds/[id]/characters/[characterId]/owner.get'
import putHandler from '../../../../../server/api/worlds/[id]/characters/[characterId]/owner.put'
import deleteHandler from '../../../../../server/api/worlds/[id]/characters/[characterId]/owner.delete'
import type { Principal } from '../../../../../server/utils/authorization'

function platformAdminPrincipal(): Principal {
  return {
    accountId: 'eldra-account-admin',
    platformCapabilities: new Set(['platform.character.manage']) as any,
    worldCapabilities: new Map(),
    accountLookupKeys: ['eldra-account-admin']
  }
}

function playerPrincipal(): Principal {
  return {
    accountId: 'eldra-account-player',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([['4', new Set(['world.read', 'world.character.edit_own']) as any]]),
    accountLookupKeys: ['eldra-account-player']
  }
}

function fakeEvent(principal: Principal | null, body: unknown = {}): H3Event {
  return {
    context: { principal, params: { id: '4', characterId: '1645' } },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

beforeEach(() => {
  getCharacterOwnershipMock.mockReset()
  listOwnershipHistoryMock.mockReset()
  assignCharacterOwnerMock.mockReset()
  unassignCharacterOwnerMock.mockReset()
  resolveAccountDisplayNamesMock.mockReset()
  resolveAccountDisplayNamesMock.mockResolvedValue(new Map())
})

describe('GET owner', () => {
  it('401s with no principal', async () => {
    await expect(getHandler(fakeEvent(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('403s for a principal without platform.character.manage -- an ordinary Player cannot read ownership', async () => {
    await expect(getHandler(fakeEvent(playerPrincipal()))).rejects.toMatchObject({ statusCode: 403 })
    expect(getCharacterOwnershipMock).not.toHaveBeenCalled()
  })

  it('returns ownership + history for a Platform Admin', async () => {
    getCharacterOwnershipMock.mockResolvedValue({ entityId: '1645', worldId: '4', entityType: 'pc', title: 'Borc', ownerAccountId: null })
    listOwnershipHistoryMock.mockResolvedValue([])

    const result = await getHandler(fakeEvent(platformAdminPrincipal()))

    expect(result.ownership.ownerAccountId).toBeNull()
    expect(getCharacterOwnershipMock).toHaveBeenCalledWith('4', '1645')
  })

  it('resolves and attaches display names for the owner and every history participant', async () => {
    getCharacterOwnershipMock.mockResolvedValue({
      entityId: '1645', worldId: '4', entityType: 'pc', title: 'Borc', ownerAccountId: 'account-bob'
    })
    listOwnershipHistoryMock.mockResolvedValue([
      {
        id: 'c1', worldId: '4', entityId: '1645',
        previousOwnerAccountId: null, newOwnerAccountId: 'account-bob',
        actorAccountId: 'account-admin', changedAt: '2026-01-01T00:00:00Z'
      }
    ])
    resolveAccountDisplayNamesMock.mockResolvedValue(
      new Map([['account-bob', 'Bob Smith'], ['account-admin', 'Admin User']])
    )

    const result = await getHandler(fakeEvent(platformAdminPrincipal()))

    expect(result.ownership.ownerDisplayName).toBe('Bob Smith')
    expect(result.history[0].newOwnerDisplayName).toBe('Bob Smith')
    expect(result.history[0].previousOwnerDisplayName).toBeNull()
    expect(result.history[0].actorDisplayName).toBe('Admin User')
    expect(resolveAccountDisplayNamesMock).toHaveBeenCalledWith(
      expect.arrayContaining(['account-bob', 'account-admin'])
    )
  })

  it('an Unassigned character with no history resolves no ids at all', async () => {
    getCharacterOwnershipMock.mockResolvedValue({ entityId: '1645', worldId: '4', entityType: 'pc', title: 'Borc', ownerAccountId: null })
    listOwnershipHistoryMock.mockResolvedValue([])

    const result = await getHandler(fakeEvent(platformAdminPrincipal()))

    expect(result.ownership.ownerDisplayName).toBeNull()
    expect(resolveAccountDisplayNamesMock).toHaveBeenCalledWith([])
  })
})

describe('PUT owner', () => {
  it('401s with no principal', async () => {
    await expect(putHandler(fakeEvent(null, { accountId: 'x' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  // THE CORE AUTHORIZATION REQUIREMENT: an ordinary Player -- even one
  // with world.character.edit_own in this exact World -- cannot reassign
  // ownership. Only platform.character.manage does.
  it('403s for an ordinary Player, even one holding world.character.edit_own in this World', async () => {
    await expect(putHandler(fakeEvent(playerPrincipal(), { accountId: 'eldra-account-x' }))).rejects.toMatchObject({
      statusCode: 403
    })
    expect(assignCharacterOwnerMock).not.toHaveBeenCalled()
  })

  it('400s when accountId is missing', async () => {
    await expect(putHandler(fakeEvent(platformAdminPrincipal(), {}))).rejects.toMatchObject({ statusCode: 400 })
    expect(assignCharacterOwnerMock).not.toHaveBeenCalled()
  })

  it('assigns, passing the PRINCIPAL\'s own accountId as the actor', async () => {
    assignCharacterOwnerMock.mockResolvedValue({ changed: true, ownership: { ownerAccountId: 'eldra-account-x' } })

    await putHandler(fakeEvent(platformAdminPrincipal(), { accountId: 'eldra-account-x' }))

    expect(assignCharacterOwnerMock).toHaveBeenCalledWith('4', '1645', 'eldra-account-x', 'eldra-account-admin')
  })
})

describe('DELETE owner (unassign)', () => {
  it('401s with no principal', async () => {
    await expect(deleteHandler(fakeEvent(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('403s for an ordinary Player', async () => {
    await expect(deleteHandler(fakeEvent(playerPrincipal()))).rejects.toMatchObject({ statusCode: 403 })
    expect(unassignCharacterOwnerMock).not.toHaveBeenCalled()
  })

  it('unassigns, passing the principal accountId as the actor', async () => {
    unassignCharacterOwnerMock.mockResolvedValue({ changed: true, ownership: { ownerAccountId: null } })

    await deleteHandler(fakeEvent(platformAdminPrincipal()))

    expect(unassignCharacterOwnerMock).toHaveBeenCalledWith('4', '1645', 'eldra-account-admin')
  })
})
