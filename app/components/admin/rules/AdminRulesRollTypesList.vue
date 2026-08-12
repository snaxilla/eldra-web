<script setup lang="ts">
defineProps<{
  rollTypes: Array<{
    id: string
    label: string
    rollSpec: string
    surfaces: readonly string[]
    visibility?: string
    order: number
  }>
}>()
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
      Resolved Roll Types
    </div>
    <h3 class="mt-2 text-lg font-semibold text-white">
      Rolls this World Surfaces
    </h3>

    <div
      v-if="!rollTypes.length"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
    >
      This package declares no roll types.
    </div>

    <div
      v-else
      class="mt-4 grid gap-2"
    >
      <article
        v-for="rollType in rollTypes"
        :key="rollType.id"
        class="grid grid-cols-[1fr_auto] items-center gap-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.38)] p-3"
      >
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-white">
            {{ rollType.label }}
          </div>
          <div class="mt-1 truncate text-xs text-[#9f9278]">
            {{ rollType.rollSpec }} &middot; {{ rollType.surfaces.join(', ') }}
            <span v-if="rollType.visibility"> &middot; {{ rollType.visibility }}</span>
          </div>
        </div>

        <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d8ceb8]">
          #{{ rollType.order }}
        </span>
      </article>
    </div>
  </div>
</template>
