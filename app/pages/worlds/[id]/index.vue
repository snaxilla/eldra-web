<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'
import MapBreadcrumbs from '~/components/world/map/MapBreadcrumbs.vue'
import MapImageOverlayEditor from '~/components/world/map/MapImageOverlayEditor.vue'
import MapLayerPanel from '~/components/world/map/MapLayerPanel.vue'
import MapSelectedPinCard from '~/components/world/map/MapSelectedPinCard.vue'
import MapPinEditor from '~/components/world/map/MapPinEditor.vue'
import MapBuildBanner from '~/components/world/map/MapBuildBanner.vue'
import MapRoadEditor from '~/components/world/map/MapRoadEditor.vue'
import type { LayerObject, SceneModel } from '~/lib/eldra/scene'

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const selectedMapSlug = computed(() => String(route.query.map || ''))

type BuildTool = 'select' | 'pin' | 'image-overlay' | 'road'
type RoadVertex = { x: number; y: number }

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')
const activeBuildTool = useState<BuildTool>('world-map-active-build-tool', () => 'select')
const showPins = useState<boolean>('world-map-show-pins', () => true)
const scene = ref<SceneModel>({
  id: 'world-map-scene',
  title: 'World Map',
  layers: [
    {
      id: 'base-map',
      label: 'Base Map',
      visible: true,
      locked: true,
      objects: [],
    },
    {
      id: 'pins',
      label: 'Pins',
      visible: showPins.value,
      objects: [],
    },
    {
      id: 'image-overlays',
      label: 'Image Overlays',
      visible: true,
      objects: [],
    },
    {
      id: 'roads',
      label: 'Roads',
      visible: true,
      objects: [],
    },
  ],
})

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: worldEntities, refresh: refreshWorldEntities } = await useFetch(() => `/api/worlds/${worldId.value}/entities?summary=1`, {
  default: () => []
})

const maps = ref<any[]>([])
const mapsLoading = ref(false)

function normalizeMap(row: any) {
  return {
    id: String(row?.id || ''),
    title: String(row?.title || 'Untitled Map'),
    slug: row?.slug ? String(row.slug) : '',
    type: row?.type ? String(row.type) : 'area',
    worldId: row?.worldId ?? row?.world_id ?? null,
    parentMapId:
      row?.parentMapId !== undefined
        ? (row.parentMapId ? String(row.parentMapId) : null)
        : row?.parent_map_id
          ? String(row.parent_map_id)
          : null,
    isDefaultWorldMap:
      row?.isDefaultWorldMap !== undefined
        ? row.isDefaultWorldMap === true || row.isDefaultWorldMap === 1
        : row?.is_default_world_map === true || row?.is_default_world_map === 1,
    imageUrl: row?.imageUrl || row?.image_url || null,
    directusFileId: row?.directusFileId || row?.directus_file_id || null,
    tileEnabled: row?.tileEnabled === true || row?.tile_enabled === true || row?.tile_enabled === 1,
    tileStatus: row?.tileStatus || row?.tile_status || 'none',
    tilePath: row?.tilePath || row?.tile_path || null,
    tileMinZoom: row?.tileMinZoom ?? row?.tile_min_zoom ?? null,
    tileMaxZoom: row?.tileMaxZoom ?? row?.tile_max_zoom ?? null,
    tileOriginalWidth: row?.tileOriginalWidth ?? row?.tile_original_width ?? null,
    tileOriginalHeight: row?.tileOriginalHeight ?? row?.tile_original_height ?? null,
    tileError: row?.tileError || row?.tile_error || null,
  }
}

async function loadMaps() {
  mapsLoading.value = true
  try {
    const result = await $fetch<any[]>(`/api/worlds/${worldId.value}/maps`, {
      query: { t: Date.now() }
    })
    maps.value = Array.isArray(result) ? result.map(normalizeMap) : []
  } catch (e) {
    console.error('Failed to load maps', e)
    maps.value = []
  } finally {
    mapsLoading.value = false
  }
}

await loadMaps()

const activeMap = computed(() => {
  const list = maps.value || []

  if (selectedMapSlug.value) {
    const bySlug = list.find((m: any) => String(m.slug || '') === selectedMapSlug.value)
    if (bySlug) return bySlug
  }

  return list.find((m: any) => m.isDefaultWorldMap) || list[0] || null
})

const worldRootMap = computed(() => {
  const list = maps.value || []
  return list.find((m: any) => m.isDefaultWorldMap) || list[0] || null
})

const ancestorMaps = computed(() => {
  const list = maps.value || []
  const byId = new Map(list.map((m: any) => [String(m.id), m]))
  const chain: any[] = []
  const seen = new Set<string>()

  let cursor = activeMap.value?.parentMapId ? byId.get(String(activeMap.value.parentMapId)) : null

  while (cursor) {
    const id = String(cursor.id)
    if (seen.has(id)) break
    seen.add(id)
    chain.unshift(cursor)

    const nextParentId = cursor.parentMapId ? String(cursor.parentMapId) : null
    cursor = nextParentId ? byId.get(nextParentId) : null
  }

  return chain
})

const mapImageUrl = computed(() => activeMap.value?.imageUrl || '')
const currentMapId = computed(() => String(activeMap.value?.id || ''))

const imageOverlayObjectsByMapId = useState<Record<string, LayerObject[]>>('world-map-image-overlay-objects', () => ({}))
const roadObjectsByMapId = useState<Record<string, LayerObject[]>>('world-map-road-objects', () => ({}))
const showImageOverlayEditor = ref(false)
const savingImageOverlay = ref(false)
const imageOverlaySaveError = ref('')
const editingImageOverlay = ref<any | null>(null)
const roadDraftVertices = ref<RoadVertex[]>([])
const selectedRoadId = ref<string | null>(null)
const roadSaveError = ref('')
const savingRoadDraft = ref(false)

