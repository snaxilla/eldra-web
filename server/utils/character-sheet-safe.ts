import { dxFetch } from './entity-factory'
import { ensureCharacterSheetForEntity } from './character-sheets'
import { resolveCharacterSheetSources } from './character-sheet-resolver'
import { computeCharacterSheetMath } from './character-sheet-math'

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function normalizeCharacterType(value: any) {
  const type = String(value || '').trim().toLowerCase()
  if (type === 'player_character') return 'pc'
  if (type === 'character') return 'npc'
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
  params.set('fields', '*')

  const res = await dxFetch(`/items/character_sheets?${params.toString()}`)
  return Array.isArray(res?.data) ? (res.data[0] || null) : null
}

async function upsertCharacterCoreSheetLink(entityId: string, entityType: string, sheetId: any) {
  const params = new URLSearchParams()
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('filter[block_key][_eq]', 'character_core')
  params.set('limit', '1')
  params.set('fields', 'id,data')

  const res = await dxFetch(`/items/block_instances?${params.toString()}`)
  const existing = Array.isArray(res?.data) ? (res.data[0] || null) : null
  const existingData = asObject(existing?.data)

  const data = {
    ...existingData,
    characterType: normalizeCharacterType(entityType),
    linkedSheetId: sheetId,
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
      entity_id: Number(entityId),
      block_key: 'character_core',
      label: 'Character Core',
      sort: 10,
      repeatable: false,
      data
    })
  }).catch(() => null)
}

async function createMinimalSheet(worldId: string, entity: any) {
  const now = new Date().toISOString()
  const entityTitle = cleanText(entity?.title || 'Character')

  const created = await dxFetch('/items/character_sheets', {
    method: 'POST',
    body: JSON.stringify({
      world_id: Number(worldId),
      entity_id: Number(entity.id),
      is_active: true,
      name: entityTitle,
      level: 1,
      class_name: '',
      subclass_name: '',
      species_name: '',
      background_name: '',
      class_entity_id: null,
      species_entity_id: null,
      background_entity_id: null,
      ability_scores: {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10
      },
      combat_stats: {
        armorClass: '',
        maxHp: '',
        currentHp: '',
        tempHp: '0',
        initiative: '',
        speed: '',
        hitDice: ''
      },
      spellcasting: {
        knownSpellIds: [],
        preparedSpellIds: [],
        alwaysPreparedSpellIds: [],
        usedSlots: {}
      },
      choices: {},
      created_at: now,
      updated_at: now
    })
  })

  const sheet = created?.data || null

  if (!sheet?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Character sheet was not created correctly'
    })
  }

  return sheet
}

async function safeInventory(sheetId: any) {
  if (!sheetId) return []

  try {
    const params = new URLSearchParams()
    params.set('filter[sheet_id][_eq]', String(sheetId))
    params.set('sort', 'sort,id')
    params.set('limit', '-1')
    params.set('fields', '*')

    const res = await dxFetch(`/items/character_sheet_inventory?${params.toString()}`)
    return Array.isArray(res?.data) ? res.data : []
  } catch {
    return []
  }
}

async function safeNotes(sheet: any) {
  const notes = asObject(sheet?.notes)

  if (Array.isArray(notes.items)) return notes.items
  if (Array.isArray(sheet?.notes)) return sheet.notes

  return []
}

async function directCharacterSheetPayload(worldId: string, entityId: string) {
  const entity = await loadCharacterEntity(worldId, entityId)
  let sheet = await findActiveSheet(worldId, entityId)

  if (!sheet) {
    sheet = await createMinimalSheet(worldId, entity)
  }

  await upsertCharacterCoreSheetLink(entityId, entity.entity_type, sheet.id)

  let resolved: any = {
    class: null,
    species: null,
    background: null,
    feats: []
  }

  let math: any = null

  try {
    resolved = await resolveCharacterSheetSources(sheet)
  } catch (error) {
    console.error('[safe-character-sheet] resolver fallback failed', error)
  }

  try {
    math = await computeCharacterSheetMath(sheet, resolved)
  } catch (error) {
    console.error('[safe-character-sheet] math fallback failed', error)
  }

  return {
    entity,
    sheet,
    resolved,
    math,
    inventory: await safeInventory(sheet.id),
    notes: await safeNotes(sheet)
  }
}

export async function safeEnsureCharacterSheetForEntity(worldId: string, entityId: string) {
  try {
    return await ensureCharacterSheetForEntity(worldId, entityId)
  } catch (error: any) {
    console.error('[safe-character-sheet] primary helper failed, using fallback', error)
    return await directCharacterSheetPayload(worldId, entityId)
  }
}
