// GET /api/worlds/:id/rolls/stream -- Eldra Roll System Phase 2D
// (.github/docs/architecture/eldra-roll-system.md §7's own "Later" entry
// and §10). Mirrors
// server/api/worlds/[id]/entities/[entityId]/sheet/realtime/transfer-events.get.ts's
// exact SSE shape (headers, a `ready` event, a 25s keep-alive comment,
// register-on-open/unregister-on-close) per this task's own instruction to
// reuse that pattern rather than invent a new one.
//
// THIN, ON PURPOSE (this task's own SERVER section: "Do not place business
// logic inside the SSE endpoint"). This route's only job is: resolve WHO
// is connecting (Principal, already resolved by
// server/middleware/authorize.ts) and WHAT they're allowed to see
// (world.read to connect at all, world.roll.see_gm to unlock private rows
// -- the identical two checks GET /rolls already makes), then register
// that identity with server/utils/roll-realtime-bridge.ts and hold the
// connection open. Every actual visibility DECISION happens inside the
// bridge's own `canDeliverToClient`, never here.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { can, requireCapability } from '../../../../utils/authorization'
import { registerRollRealtimeClient, rollRealtimeBridgeStatus } from '../../../../utils/roll-realtime-bridge'

function sseEvent(eventName: string, payload: any) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  // Identical enforcement to GET /rolls (§5/§7): reading a live feed of
  // rolls requires only that the requester can read this World at all.
  requireCapability(principal, 'world.read', { kind: 'world', worldId })

  // world.roll.see_gm (§5), resolved once, here, from the real Principal
  // -- never accepted as a query param or any other client-supplied
  // value. This is the ONLY thing that ever unlocks a private roll from
  // someone else over this connection.
  const canSeeGm = can(principal, 'world.roll.see_gm', { kind: 'world', worldId })

  const res = event.node.res

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const send = (payload: any) => {
    if (res.destroyed || res.writableEnded) return

    res.write(sseEvent('roll', payload))
  }

  const unregister = registerRollRealtimeClient({
    worldId,
    requesterAccountId: principal.accountId,
    canSeeGm,
    send
  })

  res.write(sseEvent('ready', {
    worldId,
    bridge: rollRealtimeBridgeStatus()
  }))

  const keepAlive = setInterval(() => {
    if (res.destroyed || res.writableEnded) return

    res.write(`: keep-alive ${Date.now()}\n\n`)
  }, 25000)

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      clearInterval(keepAlive)
      unregister()
      resolve()
    }

    event.node.req.on('close', cleanup)
    event.node.req.on('aborted', cleanup)
  })
})
