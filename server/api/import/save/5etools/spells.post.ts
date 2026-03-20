import { directusServiceRequest } from '../../../../utils/directus'
import { preview5eToolsSpells } from '../../../../../app/lib/importers'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const worldId = body?.worldId
  let payload = body?.payload ?? body

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'worldId is required'
    })
  }

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid JSON payload'
      })
    }
  }

  const preview = preview5eToolsSpells(payload)

  if (!preview.items.length) {
    return {
      created: [],
      warnings: preview.warnings
    }
  }

  const createdEntities = []

  for (const item of preview.items) {
    const now = new Date().toISOString()

    const entityRes = await directusServiceRequest('/items/entities', {
      method: 'POST',
      body: {
        title: item.title,
        slug: item.slug,
        world_id: worldId,
        system_key: item.systemKey,
        entity_type: item.entityType,
        status: 'draft',
        visibility: 'world',
        summary: '',
        created_at: now,
        updated_at: now
      }
    })

    const entity = entityRes?.data

    for (const block of item.blocks) {
      await directusServiceRequest('/items/block_instances', {
        method: 'POST',
        body: {
          entity_id: entity.id,
          block_key: block.blockKey,
          label: block.label,
          sort: block.sort,
          repeatable: block.repeatable,
          data: block.data
        }
      })
    }

    createdEntities.push({
      id: entity.id,
      title: entity.title,
      slug: entity.slug
    })
  }

  return {
    created: createdEntities,
    warnings: preview.warnings
  }
})
