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

function extractItemsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.item)) {
    return payload.item
  }

  if (Array.isArray(payload?.baseitem)) {
    return payload.baseitem
  }

  if (Array.isArray(payload?.magicvariant)) {
    return payload.magicvariant
  }

  if (Array.isArray(payload?.data?.item)) {
    return payload.data.item
  }

  if (payload && typeof payload === 'object' && payload.name && (payload.type || payload.rarity || payload.entries)) {
    return [payload]
  }

  return []
}

function normalizeItemType(raw: any): string {
  const t = raw?.type || raw?.itemType || ''
  if (!t) {
    return ''
  }

  if (typeof t === 'string') {
    return t
  }

  return textify(t)
}

function normalizeRarity(raw: any): string {
  const rarity = raw?.rarity
  if (!rarity) {
    return ''
  }

  if (typeof rarity === 'string') {
    return rarity
  }

  return textify(rarity)
}

function normalizeWeight(raw: any): number {
  const weight = raw?.weight
  if (typeof weight === 'number') {
    return weight
  }

  if (typeof weight === 'string') {
    const parsed = Number(weight)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function normalizeValue(raw: any): string {
  const value = raw?.value
  if (!value) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'object') {
    const amount = value.amount ?? value.value ?? ''
    const unit = value.coin ?? value.unit ?? value.currency ?? ''
    return `${amount} ${unit}`.trim()
  }

  return textify(value)
}

function normalizeAttunement(raw: any): boolean {
  return !!raw?.reqAttune || !!raw?.attunement
}

function normalizeDamage(raw: any): { damage: string; damageType: string } {
  const dmg1 = raw?.dmg1 || raw?.damage || ''
  const dmgType = raw?.dmgType || raw?.damageType || ''

  return {
    damage: textify(dmg1),
    damageType: textify(dmgType)
  }
}

function normalizeArmorClass(raw: any): number {
  const ac = raw?.ac ?? raw?.armorClass ?? 0

  if (typeof ac === 'number') {
    return ac
  }

  if (typeof ac === 'string') {
    const parsed = Number(ac)
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (Array.isArray(ac) && ac.length) {
    const first = ac[0]
    if (typeof first === 'number') {
      return first
    }
    if (typeof first === 'object' && typeof first.ac === 'number') {
      return first.ac
    }
  }

  return 0
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

function buildItemPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Untitled Item'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'item'}`)

  const blocks = buildDefaultEntityData('dnd5e', 'item')
  const damageBits = normalizeDamage(raw)

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'item_core', 'name', name)
  setBlockValue(blocks, 'item_core', 'item_type', normalizeItemType(raw))
  setBlockValue(blocks, 'item_core', 'rarity', normalizeRarity(raw))
  setBlockValue(blocks, 'item_core', 'weight', normalizeWeight(raw))
  setBlockValue(blocks, 'item_core', 'value', normalizeValue(raw))
  setBlockValue(blocks, 'item_core', 'attunement', normalizeAttunement(raw))
  setBlockValue(blocks, 'item_core', 'damage', damageBits.damage)
  setBlockValue(blocks, 'item_core', 'damage_type', damageBits.damageType)
  setBlockValue(blocks, 'item_core', 'armor_class', normalizeArmorClass(raw))
  setBlockValue(blocks, 'item_core', 'description', textify(raw?.entries))

  return {
    systemKey: 'dnd5e',
    entityType: 'item',
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

export function preview5eToolsItems(payload: any): EldraImportPreviewResult {
  const warnings: string[] = []
  const items = extractItemsFromPayload(payload)

  if (!items.length) {
    warnings.push('No items found. Expected an array of items or an object with an "item" array.')
  }

  const previews = items.map((item) => buildItemPreview(item))

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'item',
    count: previews.length,
    items: previews,
    warnings
  }
}
