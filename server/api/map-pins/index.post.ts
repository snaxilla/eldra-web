import { createPin } from '../../utils/map-pins'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.mapId || body.x == null || body.y == null) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: mapId, x, y' })
  }

  return await createPin({
    mapId: String(body.mapId),
    title: String(body.title || 'Untitled Pin'),
    x: Number(body.x),
    y: Number(body.y),
    color: body.color || null,
    pinType: body.pinType || null,
    icon: body.icon || 'marker',
    entityId: body.entityId ? Number(body.entityId) : null,
    summary: body.summary || null,
    image: body.image || null,
    inheritFromEntity: body.inheritFromEntity !== false,
  })
})
