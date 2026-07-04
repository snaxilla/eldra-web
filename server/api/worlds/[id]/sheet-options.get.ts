import { directusServiceRequest } from '../../../utils/directus'

const SHEET_OPTION_TYPES = [
  'class',
  'species',
  'race',
  'background',
  'item',
  'feat',
  'spell'
]

const CORE_BLOCK_KEYS = [
  'class_core',
  'species_core',
  'race_core',
  'background_core',
  'item_core',
  'feat_core',
  'spell_core'
]

function normalizeType(value: any) {
  return String(value || '').trim().toLowerCase()
}

function blockKey(value: any) {
  return String(value?.block_key || value?.blockKey || '').trim()
}

function shouldIncludeImportSource(rowType: string) {
  // Keep item raw data because the current inventory code still uses it as
  // a fallback for type/damage/weight/value details. Do not ship spell raw_json
  // for every spell; selected spell details still fetch the full entity lazily.
  return rowType === 'item'
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: worldId },
        entity_type: { _in: SHEET_OPTION_TYPES }
      },
      sort: 'title',
      limit: -1,
      fields: [
        'id',
        'title',
        'slug',
        'world_id',
        'system_key',
        'entity_type',
        'status',
        'visibility',
        'summary',
        'image'
      ].join(',')
    }
  })

  const rows = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []
  const entityIds = rows.map((row: any) => row.id).filter(Boolean)
  const typeById = new Map<string, string>()

  for (const row of rows) {
    typeById.set(String(row.id), normalizeType(row.entity_type))
  }

  let coreBlocks: any[] = []
  let itemSourceBlocks: any[] = []

  if (entityIds.length) {
    const coreBlocksRes = await directusServiceRequest('/items/block_instances', {
      method: 'GET',
      query: {
        filter: {
          entity_id: { _in: entityIds },
          block_key: { _in: CORE_BLOCK_KEYS }
        },
        sort: 'entity_id,sort',
        limit: -1,
        fields: 'entity_id,block_key,label,sort,repeatable,data'
      }
    })

    coreBlocks = Array.isArray(coreBlocksRes?.data) ? coreBlocksRes.data : []

    const itemIds = rows
      .filter((row: any) => shouldIncludeImportSource(normalizeType(row.entity_type)))
      .map((row: any) => row.id)
      .filter(Boolean)

    if (itemIds.length) {
      const itemSourceRes = await directusServiceRequest('/items/block_instances', {
        method: 'GET',
        query: {
          filter: {
            entity_id: { _in: itemIds },
            block_key: { _eq: 'import_source' }
          },
          sort: 'entity_id,sort',
          limit: -1,
          fields: 'entity_id,block_key,label,sort,repeatable,data'
        }
      })

      itemSourceBlocks = Array.isArray(itemSourceRes?.data) ? itemSourceRes.data : []
    }
  }

  const blocksByEntityId = new Map<string, any[]>()

  for (const block of [...coreBlocks, ...itemSourceBlocks]) {
    const entityId = String(block.entity_id || '')
    if (!entityId) continue

    const rowType = typeById.get(entityId) || ''
    const key = blockKey(block)

    if (key === 'import_source' && !shouldIncludeImportSource(rowType)) {
      continue
    }

    if (!blocksByEntityId.has(entityId)) {
      blocksByEntityId.set(entityId, [])
    }

    blocksByEntityId.get(entityId)!.push({
      entity_id: block.entity_id,
      block_key: key,
      blockKey: key,
      label: block.label,
      sort: block.sort,
      repeatable: block.repeatable,
      data: block.data || {}
    })
  }

  return rows.map((row: any) => {
    const blocks = blocksByEntityId.get(String(row.id)) || []

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      world_id: row.world_id,
      system_key: row.system_key,
      entity_type: row.entity_type,
      entityType: row.entity_type,
      status: row.status,
      visibility: row.visibility,
      summary: row.summary || '',
      image: row.image,
      imageUrl: row.image ? `/api/assets/${row.image}` : '',
      image_url: row.image ? `/api/assets/${row.image}` : '',
      blocks
    }
  })
})
