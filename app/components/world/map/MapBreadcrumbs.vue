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
  <!-- --eldra-map-inset-left: floating workspace sidebar width on the
       full-bleed World Map (0 elsewhere). -->
  <nav aria-label="Map breadcrumbs" class="absolute top-4 z-20 flex items-center gap-2 left-[calc(var(--eldra-map-inset-left,0px)+1rem)] transition-[left] duration-200">
    <button
      type="button"
      class="eldra-map-control inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold"
      @click="emit('root')"
    >
      <UIcon
        name="i-lucide-orbit"
        class="eldra-map-control-icon h-4 w-4"
      />
      <span class="eldra-display">World Map</span>
    </button>

    <button
      v-for="ancestor in ancestorMaps"
      :key="ancestor.id"
      type="button"
      class="eldra-map-control inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm"
      @click="emit('ancestor', ancestor.slug)"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="h-4 w-4 opacity-70"
      />
      <span>{{ ancestor.title }}</span>
    </button>

    <div
      v-if="activeMap && String(activeMap.id) !== String(worldRootMap?.id || '')"
      class="eldra-map-control eldra-display inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm"
      aria-current="page"
    >
      <UIcon
        name="i-lucide-map"
        class="eldra-map-control-icon h-4 w-4"
      />
      <span>{{ activeMap.title }}</span>
    </div>
  </nav>
</template>
