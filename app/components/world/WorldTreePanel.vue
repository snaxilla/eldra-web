<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  world: any
  entities: any[]
  collapsed: boolean
  mode: 'play' | 'build'
}>()

const emit = defineEmits<{
  (e: 'toggle-collapse'): void
  (e: 'set-mode', mode: 'play' | 'build'): void
}>()

const openGroups = ref<Record<string, boolean>>({})

const grouped = computed(() => {
  const groups: Record<string, any[]> = {}

  for (const entity of props.entities || []) {
    const key = entity.entity_type || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(entity)
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => {
      if (!(key in openGroups.value)) openGroups.value[key] = true

      return {
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
        items: items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
      }
    })
})

function toggleGroup(key: string) {
  openGroups.value[key] = !openGroups.value[key]
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col border-r border-white/10 bg-[rgba(7,13,22,0.94)] backdrop-blur-md">
    <div class="flex items-start justify-between border-b border-white/10 px-4 py-4">
      <div v-if="!collapsed">
        <div class="text-4xl font-semibold tracking-tight text-white">Eldra</div>
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
    </div>

    <div v-if="collapsed" class="flex flex-1 flex-col items-center gap-3 px-2 py-4">
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
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto p-4">
      <div class="space-y-4">
        <div
          v-for="group in grouped"
          :key="group.key"
          class="rounded-[22px] border border-white/10 bg-white/[0.03]"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between border-b border-white/10 px-4 py-3 text-left text-xs uppercase tracking-[0.28em] text-slate-500"
            @click="toggleGroup(group.key)"
          >
            <span>{{ group.label }}</span>
            <UIcon :name="openGroups[group.key] ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="h-4 w-4" />
          </button>

          <div v-if="openGroups[group.key]" class="p-2">
            <NuxtLink
              v-for="item in group.items"
              :key="item.id"
              :to="`/worlds/${world?.id}/entities/${item.id}`"
              class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
            >
              <UIcon name="i-lucide-file-text" class="h-4 w-4 text-slate-500" />
              <span class="truncate">{{ item.title }}</span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
