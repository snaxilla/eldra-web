import { dxFetch, uploadImageToDirectus } from '../../../../../utils/entity-factory'
import { requireCapability } from '../../../../../utils/authorization'

// Ownership is not tracked on entities yet (no accountId on EldraEntity), so
// `world.character.edit_own` cannot be checked against real ownership --
// deliberately conservative until it lands. NPC-type edits still require
// world.npc.manage; anything touching a PC (either side of a type change)
// requires world.character.edit_any, which owner/gm always have alongside
// npc.manage, so this is the strictly safer choice whenever a reclassification
// is involved.
function capabilityForCharacterMutation(existingType: string, requestedType: string) {
  const isNpcType = (type: string) => type === 'npc' || type === 'npc_sheet'
  return isNpcType(existingType) && isNpcType(requestedType) ? 'world.npc.manage' as const : 'world.character.edit_any' as const
}

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

  const existingJson = await dxFetch(`/items/entities/${characterId}?fields=id,world_id,image,entity_type`)
  const existing = existingJson?.data || null

  if (!existing || String(existing.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Character not found in this world'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(
    principal,
    capabilityForCharacterMutation(String(existing.entity_type || ''), characterType),
    { kind: 'world', worldId }
  )

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

  const params = new URLSearchParams()
  params.set('filter[entity_id][_eq]', String(characterId))
  params.set('filter[block_key][_eq]', 'character_core')
  params.append('fields[]', 'id')
  params.append('fields[]', 'data')
  params.set('limit', '1')

  const existingCoreRes = await dxFetch(`/items/block_instances?${params.toString()}`)
  const existingCore = Array.isArray(existingCoreRes?.data) ? existingCoreRes.data[0] : null
  const existingData = existingCore?.data && typeof existingCore.data === 'object' ? existingCore.data : {}

  const characterCoreData = {
    ...existingData,
    characterType,
    linkedSheetId: existingData.linkedSheetId ?? existingData.linked_sheet_id ?? null,
    playerName: existingData.playerName ?? existingData.player_name ?? null,
    pronouns: existingData.pronouns ?? null,
    publicRole: existingData.publicRole ?? existingData.public_role ?? null
  }

  if (existingCore?.id) {
    await dxFetch(`/items/block_instances/${existingCore.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: characterCoreData
      })
    }).catch(() => null)
    } else {
      await dxFetch('/items/block_instances', {
        method: 'POST',
        body: JSON.stringify({
          entity_id: characterId,
          block_key: 'character_core',
          label: 'Character Core',
          sort: 10,
          data: characterCoreData
        })
      }).catch(() => null)
    }

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
