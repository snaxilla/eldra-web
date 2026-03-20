import { buildDefaultEntityData } from '../systems'
import type {
  EldraImportPreviewEntity,
  EldraImportPreviewResult
} from './types'

function slugify(input: string) {
  return String(input || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function textify(value: any): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => textify(item)).filter(Boolean).join('\n\n')
  }
  if (typeof value === 'object') {
    if (typeof value.entry === 'string') return value.entry
    if (typeof value.entries === 'string') return value.entries
    if (Array.isArray(value.entries)) return value.entries.map((item) => textify(item)).filter(Boolean).join('\n\n')
    if (Array.isArray(value.items)) return value.items.map((item) => `- ${textify(item)}`).filter(Boolean).join('\n')
    if (value.name && value.entries) return `## ${value.name}\n\n${textify(value.entries)}`
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractSpecies(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.race)) return payload.race
  if (Array.isArray(payload?.species)) return payload.species
  if (Array.isArray(payload?.data?.race)) return payload.data.race
  if (payload?.name) return [payload]
  return []
}

function normalizeSize(raw: any): string {
  return textify(raw?.size)
}

function normalizeSpeed(raw: any): string {
  const speed = raw?.speed
  if (typeof speed === 'number' || typeof speed === 'string') return String(speed)
  if (speed && typeof speed === 'object') {
    return Object.entries(speed).map(([k, v]) => `${k}: ${v}`).join(', ')
  }
  return ''
}

function normalizeAbility(raw: any): string {
  const ability = raw?.ability
  if (!ability) return ''
  if (Array.isArray(ability)) {
    return ability.map((a) => textify(a)).join('\n')
  }
  return textify(ability)
}

function setBlockValue(
  blocks: EldraImportPreviewEntity['blocks'],
  blockKey: string,
  fieldKey: string,
  value: any
) {
  const block = blocks.find((item) => item.blockKey === blockKey)
  if (!block || !block.data) return
  block.data[fieldKey] = value
}

function buildSpeciesPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Unnamed Species'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'species'}`)

  const blocks = buildDefaultEntityData('dnd5e', 'species')

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'species_core', 'name', name)
  setBlockValue(blocks, 'species_core', 'size', normalizeSize(raw))
  setBlockValue(blocks, 'species_core', 'speed', normalizeSpeed(raw))
  setBlockValue(blocks, 'species_core', 'ability_score_increase', normalizeAbility(raw))
  setBlockValue(blocks, 'species_core', 'traits', textify(raw?.entries))

  return {
    systemKey: 'dnd5e',
    entityType: 'species',
    title: name,
    slug,
    provider: '5etools-json',
    externalId,
    sourceBook: source,
    sourcePage: page,
    blocks,
    raw
  }
}

export function preview5eToolsSpecies(payload: any): EldraImportPreviewResult {
  const items = extractSpecies(payload).map(buildSpeciesPreview)

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'species',
    count: items.length,
    items,
    warnings: items.length ? [] : ['No species found']
  }
}
