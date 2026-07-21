import { homebrewTypeOptions, listHomebrewTemplates } from '../../../../utils/homebrew'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const query = getQuery(event)

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  if (query.types === '1') {
    return {
      ok: true,
      types: homebrewTypeOptions()
    }
  }

  return await listHomebrewTemplates(worldId, query.type || 'spell')
})
