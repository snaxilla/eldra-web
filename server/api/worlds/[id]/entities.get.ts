import fs from 'node:fs'
import path from 'node:path'
import { directusServiceRequest } from '../../../utils/directus'

const CLASS_DATA_DIR = '/opt/eldra/datasets/5etools-src/data/class'
const RACE_FLUFF_FILE = '/opt/eldra/datasets/5etools-src/data/fluff-races.json'
const SPELL_FLUFF_DIR = '/opt/eldra/datasets/5etools-src/data/spells'

const SUMMARY_BLOCK_KEYS = [
  'overview',
  'item_core',
  'spell_core',
  'location_core',
  'character_core',
  'article_override'
]

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

function raceFluffImageUrl(row: any) {
  const type = String(row?.entity_type || '').toLowerCase()
  if (type !== 'species' && type !== 'race') return null

  const source = sourceFromSlug(row?.slug)
  const title = String(row?.title || '').trim().toLowerCase()
  const fluff = readJsonSafe(RACE_FLUFF_FILE)
  const list = Array.isArray(fluff?.raceFluff) ? fluff.raceFluff : []

  const preferred =
    list.find((item: any) =>
      String(item?.name || '').trim().toLowerCase() === title &&
      String(item?.source || '').toUpperCase() === source &&
      Array.isArray(item?.images) &&
      item.images.length
    ) ||
    list.find((item: any) =>
      String(item?.name || '').trim().toLowerCase() === title &&
      Array.isArray(item?.images) &&
      item.images.length
    )

  const image = Array.isArray(preferred?.images) ? preferred.images[0] : null
  const imagePath = image?.href?.path

  return imagePath ? `/api/5etools-img/${imagePath}` : null
}

function spellFluffImageUrl(row: any) {
  if (String(row?.entity_type || '').toLowerCase() !== 'spell') return null

  const source = sourceFromSlug(row?.slug)
  if (!source) return null

  const filePath = path.join(SPELL_FLUFF_DIR, `fluff-spells-${source.toLowerCase()}.json`)
  const fluff = readJsonSafe(filePath)
  const list = Array.isArray(fluff?.spellFluff) ? fluff.spellFluff : []
  const title = String(row?.title || '').trim().toLowerCase()

  const found = list.find((item: any) =>
    String(item?.name || '').trim().toLowerCase() === title &&
    Array.isArray(item?.images) &&
    item.images.length
  )

  const imagePath = found?.images?.[0]?.href?.path
  return imagePath ? `/api/5etools-img/${imagePath}` : null
}

function entityImageUrl(row: any) {
  const image = row?.image

  if (!image) return null
  if (typeof image === 'string' && image.trim()) return `/api/assets/${image}`
  if (typeof image === 'number') return `/api/assets/${image}`

  if (typeof image === 'object') {
    if (image.image_url) return image.image_url
    if (image.file_id) return `/api/assets/${image.file_id}`
    if (image.id) return `/api/assets/${image.id}`
  }

  return null
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

function cleanPreviewText(value: any, limit = 420) {
  const text = String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function blockKey(block: any) {
  return String(block?.block_key || block?.blockKey || '')
}

function extractOverviewText(blocks: any[] = []) {
  const overview = blocks.find((block: any) => blockKey(block) === 'overview')
  return cleanPreviewText(overview?.data?.text || '')
}

function extractCoreText(blocks: any[] = []) {
  for (const key of ['item_core', 'spell_core', 'location_core', 'character_core']) {
    const block = blocks.find((item: any) => blockKey(item) === key)
    const data = block?.data || {}

    const text =
      data.summary ||
      data.description ||
      data.text ||
      data.entry ||
      ''

    const clean = cleanPreviewText(text)
    if (clean) return clean
  }

  const articleOverride = blocks.find((item: any) => blockKey(item) === 'article_override')
  const articleText = cleanPreviewText(articleOverride?.data?.article || articleOverride?.data?.body || '')
  if (articleText) return articleText

  return ''
}

function shouldUseSummaryMode(query: Record<string, any>) {
  const mode = String(query.mode || '').trim().toLowerCase()
  const summary = String(query.summary || '').trim().toLowerCase()
  const includeBlocks = String(query.includeBlocks || '').trim().toLowerCase()

  return (
    mode === 'summary' ||
    summary === '1' ||
    summary === 'true' ||
    includeBlocks === '0' ||
    includeBlocks === 'false'
  )
}


function normalizeTypeFilter(value: any) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '')

  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event) as Record<string, any>
  const summaryMode = shouldUseSummaryMode(query)

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const typeFilter = normalizeTypeFilter(query.type || query.types || query.entityType || query.entityTypes)

  const entityFilter: Record<string, any> = {
    world_id: { _eq: worldId }
  }

  if (typeFilter.length) {
    entityFilter.entity_type = { _in: typeFilter }
  }

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: entityFilter,
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
    const filter: any = {
      entity_id: { _in: entityIds }
    }

    if (summaryMode) {
      filter.block_key = { _in: SUMMARY_BLOCK_KEYS }
    }

    const blocksRes = await directusServiceRequest('/items/block_instances', {
      method: 'GET',
      query: {
        filter,
        sort: 'entity_id,sort',
        limit: -1,
        fields: summaryMode ? 'entity_id,block_key,data' : '*'
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
    const derivedImageUrl =
      entityImageUrl(row) ||
      extractImageUrl(entityBlocks) ||
      classFluffImageUrl(row) ||
      raceFluffImageUrl(row) ||
      spellFluffImageUrl(row)

    const overviewText = extractOverviewText(entityBlocks)
    const coreText = extractCoreText(entityBlocks)
    const summary = cleanPreviewText(row?.summary || overviewText || coreText || '')

    if (summaryMode) {
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
        summary,
        created_at: row.created_at,
        updated_at: row.updated_at,
        image: row.image,
        imageUrl: derivedImageUrl,
        image_url: derivedImageUrl
      }
    }

    return {
      ...row,
      blocks: entityBlocks,
      imageUrl: derivedImageUrl,
      image_url: derivedImageUrl,
      summary: String(row?.summary || '').trim() || overviewText || coreText || ''
    }
  })
})
