import { requireCapability } from '../../../../../../utils/authorization'
import { directusServiceRequest } from '../../../../../../utils/directus'
import { listLayerObjects } from '../../../../../../utils/scene-layer-objects'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const mapId = String(getRouterParam(event, 'mapId') || '')

  if (!worldId || !mapId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id or map id' })
  }

  // World Read Authorization pass -- this route previously read neither
  // the World id route param (present, simply unused) nor
  // `event.context.principal` at all, so any authenticated account could
  // request ANY mapId's layer objects regardless of which World (if any)
  // it belonged to. Two checks, both required: membership in the WORLD
  // this request claims (`requireCapability`), and that the requested
  // MAP actually belongs to that World (below) -- checking access to
  // World A must not permit fetching a World B map's content by id.
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.read', { kind: 'world', worldId })

  const mapRes: any = await directusServiceRequest('/items/maps', {
    method: 'GET',
    query: {
      filter: { id: { _eq: mapId } },
      fields: 'id,world',
      limit: 1
    }
  })
  const mapRow = Array.isArray(mapRes?.data) ? mapRes.data[0] : null

  if (!mapRow || String(mapRow.world || '') !== worldId) {
    throw createError({ statusCode: 404, statusMessage: 'Map not found in this World' })
  }

  const query = getQuery(event)
  const layerId = query.layerId ? String(query.layerId) : undefined

  const objects = await listLayerObjects(mapId, layerId)

  return { objects }
})