function readSceneLayerObjectsForMap(mapId: string) {
  return {
    imageOverlays: imageOverlayObjectsByMapId.value[mapId] || [],
    roads: roadObjectsByMapId.value[mapId] || [],
  }
}

function applySceneLayerObjectsToCache(
  mapId: string,
  payload: { imageOverlays?: LayerObject[]; roads?: LayerObject[] }
) {
  // Local reactive cache only -- mirrors the pattern already used for pins
  // (see `pins` ref / `fetchPins`): the server (via the functions below)
  // is the source of truth, this is just what the renderer/computeds read
  // synchronously.
  if (payload.imageOverlays) {
    imageOverlayObjectsByMapId.value = {
      ...imageOverlayObjectsByMapId.value,
      [mapId]: payload.imageOverlays,
    }
  }

  if (payload.roads) {
    roadObjectsByMapId.value = {
      ...roadObjectsByMapId.value,
      [mapId]: payload.roads,
    }
  }
}

async function fetchLayerObjectsForMap(mapId: string) {
  const result = await $fetch<{ objects: Array<{ layerId: string; object: LayerObject }> }>(
    `/api/worlds/${worldId.value}/maps/${mapId}/layer-objects`
  )
  return result?.objects || []
}

async function createLayerObjectOnServer(mapId: string, layerId: string, object: LayerObject) {
  const result = await $fetch<{ object: LayerObject }>(
    `/api/worlds/${worldId.value}/maps/${mapId}/layer-objects`,
    { method: 'POST', body: { layerId, object } }
  )
  return result?.object || object
}

async function updateLayerObjectOnServer(mapId: string, objectId: string, patch: Partial<LayerObject>) {
  const result = await $fetch<{ object: LayerObject }>(
    `/api/worlds/${worldId.value}/maps/${mapId}/layer-objects/${objectId}`,
    { method: 'PATCH', body: patch }
  )
  return result?.object || patch
}

async function deleteLayerObjectOnServer(mapId: string, objectId: string) {
  await $fetch(`/api/worlds/${worldId.value}/maps/${mapId}/layer-objects/${objectId}`, {
    method: 'DELETE',
  })
}

async function syncLayerObjectsToServer(
  mapId: string,
  layerId: string,
  previous: LayerObject[],
  next: LayerObject[]
) {
  // Callers pass "the new full list" for a layer (matching prior behavior);
  // this diffs it against what's cached so only the objects that actually
  // changed are sent to the server abstraction as create/update/delete.
  const previousById = new Map(previous.map((object) => [object.objectId, object]))
  const nextById = new Map(next.map((object) => [object.objectId, object]))

  for (const [objectId, object] of nextById) {
    const existing = previousById.get(objectId)
    if (!existing) {
      await createLayerObjectOnServer(mapId, layerId, object)
    } else if (JSON.stringify(existing) !== JSON.stringify(object)) {
      await updateLayerObjectOnServer(mapId, objectId, object)
    }
  }

  for (const objectId of previousById.keys()) {
    if (!nextById.has(objectId)) {
      await deleteLayerObjectOnServer(mapId, objectId)
    }
  }
}

async function loadSceneLayerObjectsForMap(mapId: string) {
  const objects = await fetchLayerObjectsForMap(mapId)

  applySceneLayerObjectsToCache(mapId, {
    imageOverlays: objects.filter((entry) => entry.layerId === 'image-overlays').map((entry) => entry.object),
    roads: objects.filter((entry) => entry.layerId === 'roads').map((entry) => entry.object),
  })
}

async function writeSceneLayerObjectsForMap(
  mapId: string,
  payload: { imageOverlays?: LayerObject[]; roads?: LayerObject[] }
) {
  // Thin client wrapper around the server-side Scene Layer Object
  // persistence abstraction (server/utils/scene-layer-objects.ts / the
  // /api/worlds/:id/maps/:mapId/layer-objects routes). The client no
  // longer owns persistence -- it only diffs and mirrors what the server
  // confirms.
  const current = readSceneLayerObjectsForMap(mapId)

  if (payload.imageOverlays) {
    await syncLayerObjectsToServer(mapId, 'image-overlays', current.imageOverlays, payload.imageOverlays)
  }

  if (payload.roads) {
    await syncLayerObjectsToServer(mapId, 'roads', current.roads, payload.roads)
  }

  applySceneLayerObjectsToCache(mapId, payload)
}

const currentImageOverlayObjects = computed<LayerObject[]>(() => {
  if (!currentMapId.value) return []
  return readSceneLayerObjectsForMap(currentMapId.value).imageOverlays
})

const currentImageOverlayObject = computed(() => {
  return currentImageOverlayObjects.value.find((object) => String(object?.objectType || '').trim().toLowerCase() === 'image-overlay') || null
})

const currentRoadObjects = computed<LayerObject[]>(() => {
  if (!currentMapId.value) return []
  return readSceneLayerObjectsForMap(currentMapId.value).roads
})

const selectedRoad = computed(() => {
  return currentRoadObjects.value.find((road) => String(road.objectId) === String(selectedRoadId.value || '')) || null
})

type RoadDraft = { objectId: string; name: string }

const editingRoadDraft = ref<RoadDraft | null>(null)
const savingRoad = ref(false)
const roadEditorSaveError = ref('')

