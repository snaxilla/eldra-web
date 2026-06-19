import { dxFetch } from '../../../utils/entity-factory'

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseJsonish(value: any): any {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(
        trimmed
          .replace(/:\s*True\b/g, ': true')
          .replace(/:\s*False\b/g, ': false')
          .replace(/:\s*None\b/g, ': null')
      )
    } catch {
      return value
    }
  }

  return value
}

function clean5eText(value: any) {
  return String(value ?? '')
    .replace(/\{@(?:feat|skill|item|spell|filter|book|action|variantrule|condition|class|race|creature|damage|sense|status|classFeature|subclassFeature)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/[#*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: any) {
  return clean5eText(value)
    .replace(/\|[A-Za-z0-9_.:-]+(?:\|[^,\n;)]*)?/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b([A-Za-z]+)'S\b/g, "$1's")
}

function entryText(value: any): string {
  const parsed = parseJsonish(value)

  if (!parsed) return ''

  if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
    return clean5eText(parsed)
  }

  if (Array.isArray(parsed)) {
    return parsed.map(entryText).filter(Boolean).join('\n\n')
  }

  if (typeof parsed === 'object') {
    const parts: string[] = []

    if (parsed.name) parts.push(`## ${clean5eText(parsed.name)}`)
    if (parsed.entry) parts.push(entryText(parsed.entry))
    if (parsed.entries) parts.push(entryText(parsed.entries))
    if (parsed.items) parts.push(entryText(parsed.items))
    if (parsed.rows) parts.push(entryText(parsed.rows))
    if (parsed.description) parts.push(entryText(parsed.description))
    if (parsed.summary) parts.push(entryText(parsed.summary))
    if (parsed.text) parts.push(entryText(parsed.text))
    if (parsed.detail) parts.push(entryText(parsed.detail))

    return parts.filter(Boolean).join('\n\n')
  }

  return ''
}

function blockData(blocks: any[], key: string) {
  const block = blocks.find((item: any) =>
    String(item?.block_key || item?.blockKey || '') === key
  )

  return asObject(block?.data)
}

async function fetchFeatEntities(worldId: string) {
  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', String(worldId))
  params.set('filter[entity_type][_eq]', 'feat')
  params.set('fields', 'id,title,slug,summary,entity_type')
  params.set('limit', '-1')
  params.set('sort', 'title')

  const res = await dxFetch(`/items/entities?${params.toString()}`)
  return Array.isArray(res?.data) ? res.data : []
}

async function fetchBlocksForEntityIds(entityIds: string[]) {
  const out: any[] = []
  const chunkSize = 75

  for (let index = 0; index < entityIds.length; index += chunkSize) {
    const chunk = entityIds.slice(index, index + chunkSize)
    if (!chunk.length) continue

    const params = new URLSearchParams()
    params.set('filter[entity_id][_in]', chunk.join(','))
    params.set('filter[block_key][_in]', 'feat_core,import_source')
    params.set('fields', 'id,entity_id,block_key,data')
    params.set('limit', '-1')

    const res = await dxFetch(`/items/block_instances?${params.toString()}`).catch(() => null)
    if (Array.isArray(res?.data)) out.push(...res.data)
  }

  return out
}

function optionFromFeatEntity(entity: any, blocks: any[]) {
  const featCore = blockData(blocks, 'feat_core')
  const importSource = blockData(blocks, 'import_source')
  const raw = asObject(parseJsonish(importSource.raw_json ?? importSource.rawJson))

  const title = clean5eText(entity?.title || featCore.name || raw.name || 'Untitled Feat')
  const source = clean5eText(raw.source || importSource.source_book || importSource.source || '')
  const page = clean5eText(raw.page || importSource.source_page || importSource.page || '')
  const prerequisite = clean5eText(featCore.prerequisite || raw.prerequisite || '')
  const description = entryText(featCore.description || raw.entries || raw.description || entity.summary || '')

  return {
    id: String(entity.id),
    value: String(entity.id),
    title,
    label: title,
    slug: clean5eText(entity.slug),
    summary: clean5eText(entity.summary),
    source,
    sourceBook: source,
    page,
    sourcePage: page,
    prerequisite,
    description,
    category: titleCase(raw.category || raw.featCategory || raw.categoryLabel || ''),
    rawName: clean5eText(raw.name || ''),
    entityType: 'feat'
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const featEntities = await fetchFeatEntities(worldId)
  const entityIds = featEntities.map((entity: any) => String(entity.id)).filter(Boolean)
  const blocks = await fetchBlocksForEntityIds(entityIds)
  const blocksByEntityId = new Map<string, any[]>()

  for (const block of blocks) {
    const key = String(block?.entity_id || '')
    if (!key) continue

    if (!blocksByEntityId.has(key)) {
      blocksByEntityId.set(key, [])
    }

    blocksByEntityId.get(key)?.push(block)
  }

  return featEntities
    .map((entity: any) => optionFromFeatEntity(entity, blocksByEntityId.get(String(entity.id)) || []))
    .sort((a: any, b: any) => String(a.title || '').localeCompare(String(b.title || '')))
})
