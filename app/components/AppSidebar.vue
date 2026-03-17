<script setup lang="ts">
const collapsed = useSidebar()

const items = [
  { label: 'Home', to: '/', icon: 'i-lucide-house' },
  { label: 'Articles', to: '/', icon: 'i-lucide-book-open' },
  { label: 'Characters', to: '/section/characters', icon: 'i-lucide-user-round' },
  { label: 'Locations', to: '/section/locations', icon: 'i-lucide-map-pinned' },
  { label: 'Factions', to: '/section/factions', icon: 'i-lucide-shield' },
  { label: 'Items', to: '/section/items', icon: 'i-lucide-swords' },
  { label: 'Maps', to: '/section/maps', icon: 'i-lucide-map' },
  { label: 'Timelines', to: '/section/timelines', icon: 'i-lucide-scroll-text' },
  { label: 'Pinned', to: '/section/pinned', icon: 'i-lucide-pin' }
]
</script>

<template>
  <aside
    :class="collapsed ? 'w-20' : 'w-72'"
    class="h-screen shrink-0 border-r border-neutral-800 bg-neutral-950 transition-all duration-200"
  >
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-neutral-800 px-4 py-4">
        <NuxtLink to="/" class="min-w-0">
          <div v-if="!collapsed" class="truncate text-lg font-bold tracking-wide text-neutral-100">
            Eldra
          </div>
          <div v-else class="text-lg font-bold tracking-wide text-neutral-100">
            E
          </div>
        </NuxtLink>

        <UButton
          color="neutral"
          variant="ghost"
          :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          @click="collapsed = !collapsed"
        />
      </div>

      <div class="flex-1 overflow-y-auto p-3">
        <div class="space-y-1">
          <NuxtLink
            v-for="item in items"
            :key="item.label"
            :to="item.to"
            class="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-neutral-300 transition hover:bg-neutral-900 hover:text-white"
          >
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </NuxtLink>
        </div>

        <div v-if="!collapsed" class="mt-8">
          <div class="mb-3 px-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
            Quick Access
          </div>

          <div class="space-y-2">
            <NuxtLink
              to="/article/eldra"
              class="block rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800"
            >
              Featured World
            </NuxtLink>

            <NuxtLink
              to="/article/aerin"
              class="block rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800"
            >
              Active Character
            </NuxtLink>
          </div>
        </div>
      </div>

      <div class="border-t border-neutral-800 p-3">
        <div class="flex items-center gap-3 rounded-xl bg-neutral-900 px-3 py-3 text-sm text-neutral-300">
          <UIcon name="i-lucide-user-circle-2" class="h-5 w-5 shrink-0" />
          <span v-if="!collapsed">Guest User</span>
        </div>
      </div>
    </div>
  </aside>
</template>
