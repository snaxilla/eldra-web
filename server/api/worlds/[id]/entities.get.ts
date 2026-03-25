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

function extractSummary(entity: any, blocks: any[] = []) {
  if (entity?.summary) return entity.summary

  for (const block of blocks) {
    if (block?.data?.summary) return block.data.summary
    if (block?.data?.description) return block.data.description
    if (block?.data?.bio) return block.data.bio
  }

  return ''
}

export default defineEventHandler(async (event) => {
  const worldId = getRouterParam(event, 'id')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const baseUrl = 'http://ledouxvps-directus-269351-187-77-194-11.traefik.me'
  const token = 'g5xg68le7V-Ra5u2Dae_fmoSI3eO-weh'

  const entitiesRes = await fetch(
    `${baseUrl}/items/entities?filter[world_id][_eq]=${worldId}&sort=-updated_at&fields=*`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  const entitiesJson = await entitiesRes.json()

  if (!entitiesRes.ok) {
    throw createError({
      statusCode: entitiesRes.status,
      statusMessage: entitiesJson?.errors?.[0]?.message || entitiesJson?.message || 'Failed to load entities'
    })
  }

  const entities = Array.isArray(entitiesJson.data) ? entitiesJson.data : []

  if (!entities.length) {
    return []
  }

  const ids = entities.map((e: any) => e.id).join(',')

  const blocksRes = await fetch(
    `${baseUrl}/items/block_instances?filter[entity_id][_in]=${ids}&sort=sort&fields=*`,
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

  const blocksByEntity = new Map<number, any[]>()

  for (const block of blocks) {
    const entityId = Number(block.entity_id)
    if (!blocksByEntity.has(entityId)) blocksByEntity.set(entityId, [])
    blocksByEntity.get(entityId)!.push(block)
  }

  return entities.map((entity: any) => {
    const entityBlocks = blocksByEntity.get(Number(entity.id)) || []

    return {
      ...entity,
      blocks: entityBlocks,
      image_url: extractImageUrl(entityBlocks),
      preview_text: extractSummary(entity, entityBlocks)
    }
  })
})
