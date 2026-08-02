import type { LayerObject } from '../../app/lib/eldra/scene'
import { directusServiceRequest } from './directus'

// Canonical persistence contract for Scene Layer Objects.
//
// This module is the ONLY place that should know how Layer Objects are
// stored. Backed by the `scene_layer_objects` Directus collection (see
// scripts/directus/create-scene-layer-objects-schema.mjs). Callers
// (server/api routes, and the client via those routes) depend only on
// the exported function signatures below, which are unchanged from the
// temporary in-memory implementation this replaces.
//
// Objects do not own or reference their parent Layer (see
// .github/docs/architecture/scene-graph.md) -- the mapId/layerId
// association is tracked here, not on the LayerObject itself.

/**
 * Storage translation boundary.
 *
 * Runtime Scene Graph models intentionally remain storage-agnostic.
 *
 * mapId and layerId exist only at the persistence boundary and are
 * never added to LayerObject itself.
 */

export type StoredLayerObject = {
  layerId: string
  object: LayerObject
}

const COLLECTION = 'scene_layer_objects'

// Runtime Model -> Persistence Model.
//
// Universal, fixed-type envelope fields (visible, name, locked, opacity,
// z_offset, created_at, updated_at, archived_at, deleted_at) get their
// own first-class (snake_case) column -- they have a consistent meaning
// and real query value across every object type. state/schedule/links/
// tags/permissionsOverrides/custom do not: each is typed `any` (or
// freeform `string[]` for tags) with no shape common across object
// types, so -- like geometry/properties/style -- they're object-specific/
// extensible data and are grouped into a single `metadata` JSON column
// instead of one column each. See toPersistenceMetadata below.
function toPersistenceMetadata(object: LayerObject) {
  const metadata = {
    state: object.state ?? null,
    schedule: object.schedule ?? null,
    links: object.links ?? null,
    tags: object.tags ?? null,
    permissionsOverrides: object.permissionsOverrides ?? null,
    custom: object.custom ?? null
  }

  const isEmpty = Object.values(metadata).every((value) => value === null)
  return isEmpty ? null : metadata
}

function toPersistenceRow(mapId: string, layerId: string, object: LayerObject) {
  return {
    map_id: mapId,
    layer_id: layerId,
    object_id: object.objectId,
    object_type: object.objectType,
    object_schema_version: object.objectSchemaVersion,
    visible: object.visible !== false,
    name: object.name ?? null,
    locked: object.locked ?? false,
    opacity: object.opacity ?? null,
    z_offset: object.zOffset ?? null,
    created_at: object.createdAt,
    updated_at: object.updatedAt,
    archived_at: object.archivedAt ?? null,
    deleted_at: object.deletedAt ?? null,
    metadata: toPersistenceMetadata(object),
    geometry: object.geometry,
    properties: object.properties,
    style: object.style
  }
}

// Persistence Model -> Runtime Model.
//
// Reconstructs a pure LayerObject (no map_id/layer_id -- those stay in
// the envelope returned alongside it) from a Directus row.
function fromPersistenceRow(row: any): StoredLayerObject {
  const object: LayerObject = {
    objectId: String(row?.object_id ?? ''),
    objectType: String(row?.object_type ?? ''),
    objectSchemaVersion: String(row?.object_schema_version ?? '1'),
    visible: row?.visible !== false,
    geometry: row?.geometry ?? {},
    properties: row?.properties ?? {},
    style: row?.style ?? {},
    createdAt: String(row?.created_at ?? ''),
    updatedAt: String(row?.updated_at ?? '')
  }

  if (row?.name != null) object.name = String(row.name)
  if (row?.locked != null) object.locked = Boolean(row.locked)
  if (row?.opacity != null) object.opacity = Number(row.opacity)
  if (row?.z_offset != null) object.zOffset = Number(row.z_offset)

  const metadata = row?.metadata
  if (metadata != null) {
    if (metadata.state != null) object.state = metadata.state
    if (metadata.schedule != null) object.schedule = metadata.schedule
    if (metadata.links != null) object.links = metadata.links
    if (metadata.tags != null) object.tags = metadata.tags
    if (metadata.permissionsOverrides != null) object.permissionsOverrides = metadata.permissionsOverrides
    if (metadata.custom != null) object.custom = metadata.custom
  }
  if (row?.archived_at != null) object.archivedAt = String(row.archived_at)
  if (row?.deleted_at != null) object.deletedAt = String(row.deleted_at)

  return {
    layerId: String(row?.layer_id ?? ''),
    object
  }
}

async function findRow(mapId: string, objectId: string): Promise<any | null> {
  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        map_id: { _eq: mapId },
        object_id: { _eq: objectId }
      },
      limit: 1
    }
  })

  return Array.isArray(res?.data) ? res.data[0] || null : null
}

export async function listLayerObjects(mapId: string, layerId?: string): Promise<StoredLayerObject[]> {
  const filter: Record<string, any> = {
    map_id: { _eq: mapId }
  }

  if (layerId) {
    filter.layer_id = { _eq: layerId }
  }

  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: { filter, limit: -1 }
  })

  return (Array.isArray(res?.data) ? res.data : []).map(fromPersistenceRow)
}

export async function createLayerObject(mapId: string, layerId: string, object: LayerObject): Promise<LayerObject> {
  if (!object?.objectId) {
    throw createError({ statusCode: 400, statusMessage: 'objectId is required' })
  }

  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'POST',
    body: toPersistenceRow(mapId, layerId, object)
  })

  return fromPersistenceRow(res?.data).object
}

export async function updateLayerObject(mapId: string, objectId: string, patch: Partial<LayerObject>): Promise<LayerObject> {
  const existingRow = await findRow(mapId, objectId)

  if (!existingRow) {
    throw createError({ statusCode: 404, statusMessage: 'Layer object not found' })
  }

  const existing = fromPersistenceRow(existingRow)

  const updatedObject: LayerObject = {
    ...existing.object,
    ...patch,
    objectId: existing.object.objectId,
    updatedAt: new Date().toISOString()
  }

  const res: any = await directusServiceRequest(`/items/${COLLECTION}/${existingRow.id}`, {
    method: 'PATCH',
    body: toPersistenceRow(mapId, existing.layerId, updatedObject)
  })

  return fromPersistenceRow(res?.data).object
}

export async function deleteLayerObject(mapId: string, objectId: string): Promise<void> {
  const existingRow = await findRow(mapId, objectId)

  if (!existingRow) return

  await directusServiceRequest(`/items/${COLLECTION}/${existingRow.id}`, {
    method: 'DELETE'
  })
}
