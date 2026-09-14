// Roll Event realtime broadcast -- Eldra Roll System Phase 2D
// (.github/docs/architecture/eldra-roll-system.md §10, the realtime
// portion deliberately deferred until the Roll Tray existed, Phase 2C).
//
// STRUCTURALLY IDENTICAL to
// server/utils/inventory-transfer-realtime-bridge.ts, per this task's own
// instruction to study and mirror that implementation rather than invent
// a new realtime architecture: an in-process `Map` of connected SSE
// clients, a `register*`/`broadcast*` pair, and a `*BridgeStatus` status
// getter. Same `transport: 'eldra-local-sse'` label, same
// register-returns-an-unregister-closure shape, same
// "swallow a client's own send() failure so one dead connection cannot
// break the broadcast to every other client" discipline. The one
// STRUCTURAL difference from the inventory bridge: a Roll Event has a real
// per-row VISIBILITY the inventory bridge's `matchingClient` never needed
// (an inventory transfer is scoped by sheet ownership, not visibility) --
// `canDeliverToClient` below is the roll-specific equivalent of that same
// "does this event apply to this client" question, restated for this
// domain's own rule (§5, already enforced identically by
// `listRollEvents`'s own Directus filter -- restated here in plain JS
// because this bridge operates on already-in-memory RollEventRecords, not
// a database query, so the two can never literally share one
// implementation, only the same RULE).
//
// NO BUSINESS LOGIC BEYOND THAT ONE PREDICATE. This module never persists
// anything, never re-derives a roll, and never decides WHETHER a roll
// happened -- it only decides WHO, among already-connected clients,
// receives an already-persisted RollEventRecord (this task's own SERVER
// section: "The broadcaster should only deliver already-persisted
// RollEvents").

import type { RollEventRecord } from '../../app/lib/rolls/types'

type RollRealtimeClient = {
  id: string
  worldId: string
  // The connected viewer's own identity/capability, captured once at
  // registration (server/api/worlds/[id]/rolls/stream.get.ts resolves
  // both from the real Principal before ever registering a client) --
  // never re-resolved per broadcast, and never trusted from anything a
  // client could send over the wire itself.
  requesterAccountId: string
  canSeeGm: boolean
  send: (payload: any) => void
}

type BridgeState = {
  clients: Map<string, RollRealtimeClient>
  sequence: number
}

const GLOBAL_KEY = '__eldraRollRealtimeLocalEventBus'

function bridgeState(): BridgeState {
  const globalValue = globalThis as any

  if (!globalValue[GLOBAL_KEY]) {
    globalValue[GLOBAL_KEY] = {
      clients: new Map(),
      sequence: 0
    } satisfies BridgeState
  }

  return globalValue[GLOBAL_KEY] as BridgeState
}

// The same visibility rule listRollEvents's own Directus filter already
// enforces (eldra-roll-system.md §5): everyone connected sees a `table`
// roll; a `private` roll is delivered only to its own roller, unless the
// viewer independently holds world.roll.see_gm. Scoped to the roll's own
// World first -- a client connected to World 5's stream must never
// receive a roll from World 9, table or not.
function canDeliverToClient(roll: RollEventRecord, client: RollRealtimeClient): boolean {
  if (roll.worldId !== client.worldId) return false
  if (roll.visibility === 'table') return true
  return client.canSeeGm || roll.rollerUserId === client.requesterAccountId
}

function rollBroadcastPayload(roll: RollEventRecord) {
  return {
    type: 'roll-event',
    transport: 'eldra-local-sse',
    roll,
    emittedAt: new Date().toISOString()
  }
}

// Delivers an already-persisted RollEventRecord to every currently
// connected client this World's stream authorizes to see it. Never
// throws -- a single client's dead/closing connection (send() failing)
// must never prevent every OTHER connected client from receiving the same
// roll, exactly matching inventory-transfer-realtime-bridge.ts's own
// per-client try/catch.
export function broadcastRollEvent(roll: RollEventRecord): void {
  const state = bridgeState()
  const payload = rollBroadcastPayload(roll)

  for (const client of state.clients.values()) {
    if (!canDeliverToClient(roll, client)) continue

    try {
      client.send(payload)
    } catch {}
  }
}

// Registers one connected client and returns the unregister closure the
// SSE route calls on disconnect (request 'close'/'aborted') -- the exact
// register-returns-cleanup shape
// registerInventoryTransferRealtimeClient already established.
export function registerRollRealtimeClient(input: {
  worldId: string | number
  requesterAccountId: string
  canSeeGm: boolean
  send: (payload: any) => void
}): () => void {
  const state = bridgeState()
  const id = `client-${Date.now()}-${++state.sequence}-${Math.random().toString(36).slice(2, 8)}`

  const client: RollRealtimeClient = {
    id,
    worldId: String(input.worldId ?? ''),
    requesterAccountId: input.requesterAccountId,
    canSeeGm: input.canSeeGm,
    send: input.send
  }

  state.clients.set(id, client)

  return () => {
    state.clients.delete(id)
  }
}

export function rollRealtimeBridgeStatus() {
  const state = bridgeState()

  return {
    transport: 'eldra-local-sse',
    clients: state.clients.size,
    connected: true,
    connecting: false,
    subscribed: true,
    lastError: ''
  }
}
