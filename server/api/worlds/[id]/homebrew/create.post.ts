import { createHomebrewDraft } from '../../../../utils/homebrew'
import { persistHomebrewEnemyStructuredRowsForDraft } from '../../../../utils/homebrew/enemy-persistence'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event).catch(() => ({}))

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const result = await createHomebrewDraft(worldId, body || {})

  if (
    String(body?.type || '').trim().toLowerCase() === 'enemy' &&
    result?.entity?.id
  ) {
    const title = String(
      body?.title ||
      body?.enemy?.name ||
      result?.entity?.title ||
      ''
    )

    return {
      ...result,
      enemyStructuredRows: await persistHomebrewEnemyStructuredRowsForDraft(
        result.entity.id,
        body?.enemy || {},
        title
      )
    }
  }

  return result
})
