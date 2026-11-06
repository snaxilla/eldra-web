<script setup lang="ts">
import { buildFileFromGallerySelection } from '~/lib/maps/gallery-selection'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

const maps = ref<any[]>([])
const mapsLoading = ref(false)
const mapsLoadError = ref('')

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
  }
}

async function loadMaps() {
  mapsLoading.value = true
  mapsLoadError.value = ''

  try {
    const result = await $fetch<any[]>(`/api/worlds/${worldId.value}/maps`, {
      query: { t: Date.now() }
    })
    maps.value = Array.isArray(result) ? result.map(normalizeMap) : []
  } catch (error: any) {
    console.error('Failed to load maps', error)
    maps.value = []
    mapsLoadError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load maps.'
  } finally {
    mapsLoading.value = false
  }
}

await loadMaps()

const MAP_TYPE_OPTIONS = [
  { label: 'World', value: 'world' },
  { label: 'Country', value: 'country' },
  { label: 'Area', value: 'area' },
  { label: 'Detail', value: 'detail' },
]

const search = ref('')
const showUploadForm = ref(false)

const uploadTitle = ref('')
const uploadType = ref<'world' | 'country' | 'area' | 'detail'>('area')
const uploadFile = ref<File | null>(null)
const generateTiles = ref(true)
const tileMaxZoom = ref(7)
const uploadBusy = ref(false)
const uploadError = ref('')
const uploadSuccess = ref('')

const mediaPickerOpen = ref(false)

const parentDrafts = ref<Record<string, string | null>>({})
const parentSaveBusy = ref<Record<string, boolean>>({})
const parentSaveMsg = ref<Record<string, string>>({})

watch(
  maps,
  (list) => {
    const next: Record<string, string | null> = {}
    for (const map of list || []) {
      next[String(map.id)] = map.parentMapId ? String(map.parentMapId) : null
    }
    parentDrafts.value = next
  },
  { immediate: true, deep: true }
)

const filteredMaps = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = maps.value || []

  if (!q) return list

  return list.filter((map: any) =>
    String(map.title || '').toLowerCase().includes(q) ||
    String(map.type || '').toLowerCase().includes(q)
  )
})

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  uploadFile.value = target.files?.[0] || null
}

// Area 1 (Media Gallery): WorldMediaPicker's established selection
// contract is {id, title, filename, type, filesize, url, ...} (see
// app/components/world/map/MapImageOverlayEditor.vue for the other MAP
// consumer of this same component). The upload endpoint already accepts
// a raw File in FormData, and Area 3's fix makes that path safe for large
// files, so a gallery pick is fetched client-side and repackaged as a
// File through the SAME uploadMap() flow -- no server contract change.
// The translation itself lives in app/lib/maps/gallery-selection.ts so it
// is unit-testable without mounting this page.
async function selectGalleryImage(file: any) {
  uploadError.value = ''

  const result = await buildFileFromGallerySelection(file, (url) => $fetch<Blob>(url, { responseType: 'blob' }))

  if (!result.ok) {
    uploadError.value = result.error
    return
  }

  uploadFile.value = result.file
  if (!uploadTitle.value.trim() && result.title) {
    uploadTitle.value = result.title
  }
}

function formatMapType(value: string | null | undefined) {
  const raw = String(value || '').toLowerCase()
  const match = MAP_TYPE_OPTIONS.find((opt) => opt.value === raw)
  return match?.label || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Unknown')
}

function parentTitle(map: any) {
  const parentId = map?.parentMapId ? String(map.parentMapId) : null
  if (!parentId) return 'No parent'
  const found = (maps.value || []).find((m: any) => String(m.id) === parentId)
  return found?.title || `Unknown (${parentId})`
}

async function uploadMap() {
  uploadError.value = ''
  uploadSuccess.value = ''

  if (!uploadTitle.value.trim()) {
    uploadError.value = 'Map title is required.'
    return
  }

  if (!uploadFile.value) {
    uploadError.value = 'Please choose a map image.'
    return
  }

  uploadBusy.value = true

  try {
    const formData = new FormData()
    formData.append('title', uploadTitle.value.trim())
    formData.append('type', uploadType.value)
    formData.append('file', uploadFile.value)
    formData.append('generateTiles', generateTiles.value ? 'true' : 'false')
    formData.append('tileMaxZoom', String(tileMaxZoom.value || 7))

    await $fetch(`/api/worlds/${worldId.value}/maps/upload`, {
      method: 'POST',
      body: formData
    })

    uploadTitle.value = ''
    uploadType.value = 'area'
    uploadFile.value = null
    uploadSuccess.value = generateTiles.value ? 'Map uploaded and tiled.' : 'Map uploaded.'
    showUploadForm.value = false

    await loadMaps()
  } catch (error: any) {
    uploadError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Upload failed.'
  } finally {
    uploadBusy.value = false
  }
}

