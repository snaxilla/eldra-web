import { dxFetch } from '../../../../../../utils/entity-factory'

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function mergeLimitedResourceUses(existing: any, incoming: any) {
  return {
    ...asObject(existing),
    ...asObject(incoming)
  }
}

function mergeResources(existing: any, patch: any) {
  const existingResources = asObject(existing)
  const patchResources = asObject(patch)

  return {
    ...existingResources,
    ...patchResources,
    limitedResourceUses: mergeLimitedResourceUses(
      existingResources.limitedResourceUses ?? existingResources.limited_resource_uses,
      patchResources.limitedResourceUses ?? patchResources.limited_resource_uses
    )
  }
}

async function findActiveSheet(worldId: string, entityId: string) {
  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', String(worldId))
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('filter[is_active][_eq]', 'true')
  params.set('fields', 'id,resources')
  params.set('limit', '1')

  const res = await dxFetch(`/items/character_sheets?${params.toString()}`)
  return Array.isArray(res?.data) ? res.data[0] : null
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityId = String(getRouterParam(event, 'entityId') || '')
  const body = await readBody(event)

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  const sheet = await findActiveSheet(worldId, entityId)

  if (!sheet?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Active character sheet not found'
    })
  }

  const resources = mergeResources(sheet.resources, body?.resources)

  const patched = await dxFetch(`/items/character_sheets/${sheet.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      resources
    })
  })

  return {
    success: true,
    sheetId: sheet.id,
    resources: patched?.data?.resources || resources
  }
})
