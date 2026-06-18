import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dxFetch } from '../../../utils/entity-factory'

const CLASS_NAMES = [
  'Artificer',
  'Bard',
  'Cleric',
  'Druid',
  'Paladin',
  'Ranger',
  'Sorcerer',
  'Warlock',
  'Wizard'
]

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

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function normalizedKey(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim()
}

function lookupSpellKey(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\{@(?:spell|filter|item|feat|skill|action|variantrule|condition|class|race|creature|damage|sense|status)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalClassName(value: any) {
  const text = normalizedKey(value)

  return CLASS_NAMES.find((name) =>
    text === normalizedKey(name) || text.includes(normalizedKey(name))
  ) || ''
}

function numberOrZero(value: any) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function sourceKey(value: any) {
  return cleanText(value).toLowerCase()
}

function possibleLookupPaths() {
  return [
    '/opt/eldra/datasets/5etools-src/data/generated/gendata-spell-source-lookup.json',
    resolve(process.cwd(), '../datasets/5etools-src/data/generated/gendata-spell-source-lookup.json'),
    resolve(process.cwd(), 'datasets/5etools-src/data/generated/gendata-spell-source-lookup.json'),
    resolve(process.cwd(), 'data/generated/gendata-spell-source-lookup.json')
  ]
}

let cachedLookup: any = null

function loadSpellSourceLookup() {
  if (cachedLookup) return cachedLookup

  const path = possibleLookupPaths().find((candidate) => existsSync(candidate))

  if (!path) {
    cachedLookup = {}
    return cachedLookup
  }

  try {
    cachedLookup = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    cachedLookup = {}
  }

  return cachedLookup
}

function directClassSourcesForSpell(lookupEntry: any) {
  const out = new Set<string>()
  const classData = asObject(lookupEntry?.class)

  for (const [source, classMap] of Object.entries(classData)) {
    const classes = asObject(classMap)

    for (const [className, enabled] of Object.entries(classes)) {
      if (enabled) out.add(`${source}:${className}`)
    }
  }

  return out
}

function directClassNamesForSpell(lookupEntry: any) {
  const out = new Set<string>()

  for (const token of directClassSourcesForSpell(lookupEntry)) {
    const className = token.split(':').slice(1).join(':')
    if (className) out.add(className)
  }

  return Array.from(out).sort((a, b) => a.localeCompare(b))
}

function spellAllowedForClass(lookupEntry: any, className: string) {
  if (!className) return false

  const wanted = normalizedKey(className)
  const directClassNames = directClassNamesForSpell(lookupEntry)

  return directClassNames.some((name) => normalizedKey(name) === wanted)
}

function blockData(blocks: any[], key: string) {
  const block = blocks.find((item: any) =>
    String(item?.block_key || item?.blockKey || '') === key
  )

  return asObject(block?.data)
}

async function fetchSpellEntities(worldId: string) {
  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', String(worldId))
  params.set('filter[entity_type][_eq]', 'spell')
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
    params.set('filter[block_key][_in]', 'spell_core,import_source')
    params.set('fields', 'id,entity_id,block_key,data')
    params.set('limit', '-1')

    const res = await dxFetch(`/items/block_instances?${params.toString()}`).catch(() => null)
    if (Array.isArray(res?.data)) out.push(...res.data)
  }

  return out
}

function spellOptionFromEntity(entity: any, blocks: any[], requestedClass: string, lookup: any) {
  const spellCore = blockData(blocks, 'spell_core')
  const importSource = blockData(blocks, 'import_source')
  const raw = asObject(parseJsonish(importSource.raw_json ?? importSource.rawJson))

  const title = cleanText(entity?.title || spellCore.name || raw.name)
  const source = cleanText(raw.source || importSource.source_book || importSource.source || '')
  const lookupEntry = asObject(lookup?.[sourceKey(source)]?.[lookupSpellKey(title)])
  const directClassNames = directClassNamesForSpell(lookupEntry)

  if (!title || !source || !spellAllowedForClass(lookupEntry, requestedClass)) {
    return null
  }

  return {
    id: String(entity.id),
    value: String(entity.id),
    title,
    label: title,
    level: numberOrZero(spellCore.level ?? raw.level),
    source,
    sourceBook: source,
    slug: cleanText(entity.slug),
    summary: cleanText(entity.summary),
    classNames: directClassNames,
    classSources: Array.from(directClassSourcesForSpell(lookupEntry)).sort(),
    classListSource: '5etools-generated-lookup',
    legalForClass: requestedClass
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event)
  const requestedClass = canonicalClassName(query.className || query.class || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  if (!requestedClass) {
    return []
  }

  const lookup = loadSpellSourceLookup()
  const spellEntities = await fetchSpellEntities(worldId)
  const entityIds = spellEntities.map((entity: any) => String(entity.id)).filter(Boolean)
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

  return spellEntities
    .map((entity: any) =>
      spellOptionFromEntity(
        entity,
        blocksByEntityId.get(String(entity.id)) || [],
        requestedClass,
        lookup
      )
    )
    .filter(Boolean)
    .sort((a: any, b: any) =>
      Number(a.level || 0) - Number(b.level || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    )
})
