import { dxFetch } from './entity-factory'

function normalizeCharacterType(value: any) {
  const type = String(value || '').trim().toLowerCase()
  if (type === 'player_character') return 'pc'
  if (type === 'character') return 'npc'
  if (type === 'pc') return 'pc'
  if (type === 'npc_sheet') return 'npc_sheet'
  if (type === 'npc') return 'npc'
  return type
}

function isCharacterType(value: any) {
  return ['character', 'npc', 'npc_sheet', 'pc', 'player_character'].includes(String(value || '').toLowerCase())
}

async function loadCharacterEntity(worldId: string, entityId: string) {
  const entityRes = await dxFetch(`/items/entities/${entityId}?fields=id,world_id,title,entity_type,summary,image`)
  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Character article not found in this world'
    })
  }

  if (!isCharacterType(entity.entity_type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Entity is not a character article'
    })
  }

  return entity
}

async function findActiveSheet(worldId: string, entityId: string) {
  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', String(worldId))
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('filter[is_active][_eq]', 'true')
  params.set('sort', '-id')
  params.set('limit', '1')
  params.append('fields[]', '*')

  const res = await dxFetch(`/items/character_sheets?${params.toString()}`)
  return Array.isArray(res?.data) ? (res.data[0] || null) : null
}

async function loadInventory(sheetId: any) {
  if (!sheetId) return []

  const params = new URLSearchParams()
  params.set('filter[sheet_id][_eq]', String(sheetId))
  params.set('sort', 'sort,id')
  params.set('limit', '-1')
  params.append('fields[]', '*')

  const res = await dxFetch(`/items/character_sheet_inventory?${params.toString()}`)
  return Array.isArray(res?.data) ? res.data : []
}

async function upsertCharacterCoreSheetLink(entityId: string, entityType: string, sheetId: any) {
  const params = new URLSearchParams()
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('filter[block_key][_eq]', 'character_core')
  params.set('limit', '1')
  params.append('fields[]', 'id')
  params.append('fields[]', 'data')

  const res = await dxFetch(`/items/block_instances?${params.toString()}`)
  const existing = Array.isArray(res?.data) ? (res.data[0] || null) : null
  const existingData = existing?.data && typeof existing.data === 'object' ? existing.data : {}

  const data = {
    ...existingData,
    characterType: existingData.characterType ?? existingData.character_type ?? normalizeCharacterType(entityType),
    linkedSheetId: sheetId ? String(sheetId) : null,
    playerName: existingData.playerName ?? existingData.player_name ?? null,
    pronouns: existingData.pronouns ?? null,
    publicRole: existingData.publicRole ?? existingData.public_role ?? null
  }

  if (existing?.id) {
    await dxFetch(`/items/block_instances/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data })
    }).catch(() => null)
    return
  }

  await dxFetch('/items/block_instances', {
    method: 'POST',
    body: JSON.stringify({
      entity_id: entityId,
      block_key: 'character_core',
      label: 'Character Core',
      sort: 10,
      data
    })
  }).catch(() => null)
}

function defaultAbilityScores() {
  return {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10
  }
}

function defaultCombatStats() {
  return {
    armorClass: null,
    maxHp: null,
    currentHp: null,
    tempHp: 0,
    initiative: null,
    speed: null,
    hitDice: null,
    deathSaves: {
      successes: 0,
      failures: 0
    }
  }
}

async function createSheetForEntity(worldId: string, entity: any) {
  const created = await dxFetch('/items/character_sheets', {
    method: 'POST',
    body: JSON.stringify({
      world_id: Number(worldId),
      entity_id: Number(entity.id),
      sheet_type: 'dnd5e',
      name: String(entity.title || 'Unnamed Character'),
      level: 1,
      class_name: null,
      subclass_name: null,
      species_name: null,
      background_name: null,
      is_active: true,
      visibility: 'world',
      ability_scores: defaultAbilityScores(),
      combat_stats: defaultCombatStats(),
      proficiencies: {},
      resources: {},
      spellcasting: {},
      features: [],
      notes: {}
    })
  })

  const sheet = created?.data || null

  if (!sheet?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Character sheet was not created correctly'
    })
  }

  await upsertCharacterCoreSheetLink(String(entity.id), entity.entity_type, sheet.id)

  return sheet
}

export async function getCharacterSheetForEntity(worldId: string, entityId: string) {
  const entity = await loadCharacterEntity(worldId, entityId)
  const sheet = await findActiveSheet(worldId, entityId)
  const inventory = sheet?.id ? await loadInventory(sheet.id) : []

  return {
    exists: Boolean(sheet),
    entity,
    sheet,
    inventory
  }
}

export async function ensureCharacterSheetForEntity(worldId: string, entityId: string) {
  const entity = await loadCharacterEntity(worldId, entityId)
  let sheet = await findActiveSheet(worldId, entityId)

  if (!sheet) {
    sheet = await createSheetForEntity(worldId, entity)
  } else {
    await upsertCharacterCoreSheetLink(String(entity.id), entity.entity_type, sheet.id)
  }

  const inventory = await loadInventory(sheet.id)

  return {
    exists: true,
    entity,
    sheet,
    inventory
  }
}
