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

const pins = ref<any[]>([])
const selectedPinId = ref<string | null>(null)

function onMapClick(coords: { x: number; y: number }) {
  if (mode.value !== 'build') return
  console.log('map click coords:', coords)
}
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
      Build Mode — click map to inspect coords
    </div>

    <!-- Map viewport -->
    <div v-if="mapImageUrl" class="absolute inset-0 z-0">
      <WorldMapLeaflet
        :key="`${worldId}-${selectedMapSlug}-${mapImageUrl}`"
        :map-image-url="mapImageUrl"
        :pins="pins"
        :selected-pin-id="selectedPinId"
        :build-mode="mode === 'build'"
        @select-pin="selectedPinId = $event"
        @map-click="onMapClick"
      />
    </div>

    <div v-else class="flex h-full items-center justify-center">
      <div class="text-center">
        <div class="text-xs uppercase tracking-[0.3em] text-slate-500">No Map Selected</div>
        <div class="mt-3 text-lg text-slate-300">Upload a map and set one as the default world map.</div>
      </div>
    </div>

  </div>
</template>
