import { dxFetch, slugify } from '../../../../utils/entity-factory'
import {
  ensureCharacterSheetForEntity,
  updateCharacterSheetForEntity
} from '../../../../utils/character-sheets'

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

export default defineEventHandler(async (event) => {
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

  const abilityScores = normalizeAbilityScores(body?.abilityScores)

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

  await ensureCharacterSheetForEntity(worldId, String(entity.id))

  const updatedSheetPayload = await updateCharacterSheetForEntity(worldId, String(entity.id), {
    name,
    level: String(level),
    className,
    speciesName,
    backgroundName,
    classEntityId,
    speciesEntityId,
    backgroundEntityId,
    abilityScores,
    combatStats: {
      armorClass: '',
      maxHp: String(maxHp),
      currentHp: String(maxHp),
      tempHp: '0',
      initiative: '',
      speed: String(speed),
      hitDice: `d${hitDieFaces}`
    }
  })

  return {
    ok: true,
    id: entity.id,
    entity,
    sheet: updatedSheetPayload?.sheet || updatedSheetPayload
  }
})
