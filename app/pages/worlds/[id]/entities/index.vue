<script setup lang="ts">
const route = useRoute()
const worldId = route.params.id

const { data: world } = await useFetch(`/api/worlds/${worldId}`)
const { data: entities } = await useFetch(`/api/worlds/${worldId}/entities`)

const selectedType = ref(typeof route.query.type === 'string' ? route.query.type : 'all')

watch(
  () => route.query.type,
  (value) => {
    selectedType.value = typeof value === 'string' ? value : 'all'
  }
)

const entityTypes = computed(() => {
  const values = new Set<string>()

  for (const entity of entities.value || []) {
    if (entity?.entity_type) values.add(entity.entity_type)
  }

  return ['all', ...Array.from(values).sort()]
})

const filteredEntities = computed(() => {
  const list = entities.value || []

  if (selectedType.value === 'all') return list

  return list.filter((entity: any) => entity.entity_type === selectedType.value)
})

function labelForType(type: string) {
  if (type === 'all') return 'All'
  return type.charAt(0).toUpperCase() + type.slice(1)
}
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8 shadow-[0_10px_24px_rgba(80,60,30,0.10)]">
      <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
        Entities
      </div>

      <div class="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 class="text-4xl font-semibold tracking-[0.04em] text-[#2f2419]">
            {{ world?.name || 'World' }} Entities
          </h1>

          <p class="mt-3 max-w-3xl text-base leading-7 text-[#4f4030]">
            Browse characters, locations, items, spells, and other world content in one place.
          </p>
        </div>

        <div class="min-w-[220px]">
          <label class="mb-2 block text-sm font-medium text-[#6b5333]">
            Filter by type
          </label>

          <select
            v-model="selectedType"
            class="w-full rounded-xl border border-[#cfb07a] bg-[#fffaf2] px-4 py-3 text-[#2f2419] outline-none focus:border-[#b38a2e]"
          >
            <option
              v-for="type in entityTypes"
              :key="type"
              :value="type"
            >
              {{ labelForType(type) }}
            </option>
          </select>
        </div>
      </div>
    </section>

    <section v-if="!filteredEntities.length" class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8">
      <div class="text-[#4f4030]">No entities found for this filter yet.</div>
    </section>

    <section v-else class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      <EntitiesEntityCard
        v-for="entity in filteredEntities"
        :key="entity.id"
        :entity="entity"
      />
    </section>
  </div>
</template>
