import { directusServiceRequest } from './directus'
import {
  loadActiveCharacterSheet,
  loadInventoryRows
} from './character-sheet-inventory'

const COLLECTION = 'character_sheet_inventory_transfers'

function nowIso() {
  return new Date().toISOString()
}

function text(value: any) {
  return String(value ?? '').trim()
}

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function intOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null

  return Math.floor(parsed)
}

function positiveInt(value: any, fallback = 1) {
  const parsed = intOrNull(value)
  if (!parsed || parsed < 1) return fallback
  return parsed
}

function boolValue(value: any) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on'
}

function inventoryLinkedItemId(row: any) {
  return intOrNull(
    row?.item_entity_id ??
    row?.itemEntityId ??
    row?.entity_item_id ??
    row?.item_id ??
    row?.linked_item_entity_id ??
    row?.item_entity
  )
}

function inventoryQuantity(row: any) {
  return positiveInt(row?.quantity, 1)
}


function currencyKeyForName(value: any) {
  const name = text(value).toLowerCase()

  if (!name.startsWith('currency:')) return ''

  // Legacy platinum rows are folded into gold. Eldra only tracks GP/SP/CP.
  if (name.includes('platinum')) return 'gp'
  if (name.includes('gold')) return 'gp'
  if (name.includes('silver')) return 'sp'
  if (name.includes('copper')) return 'cp'

  return ''
}

function currencyQuantityMultiplierForName(value: any) {
  const name = text(value).toLowerCase()
  return name.includes('platinum') ? 10 : 1
}

function isCurrencyName(value: any) {
  return Boolean(currencyKeyForName(value))
}

function transferVisibleForActor(transfer: any) {
  if (transfer.direction === 'incoming') return !transfer.targetClearedAt
  if (transfer.direction === 'outgoing') return !transfer.sourceClearedAt
  return true
}

function normalizeTransfer(row: any, actorSheet: any, sheetsById = new Map<string, any>()) {
  const actorSheetId = String(actorSheet?.id || '')
  const sourceSheetId = String(row?.source_sheet_id || '')
  const targetSheetId = String(row?.target_sheet_id || '')

  const direction =
    targetSheetId === actorSheetId
      ? 'incoming'
      : sourceSheetId === actorSheetId
        ? 'outgoing'
        : 'related'

  const sourceSheet = sheetsById.get(sourceSheetId)
  const targetSheet = sheetsById.get(targetSheetId)

  return {
    id: row.id,
    worldId: row.world_id,
    sourceSheetId: row.source_sheet_id,
    sourceEntityId: row.source_entity_id,
    sourceName: sourceSheet?.name || row?.item_snapshot?.sourceName || '',
    targetSheetId: row.target_sheet_id,
    targetEntityId: row.target_entity_id,
    targetName: targetSheet?.name || row?.item_snapshot?.targetName || '',
    sourceInventoryId: row.source_inventory_id,
    itemEntityId: row.item_entity_id,
    itemName: row.item_name || 'Item',
    quantity: inventoryQuantity(row),
    status: row.status || 'offered',
    message: row.message || '',
    itemSnapshot: row.item_snapshot || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    acceptedAt: row.accepted_at || null,
    declinedAt: row.declined_at || null,
    cancelledAt: row.cancelled_at || null,
    completedAt: row.completed_at || null,
    sourceClearedAt: row.source_cleared_at || null,
    targetClearedAt: row.target_cleared_at || null,
    direction
  }
}

async function activeSheetsForWorld(worldId: string | number) {
  const res = await directusServiceRequest('/items/character_sheets', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { is_active: { _eq: true } }
        ]
      },
      sort: 'name,id',
      limit: -1,
      fields: 'id,world_id,entity_id,name,class_name,species_name,level,is_active'
    }
  })

  return Array.isArray(res?.data) ? res.data : []
}

async function loadInventoryRowBySheet(sheetId: any, inventoryId: any) {
  const rowId = intOrNull(inventoryId)

  if (!rowId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'inventoryId is required'
    })
  }

  const res = await directusServiceRequest('/items/character_sheet_inventory', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { id: { _eq: rowId } },
          { sheet_id: { _eq: Number(sheetId) } }
        ]
      },
      limit: 1,
      fields: '*'
    }
  })

  const row = Array.isArray(res?.data) ? (res.data[0] || null) : null

  if (!row?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Inventory item not found on this sheet'
    })
  }

  return row
}

