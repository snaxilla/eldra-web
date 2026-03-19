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

function normalizeComponents(raw: any): string {
  const components = raw?.components
  if (!components) {
    return ''
  }

  if (Array.isArray(components)) {
    return components.join(', ')
  }

  if (typeof components === 'string') {
    return components
  }

  if (typeof components === 'object') {
    const parts: string[] = []

    if (components.v) parts.push('V')
    if (components.s) parts.push('S')
    if (components.m) {
      if (typeof components.m === 'string') {
        parts.push(`M (${components.m})`)
      } else {
        parts.push('M')
      }
    }

    return parts.join(', ')
  }

  return ''
}

function normalizeCastingTime(raw: any): string {
  const time = raw?.time
  if (!time) {
    return ''
  }

  if (Array.isArray(time)) {
    return time
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (typeof entry === 'object') {
          const number = entry.number ?? ''
          const unit = entry.unit ?? ''
          return `${number} ${unit}`.trim()
        }
        return ''
      })
      .filter(Boolean)
      .join(', ')
  }

  return textify(time)
}

function normalizeRange(raw: any): string {
  const range = raw?.range
  if (!range) {
    return ''
  }

  if (typeof range === 'string') {
    return range
  }

  if (typeof range === 'object') {
    const type = range.type ?? ''
    const distance = range.distance

    if (distance && typeof distance === 'object') {
      const amount = distance.amount ?? ''
      const unit = distance.type ?? distance.unit ?? ''
      const built = `${amount} ${unit}`.trim()
      return built || type || textify(range)
    }

    return type || textify(range)
  }

  return textify(range)
}

function normalizeDuration(raw: any): string {
  const duration = raw?.duration
  if (!duration) {
    return ''
  }

  if (Array.isArray(duration)) {
    return duration
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (typeof entry === 'object') {
          if (entry.type === 'instant') return 'Instantaneous'
          if (entry.type === 'permanent') return 'Permanent'
          if (entry.duration && typeof entry.duration === 'object') {
            const amount = entry.duration.amount ?? ''
            const unit = entry.duration.type ?? ''
            return `${amount} ${unit}`.trim()
          }
          return entry.type ?? textify(entry)
        }
        return ''
      })
      .filter(Boolean)
      .join(', ')
  }

  return textify(duration)
}

function extractSpellsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.spell)) {
    return payload.spell
  }

  if (Array.isArray(payload?.data?.spell)) {
    return payload.data.spell
  }

  if (payload && typeof payload === 'object' && payload.name && (payload.level !== undefined || payload.school)) {
    return [payload]
  }

  return []
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

function buildSpellPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Untitled Spell'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'spell'}`)

  const blocks = buildDefaultEntityData('dnd5e', 'spell')

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'spell_core', 'name', name)
  setBlockValue(blocks, 'spell_core', 'level', raw?.level ?? 0)
  setBlockValue(blocks, 'spell_core', 'school', raw?.school ?? '')
  setBlockValue(blocks, 'spell_core', 'casting_time', normalizeCastingTime(raw))
  setBlockValue(blocks, 'spell_core', 'range', normalizeRange(raw))
  setBlockValue(blocks, 'spell_core', 'duration', normalizeDuration(raw))
  setBlockValue(blocks, 'spell_core', 'components', normalizeComponents(raw))
  setBlockValue(blocks, 'spell_core', 'ritual', !!raw?.meta?.ritual || !!raw?.ritual)
  setBlockValue(blocks, 'spell_core', 'concentration', !!raw?.meta?.concentration || !!raw?.concentration)
  setBlockValue(blocks, 'spell_core', 'description', textify(raw?.entries))
  setBlockValue(blocks, 'spell_core', 'higher_level', textify(raw?.entriesHigherLevel))

  return {
    systemKey: 'dnd5e',
    entityType: 'spell',
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

export function preview5eToolsSpells(payload: any): EldraImportPreviewResult {
  const warnings: string[] = []
  const spells = extractSpellsFromPayload(payload)

  if (!spells.length) {
    warnings.push('No spells found. Expected an array of spells or an object with a "spell" array.')
  }

  const items = spells.map((spell) => buildSpellPreview(spell))

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'spell',
    count: items.length,
    items,
    warnings
  }
}
