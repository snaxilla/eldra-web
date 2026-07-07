type TransferRealtimeClient = {
  id: string
  worldId: string
  sheetId: string
  entityId: string
  send: (payload: any) => void
}

type BridgeState = {
  clients: Map<string, TransferRealtimeClient>
  socket: any | null
  connecting: boolean
  subscribed: boolean
  retryTimer: ReturnType<typeof setTimeout> | null
  retryDelayMs: number
  sequence: number
  lastError: string
}

const GLOBAL_KEY = '__eldraInventoryTransferRealtimeBridge'

function bridgeState(): BridgeState {
  const globalValue = globalThis as any

  if (!globalValue[GLOBAL_KEY]) {
    globalValue[GLOBAL_KEY] = {
      clients: new Map(),
      socket: null,
      connecting: false,
      subscribed: false,
      retryTimer: null,
      retryDelayMs: 1000,
      sequence: 0,
      lastError: ''
    } satisfies BridgeState
  }

  return globalValue[GLOBAL_KEY] as BridgeState
}

function runtimeDirectusConfig() {
  const config = useRuntimeConfig()

  const baseUrl = String(
    process.env.DIRECTUS_URL ||
    (config as any).directusUrl ||
    process.env.NUXT_PUBLIC_DIRECTUS_URL ||
    config.public?.directusUrl ||
    ''
  ).replace(/\/$/, '')

  const token = String(
    process.env.DIRECTUS_TOKEN ||
    (config as any).directusToken ||
    ''
  )

  return {
    baseUrl,
    token
  }
}

function websocketUrlForDirectus(baseUrl: string) {
  return baseUrl
    .replace(/^https:/i, 'wss:')
    .replace(/^http:/i, 'ws:')
    .replace(/\/$/, '') + '/websocket'
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

function safeJson(value: any) {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

function broadcastToMatchingClients(payload: any) {
  const state = bridgeState()
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : payload?.data
      ? [payload.data]
      : []

  for (const row of rows) {
    for (const client of state.clients.values()) {
      if (!matchingClient(row, client)) continue

      client.send({
        type: 'inventory-transfer',
        event: payload?.event || 'change',
        uid: payload?.uid || '',
        transferId: row?.id || null,
        status: row?.status || '',
        worldId: row?.world_id || row?.worldId || '',
        sourceSheetId: row?.source_sheet_id || row?.sourceSheetId || '',
        targetSheetId: row?.target_sheet_id || row?.targetSheetId || '',
        sourceEntityId: row?.source_entity_id || row?.sourceEntityId || '',
        targetEntityId: row?.target_entity_id || row?.targetEntityId || '',
        itemName: row?.item_name || row?.itemName || '',
        updatedAt: row?.updated_at || row?.updatedAt || '',
        createdAt: row?.created_at || row?.createdAt || ''
      })
    }
  }
}

function clearRetryTimer() {
  const state = bridgeState()

  if (!state.retryTimer) return

  clearTimeout(state.retryTimer)
  state.retryTimer = null
}

function scheduleReconnect(reason = 'closed') {
  const state = bridgeState()

  if (!state.clients.size) return
  if (state.retryTimer) return

  const delay = Math.min(state.retryDelayMs, 30000)

  state.retryTimer = setTimeout(() => {
    state.retryTimer = null
    state.retryDelayMs = Math.min(state.retryDelayMs * 2, 30000)
    void ensureInventoryTransferRealtimeBridge(`reconnect:${reason}`)
  }, delay)
}

function closeSocket() {
  const state = bridgeState()
  const socket = state.socket

  state.socket = null
  state.connecting = false
  state.subscribed = false

  if (!socket) return

  try {
    socket.close()
  } catch {}
}

async function loadWebSocketConstructor() {
  const mod: any = await import('ws')
  return mod.WebSocket || mod.default
}

function subscribeToTransfers(socket: any) {
  socket.send(safeJson({
    type: 'subscribe',
    collection: 'character_sheet_inventory_transfers',
    uid: 'eldra-inventory-transfers',
    query: {
      fields: [
        'id',
        'world_id',
        'source_sheet_id',
        'source_entity_id',
        'target_sheet_id',
        'target_entity_id',
        'source_inventory_id',
        'item_entity_id',
        'item_name',
        'quantity',
        'status',
        'message',
        'created_at',
        'updated_at',
        'accepted_at',
        'declined_at',
        'cancelled_at',
        'completed_at',
        'source_cleared_at',
        'target_cleared_at'
      ],
      limit: -1
    }
  }))
}

function handleDirectusMessage(socket: any, rawMessage: any) {
  const state = bridgeState()
  const raw = Buffer.isBuffer(rawMessage)
    ? rawMessage.toString('utf8')
    : typeof rawMessage === 'string'
      ? rawMessage
      : String(rawMessage || '')

  let message: any = null

  try {
    message = JSON.parse(raw)
  } catch {
    return
  }

  if (message?.type === 'ping') {
    try {
      socket.send(safeJson({ type: 'pong' }))
    } catch {}
    return
  }

  if (message?.type === 'auth') {
    if (message?.status === 'ok') {
      state.retryDelayMs = 1000
      subscribeToTransfers(socket)
      return
    }

    state.lastError = `Directus realtime auth failed: ${raw.slice(0, 240)}`
    closeSocket()
    scheduleReconnect('auth-failed')
    return
  }

  if (message?.type === 'subscription') {
    if (message?.event === 'init') {
      state.subscribed = true
      state.retryDelayMs = 1000
      return
    }

    if (['create', 'update', 'delete'].includes(String(message?.event || ''))) {
      broadcastToMatchingClients(message)
    }
  }
}

export async function ensureInventoryTransferRealtimeBridge(reason = 'ensure') {
  const state = bridgeState()

  if (!state.clients.size) return
  if (state.connecting) return
  if (state.socket && state.socket.readyState === 1) return

  const { baseUrl, token } = runtimeDirectusConfig()

  if (!baseUrl || !token) {
    state.lastError = 'Directus realtime bridge missing base URL or token.'
    return
  }

  state.connecting = true
  state.subscribed = false
  state.lastError = ''
  clearRetryTimer()

  try {
    const WebSocketCtor = await loadWebSocketConstructor()
    const socket = new WebSocketCtor(websocketUrlForDirectus(baseUrl))

    state.socket = socket

    socket.on('open', () => {
      state.connecting = false

      try {
        socket.send(safeJson({
          type: 'auth',
          access_token: token
        }))
      } catch (error: any) {
        state.lastError = error?.message || String(error)
        closeSocket()
        scheduleReconnect('auth-send-failed')
      }
    })

    socket.on('message', (message: any) => {
      handleDirectusMessage(socket, message)
    })

    socket.on('error', (error: any) => {
      state.lastError = error?.message || String(error)
    })

    socket.on('close', () => {
      state.socket = null
      state.connecting = false
      state.subscribed = false
      scheduleReconnect(reason)
    })
  } catch (error: any) {
    state.socket = null
    state.connecting = false
    state.subscribed = false
    state.lastError = error?.message || String(error)
    scheduleReconnect('connect-error')
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
  void ensureInventoryTransferRealtimeBridge('client-registered')

  return () => {
    state.clients.delete(id)

    if (!state.clients.size) {
      clearRetryTimer()
      closeSocket()
    }
  }
}

export function inventoryTransferRealtimeBridgeStatus() {
  const state = bridgeState()

  return {
    clients: state.clients.size,
    connected: Boolean(state.socket && state.socket.readyState === 1),
    connecting: state.connecting,
    subscribed: state.subscribed,
    lastError: state.lastError
  }
}
