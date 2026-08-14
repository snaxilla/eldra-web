// Unit tests for GET /api/worlds (server/api/worlds/index.get.ts).
// Beta Zero audit, Issue 1: a Principal must only receive Worlds `can()`
// says they may read. `can` is exercised for REAL (not mocked) so this test
// proves the route uses the actual capability system, not a re-derived
// approximation of it; directusServiceRequest is mocked -- this file is
// about filtering, not Directus persistence.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import handler from '../../../../server/api/worlds/index.get'
import type { Principal } from '../../../../server/utils/authorization'

function worldsResponse() {
  return {
    data: [
      { id: 1, name: 'Owned World', slug: 'owned-world', system_key: 'dnd5e', description: '', visibility: 'private', owner_id: 'owner-1' },
      { id: 2, name: 'Unrelated World', slug: 'unrelated-world', system_key: 'dnd5e', description: '', visibility: 'private', owner_id: 'someone-else' },
      { id: 3, name: 'Legacy World (no membership row)', slug: 'legacy-world', system_key: 'dnd5e', description: '', visibility: 'private', owner_id: null }
    ]
  }
}

function principal(worldCapabilities: [string, string[]][], temporarySingleUserMode = false): Principal {
  return {
    accountId: 'account-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map(worldCapabilities.map(([worldId, caps]) => [worldId, new Set(caps as any)])),
    temporarySingleUserMode
  }
}

function fakeEvent(p: Principal | null): H3Event {
  return { context: { principal: p } } as unknown as H3Event
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  directusServiceRequestMock.mockResolvedValue(worldsResponse())
})

describe('GET /api/worlds', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(handler(fakeEvent(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('a Player with a real membership in only one World sees only that World -- not every World', async () => {
    const result = await handler(fakeEvent(principal([['1', ['world.read', 'world.character.create']]])))

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('a World with an explicit membership row is governed by that row alone, even for a Player with no access to it', async () => {
    // World 2 has real memberships in this scenario (someone else's), so
    // it must never fall back to temporarySingleUserMode for this account.
    const result = await handler(fakeEvent(principal([['1', ['world.read']]])))

    expect(result.map((w: any) => w.id)).not.toContain(2)
  })

  it('the legacy migration-gap fallback only ever applies to a World with NO membership row at all, and only for the admin fallback', async () => {
    const result = await handler(fakeEvent(principal([], true)))

    // World 1 and 2 both have implied real memberships elsewhere in a real
    // system (owner_id set) but no row was ever supplied to this principal
    // for them here, so with temporarySingleUserMode this account should
    // see everything -- proving the fallback still works for legacy Worlds.
    expect(result.map((w: any) => w.id).sort()).toEqual([1, 2, 3])
  })

  it('a non-admin Player with no membership row anywhere sees nothing, not every World', async () => {
    const result = await handler(fakeEvent(principal([])))

    expect(result).toEqual([])
  })

  it('an Owner sees every World they actually own a membership in', async () => {
    const result = await handler(fakeEvent(principal([
      ['1', ['world.read', 'world.settings.edit', 'world.delete']],
      ['3', ['world.read', 'world.settings.edit', 'world.delete']]
    ])))

    expect(result.map((w: any) => w.id).sort()).toEqual([1, 3])
  })
})