async function loadTransfer(worldId: string | number, transferId: any) {
  const id = intOrNull(transferId)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'transferId is required'
    })
  }

  const res = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { id: { _eq: id } },
          { world_id: { _eq: Number(worldId) } }
        ]
      },
      limit: 1,
      fields: '*'
    }
  })

  const row = Array.isArray(res?.data) ? (res.data[0] || null) : null

  if (!row?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Inventory transfer not found'
    })
  }

  return row
}

async function patchTransfer(transferId: any, body: Record<string, any>) {
  const res = await directusServiceRequest(`/items/${COLLECTION}/${transferId}`, {
    method: 'PATCH',
    body: {
      ...body,
      updated_at: nowIso()
    }
  })

  return res?.data || null
}

async function reduceSourceInventoryQuantity(sourceRow: any, quantity: number) {
  const current = inventoryQuantity(sourceRow)
  const next = current - quantity

  if (next > 0) {
    await directusServiceRequest(`/items/character_sheet_inventory/${sourceRow.id}`, {
      method: 'PATCH',
      body: {
        quantity: next,
        updated_at: nowIso()
      }
    })

    return
  }

  await directusServiceRequest(`/items/character_sheet_inventory/${sourceRow.id}`, {
    method: 'DELETE'
  })
}

async function createTargetInventoryItem(targetSheet: any, transfer: any) {
  const snapshot = asObject(transfer?.item_snapshot)
  const sourceData = asObject(snapshot?.data)
  const itemName = text(transfer.item_name) || 'Item'
  const quantity = inventoryQuantity(transfer) * currencyQuantityMultiplierForName(itemName)
  const isCurrency = isCurrencyName(itemName) || text(snapshot.container).toLowerCase() === 'currency'
  const timestamp = nowIso()

  if (isCurrency) {
    const existingRows = await loadInventoryRows(targetSheet.id)
    const wantedCurrencyKey = currencyKeyForName(itemName)

    const existingCurrencyRow = existingRows.find((row: any) =>
      currencyKeyForName(row?.name) === wantedCurrencyKey
    )

    if (existingCurrencyRow?.id) {
      const current = inventoryQuantity(existingCurrencyRow)
      const updated = await directusServiceRequest(`/items/character_sheet_inventory/${existingCurrencyRow.id}`, {
        method: 'PATCH',
        body: {
          quantity: current + quantity,
          container: 'currency',
          notes: 'Currency',
          updated_at: timestamp
        }
      })

      return updated?.data || null
    }
  }

  const res = await directusServiceRequest('/items/character_sheet_inventory', {
    method: 'POST',
    body: {
      sheet_id: Number(targetSheet.id),
      item_entity_id: intOrNull(transfer.item_entity_id),
      name: isCurrency && currencyKeyForName(itemName) === 'gp' ? 'Currency: Gold' : itemName,
      quantity,
      equipped: false,
      attuned: false,
      container: isCurrency ? 'currency' : null,
      notes: isCurrency
        ? 'Currency'
        : transfer.message
          ? `Received from ${snapshot.sourceName || 'another character'}: ${transfer.message}`
          : `Received from ${snapshot.sourceName || 'another character'}.`,
      sort: isCurrency ? 50 : 100,
      data: {
        ...sourceData,
        received_via_transfer: {
          transferId: transfer.id,
          sourceSheetId: transfer.source_sheet_id,
          sourceEntityId: transfer.source_entity_id,
          sourceName: snapshot.sourceName || '',
          acceptedAt: timestamp
        }
      },
      created_at: timestamp,
      updated_at: timestamp
    }
  })

  return res?.data || null
}

export async function listTransferTargets(worldId: string, entityId: string) {
  const actorSheet = await loadActiveCharacterSheet(worldId, entityId)
  const sheets = await activeSheetsForWorld(worldId)

  return {
    sheetId: actorSheet.id,
    targets: sheets
      .filter((sheet: any) => String(sheet.id) !== String(actorSheet.id))
      .map((sheet: any) => ({
        sheetId: sheet.id,
        entityId: sheet.entity_id,
        name: sheet.name || 'Character',
        className: sheet.class_name || '',
        speciesName: sheet.species_name || '',
        level: sheet.level || 1
      }))
  }
}

