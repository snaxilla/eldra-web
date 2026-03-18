import { getSystemByKey } from '../../../app/lib/systems'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') || ''
  const system = getSystemByKey(key)

  if (!system) {
    throw createError({
      statusCode: 404,
      statusMessage: 'System schema not found'
    })
  }

  return {
    system
  }
})
