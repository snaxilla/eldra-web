import { dxFetch } from './entity-factory'
import { resolveCharacterSheetSources } from './character-sheet-resolver'
import { computeCharacterSheetMath } from './character-sheet-math'

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


function inventoryLinkedItemId(row: any) {
  const candidates = [
    row?.item_entity_id,
    row?.itemEntityId,
    row?.entity_item_id,
    row?.item_id,
    row?.linked_item_entity_id
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && candidate.id) return candidate.id
    if (candidate !== null && candidate !== undefined && candidate !== '') return candidate
  }

  return null
}

function inventoryBlockByKey(blocks: any[], key: string) {
  return blocks.find((block: any) => String(block?.block_key || block?.blockKey || '') === key) || null
}

async function enrichInventoryItem(worldId: string | number, row: any) {
  const itemId = inventoryLinkedItemId(row)
  if (!itemId) return row

  try {
    const entityRes = await dxFetch(`/items/entities/${itemId}?fields=id,title,slug,entity_type,world_id,summary`)
    const entity = entityRes?.data || null

    if (
      !entity ||
      String(entity.world_id) !== String(worldId) ||
      String(entity.entity_type || '').toLowerCase() !== 'item'
    ) {
      return row
    }

    const blocksRes = await dxFetch(`/items/block_instances?filter[entity_id][_eq]=${itemId}&sort=sort&fields=*&limit=-1`)
    const blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
    const itemCore = inventoryBlockByKey(blocks, 'item_core')?.data || {}
    const importSource = inventoryBlockByKey(blocks, 'import_source')?.data || {}

    return {
      ...row,
      linked_item: entity,
      linkedItem: entity,
      item_core: itemCore,
      itemCore,
      import_source: importSource,
      importSource,
      item_raw_json: importSource?.raw_json || null,
      itemRawJson: importSource?.raw_json || null
    }
  } catch {
    return row
  }
}

