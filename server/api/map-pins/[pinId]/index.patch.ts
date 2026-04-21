import { updatePin } from '../../../utils/map-pins'

export default defineEventHandler(async (event) => {
  const pinId = String(getRouterParam(event, 'pinId') || '')
  const body = await readBody(event)

  if (!pinId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing pinId' })
  }

  return await updatePin(pinId, {
    title: body.title,
    x: body.x,
    y: body.y,
    color: body.color,
    pinType: body.pinType,
    entityId: body.entityId,
    summary: body.summary,
    image: body.image,
    inheritFromEntity: body.inheritFromEntity,
  })
})
