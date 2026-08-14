// Integration tests across the Player Directory workflow: Create Player ->
// (immediately) searchable -> (immediately) addable to a World. See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §5.3/§6.1/§10.3 and this task's own OBJECTIVE
// ("Create Player -> Add Player to World, without exposing Directus") and
// TESTING section ("Player immediately searchable", "Player immediately
// addable to a World").
//
// server/utils/players.ts, server/utils/accounts.ts, and
// server/utils/world-memberships.ts each have their own dedicated unit
// tests (tests/server/utils/players.test.ts,
// tests/server/utils/world-memberships.test.ts). This file exists
// specifically to prove the THREE compose correctly end-to-end against a
// single shared fake Directus backing store: createPlayer's write and
// searchAccounts'/addMember's reads all go through the SAME mocked
// directusServiceRequest with no caching layer anywhere in between, which
// is the actual code-level guarantee behind "no page refresh should be
// required" -- there is nothing that COULD go stale.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { createPlayer } from '../../../server/utils/players'
import { searchAccounts } from '../../../server/utils/accounts'
import { addMember } from '../../../server/utils/world-memberships'

// A minimal fake Directus, shared by every test below: an in-memory
// `directus_users` table and an in-memory `world_memberships` table,
// dispatched on collection path the same way the real API is addressed by
// path. This is what lets one createPlayer() write be observed by a LATER,
// independent searchAccounts() or addMember() call, exactly as two
// separate real HTTP requests against the same Directus instance would.
function createFakeDirectus() {
  const users: any[] = []
  const memberships: any[] = []
  let nextUserId = 1
  let nextMembershipId = 1

  async function handle(path: string, options: any) {
    const method = options?.method ?? 'GET'

    if (path === '/users' && method === 'POST') {
      const row = { id: `user-${nextUserId++}`, ...options.body }
      users.push(row)
      return { data: row }
    }

    if (path === '/users' && method === 'GET') {
      const filter = options?.query?.filter
      let results = users
      if (filter?.id?._in) {
        results = users.filter((u) => filter.id._in.includes(u.id))
      } else if (filter?.email?._eq) {
        results = users.filter((u) => u.email === filter.email._eq)
      } else if (filter?._or) {
        const q = filter._or[0]?.first_name?._icontains ?? ''
        results = users.filter(
          (u) =>
            String(u.first_name ?? '').toLowerCase().includes(q.toLowerCase()) ||
            String(u.last_name ?? '').toLowerCase().includes(q.toLowerCase()) ||
            String(u.email ?? '').toLowerCase().includes(q.toLowerCase())
        )
      }
      return { data: results }
    }

    if (path === '/items/world_memberships' && method === 'GET') {
      const filter = options?.query?.filter
      let results = memberships
      if (filter?._and) {
        const worldId = filter._and[0]?.world_id?._eq
        const accountId = filter._and[1]?.account_id?._eq
        results = memberships.filter((m) => m.world_id === worldId && m.account_id === accountId)
      }
      return { data: results }
    }

    if (path === '/items/world_memberships' && method === 'POST') {
      const row = { id: `membership-${nextMembershipId++}`, ...options.body }
      memberships.push(row)
      return { data: row }
    }

    throw new Error(`fake Directus: unhandled ${method} ${path}`)
  }

  return { handle, users, memberships }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('Player Directory workflow', () => {
  it('a newly created Player is immediately searchable, with no refresh or caching involved', async () => {
    const fake = createFakeDirectus()
    directusServiceRequestMock.mockImplementation(fake.handle)

    const player = await createPlayer({ displayName: 'Johnny Silverhand', username: 'silverhand', password: 'longenough1' })

    // A completely independent, later call -- exactly what the Members
    // panel's search box issues -- finds the just-created Player.
    const results = await searchAccounts('silverhand')

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(player)
  })

  it('a newly created Player is immediately addable to a World, using exactly the id createPlayer returned', async () => {
    const fake = createFakeDirectus()
    directusServiceRequestMock.mockImplementation(fake.handle)

    const player = await createPlayer({ displayName: 'Rogue', username: 'rogue1', password: 'longenough1' })

    const membership = await addMember(7, player.accountId, 'player')

    expect(membership.accountId).toBe(player.accountId)
    expect(membership.worldId).toBe('7')
    expect(membership.role).toBe('player')
  })

  it('two Players created back-to-back are both independently searchable and addable', async () => {
    const fake = createFakeDirectus()
    directusServiceRequestMock.mockImplementation(fake.handle)

    const first = await createPlayer({ displayName: 'Alt Cunningham', username: 'alt', password: 'longenough1' })
    const second = await createPlayer({ displayName: 'Jackie Welles', username: 'jackie', password: 'longenough1' })

    expect((await searchAccounts('alt'))[0].accountId).toBe(first.accountId)
    expect((await searchAccounts('jackie'))[0].accountId).toBe(second.accountId)

    await addMember(1, first.accountId, 'player')
    await addMember(1, second.accountId, 'gm')

    expect(fake.memberships).toHaveLength(2)
  })
})
