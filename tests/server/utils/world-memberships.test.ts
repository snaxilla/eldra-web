// Unit tests for World Membership persistence
// (server/utils/world-memberships.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §8.5, §10.1, §12 Phase 2.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports that do not
// exist under plain Vitest -- the established pattern in this repo (see
// tests/server/utils/rules-packages.test.ts) is to mock that module at the
// boundary rather than let it execute.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import {
  addMember,
  createOwnerMembership,
  listMembershipsForAccount,
  listMembersForWorld,
  removeMember,
  updateMemberRole
} from '../../../server/utils/world-memberships'

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

function jsonResponse(data: unknown) {
  return { data }
}

describe('createOwnerMembership', () => {
  it('creates a membership row with role owner for the given world and account', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([]) // no existing membership
      return jsonResponse({ id: 'membership-1', ...options.body })
    })

    const membership = await createOwnerMembership(5, 'account-1')

    expect(membership.role).toBe('owner')
    expect(membership.worldId).toBe('5')
    expect(membership.accountId).toBe('account-1')

    const postCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'POST')
    expect(postCall?.[1].body).toMatchObject({ world_id: 5, account_id: 'account-1', role: 'owner' })
  })

  it('checks for an existing membership before creating one', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([])
      return jsonResponse({ id: 'm1', ...options.body })
    })

    await createOwnerMembership(5, 'account-1')

    const getCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'GET')
    expect(getCall?.[0]).toBe('/items/world_memberships')
    expect(getCall?.[1].query.filter).toEqual({
      _and: [{ world_id: { _eq: 5 } }, { account_id: { _eq: 'account-1' } }]
    })
  })

  it('refuses to create a second membership for the same (world, account) pair', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([{ id: 'existing-membership' }])
      return jsonResponse({ id: 'should-not-be-created' })
    })

    await expect(createOwnerMembership(5, 'account-1')).rejects.toMatchObject({ statusCode: 409 })

    const postCalls = directusServiceRequestMock.mock.calls.filter(([, options]) => options.method === 'POST')
    expect(postCalls).toHaveLength(0)
  })
})

describe('listMembershipsForAccount', () => {
  it('returns every membership row for the account, normalized', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([
        { id: 'm1', world_id: 1, account_id: 'account-1', role: 'owner', created_at: '2026-01-01T00:00:00Z' },
        { id: 'm2', world_id: 2, account_id: 'account-1', role: 'player', created_at: '2026-01-02T00:00:00Z' }
      ])
    )

    const memberships = await listMembershipsForAccount('account-1')

    expect(memberships).toEqual([
      { id: 'm1', worldId: '1', accountId: 'account-1', role: 'owner', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'm2', worldId: '2', accountId: 'account-1', role: 'player', createdAt: '2026-01-02T00:00:00Z' }
    ])
  })

  it('filters by account_id', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    await listMembershipsForAccount('account-7')

    const [, options] = directusServiceRequestMock.mock.calls[0]
    expect(options.query.filter).toEqual({ account_id: { _eq: 'account-7' } })
  })

  it('returns an empty array when the account has no memberships', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    const memberships = await listMembershipsForAccount('account-lonely')

    expect(memberships).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Membership Administration -- list / add / change role / remove
// ---------------------------------------------------------------------------

describe('listMembersForWorld', () => {
  it('returns members with a display name resolved from Directus users', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (path === '/items/world_memberships') {
        return jsonResponse([
          { id: 'm1', world_id: 5, account_id: 'account-owner', role: 'owner', created_at: '2026-01-01T00:00:00Z' },
          { id: 'm2', world_id: 5, account_id: 'account-player', role: 'player', created_at: '2026-01-02T00:00:00Z' }
        ])
      }
      if (path === '/users') {
        return jsonResponse([
          { id: 'account-owner', email: 'owner@example.com', first_name: 'Owen', last_name: 'Owner' },
          { id: 'account-player', email: 'player@example.com', first_name: '', last_name: '' }
        ])
      }
      throw new Error(`unexpected path: ${path}`)
    })

    const members = await listMembersForWorld(5)

    expect(members).toEqual([
      { id: 'm1', worldId: '5', accountId: 'account-owner', role: 'owner', createdAt: '2026-01-01T00:00:00Z', displayName: 'Owen Owner' },
      { id: 'm2', worldId: '5', accountId: 'account-player', role: 'player', createdAt: '2026-01-02T00:00:00Z', displayName: 'player@example.com' }
    ])
  })

  it('falls back to the accountId when no display name can be resolved', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/world_memberships') {
        return jsonResponse([{ id: 'm1', world_id: 5, account_id: 'ghost-account', role: 'player', created_at: null }])
      }
      if (path === '/users') {
        return jsonResponse([]) // the Directus user no longer exists
      }
      throw new Error('unexpected path')
    })

    const members = await listMembersForWorld(5)

    expect(members[0].displayName).toBe('ghost-account')
  })

  it('does not call /users at all when the world has no members', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/world_memberships') return jsonResponse([])
      throw new Error(`unexpected call to ${path}`)
    })

    const members = await listMembersForWorld(5)

    expect(members).toEqual([])
  })

  it('filters by world_id', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/world_memberships') return jsonResponse([])
      return jsonResponse([])
    })

    await listMembersForWorld(42)

    const call = directusServiceRequestMock.mock.calls.find(([path]) => path === '/items/world_memberships')
    expect(call?.[1].query.filter).toEqual({ world_id: { _eq: 42 } })
  })
})

