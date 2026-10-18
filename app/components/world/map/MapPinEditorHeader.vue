<script setup lang="ts">
defineProps<{
  editingPin: any
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="relative flex items-center justify-between px-6 pb-5 pt-6">
    <div>
      <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
        Build Mode
      </div>

      <h3 class="eldra-display mt-1 text-lg text-white">
        {{ editingPin?.id ? 'Edit Pin' : 'Place Pin' }}
      </h3>
    </div>

    <button
      type="button"
      class="text-[#9f9278] transition hover:text-white"
      aria-label="Close pin editor"
      @click="emit('close')"
    >
      <UIcon
        name="i-lucide-x"
        class="h-5 w-5"
      />
    </button>

    <span class="eldra-ornament-divider absolute inset-x-6 bottom-0" aria-hidden="true" />
  </div>
</template>
