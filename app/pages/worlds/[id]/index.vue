<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const selectedMapSlug = computed(() => String(route.query.map || ''))

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')
const showPins = useState<boolean>('world-map-show-pins', () => true)

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
const selectedPinId = ref<string | null>(null)

watch(showPins, (value) => {
  if (!value) {
    selectedPinId.value = null
  }
})
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

const PIN_TYPE_OPTIONS = [
  { label: 'Location', value: 'location' },
  { label: 'Village', value: 'village' },
  { label: 'Town', value: 'town' },
  { label: 'City', value: 'city' },
  { label: 'Capital', value: 'capital' },
  { label: 'Fortress', value: 'fortress' },
  { label: 'Outpost', value: 'outpost' },
  { label: 'Region', value: 'region' },
  { label: 'Wilderness', value: 'wilderness' },
  { label: 'Dungeon', value: 'dungeon' },
  { label: 'Ruin', value: 'ruin' },
  { label: 'Cave', value: 'cave' },
  { label: 'Temple', value: 'temple' },
  { label: 'Landmark', value: 'landmark' },
  { label: 'District', value: 'district' },
  { label: 'Building', value: 'building' },
  { label: 'Shop', value: 'shop' },
  { label: 'Tavern', value: 'tavern' },
  { label: 'Guildhall', value: 'guildhall' },
  { label: 'Residence', value: 'residence' },
  { label: 'Point of Interest', value: 'point_of_interest' }
]

