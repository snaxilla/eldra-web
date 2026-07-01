<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
  entityId: string | number
  mode?: string
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'refresh'): void
  (event: 'save'): void
}>()

const articleUrl = computed(() => `/worlds/${props.worldId}/entities/${props.entityId}`)
</script>

<template>
  <div class="sheet-desktop-only mb-4 hidden flex-wrap items-center justify-between gap-3 md:flex">
    <NuxtLink
      :to="articleUrl"
      class="eldra-button rounded-none px-4 py-2 text-sm"
    >
      Back to Article
    </NuxtLink>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="eldra-button rounded-none px-4 py-2 text-sm"
        @click="emit('refresh')"
      >
        Refresh Sheet
      </button>

      <button
        v-if="mode === 'build'"
        type="button"
        class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
        :disabled="saving"
        @click="emit('save')"
      >
        {{ saving ? 'Saving...' : 'Save Sheet' }}
      </button>
    </div>
  </div>
</template>
