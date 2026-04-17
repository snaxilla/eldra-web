<script setup lang="ts">
import { computed, ref } from 'vue'

type NavItem = {
  key: string
  label: string
  icon: string
  to?: string
  children?: { label: string; to?: string }[]
}

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
const search = ref('')

const worldId = computed(() => String(props.world?.id || route.params.id || ''))

const openGroups = ref<Record<string, boolean>>({
  world_map: true,
  locations: true,
  maps: true
})

const navItems = computed<NavItem[]>(() => [
  {
    key: 'world_map',
    label: 'World Map',
    icon: 'i-lucide-map',
    to: `/worlds/${worldId.value}`
  },
  {
    key: 'overview',
    label: 'Overview',
    icon: 'i-lucide-scroll-text',
    to: `/worlds/${worldId.value}/overview`
  },
  {
    key: 'characters',
    label: 'Characters',
    icon: 'i-lucide-users',
    to: `/worlds/${worldId.value}/characters`
  },
  {
    key: 'locations',
    label: 'Locations',
    icon: 'i-lucide-map-pinned',
    to: `/worlds/${worldId.value}/locations`
  },
  {
    key: 'spells',
    label: 'Spells',
    icon: 'i-lucide-sparkles',
    to: `/worlds/${worldId.value}/entities?type=spell`
  },
  {
    key: 'races',
    label: 'Races',
    icon: 'i-lucide-users-round',
    to: `/worlds/${worldId.value}/entities?type=species`
  },
  {
    key: 'items',
    label: 'Items',
    icon: 'i-lucide-swords',
    to: `/worlds/${worldId.value}/entities?type=item`
  },
  {
    key: 'enemies',
    label: 'Enemies',
    icon: 'i-lucide-skull',
    to: `/worlds/${worldId.value}/entities?type=monster`
  },
  {
    key: 'classes',
    label: 'Classes',
    icon: 'i-lucide-shield',
    to: `/worlds/${worldId.value}/entities?type=class`
  },
  {
    key: 'maps',
    label: 'Maps',
    icon: 'i-lucide-images',
    to: `/worlds/${worldId.value}/maps`
  },
  {
    key: 'other',
    label: 'Other',
    icon: 'i-lucide-library',
    to: `/worlds/${worldId.value}/entities`
  },
  {
    key: 'importer',
    label: 'Importer',
    icon: 'i-lucide-download',
    to: '/dev/import/bulk'
  }
])

const filteredNavItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return navItems.value

  return navItems.value.filter((item) => item.label.toLowerCase().includes(q))
})

function isActive(item: NavItem) {
  if (!item.to) return false
  if (item.to === `/worlds/${worldId.value}`) return route.path === item.to
  return route.fullPath.startsWith(item.to)
}

function toggleGroup(key: string) {
  openGroups.value[key] = !openGroups.value[key]
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col border-r border-white/10 bg-[rgba(7,13,22,0.94)] backdrop-blur-md">
    <div class="flex items-start justify-between border-b border-white/10 px-4 py-4">
      <div v-if="!collapsed">
        <NuxtLink to="/" class="text-4xl font-semibold tracking-tight text-white transition hover:text-sky-300">
          Eldra
        </NuxtLink>
        <div class="mt-1 text-xs uppercase tracking-[0.3em] text-slate-500">World Platform</div>
        <div class="mt-3 text-lg font-medium text-slate-200">{{ world?.name || 'World' }}</div>
      </div>

      <button
        type="button"
        class="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
        @click="emit('toggle-collapse')"
      >
        <UIcon :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="h-4 w-4" />
      </button>
    </div>

    <div v-if="!collapsed" class="border-b border-white/10 px-4 py-4">
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-2xl border px-4 py-3 text-sm font-medium transition"
          :class="mode === 'play'
            ? 'border-sky-300/25 bg-sky-400/10 text-sky-100'
            : 'border-white/10 bg-white/[0.04] text-slate-300'"
          @click="emit('set-mode', 'play')"
        >
          Play
        </button>

        <button
          type="button"
          class="rounded-2xl border px-4 py-3 text-sm font-medium transition"
          :class="mode === 'build'
            ? 'border-amber-300/25 bg-amber-400/10 text-amber-100'
            : 'border-white/10 bg-white/[0.04] text-slate-300'"
          @click="emit('set-mode', 'build')"
        >
          Build
        </button>
      </div>

      <div class="mt-4">
        <div class="relative">
          <UIcon name="i-lucide-search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            v-model="search"
            type="text"
            placeholder="Search world..."
            class="w-full border-b border-white/10 bg-transparent py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/25"
          >
        </div>
      </div>
    </div>

    <div v-if="collapsed" class="flex flex-1 flex-col items-center gap-3 overflow-y-auto px-2 py-4">
      <button
        type="button"
        class="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
        @click="emit('set-mode', 'play')"
      >
        <UIcon name="i-lucide-sword" class="h-5 w-5" />
      </button>

      <button
        type="button"
        class="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
        @click="emit('set-mode', 'build')"
      >
        <UIcon name="i-lucide-pencil-ruler" class="h-5 w-5" />
      </button>

      <div class="my-2 h-px w-full bg-white/10" />

      <NuxtLink
        v-for="item in filteredNavItems"
        :key="item.key"
        :to="item.to || '#'"
        class="rounded-xl p-3 text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
        :title="item.label"
      >
        <UIcon :name="item.icon" class="h-5 w-5" />
      </NuxtLink>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      <nav class="space-y-1">
        <div
          v-for="item in filteredNavItems"
          :key="item.key"
        >
          <button
            v-if="item.children?.length"
            type="button"
            class="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition"
            :class="isActive(item) ? 'text-white' : 'text-slate-300 hover:text-white'"
            @click="toggleGroup(item.key)"
          >
            <div class="flex items-center gap-3">
              <UIcon :name="item.icon" class="h-4 w-4 text-slate-500" />
              <span>{{ item.label }}</span>
            </div>

            <UIcon
              :name="openGroups[item.key] ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="h-4 w-4 text-slate-600"
            />
          </button>

          <div v-if="item.children?.length && openGroups[item.key]" class="ml-7 border-l border-white/10 pl-4">
            <NuxtLink
              v-if="item.to"
              :to="item.to"
              class="block px-2 py-2 text-sm text-slate-400 transition hover:text-white"
              :class="route.fullPath.startsWith(item.to) ? 'text-sky-300' : ''"
            >
              {{ item.label }}
            </NuxtLink>

            <div
              v-for="child in item.children"
              :key="child.label"
              class="px-2 py-2 text-sm text-slate-500"
            >
              {{ child.label }}
            </div>
          </div>

          <NuxtLink
            v-else
            :to="item.to || '#'"
            class="flex items-center gap-3 px-3 py-2 text-sm transition"
            :class="isActive(item) ? 'text-white' : 'text-slate-300 hover:text-white'"
          >
            <UIcon :name="item.icon" class="h-4 w-4 text-slate-500" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </div>
      </nav>
    </div>
  </aside>
</template>
