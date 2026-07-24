<script setup lang="ts">
defineProps<{
  show: boolean
}>()
</script>

<template>
  <div
    v-if="show"
    class="pointer-events-none absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.38)] bg-[rgba(20,17,12,0.82)] px-4 py-2 text-sm font-medium text-[#f5e7bd] backdrop-blur shadow-[0_0_24px_rgba(201,164,90,0.12)]"
  >
    <UIcon
      name="i-lucide-pencil-ruler"
      class="h-4 w-4"
    />
    Build Mode — click map to place pin
  </div>
</template>
