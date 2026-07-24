<script setup lang="ts">
defineProps<{
  open: boolean
  selectedPin: any
  formatLocationType: (value: any) => string
  iconLabel: (value: any) => string
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
}>()
</script>

<template>
  <Transition
    enter-from-class="translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="open"
      class="eldra-ornate-panel eldra-frame-corners fixed bottom-6 right-6 z-30 w-80 rounded-none border p-5 backdrop-blur"
    >
      <div class="mb-1 text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        {{ formatLocationType(selectedPin.pinType) || 'Location' }}
      </div>

      <div class="text-xl font-semibold text-white">
        {{ selectedPin.resolvedTitle }}
      </div>

      <div class="mt-2 text-sm text-[#9f9278]">
        Icon: {{ iconLabel(selectedPin.icon) }}
      </div>

      <div class="mt-4 flex gap-2">
        <button
          class="eldra-button flex-1 rounded-none px-3 py-2 text-sm"
          @click="emit('edit')"
        >
          Edit
        </button>

        <button
          class="rounded-none border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20"
          @click="emit('delete')"
        >
          Delete
        </button>
      </div>
    </div>
  </Transition>
</template>
