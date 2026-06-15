import { dxFetch, slugify } from '../../../../utils/entity-factory'

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function integerOrNull(value: any) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function abilityModifier(score: any) {
  const parsed = Number(score)
  if (!Number.isFinite(parsed)) return 0
  return Math.floor((parsed - 10) / 2)
}

function normalizeChoiceGroups(value: any) {
  const raw = asObject(value)
  const out: Record<string, any> = {}

  for (const [key, choice] of Object.entries(raw)) {
    const safeKey = cleanText(key)
    const data = asObject(choice)

    if (!safeKey) continue

    const values = Array.isArray(data.values)
      ? data.values.map(cleanText).filter(Boolean)
      : data.value
        ? [cleanText(data.value)]
        : []

    if (!values.length) continue

    out[safeKey] = {
      label: cleanText(data.label || safeKey),
      values,
      value: values[0] || '',
      detail: cleanText(data.detail || ''),
      note: cleanText(data.note || ''),
      meta: asObject(data.meta)
    }
  }

  return out
}

function normalizeSpeciesChoices(value: any) {
  return normalizeChoiceGroups(value)
}

function normalizeClassChoices(value: any) {
  return normalizeChoiceGroups(value)
}

function normalizeBackgroundChoices(value: any) {
  return normalizeChoiceGroups(value)
}

async function linkedEntityTitle(id: any) {
  const entityId = integerOrNull(id)
  if (!entityId) return ''

  try {
    const res = await dxFetch(`/items/entities/${entityId}?fields=id,title,entity_type`)
    return cleanText(res?.data?.title)
  } catch {
    return ''
  }
}

async function linkedEntityBlocks(id: any) {
  const entityId = integerOrNull(id)
  if (!entityId) return []

  try {
    const params = new URLSearchParams()
    params.set('filter[entity_id][_eq]', String(entityId))
    params.set('fields', 'block_key,data')
    params.set('limit', '-1')

    const res = await dxFetch(`/items/block_instances?${params.toString()}`)
    return Array.isArray(res?.data) ? res.data : []
  } catch {
    return []
  }
}

function blockData(blocks: any[], key: string) {
  const block = blocks.find((item: any) =>
    String(item?.block_key || item?.blockKey || '') === key
  )

  return asObject(block?.data)
}

function parseHitDieFaces(blocks: any[]) {
  const core = blockData(blocks, 'class_core')
  const raw = asObject(blockData(blocks, 'import_source')?.raw_json)

  const candidates = [
    core.hit_die,
    core.hitDie,
    raw?.hd?.faces ? `d${raw.hd.faces}` : '',
    raw?.hitDie,
    raw?.hit_die
  ]

  for (const candidate of candidates) {
    const match = String(candidate || '').toLowerCase().match(/d(\d+)/)
    if (!match) continue

    const faces = Number(match[1])
    if (Number.isFinite(faces) && faces > 0) return faces
  }

  return 6
}

function fixedHitDieAverage(faces: number) {
  const fixed: Record<number, number> = {
    4: 3,
    6: 4,
    8: 5,
    10: 6,
    12: 7
  }

  return fixed[faces] || Math.floor(faces / 2) + 1
}

function parseSpeciesSpeed(blocks: any[]) {
  const core = blockData(blocks, 'species_core')
  const raw = asObject(blockData(blocks, 'import_source')?.raw_json)

  const coreSpeed = Number(core.speed)
  if (Number.isFinite(coreSpeed) && coreSpeed > 0) return Math.floor(coreSpeed)

  const rawSpeed = raw.speed

  if (typeof rawSpeed === 'number' && rawSpeed > 0) return Math.floor(rawSpeed)

  if (rawSpeed && typeof rawSpeed === 'object') {
    const walk = Number(rawSpeed.walk ?? rawSpeed.walking ?? rawSpeed.base)
    if (Number.isFinite(walk) && walk > 0) return Math.floor(walk)
  }

  return 30
}

function normalizeAbilityScores(value: any) {
  const raw = asObject(value)
  const fallback = {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10
  }

  for (const key of Object.keys(fallback)) {
    const parsed = Number(raw[key])
    ;(fallback as any)[key] = Number.isFinite(parsed)
      ? Math.min(30, Math.max(1, Math.floor(parsed)))
      : 10
  }

  return fallback
}

