<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  icon?: string
}>()
</script>

<template>
  <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div>
        <div class="text-lg font-semibold text-neutral-100">
          {{ title }}
        </div>
        <div v-if="subtitle" class="mt-1 text-sm text-neutral-400">
          {{ subtitle }}
        </div>
      </div>

      <UIcon v-if="icon" :name="icon" class="h-5 w-5 shrink-0 text-neutral-500" />
    </div>

    <slot />
  </div>
</template>
