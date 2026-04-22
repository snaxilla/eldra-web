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

const showPins = useState<boolean>('world-map-show-pins', () => true)

const navItems = [
  { label: 'World Map', icon: 'i-lucide-map', to: `/worlds/${props.world?.id}` },
  { label: 'Overview', icon: 'i-lucide-file-text', to: `/worlds/${props.world?.id}/overview` },
  { label: 'Characters', icon: 'i-lucide-users', to: `/worlds/${props.world?.id}/characters` },
  { label: 'Locations', icon: 'i-lucide-map-pin', to: `/worlds/${props.world?.id}/locations` },
  { label: 'Spells', icon: 'i-lucide-sparkles', to: `/worlds/${props.world?.id}/spells` },
  { label: 'Races', icon: 'i-lucide-user', to: `/worlds/${props.world?.id}/races` },
  { label: 'Items', icon: 'i-lucide-package', to: `/worlds/${props.world?.id}/items` },
  { label: 'Enemies', icon: 'i-lucide-skull', to: `/worlds/${props.world?.id}/enemies` },
  { label: 'Classes', icon: 'i-lucide-shield', to: `/worlds/${props.world?.id}/classes` },
  { label: 'Maps', icon: 'i-lucide-map', to: `/worlds/${props.world?.id}/maps` },
  { label: 'Other', icon: 'i-lucide-folder', to: `/worlds/${props.world?.id}/other` },
  { label: 'Importer', icon: 'i-lucide-download', to: `/worlds/${props.world?.id}/importer` },
]
</script>

<template>
  <aside class="flex h-full flex-col border-r border-white/10 bg-[#050913]">

    <!-- Header -->
    <div class="p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xl font-semibold text-white">Eldra</div>
          <div class="text-xs uppercase tracking-wide text-slate-400">World Platform</div>
        </div>

        <button
          class="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"
          @click="emit('toggle-collapse')"
        >
          <UIcon name="i-lucide-panel-left" />
        </button>
      </div>

      <div class="mt-4 text-sm text-slate-300">
        {{ world?.name }}
      </div>
    </div>

    <!-- Mode Toggle -->
    <div class="px-4 pb-4">
      <div class="flex gap-2">
        <button
          class="flex-1 rounded-lg border px-3 py-2 text-sm"
          :class="mode === 'play'
            ? 'border-sky-400/30 bg-sky-400/10 text-sky-200'
            : 'border-white/10 text-slate-300 hover:bg-white/5'"
          @click="emit('set-mode', 'play')"
        >
          Play
        </button>

        <button
          class="flex-1 rounded-lg border px-3 py-2 text-sm"
          :class="mode === 'build'
            ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
            : 'border-white/10 text-slate-300 hover:bg-white/5'"
          @click="emit('set-mode', 'build')"
        >
          Build
        </button>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-2">
      <div class="space-y-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
          active-class="bg-white/10 text-white"
        >
          <UIcon :name="item.icon" class="h-4 w-4" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>

    <!-- Bottom Section -->
    <div class="p-4 space-y-4 border-t border-white/10">

      <!-- Map Pins Toggle (MOVED HERE) -->
      <div class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div class="mb-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
          Map Pins
        </div>

        <button
          type="button"
          class="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm"
          :class="showPins
            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
            : 'border-white/10 text-slate-300 hover:bg-white/5'"
          @click="showPins = !showPins"
        >
          <span>{{ showPins ? 'Pins Visible' : 'Pins Hidden' }}</span>
          <UIcon :name="showPins ? 'i-lucide-eye' : 'i-lucide-eye-off'" />
        </button>

        <div class="mt-2 text-xs text-slate-500">
          Hide map markers without deleting them.
        </div>
      </div>

      <!-- Switch World -->
      <NuxtLink
        to="/"
        class="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
      >
        <UIcon name="i-lucide-arrow-left-right" />
        <span>Switch World</span>
      </NuxtLink>

    </div>
  </aside>
</template>
