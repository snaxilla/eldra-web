import { createHomebrewDraft } from '../../../../utils/homebrew'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event).catch(() => ({}))

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  return await createHomebrewDraft(worldId, body || {})
})
