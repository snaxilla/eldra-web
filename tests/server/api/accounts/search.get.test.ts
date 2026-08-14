// Unit tests for GET /api/accounts/search (server/api/accounts/search.get.ts).
// searchAccounts is mocked -- this file is about the route's own
// authentication gate and query handling, not Directus search logic
// (tests/server/utils/accounts.test.ts covers that).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { searchAccountsMock } = vi.hoisted(() => ({
  searchAccountsMock: vi.fn()
}))

vi.mock('../../../../server/utils/accounts', () => ({
  searchAccounts: searchAccountsMock
}))

import handler from '../../../../server/api/accounts/search.get'
import type { Principal } from '../../../../server/utils/authorization'

function authenticatedPrincipal(accountId = 'account-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map(),
    temporarySingleUserMode: false
  }
}

// h3's getQuery(event) reads event.path (via ufo's getQuery), not
// event.node.req.url -- same convention already established in
// tests/server/middleware/authorize.test.ts's own fakeEvent.
function fakeEvent(query: Record<string, string>, principal: Principal | null): H3Event {
  const search = new URLSearchParams(query).toString()
  return {
    context: { principal },
    path: `/api/accounts/search${search ? `?${search}` : ''}`
  } as unknown as H3Event
}

beforeEach(() => {
  searchAccountsMock.mockReset()
})

describe('GET /api/accounts/search', () => {
  it('rejects an unauthenticated request with 401 -- search is never public', async () => {
    await expect(handler(fakeEvent({ q: 'Bob' }, null))).rejects.toMatchObject({ statusCode: 401 })
    expect(searchAccountsMock).not.toHaveBeenCalled()
  })

  it('succeeds for an authenticated user regardless of world/platform capability', async () => {
    searchAccountsMock.mockResolvedValue([{ accountId: 'account-2', displayName: 'Bob Smith' }])

    const result = await handler(fakeEvent({ q: 'Bob' }, authenticatedPrincipal()))

    expect(result).toEqual({ accounts: [{ accountId: 'account-2', displayName: 'Bob Smith' }] })
    expect(searchAccountsMock).toHaveBeenCalledWith('Bob')
  })

  it('passes an empty string through when q is missing, rather than throwing', async () => {
    searchAccountsMock.mockResolvedValue([])

    await handler(fakeEvent({}, authenticatedPrincipal()))

    expect(searchAccountsMock).toHaveBeenCalledWith('')
  })
})
