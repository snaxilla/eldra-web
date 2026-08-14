// Unit tests for Account search (server/utils/accounts.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §5.3/§6.1/§10.3 and this task's own SEARCH/SCOPE sections.
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

import { formatAccountDisplayName, searchAccounts } from '../../../server/utils/accounts'

beforeEach(() => {
  directusServiceRequestMock.mockReset()
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
  })

  it('searches by display name -- matches first_name/last_name', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([{ id: 'account-1', first_name: 'Bob', last_name: 'Smith', email: 'bob@example.com' }])
    )

    const results = await searchAccounts('Bob')

    expect(results).toEqual([{ accountId: 'account-1', displayName: 'Bob Smith' }])

    const [, options] = directusServiceRequestMock.mock.calls[0]
    expect(options.query.filter).toEqual({
      _or: [{ first_name: { _icontains: 'Bob' } }, { last_name: { _icontains: 'Bob' } }, { email: { _icontains: 'Bob' } }]
    })
  })

  it('searches by username-like text via email (no native username field exists)', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([{ id: 'account-2', first_name: '', last_name: '', email: 'bob@example.com' }]))

    const results = await searchAccounts('bob')

    expect(results).toEqual([{ accountId: 'account-2', displayName: 'bob@example.com' }])
  })

  it('never includes email (or any other field) in results -- only accountId and displayName', async () => {
    directusServiceRequestMock.mockResolvedValue(
      jsonResponse([{ id: 'account-1', first_name: 'Bob', last_name: 'Smith', email: 'bob@example.com', role: { id: 'admin' } }])
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

  it('returns an empty array when nothing matches', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    const results = await searchAccounts('nobody-matches-this')

    expect(results).toEqual([])
  })

  it('caps the result count', async () => {
    directusServiceRequestMock.mockResolvedValue(jsonResponse([]))

    await searchAccounts('a')

    const [, options] = directusServiceRequestMock.mock.calls[0]
    expect(options.query.limit).toBeGreaterThan(0)
    expect(options.query.limit).toBeLessThanOrEqual(20)
  })
})
