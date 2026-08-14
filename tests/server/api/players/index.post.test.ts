// Unit tests for POST /api/players (server/api/players/index.post.ts).
// createPlayer is mocked -- this file is about authorization + request
// handling (matching server/api/accounts/search.get.ts's own precedent:
// authenticated-only, no specific capability), not Directus persistence,
// which tests/server/utils/players.test.ts already covers.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { createPlayerMock } = vi.hoisted(() => ({
  createPlayerMock: vi.fn()
}))

vi.mock('../../../../server/utils/players', () => ({
  createPlayer: createPlayerMock
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

import handler from '../../../../server/api/players/index.post'
import type { Principal } from '../../../../server/utils/authorization'

function authenticatedPrincipal(accountId = 'admin-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map(),
    temporarySingleUserMode: true
  }
}

function fakeEvent(body: unknown, principal: Principal | null): H3Event {
  return {
    context: { principal },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

beforeEach(() => {
  createPlayerMock.mockReset()
})

describe('POST /api/players', () => {
  it('fails with 401 when no principal is present -- creating Players must require authentication', async () => {
    await expect(
      handler(fakeEvent({ displayName: 'V', username: 'validname', password: 'longenough1', passwordConfirmation: 'longenough1' }, null))
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(createPlayerMock).not.toHaveBeenCalled()
  })

  it('rejects a password/confirmation mismatch with 400, before ever calling createPlayer', async () => {
    await expect(
      handler(
        fakeEvent(
          { displayName: 'V', username: 'validname', password: 'longenough1', passwordConfirmation: 'different1' },
          authenticatedPrincipal()
        )
      )
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createPlayerMock).not.toHaveBeenCalled()
  })

  it('succeeds for an authenticated caller and returns the new Player', async () => {
    createPlayerMock.mockResolvedValue({ accountId: 'account-1', displayName: 'V' })

    const result = await handler(
      fakeEvent(
        { displayName: 'V', username: 'validname', password: 'longenough1', passwordConfirmation: 'longenough1' },
        authenticatedPrincipal()
      )
    )

    expect(result).toEqual({ player: { accountId: 'account-1', displayName: 'V' } })
    expect(createPlayerMock).toHaveBeenCalledWith({ displayName: 'V', username: 'validname', password: 'longenough1' })
  })

  it('propagates a duplicate-username rejection from createPlayer', async () => {
    createPlayerMock.mockRejectedValue(Object.assign(new Error('taken'), { statusCode: 409 }))

    await expect(
      handler(
        fakeEvent(
          { displayName: 'V', username: 'taken', password: 'longenough1', passwordConfirmation: 'longenough1' },
          authenticatedPrincipal()
        )
      )
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('propagates a validation rejection from createPlayer (e.g. invalid username)', async () => {
    createPlayerMock.mockRejectedValue(Object.assign(new Error('bad username'), { statusCode: 400 }))

    await expect(
      handler(
        fakeEvent(
          { displayName: 'V', username: 'x', password: 'longenough1', passwordConfirmation: 'longenough1' },
          authenticatedPrincipal()
        )
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