export async function listInventoryTransfersForSheet(worldId: string, entityId: string) {
  const actorSheet = await loadActiveCharacterSheet(worldId, entityId)
  const sheets = await activeSheetsForWorld(worldId)
  const sheetsById = new Map<string, any>(
    sheets.map((sheet: any) => [String(sheet.id), sheet])
  )

  const res = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          {
            _or: [
              { source_sheet_id: { _eq: Number(actorSheet.id) } },
              { target_sheet_id: { _eq: Number(actorSheet.id) } }
            ]
          }
        ]
      },
      sort: '-created_at,-id',
      limit: -1,
      fields: '*'
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []
  const transfers = rows
    .map((row: any) => normalizeTransfer(row, actorSheet, sheetsById))
    .filter(transferVisibleForActor)

  return {
    sheetId: actorSheet.id,
    incoming: transfers.filter((transfer: any) => transfer.direction === 'incoming'),
    outgoing: transfers.filter((transfer: any) => transfer.direction === 'outgoing'),
    transfers
  }
}

export async function offerInventoryTransfer(worldId: string, sourceEntityId: string, body: any = {}) {
  const sourceSheet = await loadActiveCharacterSheet(worldId, sourceEntityId)
  const targetEntityId = text(body?.targetEntityId || body?.target_entity_id)

  if (!targetEntityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'targetEntityId is required'
    })
  }

  if (String(targetEntityId) === String(sourceEntityId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Choose a different character to receive this item'
    })
  }

  const targetSheet = await loadActiveCharacterSheet(worldId, targetEntityId)
  const sourceRow = await loadInventoryRowBySheet(
    sourceSheet.id,
    body?.inventoryId || body?.inventory_id || body?.sourceInventoryId
  )

  if (boolValue(sourceRow.equipped)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unequip this item before offering it.'
    })
  }

  const quantity = positiveInt(body?.quantity, 1)
  const available = inventoryQuantity(sourceRow)

  if (quantity > available) {
    throw createError({
      statusCode: 400,
      statusMessage: `Only ${available} available to transfer`
    })
  }

  const itemName = text(body?.itemName) || text(sourceRow?.name) || 'Item'
  const timestamp = nowIso()

  const created = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'POST',
    body: {
      world_id: Number(worldId),
      source_sheet_id: Number(sourceSheet.id),
      source_entity_id: Number(sourceEntityId),
      target_sheet_id: Number(targetSheet.id),
      target_entity_id: Number(targetEntityId),
      source_inventory_id: Number(sourceRow.id),
      item_entity_id: inventoryLinkedItemId(sourceRow),
      item_name: itemName,
      quantity,
      status: 'offered',
      message: text(body?.message),
      item_snapshot: {
        sourceName: sourceSheet.name || '',
        targetName: targetSheet.name || '',
        sourceInventoryId: sourceRow.id,
        itemEntityId: inventoryLinkedItemId(sourceRow),
        itemName,
        availableQuantity: available,
        transferredQuantity: quantity,
        equipped: boolValue(sourceRow.equipped),
        attuned: boolValue(sourceRow.attuned),
        container: sourceRow.container || '',
        notes: sourceRow.notes || '',
        data: asObject(sourceRow.data)
      },
      created_at: timestamp,
      updated_at: timestamp
    }
  })

  return {
    transfer: created?.data || null,
    sourceInventory: await loadInventoryRows(sourceSheet.id),
    transfers: await listInventoryTransfersForSheet(worldId, sourceEntityId)
  }
}

export async function acceptInventoryTransfer(worldId: string, targetEntityId: string, transferId: any) {
  const targetSheet = await loadActiveCharacterSheet(worldId, targetEntityId)
  const transfer = await loadTransfer(worldId, transferId)

  if (String(transfer.target_sheet_id || '') !== String(targetSheet.id || '')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This transfer is not for this character'
    })
  }

  if (String(transfer.status || '') !== 'offered') {
    throw createError({
      statusCode: 400,
      statusMessage: `Transfer is already ${transfer.status || 'closed'}`
    })
  }

  const quantity = inventoryQuantity(transfer)

  if (transfer.source_sheet_id && transfer.source_inventory_id) {
    let sourceRow: any = null

    try {
      sourceRow = await loadInventoryRowBySheet(transfer.source_sheet_id, transfer.source_inventory_id)
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'The source character no longer has this item'
      })
    }

    const available = inventoryQuantity(sourceRow)

    if (quantity > available) {
      throw createError({
        statusCode: 400,
        statusMessage: 'The source character no longer has enough of this item'
      })
    }

    await reduceSourceInventoryQuantity(sourceRow, quantity)
  }

  const targetItem = await createTargetInventoryItem(targetSheet, transfer)
  const timestamp = nowIso()

  const completed = await patchTransfer(transfer.id, {
    status: 'completed',
    accepted_at: timestamp,
    completed_at: timestamp
  })

  return {
    transfer: completed,
    targetItem,
    targetInventory: await loadInventoryRows(targetSheet.id),
    transfers: await listInventoryTransfersForSheet(worldId, targetEntityId)
  }
}

