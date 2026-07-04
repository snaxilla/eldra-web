import { directusServiceRequest } from '../../../../utils/directus'
import { normalizeDnd5eItem } from '../../../../utils/dnd5e-items'

function clean(value: any) {
  return String(value ?? '').trim()
}

function blockKey(block: any) {
  return String(block?.block_key || block?.blockKey || '').trim()
}

function numberLimit(value: any, fallback = 250) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(Math.floor(parsed), 1000))
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event)

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const q = clean(query.q).toLowerCase()
  const category = clean(query.category).toLowerCase()
  const type = clean(query.type).toUpperCase()
  const equippableOnly = ['1', 'true', 'yes'].includes(clean(query.equippable).toLowerCase())
  const limit = numberLimit(query.limit, 250)

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: worldId },
        entity_type: { _eq: 'item' }
      },
      sort: 'title',
      limit: -1,
      fields: 'id,title,slug,world_id,system_key,entity_type,status,visibility,summary,image'
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
          entity_id: { _in: entityIds },
          block_key: { _in: ['item_core', 'import_source'] }
        },
        sort: 'entity_id,sort',
        limit: -1,
        fields: 'entity_id,block_key,data'
      }
    })

    blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
  }

  const blocksByEntityId = new Map<string, any[]>()

  for (const block of blocks) {
    const id = String(block?.entity_id || '')
    if (!id) continue

    if (!blocksByEntityId.has(id)) {
      blocksByEntityId.set(id, [])
    }

    blocksByEntityId.get(id)!.push(block)
  }

  const items = rows.map((row: any) => {
    const rowBlocks = blocksByEntityId.get(String(row.id)) || []
    const itemCore = rowBlocks.find((block: any) => blockKey(block) === 'item_core')?.data || {}
    const raw = rowBlocks.find((block: any) => blockKey(block) === 'import_source')?.data?.raw_json || {}
    const profile = normalizeDnd5eItem({
      entity: row,
      core: itemCore,
      raw
    })

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      entityType: row.entity_type,
      imageUrl: row.image ? `/api/assets/${row.image}` : '',
      profile
    }
  }).filter((item: any) => {
    if (category && item.profile.category !== category) return false
    if (type && item.profile.typeCode !== type) return false
    if (equippableOnly && !item.profile.equippable) return false

    if (q) {
      const haystack = [
        item.title,
        item.slug,
        item.profile.name,
        item.profile.category,
        item.profile.displayType,
        item.profile.rarity,
        item.profile.source,
        ...(Array.isArray(item.profile.tags) ? item.profile.tags : [])
      ].join(' ').toLowerCase()

      if (!haystack.includes(q)) return false
    }

    return true
  })

  const categories: Record<string, number> = {}
  const typeCodes: Record<string, number> = {}

  for (const item of items) {
    categories[item.profile.category] = (categories[item.profile.category] || 0) + 1
    typeCodes[item.profile.typeCode || 'unknown'] = (typeCodes[item.profile.typeCode || 'unknown'] || 0) + 1
  }

  return {
    worldId,
    count: items.length,
    returned: items.slice(0, limit).length,
    filters: {
      q,
      category,
      type,
      equippableOnly,
      limit
    },
    categories,
    typeCodes,
    items: items.slice(0, limit)
  }
})
