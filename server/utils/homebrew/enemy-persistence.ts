import { directusServiceRequest } from '../directus'
import { homebrewEnemyStructuredRowsForDraft } from './enemy'

let fieldCache = new Map<string, Set<string>>()

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function numericId(value: any) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : value
}

async function collectionFields(collection: string, fallback: string[]) {
  if (fieldCache.has(collection)) {
    return fieldCache.get(collection)!
  }

  try {
    const res = await directusServiceRequest(`/fields/${collection}`, {
      method: 'GET'
    })

    const fields = new Set<string>(
      (Array.isArray(res?.data) ? res.data : [])
        .map((field: any) => cleanText(field?.field))
        .filter(Boolean)
    )

    if (fields.size) {
      fieldCache.set(collection, fields)
      return fields
    }
  } catch {}

  const fields = new Set(fallback)
  fieldCache.set(collection, fields)
  return fields
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

const ENEMY_STATBLOCK_FALLBACK_FIELDS = [
  'id',
  'entity_id',
  'profile_kind',
  'size_json',
  'creature_type',
  'alignment_json',
  'armor_class',
  'armor_class_json',
  'hit_points_average',
  'hit_points_formula',
  'speed_json',
  'str_score',
  'dex_score',
  'con_score',
  'int_score',
  'wis_score',
  'cha_score',
  'saving_throws_json',
  'skills_json',
  'senses_json',
  'passive_perception',
  'languages_json',
  'challenge_rating',
  'level',
  'damage_tags_json',
  'raw_payload_json'
]

const ENEMY_ACTION_FALLBACK_FIELDS = [
  'id',
  'entity_id',
  'action_type',
  'name',
  'sort_order',
  'text',
  'raw_json'
]

const MONSTER_PROFILE_FALLBACK_FIELDS = [
  'id',
  'entity_id',
  'source',
  'page',
  'environment_json',
  'treasure_json',
  'reference_sources_json',
  'sound_clip_url',
  'token_name',
  'token_source',
  'has_fluff',
  'has_fluff_images',
  'fluff_json',
  'action_tags_json',
  'language_tags_json',
  'misc_tags_json',
  'raw_payload_json'
]

async function createSupportedCollectionItem(collection: string, fallbackFields: string[], payload: Record<string, any>) {
  const fields = await collectionFields(collection, fallbackFields)
  const body = pickSupported(fields, payload)

  const created = await directusServiceRequest(`/items/${collection}`, {
    method: 'POST',
    body
  })

  return created?.data || null
}

export async function persistHomebrewEnemyStructuredRowsForDraft(entityId: any, enemyPayload: any, title = '') {
  if (!entityId || !enemyPayload || typeof enemyPayload !== 'object') {
    return {
      statblock: null,
      actions: [],
      monsterProfile: null
    }
  }

  const entity_id = numericId(entityId)
  const structured = homebrewEnemyStructuredRowsForDraft(enemyPayload, title)

  const statblock = structured.statblock
    ? await createSupportedCollectionItem('entity_statblocks', ENEMY_STATBLOCK_FALLBACK_FIELDS, {
        entity_id,
        ...structured.statblock
      })
    : null

  const actions = []

  for (const action of Array.isArray(structured.actions) ? structured.actions : []) {
    const created = await createSupportedCollectionItem('entity_actions', ENEMY_ACTION_FALLBACK_FIELDS, {
      entity_id,
      ...action
    })

    if (created) actions.push(created)
  }

  const monsterProfile = structured.monsterProfile
    ? await createSupportedCollectionItem('monster_profiles', MONSTER_PROFILE_FALLBACK_FIELDS, {
        entity_id,
        ...structured.monsterProfile
      })
    : null

  return {
    statblock,
    actions,
    monsterProfile
  }
}