function startingHp(level: number, hitDieFaces: number, conScore: number) {
  const conMod = abilityModifier(conScore)
  const firstLevel = Math.max(1, hitDieFaces + conMod)
  const laterLevelGain = Math.max(1, fixedHitDieAverage(hitDieFaces) + conMod)

  return Math.max(1, firstLevel + Math.max(0, level - 1) * laterLevelGain)
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

async function upsertCharacterCoreSheetLink(entityId: string, sheetId: any) {
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
    characterType: 'pc',
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

async function directusFieldSet(collection: string) {
  try {
    const res = await dxFetch(`/fields/${collection}`)
    const fields = Array.isArray(res?.data) ? res.data : []

    return new Set(fields.map((field: any) => String(field?.field || '')).filter(Boolean))
  } catch {
    return new Set<string>()
  }
}

function onlyKnownFields(payload: Record<string, any>, fields: Set<string>) {
  if (!fields.size) return payload

  const out: Record<string, any> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (fields.has(key)) out[key] = value
  }

  return out
}

async function loadExistingInventoryRows(sheetId: any) {
  try {
    const params = new URLSearchParams()
    params.set('filter[sheet_id][_eq]', String(sheetId))
    params.set('limit', '-1')
    params.set('fields', '*')

    const res = await dxFetch(`/items/character_sheet_inventory?${params.toString()}`)
    return Array.isArray(res?.data) ? res.data : []
  } catch {
    return []
  }
}

function rowInventoryName(row: any) {
  return cleanText(
    row?.custom_name ||
    row?.customName ||
    row?.name ||
    row?.title ||
    row?.label ||
    row?.data?.custom_name ||
    row?.data?.name
  )
}

function toolInventoryItemsFromChoices(classChoices: Record<string, any>, backgroundChoices: Record<string, any>) {
  const items: Array<{ name: string; source: string }> = []

  function collect(groups: Record<string, any>, source: string) {
    for (const [key, rawGroup] of Object.entries(groups)) {
      const group = asObject(rawGroup)
      const text = `${key} ${group.label || ''} ${group.note || ''}`.toLowerCase()

      if (!text.includes('tool') && !text.includes('instrument')) continue

      const values = Array.isArray(group.values)
        ? group.values
        : group.value
          ? [group.value]
          : []

      for (const value of values) {
        const name = cleanText(value)
        if (name) items.push({ name, source })
      }
    }
  }

  collect(classChoices, 'Class Tools')
  collect(backgroundChoices, 'Background Tools')

  const seen = new Set<string>()

  return items.filter((item) => {
    const key = item.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function seedBuilderInventoryTools(sheetId: any, classChoices: Record<string, any>, backgroundChoices: Record<string, any>) {
  if (!sheetId) return

  const toolItems = toolInventoryItemsFromChoices(classChoices, backgroundChoices)
  if (!toolItems.length) return

  const fields = await directusFieldSet('character_sheet_inventory')
  const existingRows = await loadExistingInventoryRows(sheetId)
  const existingNames = new Set(existingRows.map(rowInventoryName).filter(Boolean).map((name) => name.toLowerCase()))

  let sort = 8800

  for (const item of toolItems) {
    if (existingNames.has(item.name.toLowerCase())) continue

    const basePayload: Record<string, any> = {
      sheet_id: Number(sheetId),
      sheet: Number(sheetId),
      custom_name: item.name,
      customName: item.name,
      name: item.name,
      title: item.name,
      quantity: 1,
      equipped: false,
      carried: true,
      item_type: 'Tool',
      itemType: 'Tool',
      source: 'guided_builder',
      source_type: item.source,
      notes: `Added by Guided Builder: ${item.source}`,
      sort,
      data: {
        custom_name: item.name,
        item_type: 'Tool',
        source: 'guided_builder',
        source_type: item.source
      }
    }

    const payload = onlyKnownFields(basePayload, fields)

    if (!payload.sheet_id && fields.has('sheet_id')) payload.sheet_id = Number(sheetId)
    if (!payload.sheet && fields.has('sheet')) payload.sheet = Number(sheetId)

    try {
      await dxFetch('/items/character_sheet_inventory', {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      existingNames.add(item.name.toLowerCase())
      sort += 10
    } catch (error) {
      console.error('[guided-character-builder] failed to seed inventory tool', item.name, error)
    }
  }
}

async function createOrPatchCharacterSheet(options: {
  worldId: string
  entityId: string
  name: string
  level: number
  className: string
  speciesName: string
  backgroundName: string
  classEntityId: number
  speciesEntityId: number
  backgroundEntityId: number | null
  abilityScores: Record<string, number>
  maxHp: number
  speed: number
  hitDieFaces: number
  speciesChoices: Record<string, any>
  classChoices: Record<string, any>
  backgroundChoices: Record<string, any>
}) {
  const now = new Date().toISOString()
  const existing = await findActiveSheet(options.worldId, options.entityId)
  const existingCombatStats = asObject(existing?.combat_stats)
  const existingChoices = asObject(existing?.choices)

  const payload = {
    world_id: Number(options.worldId),
    entity_id: Number(options.entityId),
    is_active: true,
    name: options.name,
    level: options.level,
    class_name: options.className,
    subclass_name: existing?.subclass_name || '',
    species_name: options.speciesName,
    background_name: options.backgroundName,
    class_entity_id: options.classEntityId,
    species_entity_id: options.speciesEntityId,
    background_entity_id: options.backgroundEntityId,
    ability_scores: options.abilityScores,
    combat_stats: {
      ...existingCombatStats,
      armorClass: existingCombatStats.armorClass || '',
      maxHp: String(options.maxHp),
      currentHp: String(options.maxHp),
      tempHp: String(existingCombatStats.tempHp || '0'),
      initiative: existingCombatStats.initiative || '',
      speed: String(options.speed),
      hitDice: `d${options.hitDieFaces}`
    },
    spellcasting: {
      ...asObject(existing?.spellcasting),
      knownSpellIds: Array.isArray(existing?.spellcasting?.knownSpellIds) ? existing.spellcasting.knownSpellIds : [],
      preparedSpellIds: Array.isArray(existing?.spellcasting?.preparedSpellIds) ? existing.spellcasting.preparedSpellIds : [],
      alwaysPreparedSpellIds: Array.isArray(existing?.spellcasting?.alwaysPreparedSpellIds) ? existing.spellcasting.alwaysPreparedSpellIds : [],
      usedSlots: asObject(existing?.spellcasting?.usedSlots)
    },
    choices: {
      ...existingChoices,
      builderSpeciesChoices: options.speciesChoices,
      builderClassChoices: options.classChoices,
      builderBackgroundChoices: options.backgroundChoices
    },
    updated_at: now
  }

  if (existing?.id) {
    const patched = await dxFetch(`/items/character_sheets/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })

    const patchedSheet = patched?.data || {
      ...existing,
      ...payload
    }

    await upsertCharacterCoreSheetLink(options.entityId, patchedSheet.id || existing.id)
    await seedBuilderInventoryTools(patchedSheet.id || existing.id, options.classChoices, options.backgroundChoices)

    return patchedSheet
  }

  const created = await dxFetch('/items/character_sheets', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      created_at: now
    })
  })

  const createdSheet = created?.data

  if (!createdSheet?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Character sheet was not created correctly'
    })
  }

  await upsertCharacterCoreSheetLink(options.entityId, createdSheet.id)
  await seedBuilderInventoryTools(createdSheet.id, options.classChoices, options.backgroundChoices)

  return createdSheet
}

export default defineEventHandler(async (event) => {
  try {
    const worldId = String(getRouterParam(event, 'id') || '')
    const body = await readBody(event)

    if (!worldId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing world id'
      })
    }

    const name = cleanText(body?.name || body?.title)

    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Character name is required'
      })
    }

    const level = Math.min(20, Math.max(1, Number(body?.level || 1)))
    const classEntityId = integerOrNull(body?.classEntityId)
    const speciesEntityId = integerOrNull(body?.speciesEntityId)
    const backgroundEntityId = integerOrNull(body?.backgroundEntityId)
    const abilityScores = normalizeAbilityScores(body?.abilityScores)
    const speciesChoices = normalizeSpeciesChoices(body?.speciesChoices)
    const classChoices = normalizeClassChoices(body?.classChoices)
    const backgroundChoices = normalizeBackgroundChoices(body?.backgroundChoices)

    if (!classEntityId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Choose a class before creating this character'
      })
    }

    if (!speciesEntityId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Choose a species before creating this character'
      })
    }

    const [
      className,
      speciesName,
      backgroundName,
      classBlocks,
      speciesBlocks
    ] = await Promise.all([
      linkedEntityTitle(classEntityId),
      linkedEntityTitle(speciesEntityId),
      linkedEntityTitle(backgroundEntityId),
      linkedEntityBlocks(classEntityId),
      linkedEntityBlocks(speciesEntityId)
    ])

    const hitDieFaces = parseHitDieFaces(classBlocks)
    const maxHp = startingHp(level, hitDieFaces, abilityScores.con)
    const speed = parseSpeciesSpeed(speciesBlocks)
    const now = new Date().toISOString()
    const slug = `${slugify(name)}-${Date.now().toString(36)}`

    const created = await dxFetch('/items/entities', {
      method: 'POST',
      body: JSON.stringify({
        title: name,
        slug,
        world_id: Number(worldId),
        system_key: 'dnd5e',
        entity_type: 'pc',
        status: 'draft',
        visibility: 'world',
        summary: cleanText(body?.summary || `${speciesName || 'Adventurer'} ${className ? `• ${className}` : ''}`),
        created_at: now,
        updated_at: now
      })
    })

    const entity = created?.data

    if (!entity?.id) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Character entity was not created correctly'
      })
    }

    const characterSheet = await createOrPatchCharacterSheet({
      worldId,
      entityId: String(entity.id),
      name,
      level,
      className,
      speciesName,
      backgroundName,
      classEntityId,
      speciesEntityId,
      backgroundEntityId,
      abilityScores,
      maxHp,
      speed,
      hitDieFaces,
      speciesChoices,
      classChoices,
      backgroundChoices
    })

    return {
      ok: true,
      id: entity.id,
      entity,
      sheet: characterSheet
    }
  } catch (error: any) {
    console.error('[guided-character-builder]', error)

    throw createError({
      statusCode: error?.statusCode || error?.response?.status || 500,
      statusMessage:
        error?.statusMessage ||
        error?.data?.message ||
        error?.message ||
        'Guided character builder failed'
    })
  }
})
