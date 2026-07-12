import { directusServiceRequest } from '../../../../utils/directus'

function intOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : null
}

function text(value: any) {
  return String(value ?? '').trim()
}

async function loadEntities(worldId: string, ids: any[]) {
  const wanted = Array.from(new Set(
    ids
      .map((id) => intOrNull(id))
      .filter((id): id is number => Boolean(id))
  ))

  const map = new Map<string, any>()
  if (!wanted.length) return map

  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { id: { _in: wanted } }
        ]
      },
      limit: -1,
      fields: 'id,title,slug,entity_type,summary,image,world_id,status,visibility'
    }
  })

  for (const entity of Array.isArray(res?.data) ? res.data : []) {
    map.set(String(entity.id), {
      id: entity.id,
      entityId: entity.id,
      title: entity.title || 'Untitled',
      name: entity.title || 'Untitled',
      slug: entity.slug || '',
      entityType: entity.entity_type || 'entity',
      entity_type: entity.entity_type || 'entity',
      summary: entity.summary || '',
      imageUrl: entity.image ? `/api/assets/${entity.image}` : '',
      image_url: entity.image ? `/api/assets/${entity.image}` : '',
      url: `/worlds/${worldId}/entities/${entity.id}`,
      resolved: true
    })
  }

  return map
}

function normalizeTransfer(row: any, entities: Map<string, any>) {
  const sourceEntityId = String(row?.source_entity_id || '')
  const targetEntityId = String(row?.target_entity_id || '')

  return {
    id: row?.id,
    worldId: row?.world_id,
    sourceSheetId: row?.source_sheet_id,
    targetSheetId: row?.target_sheet_id,
    sourceEntityId,
    targetEntityId,
    source: entities.get(sourceEntityId) || null,
    target: entities.get(targetEntityId) || null,
    itemName: text(row?.item_name || row?.itemName || 'Item'),
    quantity: Number(row?.quantity || 1),
    status: text(row?.status || 'offered'),
    message: text(row?.message || ''),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    acceptedAt: row?.accepted_at || null,
    declinedAt: row?.declined_at || null,
    cancelledAt: row?.cancelled_at || null,
    completedAt: row?.completed_at || null
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event)
  const limit = Math.max(1, Math.min(200, Number(query.limit || 50)))

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  try {
    const res = await directusServiceRequest('/items/character_sheet_inventory_transfers', {
      method: 'GET',
      query: {
        filter: {
          world_id: { _eq: Number(worldId) }
        },
        sort: '-updated_at,-created_at,-id',
        limit,
        fields: '*'
      }
    })

    const rows = Array.isArray(res?.data) ? res.data : []
    const entities = await loadEntities(
      worldId,
      rows.flatMap((row: any) => [row?.source_entity_id, row?.target_entity_id])
    )

    const transfers = rows.map((row: any) => normalizeTransfer(row, entities))

    return {
      worldId,
      count: transfers.length,
      transfers
    }
  } catch (error: any) {
    const message = String(error?.message || '').toLowerCase()

    if (message.includes('character_sheet_inventory_transfers') || message.includes('collection')) {
      return {
        worldId,
        count: 0,
        transfers: [],
        schemaMissing: true
      }
    }

    throw error
  }
})