describe('addMember', () => {
  it('creates a membership with the given non-owner role', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([]) // no existing membership
      return jsonResponse({ id: 'm2', ...options.body })
    })

    const membership = await addMember(5, 'account-2', 'player')

    expect(membership.role).toBe('player')
    const postCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'POST')
    expect(postCall?.[1].body).toMatchObject({ world_id: 5, account_id: 'account-2', role: 'player' })
  })

  it('refuses to add a member with role owner', async () => {
    await expect(addMember(5, 'account-2', 'owner')).rejects.toMatchObject({ statusCode: 400 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('refuses a duplicate membership for the same (world, account) pair', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([{ id: 'existing' }])
      return jsonResponse({ id: 'should-not-be-created' })
    })

    await expect(addMember(5, 'account-2', 'player')).rejects.toMatchObject({ statusCode: 409 })

    const postCalls = directusServiceRequestMock.mock.calls.filter(([, options]) => options.method === 'POST')
    expect(postCalls).toHaveLength(0)
  })
})

describe('updateMemberRole', () => {
  it('changes an existing non-owner member to a new role, by primary key', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') {
        return jsonResponse([{ id: 'm2', world_id: 5, account_id: 'account-2', role: 'player', created_at: null }])
      }
      if (options.method === 'PATCH') {
        expect(path).toBe('/items/world_memberships/m2')
        return jsonResponse({ id: 'm2', world_id: 5, account_id: 'account-2', role: 'gm', created_at: null })
      }
      throw new Error('unexpected call')
    })

    const membership = await updateMemberRole(5, 'account-2', 'gm')

    expect(membership.role).toBe('gm')
  })

  it('refuses to assign role owner', async () => {
    await expect(updateMemberRole(5, 'account-2', 'owner')).rejects.toMatchObject({ statusCode: 400 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('refuses to change the role of the current owner', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') {
        return jsonResponse([{ id: 'm1', world_id: 5, account_id: 'account-owner', role: 'owner', created_at: null }])
      }
      throw new Error('should not PATCH the owner')
    })

    await expect(updateMemberRole(5, 'account-owner', 'player')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('404s when the account is not a member of the world', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    await expect(updateMemberRole(5, 'account-stranger', 'gm')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('removeMember', () => {
  it('removes an existing non-owner member, by primary key', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') {
        return jsonResponse([{ id: 'm2', world_id: 5, account_id: 'account-2', role: 'player', created_at: null }])
      }
      if (options.method === 'DELETE') {
        expect(path).toBe('/items/world_memberships/m2')
        return jsonResponse(null)
      }
      throw new Error('unexpected call')
    })

    await removeMember(5, 'account-2')

    const deleteCalls = directusServiceRequestMock.mock.calls.filter(([, options]) => options.method === 'DELETE')
    expect(deleteCalls).toHaveLength(1)
  })

  it('refuses to remove the owner', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') {
        return jsonResponse([{ id: 'm1', world_id: 5, account_id: 'account-owner', role: 'owner', created_at: null }])
      }
      throw new Error('should not DELETE the owner')
    })

    await expect(removeMember(5, 'account-owner')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('404s when the account is not a member of the world', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    await expect(removeMember(5, 'account-stranger')).rejects.toMatchObject({ statusCode: 404 })
  })
})
