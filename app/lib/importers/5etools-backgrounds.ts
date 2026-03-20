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
  if (value == null) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => textify(item)).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    if (typeof value.entry === 'string') {
      return value.entry
    }

    if (typeof value.entries === 'string') {
      return value.entries
    }

    if (Array.isArray(value.entries)) {
      return value.entries.map((item) => textify(item)).filter(Boolean).join('\n\n')
    }

    if (Array.isArray(value.items)) {
      return value.items.map((item) => `- ${textify(item)}`).filter(Boolean).join('\n')
    }

    if (value.name && value.entries) {
      return `## ${value.name}\n\n${textify(value.entries)}`
    }
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractBackgroundsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.background)) {
    return payload.background
  }

  if (Array.isArray(payload?.data?.background)) {
    return payload.data.background
  }

  if (payload && typeof payload === 'object' && payload.name && (payload.entries || payload.skillProficiencies)) {
    return [payload]
  }

  return []
}

function normalizeList(value: any): string {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => textify(item)).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    return Object.keys(value).join(', ')
  }

  return textify(value)
}

function extractFeature(raw: any) {
  const entries = Array.isArray(raw?.entries) ? raw.entries : []

  for (const entry of entries) {
    if (entry && typeof entry === 'object' && entry.name && entry.entries) {
      return {
        name: String(entry.name),
        description: textify(entry.entries)
      }
    }
  }

  return {
    name: '',
    description: ''
  }
}

function normalizeEquipment(raw: any): string {
  const entries = Array.isArray(raw?.entries) ? raw.entries : []

  for (const entry of entries) {
    if (entry && typeof entry === 'object' && entry.type === 'list' && Array.isArray(entry.items)) {
      return entry.items.map((item: any) => `- ${textify(item)}`).join('\n')
    }
  }

  return ''
}

function setBlockValue(
  blocks: EldraImportPreviewEntity['blocks'],
  blockKey: string,
  fieldKey: string,
  value: any
) {
  const block = blocks.find((item) => item.blockKey === blockKey)
  if (!block || !block.data) {
    return
  }
  block.data[fieldKey] = value
}

function buildBackgroundPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Untitled Background'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'background'}`)
  const feature = extractFeature(raw)

  const blocks = buildDefaultEntityData('dnd5e', 'background')

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'background_core', 'name', name)
  setBlockValue(blocks, 'background_core', 'skill_proficiencies', normalizeList(raw?.skillProficiencies))
  setBlockValue(blocks, 'background_core', 'tool_proficiencies', normalizeList(raw?.toolProficiencies))
  setBlockValue(blocks, 'background_core', 'languages', normalizeList(raw?.languageProficiencies || raw?.languages))
  setBlockValue(blocks, 'background_core', 'equipment', normalizeEquipment(raw))
  setBlockValue(blocks, 'background_core', 'feature_name', feature.name)
  setBlockValue(blocks, 'background_core', 'feature_description', feature.description)

  return {
    systemKey: 'dnd5e',
    entityType: 'background',
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

export function preview5eToolsBackgrounds(payload: any): EldraImportPreviewResult {
  const warnings: string[] = []
  const backgrounds = extractBackgroundsFromPayload(payload)

  if (!backgrounds.length) {
    warnings.push('No backgrounds found. Expected an array of backgrounds or an object with a "background" array.')
  }

  const items = backgrounds.map((background) => buildBackgroundPreview(background))

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'background',
    count: items.length,
    items,
    warnings
  }
}
