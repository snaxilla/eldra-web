<script setup lang="ts">
const { data: worldsData } = await useFetch('/api/worlds')
const { data: entitiesData } = await useFetch('/api/entities')
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
          This is the structural layer Eldra needs for multi-world campaigns, importer targets, and future Foundry sync.
        </p>
      </div>

      <div class="grid gap-6 xl:grid-cols-[1.1fr,1.4fr]">
        <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div class="mb-4 text-sm font-semibold text-neutral-100">
            Worlds
          </div>

          <div class="space-y-3">
            <div
              v-for="world in worldsData?.worlds || []"
              :key="world.id"
              class="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div class="text-lg font-semibold">{{ world.name }}</div>
              <div class="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                {{ world.slug }} · {{ world.systemKey }}
              </div>
              <div class="mt-3 text-sm text-neutral-300">
                {{ world.description }}
              </div>
              <div class="mt-3">
                <NuxtLink
                  :to="`/api/worlds/${world.slug}`"
                  class="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  View World JSON
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div class="mb-4 text-sm font-semibold text-neutral-100">
            Entities
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div
              v-for="entity in entitiesData?.entities || []"
              :key="entity.id"
              class="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div class="text-lg font-semibold">{{ entity.title }}</div>
              <div class="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                {{ entity.entityType }} · {{ entity.systemKey }}
              </div>
              <div class="mt-2 text-sm text-neutral-400">
                World: {{ entity.world?.name || entity.worldId }}
              </div>
              <div class="mt-2 text-sm text-neutral-300">
                {{ entity.summary }}
              </div>
              <div class="mt-3 flex items-center gap-2">
                <span class="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                  {{ entity.status }}
                </span>
                <span class="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                  {{ entity.visibility }}
                </span>
              </div>
              <div class="mt-3">
                <NuxtLink
                  :to="`/api/entities/${entity.id}`"
                  class="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  View Entity JSON
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