async function setAsWorldMap(mapId: string) {
  try {
    await $fetch(`/api/worlds/${worldId.value}/maps/${mapId}/set-default`, {
      method: 'POST'
    })
    await loadMaps()
  } catch (error) {
    console.error('Failed to set default world map', error)
  }
}

async function saveParentMap(mapId: string) {
  parentSaveMsg.value[mapId] = ''
  parentSaveBusy.value[mapId] = true

  try {
    const result = await $fetch<{
      success: boolean
      mapId: string
      parentMapId?: string | null
      parent_map_id?: string | null
    }>(`/api/worlds/${worldId.value}/maps/${mapId}/set-parent`, {
      method: 'POST',
      body: {
        parentMapId: parentDrafts.value[mapId] || null
      }
    })

    const persistedParentId =
      result?.parentMapId !== undefined
        ? (result.parentMapId ? String(result.parentMapId) : null)
        : result?.parent_map_id
          ? String(result.parent_map_id)
          : null

    parentDrafts.value[mapId] = persistedParentId

    const target = (maps.value || []).find((m: any) => String(m.id) === String(mapId))
    if (target) {
      target.parentMapId = persistedParentId
    }

    parentSaveMsg.value[mapId] = `Parent saved. Persisted: ${persistedParentId || 'null'}`
    await loadMaps()
  } catch (error: any) {
    parentSaveMsg.value[mapId] =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to save parent.'
  } finally {
    parentSaveBusy.value[mapId] = false
  }
}

