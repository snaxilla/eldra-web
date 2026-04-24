import { directusServiceRequest } from './directus'
import { persistImportedEntities } from './import-save'

type MonsterImportItem = {
  title: string
  slug: string
  systemKey: string
  entityType: string
  summary?: string
  blocks: any[]
  _monsterData?: {
    statblock?: Record<string, any>
    monsterProfile?: Record<string, any>
    actions?: Array<{
      actionType: string
      name: string
      sort: number
      text: string
      raw: any
    }>
  }
}

export async function persistImportedMonsters(options: {
  worldId: number | string
  mode?: string
  items: MonsterImportItem[]
}) {
  const baseResult = await persistImportedEntities({
    worldId: options.worldId,
    mode: options.mode,
    items: options.items as any
  })

  const worldId = Number(options.worldId)

  for (const item of options.items) {
    const entityLookup = await directusServiceRequest('/items/entities', {
      method: 'GET',
      query: {
        filter: {
          _and: [
            { world_id: { _eq: worldId } },
            { entity_type: { _eq: item.entityType } },
            { slug: { _eq: item.slug } }
          ]
        },
        limit: 1,
        fields: 'id,title,slug'
      }
    })

    const entity = entityLookup?.data?.[0]
    if (!entity?.id) continue

    const entityId = entity.id
    const monsterData = item._monsterData || {}
    const statblock = monsterData.statblock || {}
    const monsterProfile = monsterData.monsterProfile || {}
    const actions = Array.isArray(monsterData.actions) ? monsterData.actions : []

    const existingStatblock = await directusServiceRequest('/items/entity_statblocks', {
      method: 'GET',
      query: {
        filter: { entity_id: { _eq: entityId } },
        limit: 1,
        fields: 'id'
      }
    })

    const statblockPayload = {
      entity_id: entityId,
      ...statblock
    }

    if (existingStatblock?.data?.[0]?.id) {
      await directusServiceRequest(`/items/entity_statblocks/${existingStatblock.data[0].id}`, {
        method: 'PATCH',
        body: statblockPayload
      })
    } else {
      await directusServiceRequest('/items/entity_statblocks', {
        method: 'POST',
        body: statblockPayload
      })
    }

    const existingMonsterProfile = await directusServiceRequest('/items/monster_profiles', {
      method: 'GET',
      query: {
        filter: { entity_id: { _eq: entityId } },
        limit: 1,
        fields: 'id'
      }
    })

    const monsterProfilePayload = {
      entity_id: entityId,
      ...monsterProfile
    }

    if (existingMonsterProfile?.data?.[0]?.id) {
      await directusServiceRequest(`/items/monster_profiles/${existingMonsterProfile.data[0].id}`, {
        method: 'PATCH',
        body: monsterProfilePayload
      })
    } else {
      await directusServiceRequest('/items/monster_profiles', {
        method: 'POST',
        body: monsterProfilePayload
      })
    }

    const existingActions = await directusServiceRequest('/items/entity_actions', {
      method: 'GET',
      query: {
        filter: { entity_id: { _eq: entityId } },
        fields: 'id'
      }
    })

    for (const row of existingActions?.data || []) {
      await directusServiceRequest(`/items/entity_actions/${row.id}`, {
        method: 'DELETE'
      })
    }

    for (const action of actions) {
      await directusServiceRequest('/items/entity_actions', {
        method: 'POST',
        body: {
          entity_id: entityId,
          action_type: action.actionType || 'action',
          name: action.name || 'Unnamed Action',
          sort_order: Number(action.sort || 0),
          text: action.text || '',
          raw_json: action.raw || null
        }
      })
    }
  }

  return baseResult
}