watch(selectedRoad, (road) => {
  if (!road) {
    editingRoadDraft.value = null
    return
  }

  // Only reset the draft when selection moves to a *different* road, so an
  // in-progress edit isn't clobbered by the reactive re-read that follows
  // saving it.
  if (editingRoadDraft.value?.objectId !== road.objectId) {
    editingRoadDraft.value = {
      objectId: road.objectId,
      name: String(road.name || road.properties?.name || 'Road'),
    }
    roadEditorSaveError.value = ''
  }
})

async function saveRoadEditor() {
  if (!editingRoadDraft.value || !selectedRoad.value) return

  const name = editingRoadDraft.value.name.trim() || 'Road'

  roadEditorSaveError.value = ''
  savingRoad.value = true
  try {
    const updatedRoad: LayerObject = {
      ...selectedRoad.value,
      name,
      properties: {
        ...selectedRoad.value.properties,
        name,
      },
      updatedAt: new Date().toISOString(),
    }

    await syncCurrentRoadObjects(
      currentRoadObjects.value.map((road) => (road.objectId === updatedRoad.objectId ? updatedRoad : road))
    )
  } catch (error) {
    console.error('Failed to save road name', error)
    roadEditorSaveError.value = 'Failed to save. Try again.'
  } finally {
    savingRoad.value = false
  }
}

function closeRoadEditor() {
  selectedRoadId.value = null
}

function roadVerticesToCoordinates(vertices: RoadVertex[]) {
  return vertices.map((vertex) => ({
    x: Number(vertex.x),
    y: Number(vertex.y),
  }))
}

function buildRoadObjectFromVertices(vertices: RoadVertex[]) {
  const now = new Date().toISOString()

  return {
    objectId: `road-${currentMapId.value}-${now}`,
    objectType: 'road',
    objectSchemaVersion: '1',
    visible: true,
    geometry: {
      type: 'polyline',
      coordinates: roadVerticesToCoordinates(vertices),
    },
    properties: {
      name: 'Road',
    },
    style: {},
    createdAt: now,
    updatedAt: now,
    name: 'Road',
  }
}

function buildImageOverlayObjectFromDraft(draft: any, existing: LayerObject | null) {
  const now = new Date().toISOString()
  const imageUrl = String(draft?.imageUrl || '').trim()
  const nextOpacity = Number(draft?.opacity)

  return {
    objectId: String(existing?.objectId || draft?.objectId || `image-overlay-${currentMapId.value}`),
    objectType: 'image-overlay',
    objectSchemaVersion: '1',
    visible: true,
    geometry: {
      type: 'bounds',
      coordinates: {
        anchor: 'map',
      },
    },
    properties: {
      name: String(draft?.name || 'Image Overlay'),
      imageFileId: String(draft?.imageFileId || '').trim() || null,
      imageUrl,
    },
    style: {
      opacity: Number.isFinite(nextOpacity) ? Math.max(0, Math.min(1, nextOpacity)) : 0.65,
    },
    createdAt: String(existing?.createdAt || now),
    updatedAt: now,
    name: String(draft?.name || 'Image Overlay'),
  }
}

const runtimeImageOverlayObjects = computed<LayerObject[]>(() => {
  if (!showImageOverlayEditor.value || !editingImageOverlay.value) {
    return currentImageOverlayObjects.value
  }

  const previewImageUrl = String(editingImageOverlay.value.imageUrl || '').trim()
  if (!previewImageUrl) {
    return currentImageOverlayObjects.value
  }

  return [buildImageOverlayObjectFromDraft(editingImageOverlay.value, currentImageOverlayObject.value)]
})

async function syncCurrentImageOverlayObjects(objects: LayerObject[]) {
  if (!currentMapId.value) return
  await writeSceneLayerObjectsForMap(currentMapId.value, { imageOverlays: objects })
}

async function syncCurrentRoadObjects(objects: LayerObject[]) {
  if (!currentMapId.value) return
  await writeSceneLayerObjectsForMap(currentMapId.value, { roads: objects })
}

const runtimeRoadObjects = computed<LayerObject[]>(() => {
  if (mode.value !== 'build' || activeBuildTool.value !== 'road') {
    return currentRoadObjects.value
  }

  if (roadDraftVertices.value.length < 1) {
    return currentRoadObjects.value
  }

  const now = new Date().toISOString()
  const draftObject: LayerObject = {
    objectId: `road-draft-${currentMapId.value}`,
    objectType: 'road',
    objectSchemaVersion: '1',
    visible: true,
    geometry: {
      type: 'polyline',
      coordinates: roadVerticesToCoordinates(roadDraftVertices.value),
    },
    properties: {
      name: 'Road Draft',
      isDraft: true,
    },
    style: {
      opacity: 0.8,
    },
    createdAt: now,
    updatedAt: now,
    name: 'Road Draft',
  }

  return [...currentRoadObjects.value, draftObject]
})

const pins = ref<any[]>([])

function isPinVisible(pin: any) {
  if (!showPins.value) return false

  // Future-ready visibility model:
  // pin.visibility = 'public' | 'discovered' | 'gm' | 'private'
  // pin.discovered = true/false
  // pin.allowed_roles / pin.allowed_users
  const visibility = String(pin?.visibility || 'public')

  if (visibility === 'hidden') return false
  if (visibility === 'discovered' && pin?.discovered === false) return false

  return true
}

const visiblePins = computed(() => {
  return (pins.value || []).filter(isPinVisible)
})