async function enrichInventoryItems(worldId: string | number, rows: any[]) {
  const inventory = Array.isArray(rows) ? rows : []
  return await Promise.all(inventory.map((row) => enrichInventoryItem(worldId, row)))
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
      class_entity_id: null,
      species_entity_id: null,
      background_entity_id: null,
      is_active: true,
      visibility: 'world',
      ability_scores: defaultAbilityScores(),
      combat_stats: defaultCombatStats(),
      proficiencies: {},
      resources: {},
      spellcasting: {},
      features: [],
      notes: {},
      choices: {}
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
  const rawInventory = sheet?.id ? await loadInventory(sheet.id) : []
  const inventory = await enrichInventoryItems(worldId, rawInventory)
  const resolved = sheet ? await resolveCharacterSheetSources(sheet) : null
  const math = sheet ? computeCharacterSheetMath(sheet, resolved, inventory) : null

  return {
    exists: Boolean(sheet),
    entity,
    sheet,
    inventory,
    resolved,
    math
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
  const resolved = await resolveCharacterSheetSources(sheet)
  const math = computeCharacterSheetMath(sheet, resolved)

  return {
    exists: true,
    entity,
    sheet,
    inventory,
    resolved,
    math
  }
}


function plainObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeIdList(value: any) {
  if (!Array.isArray(value)) return []

  return value
    .map((item: any) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeSheetSpellcasting(value: any, fallback: any = {}) {
  const source = plainObject(value)
  const previous = plainObject(fallback)

  function idList(raw: any, previousRaw: any = []) {
    const valueToUse = Array.isArray(raw) ? raw : previousRaw
    if (!Array.isArray(valueToUse)) return []

    return valueToUse
      .map((item: any) => String(item || '').trim())
      .filter(Boolean)
  }

  function usedSlots(raw: any, previousRaw: any = {}) {
    const slotSource = plainObject(raw)
    const slotPrevious = plainObject(previousRaw)
    const merged = {
      ...slotPrevious,
      ...slotSource
    }

    const normalized: Record<string, number> = {}

    for (const [level, value] of Object.entries(merged)) {
      const parsedLevel = Number(level)
      if (!Number.isFinite(parsedLevel) || parsedLevel < 1 || parsedLevel > 9) continue

      const parsedValue = Number(value)
      normalized[String(Math.floor(parsedLevel))] = Number.isFinite(parsedValue)
        ? Math.max(0, Math.floor(parsedValue))
        : 0
    }

    return normalized
  }

  return {
    ...previous,
    ...source,
    knownSpellIds: idList(
      source.knownSpellIds ?? source.known_spell_ids,
      previous.knownSpellIds ?? previous.known_spell_ids
    ),
    preparedSpellIds: idList(
      source.preparedSpellIds ?? source.prepared_spell_ids,
      previous.preparedSpellIds ?? previous.prepared_spell_ids
    ),
    alwaysPreparedSpellIds: idList(
      source.alwaysPreparedSpellIds ?? source.always_prepared_spell_ids,
      previous.alwaysPreparedSpellIds ?? previous.always_prepared_spell_ids
    ),
    usedSlots: usedSlots(
      source.usedSlots ?? source.used_slots,
      previous.usedSlots ?? previous.used_slots
    )
  }
}

function normalizeChoiceToken(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function normalizeSheetChoices(value: any) {
  const source = plainObject(value)
  const normalized: Record<string, any> = {}
  const usedSkills = new Set<string>()

  for (const [sourceKey, rawChoice] of Object.entries(source)) {
    const choice = plainObject(rawChoice)
    const type = String(choice.type || '').trim().toLowerCase()
    const selectedValues = Array.isArray(choice.selected) ? choice.selected : []
    const selected: string[] = []

    for (const rawSelected of selectedValues) {
      const token = normalizeChoiceToken(rawSelected)
      if (!token) continue

      if (type === 'skill') {
        if (usedSkills.has(token)) continue
        usedSkills.add(token)
      }

      selected.push(token)
    }

    normalized[sourceKey] = {
      ...choice,
      selected
    }
  }

  return normalized
}

function nullableString(value: any) {
  const text = String(value ?? '').trim()
  return text || null
}

function integerOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null

  return Math.floor(parsed)
}

function positiveIntegerOrNull(value: any) {
  const parsed = integerOrNull(value)
  if (parsed === null || parsed <= 0) return null
  return parsed
}

function nonZeroNullableString(value: any) {
  const text = nullableString(value)
  if (!text || text === '0') return null
  return text
}

function positiveInteger(value: any, fallback = 1) {
  const parsed = integerOrNull(value)
  if (parsed === null) return fallback
  return Math.max(1, parsed)
}

function normalizeAbilityScores(value: any, fallback: any = {}) {
  const source = plainObject(value)
  const previous = plainObject(fallback)
  const defaults = defaultAbilityScores()
  const result: Record<string, number> = {}

  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    const parsed = integerOrNull(source[key] ?? previous[key] ?? defaults[key as keyof typeof defaults])
    result[key] = parsed === null ? defaults[key as keyof typeof defaults] : parsed
  }

  return result
}

function normalizeCombatStats(value: any, fallback: any = {}) {
  const source = plainObject(value)
  const previous = plainObject(fallback)

  return {
    ...previous,
    armorClass: positiveIntegerOrNull(source.armorClass ?? source.armor_class ?? previous.armorClass ?? previous.armor_class),
    maxHp: positiveIntegerOrNull(source.maxHp ?? source.max_hp ?? previous.maxHp ?? previous.max_hp),
    currentHp: integerOrNull(source.currentHp ?? source.current_hp ?? previous.currentHp ?? previous.current_hp),
    tempHp: integerOrNull(source.tempHp ?? source.temp_hp ?? previous.tempHp ?? previous.temp_hp) ?? 0,
    initiative: integerOrNull(source.initiative ?? previous.initiative),
    speed: nonZeroNullableString(source.speed ?? previous.speed),
    hitDice: nonZeroNullableString(source.hitDice ?? source.hit_dice ?? previous.hitDice ?? previous.hit_dice),
    deathSaves: plainObject(source.deathSaves ?? source.death_saves ?? previous.deathSaves ?? previous.death_saves)
  }
}

export async function updateCharacterSheetForEntity(worldId: string, entityId: string, body: any = {}) {
  const entity = await loadCharacterEntity(worldId, entityId)
  let sheet = await findActiveSheet(worldId, entityId)

  if (!sheet) {
    sheet = await createSheetForEntity(worldId, entity)
  }

  const classEntityIdProvided = body?.classEntityId !== undefined || body?.class_entity_id !== undefined
  const speciesEntityIdProvided = body?.speciesEntityId !== undefined || body?.species_entity_id !== undefined
  const backgroundEntityIdProvided = body?.backgroundEntityId !== undefined || body?.background_entity_id !== undefined

  const payload = {
    name: nullableString(body?.name) || String(entity.title || 'Unnamed Character'),
    level: positiveInteger(body?.level, Number(sheet?.level || 1)),
    class_name: nullableString(body?.className ?? body?.class_name),
    subclass_name: nullableString(body?.subclassName ?? body?.subclass_name),
    species_name: nullableString(body?.speciesName ?? body?.species_name),
    background_name: nullableString(body?.backgroundName ?? body?.background_name),
    class_entity_id: classEntityIdProvided ? integerOrNull(body?.classEntityId ?? body?.class_entity_id) : integerOrNull(sheet?.class_entity_id),
    species_entity_id: speciesEntityIdProvided ? integerOrNull(body?.speciesEntityId ?? body?.species_entity_id) : integerOrNull(sheet?.species_entity_id),
    background_entity_id: backgroundEntityIdProvided ? integerOrNull(body?.backgroundEntityId ?? body?.background_entity_id) : integerOrNull(sheet?.background_entity_id),
    ability_scores: normalizeAbilityScores(body?.abilityScores ?? body?.ability_scores, sheet?.ability_scores),
    combat_stats: normalizeCombatStats(body?.combatStats ?? body?.combat_stats, sheet?.combat_stats),
    spellcasting: body?.spellcasting !== undefined ? normalizeSheetSpellcasting(body.spellcasting, sheet?.spellcasting) : normalizeSheetSpellcasting(sheet?.spellcasting),
    choices: body?.choices !== undefined ? normalizeSheetChoices(body.choices) : normalizeSheetChoices(sheet?.choices)
  }

  const resolvedForDefaults = await resolveCharacterSheetSources({
    ...sheet,
    ...payload
  })

  if (!payload.combat_stats.speed && resolvedForDefaults?.species?.speed) {
    payload.combat_stats.speed = String(resolvedForDefaults.species.speed)
  }

  if (!payload.combat_stats.hitDice && resolvedForDefaults?.class?.hitDie) {
    payload.combat_stats.hitDice = String(resolvedForDefaults.class.hitDie)
  }

  const updated = await dxFetch(`/items/character_sheets/${sheet.id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  const savedSheet = updated?.data || {
    ...sheet,
    ...payload
  }

  await upsertCharacterCoreSheetLink(String(entity.id), entity.entity_type, savedSheet.id || sheet.id)

  const inventory = await loadInventory(savedSheet.id || sheet.id)
  const resolved = await resolveCharacterSheetSources(savedSheet)
  const math = computeCharacterSheetMath(savedSheet, resolved)

  return {
    exists: true,
    entity,
    sheet: savedSheet,
    inventory,
    resolved,
    math
  }
}
