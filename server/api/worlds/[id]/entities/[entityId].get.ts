function extractImageUrl(blocks: any[] = []) {
  for (const block of blocks) {
    const image = block?.data?.image

    if (!image) continue

    if (typeof image === 'string') {
      return `/api/assets/${image}`
    }

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return null
}

export default defineEventHandler(async (event) => {
  const worldId = getRouterParam(event, 'id')
  const entityId = getRouterParam(event, 'entityId')

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
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
      statusMessage: blocksJson?.errors?.[0]?.message || blocksJson?.message || 'Failed to load entity blocks'
    })
  }

  const blocks = Array.isArray(blocksJson.data) ? blocksJson.data : []

  return {
    ...entity,
    blocks,
    image_url: extractImageUrl(blocks)
  }
})
