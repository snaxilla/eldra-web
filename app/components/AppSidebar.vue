<script setup lang="ts">
const route = useRoute()

const activeWorldId = computed(() => {
  const match = route.path.match(/^\/worlds\/([^/]+)/)
  return match?.[1] || null
})

const currentWorkspace = computed(() => {
  const path = route.path

  if (path.startsWith('/play')) return 'play'
  if (path.startsWith('/run')) return 'run'
  if (path.startsWith('/build')) return 'build'
  if (path.startsWith('/worlds/')) return 'build'

  return 'build'
})

const workspaceLinks = computed(() => {
  const worldId = activeWorldId.value

  return [
    {
      key: 'play',
      label: 'Play',
      to: worldId ? `/play/worlds/${worldId}` : '/play',
      icon: 'i-lucide-sword'
    },
    {
      key: 'run',
      label: 'Run',
      to: worldId ? `/run/worlds/${worldId}` : '/run',
      icon: 'i-lucide-shield'
    },
    {
      key: 'build',
      label: 'Build',
      to: worldId ? `/worlds/${worldId}` : '/',
      icon: 'i-lucide-compass'
    }
  ]
})

const navLinks = computed(() => {
  const worldId = activeWorldId.value

  if (currentWorkspace.value === 'play') {
    return [
      { label: 'My Characters', to: worldId ? `/play/worlds/${worldId}` : '/play', icon: 'i-lucide-user-round' },
      { label: 'Builder', to: worldId ? `/play/worlds/${worldId}/builder` : '/play', icon: 'i-lucide-hammer' },
      { label: 'Inventory', to: worldId ? `/play/worlds/${worldId}/inventory` : '/play', icon: 'i-lucide-backpack' },
      { label: 'Spells', to: worldId ? `/play/worlds/${worldId}/spells` : '/play', icon: 'i-lucide-sparkles' }
    ]
  }

  if (currentWorkspace.value === 'run') {
    return [
      { label: 'Overview', to: worldId ? `/run/worlds/${worldId}` : '/run', icon: 'i-lucide-layout-dashboard' },
      { label: 'Players', to: worldId ? `/run/worlds/${worldId}/players` : '/run', icon: 'i-lucide-users' },
      { label: 'Characters', to: worldId ? `/run/worlds/${worldId}/characters` : '/run', icon: 'i-lucide-scroll-text' },
      { label: 'Notes', to: worldId ? `/run/worlds/${worldId}/notes` : '/run', icon: 'i-lucide-notebook-pen' }
    ]
  }

  return [
    { label: 'Worlds', to: '/', icon: 'i-lucide-globe-2' },
    { label: 'Overview', to: worldId ? `/worlds/${worldId}` : '/', icon: 'i-lucide-layout-dashboard' },
    { label: 'Entities', to: worldId ? `/worlds/${worldId}/entities` : '/', icon: 'i-lucide-library' },
    { label: 'Maps', to: worldId ? `/worlds/${worldId}/maps` : '/', icon: 'i-lucide-map' },
    { label: 'Import', to: '/dev/import/bulk', icon: 'i-lucide-download' }
  ]
})
</script>

<template>
  <aside class="hidden lg:flex lg:w-[280px] lg:flex-col lg:border-r lg:border-white/10 lg:bg-[#0f1722]">
    <div class="flex h-16 items-center border-b border-white/10 px-5">
      <div>
        <div class="text-lg font-semibold tracking-tight text-white">
          Eldra
        </div>
        <div class="text-[11px] uppercase tracking-[0.28em] text-slate-400">
          World Platform
        </div>
      </div>
    </div>

    <div class="px-4 py-4">
      <div class="mb-3 text-[11px] uppercase tracking-[0.28em] text-slate-500">
        Workspaces
      </div>

      <div class="grid grid-cols-3 gap-2">
        <NuxtLink
          v-for="item in workspaceLinks"
          :key="item.key"
          :to="item.to"
          class="flex flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-medium transition"
          :class="
            currentWorkspace === item.key
              ? 'border-sky-500/40 bg-sky-500/10 text-white'
              : 'border-white/8 bg-white/[0.02] text-slate-300 hover:border-white/12 hover:bg-white/[0.04]'
          "
        >
          <UIcon :name="item.icon" class="h-5 w-5" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </div>
    </div>

    <div class="px-4 pt-2">
      <div class="mb-3 text-[11px] uppercase tracking-[0.28em] text-slate-500">
        Navigation
      </div>

      <nav class="space-y-1">
        <NuxtLink
          v-for="item in navLinks"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-sm font-medium transition"
          active-class="border-sky-500/30 bg-sky-500/10 text-white"
          :class="'text-slate-300 hover:border-white/10 hover:bg-white/[0.04] hover:text-white'"
        >
          <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>
    </div>

    <div class="mt-auto p-4">
      <div class="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
        <div class="text-[11px] uppercase tracking-[0.28em] text-slate-500">
          Status
        </div>
        <div class="mt-2 text-sm text-slate-300">
          Foundation shell active.
        </div>
      </div>
    </div>
  </aside>
</template>
