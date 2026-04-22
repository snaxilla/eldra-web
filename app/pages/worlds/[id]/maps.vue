<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

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
  }
}

async function loadMaps() {
  mapsLoading.value = true
  try {
    const result = await $fetch<any[]>(`/api/worlds/${worldId.value}/maps`, {
      query: { t: Date.now() }
    })
    maps.value = Array.isArray(result) ? result.map(normalizeMap) : []
  } catch (error) {
    console.error('Failed to load maps', error)
    maps.value = []
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
const uploadBusy = ref(false)
const uploadError = ref('')
const uploadSuccess = ref('')

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

    await $fetch(`/api/worlds/${worldId.value}/maps/upload`, {
      method: 'POST',
      body: formData
    })

    uploadTitle.value = ''
    uploadType.value = 'area'
    uploadFile.value = null
    uploadSuccess.value = 'Map uploaded.'
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
      title?: string | null
      raw?: any
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

    parentSaveMsg.value[mapId] = 'Parent saved.'
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
  <div class="h-full overflow-y-auto bg-[#09111a]">
    <div class="mx-auto max-w-[1700px] space-y-6 p-6">
      <section class="rounded-[24px] border border-white/10 bg-[rgba(8,16,27,0.78)] p-6 shadow-xl">
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Maps</div>
            <h1 class="mt-2 text-3xl font-semibold text-white">{{ world?.name || 'World' }}</h1>
            <p class="mt-2 text-sm text-slate-400">
              Manage map uploads, default world map, and parent-child map hierarchy.
            </p>
          </div>

          <div class="flex gap-3">
            <input
              v-model="search"
              type="text"
              placeholder="Search maps..."
              class="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
            >
            <button
              type="button"
              class="rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
              @click="showUploadForm = !showUploadForm"
            >
              {{ showUploadForm ? 'Close Upload' : 'Upload Map' }}
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="showUploadForm"
        class="rounded-[24px] border border-white/10 bg-[rgba(8,16,27,0.78)] p-6 shadow-xl"
      >
        <div class="mb-4 text-lg font-semibold text-white">Upload New Map</div>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Title</label>
            <input
              v-model="uploadTitle"
              type="text"
              placeholder="e.g. Lorix Crater"
              class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
            >
          </div>

          <div>
            <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Type</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in MAP_TYPE_OPTIONS"
                :key="opt.value"
                type="button"
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                :class="uploadType === opt.value
                  ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                @click="uploadType = opt.value as any"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div class="md:col-span-2">
            <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Image</label>
            <input
              type="file"
              accept="image/*"
              class="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
              @change="onFileChange"
            >
          </div>
        </div>

        <div v-if="uploadError" class="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {{ uploadError }}
        </div>

        <div v-if="uploadSuccess" class="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {{ uploadSuccess }}
        </div>

        <div class="mt-5 flex justify-end">
          <button
            type="button"
            class="rounded-xl border border-sky-400/25 bg-sky-400/15 px-5 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-400/25 disabled:opacity-50"
            :disabled="uploadBusy"
            @click="uploadMap"
          >
            {{ uploadBusy ? 'Uploading…' : 'Upload Map' }}
          </button>
        </div>
      </section>

      <section v-if="mapsLoading" class="rounded-[24px] border border-white/10 bg-[rgba(8,16,27,0.78)] p-6 text-slate-400 shadow-xl">
        Loading maps...
      </section>

      <section v-else class="grid gap-5 lg:grid-cols-2">
        <article
          v-for="map in filteredMaps"
          :key="map.id"
          class="overflow-hidden rounded-[24px] border border-white/10 bg-[rgba(8,16,27,0.78)] shadow-xl"
        >
          <div v-if="map.imageUrl" class="aspect-[16/8] overflow-hidden border-b border-white/10 bg-black/20">
            <img :src="map.imageUrl" :alt="map.title" class="h-full w-full object-cover">
          </div>

          <div class="p-5">
            <div class="flex flex-wrap items-center gap-2">
              <div class="text-xl font-semibold text-white">{{ map.title }}</div>

              <span
                v-if="map.isDefaultWorldMap"
                class="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-200"
              >
                World Map
              </span>

              <span class="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-slate-300">
                {{ formatMapType(map.type) }}
              </span>
            </div>

            <div class="mt-4 grid gap-4">
              <div>
                <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">Parent Map</label>
                <select
                  v-model="parentDrafts[map.id]"
                  class="w-full rounded-xl border border-white/10 bg-[rgba(15,23,42,0.92)] px-4 py-3 text-sm text-slate-100 outline-none"
                >
                  <option :value="null" class="bg-slate-900 text-slate-100">No parent (root-level map)</option>
                  <option
                    v-for="option in parentOptionsFor(map.id)"
                    :key="option.id"
                    :value="option.id"
                    class="bg-slate-900 text-slate-100"
                  >
                    {{ option.title }}
                  </option>
                </select>

                <div class="mt-2 text-xs text-slate-500">
                  Current Parent: {{ parentTitle(map) }}
                </div>

                <div v-if="parentSaveMsg[map.id]" class="mt-1 text-xs text-slate-400">
                  {{ parentSaveMsg[map.id] }}
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <NuxtLink
                  :to="`/worlds/${worldId}?map=${map.slug}`"
                  class="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                >
                  Open Map
                </NuxtLink>

                <button
                  type="button"
                  class="rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-2 text-sm text-violet-100 transition hover:bg-violet-400/20 disabled:opacity-50"
                  :disabled="parentSaveBusy[map.id]"
                  @click="saveParentMap(map.id)"
                >
                  {{ parentSaveBusy[map.id] ? 'Saving…' : 'Save Parent' }}
                </button>

                <button
                  v-if="!map.isDefaultWorldMap"
                  type="button"
                  class="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/20"
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