const pinLayerObjects = computed<LayerObject[]>(() => {
  return visiblePins.value.map((pin: any) => ({
    objectId: String(pin.id),
    objectType: 'pin',
    objectSchemaVersion: '1',
    visible: true,
    geometry: {
      type: 'point',
      coordinates: {
        x: Number(pin.x),
        y: Number(pin.y),
      },
    },
    properties: {
      title: String(pin.title || ''),
      summary: pin.summary || '',
      pinType: pin.pinType || null,
      entityId: pin.entityId ?? null,
      linkedMapId: pin.linkedMapId ?? null,
      imageUrl: pin.imageUrl || null,
      inheritFromEntity: pin.inheritFromEntity === true,
    },
    style: {
      color: pin.color || null,
      icon: pin.icon || 'marker',
    },
    createdAt: String(pin.createdAt || pin.created_at || pin.date_created || ''),
    updatedAt: String(pin.updatedAt || pin.updated_at || pin.date_updated || ''),
    name: String(pin.title || ''),
  }))
})

watch(
  runtimeImageOverlayObjects,
  (objects) => {
    const overlayLayer = scene.value.layers.find((layer) => layer.id === 'image-overlays')
    if (!overlayLayer) return
    overlayLayer.objects = objects
  },
  { immediate: true, deep: true }
)

watch(
  pinLayerObjects,
  (objects) => {
    const pinsLayer = scene.value.layers.find((layer) => layer.id === 'pins')
    if (!pinsLayer) return
    pinsLayer.objects = objects
  },
  { immediate: true }
)

watch(
  runtimeRoadObjects,
  (objects) => {
    const roadsLayer = scene.value.layers.find((layer) => layer.id === 'roads')
    if (!roadsLayer) return
    roadsLayer.objects = objects
  },
  { immediate: true, deep: true }
)

const selectedPinId = ref<string | null>(null)

watch(currentMapId, () => {
  showImageOverlayEditor.value = false
  editingImageOverlay.value = null
  imageOverlaySaveError.value = ''
  roadDraftVertices.value = []
  selectedRoadId.value = null
  if (mode.value === 'build') {
    activeBuildTool.value = 'select'
  }
})

watch(mode, (value) => {
  if (value !== 'build') {
    activeBuildTool.value = 'select'
    closeImageOverlayEditor()
    closePinEditor()
    roadDraftVertices.value = []
    return
  }

  if (!activeBuildTool.value) {
    activeBuildTool.value = 'select'
  }
})

watch(showPins, (value) => {
  const pinsLayer = scene.value.layers.find((layer) => layer.id === 'pins')
  if (pinsLayer && pinsLayer.visible !== value) {
    pinsLayer.visible = value
  }

  if (!value) {
    selectedPinId.value = null
  }
})

function toggleSceneLayer(payload: { layerId: string; visible: boolean }) {
  const layer = scene.value.layers.find((entry) => entry.id === payload.layerId)
  if (!layer || layer.locked) return

  layer.visible = payload.visible

  if (payload.layerId === 'pins') {
    showPins.value = payload.visible
  }
}

function imageOverlayObjectToDraft(object: LayerObject) {
  const imageFileId = String(object?.properties?.imageFileId || object?.properties?.fileId || '').trim()
  const imageUrl = String(object?.properties?.imageUrl || '').trim() || (imageFileId ? `/api/assets/${imageFileId}` : '')

  return {
    objectId: String(object?.objectId || ''),
    name: String(object?.name || object?.properties?.name || 'Image Overlay'),
    imageFileId,
    imageUrl,
    opacity: Number.isFinite(Number(object?.style?.opacity ?? object?.properties?.opacity))
      ? Number(object?.style?.opacity ?? object?.properties?.opacity)
      : 0.65,
  }
}

function openImageOverlayEditor() {
  setActiveBuildTool('image-overlay')

  imageOverlaySaveError.value = ''
  editingImageOverlay.value = currentImageOverlayObject.value
    ? imageOverlayObjectToDraft(currentImageOverlayObject.value)
    : {
        objectId: '',
        name: 'Image Overlay',
        imageFileId: '',
        imageUrl: '',
        opacity: 0.65,
      }
  showImageOverlayEditor.value = true
}

function closeImageOverlayEditor(nextTool: BuildTool = 'select') {
  showImageOverlayEditor.value = false
  editingImageOverlay.value = null
  imageOverlaySaveError.value = ''
  if (mode.value === 'build') {
    activeBuildTool.value = nextTool
  }
}

async function removeImageOverlay() {
  await syncCurrentImageOverlayObjects([])
  closeImageOverlayEditor()
}

async function saveImageOverlay() {
  if (!editingImageOverlay.value || !currentMapId.value) return

  const imageUrl = String(editingImageOverlay.value.imageUrl || '').trim()
  if (!imageUrl) {
    imageOverlaySaveError.value = 'Choose an image for the overlay.'
    return
  }

  imageOverlaySaveError.value = ''

  savingImageOverlay.value = true
  try {
    const overlayObject = buildImageOverlayObjectFromDraft(editingImageOverlay.value, currentImageOverlayObject.value)

    await syncCurrentImageOverlayObjects([overlayObject])
    closeImageOverlayEditor()
  } finally {
    savingImageOverlay.value = false
  }
}

const loadingPins = ref(false)

async function fetchPins() {
  if (!activeMap.value?.id) return

  loadingPins.value = true
  try {
    const result = await $fetch(`/api/map-pins?mapId=${activeMap.value.id}`)
    pins.value = (result as any[]) || []
  } catch (e) {
    console.error('Failed to load pins', e)
  } finally {
    loadingPins.value = false
  }
}

watch(
  () => activeMap.value?.id,
  (id) => {
    if (!id) return
    fetchPins()
  },
  { immediate: true }
)

watch(
  () => activeMap.value?.id,
  (id) => {
    if (!id) return
    loadSceneLayerObjectsForMap(String(id))
  },
  { immediate: true }
)

