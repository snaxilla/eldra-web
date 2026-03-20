import { directusServiceRequest } from '../../../../utils/directus'
import { preview5eToolsSpells } from '../../../../../app/lib/importers'

export default defineEventHandler(async (event) => {
  try {
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

      const entityBody = {
        title: item.title,
        slug: item.slug,
        world_id: Number(worldId),
        system_key: item.systemKey,
        entity_type: item.entityType,
        status: 'draft',
        visibility: 'world',
        summary: '',
        created_at: now,
        updated_at: now
      }

      const entityRes = await directusServiceRequest('/items/entities', {
        method: 'POST',
        body: entityBody
      })

      const entity = entityRes?.data

      for (const block of item.blocks) {
        const blockBody = {
          entity_id: entity.id,
          block_key: block.blockKey,
          label: block.label,
          sort: block.sort,
          repeatable: block.repeatable,
          data: block.data
        }

        await directusServiceRequest('/items/block_instances', {
          method: 'POST',
          body: blockBody
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
  } catch (error: any) {
    console.error('SPELL_IMPORT_SAVE_ERROR', {
      message: error?.message,
      statusCode: error?.statusCode,
      statusMessage: error?.statusMessage,
      data: error?.data,
      causeData: error?.cause?.data
    })

    throw error
  }
})
