<script setup lang="ts">
import type { SceneModel } from '~/lib/eldra/scene'

const props = withDefaults(defineProps<{
  open: boolean
  scene: SceneModel
  showTrigger?: boolean
}>(), {
  showTrigger: true,
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-layer', payload: { layerId: string; visible: boolean }): void
}>()

function onLayerToggle(layerId: string, event: Event) {
  const input = event.target as HTMLInputElement
  emit('toggle-layer', { layerId, visible: input.checked })
}
</script>

<template>
  <button
    v-if="props.showTrigger"
    type="button"
    class="eldra-map-control absolute bottom-6 left-[calc(var(--eldra-map-inset-left,0px)+1.5rem)] z-30 inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold"
    @click="emit('close')"
  >
    <UIcon
      name="i-lucide-layers-3"
      class="h-4 w-4 text-eldra-accent-text"
    />
    <span>Layers</span>
  </button>

  <Transition
    enter-from-class="-translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="-translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="open"
      class="eldra-ornate-panel eldra-glass-surface isolate absolute top-32 z-30 w-80 rounded-none border p-5 left-[calc(var(--eldra-map-inset-left,0px)+1rem)] transition-[left] duration-200"
    >
      <span class="eldra-ornament-frame" aria-hidden="true" />

      <h2 class="eldra-display text-sm uppercase text-eldra-text">
        Map Layers
      </h2>
      <span class="eldra-ornament-divider mt-2" aria-hidden="true" />

      <div class="mt-4 space-y-2">
        <label
          v-for="layer in props.scene.layers"
          :key="layer.id"
          class="flex items-center gap-3 text-sm text-eldra-text-soft"
        >
          <input
            :checked="layer.visible"
            :disabled="layer.locked"
            type="checkbox"
            @change="onLayerToggle(layer.id, $event)"
          >
          <span>{{ layer.label }}</span>
        </label>
      </div>
    </div>
  </Transition>
</template>