function selectPin(id: string) {
  selectedPinId.value = selectedPinId.value === id ? null : id
  if (selectedPinId.value) {
    selectedRoadId.value = null
  }
}

function selectRoad(id: string) {
  if (mode.value !== 'build' || activeBuildTool.value !== 'select') return
  selectedRoadId.value = selectedRoadId.value === id ? null : id
  if (selectedRoadId.value) {
    selectedPinId.value = null
  }
}

const selectedPin = computed(() => pins.value.find((p) => p.id === selectedPinId.value) || null)

const selectedPinReadMoreUrl = computed(() => {
  if (!selectedPin.value?.entity?.id) return null
  return `/worlds/${worldId.value}/entities/${selectedPin.value.entity.id}`
})

const selectedPinMapUrl = computed(() => {
  if (!selectedPin.value?.linkedMap?.slug) return null
  return `/worlds/${worldId.value}?map=${selectedPin.value.linkedMap.slug}`
})

const showPinEditor = ref(false)
const savingPin = ref(false)
const saveError = ref('')
const creatingEntity = ref(false)
const createEntityError = ref('')
const createEntitySuccess = ref('')
const editingPin = ref<any | null>(null)

const showLayerPanel = ref(false)

const ICON_OPTIONS = [
  { label: 'Marker', value: 'marker', symbol: '●' },
  { label: 'City', value: 'city', symbol: '▦' },
  { label: 'Castle', value: 'castle', symbol: '♜' },
  { label: 'Tower', value: 'tower', symbol: '▮' },
  { label: 'Dungeon', value: 'dungeon', symbol: '⛓' },
  { label: 'Temple', value: 'temple', symbol: '⛪' },
  { label: 'Camp', value: 'camp', symbol: '△' },
  { label: 'Harbor', value: 'harbor', symbol: '⚓' },
  { label: 'Ruins', value: 'ruins', symbol: '◫' },
  { label: 'Quest', value: 'quest', symbol: '★' },
  { label: 'Skull', value: 'skull', symbol: '☠' },
  { label: 'Book', value: 'book', symbol: '☰' },
]

const MAP_RELEVANT_ENTITY_TYPES = new Set([
  'location',
  'region',
  'settlement',
  'city',
  'landmark',
  'quest',
  'poi',
])

function normalizeEntityId(value: any) {
  if (value === undefined || value === null || value === '' || value === 'null') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function goToMapBySlug(slug: string | null | undefined) {
  if (!slug) return
  router.push(`/worlds/${worldId.value}?map=${slug}`)
}

function goToWorldRootMap() {
  if (worldRootMap.value?.slug) {
    router.push(`/worlds/${worldId.value}?map=${worldRootMap.value.slug}`)
    return
  }
  router.push(`/worlds/${worldId.value}`)
}

function setActiveBuildTool(tool: BuildTool) {
  if (mode.value !== 'build') return
  if (activeBuildTool.value === tool) return

  activeBuildTool.value = tool

  if (tool !== 'image-overlay') {
    closeImageOverlayEditor(tool)
  }

  if (tool !== 'pin') {
    closePinEditor()
  }

  if (tool !== 'road') {
    roadDraftVertices.value = []
  }
}

function onRoadMapClick(coords: { x: number; y: number }) {
  roadSaveError.value = ''
  roadDraftVertices.value = [...roadDraftVertices.value, { x: Number(coords.x), y: Number(coords.y) }]
}

async function onRoadMapDoubleClick(coords: { x: number; y: number }) {
  const lastVertex = roadDraftVertices.value[roadDraftVertices.value.length - 1]
  const nextX = Number(coords.x)
  const nextY = Number(coords.y)

  if (!lastVertex || lastVertex.x !== nextX || lastVertex.y !== nextY) {
    roadDraftVertices.value = [...roadDraftVertices.value, { x: nextX, y: nextY }]
  }

  if (roadDraftVertices.value.length < 2) {
    roadDraftVertices.value = []
    return
  }

  const completedRoad = buildRoadObjectFromVertices(roadDraftVertices.value)

  // Persistence is a network call and can fail (schema not yet applied,
  // connectivity, auth). Previously an unhandled rejection here silently
  // aborted everything after it -- the draft never cleared, the road never
  // got selected, and the editor never opened, which read as "double-click
  // does nothing." Keep the draft intact on failure so the user's work
  // isn't lost and they can retry, and surface the error instead of
  // failing silently.
  roadSaveError.value = ''
  savingRoadDraft.value = true

  try {
    await syncCurrentRoadObjects([...currentRoadObjects.value, completedRoad])
  } catch (error) {
    console.error('Failed to save road', error)
    roadSaveError.value = 'Failed to save road. Double-click to try again.'
    return
  } finally {
    savingRoadDraft.value = false
  }

  roadDraftVertices.value = []

  // Creation naturally transitions into editing: select the new road and
  // switch to the Select tool so the existing inspector panel opens for it.
  selectedRoadId.value = completedRoad.objectId
  setActiveBuildTool('select')
}

function cancelRoadDraft() {
  roadDraftVertices.value = []
}

function undoLastRoadVertex() {
  roadDraftVertices.value = roadDraftVertices.value.slice(0, -1)
}

function onBuildKeydown(event: KeyboardEvent) {
  if (mode.value !== 'build' || activeBuildTool.value !== 'road') return
  if (roadDraftVertices.value.length === 0) return

  if (event.key === 'Escape') {
    event.preventDefault()
    cancelRoadDraft()
  } else if (event.key === 'Backspace') {
    event.preventDefault()
    undoLastRoadVertex()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onBuildKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onBuildKeydown)
})

