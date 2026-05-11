<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const selectedMapSlug = computed(() => String(route.query.map || ''))

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')
const showPins = useState<boolean>('world-map-show-pins', () => true)

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: worldEntities, refresh: refreshWorldEntities } = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
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
  { label: 'City', value: 'city' },
  { label: 'Dungeon', value: 'dungeon' },
  { label: 'Landmark', value: 'landmark' },
  { label: 'Region', value: 'region' },
  { label: 'Quest', value: 'quest' },
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
      }
    })

    editingPin.value.entityId = created.id
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

function openLinkedMap() {
  if (!selectedPin.value?.linkedMap?.slug) return
  router.push(`/worlds/${worldId.value}?map=${selectedPin.value.linkedMap.slug}`)
}
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-[#09111a]">

    <div class="absolute left-4 top-4 z-20 flex items-center gap-2">
      <button
        type="button"
        class="eldra-button eldra-frame-corners inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold backdrop-blur"
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
        class="eldra-button eldra-frame-corners inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold text-[#fff7df] backdrop-blur"
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
        <div class="text-xs uppercase tracking-[0.3em] text-slate-500">No Map Selected</div>
        <div class="mt-3 text-lg text-slate-300">Upload a map and set one as the default world map.</div>
      </div>
    </div>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="selectedPin && mode === 'play'"
        class="absolute right-0 top-0 z-30 h-full w-[380px] border-l border-white/10 bg-[rgba(8,16,27,0.96)] shadow-2xl backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-slate-500">
                {{ selectedPin.pinType || 'Location' }}
              </div>
              <div class="mt-1 text-xl font-semibold text-white">
                {{ selectedPin.resolvedTitle }}
              </div>
            </div>

            <button
              class="text-[#9f9278] transition hover:text-white"
              @click="selectedPinId = null"
            >
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            <div
              v-if="selectedPin.resolvedImageUrl"
              class="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-black/20"
            >
              <img
                :src="selectedPin.resolvedImageUrl"
                :alt="selectedPin.resolvedTitle"
                class="h-56 w-full object-cover"
              >
            </div>

            <p
              v-if="selectedPin.resolvedSummary"
              class="whitespace-pre-wrap text-sm leading-7 text-slate-300"
            >
              {{ selectedPin.resolvedSummary }}
            </p>

            <p
              v-else
              class="text-sm leading-7 text-slate-500"
            >
              No summary yet.
            </p>

            <div class="mt-6 flex flex-wrap gap-2">
              <div class="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-200">
                {{ iconLabel(selectedPin.icon) }}
              </div>

              <div
                v-if="selectedPin.hasLinkedEntity"
                class="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200"
              >
                Linked Article
              </div>

              <div
                v-if="selectedPin.hasLinkedMap"
                class="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs text-violet-200"
              >
                Linked Map
              </div>

              <div
                v-if="!selectedPin.hasLinkedEntity && !selectedPin.hasLinkedMap"
                class="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200"
              >
                Pin Note
              </div>
            </div>

            <div
              v-if="selectedPin.linkedMap"
              class="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Destination Map</div>
              <div class="mt-2 text-sm font-medium text-white">{{ selectedPin.linkedMap.title }}</div>
            </div>
          </div>

          <div class="border-t border-white/10 p-5">
            <div class="flex gap-3">
              <NuxtLink
                v-if="selectedPinReadMoreUrl"
                :to="selectedPinReadMoreUrl"
                class="flex-1 rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-center text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
              >
                Read More
              </NuxtLink>

              <button
                v-if="selectedPinMapUrl"
                type="button"
                class="flex-1 rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-center text-sm font-medium text-violet-100 transition hover:bg-violet-400/20"
                @click="openLinkedMap"
              >
                Open Map
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="selectedPin && mode === 'build' && !showPinEditor"
        class="absolute bottom-6 right-6 z-30 w-80 rounded-[20px] border border-amber-300/20 bg-[rgba(8,16,27,0.95)] p-5 shadow-2xl backdrop-blur"
      >
        <div class="mb-1 text-xs uppercase tracking-[0.3em] text-amber-400/70">
          {{ selectedPin.pinType || 'Location' }}
        </div>

        <div class="text-xl font-semibold text-white">
          {{ selectedPin.resolvedTitle }}
        </div>

        <div class="mt-2 text-sm text-[#9f9278]">
          Icon: {{ iconLabel(selectedPin.icon) }}
        </div>

        <div class="mt-4 flex gap-2">
          <button
            class="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200 transition hover:bg-white/[0.1]"
            @click="editPin(selectedPin)"
          >
            Edit
          </button>

          <button
            class="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20"
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
        class="absolute right-0 top-0 z-40 h-full w-[420px] border-l border-white/10 bg-[rgba(8,16,27,0.98)] shadow-2xl backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Build Mode</div>
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
              <div v-if="saveError" class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ saveError }}
              </div>

              <div v-if="createEntityError" class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ createEntityError }}
              </div>

              <div v-if="createEntitySuccess" class="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {{ createEntitySuccess }}
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Title</label>
                <input
                  v-model="editingPin.title"
                  type="text"
                  placeholder="e.g. Stonehold"
                  class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/40 focus:bg-white/[0.08]"
                >
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Type</label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="opt in PIN_TYPE_OPTIONS"
                    :key="opt.value"
                    type="button"
                    class="rounded-full border px-3 py-1 text-xs font-medium transition"
                    :class="editingPin.pinType === opt.value
                      ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                      : 'border-white/10 bg-white/[0.04] text-[#9f9278] hover:text-white'"
                    @click="editingPin.pinType = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Color</label>
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
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Marker Style</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="opt in ICON_OPTIONS"
                    :key="opt.value"
                    type="button"
                    class="rounded-xl border px-3 py-2 text-left transition"
                    :class="editingPin.icon === opt.value
                      ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                    @click="editingPin.icon = opt.value"
                  >
                    <div class="text-lg leading-none">{{ opt.symbol }}</div>
                    <div class="mt-1 text-xs">{{ opt.label }}</div>
                  </button>
                </div>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Summary / Blurb</label>
                <textarea
                  v-model="editingPin.summary"
                  rows="4"
                  placeholder="Short map preview summary..."
                  class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/40 focus:bg-white/[0.08]"
                />
              </div>

              <div>
                <div class="mb-1.5 flex items-center justify-between gap-3">
                  <label class="block text-xs uppercase tracking-[0.25em] text-slate-500">Link Existing Article</label>
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
                  class="w-full rounded-xl border border-white/10 bg-[rgba(15,23,42,0.92)] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/40 focus:bg-[rgba(15,23,42,1)]"
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

                <p class="mt-2 text-xs text-slate-500">
                  Only map-relevant entity types are shown here.
                </p>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Link Destination Map</label>
                <select
                  v-model="editingPin.linkedMapId"
                  class="w-full rounded-xl border border-white/10 bg-[rgba(15,23,42,0.92)] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-violet-400/40 focus:bg-[rgba(15,23,42,1)]"
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

                <p class="mt-2 text-xs text-slate-500">
                  Choose a destination map for drill-down navigation.
                </p>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Preview Image</label>

                <div
                  v-if="editingPin.imageUrl"
                  class="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20"
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
                  class="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/[0.12]"
                  @change="uploadPinImage"
                >
              </div>

              <div>
                <label class="flex items-start gap-3 text-sm text-slate-300">
                  <input
                    v-model="editingPin.inheritFromEntity"
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 rounded border-white/10 bg-white/[0.05]"
                  >
                  <span>Use linked article summary/image when pin fields are empty</span>
                </label>
              </div>

              <div class="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2 text-xs text-slate-500">
                x: {{ editingPin.x.toFixed(1) }} &nbsp; y: {{ editingPin.y.toFixed(1) }}
              </div>
            </div>
          </div>

          <div class="border-t border-white/10 p-5">
            <div class="flex gap-3">
              <button
                type="button"
                class="flex-1 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.08]"
                @click="closePinEditor"
              >
                Cancel
              </button>

              <button
                type="button"
                class="flex-1 rounded-xl border border-sky-400/25 bg-sky-400/15 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-400/25 disabled:opacity-50"
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
