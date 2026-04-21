import { createPin } from '../../utils/map-pins'

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
