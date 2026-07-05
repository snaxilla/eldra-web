import { directusServiceRequest } from '../../../utils/directus'
import { normalizeDnd5eItem } from '../../../utils/dnd5e-items'

const SHEET_OPTION_TYPES = [
  'class',
  'species',
  'race',
  'background',
  'item',
  'feat',
  'spell'
]

const CORE_BLOCK_KEYS = [
  'class_core',
  'species_core',
  'race_core',
  'background_core',
  'item_core',
  'feat_core',
  'spell_core'
]

function normalizeType(value: any) {
  return String(value || '').trim().toLowerCase()
}

function blockKey(value: any) {
  return String(value?.block_key || value?.blockKey || '').trim()
}

function imageUrlFor(row: any) {
  if (!row?.image) return ''

  if (typeof row.image === 'string' || typeof row.image === 'number') {
    return `/api/assets/${row.image}`
  }

  if (typeof row.image === 'object') {
    if (row.image.image_url) return row.image.image_url
    if (row.image.file_id) return `/api/assets/${row.image.file_id}`
    if (row.image.id) return `/api/assets/${row.image.id}`
  }

  return ''
}


function cleanLimitedText(value: any, limit = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function slimItemProfile(profile: any) {
  if (!profile || typeof profile !== 'object') return null

  return {
    id: profile.id || '',
    name: profile.name || '',
    source: profile.source || '',
    page: profile.page || '',
    importKind: profile.importKind || '',
    rawType: profile.rawType || '',
    typeCode: profile.typeCode || '',
    displayType: profile.displayType || 'Item',
    category: profile.category || 'generic',
    rarity: profile.rarity || '',
    description: cleanLimitedText(profile.description, 900),
    value: profile.value || '',
    valueCp: profile.valueCp ?? null,
    weight: profile.weight ?? 0,
    requiresAttunement: profile.requiresAttunement === true,
    attunementText: profile.attunementText || '',
    equippable: profile.equippable === true,
    equipSlot: profile.equipSlot || '',
    consumable: profile.consumable === true,
    container: profile.container === true,
    containerCapacity: profile.containerCapacity ?? null,
    weapon: profile.weapon || null,
    armor: profile.armor || null,
    resources: Array.isArray(profile.resources)
      ? profile.resources.map((resource: any) => ({
          key: resource?.key || '',
          label: resource?.label || '',
          max: resource?.max ?? null,
          recharge: resource?.recharge || '',
          rechargeAmount: resource?.rechargeAmount || ''
        }))
      : [],
    grantedActions: Array.isArray(profile.grantedActions)
      ? profile.grantedActions.map((action: any) => ({
          id: action?.id || '',
          name: action?.name || profile.name || 'Item Action',
          timing: action?.timing || action?.actionKind || 'Action',
          actionKind: action?.actionKind || action?.timing || 'Action',
          detail: cleanLimitedText(action?.detail || action?.description || '', 900),
          consumesResource: action?.consumesResource === true,
          spell: action?.spell || ''
        }))
      : [],
    attachedSpells: Array.isArray(profile.attachedSpells) ? profile.attachedSpells.slice(0, 20) : [],
    modifiers: Array.isArray(profile.modifiers)
      ? profile.modifiers.map((modifier: any) => ({
          type: modifier?.type || '',
          value: modifier?.value ?? 0,
          source: modifier?.source || 'item'
        }))
      : [],
    tags: Array.isArray(profile.tags) ? profile.tags.slice(0, 18) : []
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        world_id: { _eq: worldId },
        entity_type: { _in: SHEET_OPTION_TYPES }
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
        'image'
      ].join(',')
    }
  })

  const rows = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []
  const entityIds = rows.map((row: any) => row.id).filter(Boolean)
  const typeById = new Map<string, string>()

  for (const row of rows) {
    typeById.set(String(row.id), normalizeType(row.entity_type))
  }

  let coreBlocks: any[] = []
  let itemSourceBlocks: any[] = []

  if (entityIds.length) {
    const coreBlocksRes = await directusServiceRequest('/items/block_instances', {
      method: 'GET',
      query: {
        filter: {
          entity_id: { _in: entityIds },
          block_key: { _in: CORE_BLOCK_KEYS }
        },
        sort: 'entity_id,sort',
        limit: -1,
        fields: 'entity_id,block_key,label,sort,repeatable,data'
      }
    })

    coreBlocks = Array.isArray(coreBlocksRes?.data) ? coreBlocksRes.data : []

    const itemIds = rows
      .filter((row: any) => normalizeType(row.entity_type) === 'item')
      .map((row: any) => row.id)
      .filter(Boolean)

    if (itemIds.length) {
      const itemSourceRes = await directusServiceRequest('/items/block_instances', {
        method: 'GET',
        query: {
          filter: {
            entity_id: { _in: itemIds },
            block_key: { _eq: 'import_source' }
          },
          sort: 'entity_id,sort',
          limit: -1,
          fields: 'entity_id,block_key,data'
        }
      })

      itemSourceBlocks = Array.isArray(itemSourceRes?.data) ? itemSourceRes.data : []
    }
  }

  const coreBlocksByEntityId = new Map<string, any[]>()
  const itemSourceByEntityId = new Map<string, any>()

  for (const block of coreBlocks) {
    const entityId = String(block.entity_id || '')
    if (!entityId) continue

    const key = blockKey(block)

    if (!coreBlocksByEntityId.has(entityId)) {
      coreBlocksByEntityId.set(entityId, [])
    }

    coreBlocksByEntityId.get(entityId)!.push({
      entity_id: block.entity_id,
      block_key: key,
      blockKey: key,
      label: block.label,
      sort: block.sort,
      repeatable: block.repeatable,
      data: block.data || {}
    })
  }

  for (const block of itemSourceBlocks) {
    const entityId = String(block.entity_id || '')
    if (!entityId) continue
    itemSourceByEntityId.set(entityId, block?.data?.raw_json || {})
  }

  return rows.map((row: any) => {
    const id = String(row.id || '')
    const rowType = typeById.get(id) || ''
    const blocks = coreBlocksByEntityId.get(id) || []
    const core = blocks.find((block: any) => blockKey(block) === `${rowType}_core` || blockKey(block) === 'item_core')?.data || {}
    const raw = rowType === 'item' ? (itemSourceByEntityId.get(id) || {}) : null
    const rawItemProfile = rowType === 'item'
      ? normalizeDnd5eItem({
          entity: row,
          core,
          raw
        })
      : null
    const itemProfile = rawItemProfile ? slimItemProfile(rawItemProfile) : null
    const optionBlocks = rowType === 'item'
      ? blocks.map((block: any) => {
          const key = blockKey(block)
          if (key !== 'item_core') return block

          return {
            ...block,
            data: {
              ...(block.data || {}),
              description: cleanLimitedText(block?.data?.description || '', 500)
            }
          }
        })
      : blocks

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
      summary: row.summary || '',
      image: row.image,
      imageUrl: imageUrlFor(row),
      image_url: imageUrlFor(row),
      blocks: optionBlocks,
      itemProfile,
      profile: itemProfile
    }
  })
})
