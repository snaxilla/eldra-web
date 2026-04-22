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
</script>

<template>
  <div
    class="h-screen w-screen overflow-hidden text-slate-100
    bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(56,189,248,0.08),transparent),
         radial-gradient(900px_500px_at_90%_0%,rgba(139,92,246,0.06),transparent),
         linear-gradient(to_bottom,#060c16,#09111a_40%,#0b1622)]"
  >
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

      <!-- MAIN CONTENT AREA -->
      <div class="min-w-0 overflow-hidden relative">

        <!-- subtle inner glow to give depth -->
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_400px_at_50%_-100px,rgba(56,189,248,0.06),transparent)]"></div>

        <!-- actual page content -->
        <div class="relative h-full w-full overflow-hidden">
          <slot />
        </div>

      </div>
    </div>
  </div>
</template>
