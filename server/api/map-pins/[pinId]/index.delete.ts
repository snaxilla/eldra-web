import { deletePin } from '../../../utils/map-pins'

export default defineEventHandler(async (event) => {
  const pinId = String(getRouterParam(event, 'pinId') || '')

  if (!pinId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing pinId' })
  }

  await deletePin(pinId)
  return { success: true }
})
