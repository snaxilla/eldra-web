<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId: string | number
  entityId: string | number
  mode?: 'play' | 'build' | string
  saving?: boolean
  restSaving?: boolean
  restSaveError?: string
  restSaveSuccess?: string
}>(), {
  mode: 'play',
  saving: false,
  restSaving: false,
  restSaveError: '',
  restSaveSuccess: ''
})

const emit = defineEmits<{
  (event: 'refresh'): void
  (event: 'save'): void
  (event: 'short-rest'): void
  (event: 'long-rest'): void
}>()
</script>

<template>
  <div class="sheet-desktop-only mb-4 hidden flex-wrap items-center justify-between gap-3 md:flex">
    <NuxtLink
      :to="`/worlds/${props.worldId}/entities/${props.entityId}`"
      class="eldra-button rounded-none px-4 py-2 text-sm"
    >
      Back to Article
    </NuxtLink>

    <div class="flex flex-wrap items-center justify-end gap-2">
      <CharactersSheetRestControls
        :saving="restSaving"
        :error="restSaveError"
        :success="restSaveSuccess"
        @short-rest="emit('short-rest')"
        @long-rest="emit('long-rest')"
      />

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
