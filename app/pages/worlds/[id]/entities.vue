<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))
const typeFilter = computed(() => String(route.query.type || ''))

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: entities } = await useFetch(() => `/api/worlds/${worldId.value}/entities`)

const filteredEntities = computed(() => {
  const list = entities.value || []
  if (!typeFilter.value) return list
  return list.filter((entity: any) => String(entity.entity_type || '') === typeFilter.value)
})

const title = computed(() => {
  if (!typeFilter.value) return 'All Entities'

  const map: Record<string, string> = {
    spell: 'Spells',
    species: 'Races',
    item: 'Items',
    monster: 'Enemies',
    class: 'Classes'
  }

  return map[typeFilter.value] || 'Entities'
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-[#09111a] p-8">
    <div class="mx-auto max-w-6xl">
      <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
        {{ world?.name || 'World' }}
      </div>
      <h1 class="mt-3 text-4xl font-semibold tracking-tight text-white">
        {{ title }}
      </h1>

      <div class="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="entity in filteredEntities"
          :key="entity.id"
          :to="`/worlds/${worldId}/entities/${entity.id}`"
          class="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition hover:border-sky-300/20 hover:bg-white/[0.05]"
        >
          <div class="text-xs uppercase tracking-[0.28em] text-slate-500">
            {{ entity.entity_type || 'entity' }}
          </div>
          <div class="mt-3 text-2xl font-semibold text-white">
            {{ entity.title }}
          </div>
          <div class="mt-2 text-sm text-slate-400">
            {{ entity.slug }}
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
