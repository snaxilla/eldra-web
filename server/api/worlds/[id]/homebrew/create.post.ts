import { createHomebrewDraft } from '../../../../utils/homebrew'
import { directusServiceRequest } from '../../../../utils/directus'
import { persistHomebrewEnemyStructuredRowsForDraft } from '../../../../utils/homebrew/enemy-persistence'

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function selectedImageFileId(body: any) {
  return cleanText(
    body?.imageFileId ??
    body?.image_file_id ??
    body?.image?.id ??
    body?.image ??
    ''
  )
}

async function attachDraftImage(result: any, body: any) {
  const fileId = selectedImageFileId(body)
  const entityId = cleanText(result?.entity?.id)

  if (!fileId || !entityId) {
    return result
  }

  await directusServiceRequest(`/items/entities/${encodeURIComponent(entityId)}`, {
    method: 'PATCH',
    body: {
      image: fileId
    }
  })

  return {
    ...result,
    entity: {
      ...(result?.entity || {}),
      image: fileId,
      imageUrl: `/api/assets/${fileId}`,
      image_url: `/api/assets/${fileId}`
    }
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event).catch(() => ({}))

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  let result = await createHomebrewDraft(worldId, body || {})
  result = await attachDraftImage(result, body || {})

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
