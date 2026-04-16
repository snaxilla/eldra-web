<script setup lang="ts">
const route = useRoute()

const activeWorldId = computed(() => {
  const match = route.path.match(/^\/worlds\/([^/]+)/) || route.path.match(/^\/(?:play|run)\/worlds\/([^/]+)/)
  return match?.[1] || null
})

const { data: activeWorld } = await useFetch(
  () => activeWorldId.value ? `/api/worlds/${activeWorldId.value}` : null
)

const pageTitle = computed(() => {
  const path = route.path

  if (path === '/') return 'Worlds'
  if (path.includes('/entities')) return 'Entities'
  if (path.includes('/maps')) return 'Maps'
  if (path.includes('/import/')) return 'Import'
  if (path.startsWith('/play')) return 'Play'
  if (path.startsWith('/run')) return 'Run'
  if (path.startsWith('/worlds/')) return activeWorld.value?.name || 'World'

  return 'Eldra'
})
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-white/10 bg-[#0b1119]/85 backdrop-blur">
    <div class="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
      <div class="min-w-0">
        <div class="text-[11px] uppercase tracking-[0.28em] text-slate-500">
          Eldra
        </div>
        <div class="truncate text-lg font-semibold tracking-tight text-white">
          {{ pageTitle }}
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div
          v-if="activeWorld"
          class="hidden sm:flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-sm text-slate-100"
        >
          <UIcon name="i-lucide-orbit" class="h-4 w-4 text-sky-300" />
          <span class="truncate max-w-[180px]">{{ activeWorld.name }}</span>
        </div>

        <NuxtLink
          to="/"
          class="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.06]"
        >
          Switch World
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
