<script setup lang="ts">
const { data, error } = await useFetch('/api/systems')
</script>

<template>
  <div class="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
    <div class="mx-auto max-w-6xl">
      <div class="mb-8">
        <div class="text-xs uppercase tracking-[0.3em] text-neutral-500">
          Eldra Dev
        </div>
        <h1 class="mt-2 text-3xl font-bold">
          System Registry
        </h1>
        <p class="mt-3 max-w-3xl text-sm text-neutral-400">
          Schema-first rules registry built for importer adapters, block rendering, and Directus-backed persistence.
        </p>
      </div>

      <div v-if="error" class="rounded-2xl border border-red-900 bg-red-950/40 p-4 text-red-300">
        Failed to load system registry.
      </div>

      <div v-else class="grid gap-5">
        <div
          v-for="system in data?.systems || []"
          :key="system.key"
          class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="text-xl font-semibold">{{ system.label }}</div>
              <div class="mt-1 text-sm text-neutral-500">
                {{ system.key }} · v{{ system.version }}
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <NuxtLink
                :to="`/api/systems/${system.key}`"
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Full JSON
              </NuxtLink>

              <NuxtLink
                :to="`/api/systems/${system.key}/entity/spell`"
                class="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Spell Schema
              </NuxtLink>
            </div>
          </div>

          <p class="mt-4 text-sm text-neutral-300">
            {{ system.description }}
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="importer in system.importerSupport || []"
              :key="importer"
              class="rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300"
            >
              {{ importer }}
            </span>
          </div>

          <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="entity in system.entityTypes"
              :key="entity.entityType"
              class="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div class="text-sm font-semibold text-neutral-100">
                {{ entity.label }}
              </div>
              <div class="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                {{ entity.entityType }}
              </div>
              <div class="mt-3 text-sm text-neutral-400">
                Blocks: {{ entity.blockCount }}
              </div>
              <div class="mt-3">
                <NuxtLink
                  :to="`/api/systems/${system.key}/entity/${entity.entityType}`"
                  class="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  View Entity Schema
                </NuxtLink>
              </div>
            </div>
          </div>

          <div class="mt-5 text-sm text-neutral-500">
            Shared blocks: {{ system.sharedBlockCount }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
