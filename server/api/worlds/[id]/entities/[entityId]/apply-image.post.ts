export default defineEventHandler(async (event) => {
  const worldId = getRouterParam(event, 'id')
  const entityId = getRouterParam(event, 'entityId')
  const body = await readBody(event)

  const fileId = body?.file_id

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing file id'
    })
  }

  const baseUrl = 'http://ledouxvps-directus-269351-187-77-194-11.traefik.me'
  const token = 'g5xg68le7V-Ra5u2Dae_fmoSI3eO-weh'

  const entityRes = await fetch(
    `${baseUrl}/items/entities/${entityId}?fields=*`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  const entityJson = await entityRes.json()

  if (!entityRes.ok) {
    throw createError({
      statusCode: entityRes.status,
      statusMessage: entityJson?.errors?.[0]?.message || entityJson?.message || 'Failed to load entity'
    })
  }

  const entity = entityJson.data

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found in this world'
    })
  }

  const blocksRes = await fetch(
    `${baseUrl}/items/block_instances?filter[entity_id][_eq]=${entityId}&sort=sort&fields=*`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  const blocksJson = await blocksRes.json()

  if (!blocksRes.ok) {
    throw createError({
      statusCode: blocksRes.status,
      statusMessage: blocksJson?.errors?.[0]?.message || blocksJson?.message || 'Failed to load blocks'
    })
  }

  const blocks = Array.isArray(blocksJson.data) ? blocksJson.data : []

  const targetBlock =
    blocks.find((block: any) => block.block_key !== 'import_source') ||
    blocks[0]

  if (!targetBlock) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No block available to store image'
    })
  }

  const updatedData = {
    ...(targetBlock.data || {}),
    image: fileId
  }

  const patchRes = await fetch(
    `${baseUrl}/items/block_instances/${targetBlock.id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: updatedData
      })
    }
  )

  const patchJson = await patchRes.json()

  if (!patchRes.ok) {
    throw createError({
      statusCode: patchRes.status,
      statusMessage: patchJson?.errors?.[0]?.message || patchJson?.message || 'Failed to apply image to entity'
    })
  }

  return {
    ok: true,
    file_id: fileId,
    block_id: targetBlock.id,
    block_key: targetBlock.block_key,
    asset_url: `/api/assets/${fileId}`
  }
})
