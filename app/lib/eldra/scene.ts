// Shared Scene Graph types.
// See .github/docs/architecture/scene-graph.md for the canonical design.
//
// SceneLayer and SceneModel are intentionally permissive (most fields optional
// beyond `id`) because they are shared between the World Map page (which owns
// the authoritative in-memory Scene) and the Leaflet renderer / layer panel
// (which only consume a subset of fields). Do not narrow these without
// checking all three current consumers: app/pages/worlds/[id]/index.vue,
// app/components/world/WorldMapLeaflet.client.vue, and
// app/components/world/map/MapLayerPanel.vue.

export type LayerObjectGeometry = {
  type: string
  coordinates?: any
  [key: string]: any
}

export type LayerObjectProperties = {
  [key: string]: any
}

export type LayerObjectStyle = {
  [key: string]: any
}

export type LayerObject = {
  objectId: string
  objectType: string
  objectSchemaVersion: string
  visible: boolean
  geometry: LayerObjectGeometry
  properties: LayerObjectProperties
  style: LayerObjectStyle
  createdAt: string
  updatedAt: string
  name?: string
  locked?: boolean
  opacity?: number
  zOffset?: number
  state?: any
  schedule?: any
  links?: any
  tags?: string[]
  permissionsOverrides?: any
  custom?: any
  archivedAt?: string
  deletedAt?: string
}

export type SceneLayer = {
  id: string
  label?: string
  type?: string | null
  visible?: boolean
  locked?: boolean
  objects?: LayerObject[]
  data?: any
}

export type SceneModel = {
  id: string
  title?: string
  layers: SceneLayer[]
}
