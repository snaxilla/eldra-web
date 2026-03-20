import { directusServiceRequest } from '../../../../utils/directus'
import { preview5eToolsItems } from '../../../../../app/lib/importers'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    const worldId = body?.worldId
    const mode = body?.mode || 'create'
    let payload = body?.payload ?? body

    if (!worldId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'worldId is required'
      })
    }

    if (!['create', 'update', 'upsert'].includes(mode)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'mode must be create, update, or upsert'
      })
    }

    if (typeof payload === 'string') {
      payload = JSON.parse(payload)
    }

    const preview = preview5eToolsItems(payload)

    if (!preview.items.length) {
      return {
        mode,
        created: [],
        updated: [],
        skipped: [],
        warnings: preview.warnings
      }
    }

    const createdEntities = []
    const updatedEntities = []
    const skippedEntities = []

    for (const item of preview.items) {
      const existingRes = await directusServiceRequest('/items/entities', {
        method: 'GET',
        query: {
          filter: {
            _and: [
              { world_id: { _eq: Number(worldId) } },
              { entity_type: { _eq: item.entityType } },
              { slug: { _eq: item.slug } }
            ]
          },
          limit: 1,
          fields: 'id,title,slug'
        }
      })

      const existing = existingRes?.data?.[0]
      const now = new Date().toISOString()

      if (mode === 'create' && existing) {
        skippedEntities.push({
          id: existing.id,
          title: existing.title,
          slug: existing.slug,
          reason: 'duplicate_slug'
        })
        continue
      }

      if (mode === 'update' && !existing) {
        skippedEntities.push({
          id: null,
          title: item.title,
          slug: item.slug,
          reason: 'not_found_for_update'
        })
        continue
      }

      if (existing && (mode === 'update' || mode === 'upsert')) {
        await directusServiceRequest(`/items/entities/${existing.id}`, {
          method: 'PATCH',
          body: {
            title: item.title,
            world_id: Number(worldId),
            system_key: item.systemKey,
            entity_type: item.entityType,
            status: 'draft',
            visibility: 'world',
            summary: '',
            updated_at: now
          }
        })

        const oldBlocksRes = await directusServiceRequest('/items/block_instances', {
          method: 'GET',
          query: {
            filter: {
              entity_id: { _eq: existing.id }
            },
            fields: 'id'
          }
        })

        for (const oldBlock of oldBlocksRes?.data || []) {
          await directusServiceRequest(`/items/block_instances/${oldBlock.id}`, {
            method: 'DELETE'
          })
        }

        for (const block of item.blocks) {
          await directusServiceRequest('/items/block_instances', {
            method: 'POST',
            body: {
              entity_id: existing.id,
              block_key: block.blockKey,
              label: block.label,
              sort: block.sort,
              repeatable: block.repeatable,
              data: block.data
            }
          })
        }

        updatedEntities.push({
          id: existing.id,
          title: item.title,
          slug: item.slug
        })
        continue
      }

      const entityRes = await directusServiceRequest('/items/entities', {
        method: 'POST',
        body: {
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
      mode,
      created: createdEntities,
      updated: updatedEntities,
      skipped: skippedEntities,
      warnings: preview.warnings
    }
  } catch (error: any) {
    return {
      debug: true,
      message: error?.message || null,
      statusCode: error?.statusCode || error?.response?.status || 500,
      statusMessage: error?.statusMessage || null,
      data: error?.data || null,
      cause: error?.cause?.data || null
    }
  }
})