function openNewPinEditor(coords: { x: number; y: number }) {
  if (mode.value !== 'build' || activeBuildTool.value !== 'pin') return

  saveError.value = ''
  createEntityError.value = ''
  createEntitySuccess.value = ''

  editingPin.value = {
    title: '',
    x: coords.x,
    y: coords.y,
    color: '#3b82f6',
    pinType: 'location',
    icon: 'marker',
    entityId: null,
    linkedMapId: null,
    summary: '',
    image: null,
    imageUrl: null,
    inheritFromEntity: true,
  }

  showPinEditor.value = true
  selectedPinId.value = null
}

function onMapClick(coords: { x: number; y: number }) {
  if (mode.value !== 'build') return

  if (activeBuildTool.value === 'pin') {
    openNewPinEditor(coords)
    return
  }

  if (activeBuildTool.value === 'road') {
    onRoadMapClick(coords)
  }
}

function onMapDoubleClick(coords: { x: number; y: number }) {
  if (mode.value !== 'build' || activeBuildTool.value !== 'road') return
  void onRoadMapDoubleClick(coords)
}

function editPin(pin: any) {
  if (mode.value !== 'build' || activeBuildTool.value === 'image-overlay') return
  activeBuildTool.value = 'pin'

  saveError.value = ''
  createEntityError.value = ''
  createEntitySuccess.value = ''

  editingPin.value = {
    id: pin.id,
    title: pin.title || '',
    x: pin.x,
    y: pin.y,
    color: pin.color || '#3b82f6',
    pinType: pin.pinType || 'location',
    icon: pin.icon || 'marker',
    entityId: pin.entityId ?? null,
    linkedMapId: pin.linkedMapId ?? null,
    summary: pin.summary || '',
    image: pin.imageFileId || null,
    imageUrl: pin.imageUrl || null,
    inheritFromEntity: pin.inheritFromEntity !== false,
  }

  showPinEditor.value = true
}

function closePinEditor() {
  showPinEditor.value = false
  editingPin.value = null
  saveError.value = ''
  createEntityError.value = ''
  createEntitySuccess.value = ''
}

async function syncLinkedArticleSummaryFromPin(payload: any) {
  const linkedEntityId = normalizeEntityId(payload?.entityId)
  const summary = String(payload?.summary || '').trim()

  if (!linkedEntityId || !summary) return

  await $fetch(`/api/worlds/${worldId.value}/entities/${linkedEntityId}`, {
    method: 'PATCH',
    body: {
      summary
    }
  })

  await refreshWorldEntities()
}

async function savePin() {
  if (!editingPin.value || !activeMap.value?.id) return

  saveError.value = ''
  savingPin.value = true

  const payload = {
    title: String(editingPin.value.title || '').trim(),
    x: Number(editingPin.value.x),
    y: Number(editingPin.value.y),
    color: editingPin.value.color || null,
    pinType: editingPin.value.pinType || null,
    icon: editingPin.value.icon || 'marker',
    entityId: normalizeEntityId(editingPin.value.entityId),
    linkedMapId: editingPin.value.linkedMapId || null,
    summary: editingPin.value.summary?.trim() ? editingPin.value.summary.trim() : null,
    image: editingPin.value.image || null,
    inheritFromEntity: editingPin.value.inheritFromEntity === true,
  }

  try {
    if (editingPin.value.id) {
      const updated = await $fetch(`/api/map-pins/${editingPin.value.id}`, {
        method: 'PATCH',
        body: payload
      })

      const idx = pins.value.findIndex((p) => p.id === editingPin.value.id)
      if (idx !== -1) {
        pins.value[idx] = updated
      } else {
        pins.value.push(updated)
      }

      selectedPinId.value = updated.id
    } else {
      const created = await $fetch('/api/map-pins', {
        method: 'POST',
        body: {
          mapId: activeMap.value.id,
          ...payload
        }
      })

      pins.value.push(created)
      selectedPinId.value = created.id
    }

    await syncLinkedArticleSummaryFromPin(payload)
    await fetchPins()

    closePinEditor()
  } catch (e: any) {
    console.error('Failed to save pin', e)
    saveError.value =
      e?.data?.statusMessage ||
      e?.data?.message ||
      e?.message ||
      'Failed to save pin.'
  } finally {
    savingPin.value = false
  }
}

async function createArticleFromPin() {
  if (!editingPin.value) return

  createEntityError.value = ''
  createEntitySuccess.value = ''

  const title = String(editingPin.value.title || '').trim()
  if (!title) {
    createEntityError.value = 'Give the pin a title before creating an article.'
    return
  }

  creatingEntity.value = true

  try {
    const created = await $fetch(`/api/worlds/${worldId.value}/pins/create-entity`, {
      method: 'POST',
      body: {
        title,
        summary: editingPin.value.summary?.trim() || null,
        pinType: editingPin.value.pinType || 'location',
        image: editingPin.value.image || null,
        linkedMapId: editingPin.value.linkedMapId || null,
      }
    })

    editingPin.value.entityId = created.id
    editingPin.value.inheritFromEntity = true
    editingPin.value.image = null
    editingPin.value.imageUrl = created.imageUrl || null
    createEntitySuccess.value = `Created article: ${created.title}`

    await refreshWorldEntities()
  } catch (e: any) {
    console.error('Failed to create article from pin', e)
    createEntityError.value =
      e?.data?.statusMessage ||
      e?.data?.message ||
      e?.message ||
      'Failed to create article.'
  } finally {
    creatingEntity.value = false
  }
}

