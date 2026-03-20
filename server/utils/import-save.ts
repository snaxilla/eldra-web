import { directusServiceRequest } from './directus'
import type { EldraImportPreviewEntity } from '../../app/lib/importers/types'

export type ImportMode = 'create' | 'update' | 'upsert'

export type PersistImportResult = {
  mode: ImportMode
  created: Array<{ id: number; title: string; slug: string }>
  updated: Array<{ id: number; title: string; slug: string }>
  skipped: Array<{ id: number | null; title: string; slug: string; reason: string }>
}

function assertMode(mode: string): asserts mode is ImportMode {
  if (!['create', 'update', 'upsert'].includes(mode)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'mode must be create, update, or upsert'
    })
  }
}

export async function persistImportedEntities(options: {
  worldId: number | string
  mode?: string
  items: EldraImportPreviewEntity[]
}): Promise<PersistImportResult> {
  const worldId = Number(options.worldId)
  const mode = options.mode || 'create'

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'worldId is required'
    })
  }

  assertMode(mode)

  const created: PersistImportResult['created'] = []
  const updated: PersistImportResult['updated'] = []
  const skipped: PersistImportResult['skipped'] = []

  for (const item of options.items) {
    const existingRes = await directusServiceRequest('/items/entities', {
      method: 'GET',
      query: {
        filter: {
          _and: [
            { world_id: { _eq: worldId } },
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
      skipped.push({
        id: existing.id,
        title: existing.title,
        slug: existing.slug,
        reason: 'duplicate_slug'
      })
      continue
    }

    if (mode === 'update' && !existing) {
      skipped.push({
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
          world_id: worldId,
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

      updated.push({
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

    created.push({
      id: entity.id,
      title: entity.title,
      slug: entity.slug
    })
  }

  return {
    mode,
    created,
    updated,
    skipped
  }
}