function parentOptionsFor(mapId: string) {
  return (maps.value || [])
    .filter((m: any) => String(m.id) !== String(mapId))
    .sort((a: any, b: any) => String(a.title || '').localeCompare(String(b.title || '')))
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1700px] p-6">
      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-6 backdrop-blur-xl">
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Maps</div>
            <h1 class="mt-3 text-4xl font-semibold tracking-tight text-white">{{ world?.name || 'World' }}</h1>
            <p class="mt-2 max-w-3xl text-sm leading-7 text-[#d8ceb8]">
              Manage map uploads, the default world map, and parent-child map hierarchy.
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <input
              v-model="search"
              type="search"
              placeholder="Search maps..."
              class="eldra-input rounded-none px-4 py-3 text-sm"
            >
            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-semibold"
              @click="showUploadForm = !showUploadForm"
            >
              {{ showUploadForm ? 'Close Upload' : 'Upload Map' }}
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="mapsLoadError"
        class="mt-6 rounded-none border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-200"
      >
        {{ mapsLoadError }}
      </section>

      <section
        v-if="showUploadForm"
        class="eldra-ornate-panel eldra-frame-corners mt-6 rounded-none border p-6 backdrop-blur-xl"
      >
        <div class="mb-4 text-lg font-semibold text-white">Upload New Map</div>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Title</label>
            <input
              v-model="uploadTitle"
              type="text"
              placeholder="e.g. Lorix Crater"
              class="eldra-input w-full rounded-none px-4 py-3 text-sm"
            >
          </div>

          <div>
            <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Type</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in MAP_TYPE_OPTIONS"
                :key="opt.value"
                type="button"
                class="rounded-none border px-3 py-1.5 text-xs font-medium transition"
                :class="uploadType === opt.value
                  ? 'border-[rgba(201,164,90,0.45)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                  : 'border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.5)] text-[#9f9278] hover:bg-[rgba(201,164,90,0.08)]'"
                @click="uploadType = opt.value as any"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div class="md:col-span-2">
            <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Image</label>

            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="eldra-button rounded-none px-4 py-2.5 text-sm"
                @click="mediaPickerOpen = true"
              >
                Browse Media Gallery
              </button>

              <label class="cursor-pointer rounded-none border border-[rgba(201,164,90,0.24)] px-4 py-2.5 text-sm text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-white">
                Upload from Device
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="onFileChange"
                >
              </label>

              <span v-if="uploadFile" class="truncate text-sm text-[#d8ceb8]">
                Selected: {{ uploadFile.name }}
              </span>
            </div>
          </div>

          <div class="md:col-span-2 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.06)] p-4">
            <label class="flex items-start gap-3 text-sm text-[#d8ceb8]">
              <input
                v-model="generateTiles"
                type="checkbox"
                class="mt-1 h-4 w-4 accent-[#c9a45a]"
              >
              <span>
                <span class="block font-medium text-[#fff7df]">Generate zoom tiles</span>
                <span class="mt-1 block text-xs leading-5 text-[#9f9278]">
                  Best for huge world maps. Upload will take longer, but players load only visible map tiles instead of the full image.
                </span>
              </span>
            </label>

            <div v-if="generateTiles" class="mt-4 max-w-xs">
              <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Max Zoom</label>
              <input
                v-model.number="tileMaxZoom"
                type="number"
                min="0"
                max="10"
                class="eldra-input w-full rounded-none px-4 py-3 text-sm"
              >
            </div>
          </div>
        </div>

        <div v-if="uploadError" class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {{ uploadError }}
        </div>

        <div v-if="uploadSuccess" class="mt-4 rounded-none border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {{ uploadSuccess }}
        </div>

        <div class="mt-5 flex justify-end">
          <button
            type="button"
            class="eldra-button rounded-none px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            :disabled="uploadBusy"
            @click="uploadMap"
          >
            {{ uploadBusy ? 'Uploading…' : 'Upload Map' }}
          </button>
        </div>
      </section>

      <WorldMediaPicker
        v-model:open="mediaPickerOpen"
        :world-id="worldId"
        title="Choose Map Image"
        select-label="Use This Image"
        @select="selectGalleryImage"
      />

      <section
        v-if="mapsLoading"
        class="eldra-ornate-panel eldra-frame-corners mt-6 rounded-none border p-6 text-[#d8ceb8] backdrop-blur-xl"
      >
        Loading maps...
      </section>

      <section v-else class="mt-6 grid gap-5 lg:grid-cols-2">
        <article
          v-for="map in filteredMaps"
          :key="map.id"
          class="eldra-ornate-panel eldra-frame-corners overflow-hidden rounded-none border backdrop-blur-xl"
        >
          <div v-if="map.imageUrl" class="aspect-[16/8] overflow-hidden border-b border-[rgba(201,164,90,0.22)] bg-black/20">
            <img :src="map.imageUrl" :alt="map.title" class="h-full w-full object-cover">
          </div>

          <div class="p-5">
            <div class="flex flex-wrap items-center gap-2">
              <div class="text-xl font-semibold text-white">{{ map.title }}</div>

              <span
                v-if="map.isDefaultWorldMap"
                class="rounded-none border border-[rgba(201,164,90,0.3)] bg-[rgba(201,164,90,0.12)] px-2.5 py-1 text-xs text-[#fff7df]"
              >
                World Map
              </span>

              <span class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.5)] px-2.5 py-1 text-xs text-[#d8ceb8]">
                {{ formatMapType(map.type) }}
              </span>

              <span
                v-if="map.tileEnabled"
                class="rounded-none border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200"
              >
                Tiled {{ map.tileMinZoom }}-{{ map.tileMaxZoom }}
              </span>

              <span
                v-else-if="map.tileStatus && map.tileStatus !== 'none'"
                class="rounded-none border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-1 text-xs text-yellow-200"
              >
                Tiles: {{ map.tileStatus }}
              </span>
            </div>

            <div class="mt-4 grid gap-4">
              <div>
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Parent Map</label>
                <select
                  v-model="parentDrafts[map.id]"
                  class="eldra-input w-full rounded-none px-4 py-3 text-sm"
                >
                  <option :value="null" class="bg-[#090909]">No parent (root-level map)</option>
                  <option
                    v-for="option in parentOptionsFor(map.id)"
                    :key="option.id"
                    :value="option.id"
                    class="bg-[#090909]"
                  >
                    {{ option.title }}
                  </option>
                </select>

                <div class="mt-2 text-xs text-[#9f9278]">
                  Current Parent: {{ parentTitle(map) }}
                </div>

                <div v-if="parentSaveMsg[map.id]" class="mt-1 text-xs text-[#9f9278]">
                  {{ parentSaveMsg[map.id] }}
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <NuxtLink
                  :to="`/worlds/${worldId}?map=${map.slug}`"
                  class="eldra-button rounded-none px-4 py-2 text-sm"
                >
                  Open Map
                </NuxtLink>

                <button
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] px-4 py-2 text-sm text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-white disabled:opacity-50"
                  :disabled="parentSaveBusy[map.id]"
                  @click="saveParentMap(map.id)"
                >
                  {{ parentSaveBusy[map.id] ? 'Saving…' : 'Save Parent' }}
                </button>

                <button
                  v-if="!map.isDefaultWorldMap"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.3)] bg-[rgba(201,164,90,0.1)] px-4 py-2 text-sm text-[#fff7df] transition hover:bg-[rgba(201,164,90,0.2)]"
                  @click="setAsWorldMap(map.id)"
                >
                  Set as World Map
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>
