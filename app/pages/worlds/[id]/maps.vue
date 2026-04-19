<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const {
  data: maps,
  refresh: refreshMaps
} = await useFetch(() => `/api/worlds/${worldId.value}/maps`, {
  default: () => []
})

const search = ref('')
const showUploadForm = ref(false)

const uploadTitle = ref('')
const uploadType = ref<'world' | 'country' | 'area' | 'detail'>('area')
const uploadFile = ref<File | null>(null)
const uploadBusy = ref(false)
const uploadError = ref('')
const uploadSuccess = ref('')

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
    const form = new FormData()
    form.append('title', uploadTitle.value.trim())
    form.append('type', uploadType.value)
    form.append('file', uploadFile.value)

    await $fetch(`/api/worlds/${worldId.value}/maps/upload`, {
      method: 'POST',
      body: form
    })

    uploadTitle.value = ''
    uploadType.value = 'area'
    uploadFile.value = null
    showUploadForm.value = false
    uploadSuccess.value = 'Map uploaded successfully.'
    await refreshMaps()
  } catch (error: any) {
    uploadError.value = error?.data?.statusMessage || error?.message || 'Upload failed.'
  } finally {
    uploadBusy.value = false
  }
}

async function setAsWorldMap(mapId: string) {
  uploadError.value = ''
  uploadSuccess.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/maps/${mapId}/set-default`, {
      method: 'POST'
    })
    uploadSuccess.value = 'Default world map updated.'
    await refreshMaps()
  } catch (error: any) {
    uploadError.value = error?.data?.statusMessage || error?.message || 'Could not set default world map.'
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-[#09111a] p-8">
    <div class="mx-auto max-w-7xl">
      <div class="flex items-start justify-between gap-6">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
            {{ world?.name || 'World' }}
          </div>
          <h1 class="mt-3 text-4xl font-semibold tracking-tight text-white">
            Maps
          </h1>
          <p class="mt-3 max-w-2xl text-base leading-7 text-slate-400">
            Upload and organize your world, country, area, and detail maps. One map can be designated
            as the default world map.
          </p>
        </div>

        <div v-if="mode === 'build'" class="flex gap-3">
          <button
            type="button"
            class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
            @click="showUploadForm = !showUploadForm"
          >
            {{ showUploadForm ? 'Close Upload' : 'Upload Map' }}
          </button>
        </div>
      </div>

      <div class="mt-4 space-y-2">
        <div v-if="uploadSuccess" class="text-sm text-emerald-300">
          {{ uploadSuccess }}
        </div>
        <div v-if="uploadError" class="text-sm text-red-300">
          {{ uploadError }}
        </div>
      </div>

      <div class="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section class="space-y-6">
          <div class="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <div class="relative">
              <UIcon
                name="i-lucide-search"
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              />
              <input
                v-model="search"
                type="text"
                placeholder="Search maps..."
                class="w-full rounded-2xl border border-white/10 bg-transparent py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/25"
              >
            </div>
          </div>

          <section
            v-if="showUploadForm && mode === 'build'"
            class="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"
          >
            <div class="flex items-center justify-between">
              <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
                Upload Map
              </div>
              <UIcon name="i-lucide-upload" class="h-4 w-4 text-slate-500" />
            </div>

            <div class="mt-5 space-y-4">
              <div>
                <label class="mb-2 block text-sm text-slate-300">Map Title</label>
                <input
                  v-model="uploadTitle"
                  type="text"
                  placeholder="Varin World Map"
                  class="w-full rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/25"
                >
              </div>

              <div>
                <label class="mb-2 block text-sm text-slate-300">Map Type</label>
                <select
                  v-model="uploadType"
                  class="w-full rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none focus:border-sky-300/25"
                >
                  <option value="world">World</option>
                  <option value="country">Country</option>
                  <option value="area">Area</option>
                  <option value="detail">Detail</option>
                </select>
              </div>

              <div>
                <label class="mb-2 block text-sm text-slate-300">Map File</label>
                <input
                  type="file"
                  accept="image/*"
                  class="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/[0.12]"
                  @change="onFileChange"
                >
                <div v-if="uploadFile" class="mt-2 text-xs text-slate-500">
                  Selected: {{ uploadFile.name }}
                </div>
              </div>

              <button
                type="button"
                class="w-full rounded-2xl border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/15 disabled:opacity-50"
                :disabled="uploadBusy"
                @click="uploadMap"
              >
                {{ uploadBusy ? 'Uploading...' : 'Add Map' }}
              </button>
            </div>
          </section>

          <section class="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              Notes
            </div>

            <ul class="mt-4 space-y-3 text-sm leading-7 text-slate-400">
              <li>Only one map can be marked as the default world map.</li>
              <li>Nested maps will be linkable later.</li>
              <li>Pin placement and article linking will be editable in Build mode.</li>
            </ul>
          </section>
        </section>

        <section>
          <div v-if="filteredMaps.length" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <article
              v-for="map in filteredMaps"
              :key="map.id"
              class="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]"
            >
              <div class="relative h-56 overflow-hidden bg-[#0b1220]">
                <img :src="map.imageUrl" :alt="map.title" class="h-full w-full object-cover">

                <div v-if="map.isDefaultWorldMap" class="absolute left-3 top-3">
                  <div class="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-sky-100 backdrop-blur">
                    Default World Map
                  </div>
                </div>
              </div>

              <div class="p-5">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
                      {{ map.type }}
                    </div>
                    <div class="mt-2 text-2xl font-semibold text-white">
                      {{ map.title }}
                    </div>
                  </div>

                  <button
                    v-if="mode === 'build'"
                    type="button"
                    class="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                    title="Edit map"
                  >
                    <UIcon name="i-lucide-pencil" class="h-4 w-4" />
                  </button>
                </div>

                <div class="mt-5 flex flex-wrap gap-3">
                  <NuxtLink
                    :to="`/worlds/${worldId}?map=${map.slug}`"
                    class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    Open Map
                  </NuxtLink>

                  <button
                    v-if="mode === 'build' && !map.isDefaultWorldMap"
                    type="button"
                    class="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/15"
                    @click="setAsWorldMap(map.id)"
                  >
                    Set as World Map
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div
            v-else
            class="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-10 text-center"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              No Maps
            </div>
            <div class="mt-3 text-lg text-slate-300">
              Upload your first map in Build mode.
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
