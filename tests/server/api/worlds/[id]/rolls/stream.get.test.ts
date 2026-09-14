// Unit tests for GET /api/worlds/:id/rolls/stream
// (server/api/worlds/[id]/rolls/stream.get.ts). Eldra Roll System
// Phase 2D (.github/docs/architecture/eldra-roll-system.md §7/§10).
//
// requireCapability/can are exercised for REAL (not mocked), matching
// index.get.test.ts's own precedent for this exact endpoint family.
// server/utils/roll-realtime-bridge.ts is mocked at the module boundary
// -- this file is about the ROUTE's own authorization/registration
// behavior (this task's own "do not place business logic inside the SSE
// endpoint"), not the bridge's visibility rule itself
// (tests/server/utils/roll-realtime-bridge.test.ts covers that).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { registerRollRealtimeClientMock, rollRealtimeBridgeStatusMock } = vi.hoisted(() => ({
  registerRollRealtimeClientMock: vi.fn(),
  rollRealtimeBridgeStatusMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/roll-realtime-bridge', () => ({
  registerRollRealtimeClient: registerRollRealtimeClientMock,
  rollRealtimeBridgeStatus: rollRealtimeBridgeStatusMock
}))

import handler from '../../../../../../server/api/worlds/[id]/rolls/stream.get'
import type { Principal } from '../../../../../../server/utils/authorization'

function playerPrincipal(worldId: string, accountId = 'account-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.roll.execute'])]]),
    temporarySingleUserMode: false
  }
}

function gmPrincipal(worldId: string, accountId = 'gm-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.roll.execute', 'world.roll.see_gm'])]]),
    temporarySingleUserMode: false
  }
}

// A minimal fake of h3's underlying Node req/res, just enough for this
// route's own SSE plumbing: `res.writeHead`/`res.write`, and `req.on`
// registering the 'close'/'aborted' listeners this route awaits. `close()`
// fires them, resolving the handler's own promise, exactly as a real
// client disconnect would.
function fakeStreamEvent(worldId: string, principal: Principal | null) {
  const reqListeners: Record<string, Array<() => void>> = {}
  const writes: string[] = []

  const req = {
    on: (eventName: string, cb: () => void) => {
      reqListeners[eventName] = reqListeners[eventName] || []
      reqListeners[eventName].push(cb)
    }
  }

  const res = {
    writeHead: vi.fn(),
    write: (chunk: string) => {
      writes.push(chunk)
    },
    destroyed: false,
    writableEnded: false
  }

  const event = {
    context: { principal, params: { id: worldId } },
    node: { req, res }
  } as unknown as H3Event

  function close() {
    for (const cb of reqListeners.close || []) cb()
  }

  return { event, writes, close, res }
}

beforeEach(() => {
  registerRollRealtimeClientMock.mockReset()
  rollRealtimeBridgeStatusMock.mockReset()
  registerRollRealtimeClientMock.mockReturnValue(vi.fn())
  rollRealtimeBridgeStatusMock.mockReturnValue({ transport: 'eldra-local-sse', clients: 1, connected: true, connecting: false, subscribed: true, lastError: '' })
})

describe('GET /api/worlds/:id/rolls/stream', () => {
  it('fails with 401 when no principal is present, and never registers a client', async () => {
    const { event } = fakeStreamEvent('5', null)
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(registerRollRealtimeClientMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a Principal lacking world.read, and never registers a client', async () => {
    const noAccess: Principal = {
      accountId: 'no-access',
      platformCapabilities: new Set(),
      worldCapabilities: new Map(),
      temporarySingleUserMode: false
    }
    const { event } = fakeStreamEvent('5', noAccess)
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(registerRollRealtimeClientMock).not.toHaveBeenCalled()
  })

  it('registers a client with the resolved accountId, worldId, and canSeeGm=false for a plain Player', async () => {
    const { event, close } = fakeStreamEvent('5', playerPrincipal('5'))

    const pending = handler(event)
    expect(registerRollRealtimeClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ worldId: '5', requesterAccountId: 'account-1', canSeeGm: false })
    )

    close()
    await pending
  })

  it('resolves canSeeGm=true for a Principal holding world.roll.see_gm', async () => {
    const { event, close } = fakeStreamEvent('5', gmPrincipal('5'))

    const pending = handler(event)
    expect(registerRollRealtimeClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ requesterAccountId: 'gm-1', canSeeGm: true })
    )

    close()
    await pending
  })

  it('unregisters the client when the connection closes (subscription cleanup)', async () => {
    const unregister = vi.fn()
    registerRollRealtimeClientMock.mockReturnValue(unregister)

    const { event, close } = fakeStreamEvent('5', playerPrincipal('5'))
    const pending = handler(event)

    expect(unregister).not.toHaveBeenCalled()
    close()
    await pending
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('writes SSE headers and an initial "ready" event before awaiting the connection', async () => {
    const { event, writes, close, res } = fakeStreamEvent('5', playerPrincipal('5'))

    const pending = handler(event)
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/event-stream; charset=utf-8' }))
    expect(writes.some((chunk) => chunk.startsWith('event: ready'))).toBe(true)

    close()
    await pending
  })
})
