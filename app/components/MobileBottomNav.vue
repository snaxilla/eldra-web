<script setup lang="ts">
const route = useRoute()

const activeWorldId = computed(() => {
  const match = route.path.match(/^\/worlds\/([^/]+)/) || route.path.match(/^\/(?:play|run)\/worlds\/([^/]+)/)
  return match?.[1] || null
})

const currentWorkspace = computed(() => {
  const path = route.path

  if (path.startsWith('/play')) return 'play'
  if (path.startsWith('/run')) return 'run'
  return 'build'
})

const items = computed(() => {
  const worldId = activeWorldId.value

  if (currentWorkspace.value === 'play') {
    return [
      { label: 'Play', to: worldId ? `/play/worlds/${worldId}` : '/play', icon: 'i-lucide-sword' },
      { label: 'Build', to: worldId ? `/worlds/${worldId}` : '/', icon: 'i-lucide-compass' },
      { label: 'Run', to: worldId ? `/run/worlds/${worldId}` : '/run', icon: 'i-lucide-shield' }
    ]
  }

  if (currentWorkspace.value === 'run') {
    return [
      { label: 'Run', to: worldId ? `/run/worlds/${worldId}` : '/run', icon: 'i-lucide-shield' },
      { label: 'Build', to: worldId ? `/worlds/${worldId}` : '/', icon: 'i-lucide-compass' },
      { label: 'Play', to: worldId ? `/play/worlds/${worldId}` : '/play', icon: 'i-lucide-sword' }
    ]
  }

  return [
    { label: 'Build', to: worldId ? `/worlds/${worldId}` : '/', icon: 'i-lucide-compass' },
    { label: 'Play', to: worldId ? `/play/worlds/${worldId}` : '/play', icon: 'i-lucide-sword' },
    { label: 'Run', to: worldId ? `/run/worlds/${worldId}` : '/run', icon: 'i-lucide-shield' }
  ]
})
</script>

<template>
  <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b1119]/92 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:hidden">
    <div class="grid grid-cols-3 gap-2">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-xs font-medium transition"
        active-class="border-sky-500/30 bg-sky-500/10 text-white"
        :class="'border-white/8 bg-white/[0.02] text-slate-300 hover:bg-white/[0.04]'"
      >
        <UIcon :name="item.icon" class="h-5 w-5" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
