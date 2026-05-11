<script setup lang="ts">
const props = defineProps<{
  world: any
  collapsed: boolean
  mode: 'play' | 'build'
}>()

const emit = defineEmits<{
  (e: 'toggle-collapse'): void
  (e: 'set-mode', mode: 'play' | 'build'): void
}>()

const route = useRoute()
const showPins = useState<boolean>('world-map-show-pins', () => true)

const worldId = computed(() => String(props.world?.id || ''))
const isMapPage = computed(() => {
  const path = String(route.path || '')
  return path === `/worlds/${worldId.value}` || path.startsWith(`/worlds/${worldId.value}/maps`)
})

const navItems = computed(() => [
  { label: 'World Map', icon: 'i-lucide-map', to: `/worlds/${worldId.value}` },
  { label: 'Overview', icon: 'i-lucide-file-text', to: `/worlds/${worldId.value}/overview` },
  { label: 'Characters', icon: 'i-lucide-users', to: `/worlds/${worldId.value}/characters` },
  { label: 'Locations', icon: 'i-lucide-map-pin', to: `/worlds/${worldId.value}/locations` },
  { label: 'Spells', icon: 'i-lucide-sparkles', to: `/worlds/${worldId.value}/spells` },
  { label: 'Species', icon: 'i-lucide-dna', to: `/worlds/${worldId.value}/species` },
  { label: 'Items', icon: 'i-lucide-package', to: `/worlds/${worldId.value}/items` },
  { label: 'Enemies', icon: 'i-lucide-skull', to: `/worlds/${worldId.value}/enemies` },
  { label: 'Classes', icon: 'i-lucide-shield', to: `/worlds/${worldId.value}/classes` },
  { label: 'Maps', icon: 'i-lucide-map', to: `/worlds/${worldId.value}/maps` },
  { label: 'Other', icon: 'i-lucide-folder', to: `/worlds/${worldId.value}/other` },
  { label: 'Importer', icon: 'i-lucide-download', to: `/worlds/${worldId.value}/importer` },
])
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col border-r border-[rgba(201,164,90,0.24)] bg-[linear-gradient(to_bottom,#090806,#11100d_48%,#070604)] text-[#efe2bd]">
    <!-- COLLAPSED -->
    <template v-if="collapsed">
      <div class="flex items-center justify-center p-3">
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] text-[#b5a88d] transition hover:border-[rgba(201,164,90,0.48)] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
          @click="emit('toggle-collapse')"
        >
          <UIcon name="i-lucide-panel-left-open" class="h-5 w-5" />
        </button>
      </div>

      <div class="flex items-center justify-center px-2 pb-3">
        <div class="text-center">
          <div class="text-sm font-semibold text-[#fff7df]">Eldra</div>
        </div>
      </div>

      <div class="flex flex-col items-center gap-2 px-2 pb-4">
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-none border text-sm transition"
          :class="mode === 'play'
            ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#f5e7bd]'
            : 'border-[rgba(201,164,90,0.22)] text-[#b5a88d] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
          @click="emit('set-mode', 'play')"
          title="Play"
        >
          <UIcon name="i-lucide-play" class="h-4 w-4" />
        </button>

        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-none border text-sm transition"
          :class="mode === 'build'
            ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#f5e7bd]'
            : 'border-[rgba(201,164,90,0.22)] text-[#b5a88d] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
          @click="emit('set-mode', 'build')"
          title="Build"
        >
          <UIcon name="i-lucide-hammer" class="h-4 w-4" />
        </button>
      </div>

      <nav class="min-h-0 flex-1 overflow-y-auto px-2">
        <div class="space-y-2">
          <NuxtLink
            v-for="item in navItems"
            :key="item.label"
            :to="item.to"
            class="flex h-10 items-center justify-center rounded-none border border-transparent text-[#b5a88d] transition hover:border-[rgba(201,164,90,0.24)] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]"
            active-class="border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]"
            :title="item.label"
          >
            <UIcon :name="item.icon" class="h-5 w-5" />
          </NuxtLink>
        </div>
      </nav>

      <div class="border-t border-[rgba(201,164,90,0.22)] p-2">
        <button
          type="button"
          class="mb-2 flex h-10 w-full items-center justify-center rounded-none border text-sm transition"
          :class="showPins
            ? 'border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.14)] text-[#f5e7bd]'
            : 'border-[rgba(201,164,90,0.22)] text-[#b5a88d] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
          @click="showPins = !showPins"
          :title="showPins ? 'Pins Visible' : 'Pins Hidden'"
        >
          <UIcon :name="showPins ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="h-4 w-4" />
        </button>

        <NuxtLink
          to="/"
          class="flex h-10 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
          title="Switch World"
        >
          <UIcon name="i-lucide-arrow-left-right" class="h-4 w-4" />
        </NuxtLink>
      </div>
    </template>

    <!-- EXPANDED -->
    <template v-else>
      <div class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xl font-semibold text-[#fff7df]">Eldra</div>
            <div class="text-xs uppercase tracking-[0.28em] text-[#9f9278]">World Platform</div>
          </div>

          <button
            class="rounded-none border border-[rgba(201,164,90,0.24)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
            @click="emit('toggle-collapse')"
          >
            <UIcon name="i-lucide-panel-left-close" class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-4 text-sm text-[#d8ceb8]">
          {{ world?.name }}
        </div>
      </div>

      <div class="px-4 pb-4">
        <div class="flex gap-2">
          <button
            class="flex-1 rounded-none border px-3 py-2 text-sm transition"
            :class="mode === 'play'
              ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#f5e7bd]'
              : 'border-[rgba(201,164,90,0.22)] text-[#b5a88d] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
            @click="emit('set-mode', 'play')"
          >
            Play
          </button>

          <button
            class="flex-1 rounded-none border px-3 py-2 text-sm transition"
            :class="mode === 'build'
              ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#f5e7bd]'
              : 'border-[rgba(201,164,90,0.22)] text-[#b5a88d] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
            @click="emit('set-mode', 'build')"
          >
            Build
          </button>
        </div>
      </div>

      <nav class="min-h-0 flex-1 overflow-y-auto px-2">
        <div class="space-y-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.label"
            :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#d8ceb8] transition hover:bg-white/5 hover:text-white"
            active-class="border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]"
          >
            <UIcon :name="item.icon" class="h-4 w-4" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </div>
      </nav>

      <div class="border-t border-[rgba(201,164,90,0.22)] p-4 space-y-4">
        <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-3">
          <div class="mb-2 text-[11px] uppercase tracking-[0.3em] text-[#9f9278]">
            Map Pins
          </div>

          <button
            type="button"
            class="flex w-full items-center justify-between rounded-none border px-3 py-2 text-sm transition"
            :class="showPins
              ? 'border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.14)] text-[#f5e7bd]'
              : 'border-[rgba(201,164,90,0.22)] text-[#b5a88d] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
            @click="showPins = !showPins"
          >
            <span>{{ showPins ? 'Pins Visible' : 'Pins Hidden' }}</span>
            <UIcon :name="showPins ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="h-4 w-4" />
          </button>

          <div class="mt-2 text-xs text-[#9f9278]">
            Hide map markers without deleting them.
          </div>
        </div>

        <NuxtLink
          to="/"
          class="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#d8ceb8] transition hover:bg-white/10"
        >
          <UIcon name="i-lucide-arrow-left-right" class="h-4 w-4" />
          <span>Switch World</span>
        </NuxtLink>
      </div>
    </template>
  </aside>
</template>
