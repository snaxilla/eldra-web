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
  if (!value) return ''

  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value.map((v) => textify(v)).join('\n\n')
  }

  if (typeof value === 'object') {
    if (value.entries) return textify(value.entries)
    if (value.items) return value.items.map((i: any) => `- ${textify(i)}`).join('\n')
  }

  return String(value)
}

function extractFeats(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.feat)) return payload.feat
  if (Array.isArray(payload?.data?.feat)) return payload.data.feat
  if (payload?.name) return [payload]
  return []
}

function buildFeatPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Unnamed Feat'
  const source = raw?.source || ''
  const page = raw?.page ? String(raw.page) : ''

  const slug = slugify(`${name}-${source || 'feat'}`)
  const externalId = `${name}__${source || 'unknown'}`

  const blocks = buildDefaultEntityData('dnd5e', 'feat')

  const importBlock = blocks.find(b => b.blockKey === 'import_source')
  const featBlock = blocks.find(b => b.blockKey === 'feat_core')

  if (importBlock?.data) {
    importBlock.data.provider = '5etools-json'
    importBlock.data.external_id = externalId
    importBlock.data.source_book = source
    importBlock.data.source_page = page
    importBlock.data.raw_json = raw
  }

  if (featBlock?.data) {
    featBlock.data.name = name
    featBlock.data.prerequisites = textify(raw?.prerequisite)
    featBlock.data.benefits = textify(raw?.entries)
  }

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