async function deletePin(pinId: string) {
  try {
    await $fetch(`/api/map-pins/${pinId}`, {
      method: 'DELETE'
    })

    pins.value = pins.value.filter((p) => p.id !== pinId)
    if (selectedPinId.value === pinId) selectedPinId.value = null
    if (editingPin.value?.id === pinId) closePinEditor()
  } catch (e) {
    console.error('Failed to delete pin', e)
  }
}

async function deleteSelectedRoad() {
  if (!selectedRoadId.value) return

  const roadId = String(selectedRoadId.value)
  await syncCurrentRoadObjects(currentRoadObjects.value.filter((road) => String(road.objectId) !== roadId))
  selectedRoadId.value = null
}

async function uploadPinImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file || !editingPin.value) return

  saveError.value = ''

  const formData = new FormData()
  formData.append('file', file)

  try {
    const result = await $fetch<{ file_id: string; image_url: string }>('/api/map-pins/upload-image', {
      method: 'POST',
      body: formData
    })

    editingPin.value.image = result.file_id
    editingPin.value.imageUrl = result.image_url
  } catch (e: any) {
    console.error('Failed to upload pin image', e)
    saveError.value =
      e?.data?.statusMessage ||
      e?.data?.message ||
      e?.message ||
      'Failed to upload image.'
  }
}

