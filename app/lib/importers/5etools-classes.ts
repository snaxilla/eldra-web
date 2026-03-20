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

function extractClasses(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.class)) return payload.class
  if (Array.isArray(payload?.data?.class)) return payload.data.class
  if (payload?.name) return [payload]
  return []
}

function normalizeHitDie(raw: any): string {
  const hd = raw?.hd
  if (!hd) return ''
  if (typeof hd === 'number' || typeof hd === 'string') return String(hd)
  if (typeof hd === 'object') {
    if (hd.faces) return `d${hd.faces}`
    if (hd.number && hd.faces) return `${hd.number}d${hd.faces}`
  }
  return textify(hd)
}

function normalizePrimaryAbility(raw: any): string {
  return textify(raw?.primaryAbility)
}

function normalizeProficiencyList(value: any): string {
  if (!value) return ''
  if (Array.isArray(value)) {
    return value.map((item) => textify(item)).filter(Boolean).join(', ')
  }
  return textify(value)
}

function normalizeSavingThrows(raw: any): string {
  return normalizeProficiencyList(raw?.proficiency)
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

function buildClassPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Unnamed Class'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'class'}`)

  const blocks = buildDefaultEntityData('dnd5e', 'class')

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'class_core', 'name', name)
  setBlockValue(blocks, 'class_core', 'hit_die', normalizeHitDie(raw))
  setBlockValue(blocks, 'class_core', 'primary_ability', normalizePrimaryAbility(raw))
  setBlockValue(blocks, 'class_core', 'saving_throws', normalizeSavingThrows(raw))
  setBlockValue(blocks, 'class_core', 'armor_proficiencies', normalizeProficiencyList(raw?.startingProficiencies?.armor))
  setBlockValue(blocks, 'class_core', 'weapon_proficiencies', normalizeProficiencyList(raw?.startingProficiencies?.weapons))
  setBlockValue(blocks, 'class_core', 'tool_proficiencies', normalizeProficiencyList(raw?.startingProficiencies?.tools))
  setBlockValue(blocks, 'class_core', 'description', textify(raw?.entries))

  return {
    systemKey: 'dnd5e',
    entityType: 'class',
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

export function preview5eToolsClasses(payload: any): EldraImportPreviewResult {
  const items = extractClasses(payload).map(buildClassPreview)

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'class',
    count: items.length,
    items,
    warnings: items.length ? [] : ['No classes found']
  }
}
