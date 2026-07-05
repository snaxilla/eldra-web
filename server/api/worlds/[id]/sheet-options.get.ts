import { directusServiceRequest } from '../../../utils/directus'
import { normalizeDnd5eItem } from '../../../utils/dnd5e-items'

const SHEET_OPTION_TYPES = [
  'class',
  'species',
  'race',
  'background',
  'item',
  'feat'
]

function normalizeType(value: any) {
  return String(value || '').trim().toLowerCase()
}

function blockKey(value: any) {
  return String(value?.block_key || value?.blockKey || '').trim()
}

function text(value: any) {
  return String(value ?? '').trim()
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

function cleanLimitedText(value: any, limit = 360) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim()
  return cleaned.length > limit ? `${cleaned.slice(0, limit).trim()}...` : cleaned
}

function inventoryLinkedItemId(row: any) {
  return text(
    row?.item_entity_id ??
    row?.itemEntityId ??
    row?.entity_item_id ??
    row?.item_id ??
    row?.linked_item_entity_id ??
    row?.item_entity ??
    ''
  )
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
    description: cleanLimitedText(profile.description, 520),
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
          detail: cleanLimitedText(action?.detail || action?.description || '', 520),
          consumesResource: action?.consumesResource === true,
          spell: action?.spell || ''
        }))
      : [],
    attachedSpells: Array.isArray(profile.attachedSpells) ? profile.attachedSpells.slice(0, 16) : [],
    modifiers: Array.isArray(profile.modifiers)
      ? profile.modifiers.map((modifier: any) => ({
          type: modifier?.type || '',
          value: modifier?.value ?? 0,
          source: modifier?.source || 'item'
        }))
      : [],
    tags: Array.isArray(profile.tags) ? profile.tags.slice(0, 12) : []
  }
}

async function activeSheetInventoryItemIds(worldId: string, entityId: string) {
  if (!worldId || !entityId) return new Set<string>()

  const sheetRes = await directusServiceRequest('/items/character_sheets', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { entity_id: { _eq: Number(entityId) } },
          { is_active: { _eq: true } }
        ]
      },
      sort: '-id',
      limit: 1,
      fields: 'id'
    }
  }).catch(() => ({ data: [] }))

  const sheet = Array.isArray(sheetRes?.data) ? sheetRes.data[0] : null
  if (!sheet?.id) return new Set<string>()

  const inventoryRes = await directusServiceRequest('/items/character_sheet_inventory', {
    method: 'GET',
    query: {
      filter: {
        sheet_id: { _eq: Number(sheet.id) }
      },
      sort: 'sort,id',
      limit: -1,
      fields: '*'
    }
  }).catch(() => ({ data: [] }))

  const rows = Array.isArray(inventoryRes?.data) ? inventoryRes.data : []
  const ids = rows
    .map(inventoryLinkedItemId)
    .filter(Boolean)

  return new Set(ids)
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event)
  const entityId = text(query.entityId || query.characterEntityId || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const profiledItemIds = await activeSheetInventoryItemIds(worldId, entityId)

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
  const profiledIds = rows
    .filter((row: any) =>
      normalizeType(row?.entity_type) === 'item' &&
      profiledItemIds.has(String(row?.id || ''))
    )
    .map((row: any) => row.id)
    .filter(Boolean)

  let itemBlocks: any[] = []

  if (profiledIds.length) {
    const itemBlocksRes = await directusServiceRequest('/items/block_instances', {
      method: 'GET',
      query: {
        filter: {
          entity_id: { _in: profiledIds },
          block_key: { _in: ['item_core', 'import_source'] }
        },
        sort: 'entity_id,sort',
        limit: -1,
        fields: 'entity_id,block_key,label,sort,repeatable,data'
      }
    })

    itemBlocks = Array.isArray(itemBlocksRes?.data) ? itemBlocksRes.data : []
  }

  const itemBlocksByEntityId = new Map<string, any[]>()

  for (const block of itemBlocks) {
    const entityId = String(block?.entity_id || '')
    if (!entityId) continue

    if (!itemBlocksByEntityId.has(entityId)) {
      itemBlocksByEntityId.set(entityId, [])
    }

    itemBlocksByEntityId.get(entityId)!.push(block)
  }

  return rows.map((row: any) => {
    const id = String(row.id || '')
    const rowType = normalizeType(row.entity_type)
    const isProfiledItem = rowType === 'item' && profiledItemIds.has(id)
    const rawBlocks = isProfiledItem ? (itemBlocksByEntityId.get(id) || []) : []
    const itemCore = rawBlocks.find((block: any) => blockKey(block) === 'item_core')?.data || {}
    const rawJson = rawBlocks.find((block: any) => blockKey(block) === 'import_source')?.data?.raw_json || null

    const itemProfile = isProfiledItem
      ? slimItemProfile(normalizeDnd5eItem({
          entity: row,
          core: itemCore,
          raw: rawJson || {}
        }))
      : null

    const blocks = isProfiledItem
      ? rawBlocks
          .filter((block: any) => blockKey(block) === 'item_core')
          .map((block: any) => ({
            entity_id: block.entity_id,
            block_key: 'item_core',
            blockKey: 'item_core',
            label: block.label,
            sort: block.sort,
            repeatable: block.repeatable,
            data: {
              name: itemCore.name || row.title,
              import_kind: itemCore.import_kind || '',
              item_type: itemCore.item_type || itemProfile?.rawType || '',
              rarity: itemCore.rarity || itemProfile?.rarity || '',
              weight: itemCore.weight ?? itemProfile?.weight ?? '',
              value: itemCore.value ?? itemProfile?.value ?? '',
              attunement: itemCore.attunement ?? itemProfile?.requiresAttunement ?? false,
              damage: itemCore.damage || itemProfile?.weapon?.damage || '',
              damage_type: itemCore.damage_type || itemProfile?.weapon?.damageType || '',
              armor_class: itemCore.armor_class || itemProfile?.armor?.baseAc || '',
              description: itemProfile?.description || ''
            }
          }))
      : []

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
      blocks,
      itemProfile,
      profile: itemProfile
    }
  })
})
