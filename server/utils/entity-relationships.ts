import { directusServiceRequest } from './directus'

let relationshipFieldCache: Set<string> | null = null

function intOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null

  return Math.floor(parsed)
}

function textOrNull(value: any) {
  const text = String(value ?? '').trim()
  return text || null
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeText(value: any, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeRelationshipType(value: any) {
  return normalizeText(value, 'related').toLowerCase()
}

function normalizeVisibility(value: any) {
  return normalizeText(value, 'world').toLowerCase()
}

function isMissingRelationshipSchema(error: any) {
  const text = String(
    error?.data?.errors?.[0]?.message ||
    error?.data?.message ||
    error?.message ||
    ''
  ).toLowerCase()

  return (
    text.includes('entity_relationships') ||
    text.includes('relationship schema') ||
    (text.includes('collection') && (text.includes('not found') || text.includes('does not exist'))) ||
    (text.includes('permission') && text.includes('entity_relationships'))
  )
}

async function relationshipFields() {
  if (relationshipFieldCache) return relationshipFieldCache

  try {
    const res = await directusServiceRequest('/fields/entity_relationships', {
      method: 'GET'
    })

    relationshipFieldCache = new Set(
      (Array.isArray(res?.data) ? res.data : [])
        .map((field: any) => String(field?.field || '').trim())
        .filter(Boolean)
    )

    return relationshipFieldCache
  } catch (error) {
    if (isMissingRelationshipSchema(error)) {
      relationshipFieldCache = new Set()
      return relationshipFieldCache
    }

    throw error
  }
}

function pickSupported(fields: Set<string>, payload: Record<string, any>) {
  if (!fields.size) return payload

  const picked: Record<string, any> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (fields.has(key)) picked[key] = value
  }

  return picked
}

function entityImageUrl(entity: any) {
  const image = entity?.image

  if (!image) return ''

  if (typeof image === 'string' && image.trim()) {
    if (image.startsWith('/api/assets/')) return image
    if (image.startsWith('http://') || image.startsWith('https://')) return image
    return `/api/assets/${image}`
  }

  if (typeof image === 'object') {
    const id = image.id || image.file_id || image.fileId
    if (id) return `/api/assets/${id}`
    if (image.image_url) return String(image.image_url)
  }

  return ''
}

function normalizeEntity(entity: any, worldId: string | number) {
  if (!entity?.id) return null

  const id = Number(entity.id)

  return {
    id,
    entityId: id,
    entity_id: id,
    title: String(entity?.title || 'Untitled'),
    name: String(entity?.title || 'Untitled'),
    slug: String(entity?.slug || ''),
    entityType: String(entity?.entity_type || entity?.entityType || 'entity'),
    entity_type: String(entity?.entity_type || entity?.entityType || 'entity'),
    summary: String(entity?.summary || ''),
    imageUrl: entityImageUrl(entity),
    image_url: entityImageUrl(entity),
    url: `/worlds/${worldId}/entities/${id}`,
    resolved: true
  }
}

async function loadEntitiesById(worldId: string | number, ids: any[]) {
  const wanted = Array.from(new Set(
    ids
      .map((id) => intOrNull(id))
      .filter((id): id is number => Boolean(id))
  ))

  const map = new Map<number, any>()

  if (!wanted.length) return map

  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { id: { _in: wanted } }
        ]
      },
      limit: -1,
      fields: 'id,title,slug,world_id,entity_type,summary,image'
    }
  })

  for (const row of Array.isArray(res?.data) ? res.data : []) {
    const normalized = normalizeEntity(row, worldId)
    if (normalized) map.set(Number(row.id), normalized)
  }

  return map
}

async function assertWorldEntity(worldId: string | number, entityId: any) {
  const id = intOrNull(entityId)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Entity id is required'
    })
  }

  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { id: { _eq: id } }
        ]
      },
      limit: 1,
      fields: 'id,title,slug,world_id,entity_type,summary,image'
    }
  })

  const entity = Array.isArray(res?.data) ? (res.data[0] || null) : null

  if (!entity?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found in this world'
    })
  }

  return entity
}

function normalizeRelationship(row: any, entityMap: Map<number, any>, perspectiveEntityId: any, worldId: string | number) {
  const sourceEntityId = Number(row?.source_entity_id || 0)
  const targetEntityId = Number(row?.target_entity_id || 0)
  const perspective = intOrNull(perspectiveEntityId)

  const direction = perspective
    ? sourceEntityId === perspective
      ? 'outgoing'
      : targetEntityId === perspective
        ? 'incoming'
        : 'neutral'
    : 'neutral'

  const source = entityMap.get(sourceEntityId) || null
  const target = entityMap.get(targetEntityId) || null
  const other = direction === 'incoming' ? source : target

  const label = normalizeText(row?.label, 'related to')
  const inverseLabel = normalizeText(row?.inverse_label, '')
  const displayLabel = direction === 'incoming'
    ? inverseLabel || label
    : label

  return {
    id: row?.id,
    worldId: Number(row?.world_id || worldId),
    sourceEntityId,
    targetEntityId,
    source,
    target,
    other,
    direction,
    relationshipType: normalizeText(row?.relationship_type, 'related'),
    label,
    inverseLabel,
    displayLabel,
    status: normalizeText(row?.status, 'active'),
    strength: intOrNull(row?.strength) ?? 0,
    visibility: normalizeText(row?.visibility, 'world'),
    summary: String(row?.summary || ''),
    notes: String(row?.notes || ''),
    sort: intOrNull(row?.sort) ?? 100,
    metadata: row?.metadata || {},
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  }
}

