<script setup lang="ts">
const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

const navItems = [
  { label: 'World Map', icon: 'i-lucide-map', to: `/worlds/${worldId.value}` },
  { label: 'Overview', icon: 'i-lucide-file-text', to: `/worlds/${worldId.value}/overview` },
  { label: 'Characters', icon: 'i-lucide-users', to: `/worlds/${worldId.value}/characters` },
  { label: 'Locations', icon: 'i-lucide-map-pinned', to: `/worlds/${worldId.value}/locations` },
  { label: 'Spells', icon: 'i-lucide-sparkles', to: `/worlds/${worldId.value}/spells` },
  { label: 'Races', icon: 'i-lucide-user-round', to: `/worlds/${worldId.value}/races` },
  { label: 'Items', icon: 'i-lucide-swords', to: `/worlds/${worldId.value}/items` },
  { label: 'Enemies', icon: 'i-lucide-skull', to: `/worlds/${worldId.value}/enemies` },
  { label: 'Classes', icon: 'i-lucide-shield', to: `/worlds/${worldId.value}/classes` },
  { label: 'Maps', icon: 'i-lucide-scroll-text', to: `/worlds/${worldId.value}/maps` },
  { label: 'Other', icon: 'i-lucide-library', to: `/worlds/${worldId.value}/other` },
  { label: 'Importer', icon: 'i-lucide-download', to: `/worlds/${worldId.value}/importer` },
]
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[#09111a] text-white">
    <aside class="flex h-full w-[292px] flex-col border-r border-white/8 bg-[#03101d]">
      <div class="border-b border-white/8 px-5 py-6">
        <div class="flex items-start justify-between gap-3">
          <div>
            <NuxtLink to="/" class="text-[34px] font-semibold leading-none tracking-tight text-white">
              Eldra
            </NuxtLink>
            <div class="mt-2 text-[11px] uppercase tracking-[0.35em] text-slate-500">
              World Platform
            </div>
          </div>

          <NuxtLink
            to="/"
            class="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            title="Switch World"
          >
            <UIcon name="i-lucide-panel-left-open" class="h-5 w-5" />
          </NuxtLink>
        </div>

        <div class="mt-6 text-[20px] font-medium text-white">
          {{ world?.name || 'World' }}
        </div>
      </div>

      <div class="px-5 py-5">
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            class="rounded-2xl border px-4 py-4 text-base font-medium transition"
            :class="mode === 'play'
              ? 'border-sky-400/30 bg-sky-400/12 text-sky-100'
              : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'"
            @click="mode = 'play'"
          >
            Play
          </button>

          <button
            type="button"
            class="rounded-2xl border px-4 py-4 text-base font-medium transition"
            :class="mode === 'build'
              ? 'border-amber-300/30 bg-amber-400/12 text-amber-100'
              : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'"
            @click="mode = 'build'"
          >
            Build
          </button>
        </div>

        <div class="mt-5">
          <div class="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-slate-400">
            <UIcon name="i-lucide-search" class="h-5 w-5" />
            <span class="text-base">Search world...</span>
          </div>
        </div>
      </div>

      <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div class="space-y-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.label"
            :to="item.to"
            class="flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
            active-class="bg-white/[0.06] text-white"
          >
            <UIcon :name="item.icon" class="h-5 w-5 text-slate-400" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </div>
      </nav>

      <div class="border-t border-white/8 p-4">
        <NuxtLink
          to="/"
          class="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
        >
          <UIcon name="i-lucide-arrow-left-right" class="h-4 w-4" />
          <span>Switch World</span>
        </NuxtLink>
      </div>
    </aside>

    <main class="relative min-w-0 flex-1">
      <slot />
    </main>
  </div>
</template>
