import { directusServiceRequest } from '../../../../utils/directus'
import { broadcastInventoryTransferRealtimeEvent } from '../../../../utils/inventory-transfer-realtime-bridge'
import {
  createInventoryItemForSheet,
  loadActiveCharacterSheet,
  loadInventoryRows,
  updateInventoryItemForSheet
} from '../../../../utils/character-sheet-inventory'

const TRANSFER_COLLECTION = 'character_sheet_inventory_transfers'

let transferFieldCache: Set<string> | null = null

function clean(value: any) {
  return String(value ?? '').trim()
}

function intOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : null
}

function positiveInt(value: any, fallback = 1) {
  const parsed = intOrNull(value)

  if (!parsed || parsed < 1) return fallback

  return parsed
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeCurrency(value: any) {
  const key = clean(value).toLowerCase()

  if (['gold', 'gp', 'g'].includes(key)) return 'Gold'
  if (['silver', 'sp', 's'].includes(key)) return 'Silver'
  if (['copper', 'cp', 'c'].includes(key)) return 'Copper'

  return ''
}

function currencyRowName(currency: string) {
  return `Currency: ${currency}`
}

function isCurrencyRow(row: any, currency: string) {
  return clean(row?.name).toLowerCase() === currencyRowName(currency).toLowerCase()
}

function isMissingTransferSchema(error: any) {
  const message = String(
    error?.data?.errors?.[0]?.message ||
    error?.data?.message ||
    error?.message ||
    ''
  ).toLowerCase()

  return (
    message.includes(TRANSFER_COLLECTION) ||
    (message.includes('collection') && (message.includes('not found') || message.includes('does not exist'))) ||
    (message.includes('permission') && message.includes(TRANSFER_COLLECTION))
  )
}

async function transferFields() {
  if (transferFieldCache) return transferFieldCache

  try {
    const result = await directusServiceRequest(`/fields/${TRANSFER_COLLECTION}`, {
      method: 'GET'
    })

    transferFieldCache = new Set(
      (Array.isArray(result?.data) ? result.data : [])
        .map((field: any) => String(field?.field || '').trim())
        .filter(Boolean)
    )

    return transferFieldCache
  } catch (error) {
    if (isMissingTransferSchema(error)) {
      transferFieldCache = new Set()
      return transferFieldCache
    }

    throw error
  }
}

function pickSupported(fields: Set<string>, payload: Record<string, any>) {
  if (!fields.size) return payload

  const picked: Record<string, any> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (fields.has(key)) picked[key] = value
  }

  return picked
}

async function createGrantTransferEvent(options: {
  worldId: string
  targetEntityId: string
  targetSheet: any
  itemEntityId?: any
  itemName: string
  quantity: any
  notes?: string
  grantType: 'item' | 'currency'
}) {
  const fields = await transferFields()

  if (!fields.size) {
    console.warn('[game-admin-grants] transfer schema missing; grant ledger event skipped')
    return null
  }

  const now = nowIso()
  const quantity = positiveInt(options.quantity, 1)
  const itemName = clean(options.itemName) || 'Granted Item'
  const notes = clean(options.notes || 'Granted by Game Admin')
  const itemEntityId = intOrNull(options.itemEntityId)

  const payload = pickSupported(fields, {
    world_id: Number(options.worldId),

    // DM grants intentionally have no source character.
    source_sheet_id: null,
    source_entity_id: null,
    source_inventory_id: null,

    target_sheet_id: Number(options.targetSheet?.id || 0),
    target_entity_id: Number(options.targetEntityId),

    item_entity_id: itemEntityId,
    item_name: itemName,
    quantity,

    status: 'granted',
    message: notes,

    item_snapshot: {
      sourceName: 'Game Admin',
      targetName: clean(options.targetSheet?.name || ''),
      grantType: options.grantType,
      itemName,
      quantity,
      notes
    },

    created_at: now,
    updated_at: now,
    completed_at: now,
    accepted_at: now
  })

  try {
    const created = await directusServiceRequest(`/items/${TRANSFER_COLLECTION}`, {
      method: 'POST',
      body: payload
    })

    const row = created?.data || payload

    try {
      await Promise.resolve(broadcastInventoryTransferRealtimeEvent(row))
    } catch (broadcastError) {
      console.warn('[game-admin-grants] grant created but realtime broadcast failed', broadcastError)
    }

    return row
  } catch (error) {
    console.warn('[game-admin-grants] failed to create grant transfer event', error)
    return null
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event)
  const targetEntityId = clean(body?.targetEntityId || body?.target_entity_id)
  const action = clean(body?.action || body?.type).toLowerCase()

  if (!worldId || !targetEntityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'World id and target entity id are required'
    })
  }

  const targetSheet = await loadActiveCharacterSheet(worldId, targetEntityId)

  if (action === 'currency' || body?.currency || body?.currencyType) {
    const currency = normalizeCurrency(body?.currency || body?.currencyType)
    const amount = positiveInt(body?.amount || body?.quantity, 1)
    const notes = clean(body?.notes || 'Granted by Game Admin')

    if (!currency) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Currency must be Gold, Silver, or Copper'
      })
    }

    const rows = await loadInventoryRows(targetSheet.id)
    const existing = rows.find((row: any) => isCurrencyRow(row, currency))
    let result: any = null

    if (existing?.id) {
      const current = positiveInt(existing.quantity, 0)

      result = await updateInventoryItemForSheet(
        worldId,
        targetEntityId,
        String(existing.id),
        {
          name: currencyRowName(currency),
          quantity: current + amount,
          notes: notes || clean(existing.notes || 'Granted by Game Admin')
        }
      )
    } else {
      result = await createInventoryItemForSheet(worldId, targetEntityId, {
        name: currencyRowName(currency),
        quantity: amount,
        notes
      })
    }

    const transferEvent = await createGrantTransferEvent({
      worldId,
      targetEntityId,
      targetSheet,
      itemName: currencyRowName(currency),
      quantity: amount,
      notes,
      grantType: 'currency'
    })

    return {
      granted: true,
      grantType: 'currency',
      currency,
      amount,
      targetEntityId,
      transferEvent,
      item: result.item,
      inventory: result.inventory
    }
  }

  const itemEntityId = clean(body?.itemEntityId || body?.item_entity_id)
  const itemName = clean(body?.name || body?.itemName)
  const quantity = positiveInt(body?.quantity, 1)
  const notes = clean(body?.notes || 'Granted by Game Admin')

  if (!itemEntityId && !itemName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Grant item requires an imported item or custom item name'
    })
  }

  const result = await createInventoryItemForSheet(worldId, targetEntityId, {
    itemEntityId: itemEntityId || null,
    name: itemName || null,
    quantity,
    notes
  })

  const grantedItemName =
    clean(result?.item?.name) ||
    itemName ||
    clean(body?.itemName) ||
    'Granted Item'

  const transferEvent = await createGrantTransferEvent({
    worldId,
    targetEntityId,
    targetSheet,
    itemEntityId,
    itemName: grantedItemName,
    quantity,
    notes,
    grantType: 'item'
  })

  return {
    granted: true,
    grantType: 'item',
    targetEntityId,
    itemEntityId,
    name: grantedItemName,
    quantity,
    transferEvent,
    item: result.item,
    inventory: result.inventory
  }
})
