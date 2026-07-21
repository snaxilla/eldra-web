import { createError } from 'h3'
import { directusServiceRequest } from './directus'

type HomebrewType =
  | 'spell'
  | 'item'
  | 'enemy'
  | 'species'
  | 'class'
  | 'feat'
  | 'background'

type TypeConfig = {
  key: HomebrewType
  label: string
  entityTypes: string[]
  coreBlocks: string[]
}

const TYPE_CONFIGS: Record<HomebrewType, TypeConfig> = {
  spell: {
    key: 'spell',
    label: 'Spell',
    entityTypes: ['spell'],
    coreBlocks: ['spell_core']
  },
  item: {
    key: 'item',
    label: 'Item',
    entityTypes: ['item'],
    coreBlocks: ['item_core']
  },
  enemy: {
    key: 'enemy',
    label: 'Enemy',
    entityTypes: ['enemy', 'monster'],
    coreBlocks: ['statblock', 'monster_profile', 'monster_core', 'enemy_core', 'actions', 'monster_actions']
  },
  species: {
    key: 'species',
    label: 'Species',
    entityTypes: ['species', 'race'],
    coreBlocks: ['species_core', 'race_core']
  },
  class: {
    key: 'class',
    label: 'Class',
    entityTypes: ['class'],
    coreBlocks: ['class_core']
  },
  feat: {
    key: 'feat',
    label: 'Feat',
    entityTypes: ['feat'],
    coreBlocks: ['feat_core']
  },
  background: {
    key: 'background',
    label: 'Background',
    entityTypes: ['background'],
    coreBlocks: ['background_core']
  }
}

const ENTITY_FALLBACK_FIELDS = new Set([
  'id',
  'title',
  'slug',
  'world_id',
  'system_key',
  'entity_type',
  'status',
  'visibility',
  'summary',
  'image',
  'created_at',
  'updated_at'
])

const BLOCK_FALLBACK_FIELDS = new Set([
  'id',
  'entity_id',
  'block_key',
  'label',
  'repeatable',
  'sort',
  'data'
])

const collectionFieldCache = new Map<string, Set<string>>()

function worldValue(worldId: string | number) {
  const parsed = Number(worldId)
  return Number.isFinite(parsed) ? parsed : String(worldId)
}

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function titleCase(value: any) {
  return cleanText(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function slugify(value: any) {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)

  return slug || `homebrew-${Date.now()}`
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null))
}

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function blockKey(block: any) {
  return cleanText(block?.block_key ?? block?.blockKey ?? block?.key)
}

function blockData(block: any) {
  return asObject(block?.data)
}

function normalizeHomebrewType(value: any): HomebrewType {
  const key = cleanText(value).toLowerCase()

  if (key === 'monster') return 'enemy'
  if (key === 'race') return 'species'

  if (Object.prototype.hasOwnProperty.call(TYPE_CONFIGS, key)) {
    return key as HomebrewType
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid homebrew type'
  })
}

async function collectionFields(collection: string, fallback: Set<string>) {
  if (collectionFieldCache.has(collection)) {
    return collectionFieldCache.get(collection)!
  }

  try {
    const res = await directusServiceRequest(`/fields/${collection}`, {
      method: 'GET'
    })

    const fields = new Set(
      (Array.isArray(res?.data) ? res.data : [])
        .map((field: any) => cleanText(field?.field))
        .filter(Boolean)
    )

    if (fields.size) {
      collectionFieldCache.set(collection, fields)
      return fields
    }
  } catch {}

  collectionFieldCache.set(collection, fallback)
  return fallback
}

function pickSupported(fields: Set<string>, payload: Record<string, any>) {
  const picked: Record<string, any> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (fields.has(key)) {
      picked[key] = value
    }
  }

  return picked
}

async function entitySlugExists(worldId: string | number, slug: string) {
  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: worldValue(worldId) } },
          { slug: { _eq: slug } }
        ]
      },
      limit: 1,
      fields: 'id'
    }
  })

  return Array.isArray(res?.data) && res.data.length > 0
}

async function uniqueEntitySlug(worldId: string | number, baseTitle: string) {
  const base = slugify(baseTitle)
  let candidate = base
  let index = 2

  while (await entitySlugExists(worldId, candidate)) {
    candidate = `${base}-${index}`
    index++
  }

  return candidate
}

async function loadBlocksForEntityIds(entityIds: any[], allowedBlockKeys?: string[]) {
  const ids = entityIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))

  if (!ids.length) return []

  const filter: any = {
    entity_id: { _in: ids }
  }

  if (Array.isArray(allowedBlockKeys) && allowedBlockKeys.length) {
    filter.block_key = { _in: allowedBlockKeys }
  }

  const res = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter,
      sort: 'entity_id,sort,id',
      limit: -1,
      fields: '*'
    }
  })

  return Array.isArray(res?.data) ? res.data : []
}

