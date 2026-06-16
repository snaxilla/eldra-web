import { dxFetch } from '../../../utils/entity-factory'

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function clean5eText(value: any): string {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature|optionalfeature|status)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function entriesToText(value: any): string {
  if (!value) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clean5eText(value)
  }

  if (Array.isArray(value)) {
    return value.map(entriesToText).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    const parts: string[] = []

    if (value.name) parts.push(clean5eText(value.name))
    if (value.entry) parts.push(entriesToText(value.entry))
    if (value.entries) parts.push(entriesToText(value.entries))
    if (value.items) parts.push(entriesToText(value.items))
    if (value.rows) parts.push(entriesToText(value.rows))

    return parts.filter(Boolean).join('\n\n')
  }

  return ''
}

function titleCase(value: any) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function parseJsonish(value: any) {
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
    } catch {}
  }

  return value
}

function pushCategory(out: string[], value: any) {
  const parsed = parseJsonish(value)

  if (parsed === null || parsed === undefined || parsed === '') return

  if (Array.isArray(parsed)) {
    parsed.forEach((item) => pushCategory(out, item))
    return
  }

  if (typeof parsed === 'object') {
    if (parsed.category !== undefined) {
      pushCategory(out, parsed.category)
      return
    }

    if (parsed.name !== undefined) {
      pushCategory(out, parsed.name)
      return
    }

    Object.values(parsed).forEach((item) => pushCategory(out, item))
    return
  }

  String(parsed)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => out.push(item))
}

function categoryValues(...values: any[]) {
  const out: string[] = []

  values.forEach((value) => pushCategory(out, value))

  const seen = new Set<string>()

  return out.filter((item) => {
    const key = item.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function blockData(blocks: any[], key: string) {
  const block = blocks.find((item: any) =>
    String(item?.block_key || item?.blockKey || '') === key
  )

  return asObject(block?.data)
}

async function loadEntityBlocks(entityId: any) {
  const params = new URLSearchParams()
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('limit', '-1')
  params.append('fields[]', 'entity_id')
  params.append('fields[]', 'block_key')
  params.append('fields[]', 'data')

  const res = await dxFetch(`/items/block_instances?${params.toString()}`)
  return Array.isArray(res?.data) ? res.data : []
}

function featHasSpellChoices(title: string, raw: any, core: any) {
  const name = title.toLowerCase()

  return Boolean(
    name.includes('magic initiate') ||
    name.includes('ritual caster') ||
    name.includes('fey touched') ||
    name.includes('shadow touched') ||
    raw?.additionalSpells ||
    raw?.additionalSpell ||
    raw?.spellcasting ||
    raw?.spells ||
    core?.additional_spells ||
    core?.additionalSpells
  )
}

function featSpellChoiceSummary(title: string, raw: any, core: any) {
  if (String(title || '').toLowerCase().includes('magic initiate')) {
    return 'Follow-up choices required: choose a spell list, two cantrips, and one 1st-level spell.'
  }

  const text = entriesToText(
    raw?.additionalSpells ||
    raw?.additionalSpell ||
    raw?.spells ||
    core?.additional_spells ||
    core?.additionalSpells ||
    ''
  )

  return text ? `Follow-up spell choices may be required: ${text}` : ''
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', worldId)
  params.set('filter[entity_type][_eq]', 'feat')
  params.set('sort', 'title')
  params.set('limit', '-1')
  params.append('fields[]', 'id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'slug')
  params.append('fields[]', 'summary')
  params.append('fields[]', 'entity_type')
  params.append('fields[]', 'world_id')
  params.append('fields[]', 'image')

  const res = await dxFetch(`/items/entities?${params.toString()}`)
  const rows = Array.isArray(res?.data) ? res.data : []

  const options = await Promise.all(rows.map(async (entity: any) => {
    const blocks = await loadEntityBlocks(entity.id).catch(() => [])
    const core = blockData(blocks, 'feat_core')
    const importSource = blockData(blocks, 'import_source')
    const raw = asObject(importSource.raw_json ?? importSource.rawJson)

    const title = cleanText(entity.title || core.name || raw.name || 'Feat')
    const categories = categoryValues(
      core.category,
      core.feat_category,
      core.featCategory,
      raw.category,
      raw.featCategory
    )

    const source = cleanText(
      core.source ||
      importSource.source_book ||
      importSource.sourceBook ||
      raw.source
    )

    const page = cleanText(
      core.page ||
      importSource.source_page ||
      importSource.sourcePage ||
      raw.page
    )

    const description = clean5eText(
      entriesToText(
        core.benefits ||
        core.description ||
        raw.entries ||
        entity.summary ||
        ''
      )
    )

    const spellChoiceSummary = featSpellChoiceSummary(title, raw, core)
    const hasSpellChoices = featHasSpellChoices(title, raw, core)

    return {
      id: String(entity.id),
      value: String(entity.id),
      title,
      label: title,
      slug: entity.slug ? String(entity.slug) : '',
      summary: description || clean5eText(entity.summary || ''),
      description,
      benefits: description,
      source,
      page,
      sourceLine: [source, page ? `p. ${page}` : ''].filter(Boolean).join(' · '),
      category: categories[0] || '',
      categories,
      rawCategory: raw.category ?? null,
      prerequisite: clean5eText(entriesToText(core.prerequisites || core.prerequisite || raw.prerequisite || '')),
      hasSpellChoices,
      spellChoiceSummary,
      additionalSpells: raw.additionalSpells || raw.additionalSpell || core.additional_spells || core.additionalSpells || null,
      imageUrl: entity.image ? `/api/assets/${entity.image}` : null
    }
  }))

  return options.sort((a: any, b: any) => a.title.localeCompare(b.title))
})