export async function declineInventoryTransfer(worldId: string, targetEntityId: string, transferId: any) {
  const targetSheet = await loadActiveCharacterSheet(worldId, targetEntityId)
  const transfer = await loadTransfer(worldId, transferId)

  if (String(transfer.target_sheet_id || '') !== String(targetSheet.id || '')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This transfer is not for this character'
    })
  }

  if (String(transfer.status || '') !== 'offered') {
    throw createError({
      statusCode: 400,
      statusMessage: `Transfer is already ${transfer.status || 'closed'}`
    })
  }

  return {
    transfer: await patchTransfer(transfer.id, {
      status: 'declined',
      declined_at: nowIso()
    }),
    transfers: await listInventoryTransfersForSheet(worldId, targetEntityId)
  }
}

export async function cancelInventoryTransfer(worldId: string, sourceEntityId: string, transferId: any) {
  const sourceSheet = await loadActiveCharacterSheet(worldId, sourceEntityId)
  const transfer = await loadTransfer(worldId, transferId)

  if (String(transfer.source_sheet_id || '') !== String(sourceSheet.id || '')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This transfer was not offered by this character'
    })
  }

  if (String(transfer.status || '') !== 'offered') {
    throw createError({
      statusCode: 400,
      statusMessage: `Transfer is already ${transfer.status || 'closed'}`
    })
  }

  return {
    transfer: await patchTransfer(transfer.id, {
      status: 'cancelled',
      cancelled_at: nowIso()
    }),
    transfers: await listInventoryTransfersForSheet(worldId, sourceEntityId)
  }
}

export async function clearInventoryTransferHistory(worldId: string, entityId: string) {
  const actorSheet = await loadActiveCharacterSheet(worldId, entityId)

  const res = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { status: { _neq: 'offered' } },
          {
            _or: [
              { source_sheet_id: { _eq: Number(actorSheet.id) } },
              { target_sheet_id: { _eq: Number(actorSheet.id) } }
            ]
          }
        ]
      },
      sort: '-created_at,-id',
      limit: -1,
      fields: '*'
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []
  const timestamp = nowIso()
  let cleared = 0

  for (const row of rows) {
    const patch: Record<string, any> = {}

    if (String(row.source_sheet_id || '') === String(actorSheet.id || '') && !row.source_cleared_at) {
      patch.source_cleared_at = timestamp
    }

    if (String(row.target_sheet_id || '') === String(actorSheet.id || '') && !row.target_cleared_at) {
      patch.target_cleared_at = timestamp
    }

    if (Object.keys(patch).length) {
      await patchTransfer(row.id, patch)
      cleared += 1
    }
  }

  return {
    cleared,
    transfers: await listInventoryTransfersForSheet(worldId, entityId)
  }
}

export async function handleInventoryTransferAction(worldId: string, entityId: string, body: any = {}) {
  const action = text(body?.action || 'offer').toLowerCase()

  if (action === 'targets') {
    return await listTransferTargets(worldId, entityId)
  }

  if (action === 'offer') {
    return await offerInventoryTransfer(worldId, entityId, body)
  }

  if (action === 'accept') {
    return await acceptInventoryTransfer(worldId, entityId, body?.transferId || body?.transfer_id)
  }

  if (action === 'decline') {
    return await declineInventoryTransfer(worldId, entityId, body?.transferId || body?.transfer_id)
  }

  if (action === 'cancel') {
    return await cancelInventoryTransfer(worldId, entityId, body?.transferId || body?.transfer_id)
  }

  if (action === 'clearhistory' || action === 'clear_history') {
    return await clearInventoryTransferHistory(worldId, entityId)
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Unknown inventory transfer action'
  })
}