const PIN_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

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

    <div class="absolute left-4 top-4 z-20 flex items-center gap-2">
      <button
        type="button"
        class="eldra-button inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold backdrop-blur"
        @click="goToWorldRootMap"
      >
        <UIcon name="i-lucide-orbit" class="h-4 w-4 text-[#f5e7bd]" />
        <span>World Map</span>
      </button>

      <button
        v-for="ancestor in ancestorMaps"
        :key="ancestor.id"
        type="button"
        class="eldra-button inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm text-[#e8d9b5] backdrop-blur"
        @click="goToMapBySlug(ancestor.slug)"
      >
        <UIcon name="i-lucide-chevron-right" class="h-4 w-4 text-[#9f9278]" />
        <span>{{ ancestor.title }}</span>
      </button>

      <div
        v-if="activeMap && String(activeMap.id) !== String(worldRootMap?.id || '')"
        class="eldra-button inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold text-[#fff7df] backdrop-blur"
      >
        <UIcon name="i-lucide-map" class="h-4 w-4 text-[#f5e7bd]" />
        <span>{{ activeMap.title }}</span>
      </div>
    </div>

    <div
      v-if="mode === 'build'"
      class="pointer-events-none absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.38)] bg-[rgba(20,17,12,0.82)] px-4 py-2 text-sm font-medium text-[#f5e7bd] backdrop-blur shadow-[0_0_24px_rgba(201,164,90,0.12)]"
    >
      <UIcon name="i-lucide-pencil-ruler" class="h-4 w-4" />
      Build Mode — click map to place pin
    </div>

    <div v-if="mapImageUrl" class="absolute inset-0 z-0">
      <WorldMapLeaflet
        :key="`${worldId}-${selectedMapSlug}-${mapImageUrl}`"
        :map-image-url="mapImageUrl"
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

    <WorldEntityContextDrawer
      :open="Boolean(selectedPin && mode === 'play')"
      :entity="selectedPinContextEntity"
      :world-id="worldId"
      :mode="mode"
      :allow-build-actions="false"
      @close="closeSelectedPinContext"
      @open-map="openSelectedPinContextMap"
    />

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="selectedPin && mode === 'build' && !showPinEditor"
        class="eldra-ornate-panel eldra-frame-corners fixed bottom-6 right-6 z-30 w-80 rounded-none border p-5 backdrop-blur"
      >
        <div class="mb-1 text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          {{ formatLocationType(selectedPin.pinType) || 'Location' }}
        </div>

        <div class="text-xl font-semibold text-white">
          {{ selectedPin.resolvedTitle }}
        </div>

        <div class="mt-2 text-sm text-[#9f9278]">
          Icon: {{ iconLabel(selectedPin.icon) }}
        </div>

        <div class="mt-4 flex gap-2">
          <button
            class="eldra-button flex-1 rounded-none px-3 py-2 text-sm"
            @click="editPin(selectedPin)"
          >
            Edit
          </button>

          <button
            class="rounded-none border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20"
            @click="deletePin(selectedPin.id)"
          >
            Delete
          </button>
        </div>
      </div>
    </Transition>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="showPinEditor && editingPin"
        class="eldra-ornate-panel eldra-frame-corners fixed right-0 top-0 z-40 h-full w-[420px] border-l backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Build Mode</div>
              <h3 class="mt-1 text-lg font-semibold text-white">
                {{ editingPin.id ? 'Edit Pin' : 'Place Pin' }}
              </h3>
            </div>

            <button
              class="text-[#9f9278] transition hover:text-white"
              @click="closePinEditor"
            >
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="space-y-5">
              <div v-if="saveError" class="rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ saveError }}
              </div>

              <div v-if="createEntityError" class="rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ createEntityError }}
              </div>

              <div v-if="createEntitySuccess" class="rounded-none border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {{ createEntitySuccess }}
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Title</label>
                <input
                  v-model="editingPin.title"
                  type="text"
                  placeholder="e.g. Stonehold"
                  class="eldra-input w-full rounded-none px-4 py-2.5 text-sm placeholder-[#756a57]"
                >
              </div>

                <div>
                  <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Type</label>
                  <select
                    v-model="editingPin.pinType"
                    class="eldra-input w-full rounded-none px-4 py-2.5 text-sm text-[#f5e7bd]"
                  >
                    <option
                      v-for="opt in PIN_TYPE_OPTIONS"
                      :key="opt.value"
                      :value="opt.value"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Color</label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="c in PIN_COLORS"
                    :key="c"
                    type="button"
                    class="h-7 w-7 rounded-full border-2 transition"
                    :style="{ background: c, borderColor: editingPin.color === c ? 'white' : 'transparent' }"
                    @click="editingPin.color = c"
                  />
                </div>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Marker Style</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="opt in ICON_OPTIONS"
                    :key="opt.value"
                    type="button"
                    class="rounded-none border px-3 py-2 text-left transition"
                    :class="editingPin.icon === opt.value
                      ? 'border-[rgba(201,164,90,0.48)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]'
                      : 'border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)]'"
                    @click="editingPin.icon = opt.value"
                  >
                    <div class="text-lg leading-none">{{ opt.symbol }}</div>
                    <div class="mt-1 text-xs">{{ opt.label }}</div>
                  </button>
                </div>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Summary / Blurb</label>
                <WorldMentionAutocompleteTextarea
                  v-model="editingPin.summary"
                  :world-id="worldId"
                  rows="4"
                  textarea-class="eldra-input w-full rounded-none px-4 py-3 text-sm placeholder-[#756a57]"
                  placeholder="Short map preview summary. Type @ to mention a world entity..."
                />
              </div>

              <div>
                <div class="mb-1.5 flex items-center justify-between gap-3">
                  <label class="block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Link Existing Article</label>
                  <button
                    type="button"
                    class="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
                    :disabled="creatingEntity || !String(editingPin.title || '').trim()"
                    @click="createArticleFromPin"
                  >
                    {{ creatingEntity ? 'Creating…' : 'Create Article From Pin' }}
                  </button>
                </div>

                <select
                  v-model="editingPin.entityId"
                  class="eldra-input w-full rounded-none px-4 py-3 text-sm"
                >
                  <option :value="null" class="bg-slate-900 text-slate-100">No linked article (pin-only note)</option>
                  <option
                    v-for="entity in entityOptions"
                    :key="entity.value"
                    :value="entity.value"
                    class="bg-slate-900 text-slate-100"
                  >
                    {{ entity.label }} ({{ entity.type }})
                  </option>
                </select>

                <p class="mt-2 text-xs text-[#9f9278]">
                  Only map-relevant entity types are shown here.
                </p>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Link Destination Map</label>
                <select
                  v-model="editingPin.linkedMapId"
                  class="eldra-input w-full rounded-none px-4 py-3 text-sm"
                >
                  <option :value="null" class="bg-slate-900 text-slate-100">No linked map</option>
                  <option
                    v-for="mapOption in mapOptions"
                    :key="mapOption.id"
                    :value="mapOption.id"
                    class="bg-slate-900 text-slate-100"
                  >
                    {{ mapOption.title }}
                  </option>
                </select>

                <p class="mt-2 text-xs text-[#9f9278]">
                  Choose a destination map for drill-down navigation.
                </p>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Preview Image</label>

                <div
                  v-if="editingPin.imageUrl"
                  class="eldra-image-frame mb-3 overflow-hidden rounded-none border bg-black/20"
                >
                  <img
                    :src="editingPin.imageUrl"
                    alt="Pin preview"
                    class="h-40 w-full object-cover"
                  >
                </div>

                <input
                  type="file"
                  accept="image/*"
                  class="block w-full text-sm text-[#d8ceb8] file:mr-4 file:rounded-none file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/[0.12]"
                  @change="uploadPinImage"
                >
              </div>

              <div>
                <label class="flex items-start gap-3 text-sm text-[#d8ceb8]">
                  <input
                    v-model="editingPin.inheritFromEntity"
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 rounded border-white/10 bg-[rgba(20,17,12,0.72)]"
                  >
                  <span>Use linked article summary/image when pin fields are empty</span>
                </label>
              </div>

              <div class="eldra-codex-soft rounded-none px-4 py-2 text-xs text-[#9f9278]">
                x: {{ editingPin.x.toFixed(1) }} &nbsp; y: {{ editingPin.y.toFixed(1) }}
              </div>
            </div>
          </div>

          <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
            <div class="flex gap-3">
              <button
                type="button"
                class="eldra-button flex-1 rounded-none py-2.5 text-sm"
                @click="closePinEditor"
              >
                Cancel
              </button>

              <button
                type="button"
                class="eldra-button flex-1 rounded-none py-2.5 text-sm font-medium disabled:opacity-50"
                :disabled="!String(editingPin.title || '').trim() || savingPin"
                @click="savePin"
              >
                {{ savingPin ? 'Saving…' : (editingPin.id ? 'Update Pin' : 'Save Pin') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>
