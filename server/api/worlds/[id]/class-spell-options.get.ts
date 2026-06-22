import { existsSync, readFileSync } from 'node:fs'
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
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join(' ')
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

function sourceKey(value: any) {
  return String(value ?? '').trim().toLowerCase()
}

function subclassAliases(value: any) {
  const text = cleanText(value)
  const short = text
    .replace(/^Circle of the\s+/i, '')
    .replace(/^Circle of\s+/i, '')
    .replace(/^College of\s+/i, '')
    .replace(/^Oath of the\s+/i, '')
    .replace(/^Oath of\s+/i, '')
    .replace(/^Path of the\s+/i, '')
    .replace(/^Path of\s+/i, '')
    .replace(/^Way of the\s+/i, '')
    .replace(/^Way of\s+/i, '')
    .replace(/^The\s+/i, '')
    .trim()

  return Array.from(new Set([
    normalizedKey(text),
    normalizedKey(short)
  ].filter(Boolean)))
}

function localSpellLookupPath() {
  const candidates = [
    process.env.ELDRA_5ETOOLS_SPELL_SOURCE_LOOKUP || '',
    process.env.ELDRA_5ETOOLS_DATA_DIR ? join(process.env.ELDRA_5ETOOLS_DATA_DIR, 'generated/gendata-spell-source-lookup.json') : '',
    '/opt/eldra/datasets/5etools-src/data/generated/gendata-spell-source-lookup.json',
    join(process.cwd(), 'datasets/5etools-src/data/generated/gendata-spell-source-lookup.json'),
    join(process.cwd(), '../datasets/5etools-src/data/generated/gendata-spell-source-lookup.json')
  ].filter(Boolean)

  return candidates.find((path) => existsSync(path)) || ''
}

let cachedSpellLookup: any = null

function spellSourceLookup() {
  if (cachedSpellLookup) return cachedSpellLookup

  const path = localSpellLookupPath()

  if (!path) {
    cachedSpellLookup = {}
    return cachedSpellLookup
  }

  try {
    cachedSpellLookup = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    cachedSpellLookup = {}
  }

  return cachedSpellLookup
}

function spellLookupEntry(title: any, source: any) {
  const lookup = spellSourceLookup()
  const spellName = normalizedKey(title)
  const preferredSource = sourceKey(source)

  if (preferredSource && lookup?.[preferredSource]?.[spellName]) {
    return lookup[preferredSource][spellName]
  }

  for (const sourceBucket of Object.values(lookup) as any[]) {
    if (sourceBucket?.[spellName]) return sourceBucket[spellName]
  }

  return null
}

function objectHasClass(value: any, className: string) {
  const wanted = normalizedKey(className)
  if (!wanted || !value || typeof value !== 'object') return false

  if (Array.isArray(value)) {
    return value.some((item) => objectHasClass(item, className))
  }

  for (const [key, child] of Object.entries(value)) {
    if (normalizedKey(key) === wanted) return true
    if (child && typeof child === 'object' && objectHasClass(child, className)) return true
  }

  return false
}

function objectHasSubclass(value: any, aliases: string[]) {
  if (!aliases.length || !value || typeof value !== 'object') return false

  if (Array.isArray(value)) {
    return value.some((item) => objectHasSubclass(item, aliases))
  }

  const maybeName = normalizedKey((value as any).name || (value as any).title || '')
  if (maybeName && aliases.includes(maybeName)) return true

  for (const [key, child] of Object.entries(value)) {
    const keyNormalized = normalizedKey(key)
    if (aliases.includes(keyNormalized)) return true

    if (child && typeof child === 'object' && objectHasSubclass(child, aliases)) return true
  }

  return false
}

function objectClassSubclassMatches(value: any, className: string, subclassName: string) {
  const classKey = normalizedKey(className)
  const aliases = subclassAliases(subclassName)

  if (!classKey || !aliases.length || !value || typeof value !== 'object') return false

  if (Array.isArray(value)) {
    return value.some((item) => objectClassSubclassMatches(item, className, subclassName))
  }

  for (const [key, child] of Object.entries(value)) {
    if (normalizedKey(key) === classKey && objectHasSubclass(child, aliases)) return true

    if (child && typeof child === 'object' && objectClassSubclassMatches(child, className, subclassName)) {
      return true
    }
  }

  return false
}

function lookupMatchesClass(entry: any, className: string) {
  if (!entry || !className) return false

  return objectHasClass(entry.class, className) ||
    objectHasClass(entry.classVariant, className)
}