function blocksByEntityId(blocks: any[]) {
  const map = new Map<string, any[]>()

  for (const block of blocks) {
    const id = cleanText(block?.entity_id)
    if (!id) continue

    if (!map.has(id)) map.set(id, [])
    map.get(id)!.push(block)
  }

  return map
}

function findBlock(blocks: any[], keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()))

  return blocks.find((block) =>
    wanted.has(blockKey(block).toLowerCase())
  ) || null
}

function sourceFromBlocks(blocks: any[]) {
  const source = blockData(findBlock(blocks, ['import_source']))

  return {
    sourceBook: cleanText(source.source_book ?? source.sourceBook ?? source.source ?? ''),
    sourcePage: cleanText(source.source_page ?? source.sourcePage ?? ''),
    provider: cleanText(source.provider ?? '')
  }
}

function templateMetaLine(config: TypeConfig, blocks: any[]) {
  const source = sourceFromBlocks(blocks)
  const sourcePart = source.sourceBook
    ? source.sourcePage
      ? `${source.sourceBook} p.${source.sourcePage}`
      : source.sourceBook
    : ''

  const core = blockData(findBlock(blocks, config.coreBlocks))
  const summaryParts = [
    sourcePart,
    core.level !== undefined ? `Level ${core.level}` : '',
    core.school ? titleCase(core.school) : '',
    core.rarity ? titleCase(core.rarity) : '',
    core.size ? `Size ${core.size}` : '',
    core.challenge_rating ? `CR ${core.challenge_rating}` : '',
    core.cr ? `CR ${core.cr}` : ''
  ].filter(Boolean)

  return summaryParts.join(' · ')
}

function templateSummary(row: any, config: TypeConfig, blocks: any[]) {
  const direct = cleanText(row?.summary)
  if (direct) return direct

  const core = blockData(findBlock(blocks, config.coreBlocks))
  const overview = blockData(findBlock(blocks, ['overview']))

  return cleanText(
    overview.text ||
    core.description ||
    core.summary ||
    core.entries ||
    ''
  )
}

function retitleCoreBlockData(block: any, title: string, templateEntityId: any) {
  const key = blockKey(block)
  const data = deepClone(blockData(block))

  if ('name' in data) data.name = title
  if ('title' in data) data.title = title

  data.homebrew = true
  data.source_kind = 'homebrew'
  data.sourceKind = 'homebrew'
  data.template_entity_id = templateEntityId
  data.templateEntityId = templateEntityId

  if ('source' in data) data.source = 'Eldra Homebrew'
  if ('source_book' in data) data.source_book = 'Eldra Homebrew'
  if ('sourceBook' in data) data.sourceBook = 'Eldra Homebrew'

  return {
    key,
    data
  }
}

function cloneableBlocksForType(config: TypeConfig, blocks: any[]) {
  const allowed = new Set([
    ...config.coreBlocks,
    'overview'
  ].map((key) => key.toLowerCase()))

  return blocks.filter((block) =>
    allowed.has(blockKey(block).toLowerCase())
  )
}

function homebrewImportSourceData(template: any, type: HomebrewType) {
  return {
    provider: 'eldra-homebrew',
    source_kind: 'homebrew',
    sourceKind: 'homebrew',
    source_book: 'Eldra Homebrew',
    sourceBook: 'Eldra Homebrew',
    source_page: '',
    source_url: '',
    external_id: `homebrew__${type}__template_${template.id}__${Date.now()}`,
    imported_at: new Date().toISOString(),
    import_version: 'homebrew-forge-v1',
    template_entity_id: template.id,
    templateEntityId: template.id,
    template_title: template.title,
    templateTitle: template.title,
    template_type: template.entity_type,
    templateType: template.entity_type,
    raw_json: {
      homebrew: true,
      templateEntityId: template.id,
      templateTitle: template.title,
      templateType: template.entity_type
    }
  }
}

function homebrewMetaData(template: any, type: HomebrewType, title: string) {
  return {
    source_kind: 'homebrew',
    sourceKind: 'homebrew',
    status: 'draft',
    type,
    title,
    template_entity_id: template.id,
    templateEntityId: template.id,
    template_title: template.title,
    templateTitle: template.title,
    template_type: template.entity_type,
    templateType: template.entity_type,
    created_at: new Date().toISOString(),
    builder_version: 'homebrew-forge-v1'
  }
}

async function createBlock(entityId: any, block: {
  key: string
  label?: string
  repeatable?: boolean
  sort?: number
  data: any
}) {
  const fields = await collectionFields('block_instances', BLOCK_FALLBACK_FIELDS)

  const payload = pickSupported(fields, {
    entity_id: Number(entityId),
    block_key: block.key,
    label: block.label || titleCase(block.key),
    repeatable: block.repeatable ?? false,
    sort: block.sort ?? 100,
    data: block.data
  })

  return await directusServiceRequest('/items/block_instances', {
    method: 'POST',
    body: payload
  })
}

export function homebrewTypeOptions() {
  return Object.values(TYPE_CONFIGS).map((config) => ({
    key: config.key,
    label: config.label,
    entityTypes: config.entityTypes,
    coreBlocks: config.coreBlocks
  }))
}

