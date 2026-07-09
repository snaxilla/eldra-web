<script setup lang="ts">
const props = defineProps<{
  mode?: string
  sheet?: any
  entity?: any
  name?: string
}>()

const emit = defineEmits<{
  (event: 'update:name', value: string): void
}>()

function updateName(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update:name', target?.value || '')
}
</script>

<template>
  <div class="sheet-title-frame sheet-desktop-only hidden flex-col gap-4 md:flex md:flex-row md:items-end md:justify-between">
    <div class="min-w-0 flex-1">
      <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Character Sheet</div>

      <input
        v-if="mode === 'build'"
        :value="name"
        class="eldra-input mt-2 w-full rounded-none px-4 py-2 text-2xl font-semibold text-white sm:text-4xl"
        placeholder="Character name"
        @input="updateName"
      >

      <h1
        v-else
        class="mt-2 text-3xl font-semibold text-white sm:text-4xl"
      >
        {{ sheet?.name || entity?.title || 'Character' }}
      </h1>

      <p class="mt-2 text-sm text-[#d8ceb8]">
        Mobile-first mechanical sheet foundation.
      </p>
    </div>

    <div class="eldra-gold-chip rounded-none border px-3 py-1.5 text-xs uppercase tracking-[0.18em]">
      {{ sheet?.sheet_type || 'dnd5e' }}
    </div>
  </div>
</template>
