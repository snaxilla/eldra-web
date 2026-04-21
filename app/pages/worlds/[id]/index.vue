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

const activeMap = computed(() => {
  const list = maps.value || []
  if (selectedMapSlug.value) {
    const bySlug = list.find((m: any) => String(m.slug || '') === selectedMapSlug.value)
    if (bySlug) return bySlug
  }
  return list.find((m: any) => m.isDefaultWorldMap) || list[0] || null
})

const mapImageUrl = computed(() => activeMap.value?.imageUrl || '')

// ─── Pins ───────────────────────────────────────────────────────────────────
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

watch(() => activeMap.value?.id, (id) => {
  if (id) fetchPins()
}, { immediate: true })

// ─── Pin Editor ──────────────────────────────────────────────────────────────
const showPinEditor = ref(false)
const editingPin = ref<{ id?: string; title: string; x: number; y: number; color: string; pinType: string } | null>(null)
const savingPin = ref(false)

function onMapClick(coords: { x: number; y: number }) {
  if (mode.value !== 'build') return
  editingPin.value = {
    title: '',
    x: coords.x,
    y: coords.y,
    color: '#3b82f6',
    pinType: 'location',
  }
  showPinEditor.value = true
}

function selectPin(id: string) {
  selectedPinId.value = selectedPinId.value === id ? null : id
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
        }
      })
      const idx = pins.value.findIndex((p) => p.id === editingPin.value!.id)
      if (idx !== -1) pins.value[idx] = updated
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
        }
      })
      pins.value.push(created)
    }

    showPinEditor.value = false
    editingPin.value = null
  } catch (e) {
    console.error('Failed to save pin', e)
  } finally {
    savingPin.value = false
  }
}

function editPin(pin: any) {
  editingPin.value = {
    id: pin.id,
    title: pin.title,
    x: pin.x,
    y: pin.y,
    color: pin.color || '#3b82f6',
    pinType: pin.pinType || 'location',
  }
  showPinEditor.value = true
}

async function deletePin(pinId: string) {
  try {
    await $fetch(`/api/map-pins/${pinId}`, { method: 'DELETE' })
    pins.value = pins.value.filter((p) => p.id !== pinId)
    if (selectedPinId.value === pinId) selectedPinId.value = null
  } catch (e) {
    console.error('Failed to delete pin', e)
  }
}

const selectedPin = computed(() => pins.value.find((p) => p.id === selectedPinId.value) || null)

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
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-[#09111a]">

    <!-- Top bar -->
    <div class="absolute left-4 top-4 z-20 flex items-center gap-3 pointer-events-none">
      <div class="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(8,16,27,0.9)] px-4 py-2 text-sm font-semibold text-white backdrop-blur">
        <UIcon name="i-lucide-orbit" class="h-4 w-4 text-sky-300" />
        <span>{{ world?.name || 'World' }}</span>
      </div>
      <div v-if="activeMap" class="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(8,16,27,0.9)] px-4 py-2 text-sm text-slate-200 backdrop-blur">
        <UIcon name="i-lucide-map" class="h-4 w-4 text-sky-300" />
        <span>{{ activeMap.title }}</span>
      </div>
    </div>

    <!-- Build mode badge -->
    <div
      v-if="mode === 'build'"
      class="pointer-events-none absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-200 backdrop-blur"
    >
      <UIcon name="i-lucide-pencil-ruler" class="h-4 w-4" />
      Build Mode — click map to place pin
    </div>

    <!-- Map -->
    <div v-if="mapImageUrl" class="absolute inset-0">
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

    <!-- Selected pin info panel (play mode) -->
    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="selectedPin && mode === 'play'"
        class="absolute bottom-6 right-6 z-20 w-72 rounded-[20px] border border-white/12 bg-[rgba(8,16,27,0.95)] p-5 shadow-2xl backdrop-blur"
      >
        <div class="mb-1 text-xs uppercase tracking-[0.3em] text-slate-500">{{ selectedPin.pinType || 'Location' }}</div>
        <div class="text-xl font-semibold text-white">{{ selectedPin.title }}</div>
        <button
          class="mt-3 text-xs text-slate-400 transition hover:text-white"
          @click="selectedPinId = null"
        >
          Dismiss
        </button>
      </div>
    </Transition>

    <!-- Selected pin build actions -->
    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="selectedPin && mode === 'build'"
        class="absolute bottom-6 right-6 z-20 w-72 rounded-[20px] border border-amber-300/20 bg-[rgba(8,16,27,0.95)] p-5 shadow-2xl backdrop-blur"
      >
        <div class="mb-1 text-xs uppercase tracking-[0.3em] text-amber-400/70">{{ selectedPin.pinType || 'Location' }}</div>
        <div class="text-xl font-semibold text-white">{{ selectedPin.title }}</div>
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

    <!-- Pin Editor Drawer -->
    <Transition enter-from-class="translate-y-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-y-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="showPinEditor && editingPin"
        class="absolute bottom-0 inset-x-0 z-30 mx-auto max-w-lg rounded-t-[24px] border-t border-white/12 bg-[rgba(8,16,27,0.98)] p-6 shadow-2xl backdrop-blur"
      >
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">
            {{ editingPin.id ? 'Edit Pin' : 'Place Pin' }}
          </h3>
          <button class="text-slate-400 transition hover:text-white" @click="showPinEditor = false; editingPin = null">
            <UIcon name="i-lucide-x" class="h-5 w-5" />
          </button>
        </div>

        <div class="space-y-4">
          <!-- Title -->
          <div>
            <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Title</label>
            <input
              v-model="editingPin.title"
              type="text"
              placeholder="e.g. Stonehold"
              class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/40 focus:bg-white/[0.08]"
            >
          </div>

          <!-- Pin Type -->
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

          <!-- Color -->
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

          <!-- Coords (read-only display) -->
          <div class="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2 text-xs text-slate-500">
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
