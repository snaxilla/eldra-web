<script setup lang="ts">
const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const showPinsCookie = useCookie<string>('eldra-show-pins', {
  default: () => 'true'
})
const showPins = useState<boolean>('world-map-show-pins', () => showPinsCookie.value != 'false')

watch(showPins, (value) => {
  showPinsCookie.value = value ? 'true' : 'false'
})

const leftCollapsed = useState<boolean>('world-workspace-left-collapsed', () => false)

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

const pageKey = computed(() => {
  const parts = String(route.path || '').split('/').filter(Boolean)
  const worldIndex = parts.findIndex(p => p === 'worlds')

  if (worldIndex === -1) return 'global'

  const maybePage = parts[worldIndex + 2]
  const maybeChild = parts[worldIndex + 3]

  if (maybePage === 'entities' && maybeChild) {
    return 'entity-article'
  }

  return maybePage || 'world-map'
})

const presentationState = useState<{
  worldKey: string
  pageKey: string
  presentationMode: string
  backgroundFileId: string | null
  backgroundImageUrl: string | null
}>('world-page-presentation', () => ({
  worldKey: '',
  pageKey: '',
  presentationMode: 'neutral',
  backgroundFileId: null,
  backgroundImageUrl: null
}))

const presentationRefreshNonce = useState<number>('world-page-presentation-refresh-nonce', () => 0)

const {
  data: fetchedPresentation,
  refresh: refreshPresentation
} = await useFetch(() => `/api/worlds/${worldId.value}/presentation/${pageKey.value}`, {
  default: () => ({
    worldKey: String(worldId.value || ''),
    pageKey: String(pageKey.value || 'world-map'),
    presentationMode: 'neutral',
    backgroundFileId: null,
    backgroundImageUrl: null
  }),
  watch: [worldId, pageKey, presentationRefreshNonce]
})

watch(
  fetchedPresentation,
  (value) => {
    if (!value) return
    presentationState.value = {
      worldKey: String(value.worldKey || worldId.value || ''),
      pageKey: String(value.pageKey || pageKey.value || ''),
      presentationMode: String(value.presentationMode || 'neutral'),
      backgroundFileId: value.backgroundFileId ? String(value.backgroundFileId) : null,
      backgroundImageUrl: value.backgroundImageUrl ? String(value.backgroundImageUrl) : null
    }
  },
  { immediate: true, deep: true }
)

watch([worldId, pageKey], async () => {
  await refreshPresentation()
})

const presentationMode = computed(() => String(presentationState.value.presentationMode || 'neutral'))
const backgroundImageUrl = computed(() => {
  if (presentationState.value.backgroundImageUrl) {
    return String(presentationState.value.backgroundImageUrl)
  }
  if (presentationState.value.backgroundFileId) {
    return `/api/assets/${presentationState.value.backgroundFileId}`
  }
  return ''
})
</script>

<template>
  <div class="h-screen w-screen overflow-hidden text-slate-100 bg-[#0a0d12]">
    <div
      class="grid h-full"
      :style="{ gridTemplateColumns: leftCollapsed ? '68px minmax(0,1fr)' : '280px minmax(0,1fr)' }"
    >
      <WorldWorkspaceSidebar
        :world="world"
        :collapsed="leftCollapsed"
        :mode="mode"
        @toggle-collapse="leftCollapsed = !leftCollapsed"
        @set-mode="mode = $event"
      />

      <div class="min-w-0 overflow-hidden relative">
        <div class="absolute inset-0 bg-[linear-gradient(to_bottom,#0b0d12,#0d1117_40%,#10141b)]"></div>

        <div
          v-if="backgroundImageUrl && presentationMode !== 'neutral'"
          class="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
          :style="{
            backgroundImage: `url('${backgroundImageUrl}')`,
            opacity: presentationMode === 'immersive' ? '0.42' : '0.18',
            filter: presentationMode === 'immersive'
              ? 'saturate(1.02) contrast(1.01) brightness(0.98)'
              : 'grayscale(0.08) saturate(0.78) brightness(0.92)'
          }"
        />

        <div
          v-if="presentationMode !== 'neutral'"
          class="absolute inset-0"
          :style="{
            background: presentationMode === 'immersive'
              ? 'linear-gradient(to bottom, rgba(9,11,15,0.20), rgba(12,15,20,0.34) 32%, rgba(14,18,24,0.48) 72%, rgba(16,20,26,0.60))'
              : 'linear-gradient(to bottom, rgba(10,12,16,0.36), rgba(13,16,21,0.50) 38%, rgba(16,20,26,0.64))'
          }"
        />

        <div class="relative h-full w-full overflow-hidden">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
