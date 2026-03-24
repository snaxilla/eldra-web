<script setup lang="ts">
const route = useRoute()
const worldId = route.params.id

const { data: world } = await useFetch(`/api/worlds/${worldId}`)
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8 shadow-[0_10px_24px_rgba(80,60,30,0.10)]">
      <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
        Entities
      </div>

      <h1 class="mt-3 text-4xl font-semibold tracking-[0.04em] text-[#2f2419]">
        {{ world?.name || 'World' }} Entities
      </h1>

      <p class="mt-4 text-base leading-7 text-[#4f4030]">
        This will become the full entity browser for the active world.
      </p>
    </section>

    <section class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8">
      <div class="text-[#4f4030]">
        Placeholder page. Next step is wiring in the actual entity list for world {{ worldId }}.
      </div>
    </section>
  </div>
</template>
