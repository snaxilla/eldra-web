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

import { createOwnerMembership, listMembershipsForAccount } from '../../../server/utils/world-memberships'

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
