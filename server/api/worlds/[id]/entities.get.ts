import fs from 'node:fs'
import path from 'node:path'
import { directusServiceRequest } from '../../../utils/directus'

const CLASS_DATA_DIR = '/opt/eldra/datasets/5etools-src/data/class'

function readJsonSafe(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function sourceFromSlug(slug: string) {
  const parts = String(slug || '').split('-')
  const last = parts[parts.length - 1]
  return last ? last.toUpperCase() : ''
}

function classNameFromSlug(slug: string, title: string) {
  const source = sourceFromSlug(slug).toLowerCase()
  let raw = String(slug || '').toLowerCase()
  if (source && raw.endsWith(`-${source}`)) raw = raw.slice(0, -(source.length + 1))
  return raw || String(title || '').toLowerCase()
}

function classFluffImageUrl(row: any) {
  if (String(row?.entity_type || '').toLowerCase() !== 'class') return null

  const slugName = classNameFromSlug(row?.slug, row?.title)
  const source = sourceFromSlug(row?.slug)
  const filePath = path.join(CLASS_DATA_DIR, `fluff-class-${slugName}.json`)
  const fluff = readJsonSafe(filePath)
  const list = Array.isArray(fluff?.classFluff) ? fluff.classFluff : []

  const preferred =
    list.find((item: any) =>
      String(item?.name || '').toLowerCase() === String(row?.title || '').toLowerCase() &&
      String(item?.source || '').toUpperCase() === source
    ) ||
    list.find((item: any) =>
      String(item?.name || '').toLowerCase() === String(row?.title || '').toLowerCase() &&
      Array.isArray(item?.images) &&
      item.images.length
    )

  const image = Array.isArray(preferred?.images) ? preferred.images[0] : null
  const imagePath = image?.href?.path

  return imagePath ? `/api/5etools-img/${imagePath}` : null
}

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
    const derivedImageUrl = row?.image ? `/api/assets/${row.image}` : extractImageUrl(entityBlocks) || classFluffImageUrl(row)
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
