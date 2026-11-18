// Explicit h3 imports (rather than relying on Nitro's auto-imports) --
// Media Gallery Thumbnail Performance pass's own new regression test for
// this route needs that, matching the established convention this
// codebase already uses elsewhere for exactly this reason (e.g.
// server/api/worlds/[id]/media.get.ts's own header). h3's exports are the
// exact functions Nitro auto-imports at runtime, so this changes nothing
// about production behavior.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { directusServiceRequest } from '../../../../../utils/directus'
import { requireCapability } from '../../../../../utils/authorization'
import { clearCachedThumbnail } from '../../../../../utils/media-thumbnails'

function cleanText(value: any) {
  return String(value || '').trim()
}

function findFileReferencesDeep(value: any, fileId: string, path = 'data'): string[] {
  const refs: string[] = []

  if (value === null || value === undefined) return refs

  if (typeof value === 'string' || typeof value === 'number') {
    if (String(value) === fileId) refs.push(path)
    return refs
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      refs.push(...findFileReferencesDeep(item, fileId, `${path}[${index}]`))
    })
    return refs
  }

  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      refs.push(...findFileReferencesDeep(nested, fileId, `${path}.${key}`))
    }
  }

  return refs
}

async function safeList(path: string, query: any) {
  try {
    const res: any = await directusServiceRequest(path, {
      method: 'GET',
      query
    })

    return Array.isArray(res?.data) ? res.data : []
  } catch {
    return []
  }
}

async function collectWorldFileUsage(worldId: string, fileId: string) {
  const usage: string[] = []

  const entities = await safeList('/items/entities', {
    filter: {
      world_id: { _eq: worldId }
    },
    limit: -1,
    fields: 'id,title,image'
  })

  const entityIds = entities.map((entity: any) => entity.id).filter(Boolean)

  for (const entity of entities) {
    if (String(entity?.image || '') === fileId) {
      usage.push(`Entity image: ${entity.title || entity.id}`)
    }
  }

  if (entityIds.length) {
    const blocks = await safeList('/items/block_instances', {
      filter: {
        entity_id: { _in: entityIds }
      },
      limit: -1,
      fields: 'id,entity_id,block_key,data'
    })

    for (const block of blocks) {
      const refs = findFileReferencesDeep(block?.data, fileId)
      if (refs.length) {
        usage.push(`Entity block ${block.block_key || block.id}`)
      }
    }
  }

  const maps = await safeList('/items/maps', {
    filter: {
      world_id: { _eq: worldId }
    },
    limit: -1,
    fields: 'id,title,image_file,image'
  })

  for (const map of maps) {
    if (String(map?.image_file || '') === fileId || String(map?.image || '') === fileId) {
      usage.push(`Map image: ${map.title || map.id}`)
    }
  }

  const presentations = await safeList('/items/world_page_presentations', {
    filter: {
      world_id: { _eq: worldId }
    },
    limit: -1,
    fields: 'id,page_key,background_file_id'
  })

  for (const presentation of presentations) {
    if (String(presentation?.background_file_id || '') === fileId) {
      usage.push(`Page background: ${presentation.page_key || presentation.id}`)
    }
  }

  return Array.from(new Set(usage))
}

export default defineEventHandler(async (event) => {
  const worldId = cleanText(getRouterParam(event, 'id'))
  const fileId = cleanText(getRouterParam(event, 'fileId'))

  if (!worldId || !fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or file id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId })

  const usage = await collectWorldFileUsage(worldId, fileId)

  if (usage.length) {
    throw createError({
      statusCode: 409,
      statusMessage: `This image is still used by: ${usage.slice(0, 6).join(', ')}${usage.length > 6 ? ', ...' : ''}`
    })
  }

  await directusServiceRequest(`/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE'
  })

  // Media Gallery Thumbnail Performance pass -- this id is never reused
  // (Directus assigns a fresh UUID per upload), so there is no real
  // staleness risk here; this is strictly hygiene, so a deleted large
  // image's cached thumbnail buffer does not linger in process memory
  // (server/utils/media-thumbnails.ts) indefinitely.
  clearCachedThumbnail(fileId)

  return {
    success: true,
    id: fileId
  }
})
