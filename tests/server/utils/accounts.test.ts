// Unit tests for Account search (server/utils/accounts.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §5.3/§6.1/§10.3, §12 Phase 1, and this task's own SEARCH/SCOPE sections.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports that do not
// exist under plain Vitest -- the established pattern in this repo (see
// tests/server/utils/rules-packages.test.ts) is to mock that module at the
// boundary rather than let it execute. server/utils/eldra-accounts.ts is
// mocked at its own boundary for the same reason, and because what is
// under test here is "does search resolve through it correctly," not
// eldra-accounts.ts's own identity rules (covered by its own test file).

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock, resolveAccountsForIdentitiesMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  resolveAccountsForIdentitiesMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../server/utils/eldra-accounts', () => ({
  resolveAccountsForIdentities: resolveAccountsForIdentitiesMock
}))

import { formatAccountDisplayName, searchAccounts } from '../../../server/utils/accounts'

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  resolveAccountsForIdentitiesMock.mockReset()
})

function jsonResponse(data: unknown) {
  return { data }
}

describe('formatAccountDisplayName', () => {
  it('prefers first + last name', () => {
    expect(formatAccountDisplayName({ id: '1', first_name: 'Bob', last_name: 'Smith', email: 'bob@example.com' })).toBe('Bob Smith')
  })

  it('falls back to email when no name is set', () => {
    expect(formatAccountDisplayName({ id: '1', first_name: '', last_name: '', email: 'bob@example.com' })).toBe('bob@example.com')
  })

  it('falls back to the raw id when neither name nor email exist', () => {
    expect(formatAccountDisplayName({ id: 'account-1' })).toBe('account-1')
  })
})

describe('searchAccounts', () => {
  it('returns an empty array for a blank query -- never searches on nothing', async () => {
    const results = await searchAccounts('   ')

    expect(results).toEqual([])
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
    expect(resolveAccountsForIdentitiesMock).not.toHaveBeenCalled()
  })

  it('searches the Directus directory by display name -- matches first_name/last_name', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([{ id: 'directus-user-1', first_name: 'Bob', last_name: 'Smith', email: 'bob@example.com' }])
    )
    resolveAccountsForIdentitiesMock.mockResolvedValue(
      new Map([['directus-user-1', { id: 'eldra-account-1', displayName: 'Bob Smith', status: 'active' }]])
    )

    const results = await searchAccounts('Bob')

    const [, options] = directusServiceRequestMock.mock.calls[0]
    expect(options.query.filter).toEqual({
      _or: [{ first_name: { _icontains: 'Bob' } }, { last_name: { _icontains: 'Bob' } }, { email: { _icontains: 'Bob' } }]
    })
    expect(results).toEqual([{ accountId: 'eldra-account-1', displayName: 'Bob Smith' }])
  })

  // THE PHASE 1 FIX. Before this, accountId WAS the Directus user id --
  // searchAccounts never resolved anything beyond the directory row. These
  // two pin that an Eldra Account id -- a different value from the
  // Directus id that found it -- is what actually crosses the boundary.
  it('returns the ELDRA Account id, never the Directus user id', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([{ id: 'directus-user-1', first_name: 'Bob', last_name: 'Smith', email: 'bob@example.com' }])
    )
    resolveAccountsForIdentitiesMock.mockResolvedValue(
      new Map([['directus-user-1', { id: 'eldra-account-1', displayName: 'Bob Smith', status: 'active' }]])
    )

    const results = await searchAccounts('Bob')

    expect(results[0].accountId).toBe('eldra-account-1')
    expect(results[0].accountId).not.toBe('directus-user-1')
  })

  it('resolves identity by (provider, provider_subject) through the Account layer -- never re-matches by name/email', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([{ id: 'directus-user-1', first_name: 'Bob', last_name: 'Smith', email: 'bob@example.com' }])
    )
    resolveAccountsForIdentitiesMock.mockResolvedValue(
      new Map([['directus-user-1', { id: 'eldra-account-1', displayName: 'Bob Smith', status: 'active' }]])
    )

    await searchAccounts('Bob')

    expect(resolveAccountsForIdentitiesMock).toHaveBeenCalledWith('directus', [
      { providerSubject: 'directus-user-1', displayName: 'Bob Smith' }
    ])
  })

  // Two different Directus users sharing a display name must never collapse
  // into one search result -- each keeps its own Eldra Account id.
  it('two distinct Directus users with the same display name resolve to two distinct Eldra Accounts', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([
        { id: 'directus-user-1', first_name: 'Bob', last_name: 'Smith', email: 'bob1@example.com' },
        { id: 'directus-user-2', first_name: 'Bob', last_name: 'Smith', email: 'bob2@example.com' }
      ])
    )
    resolveAccountsForIdentitiesMock.mockResolvedValue(
      new Map([
        ['directus-user-1', { id: 'eldra-account-1', displayName: 'Bob Smith', status: 'active' }],
        ['directus-user-2', { id: 'eldra-account-2', displayName: 'Bob Smith', status: 'active' }]
      ])
    )

    const results = await searchAccounts('Bob')

    expect(results.map((r) => r.accountId).sort()).toEqual(['eldra-account-1', 'eldra-account-2'])
  })

  it('a Directus user who has never authenticated is still found -- lazily provisioned by the resolve step, not skipped', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([{ id: 'brand-new-player', first_name: 'New', last_name: 'Player', email: 'newplayer@players.eldra.app' }])
    )
    resolveAccountsForIdentitiesMock.mockResolvedValue(
      new Map([['brand-new-player', { id: 'eldra-account-fresh', displayName: 'New Player', status: 'active' }]])
    )

    const results = await searchAccounts('New Player')

    expect(results).toEqual([{ accountId: 'eldra-account-fresh', displayName: 'New Player' }])
  })

  it('never includes email (or any other field) in results -- only accountId and displayName', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([{ id: 'directus-user-1', first_name: 'Bob', last_name: 'Smith', email: 'bob@example.com', role: { id: 'admin' } }])
    )
    resolveAccountsForIdentitiesMock.mockResolvedValue(
      new Map([['directus-user-1', { id: 'eldra-account-1', displayName: 'Bob Smith', status: 'active' }]])
    )

    const results = await searchAccounts('Bob')

    expect(Object.keys(results[0])).toEqual(['accountId', 'displayName'])
    expect(JSON.stringify(results)).not.toContain('bob@example.com')
    expect(JSON.stringify(results)).not.toContain('role')
  })

  it('requests only the minimum fields needed, never the full user record', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    await searchAccounts('Bob')

    const [path, options] = directusServiceRequestMock.mock.calls[0]
    expect(path).toBe('/users')
    expect(options.query.fields).toBe('id,first_name,last_name,email')
  })

  it('returns an empty array when nothing matches, without resolving anything', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    const results = await searchAccounts('nobody-matches-this')

    expect(results).toEqual([])
    expect(resolveAccountsForIdentitiesMock).not.toHaveBeenCalled()
  })

  it('caps the result count', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    await searchAccounts('a')

    const [, options] = directusServiceRequestMock.mock.calls[0]
    expect(options.query.limit).toBeGreaterThan(0)
    expect(options.query.limit).toBeLessThanOrEqual(20)
  })
})
