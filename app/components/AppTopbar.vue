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
  <header class="sticky top-0 z-30 border-b border-white/8 bg-[#07101a]/72 backdrop-blur-xl">
    <div class="flex h-10 items-center justify-between px-4 sm:px-6 lg:px-8">
      <div class="min-w-0">
        <div class="truncate text-sm font-semibold tracking-tight text-white">
          {{ pageTitle }}
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div
          v-if="activeWorld"
          class="hidden sm:flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-slate-100"
        >
          <UIcon name="i-lucide-orbit" class="h-3.5 w-3.5 text-sky-300" />
          <span class="truncate max-w-[160px]">{{ activeWorld.name }}</span>
        </div>

        <NuxtLink
          to="/"
          class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08]"
        >
          Switch World
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
