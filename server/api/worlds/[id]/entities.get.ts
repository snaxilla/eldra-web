import fs from 'node:fs'
import path from 'node:path'
import { directusServiceRequest } from '../../../utils/directus'

const CLASS_DATA_DIR = '/opt/eldra/datasets/5etools-src/data/class'
const RACE_FLUFF_FILE = '/opt/eldra/datasets/5etools-src/data/fluff-races.json'
const SPELL_FLUFF_DIR = '/opt/eldra/datasets/5etools-src/data/spells'

const SUMMARY_BLOCK_KEYS = [
  'overview',
  'item_core',
  'spell_core',
  'location_core',
  'character_core',
  'species_core',
  'race_core',
  'class_core',
  'background_core',
  'feat_core',
  'article_override'
]

function readJsonSafe(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function sourceFromSlug(slug: string) {
  const parts = String(slug || '').split('-')
  const last = parts[parts.length - 1]
  return last ? last.toUpperCase() : ''
}

function classNameFromSlug(slug: string, title: string) {
  const source = sourceFromSlug(slug).toLowerCase()
  let raw = String(slug || '').toLowerCase()
  if (source && raw.endsWith(`-${source}`)) raw = raw.slice(0, -(source.length + 1))
  return raw || String(title || '').toLowerCase()
}

function classFluffImageUrl(row: any) {
  if (String(row?.entity_type || '').toLowerCase() !== 'class') return null

  const slugName = classNameFromSlug(row?.slug, row?.title)
  const source = sourceFromSlug(row?.slug)
  const filePath = path.join(CLASS_DATA_DIR, `fluff-class-${slugName}.json`)
  const fluff = readJsonSafe(filePath)
  const list = Array.isArray(fluff?.classFluff) ? fluff.classFluff : []

  const preferred =
    list.find((item: any) =>
      String(item?.name || '').toLowerCase() === String(row?.title || '').toLowerCase() &&
      String(item?.source || '').toUpperCase() === source
    ) ||
    list.find((item: any) =>
      String(item?.name || '').toLowerCase() === String(row?.title || '').toLowerCase() &&
      Array.isArray(item?.images) &&
      item.images.length
    )

  const image = Array.isArray(preferred?.images) ? preferred.images[0] : null
  const imagePath = image?.href?.path

  return imagePath ? `/api/5etools-img/${imagePath}` : null
}

function raceFluffImageUrl(row: any) {
  const type = String(row?.entity_type || '').toLowerCase()
  if (type !== 'species' && type !== 'race') return null

  const source = sourceFromSlug(row?.slug)
  const title = String(row?.title || '').trim().toLowerCase()
  const fluff = readJsonSafe(RACE_FLUFF_FILE)
  const list = Array.isArray(fluff?.raceFluff) ? fluff.raceFluff : []

  const preferred =
    list.find((item: any) =>
      String(item?.name || '').trim().toLowerCase() === title &&
      String(item?.source || '').toUpperCase() === source &&
      Array.isArray(item?.images) &&
      item.images.length
    ) ||
    list.find((item: any) =>
      String(item?.name || '').trim().toLowerCase() === title &&
      Array.isArray(item?.images) &&
      item.images.length
    )

  const image = Array.isArray(preferred?.images) ? preferred.images[0] : null
  const imagePath = image?.href?.path

  return imagePath ? `/api/5etools-img/${imagePath}` : null
}

function spellFluffImageUrl(row: any) {
  if (String(row?.entity_type || '').toLowerCase() !== 'spell') return null

  const source = sourceFromSlug(row?.slug)
  if (!source) return null

  const filePath = path.join(SPELL_FLUFF_DIR, `fluff-spells-${source.toLowerCase()}.json`)
  const fluff = readJsonSafe(filePath)
  const list = Array.isArray(fluff?.spellFluff) ? fluff.spellFluff : []
  const title = String(row?.title || '').trim().toLowerCase()

  const found = list.find((item: any) =>
    String(item?.name || '').trim().toLowerCase() === title &&
    Array.isArray(item?.images) &&
    item.images.length
  )

  const imagePath = found?.images?.[0]?.href?.path
  return imagePath ? `/api/5etools-img/${imagePath}` : null
}

function entityImageUrl(row: any) {
  const image = row?.image

  if (!image) return null
  if (typeof image === 'string' && image.trim()) return `/api/assets/${image}`
  if (typeof image === 'number') return `/api/assets/${image}`

  if (typeof image === 'object') {
    if (image.image_url) return image.image_url
    if (image.file_id) return `/api/assets/${image.file_id}`
    if (image.id) return `/api/assets/${image.id}`
  }

  return null
}

function extractImageUrl(blocks: any[] = []) {
  for (const block of blocks) {
    const image = block?.data?.image
    if (!image) continue

    if (typeof image === 'string' && image.trim()) {
      return `/api/assets/${image}`
    }

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return null
}

function cleanPreviewText(value: any, limit = 420) {
  const text = String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function blockKey(block: any) {
  return String(block?.block_key || block?.blockKey || '')
}

function extractOverviewText(blocks: any[] = []) {
  const overview = blocks.find((block: any) => blockKey(block) === 'overview')
  return cleanPreviewText(overview?.data?.text || '')
}

function extractCoreText(blocks: any[] = []) {
  for (const key of ['item_core', 'spell_core', 'location_core', 'character_core']) {
    const block = blocks.find((item: any) => blockKey(item) === key)
    const data = block?.data || {}

    const text =
      data.summary ||
      data.description ||
      data.text ||
      data.entry ||
      ''

    const clean = cleanPreviewText(text)
    if (clean) return clean
  }

  const articleOverride = blocks.find((item: any) => blockKey(item) === 'article_override')
  const articleText = cleanPreviewText(articleOverride?.data?.article || articleOverride?.data?.body || '')
  if (articleText) return articleText

  return ''
}

function shouldUseSummaryMode(query: Record<string, any>) {
  const mode = String(query.mode || '').trim().toLowerCase()
  const summary = String(query.summary || '').trim().toLowerCase()
  const includeBlocks = String(query.includeBlocks || '').trim().toLowerCase()

  return (
    mode === 'summary' ||
    summary === '1' ||
    summary === 'true' ||
    includeBlocks === '0' ||
    includeBlocks === 'false'
  )
}


function normalizeTypeFilter(value: any) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '')

  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}


function collectionBlockKey(block: any) {
  return String(block?.block_key || block?.blockKey || '').trim()
}

function collectionBlockData(blocks: any[] = [], key: string) {
  return blocks.find((block: any) => collectionBlockKey(block) === key)?.data || null
}

function collectionClean(value: any) {
  return String(value ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\|/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectionTitleCase(value: any) {
  return collectionClean(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function collectionTypeCodeLabel(value: any) {
  const code = String(value || '').split('|')[0].trim().toUpperCase()

  const labels: Record<string, string> = {
    M: 'Melee Weapon',
    R: 'Ranged Weapon',
    A: 'Ammunition',
    LA: 'Light Armor',
    MA: 'Medium Armor',
    HA: 'Heavy Armor',
    S: 'Shield',
    RD: 'Rod',
    WD: 'Wand',
    SC: 'Scroll',
    RG: 'Ring',
    G: 'Gear',
    T: 'Tool',
    P: 'Potion',
    INS: 'Instrument',
    SCF: 'Spellcasting Focus'
  }

  return labels[code] || collectionTitleCase(code || value || 'Item')
}

function collectionSpellLevelLabel(value: any) {
  if (value === null || value === undefined || value === '') return ''

  const parsed = Number(value)

  if (Number.isFinite(parsed)) {
    return parsed <= 0 ? 'Cantrip' : `Level ${Math.floor(parsed)}`
  }

  return collectionTitleCase(value)
}

function collectionValueLine(label: string, value: any) {
  const clean = collectionClean(value)
  return clean ? `${label}: ${clean}` : ''
}

function collectionSummaryCoreForType(row: any, blocks: any[]) {
  const type = String(row?.entity_type || '').trim().toLowerCase()

  if (type === 'spell') return collectionBlockData(blocks, 'spell_core')
  if (type === 'item') return collectionBlockData(blocks, 'item_core')
  if (type === 'location') return collectionBlockData(blocks, 'location_core')
  if (type === 'species' || type === 'race') return collectionBlockData(blocks, 'species_core') || collectionBlockData(blocks, 'race_core')
  if (type === 'class') return collectionBlockData(blocks, 'class_core')
  if (type === 'background') return collectionBlockData(blocks, 'background_core')
  if (type === 'feat') return collectionBlockData(blocks, 'feat_core')
  if (type.includes('character') || type.includes('npc') || type === 'pc') return collectionBlockData(blocks, 'character_core')

  return null
}

function collectionSummaryDisplayType(row: any, blocks: any[]) {
  const type = String(row?.entity_type || '').trim().toLowerCase()
  const core = collectionSummaryCoreForType(row, blocks) || {}

  if (type === 'item') {
    return collectionTypeCodeLabel(core.item_type || core.itemType || core.type || type)
  }

  if (type === 'spell') return 'Spell'

  if (type === 'location') {
    return collectionTitleCase(core.location_type || core.locationType || core.type || 'Location')
  }

  if (type === 'species' || type === 'race') return 'Species'
  if (type === 'class') return 'Class'
  if (type === 'background') return 'Background'
  if (type === 'feat') return 'Feat'

  return collectionTitleCase(type || 'Entity')
}

function collectionSummaryFacet(row: any, blocks: any[]) {
  const type = String(row?.entity_type || '').trim().toLowerCase()
  const core = collectionSummaryCoreForType(row, blocks) || {}

  if (type === 'spell') {
    return collectionSpellLevelLabel(core.level ?? core.spell_level ?? core.spellLevel) || 'Unknown Level'
  }

  if (type === 'item') {
    return collectionTypeCodeLabel(core.item_type || core.itemType || core.type || 'Item')
  }

  if (type === 'location') {
    return collectionTitleCase(core.location_type || core.locationType || core.type || 'Location')
  }

  if (type === 'species' || type === 'race') {
    const size = collectionClean(core.size || core.size_json || core.race_size || '')
    return size ? `Size ${size}` : 'Species'
  }

  if (type === 'class') {
    const hitDie = collectionClean(core.hit_die || core.hitDie || core.hd || '')
    return hitDie ? `Hit Die ${hitDie}` : 'Class'
  }

  if (type === 'feat') {
    return collectionTitleCase(core.category || core.feat_type || core.featType || 'Feat')
  }

  if (type === 'background') {
    return core.feature || core.feature_name || core.featureName ? 'Has Feature' : 'Background'
  }

  return collectionTitleCase(type || 'Entity')
}

function collectionSummaryMetaLines(row: any, blocks: any[]) {
  const type = String(row?.entity_type || '').trim().toLowerCase()
  const core = collectionSummaryCoreForType(row, blocks) || {}
  const source = sourceFromSlug(row?.slug)

  if (type === 'spell') {
    return [
      collectionValueLine('Level', collectionSpellLevelLabel(core.level ?? core.spell_level ?? core.spellLevel)),
      collectionValueLine('School', core.school),
      collectionValueLine('Casting', core.casting_time || core.castingTime || core.time),
      collectionValueLine('Range', core.range),
      collectionValueLine('Duration', core.duration),
      collectionValueLine('Components', core.components),
      core.ritual ? 'Ritual' : '',
      core.concentration ? 'Concentration' : '',
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'item') {
    const damage = collectionClean(core.damage)
    const damageType = collectionClean(core.damage_type || core.damageType)

    return [
      collectionValueLine('Type', collectionTypeCodeLabel(core.item_type || core.itemType || core.type)),
      collectionValueLine('Rarity', core.rarity),
      damage ? `Damage: ${damage}${damageType ? ` ${collectionTitleCase(damageType)}` : ''}` : '',
      collectionValueLine('Weight', core.weight),
      collectionValueLine('Value', core.value),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'location') {
    return [
      collectionValueLine('Type', core.location_type || core.locationType || core.type),
      collectionValueLine('Population', core.population),
      core.linkedMapId || core.linked_map_id ? 'Linked Map' : '',
      core.parentLocationId || core.parent_location_id ? 'Has Parent Location' : ''
    ].filter(Boolean)
  }

  if (type === 'species' || type === 'race') {
    return [
      collectionValueLine('Size', core.size || core.size_json || core.race_size),
      collectionValueLine('Speed', core.speed),
      collectionValueLine('Traits', core.rawTraitCount || core.trait_count),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'class') {
    return [
      collectionValueLine('Hit Die', core.hit_die || core.hitDie || core.hd),
      collectionValueLine('Saves', core.savingThrows || core.saving_throws || core.saves),
      collectionValueLine('Primary', core.primaryAbility || core.primary_ability),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'feat') {
    return [
      collectionValueLine('Category', core.category || core.feat_type || core.featType),
      collectionValueLine('Prerequisite', core.prerequisite || core.prerequisites),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'background') {
    return [
      collectionValueLine('Feature', core.featureName || core.feature_name || core.feature),
      collectionValueLine('Skills', core.skillProficiencies || core.skill_proficiencies),
      collectionValueLine('Tools', core.toolProficiencies || core.tool_proficiencies),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  return [
    collectionSummaryDisplayType(row, blocks),
    source ? `Source: ${source}` : ''
  ].filter(Boolean)
}


export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event) as Record<string, any>
  const summaryMode = shouldUseSummaryMode(query)

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const typeFilter = normalizeTypeFilter(query.type || query.types || query.entityType || query.entityTypes)

  const entityFilter: Record<string, any> = {
    world_id: { _eq: worldId }
  }

  if (typeFilter.length) {
    entityFilter.entity_type = { _in: typeFilter }
  }

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: entityFilter,
      sort: 'title',
      limit: -1,
      fields: [
        'id',
        'title',
        'slug',
        'world_id',
        'system_key',
        'entity_type',
        'status',
        'visibility',
        'summary',
        'created_at',
        'updated_at',
        'image'
      ].join(',')
    }
  })

  const rows = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []
  const entityIds = rows.map((row: any) => row.id).filter(Boolean)

  let blocks: any[] = []
  if (entityIds.length) {
    const filter: any = {
      entity_id: { _in: entityIds }
    }

    if (summaryMode) {
      filter.block_key = { _in: SUMMARY_BLOCK_KEYS }
    }

    const blocksRes = await directusServiceRequest('/items/block_instances', {
      method: 'GET',
      query: {
        filter,
        sort: 'entity_id,sort',
        limit: -1,
        fields: summaryMode ? 'entity_id,block_key,data' : '*'
      }
    })

    blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
  }

  const blocksByEntityId = new Map<number, any[]>()

  for (const block of blocks) {
    const entityId = Number(block.entity_id)
    if (!blocksByEntityId.has(entityId)) {
      blocksByEntityId.set(entityId, [])
    }
    blocksByEntityId.get(entityId)!.push(block)
  }

  return rows.map((row: any) => {
    const entityBlocks = blocksByEntityId.get(Number(row.id)) || []
    const derivedImageUrl =
      entityImageUrl(row) ||
      extractImageUrl(entityBlocks) ||
      classFluffImageUrl(row) ||
      raceFluffImageUrl(row) ||
      spellFluffImageUrl(row)

    const overviewText = extractOverviewText(entityBlocks)
    const coreText = extractCoreText(entityBlocks)
    const summary = cleanPreviewText(row?.summary || overviewText || coreText || '')
    const collectionDisplayType = collectionSummaryDisplayType(row, entityBlocks)
    const collectionFacet = collectionSummaryFacet(row, entityBlocks)
    const collectionMetaLines = collectionSummaryMetaLines(row, entityBlocks)

    if (summaryMode) {
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        world_id: row.world_id,
        system_key: row.system_key,
        entity_type: row.entity_type,
        entityType: row.entity_type,
        status: row.status,
        visibility: row.visibility,
        summary,
        created_at: row.created_at,
        updated_at: row.updated_at,
        image: row.image,
        displayType: collectionDisplayType,
        display_type: collectionDisplayType,
        collectionFacet,
        collection_facet: collectionFacet,
        collectionMetaLines,
        collection_meta_lines: collectionMetaLines,
        metaLines: collectionMetaLines,
        imageUrl: derivedImageUrl,
        image_url: derivedImageUrl
      }
    }

    return {
      ...row,
      blocks: entityBlocks,
      displayType: collectionDisplayType,
      display_type: collectionDisplayType,
      collectionFacet,
      collection_facet: collectionFacet,
      collectionMetaLines,
      collection_meta_lines: collectionMetaLines,
      metaLines: collectionMetaLines,
      imageUrl: derivedImageUrl,
      image_url: derivedImageUrl,
      summary: String(row?.summary || '').trim() || overviewText || coreText || ''
    }
  })
})