const entityOptions = computed(() => {
  return (worldEntities.value || [])
    .filter((entity: any) => MAP_RELEVANT_ENTITY_TYPES.has(String(entity.entity_type || '').toLowerCase()))
    .map((entity: any) => ({
      label: entity.title || `Entity ${entity.id}`,
      value: Number(entity.id),
      type: entity.entity_type || 'entity',
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const mapOptions = computed(() => {
  return (maps.value || [])
    .filter((m: any) => String(m.id) !== String(activeMap.value?.id || ''))
    .map((m: any) => ({
      id: String(m.id),
      title: String(m.title || 'Untitled Map'),
      slug: m.slug ? String(m.slug) : null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
})

function iconLabel(icon: string | null | undefined) {
  const match = ICON_OPTIONS.find((opt) => opt.value === icon)
  return match?.label || 'Marker'
}

function formatLocationType(value: any) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatPopulation(value: any) {
  if (value === null || value === undefined || value === '') return ''

  const numeric = Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(numeric)) return String(value)

  return numeric.toLocaleString()
}

function mapTitleById(id: any) {
  const needle = String(id || '')
  if (!needle) return ''
  return (maps.value || []).find((map: any) => String(map.id) === needle)?.title || needle
}

function locationTitleById(id: any) {
  const needle = String(id || '')
  if (!needle) return ''
  return (worldEntities.value || []).find((entity: any) => String(entity.id) === needle)?.title || needle
}

function pinLocationMetaLines(pin: any) {
  const core = pin?.entity?.location_core
  if (!core) return []

  const type = formatLocationType(core.locationType ?? core.location_type ?? core.type)
  const population = formatPopulation(core.population)
  const linkedMapId = String(core.linkedMapId ?? core.linked_map_id ?? '').trim()
  const parentLocationId = String(core.parentLocationId ?? core.parent_location_id ?? '').trim()

  return [
    type ? `Type: ${type}` : '',
    population ? `Population: ${population}` : '',
    linkedMapId ? `Linked Map: ${mapTitleById(linkedMapId)}` : '',
    parentLocationId ? `Parent Location: ${locationTitleById(parentLocationId)}` : ''
  ].filter(Boolean)
}

function openLinkedMap() {
  if (!selectedPin.value?.linkedMap?.slug) return
  router.push(`/worlds/${worldId.value}?map=${selectedPin.value.linkedMap.slug}`)
}

const selectedPinContextEntity = computed(() => {
  const pin = selectedPin.value
  if (!pin) return null

  const displayType = formatLocationType(pin.pinType) || 'Location'
  const tags = [
    iconLabel(pin.icon),
    pin.hasLinkedEntity ? 'Linked Article' : '',
    pin.hasLinkedMap ? 'Linked Map' : '',
    !pin.hasLinkedEntity && !pin.hasLinkedMap ? 'Pin Note' : ''
  ].filter(Boolean)

  return {
    resolved: true,
    id: pin.entity?.id || pin.id,
    title: pin.resolvedTitle || pin.title || 'Selected Location',
    entityType: 'location',
    type: 'location',
    displayType,
    summary: pin.resolvedSummary || '',
    imageUrl: pin.resolvedImageUrl || '',
    url: selectedPinReadMoreUrl.value || '',
    tags,
    detailLines: pinLocationMetaLines(pin),
    destinationMapTitle: pin.linkedMap?.title || '',
    destinationMapUrl: selectedPinMapUrl.value || ''
  }
})

function closeSelectedPinContext() {
  selectedPinId.value = null
}

function openSelectedPinContextMap() {
  openLinkedMap()
}
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-[#09111a]">

    <MapBreadcrumbs
      :active-map="activeMap"
      :world-root-map="worldRootMap"
      :ancestor-maps="ancestorMaps"
      @root="goToWorldRootMap"
      @ancestor="goToMapBySlug"
    />

    <MapBuildBanner
      :show="mode === 'build'"
      :active-tool="activeBuildTool"
    />

    <div
      v-if="roadSaveError"
      class="pointer-events-none absolute right-4 top-24 z-20 max-w-xs rounded-none border border-red-500/30 bg-[rgba(20,17,12,0.9)] px-4 py-2.5 text-xs text-red-200 backdrop-blur"
    >
      {{ roadSaveError }}
    </div>

    <div v-if="mapImageUrl" class="absolute inset-0 z-0">
      <WorldMapLeaflet
        :key="`${worldId}-${selectedMapSlug}-${mapImageUrl}`"
        :map-image-url="mapImageUrl"
        :scene="scene"
        :tile-enabled="activeMap?.tileEnabled"
        :tile-path="activeMap?.tilePath"
        :tile-min-zoom="activeMap?.tileMinZoom"
        :tile-max-zoom="activeMap?.tileMaxZoom"
        :tile-original-width="activeMap?.tileOriginalWidth"
        :tile-original-height="activeMap?.tileOriginalHeight"
        :pins="visiblePins"
        :selected-pin-id="selectedPinId"
        :selected-road-id="selectedRoadId"
        :build-mode="mode === 'build' && (activeBuildTool === 'pin' || activeBuildTool === 'road')"
        :road-mode="mode === 'build' && activeBuildTool === 'road'"
        @select-pin="selectPin"
        @select-road="selectRoad"
        @map-click="onMapClick"
        @map-double-click="onMapDoubleClick"
      />
    </div>

    <div v-else class="flex h-full items-center justify-center">
      <div class="text-center">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">No Map Selected</div>
        <div class="mt-3 text-lg text-[#d8ceb8]">Upload a map and set one as the default world map.</div>
      </div>
    </div>


    <MapLayerPanel
      :open="showLayerPanel"
      :scene="scene"
      :show-trigger="false"
      @close="showLayerPanel = !showLayerPanel"
      @toggle-layer="toggleSceneLayer"
    />

    <div
      v-if="mapImageUrl"
      class="absolute left-4 top-20 z-20 inline-flex items-center gap-2"
    >
      <button
        type="button"
        class="eldra-button inline-flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur"
        :class="showLayerPanel ? 'ring-1 ring-[rgba(201,164,90,0.58)]' : ''"
        @click="showLayerPanel = !showLayerPanel"
      >
        <UIcon
          name="i-lucide-layers-3"
          class="h-4 w-4 text-[#f5e7bd]"
        />
        <span>Layers</span>
      </button>

      <button
        v-if="mode === 'build'"
        type="button"
        class="eldra-button rounded-none px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur"
        :class="activeBuildTool === 'road' ? 'ring-1 ring-[rgba(201,164,90,0.58)]' : ''"
        @click="setActiveBuildTool('road')"
      >
        Road
      </button>

      <button
        v-if="mode === 'build'"
        type="button"
        class="eldra-button rounded-none px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur"
        :class="activeBuildTool === 'select' ? 'ring-1 ring-[rgba(201,164,90,0.58)]' : ''"
        @click="setActiveBuildTool('select')"
      >
        Select
      </button>

      <button
        v-if="mode === 'build'"
        type="button"
        class="eldra-button rounded-none px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur"
        :class="activeBuildTool === 'pin' ? 'ring-1 ring-[rgba(201,164,90,0.58)]' : ''"
        @click="setActiveBuildTool('pin')"
      >
        Pin
      </button>

      <button
        v-if="mode === 'build'"
        type="button"
        class="eldra-button inline-flex items-center gap-2 rounded-none px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur"
        :class="activeBuildTool === 'image-overlay' ? 'ring-1 ring-[rgba(201,164,90,0.58)]' : ''"
        @click="openImageOverlayEditor"
      >
        <UIcon
          name="i-lucide-image"
          class="h-4 w-4 text-[#f5e7bd]"
        />
        <span>{{ currentImageOverlayObject ? 'Edit Overlay' : 'Add Overlay' }}</span>
      </button>
    </div>



    <WorldEntityContextDrawer
      :open="Boolean(selectedPin && mode === 'play')"
      :entity="selectedPinContextEntity"
      :world-id="worldId"
      :mode="mode"
      :allow-build-actions="false"
      @close="closeSelectedPinContext"
      @open-map="openSelectedPinContextMap"
    />

    <MapSelectedPinCard
      :open="Boolean(selectedPin && mode === 'build' && activeBuildTool !== 'image-overlay' && !showPinEditor)"
      :selected-pin="selectedPin"
      :format-location-type="formatLocationType"
      :icon-label="iconLabel"
      @edit="editPin(selectedPin)"
      @delete="deletePin(selectedPin.id)"
    />

    <MapRoadEditor
      :open="mode === 'build' && activeBuildTool === 'select' && !!selectedRoad"
      :editing-road="editingRoadDraft"
      :vertex-count="Array.isArray(selectedRoad?.geometry?.coordinates) ? selectedRoad.geometry.coordinates.length : 0"
      :saving="savingRoad"
      :save-error="roadEditorSaveError"
      @close="closeRoadEditor"
      @save="saveRoadEditor"
      @delete="deleteSelectedRoad"
    />

    <MapPinEditor
      :open="showPinEditor"
      :editing-pin="editingPin"
      :world-id="worldId"
      :saving-pin="savingPin"
      :save-error="saveError"
      :creating-entity="creatingEntity"
      :create-entity-error="createEntityError"
      :create-entity-success="createEntitySuccess"
      :entity-options="entityOptions"
      :map-options="mapOptions"
      @close="closePinEditor"
      @save="savePin"
      @create-article="createArticleFromPin"
      @upload-image="uploadPinImage"
    />

    <MapImageOverlayEditor
      :open="showImageOverlayEditor"
      :editing-overlay="editingImageOverlay"
      :world-id="worldId"
      :saving-overlay="savingImageOverlay"
      :save-error="imageOverlaySaveError"
      @close="closeImageOverlayEditor"
      @save="saveImageOverlay"
      @remove="removeImageOverlay"
    />

  </div>
</template>
