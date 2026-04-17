<script setup lang="ts">
const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))

const mode = computed<'play' | 'run' | 'build'>(() => {
  const path = route.path
  if (path.startsWith('/run')) return 'run'
  if (path.startsWith('/build')) return 'build'
  return 'build'
})

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: entities } = await useFetch(() => `/api/worlds/${worldId.value}/entities`)

const mapImageUrl = computed(() => {
  return world.value?.banner_image_url ||
    world.value?.sidebar_image_url ||
    'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1600&q=80'
})

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
  },
  {
    id: 'north-crossing',
    title: 'North Crossing',
    x: 39,
    y: 20,
    color: '#111827',
    icon: 'i-lucide-diamond'
  },
  {
    id: 'lake-watch',
    title: 'Lake Watch',
    x: 66,
    y: 18,
    color: '#111827',
    icon: 'i-lucide-diamond'
  },
  {
    id: 'southern-road',
    title: 'Southern Road',
    x: 48,
    y: 73,
    color: '#111827',
    icon: 'i-lucide-diamond'
  }
])

const selectedPinId = ref<string | null>(pins.value[0]?.id || null)

const selectedPin = computed(() => {
  return pins.value.find((pin) => pin.id === selectedPinId.value) || null
})
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 top-10 lg:top-0">
    <div class="grid h-full grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_380px]">
      <WorldTreePanel
        :world="world"
        :entities="entities || []"
      />

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

        <WorldMapStage
          :map-image-url="mapImageUrl"
          :pins="pins"
          :selected-pin-id="selectedPinId"
          @select-pin="selectedPinId = $event"
        />
      </section>

      <WorldArticlePanel
        :world-name="world?.name || 'World'"
        :selected-pin="selectedPin"
        :mode="mode"
      />
    </div>
  </div>
</template>
