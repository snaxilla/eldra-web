<script setup lang="ts">
import EntityTypeBadge from '~/components/EntityTypeBadge.vue'

const { data: worldsData } = await useFetch('/api/worlds')
const { data: entitiesData } = await useFetch('/api/entities')

const entitiesByWorld = computed(() => {
  const grouped: Record<string, any[]> = {}

  for (const entity of entitiesData.value?.entities || []) {
    const key = String(entity.worldId || 'unknown')
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(entity)
  }

  return grouped
})
</script>

<template>
  <div class="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
    <div class="mx-auto max-w-7xl">
      <div class="mb-8">
        <div class="text-xs uppercase tracking-[0.3em] text-neutral-500">
          Eldra Dev
        </div>
        <h1 class="mt-2 text-3xl font-bold">
          Worlds & Entities
        </h1>
        <p class="mt-3 max-w-3xl text-sm text-neutral-400">
          Real Directus-backed worlds and imported entities, with type icons and quick links into detail pages.
        </p>
      </div>

      <div class="grid gap-6">
        <div
          v-for="world in worldsData?.worlds || []"
          :key="world.id"
          class="rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="text-2xl font-semibold text-neutral-100">
                {{ world.name }}
              </div>
              <div class="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                {{ world.slug }} · {{ world.system_key }}
              </div>
              <div class="mt-3 max-w-3xl text-sm text-neutral-300">
                {{ world.description }}
              </div>
            </div>

            <div class="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
              {{ (entitiesByWorld[String(world.id)] || []).length }} entities
            </div>
          </div>

          <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <NuxtLink
              v-for="entity in entitiesByWorld[String(world.id)] || []"
              :key="entity.id"
              :to="`/dev/entities/${entity.id}`"
              class="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 transition hover:border-neutral-700 hover:bg-neutral-900"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-lg font-semibold text-neutral-100">
                    {{ entity.title }}
                  </div>
                  <div class="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                    {{ entity.slug }}
                  </div>
                </div>

                <EntityTypeBadge :type="entity.entityType" />
              </div>

              <div class="mt-4 flex items-center gap-2 text-xs text-neutral-400">
                <span class="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1">
                  {{ entity.status }}
                </span>
                <span class="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1">
                  {{ entity.visibility }}
                </span>
              </div>

              <div v-if="entity.summary" class="mt-4 text-sm text-neutral-300">
                {{ entity.summary }}
              </div>
            </NuxtLink>

            <div
              v-if="!(entitiesByWorld[String(world.id)] || []).length"
              class="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-500"
            >
              No entities in this world yet.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