function lookupMatchesSubclass(entry: any, className: string, subclassName: string) {
  if (!entry || !className || !subclassName) return false
  return objectClassSubclassMatches(entry.subclass, className, subclassName)
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
  params.set('fields', 'id,title,slug,summary,entity_type,world_id')
  params.set('limit', '-1')
  params.set('sort', 'title')

  const res = await dxFetch(`/items/entities?${params.toString()}`).catch(() => null)
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

function spellLevelFromBlocks(entity: any, blocks: any[]) {
  const core = blockData(blocks, 'spell_core')
  const raw = asObject(parseJsonish(blockData(blocks, 'import_source').raw_json ?? blockData(blocks, 'import_source').rawJson))
  const parsed = Number(core.level ?? core.spell_level ?? raw.level ?? 0)

  return Number.isFinite(parsed) ? parsed : 0
}

function spellSourceFromBlocks(entity: any, blocks: any[]) {
  const importSource = blockData(blocks, 'import_source')
  const raw = asObject(parseJsonish(importSource.raw_json ?? importSource.rawJson))

  return cleanText(
    raw.source ||
    importSource.source_book ||
    importSource.source ||
    entity.source ||
    ''
  )
}

function spellPageFromBlocks(blocks: any[]) {
  const importSource = blockData(blocks, 'import_source')
  const raw = asObject(parseJsonish(importSource.raw_json ?? importSource.rawJson))

  return cleanText(raw.page || importSource.source_page || importSource.page || '')
}

function spellSummary(entity: any, blocks: any[]) {
  const core = blockData(blocks, 'spell_core')
  const raw = asObject(parseJsonish(blockData(blocks, 'import_source').raw_json ?? blockData(blocks, 'import_source').rawJson))
  const text = cleanText(entity.summary || core.description || raw.entries || '')

  return text.length > 360 ? `${text.slice(0, 360).trim()}...` : text
}

function spellOption(entity: any, blocks: any[], match: any) {
  const title = cleanText(entity.title || 'Untitled Spell')
  const source = spellSourceFromBlocks(entity, blocks)
  const page = spellPageFromBlocks(blocks)
  const level = spellLevelFromBlocks(entity, blocks)
  const subclassMatch = Boolean(match?.subclass)

  return {
    id: String(entity.id),
    value: String(entity.id),
    title,
    label: title,
    slug: cleanText(entity.slug),
    summary: spellSummary(entity, blocks),
    level,
    spellLevel: level,
    source,
    sourceBook: source,
    page,
    sourcePage: page,
    classMatch: Boolean(match?.class),
    subclassMatch,
    isSubclassSpell: subclassMatch,
    alwaysPrepared: subclassMatch,
    grantSource: subclassMatch ? 'Subclass / Circle' : 'Class',
    subclassName: match?.subclassName || ''
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event)
  const className = cleanText(query.className || query.class_name || '')
  const subclassName = cleanText(query.subclassName || query.subclass_name || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  if (!className) return []

  const spells = await fetchSpellEntities(worldId)
  const entityIds = spells.map((spell: any) => String(spell.id)).filter(Boolean)
  const blocks = await fetchBlocksForEntityIds(entityIds)
  const blocksByEntityId = new Map<string, any[]>()

  for (const block of blocks) {
    const key = String(block?.entity_id || '')
    if (!key) continue

    if (!blocksByEntityId.has(key)) blocksByEntityId.set(key, [])
    blocksByEntityId.get(key)?.push(block)
  }

  const out = spells
    .map((entity: any) => {
      const entityBlocks = blocksByEntityId.get(String(entity.id)) || []
      const title = cleanText(entity.title || '')
      const source = spellSourceFromBlocks(entity, entityBlocks)
      const lookup = spellLookupEntry(title, source)

      const classMatch = lookupMatchesClass(lookup, className)
      const subclassMatch = lookupMatchesSubclass(lookup, className, subclassName)

      if (!classMatch && !subclassMatch) return null

      return spellOption(entity, entityBlocks, {
        class: classMatch,
        subclass: subclassMatch,
        subclassName
      })
    })
    .filter(Boolean)
    .sort((a: any, b: any) =>
      Number(a.level || 0) - Number(b.level || 0) ||
      String(a.title || '').localeCompare(String(b.title || '')) ||
      String(a.source || '').localeCompare(String(b.source || ''))
    )

  return out
})
