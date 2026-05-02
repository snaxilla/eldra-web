import { directusServiceRequest } from '../../../../../utils/directus'

async function deleteMany(collection: string, entityId: string) {
  const res = await directusServiceRequest(`/items/${collection}`, {
    method: 'GET',
    query: {
      filter: {
        entity_id: { _eq: entityId }
      },
      fields: 'id',
      limit: -1
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []

  for (const row of rows) {
    await directusServiceRequest(`/items/${collection}/${row.id}`, {
      method: 'DELETE'
    })
  }

  return rows.length
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityId = String(getRouterParam(event, 'entityId') || '')

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or entity id'
    })
  }

  const entityRes = await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'GET',
    query: { fields: '*' }
  })

  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found in this world'
    })
  }

  await deleteMany('block_instances', entityId)
  await deleteMany('entity_actions', entityId)
  await deleteMany('entity_statblocks', entityId)
  await deleteMany('monster_profiles', entityId)

  await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'DELETE'
  })

  return {
    ok: true,
    deleted: true,
    entityId
  }
})
