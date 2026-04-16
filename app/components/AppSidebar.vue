<script setup lang="ts">
const route = useRoute()

const activeWorldId = computed(() => {
  const match =
    route.path.match(/^\/worlds\/([^/]+)/) ||
    route.path.match(/^\/(?:play|run)\/worlds\/([^/]+)/)

  return match?.[1] || null
})

const showSidebar = computed(() => !!activeWorldId.value)

const currentWorkspace = computed(() => {
  const path = route.path

  if (path.startsWith('/play')) return 'play'
  if (path.startsWith('/run')) return 'run'
  if (path.startsWith('/build')) return 'build'
  if (path.startsWith('/worlds/')) return 'build'

  return 'build'
})

const collapsed = useState<boolean>('eldra-sidebar-collapsed', () => false)

if (import.meta.client) {
  onMounted(() => {
    const saved = localStorage.getItem('eldra-sidebar-collapsed')
    if (saved === 'true') collapsed.value = true
    if (saved === 'false') collapsed.value = false
  })

  watch(collapsed, (value) => {
    localStorage.setItem('eldra-sidebar-collapsed', String(value))
  })
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

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
      { label: 'My Characters', to: `/play/worlds/${worldId}`, icon: 'i-lucide-user-round' },
      { label: 'Builder', to: `/play/worlds/${worldId}/builder`, icon: 'i-lucide-hammer' },
      { label: 'Inventory', to: `/play/worlds/${worldId}/inventory`, icon: 'i-lucide-backpack' },
      { label: 'Spells', to: `/play/worlds/${worldId}/spells`, icon: 'i-lucide-sparkles' }
    ]
  }

  if (currentWorkspace.value === 'run') {
    return [
      { label: 'Overview', to: `/run/worlds/${worldId}`, icon: 'i-lucide-layout-dashboard' },
      { label: 'Players', to: `/run/worlds/${worldId}/players`, icon: 'i-lucide-users' },
      { label: 'Characters', to: `/run/worlds/${worldId}/characters`, icon: 'i-lucide-scroll-text' },
      { label: 'Notes', to: `/run/worlds/${worldId}/notes`, icon: 'i-lucide-notebook-pen' }
    ]
  }

  return [
    { label: 'Overview', to: `/worlds/${worldId}`, icon: 'i-lucide-layout-dashboard' },
    { label: 'Entities', to: `/worlds/${worldId}/entities`, icon: 'i-lucide-library' },
    { label: 'Maps', to: `/worlds/${worldId}/maps`, icon: 'i-lucide-map' },
    { label: 'Import', to: '/dev/import/bulk', icon: 'i-lucide-download' }
  ]
})
</script>

<template>
  <aside
    v-if="showSidebar"
    class="hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:flex-col lg:border-r lg:border-white/10 lg:bg-[#0f1722] lg:transition-all lg:duration-200"
    :class="collapsed ? 'lg:w-[92px]' : 'lg:w-[280px]'"
  >
    <div class="flex h-16 items-center justify-between border-b border-white/10 px-4">
      <div v-if="!collapsed" class="min-w-0">
        <div class="text-lg font-semibold tracking-tight text-white">
          Eldra
        </div>
        <div class="text-[11px] uppercase tracking-[0.28em] text-slate-400">
          World Platform
        </div>
      </div>

      <div v-else class="mx-auto text-lg font-semibold tracking-tight text-white">
        E
      </div>

      <button
        type="button"
        class="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
        @click="toggleCollapsed"
      >
        <UIcon :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="h-4 w-4" />
      </button>
    </div>

    <div class="px-3 py-4">
      <div
        v-if="!collapsed"
        class="mb-3 text-[11px] uppercase tracking-[0.28em] text-slate-500"
      >
        Workspaces
      </div>

      <div :class="collapsed ? 'space-y-2' : 'grid grid-cols-3 gap-2'">
        <NuxtLink
          v-for="item in workspaceLinks"
          :key="item.key"
          :to="item.to"
          class="flex rounded-2xl border text-xs font-medium transition"
          :class="[
            collapsed ? 'items-center justify-center px-3 py-3' : 'flex-col items-center gap-2 px-3 py-3',
            currentWorkspace === item.key
              ? 'border-sky-500/40 bg-sky-500/10 text-white'
              : 'border-white/8 bg-white/[0.02] text-slate-300 hover:border-white/12 hover:bg-white/[0.04]'
          ]"
        >
          <UIcon :name="item.icon" class="h-5 w-5" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </NuxtLink>
      </div>
    </div>

    <div class="px-3 pt-2">
      <div
        v-if="!collapsed"
        class="mb-3 text-[11px] uppercase tracking-[0.28em] text-slate-500"
      >
        Navigation
      </div>

      <nav class="space-y-1">
        <NuxtLink
          v-for="item in navLinks"
          :key="item.to"
          :to="item.to"
          class="flex rounded-2xl border border-transparent text-sm font-medium transition"
          :class="collapsed ? 'items-center justify-center px-3 py-3' : 'items-center gap-3 px-3 py-3'"
          active-class="border-sky-500/30 bg-sky-500/10 text-white"
          :title="collapsed ? item.label : undefined"
        >
          <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </NuxtLink>
      </nav>
    </div>

    <div v-if="!collapsed" class="mt-auto p-4">
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