export async function listEntityRelationships(worldId: string | number, options: any = {}) {
  const entityId = intOrNull(options?.entityId ?? options?.entity_id)
  const limit = Math.max(1, Math.min(500, Number(options?.limit || 100)))

  const filter: any = {
    world_id: { _eq: Number(worldId) }
  }

  if (entityId) {
    filter._or = [
      { source_entity_id: { _eq: entityId } },
      { target_entity_id: { _eq: entityId } }
    ]
  }

  try {
    const res = await directusServiceRequest('/items/entity_relationships', {
      method: 'GET',
      query: {
        filter,
        sort: 'sort,id',
        limit,
        fields: '*'
      }
    })

    const rows = Array.isArray(res?.data) ? res.data : []
    const entityMap = await loadEntitiesById(
      worldId,
      rows.flatMap((row: any) => [row?.source_entity_id, row?.target_entity_id])
    )

    const relationships = rows.map((row: any) =>
      normalizeRelationship(row, entityMap, entityId, worldId)
    )

    return {
      worldId: String(worldId),
      entityId: entityId ? String(entityId) : '',
      count: relationships.length,
      relationships,
      outgoing: entityId ? relationships.filter((row: any) => row.direction === 'outgoing') : relationships,
      incoming: entityId ? relationships.filter((row: any) => row.direction === 'incoming') : [],
      schemaMissing: false
    }
  } catch (error) {
    if (isMissingRelationshipSchema(error)) {
      return {
        worldId: String(worldId),
        entityId: entityId ? String(entityId) : '',
        count: 0,
        relationships: [],
        outgoing: [],
        incoming: [],
        schemaMissing: true
      }
    }

    throw error
  }
}

export async function createEntityRelationship(worldId: string | number, body: any = {}) {
  const sourceEntityId = intOrNull(body?.sourceEntityId ?? body?.source_entity_id)
  const targetEntityId = intOrNull(body?.targetEntityId ?? body?.target_entity_id)

  if (!sourceEntityId || !targetEntityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Source and target entities are required'
    })
  }

  if (sourceEntityId === targetEntityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'An entity cannot be related to itself'
    })
  }

  await assertWorldEntity(worldId, sourceEntityId)
  await assertWorldEntity(worldId, targetEntityId)

  const fields = await relationshipFields()

  if (!fields.size) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Relationship schema is not installed'
    })
  }

  const payload = pickSupported(fields, {
    world_id: Number(worldId),
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    relationship_type: normalizeRelationshipType(body?.relationshipType ?? body?.relationship_type),
    label: normalizeText(body?.label, 'related to'),
    inverse_label: textOrNull(body?.inverseLabel ?? body?.inverse_label),
    status: normalizeText(body?.status, 'active'),
    strength: intOrNull(body?.strength) ?? 0,
    visibility: normalizeVisibility(body?.visibility),
    summary: textOrNull(body?.summary),
    notes: textOrNull(body?.notes),
    sort: intOrNull(body?.sort) ?? 100,
    metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    created_at: nowIso(),
    updated_at: nowIso()
  })

  const res = await directusServiceRequest('/items/entity_relationships', {
    method: 'POST',
    body: payload
  })

  return res?.data || null
}

export async function updateEntityRelationship(worldId: string | number, relationshipId: any, body: any = {}) {
  const id = intOrNull(relationshipId)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Relationship id is required'
    })
  }

  const existingRes = await directusServiceRequest('/items/entity_relationships', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { id: { _eq: id } }
        ]
      },
      limit: 1,
      fields: '*'
    }
  })

  const existing = Array.isArray(existingRes?.data) ? (existingRes.data[0] || null) : null

  if (!existing?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Relationship not found'
    })
  }

  const fields = await relationshipFields()
  const patch: Record<string, any> = {}

  if (body?.relationshipType !== undefined || body?.relationship_type !== undefined) {
    patch.relationship_type = normalizeRelationshipType(body?.relationshipType ?? body?.relationship_type)
  }

  if (body?.label !== undefined) patch.label = normalizeText(body.label, 'related to')
  if (body?.inverseLabel !== undefined || body?.inverse_label !== undefined) patch.inverse_label = textOrNull(body?.inverseLabel ?? body?.inverse_label)
  if (body?.status !== undefined) patch.status = normalizeText(body.status, 'active')
  if (body?.strength !== undefined) patch.strength = intOrNull(body.strength) ?? 0
  if (body?.visibility !== undefined) patch.visibility = normalizeVisibility(body.visibility)
  if (body?.summary !== undefined) patch.summary = textOrNull(body.summary)
  if (body?.notes !== undefined) patch.notes = textOrNull(body.notes)
  if (body?.sort !== undefined) patch.sort = intOrNull(body.sort) ?? 100
  if (body?.metadata !== undefined) patch.metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}

  patch.updated_at = nowIso()

  const res = await directusServiceRequest(`/items/entity_relationships/${id}`, {
    method: 'PATCH',
    body: pickSupported(fields, patch)
  })

  return res?.data || null
}

export async function deleteEntityRelationship(worldId: string | number, relationshipId: any) {
  const id = intOrNull(relationshipId)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Relationship id is required'
    })
  }

  const existingRes = await directusServiceRequest('/items/entity_relationships', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: Number(worldId) } },
          { id: { _eq: id } }
        ]
      },
      limit: 1,
      fields: 'id'
    }
  })

  const existing = Array.isArray(existingRes?.data) ? (existingRes.data[0] || null) : null

  if (!existing?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Relationship not found'
    })
  }

  await directusServiceRequest(`/items/entity_relationships/${id}`, {
    method: 'DELETE'
  })

  return {
    deleted: id
  }
}
