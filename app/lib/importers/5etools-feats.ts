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

function clean5eText(value: any): string {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function textify(value: any): string {
  if (value == null || value === '') return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clean5eText(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => textify(item)).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    if (value.type === 'table' && Array.isArray(value.rows)) {
      const caption = value.caption ? `**${clean5eText(value.caption)}**\n\n` : ''
      const labels = Array.isArray(value.colLabels) ? value.colLabels.map(clean5eText) : []
      const rows = value.rows.map((row: any) =>
        Array.isArray(row)
          ? row.map(textify).join(' | ')
          : textify(row)
      )

      if (labels.length) {
        return [
          caption,
          `| ${labels.join(' | ')} |`,
          `| ${labels.map(() => '---').join(' | ')} |`,
          ...rows.map((row: string) => `| ${row} |`)
        ].filter(Boolean).join('\n')
      }

      return [caption, ...rows].filter(Boolean).join('\n')
    }

    const heading = value.name ? `## ${clean5eText(value.name)}` : ''
    const parts: string[] = []

    if (typeof value.entry === 'string') parts.push(clean5eText(value.entry))
    if (value.entries) parts.push(textify(value.entries))
    if (value.items) {
      const items = Array.isArray(value.items) ? value.items : [value.items]
      parts.push(items.map((item: any) => `- ${textify(item)}`).filter(Boolean).join('\n'))
    }

    if (heading || parts.length) {
      return [heading, ...parts].filter(Boolean).join('\n\n')
    }

    return Object.entries(value)
      .map(([key, val]) => {
        const formatted = textify(val)
        return formatted ? `${key}: ${formatted}` : ''
      })
      .filter(Boolean)
      .join('; ')
  }

  return clean5eText(value)
}

function extractFeats(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.feat)) return payload.feat
  if (Array.isArray(payload?.data?.feat)) return payload.data.feat
  if (payload?.name) return [payload]
  return []
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

function buildFeatPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Unnamed Feat'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const slug = slugify(`${name}-${source || 'feat'}`)
  const externalId = `${name}__${source || 'unknown'}`

  const blocks = buildDefaultEntityData('dnd5e', 'feat')
  const prerequisites = textify(raw?.prerequisite)
  const benefits = textify(raw?.entries)
  const ability = textify(raw?.ability)
  const additionalSpells = textify(raw?.additionalSpells)

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'feat_core', 'name', name)
  setBlockValue(blocks, 'feat_core', 'source', source)
  setBlockValue(blocks, 'feat_core', 'page', page)
  setBlockValue(blocks, 'feat_core', 'category', raw?.category || '')
  setBlockValue(blocks, 'feat_core', 'prerequisites', prerequisites)
  setBlockValue(blocks, 'feat_core', 'benefits', benefits)
  setBlockValue(blocks, 'feat_core', 'repeatable', !!raw?.repeatable)
  setBlockValue(blocks, 'feat_core', 'ability_score_increase', ability)
  setBlockValue(blocks, 'feat_core', 'additional_spells', additionalSpells)

  return {
    systemKey: 'dnd5e',
    entityType: 'feat',
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

export function preview5eToolsFeats(payload: any): EldraImportPreviewResult {
  const feats = extractFeats(payload)

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'feat',
    count: feats.length,
    items: feats.map(buildFeatPreview),
    warnings: feats.length ? [] : ['No feats found']
  }
}
