import { directusServiceRequest } from './directus'
import { normalizeDnd5eItemFromEntity } from './dnd5e-items'

let inventoryFieldCache: Set<string> | null = null

function textOrNull(value: any) {
  const text = String(value ?? '').trim()
  return text || null
}

function boolValue(value: any) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on'
}

function intOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null

  return Math.floor(parsed)
}

function positiveInt(value: any, fallback = 1) {
  const parsed = intOrNull(value)
  if (parsed === null || parsed < 1) return fallback
  return parsed
}

async function inventoryFields() {
  if (inventoryFieldCache) return inventoryFieldCache

  try {
    const res = await directusServiceRequest('/fields/character_sheet_inventory', {
      method: 'GET'
    })

    const fields = new Set<string>(
      (Array.isArray(res?.data) ? res.data : [])
        .map((field: any) => String(field?.field || '').trim())
        .filter(Boolean)
    )

    if (fields.size) {
      inventoryFieldCache = fields
      return fields
    }
  } catch {}

  inventoryFieldCache = new Set([
    'id',
    'sheet_id',
    'item_entity_id',
    'name',
    'quantity',
    'equipped',
    'attuned',
    'container',
    'notes',
    'sort',
    'data'
  ])

  return inventoryFieldCache
}

function itemLinkField(fields: Set<string>) {
  return [
    'item_entity_id',
    'entity_item_id',
    'item_entity',
    'inventory_item_entity',
    'linked_item_entity_id'
  ].find((field) => fields.has(field)) || null
}


function asPlainObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizedItemDataForLinkedItem(linkedItem: any, previousData: any = null) {
  const base = { ...asPlainObject(previousData) }
  const profile = linkedItem?.itemProfile || linkedItem?.profile || linkedItem?.normalizedItem || null

  if (!profile) return base

  return {
    ...base,
    itemProfile: profile,
    normalizedItem: profile,
    profile,
    itemEntityId: linkedItem?.id || profile?.id || null,
    item_entity_id: linkedItem?.id || profile?.id || null
  }
}

function pickSupported(fields: Set<string>, payload: Record<string, any>) {
  const picked: Record<string, any> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (fields.has(key)) {
      picked[key] = value
    }
  }

  return picked
}

export async function loadActiveCharacterSheet(worldId: string | number, entityId: string | number) {
  const res = await directusServiceRequest('/items/character_sheets', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { entity_id: { _eq: Number(entityId) } },
          { is_active: { _eq: true } }
        ]
      },
      sort: '-id',
      limit: 1,
      fields: '*'
    }
  })

  const sheet = Array.isArray(res?.data) ? (res.data[0] || null) : null

  if (!sheet?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Active character sheet not found'
    })
  }

  return sheet
}

export async function loadInventoryRows(sheetId: any) {
  if (!sheetId) return []

  const params = new URLSearchParams()
  params.set('filter[sheet_id][_eq]', String(sheetId))
  params.set('sort', 'sort,id')
  params.set('limit', '-1')
  params.append('fields[]', '*')

  const res = await directusServiceRequest(`/items/character_sheet_inventory?${params.toString()}`, {
    method: 'GET'
  })

  return Array.isArray(res?.data) ? res.data : []
}

async function loadWorldItemEntity(worldId: string | number, itemEntityId: any) {
  const parsedId = intOrNull(itemEntityId)
  if (!parsedId) return null

  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { id: { _eq: parsedId } },
          { world_id: { _eq: Number(worldId) } },
          { entity_type: { _eq: 'item' } }
        ]
      },
      limit: 1,
      fields: 'id,title,slug,entity_type,world_id,system_key,summary,image'
    }
  })

  const entity = Array.isArray(res?.data) ? (res.data[0] || null) : null
  if (!entity?.id) return null

  const blocksRes = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter: {
        entity_id: { _eq: parsedId }
      },
      sort: 'sort,id',
      limit: -1,
      fields: '*'
    }
  })

  const blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
  const entityWithBlocks = {
    ...entity,
    blocks
  }

  let itemProfile: any = null

  try {
    itemProfile = normalizeDnd5eItemFromEntity(entityWithBlocks)
  } catch {}

  return {
    ...entityWithBlocks,
    itemProfile,
    normalizedItem: itemProfile,
    profile: itemProfile
  }
}

async function loadInventoryRow(sheetId: any, inventoryId: any) {
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

export async function createInventoryItemForSheet(worldId: string, entityId: string, body: any = {}) {
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const fields = await inventoryFields()
  const linkedItem = await loadWorldItemEntity(worldId, body?.itemEntityId ?? body?.item_entity_id)
  const linkField = itemLinkField(fields)

  const payload: Record<string, any> = {
    sheet_id: Number(sheet.id),
    name: textOrNull(body?.name) || linkedItem?.title || 'Item',
    quantity: positiveInt(body?.quantity, 1),
    equipped: boolValue(body?.equipped),
    attuned: boolValue(body?.attuned),
    container: textOrNull(body?.container),
    notes: textOrNull(body?.notes),
    sort: intOrNull(body?.sort) ?? 100
  }

  if (linkedItem?.id && linkField) {
    payload[linkField] = Number(linkedItem.id)
  }

  const inventoryDataPayload = normalizedItemDataForLinkedItem(linkedItem, body?.data)
  if (fields.has('data') && Object.keys(inventoryDataPayload).length) {
    payload.data = inventoryDataPayload
  }

  const created = await directusServiceRequest('/items/character_sheet_inventory', {
    method: 'POST',
    body: pickSupported(fields, payload)
  })

  return {
    item: created?.data || null,
    inventory: await loadInventoryRows(sheet.id)
  }
}

export async function updateInventoryItemForSheet(worldId: string, entityId: string, inventoryId: string, body: any = {}) {
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const row = await loadInventoryRow(sheet.id, inventoryId)
  const fields = await inventoryFields()
  const patch: Record<string, any> = {}

  if (body?.name !== undefined) patch.name = textOrNull(body.name) || row.name || 'Item'
  if (body?.quantity !== undefined) patch.quantity = positiveInt(body.quantity, 1)
  if (body?.equipped !== undefined) patch.equipped = boolValue(body.equipped)
  if (body?.attuned !== undefined) patch.attuned = boolValue(body.attuned)
  if (body?.container !== undefined) patch.container = textOrNull(body.container)
  if (body?.notes !== undefined) patch.notes = textOrNull(body.notes)
  if (body?.sort !== undefined) patch.sort = intOrNull(body.sort)

  const linkedItem = await loadWorldItemEntity(worldId, body?.itemEntityId ?? body?.item_entity_id)
  const linkField = itemLinkField(fields)

  if (linkedItem?.id && linkField) {
    patch[linkField] = Number(linkedItem.id)

    const linkedItemDataPayload = normalizedItemDataForLinkedItem(linkedItem, row?.data)
    if (fields.has('data') && Object.keys(linkedItemDataPayload).length) {
      patch.data = linkedItemDataPayload
    }
  }

  const updated = await directusServiceRequest(`/items/character_sheet_inventory/${row.id}`, {
    method: 'PATCH',
    body: pickSupported(fields, patch)
  })

  return {
    item: updated?.data || null,
    inventory: await loadInventoryRows(sheet.id)
  }
}

export async function deleteInventoryItemForSheet(worldId: string, entityId: string, inventoryId: string) {
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const row = await loadInventoryRow(sheet.id, inventoryId)

  await directusServiceRequest(`/items/character_sheet_inventory/${row.id}`, {
    method: 'DELETE'
  })

  return {
    deleted: row.id,
    inventory: await loadInventoryRows(sheet.id)
  }
}
