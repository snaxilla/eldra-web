// Unit tests for server/utils/roll-realtime-bridge.ts -- Eldra Roll
// System Phase 2D (.github/docs/architecture/eldra-roll-system.md §10).
//
// Pure, synchronous, in-memory logic -- no Directus, no h3, no real
// network -- so this is exercised directly, the same way this repo would
// test inventory-transfer-realtime-bridge.ts if that file had a test file
// (it does not; this module's own visibility-sensitive rule is exactly
// the part worth proving here that a structural mirror alone would not
// catch).

import { beforeEach, describe, expect, it } from 'vitest'
import {
  broadcastRollEvent,
  registerRollRealtimeClient,
  rollRealtimeBridgeStatus
} from '../../../server/utils/roll-realtime-bridge'
import type { RollEventRecord } from '../../../app/lib/rolls/types'

function roll(overrides: Partial<RollEventRecord> = {}): RollEventRecord {
  return {
    id: 'roll-1',
    worldId: '5',
    encounterId: null,
    actorCharacterId: null,
    rollerUserId: 'roller-account',
    rollerDisplayName: 'Roller',
    label: 'Stealth Check',
    sourceType: 'skill',
    sourceKey: 'value:skill.stealth.bonus',
    sourceId: null,
    expression: '1d20',
    dice: [],
    modifier: 0,
    modifiers: [],
    total: 14,
    visibility: 'table',
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...overrides
  }
}

// The bridge's own state lives on `globalThis`, matching
// inventory-transfer-realtime-bridge.ts's exact "survive HMR/module
// re-evaluation" convention -- there is no reset export, so each test
// registers its own clients and unregisters them in its own cleanup
// (`afterEach`-style, inline) rather than relying on isolation between
// tests. This mirrors how a real deployment behaves: clients accumulate
// and are removed only by their own unregister call, never by a global
// reset.
function registerAndTrack(input: Parameters<typeof registerRollRealtimeClient>[0]) {
  const sends: any[] = []
  const unregister = registerRollRealtimeClient({
    ...input,
    send: (payload) => sends.push(payload)
  })
  return { sends, unregister }
}

describe('roll-realtime-bridge', () => {
  let cleanups: Array<() => void> = []

  beforeEach(() => {
    // Ensure a clean slate between tests despite the module-global Map --
    // unregister everything this test file itself registered so far.
    for (const cleanup of cleanups) cleanup()
    cleanups = []
  })

  function register(input: Parameters<typeof registerRollRealtimeClient>[0]) {
    const result = registerAndTrack(input)
    cleanups.push(result.unregister)
    return result
  }

  it('delivers a table roll to every connected client viewing that World', () => {
    const alice = register({ worldId: '5', requesterAccountId: 'alice', canSeeGm: false, send: () => {} })
    const bob = register({ worldId: '5', requesterAccountId: 'bob', canSeeGm: false, send: () => {} })

    broadcastRollEvent(roll({ visibility: 'table' }))

    expect(alice.sends).toHaveLength(1)
    expect(bob.sends).toHaveLength(1)
    expect(alice.sends[0]).toMatchObject({ type: 'roll-event', transport: 'eldra-local-sse' })
    expect(alice.sends[0].roll.id).toBe('roll-1')
  })

  it('isolates a private roll to its own roller only, never an unrelated connected client', () => {
    const roller = register({ worldId: '5', requesterAccountId: 'roller-account', canSeeGm: false, send: () => {} })
    const observer = register({ worldId: '5', requesterAccountId: 'someone-else', canSeeGm: false, send: () => {} })

    broadcastRollEvent(roll({ visibility: 'private', rollerUserId: 'roller-account' }))

    expect(roller.sends).toHaveLength(1)
    expect(observer.sends).toHaveLength(0)
  })

  it('still delivers a private roll to a client holding world.roll.see_gm, even when they are not the roller', () => {
    const gm = register({ worldId: '5', requesterAccountId: 'gm-account', canSeeGm: true, send: () => {} })

    broadcastRollEvent(roll({ visibility: 'private', rollerUserId: 'roller-account' }))

    expect(gm.sends).toHaveLength(1)
  })

  it('never delivers a roll to a client connected to a different World, table or not', () => {
    const otherWorld = register({ worldId: '9', requesterAccountId: 'anyone', canSeeGm: true, send: () => {} })

    broadcastRollEvent(roll({ worldId: '5', visibility: 'table' }))

    expect(otherWorld.sends).toHaveLength(0)
  })

  it('reaches multiple connected clients for the same World with one broadcast call', () => {
    const clients = [
      register({ worldId: '5', requesterAccountId: 'a', canSeeGm: false, send: () => {} }),
      register({ worldId: '5', requesterAccountId: 'b', canSeeGm: false, send: () => {} }),
      register({ worldId: '5', requesterAccountId: 'c', canSeeGm: false, send: () => {} })
    ]

    broadcastRollEvent(roll({ visibility: 'table' }))

    for (const client of clients) {
      expect(client.sends).toHaveLength(1)
    }
  })

  it('stops delivering to a client once its unregister function has been called (disconnect/subscription cleanup)', () => {
    const client = register({ worldId: '5', requesterAccountId: 'alice', canSeeGm: false, send: () => {} })

    broadcastRollEvent(roll({ visibility: 'table', id: 'roll-a' }))
    expect(client.sends).toHaveLength(1)

    client.unregister()
    broadcastRollEvent(roll({ visibility: 'table', id: 'roll-b' }))

    // Still exactly one -- the second broadcast never reached the
    // disconnected client.
    expect(client.sends).toHaveLength(1)
  })

  it('never lets one client\'s send() throwing prevent delivery to every other client', () => {
    const broken = register({
      worldId: '5',
      requesterAccountId: 'broken',
      canSeeGm: false,
      send: () => { throw new Error('connection reset') }
    })
    const healthy = register({ worldId: '5', requesterAccountId: 'healthy', canSeeGm: false, send: () => {} })

    expect(() => broadcastRollEvent(roll({ visibility: 'table' }))).not.toThrow()
    expect(healthy.sends).toHaveLength(1)
    void broken
  })

  it('reports connected client count via rollRealtimeBridgeStatus', () => {
    register({ worldId: '5', requesterAccountId: 'alice', canSeeGm: false, send: () => {} })
    register({ worldId: '5', requesterAccountId: 'bob', canSeeGm: false, send: () => {} })

    const status = rollRealtimeBridgeStatus()

    expect(status.transport).toBe('eldra-local-sse')
    expect(status.clients).toBeGreaterThanOrEqual(2)
  })
})
