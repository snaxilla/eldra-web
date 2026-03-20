<script setup lang="ts">
const props = defineProps<{
  type?: string
}>()

const { iconFor, labelFor } = useEntityTypeUi()
</script>

<template>
  <div class="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200">
    <UIcon :name="iconFor(props.type)" class="h-4 w-4" />
    <span>{{ labelFor(props.type) }}</span>
  </div>
</template>
