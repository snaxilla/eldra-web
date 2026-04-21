<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const selectedMapSlug = computed(() => String(route.query.map || ''))

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: maps } = await useFetch(() => `/api/map-data/world/${worldId.value}`, {
  default: () => []
})

const { data: worldEntities } = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
  default: () => []
})

const activeMap = computed(() => {
  const list = maps.value || []

  if (selectedMapSlug.value) {
    const bySlug = list.find((m: any) => String(m.slug || '') === selectedMapSlug.value)
    if (bySlug) return bySlug
  }

  return list.find((m: any) => m.isDefaultWorldMap) || list[0] || null
})

const mapImageUrl = computed(() => activeMap.value?.imageUrl || '')

// pins
const pins = ref<any[]>([])
const selectedPinId = ref<string | null>(null)
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

// selected pin
function selectPin(id: string) {
  selectedPinId.value = selectedPinId.value === id ? null : id
}

const selectedPin = computed(() => pins.value.find((p) => p.id === selectedPinId.value) || null)

const selectedPinReadMoreUrl = computed(() => {
  if (!selectedPin.value?.entity?.id) return null
  return `/worlds/${worldId.value}/entities/${selectedPin.value.entity.id}`
})

// editor
const showPinEditor = ref(false)
const savingPin = ref(false)

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

function onMapClick(coords: { x: number; y: number }) {
  if (mode.value !== 'build') return

  editingPin.value = {
    title: '',
    x: coords.x,
    y: coords.y,
    color: '#3b82f6',
    pinType: 'location',
    entityId: null,
    summary: '',
    image: null,
    imageUrl: null,
    inheritFromEntity: true,
  }

  showPinEditor.value = true
}

function editPin(pin: any) {
  editingPin.value = {
    id: pin.id,
    title: pin.title || '',
    x: pin.x,
    y: pin.y,
    color: pin.color || '#3b82f6',
    pinType: pin.pinType || 'location',
    entityId: pin.entityId || null,
    summary: pin.summary || '',
    image: pin.imageFileId || null,
    imageUrl: pin.imageUrl || null,
    inheritFromEntity: pin.inheritFromEntity !== false,
  }

  showPinEditor.value = true
}

async function savePin() {
  if (!editingPin.value || !activeMap.value?.id) return

  savingPin.value = true

  try {
    if (editingPin.value.id) {
      const updated = await $fetch(`/api/map-pins/${editingPin.value.id}`, {
        method: 'PATCH',
        body: {
          title: editingPin.value.title,
          x: editingPin.value.x,
          y: editingPin.value.y,
          color: editingPin.value.color,
          pinType: editingPin.value.pinType,
          entityId: editingPin.value.entityId,
          summary: editingPin.value.summary,
          image: editingPin.value.image,
          inheritFromEntity: editingPin.value.inheritFromEntity,
        }
      })

      const idx = pins.value.findIndex((p) => p.id === editingPin.value.id)
      if (idx !== -1) pins.value[idx] = updated
      selectedPinId.value = updated.id
    } else {
      const created = await $fetch('/api/map-pins', {
        method: 'POST',
        body: {
          mapId: activeMap.value.id,
          title: editingPin.value.title,
          x: editingPin.value.x,
          y: editingPin.value.y,
          color: editingPin.value.color,
          pinType: editingPin.value.pinType,
          entityId: editingPin.value.entityId,
          summary: editingPin.value.summary,
          image: editingPin.value.image,
          inheritFromEntity: editingPin.value.inheritFromEntity,
        }
      })

      pins.value.push(created)
      selectedPinId.value = created.id
    }

    showPinEditor.value = false
    editingPin.value = null
  } catch (e) {
    console.error('Failed to save pin', e)
  } finally {
    savingPin.value = false
  }
}

async function deletePin(pinId: string) {
  try {
    await $fetch(`/api/map-pins/${pinId}`, {
      method: 'DELETE'
    })

    pins.value = pins.value.filter((p) => p.id !== pinId)
    if (selectedPinId.value === pinId) selectedPinId.value = null
  } catch (e) {
    console.error('Failed to delete pin', e)
  }
}

async function uploadPinImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file || !editingPin.value) return

  const formData = new FormData()
  formData.append('file', file)

  try {
    const result = await $fetch<{ file_id: string; image_url: string }>('/api/map-pins/upload-image', {
      method: 'POST',
      body: formData
    })

    editingPin.value.image = result.file_id
    editingPin.value.imageUrl = result.image_url
  } catch (e) {
    console.error('Failed to upload pin image', e)
  }
}

