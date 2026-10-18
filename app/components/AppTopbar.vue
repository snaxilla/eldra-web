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
  <header class="sticky top-0 z-30 border-b border-eldra-accent/12 bg-eldra-panel-strong/40 backdrop-blur-sm">
    <div class="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
      <div class="min-w-0">
        <div class="eldra-display truncate text-sm text-eldra-text-strong">
          {{ pageTitle }}
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div
          v-if="activeWorld"
          class="hidden sm:flex items-center gap-2 rounded-none border border-eldra-accent/30 bg-eldra-panel/60 px-3 py-1.5 text-xs text-eldra-text backdrop-blur"
        >
          <UIcon name="i-lucide-orbit" class="h-3.5 w-3.5 text-eldra-accent" />
          <span class="truncate max-w-[160px]">{{ activeWorld.name }}</span>
        </div>

        <EldraAccessibilityMenu compact />

        <NuxtLink
          to="/"
          class="eldra-map-control rounded-none px-3 py-1.5 text-xs font-medium"
        >
          Switch World
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
