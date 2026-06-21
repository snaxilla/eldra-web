import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { directusServiceRequest } from '../../../utils/directus'

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function dxFetch(path: string, options: any = {}) {
  return await directusServiceRequest(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    }
  })
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

function cleanText(value: any) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).join(' ')
  }

  if (value && typeof value === 'object') {
    if (value.name || value.title) return cleanText(value.name || value.title)
    if (value.entries) return cleanText(value.entries)
    return ''
  }

  return String(value ?? '')
    .replace(/\{@(?:class|subclass|classFeature|subclassFeature|feat|spell|item|filter|book|action|race|species)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/[#*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedKey(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(value: any) {
  return normalizedKey(value)
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function blockData(blocks: any[], key: string) {
  const block = blocks.find((item: any) =>
    String(item?.block_key || item?.blockKey || '') === key
  )

  return asObject(block?.data)
}

function oneLineSummary(value: any, limit = 320) {
  const text = cleanText(value)
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

async function fetchEntity(worldId: string, entityId: string) {
  const params = new URLSearchParams()
  params.set('fields', 'id,title,entity_type,world_id')

  const res = await dxFetch(`/items/entities/${entityId}?${params.toString()}`).catch(() => null)
  const entity = res?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) return null

  return entity
}

async function fetchBlocksForEntityIds(entityIds: string[]) {
  const out: any[] = []
  const chunkSize = 75

  for (let index = 0; index < entityIds.length; index += chunkSize) {
    const chunk = entityIds.slice(index, index + chunkSize)
    if (!chunk.length) continue

    const params = new URLSearchParams()
    params.set('filter[entity_id][_in]', chunk.join(','))
    params.set('filter[block_key][_in]', 'subclass_core,import_source')
    params.set('fields', 'id,entity_id,block_key,data')
    params.set('limit', '-1')

    const res = await dxFetch(`/items/block_instances?${params.toString()}`).catch(() => null)
    if (Array.isArray(res?.data)) out.push(...res.data)
  }

  return out
}

async function fetchSubclassEntities(worldId: string) {
  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', String(worldId))
  params.set('filter[entity_type][_eq]', 'subclass')
  params.set('fields', 'id,title,slug,summary,entity_type,world_id')
  params.set('limit', '-1')
  params.set('sort', 'title')

  const res = await dxFetch(`/items/entities?${params.toString()}`).catch(() => null)
  return Array.isArray(res?.data) ? res.data : []
}

function rawSubclassClassNames(entity: any, blocks: any[]) {
  const subclassCore = blockData(blocks, 'subclass_core')
  const importSource = blockData(blocks, 'import_source')
  const raw = asObject(parseJsonish(importSource.raw_json ?? importSource.rawJson))
  const names = [
    subclassCore.className,
    subclassCore.class_name,
    subclassCore.parentClass,
    subclassCore.parent_class,
    subclassCore.class,
    raw.className,
    raw.class_name,
    raw.class,
    raw.parentClass,
    raw.parent_class
  ]

  return names.map(cleanText).filter(Boolean)
}

function optionFromSubclassEntity(entity: any, blocks: any[]) {
  const subclassCore = blockData(blocks, 'subclass_core')
  const importSource = blockData(blocks, 'import_source')
  const raw = asObject(parseJsonish(importSource.raw_json ?? importSource.rawJson))

  const title = cleanText(
    entity.title ||
    subclassCore.name ||
    subclassCore.shortName ||
    raw.name ||
    raw.shortName ||
    'Untitled Subclass'
  )

  const source = cleanText(raw.source || importSource.source_book || importSource.source || '')
  const page = cleanText(raw.page || importSource.source_page || importSource.page || '')
  const summary = oneLineSummary(
    entity.summary ||
    subclassCore.summary ||
    subclassCore.description ||
    raw.summary ||
    raw.entries
  )

  return {
    id: String(entity.id),
    value: String(entity.id),
    title,
    label: title,
    slug: cleanText(entity.slug),
    summary,
    source,
    sourceBook: source,
    page,
    sourcePage: page,
    classNames: rawSubclassClassNames(entity, blocks),
    entityType: 'subclass',
    directusEntity: true
  }
}

function localClassDataDirs() {
  return [
    process.env.ELDRA_5ETOOLS_CLASS_DATA_DIR || '',
    process.env.ELDRA_5ETOOLS_DATA_DIR ? join(process.env.ELDRA_5ETOOLS_DATA_DIR, 'class') : '',
    '/opt/eldra/datasets/5etools-src/data/class',
    join(process.cwd(), 'datasets/5etools-src/data/class'),
    join(process.cwd(), '../datasets/5etools-src/data/class')
  ].filter(Boolean)
}

function localClassFiles() {
  for (const dir of localClassDataDirs()) {
    if (!existsSync(dir)) continue

    return readdirSync(dir)
      .filter((name) => /^class-.*\.json$/i.test(name))
      .map((name) => join(dir, name))
  }

  return []
}

function classFileMatchesWanted(data: any, wantedKey: string) {
  if (!wantedKey) return true

  const classes = Array.isArray(data?.class) ? data.class : []

  return classes.some((entry: any) =>
    normalizedKey(entry?.name) === wantedKey
  )
}

function subclassMatchesWanted(raw: any, wantedKey: string, fileMatches: boolean) {
  if (!wantedKey) return true

  const classNames = [
    raw.className,
    raw.class_name,
    raw.class,
    raw.parentClass,
    raw.parent_class
  ].map(normalizedKey).filter(Boolean)

  if (classNames.includes(wantedKey)) return true

  // Some class files omit className because all subclasses in the file belong to the file class.
  return fileMatches
}

function localSubclassTitle(raw: any) {
  const name = cleanText(raw.name || raw.shortName || raw.title)
  if (!name) return ''

  return name
}

function optionFromLocalSubclass(raw: any, wantedClassName: string) {
  const title = localSubclassTitle(raw)
  const source = cleanText(raw.source || raw.classSource || '')
  const page = cleanText(raw.page || raw.classPage || '')
  const className = cleanText(raw.className || raw.class_name || raw.class || wantedClassName || '')

  return {
    id: `lookup:${slugify(`${className}-${title}-${source}`)}`,
    value: `lookup:${slugify(`${className}-${title}-${source}`)}`,
    title,
    label: title,
    slug: slugify(title),
    summary: oneLineSummary(raw.entries || raw.fluff?.entries || ''),
    source,
    sourceBook: source,
    page,
    sourcePage: page,
    classNames: [className].filter(Boolean),
    entityType: 'subclass',
    directusEntity: false,
    lookupOnly: true
  }
}

function localSubclassOptions(wantedClassName: string) {
  const wantedKey = normalizedKey(wantedClassName)
  const out: any[] = []

  for (const file of localClassFiles()) {
    let data: any = null

    try {
      data = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }

    const subclasses = Array.isArray(data?.subclass) ? data.subclass : []
    if (!subclasses.length) continue

    const fileMatches = classFileMatchesWanted(data, wantedKey)

    for (const raw of subclasses) {
      if (!subclassMatchesWanted(raw, wantedKey, fileMatches)) continue

      const option = optionFromLocalSubclass(raw, wantedClassName)
      if (!option.title) continue

      out.push(option)
    }
  }

  return out
}

function optionMatchesWanted(option: any, wantedClassName: string) {
  const wantedKey = normalizedKey(wantedClassName)
  if (!wantedKey) return true

  const classKeys = (option.classNames || []).map(normalizedKey).filter(Boolean)

  if (classKeys.includes(wantedKey)) return true

  // Fallback for imperfect imported subclass metadata.
  const titleKey = normalizedKey(option.title)
  if (wantedKey === 'druid' && titleKey.startsWith('circle of')) return true
  if (wantedKey === 'bard' && titleKey.startsWith('college of')) return true
  if (wantedKey === 'cleric' && titleKey.includes('domain')) return true
  if (wantedKey === 'paladin' && titleKey.startsWith('oath of')) return true
  if (wantedKey === 'ranger' && titleKey.includes('ranger')) return true

  return false
}

function dedupeSubclassOptions(options: any[]) {
  const seen = new Set<string>()
  const out: any[] = []

  for (const option of options) {
    const key = [
      normalizedKey(option.title),
      normalizedKey(option.source),
      normalizedKey((option.classNames || []).join(' '))
    ].join('|')

    if (!option.title || seen.has(key)) continue

    seen.add(key)
    out.push(option)
  }

  return out.sort((a, b) =>
    String(a.title || '').localeCompare(String(b.title || '')) ||
    String(a.source || '').localeCompare(String(b.source || ''))
  )
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event)
  const classEntityId = String(query.classEntityId || query.class_entity_id || '').trim()
  const className = cleanText(query.className || query.class_name || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const classEntity = classEntityId
    ? await fetchEntity(worldId, classEntityId).catch(() => null)
    : null

  const wantedClassName = cleanText(className || classEntity?.title || '')

  const subclassEntities = await fetchSubclassEntities(worldId)
  const entityIds = subclassEntities.map((entity: any) => String(entity.id)).filter(Boolean)
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

  const importedOptions = subclassEntities
    .map((entity: any) => optionFromSubclassEntity(entity, blocksByEntityId.get(String(entity.id)) || []))
    .filter((option: any) => optionMatchesWanted(option, wantedClassName))

  const fallbackOptions = localSubclassOptions(wantedClassName)

  return dedupeSubclassOptions([
    ...importedOptions,
    ...fallbackOptions
  ])
})
