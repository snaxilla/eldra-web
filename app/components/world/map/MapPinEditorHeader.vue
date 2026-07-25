<script setup lang="ts">
defineProps<{
  editingPin: any
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="flex items-center justify-between border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
    <div>
      <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
        Build Mode
      </div>

      <h3 class="mt-1 text-lg font-semibold text-white">
        {{ editingPin?.id ? 'Edit Pin' : 'Place Pin' }}
      </h3>
    </div>

    <button
      class="text-[#9f9278] transition hover:text-white"
      @click="emit('close')"
    >
      <UIcon
        name="i-lucide-x"
        class="h-5 w-5"
      />
    </button>
  </div>
</template>
