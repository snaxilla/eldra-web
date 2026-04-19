<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const selectedMapSlug = computed(() => String(route.query.map || ''))

const rightCollapsed = ref(false)
const canSeeDm = ref(true)
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: maps } = await useFetch(() => `/api/worlds/${worldId.value}/maps`, {
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

const pins = ref([
  {
    id: 'bend-pluris-river',
    title: 'Bend in the Pluris River',
    x: 44,
    y: 44,
    color: '#ef4444',
    icon: 'i-lucide-map-pin',
    summary:
      'The Pluris River, long and mighty, has many legends and ballads told across Varin. Many old tales warn about what waits in the deeper waters and the forgotten woods nearby.',
    image: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=900&q=80',
    articleTo: `/worlds/${worldId.value}/entities/1`,
    dm: {
      enemies: [
        { name: 'Bullywog', image: 'https://i.imgur.com/h7X9bKx.png' },
        { name: 'Water Hag', image: 'https://i.imgur.com/Fi0Tj6j.png' }
      ],
      items: [
        { name: 'Broken Staff of Yeir', image: 'https://i.imgur.com/t3i1YF9.png' }
      ],
      npcs: [
        { name: 'Dolores', image: 'https://i.imgur.com/h8h2K8B.png' }
      ]
    }
  }
])

const selectedPinId = ref<string | null>(pins.value[0]?.id || null)

const selectedPin = computed(() => {
  return pins.value.find((pin) => pin.id === selectedPinId.value) || null
})

const contentGridStyle = computed(() => {
  const right = rightCollapsed.value ? '52px' : '380px'
  return {
    gridTemplateColumns: `minmax(0,1fr) ${right}`
  }
})
</script>

<template>
  <div class="h-full w-full overflow-hidden bg-[#050913]">
    <div class="grid h-full" :style="contentGridStyle">
      <section class="relative min-w-0 bg-[#09111a]">
        <div class="absolute left-4 top-4 z-20">
          <NuxtLink
            to="/"
            class="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[rgba(8,16,27,0.9)] px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-[rgba(8,16,27,1)]"
          >
            <UIcon name="i-lucide-orbit" class="h-4 w-4 text-sky-300" />
            <span>{{ world?.name || 'World' }}</span>
          </NuxtLink>
        </div>

        <div v-if="mapImageUrl">
          <WorldMapStage
            :map-image-url="mapImageUrl"
            :pins="pins"
            :selected-pin-id="selectedPinId"
            @select-pin="selectedPinId = $event"
          />
        </div>

        <div v-else class="flex h-full items-center justify-center">
          <div class="text-center">
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">No Map Selected</div>
            <div class="mt-3 text-lg text-slate-300">Upload a map and set one as the default world map.</div>
          </div>
        </div>
      </section>

      <WorldArticlePanel
        :world-name="world?.name || 'World'"
        :selected-pin="selectedPin"
        :mode="mode"
        :collapsed="rightCollapsed"
        :can-see-dm="canSeeDm"
        @toggle-collapse="rightCollapsed = !rightCollapsed"
      />
    </div>
  </div>
</template>