const entityOptions = computed(() => {
  return (worldEntities.value || []).map((entity: any) => ({
    label: entity.title || `Entity ${entity.id}`,
    value: Number(entity.id),
    type: entity.entity_type || 'entity',
  }))
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-[#09111a]">

    <!-- Top chips -->
    <div class="absolute left-4 top-4 z-20 flex items-center gap-3">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(8,16,27,0.9)] px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-[rgba(8,16,27,1)]"
      >
        <UIcon name="i-lucide-orbit" class="h-4 w-4 text-sky-300" />
        <span>{{ world?.name || 'World' }}</span>
      </NuxtLink>

      <div
        v-if="activeMap"
        class="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(8,16,27,0.9)] px-4 py-2 text-sm text-slate-200 backdrop-blur"
      >
        <UIcon name="i-lucide-map" class="h-4 w-4 text-sky-300" />
        <span>{{ activeMap.title }}</span>
      </div>
    </div>

    <!-- Build badge -->
    <div
      v-if="mode === 'build'"
      class="pointer-events-none absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-200 backdrop-blur"
    >
      <UIcon name="i-lucide-pencil-ruler" class="h-4 w-4" />
      Build Mode — click map to place pin
    </div>

    <!-- Map -->
    <div v-if="mapImageUrl" class="absolute inset-0 z-0">
      <WorldMapLeaflet
        :key="`${worldId}-${selectedMapSlug}-${mapImageUrl}`"
        :map-image-url="mapImageUrl"
        :pins="pins"
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

    <!-- Play mode right sidebar -->
    <Transition
      enter-from-class="translate-x-full opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-x-full opacity-0"
      leave-active-class="transition duration-200"
    >
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
              class="text-slate-400 transition hover:text-white"
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
              <div
                v-if="selectedPin.hasLinkedEntity"
                class="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200"
              >
                Linked Article
              </div>

              <div
                v-else
                class="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200"
              >
                Pin Note
              </div>
            </div>
          </div>

          <div class="border-t border-white/10 p-5">
            <NuxtLink
              v-if="selectedPinReadMoreUrl"
              :to="selectedPinReadMoreUrl"
              class="block rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-center text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
            >
              Read More
            </NuxtLink>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Build mode selected pin actions -->
    <Transition
      enter-from-class="translate-x-full opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-x-full opacity-0"
      leave-active-class="transition duration-200"
    >
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

    <!-- Pin editor -->
    <Transition
      enter-from-class="translate-y-full opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-y-full opacity-0"
      leave-active-class="transition duration-200"
    >
      <div
        v-if="showPinEditor && editingPin"
        class="absolute bottom-0 inset-x-0 z-40 mx-auto max-w-2xl rounded-t-[24px] border-t border-white/12 bg-[rgba(8,16,27,0.98)] p-6 shadow-2xl backdrop-blur"
      >
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">
            {{ editingPin.id ? 'Edit Pin' : 'Place Pin' }}
          </h3>

          <button
            class="text-slate-400 transition hover:text-white"
            @click="showPinEditor = false; editingPin = null"
          >
            <UIcon name="i-lucide-x" class="h-5 w-5" />
          </button>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="md:col-span-2">
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
                  : 'border-white/10 bg-white/[0.04] text-slate-400 hover:text-white'"
                @click="editingPin.pinType = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div>
            <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Color</label>
            <div class="flex gap-2">
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

          <div class="md:col-span-2">
            <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Summary / Blurb</label>
            <textarea
              v-model="editingPin.summary"
              rows="4"
              placeholder="Short map preview summary..."
              class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/40 focus:bg-white/[0.08]"
            />
          </div>

          <div class="md:col-span-2">
            <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Link Existing Article</label>
            <select
              v-model="editingPin.entityId"
              class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/40 focus:bg-white/[0.08]"
            >
              <option :value="null">No linked article (pin-only note)</option>
              <option
                v-for="entity in entityOptions"
                :key="entity.value"
                :value="entity.value"
              >
                {{ entity.label }} ({{ entity.type }})
              </option>
            </select>
          </div>

          <div class="md:col-span-2">
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

          <div class="md:col-span-2">
            <label class="flex items-center gap-3 text-sm text-slate-300">
              <input
                v-model="editingPin.inheritFromEntity"
                type="checkbox"
                class="h-4 w-4 rounded border-white/10 bg-white/[0.05]"
              >
              <span>Use linked article summary/image when pin fields are empty</span>
            </label>
          </div>

          <div class="md:col-span-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2 text-xs text-slate-500">
            x: {{ editingPin.x.toFixed(1) }} &nbsp; y: {{ editingPin.y.toFixed(1) }}
          </div>
        </div>

        <div class="mt-5 flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.08]"
            @click="showPinEditor = false; editingPin = null"
          >
            Cancel
          </button>

          <button
            type="button"
            class="flex-1 rounded-xl border border-sky-400/25 bg-sky-400/15 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-400/25 disabled:opacity-50"
            :disabled="!editingPin.title.trim() || savingPin"
            @click="savePin"
          >
            {{ savingPin ? 'Saving…' : (editingPin.id ? 'Update Pin' : 'Save Pin') }}
          </button>
        </div>
      </div>
    </Transition>

  </div>
</template>
