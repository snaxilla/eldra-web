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

// `platformCapabilities` is now a parameter instead of the Phase 0
// `temporarySingleUserMode` flag: holding platform capabilities is no
// longer a World-scope fallback, so the two have to be expressible
// independently to test that they stay independent.
function principal(worldCapabilities: [string, string[]][], platformCapabilities: string[] = []): Principal {
  return {
    accountId: 'account-1',
    platformCapabilities: new Set(platformCapabilities as any),
    worldCapabilities: new Map(worldCapabilities.map(([worldId, caps]) => [worldId, new Set(caps as any)])),
    accountLookupKeys: ['account-1']
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
    const result = await handler(fakeEvent(principal([['1', ['world.read']]])))

    expect(result.map((w: any) => w.id)).not.toContain(2)
  })

  // PHASE 1 BEHAVIOR CHANGE. This test previously asserted the opposite:
  // that an account with temporarySingleUserMode saw every World,
  // including ones it held no membership in, as a migration-gap fallback.
  // That fallback was the implicit "Directus Administrator is a superuser
  // everywhere" grant, and it is gone. A platform administrator now sees
  // exactly the Worlds it holds a membership row in -- none, here -- which
  // is architecture doc §8.1's "Platform Admin must not be a world
  // superuser" with nothing left to undermine it.
  //
  // Worlds that genuinely predate world_memberships get a real owner row
  // from scripts/directus/bootstrap-eldra-platform-admin.mjs, not a
  // runtime bypass.
  it('a platform administrator with no membership rows sees no Worlds -- platform capability is not a World grant', async () => {
    const result = await handler(fakeEvent(principal([], [
      'platform.world.list',
      'platform.settings.manage'
    ])))

    expect(result).toEqual([])
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
