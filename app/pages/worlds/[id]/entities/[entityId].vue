<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))
const entityId = computed(() => String(route.params.entityId || ''))

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: entity } = await useFetch(() => `/api/entities/${entityId.value}`)
</script>

<template>
  <div class="h-full overflow-y-auto bg-[#09111a] p-8">
    <div class="mx-auto max-w-5xl">
      <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
        {{ world?.name || 'World' }}
      </div>

      <h1 class="mt-3 text-5xl font-semibold tracking-tight text-white">
        {{ entity?.title || 'Entity' }}
      </h1>

      <div class="mt-4 flex flex-wrap gap-2">
        <div class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300">
          {{ entity?.entity_type || 'entity' }}
        </div>
        <div class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300">
          {{ entity?.slug || 'no-slug' }}
        </div>
      </div>

      <div class="mt-8 rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
        <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
          Summary
        </div>

        <p class="mt-4 whitespace-pre-wrap text-lg leading-8 text-slate-100">
          {{ entity?.summary || 'No summary yet.' }}
        </p>
      </div>
    </div>
  </div>
</template>
