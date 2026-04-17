<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  world: any
  entities: any[]
}>()

const grouped = computed(() => {
  const groups: Record<string, any[]> = {}

  for (const entity of props.entities || []) {
    const key = entity.entity_type || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(entity)
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
      items: items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
    }))
})
</script>

<template>
  <aside class="flex h-full w-full flex-col border-r border-white/10 bg-[rgba(7,13,22,0.92)] backdrop-blur-md">
    <div class="border-b border-white/10 px-5 py-4">
      <NuxtLink
        to="/"
        class="text-3xl font-semibold tracking-tight text-white transition hover:text-sky-300"
      >
        {{ world?.name || 'World' }}
      </NuxtLink>

      <div class="mt-2 text-xs uppercase tracking-[0.3em] text-slate-500">
        World Platform
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <div class="space-y-4">
        <div
          v-for="group in grouped"
          :key="group.key"
          class="rounded-[22px] border border-white/10 bg-white/[0.03]"
        >
          <div class="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.28em] text-slate-500">
            {{ group.label }}
          </div>

          <div class="p-2">
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
