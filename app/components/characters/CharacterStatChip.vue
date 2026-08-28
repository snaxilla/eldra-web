<script setup lang="ts">
// CharacterStatChip -- the canonical label/value chip. Character Sheet
// Beautification Pass, Phase 1 (see
// .github/docs/architecture/character-sheet-beauty-pass.md section 8.2).
// First adopter: sheet-v2.vue's Equipment Slots row (label = slot id,
// value = capacity), which already rendered through `.eldra-gold-chip`
// as hand-written markup -- this centralizes it, unchanged visually.

withDefaults(defineProps<{
  label: string
  value: string | number
  icon?: string
}>(), {
  icon: ''
})
</script>

<template>
  <div class="eldra-gold-chip inline-flex items-center gap-1.5 rounded-none border px-3 py-1 text-xs capitalize">
    <UIcon
      v-if="icon"
      :name="icon"
      class="h-3 w-3"
    />
    {{ label }} &middot; {{ value }}
  </div>
</template>
