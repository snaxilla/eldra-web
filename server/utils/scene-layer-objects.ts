import type { LayerObject } from '../../app/lib/eldra/scene'

// Canonical persistence contract for Scene Layer Objects.
//
// This module is the ONLY place that should know how Layer Objects are
// stored. The backing store here is intentionally temporary (in-memory,
// single-process, lost on restart) -- Directus-backed storage replaces
// the internals of this file in a later commit without changing the
// exported function signatures, so callers (server/api routes, and
// eventually the client via those routes) never need to change.
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

const store = new Map<string, Map<string, StoredLayerObject>>()

function mapStore(mapId: string) {
  let entries = store.get(mapId)

  if (!entries) {
    entries = new Map()
    store.set(mapId, entries)
  }

  return entries
}

export async function listLayerObjects(mapId: string, layerId?: string): Promise<StoredLayerObject[]> {
  const entries = Array.from(mapStore(mapId).values())
  return layerId ? entries.filter((entry) => entry.layerId === layerId) : entries
}

export async function createLayerObject(mapId: string, layerId: string, object: LayerObject): Promise<LayerObject> {
  if (!object?.objectId) {
    throw createError({ statusCode: 400, statusMessage: 'objectId is required' })
  }

  mapStore(mapId).set(object.objectId, { layerId, object })

  return object
}

export async function updateLayerObject(mapId: string, objectId: string, patch: Partial<LayerObject>): Promise<LayerObject> {
  const entries = mapStore(mapId)
  const existing = entries.get(objectId)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Layer object not found' })
  }

  const updated: LayerObject = {
    ...existing.object,
    ...patch,
    objectId: existing.object.objectId,
    updatedAt: new Date().toISOString()
  }

  entries.set(objectId, { layerId: existing.layerId, object: updated })

  return updated
}

export async function deleteLayerObject(mapId: string, objectId: string): Promise<void> {
  mapStore(mapId).delete(objectId)
}
