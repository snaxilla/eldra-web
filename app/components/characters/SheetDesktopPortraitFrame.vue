<script setup lang="ts">
defineProps<{
  imageUrl?: string
  sheet?: any
  entity?: any
}>()
</script>

<template>
  <div
    v-if="imageUrl"
    class="sheet-desktop-only eldra-image-frame mt-6 hidden overflow-hidden rounded-none border bg-black/20 md:block"
  >
    <img
      :src="imageUrl"
      :alt="sheet?.name || entity?.title || 'Character Portrait'"
      class="max-h-[260px] w-full object-cover object-[center_15%] md:max-h-[420px]"
    >
  </div>
</template>
