import { dxFetch, uploadImageToDirectus } from '../../../../../utils/entity-factory'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const characterId = String(getRouterParam(event, 'characterId') || '')

  if (!worldId || !characterId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id or character id'
    })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No form data received'
    })
  }

  const getField = (name: string) => {
    const part = parts.find((p) => p.name === name)
    return part?.data ? Buffer.from(part.data).toString('utf8') : ''
  }

  const title = String(getField('title') || '').trim()
  const summary = String(getField('summary') || '').trim()
  const archetypeRaw = String(getField('characterType') || '').trim().toLowerCase()
  const clearImage = String(getField('clearImage') || '').trim().toLowerCase() === 'true'

  const characterType =
    archetypeRaw === 'pc' ? 'pc' :
    archetypeRaw === 'npc_sheet' ? 'npc_sheet' :
    'npc'

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Character name is required'
    })
  }

  const existingJson = await dxFetch(`/items/entities/${characterId}?fields=id,world_id,image`)
  const existing = existingJson?.data || null

  if (!existing || String(existing.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Character not found in this world'
    })
  }

  const imagePart = parts.find((p) => p.name === 'image' && p.type && String(p.type).startsWith('image/'))
  let imageId = existing?.image ? String(existing.image) : null

  if (imagePart) {
    imageId = await uploadImageToDirectus(imagePart)
  } else if (clearImage) {
    imageId = null
  }

  const payload: Record<string, any> = {
    title,
    summary: summary || null,
    entity_type: characterType
  }

  payload.image = imageId || null

  const updated = await dxFetch(`/items/entities/${characterId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  const entity = updated?.data || null

  return {
    success: true,
    id: entity?.id,
    title: entity?.title || title,
    summary: entity?.summary || summary || '',
    entity_type: entity?.entity_type || characterType,
    image: entity?.image || imageId || null,
    imageUrl: entity?.image ? `/api/assets/${entity.image}` : imageId ? `/api/assets/${imageId}` : null
  }
})
