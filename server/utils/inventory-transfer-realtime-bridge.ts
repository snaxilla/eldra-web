type TransferRealtimeClient = {
  id: string
  worldId: string
  sheetId: string
  entityId: string
  send: (payload: any) => void
}

type BridgeState = {
  clients: Map<string, TransferRealtimeClient>
  sequence: number
}

const GLOBAL_KEY = '__eldraInventoryTransferLocalEventBus'

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

function text(value: any) {
  return String(value ?? '').trim()
}

function matchingClient(row: any, client: TransferRealtimeClient) {
  if (!row || typeof row !== 'object') return false

  const worldId = text(row.world_id || row.worldId)
  const sourceSheetId = text(row.source_sheet_id || row.sourceSheetId)
  const targetSheetId = text(row.target_sheet_id || row.targetSheetId)

  if (worldId && worldId !== client.worldId) return false

  return sourceSheetId === client.sheetId || targetSheetId === client.sheetId
}

function transferPayload(row: any, event = 'change') {
  return {
    type: 'inventory-transfer',
    transport: 'eldra-local-sse',
    event,
    transferId: row?.id || null,
    status: row?.status || '',
    worldId: row?.world_id || row?.worldId || '',
    sourceSheetId: row?.source_sheet_id || row?.sourceSheetId || '',
    targetSheetId: row?.target_sheet_id || row?.targetSheetId || '',
    sourceEntityId: row?.source_entity_id || row?.sourceEntityId || '',
    targetEntityId: row?.target_entity_id || row?.targetEntityId || '',
    itemName: row?.item_name || row?.itemName || '',
    updatedAt: row?.updated_at || row?.updatedAt || '',
    createdAt: row?.created_at || row?.createdAt || '',
    emittedAt: new Date().toISOString()
  }
}

export function broadcastInventoryTransferRealtimeEvent(row: any, event = 'change') {
  const state = bridgeState()
  const payload = transferPayload(row, event)

  for (const client of state.clients.values()) {
    if (!matchingClient(row, client)) continue

    try {
      client.send(payload)
    } catch {}
  }
}

export function registerInventoryTransferRealtimeClient(input: {
  worldId: string | number
  sheetId: string | number
  entityId: string | number
  send: (payload: any) => void
}) {
  const state = bridgeState()
  const id = `client-${Date.now()}-${++state.sequence}-${Math.random().toString(36).slice(2, 8)}`

  const client: TransferRealtimeClient = {
    id,
    worldId: text(input.worldId),
    sheetId: text(input.sheetId),
    entityId: text(input.entityId),
    send: input.send
  }

  state.clients.set(id, client)

  return () => {
    state.clients.delete(id)
  }
}

export function inventoryTransferRealtimeBridgeStatus() {
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
