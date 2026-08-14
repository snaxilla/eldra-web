import { createPin } from '../../utils/map-pins'
import { directusServiceRequest } from '../../utils/directus'
import { requireCapability } from '../../utils/authorization'

function normalizeEntityId(value: any): number | null {
  if (value === undefined || value === null || value === '' || value === 'null') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeString(value: any): string | null {
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.mapId || body.x == null || body.y == null) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: mapId, x, y' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  // map-pins routes are not nested under worlds/[id] -- resolve worldId via
  // the pin's map, same lookup server/utils/map-data.ts's
  // setDefaultWorldMapByMapId already does.
  const mapRes = await directusServiceRequest(`/items/maps/${body.mapId}`, {
    method: 'GET',
    query: { fields: 'id,world' }
  })
  const worldId = String(mapRes?.data?.world || '')
  if (!worldId) {
    throw createError({ statusCode: 404, statusMessage: 'Map not found' })
  }
  requireCapability(principal, 'world.map.edit', { kind: 'world', worldId })

  return await createPin({
    mapId: String(body.mapId),
    title: String(body.title || 'Untitled Pin'),
    x: Number(body.x),
    y: Number(body.y),
    color: normalizeString(body.color),
    pinType: normalizeString(body.pinType),
    icon: normalizeString(body.icon) || 'marker',
    entityId: normalizeEntityId(body.entityId),
    linkedMapId: normalizeString(body.linkedMapId),
    summary: normalizeString(body.summary),
    image: normalizeString(body.image),
    inheritFromEntity: body.inheritFromEntity !== false,
  })
})
