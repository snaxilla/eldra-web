import { directusServiceRequest } from '../../utils/directus'

function extractImageUrl(blocks: any[] = []) {
  for (const block of blocks) {
    const image = block?.data?.image
    if (!image) continue

    if (typeof image === 'string' && image.trim()) {
      return `/api/assets/${image}`
    }

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return null
}

function extractOverviewText(blocks: any[] = []) {
  const overview = blocks.find((block: any) => {
    const key = String(block?.block_key || block?.blockKey || '')
    return key === 'overview'
  })

  return String(overview?.data?.text || '').trim() || null
}

function extractCoreText(blocks: any[] = []) {
  const itemCore = blocks.find((block: any) => String(block?.block_key || '') === 'item_core')
  if (itemCore?.data?.description) return String(itemCore.data.description).trim()

  const spellCore = blocks.find((block: any) => String(block?.block_key || '') === 'spell_core')
  if (spellCore?.data?.description) return String(spellCore.data.description).trim()

  return null
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
        world_id: { _eq: worldId }
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
        'created_at',
        'updated_at',
        'image'
      ].join(',')
    }
  })

  const rows = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []
  const entityIds = rows.map((row: any) => row.id).filter(Boolean)

  let blocks: any[] = []
  if (entityIds.length) {
    const blocksRes = await directusServiceRequest('/items/block_instances', {
      method: 'GET',
      query: {
        filter: {
          entity_id: { _in: entityIds }
        },
        sort: 'entity_id,sort',
        limit: -1,
        fields: '*'
      }
    })

    blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
  }

  const blocksByEntityId = new Map<number, any[]>()

  for (const block of blocks) {
    const entityId = Number(block.entity_id)
    if (!blocksByEntityId.has(entityId)) {
      blocksByEntityId.set(entityId, [])
    }
    blocksByEntityId.get(entityId)!.push(block)
  }

  return rows.map((row: any) => {
    const entityBlocks = blocksByEntityId.get(Number(row.id)) || []
    const derivedImageUrl = row?.image ? `/api/assets/${row.image}` : extractImageUrl(entityBlocks)
    const overviewText = extractOverviewText(entityBlocks)
    const coreText = extractCoreText(entityBlocks)

    return {
      ...row,
      blocks: entityBlocks,
      imageUrl: derivedImageUrl,
      image_url: derivedImageUrl,
      summary: String(row?.summary || '').trim() || overviewText || coreText || ''
    }
  })
})
