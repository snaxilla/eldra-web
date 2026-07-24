<script setup lang="ts">
defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <button
    type="button"
    class="eldra-button fixed bottom-6 left-6 z-30 inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-semibold backdrop-blur"
    @click="emit('close')"
  >
    <UIcon
      name="i-lucide-layers-3"
      class="h-4 w-4 text-[#f5e7bd]"
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
      class="eldra-ornate-panel eldra-frame-corners fixed bottom-24 left-6 z-30 w-80 rounded-none border p-5 backdrop-blur"
    >
      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Map Layers
      </div>

      <div class="mt-4 space-y-2">

        <label class="flex items-center gap-3 text-sm text-[#d8ceb8]">
          <input checked disabled type="checkbox">
          <span>Base Map</span>
        </label>

        <label class="flex items-center gap-3 text-sm text-[#d8ceb8]">
          <input checked disabled type="checkbox">
          <span>Pins</span>
        </label>

      </div>

      <div
        class="mt-5 border-t border-[rgba(201,164,90,0.18)] pt-4 text-xs text-[#9f9278]"
      >
        Layer system coming in the next commits...
      </div>
    </div>
  </Transition>
</template>
