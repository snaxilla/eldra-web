import { dxFetch } from './entity-factory'
import { resolveCharacterSheetSources } from './character-sheet-resolver'

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
  const resolved = sheet ? await resolveCharacterSheetSources(sheet) : null

  return {
    exists: Boolean(sheet),
    entity,
    sheet,
    inventory,
    resolved
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

  return {
    exists: true,
    entity,
    sheet,
    inventory,
    resolved
  }
}


function plainObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
    armorClass: integerOrNull(source.armorClass ?? source.armor_class ?? previous.armorClass ?? previous.armor_class),
    maxHp: integerOrNull(source.maxHp ?? source.max_hp ?? previous.maxHp ?? previous.max_hp),
    currentHp: integerOrNull(source.currentHp ?? source.current_hp ?? previous.currentHp ?? previous.current_hp),
    tempHp: integerOrNull(source.tempHp ?? source.temp_hp ?? previous.tempHp ?? previous.temp_hp) ?? 0,
    initiative: integerOrNull(source.initiative ?? previous.initiative),
    speed: nullableString(source.speed ?? previous.speed),
    hitDice: nullableString(source.hitDice ?? source.hit_dice ?? previous.hitDice ?? previous.hit_dice),
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
    combat_stats: normalizeCombatStats(body?.combatStats ?? body?.combat_stats, sheet?.combat_stats)
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

  return {
    exists: true,
    entity,
    sheet: savedSheet,
    inventory,
    resolved
  }
}


function normalizeFeatureRows(value: any) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function featureSourceExists(features: any[], sourceKey: string) {
  return features.some((feature: any) => String(feature?.sourceKey || '') === sourceKey)
}

function addFeatureIfMissing(features: any[], feature: any) {
  if (!feature?.sourceKey) return
  if (featureSourceExists(features, feature.sourceKey)) return
  features.push(feature)
}

function parseInventoryData(value: any) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  return {}
}

function inventorySourceExists(inventory: any[], sourceKey: string) {
  return inventory.some((item: any) => {
    const data = parseInventoryData(item?.data)
    return String(data?.sourceKey || '') === sourceKey
  })
}

async function createInventoryPackageIfMissing(args: {
  sheetId: any
  inventory: any[]
  sourceKey: string
  sourceType: string
  sourceEntityId: any
  sourceName: string
  name: string
  notes: string
  sort: number
}) {
  const notes = String(args.notes || '').trim()
  if (!notes) return null
  if (inventorySourceExists(args.inventory, args.sourceKey)) return null

  const created = await dxFetch('/items/character_sheet_inventory', {
    method: 'POST',
    body: JSON.stringify({
      sheet_id: Number(args.sheetId),
      item_entity_id: null,
      name: args.name,
      quantity: 1,
      equipped: false,
      attuned: false,
      container: 'Starting Package',
      notes,
      sort: args.sort,
      data: {
        sourceKey: args.sourceKey,
        sourceType: args.sourceType,
        sourceEntityId: args.sourceEntityId ? Number(args.sourceEntityId) : null,
        sourceName: args.sourceName,
        appliedBy: 'starting-package'
      }
    })
  }).catch(() => null)

  return created?.data || null
}

