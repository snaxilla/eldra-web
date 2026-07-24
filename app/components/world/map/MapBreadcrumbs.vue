<script setup lang="ts">
defineProps<{
  activeMap: any
  worldRootMap: any
  ancestorMaps: any[]
}>()

const emit = defineEmits<{
  (e: 'root'): void
  (e: 'ancestor', slug: string): void
}>()
</script>

<template>
  <div class="absolute left-4 top-4 z-20 flex items-center gap-2">
    <button
      type="button"
      class="eldra-button inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold backdrop-blur"
      @click="emit('root')"
    >
      <UIcon
        name="i-lucide-orbit"
        class="h-4 w-4 text-[#f5e7bd]"
      />
      <span>World Map</span>
    </button>

    <button
      v-for="ancestor in ancestorMaps"
      :key="ancestor.id"
      type="button"
      class="eldra-button inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm text-[#e8d9b5] backdrop-blur"
      @click="emit('ancestor', ancestor.slug)"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="h-4 w-4 text-[#9f9278]"
      />
      <span>{{ ancestor.title }}</span>
    </button>

    <div
      v-if="activeMap && String(activeMap.id) !== String(worldRootMap?.id || '')"
      class="eldra-button inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold text-[#fff7df] backdrop-blur"
    >
      <UIcon
        name="i-lucide-map"
        class="h-4 w-4 text-[#f5e7bd]"
      />
      <span>{{ activeMap.title }}</span>
    </div>
  </div>
</template>
