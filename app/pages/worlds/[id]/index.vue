<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'
import MapBreadcrumbs from '~/components/world/map/MapBreadcrumbs.vue'
import MapBuildBanner from '~/components/world/map/MapBuildBanner.vue'
import MapLayerPanel from '~/components/world/map/MapLayerPanel.vue'
import MapSelectedPinCard from '~/components/world/map/MapSelectedPinCard.vue'
import MapPinEditor from '~/components/world/map/MapPinEditor.vue'

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const selectedMapSlug = computed(() => String(route.query.map || ''))

type SceneLayer = {
  id: string
  label: string
  visible: boolean
  locked?: boolean
  objects: LayerObject[]
}

type LayerObject = {
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

type LayerObjectGeometry = {
  type: string
  coordinates?: any
  [key: string]: any
}

type LayerObjectProperties = {
  [key: string]: any
}

type LayerObjectStyle = {
  [key: string]: any
}

type SceneModel = {
  id: string
  title: string
  layers: SceneLayer[]
}

type RenderSceneLayer = SceneLayer & {
  type?: string
}

type RenderSceneModel = {
  id: string
  title: string
  layers: RenderSceneLayer[]
}

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')
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

const renderScene = computed<RenderSceneModel>(() => {
  return {
    id: scene.value.id,
    title: scene.value.title,
    layers: scene.value.layers.map((layer) => {
      if (layer.id === 'pins') {
        return {
          ...layer,
          type: 'pins',
          objects: pinLayerObjects.value,
        }
      }

      return {
        ...layer,
      }
    }),
  }
})

const selectedPinId = ref<string | null>(null)

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
    if (id) fetchPins()
  },
  { immediate: true }
)

function selectPin(id: string) {
  selectedPinId.value = selectedPinId.value === id ? null : id
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

function openNewPinEditor(coords: { x: number; y: number }) {
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
  openNewPinEditor(coords)
}

function editPin(pin: any) {
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
    />

    <div v-if="mapImageUrl" class="absolute inset-0 z-0">
      <WorldMapLeaflet
        :key="`${worldId}-${selectedMapSlug}-${mapImageUrl}`"
        :map-image-url="mapImageUrl"
        :scene="renderScene"
        :tile-enabled="activeMap?.tileEnabled"
        :tile-path="activeMap?.tilePath"
        :tile-min-zoom="activeMap?.tileMinZoom"
        :tile-max-zoom="activeMap?.tileMaxZoom"
        :tile-original-width="activeMap?.tileOriginalWidth"
        :tile-original-height="activeMap?.tileOriginalHeight"
        :pins="visiblePins"
        :selected-pin-id="selectedPinId"
        :build-mode="mode === 'build'"
        @select-pin="selectPin"
        @map-click="onMapClick"
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
      @close="showLayerPanel = !showLayerPanel"
      @toggle-layer="toggleSceneLayer"
    />



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
      :open="Boolean(selectedPin && mode === 'build' && !showPinEditor)"
      :selected-pin="selectedPin"
      :format-location-type="formatLocationType"
      :icon-label="iconLabel"
      @edit="editPin(selectedPin)"
      @delete="deletePin(selectedPin.id)"
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

  </div>
</template>