export async function applyStartingPackageForEntity(worldId: string, entityId: string) {
  const entity = await loadCharacterEntity(worldId, entityId)
  let sheet = await findActiveSheet(worldId, entityId)

  if (!sheet) {
    sheet = await createSheetForEntity(worldId, entity)
  }

  const resolved = await resolveCharacterSheetSources(sheet)
  const existingProficiencies = plainObject(sheet?.proficiencies)
  const features = normalizeFeatureRows(sheet?.features)
  const applied: string[] = []

  const nextProficiencies = {
    ...existingProficiencies
  }

  if (resolved?.class) {
    nextProficiencies.class = {
      sourceEntityId: resolved.class.id,
      sourceName: resolved.class.title,
      savingThrows: resolved.class.savingThrows || null,
      armor: resolved.class.armorProficiencies || null,
      weapons: resolved.class.weaponProficiencies || null,
      tools: resolved.class.toolProficiencies || null
    }

    addFeatureIfMissing(features, {
      sourceKey: `class-features:${resolved.class.id}`,
      sourceType: 'class',
      sourceEntityId: resolved.class.id,
      sourceName: resolved.class.title,
      title: `Class Features: ${resolved.class.title}`,
      summary: resolved.class.featureCount
        ? `${resolved.class.featureCount} imported class feature references are available.`
        : ''
    })

    applied.push('class proficiencies/features')
  }

  if (resolved?.species) {
    addFeatureIfMissing(features, {
      sourceKey: `species-traits:${resolved.species.id}`,
      sourceType: 'species',
      sourceEntityId: resolved.species.id,
      sourceName: resolved.species.title,
      title: `Species Traits: ${resolved.species.title}`,
      summary: resolved.species.traits || `${resolved.species.rawTraitCount || 0} species traits are available.`
    })

    applied.push('species traits')
  }

  if (resolved?.background) {
    nextProficiencies.background = {
      sourceEntityId: resolved.background.id,
      sourceName: resolved.background.title,
      skills: resolved.background.skillProficiencies || null,
      tools: resolved.background.toolProficiencies || null,
      languages: resolved.background.languages || null
    }

    addFeatureIfMissing(features, {
      sourceKey: `background-feature:${resolved.background.id}`,
      sourceType: 'background',
      sourceEntityId: resolved.background.id,
      sourceName: resolved.background.title,
      title: resolved.background.featureName || `Background Feature: ${resolved.background.title}`,
      summary: resolved.background.featureDescription || ''
    })

    applied.push('background proficiencies/feature')
  }

  const combatStats = plainObject(sheet?.combat_stats)

  if (!combatStats.speed && resolved?.species?.speed) {
    combatStats.speed = String(resolved.species.speed)
    applied.push('species speed')
  }

  if (!combatStats.hitDice && resolved?.class?.hitDie) {
    combatStats.hitDice = String(resolved.class.hitDie)
    applied.push('class hit dice')
  }

  const saved = await dxFetch(`/items/character_sheets/${sheet.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      proficiencies: nextProficiencies,
      features,
      combat_stats: combatStats
    })
  })

  const savedSheet = saved?.data || {
    ...sheet,
    proficiencies: nextProficiencies,
    features,
    combat_stats: combatStats
  }

  const existingInventory = await loadInventory(sheet.id)
  const createdInventory: any[] = []

  if (resolved?.class?.startingEquipment) {
    const created = await createInventoryPackageIfMissing({
      sheetId: sheet.id,
      inventory: existingInventory,
      sourceKey: `class-starting-equipment:${resolved.class.id}`,
      sourceType: 'class',
      sourceEntityId: resolved.class.id,
      sourceName: resolved.class.title,
      name: `Class Starting Equipment: ${resolved.class.title}`,
      notes: resolved.class.startingEquipment,
      sort: 100
    })

    if (created) {
      createdInventory.push(created)
      existingInventory.push(created)
      applied.push('class starting equipment')
    }
  }

  if (resolved?.background?.equipment) {
    const created = await createInventoryPackageIfMissing({
      sheetId: sheet.id,
      inventory: existingInventory,
      sourceKey: `background-starting-equipment:${resolved.background.id}`,
      sourceType: 'background',
      sourceEntityId: resolved.background.id,
      sourceName: resolved.background.title,
      name: `Background Starting Equipment: ${resolved.background.title}`,
      notes: resolved.background.equipment,
      sort: 110
    })

    if (created) {
      createdInventory.push(created)
      existingInventory.push(created)
      applied.push('background starting equipment')
    }
  }

  const inventory = await loadInventory(sheet.id)
  const nextResolved = await resolveCharacterSheetSources(savedSheet)

  return {
    exists: true,
    entity,
    sheet: savedSheet,
    inventory,
    resolved: nextResolved,
    applied: {
      changed: applied,
      createdInventoryCount: createdInventory.length,
      message: applied.length
        ? `Applied: ${applied.join(', ')}.`
        : 'Starting package already applied.'
    }
  }
}
