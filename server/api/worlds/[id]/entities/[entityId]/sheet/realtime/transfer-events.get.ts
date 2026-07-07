import { loadActiveCharacterSheet } from '../../../../../../../utils/character-sheet-inventory'
import {
  inventoryTransferRealtimeBridgeStatus,
  registerInventoryTransferRealtimeClient
} from '../../../../../../../utils/inventory-transfer-realtime-bridge'

function sseEvent(eventName: string, payload: any) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
}

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const worldId = String(params.id || '')
  const entityId = String(params.entityId || '')
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const res = event.node.res

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const send = (payload: any) => {
    if (res.destroyed || res.writableEnded) return

    res.write(sseEvent('inventory-transfer', payload))
  }

  const unregister = registerInventoryTransferRealtimeClient({
    worldId,
    entityId,
    sheetId: sheet.id,
    send
  })

  res.write(sseEvent('ready', {
    worldId,
    entityId,
    sheetId: sheet.id,
    bridge: inventoryTransferRealtimeBridgeStatus()
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