export async function listHomebrewTemplates(worldId: string | number, rawType: any) {
  const type = normalizeHomebrewType(rawType || 'spell')
  const config = TYPE_CONFIGS[type]

  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: worldValue(worldId) } },
          { entity_type: { _in: config.entityTypes } }
        ]
      },
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
        'image',
        'created_at',
        'updated_at'
      ].join(',')
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []
  const blockKeys = Array.from(new Set([
    'import_source',
    'overview',
    ...config.coreBlocks
  ]))

  const blocks = await loadBlocksForEntityIds(rows.map((row: any) => row.id), blockKeys)
  const blockMap = blocksByEntityId(blocks)

  const templates = rows.map((row: any) => {
    const rowBlocks = blockMap.get(cleanText(row.id)) || []
    const source = sourceFromBlocks(rowBlocks)

    return {
      id: cleanText(row.id),
      title: cleanText(row.title) || 'Untitled Template',
      slug: cleanText(row.slug),
      entityType: cleanText(row.entity_type),
      systemKey: cleanText(row.system_key),
      summary: templateSummary(row, config, rowBlocks),
      sourceBook: source.sourceBook,
      sourcePage: source.sourcePage,
      provider: source.provider,
      metaLine: templateMetaLine(config, rowBlocks),
      blockCount: rowBlocks.length,
      coreBlockKeys: rowBlocks.map(blockKey).filter(Boolean)
    }
  })

  return {
    ok: true,
    type,
    label: config.label,
    templates
  }
}

export async function createHomebrewDraft(worldId: string | number, body: any = {}) {
  const type = normalizeHomebrewType(body?.type || 'spell')
  const config = TYPE_CONFIGS[type]
  const templateEntityId = Number(body?.templateEntityId ?? body?.template_entity_id ?? 0)

  if (!templateEntityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template entity is required'
    })
  }

  const templateRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { id: { _eq: templateEntityId } },
          { world_id: { _eq: worldValue(worldId) } },
          { entity_type: { _in: config.entityTypes } }
        ]
      },
      limit: 1,
      fields: '*'
    }
  })

  const template = Array.isArray(templateRes?.data) ? templateRes.data[0] : null

  if (!template?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Template entity was not found for this world/type'
    })
  }

  const title = cleanText(body?.title) || `Homebrew: ${template.title || config.label}`
  const slug = await uniqueEntitySlug(worldId, title)
  const summary = cleanText(body?.summary) || `Homebrew ${config.label.toLowerCase()} draft based on ${template.title || 'a template'}.`

  const entityFields = await collectionFields('entities', ENTITY_FALLBACK_FIELDS)

  const entityPayload = pickSupported(entityFields, {
    world_id: worldValue(worldId),
    title,
    slug,
    system_key: cleanText(template.system_key) || 'dnd5e',
    entity_type: type === 'species' ? 'species' : type,
    status: 'draft',
    visibility: 'world',
    summary,
    image: template.image || null
  })

  const createdRes = await directusServiceRequest('/items/entities', {
    method: 'POST',
    body: entityPayload
  })

  const created = createdRes?.data || null

  if (!created?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Homebrew entity was not created'
    })
  }

  const templateBlocks = await loadBlocksForEntityIds([template.id])
  const cloneBlocks = cloneableBlocksForType(config, templateBlocks)

  const blocksToCreate: Array<{
    key: string
    label?: string
    repeatable?: boolean
    sort?: number
    data: any
  }> = [
    {
      key: 'homebrew_meta',
      label: 'Homebrew Metadata',
      sort: 5,
      data: homebrewMetaData(template, type, title)
    },
    {
      key: 'import_source',
      label: 'Import Source',
      sort: 10,
      data: homebrewImportSourceData(template, type)
    }
  ]

  let sort = 20
  for (const block of cloneBlocks) {
    const cloned = retitleCoreBlockData(block, title, template.id)

    blocksToCreate.push({
      key: cloned.key,
      label: cleanText(block.label) || titleCase(cloned.key),
      repeatable: Boolean(block.repeatable),
      sort: Number(block.sort) || sort,
      data: cloned.data
    })

    sort += 10
  }

  if (!blocksToCreate.some((block) => block.key === 'overview')) {
    blocksToCreate.push({
      key: 'overview',
      label: 'Overview',
      sort: 30,
      data: {
        text: summary
      }
    })
  }

  const createdBlocks = []

  for (const block of blocksToCreate) {
    const createdBlock = await createBlock(created.id, block)
    if (createdBlock?.data) createdBlocks.push(createdBlock.data)
  }

  return {
    ok: true,
    type,
    template: {
      id: cleanText(template.id),
      title: cleanText(template.title),
      entityType: cleanText(template.entity_type)
    },
    entity: {
      ...created,
      imageUrl: created.image ? `/api/assets/${created.image}` : '',
      image_url: created.image ? `/api/assets/${created.image}` : '',
      blocks: createdBlocks
    },
    blocksCreated: createdBlocks.length
  }
}
