import { createEntityRecord, uploadImageToDirectus, dxFetch } from '../../../../utils/entity-factory'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
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

  const imagePart = parts.find((p) => p.name === 'image' && p.type && String(p.type).startsWith('image/'))
  const imageId = imagePart ? await uploadImageToDirectus(imagePart) : null

  const created = await createEntityRecord({
    worldId,
    title,
    summary: summary || null,
    imageId,
    entityType: characterType
  })

  if (created?.id) {
    await dxFetch('/items/block_instances', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: created.id,
        block_key: 'character_core',
        label: 'Character Core',
        sort: 10,
        data: {
          characterType,
          linkedSheetId: null,
          playerName: null,
          pronouns: null,
          publicRole: null
        }
      })
    }).catch(() => null)
  }

  return created
})
