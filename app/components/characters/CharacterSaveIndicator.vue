<script setup lang="ts">
// CharacterSaveIndicator -- the canonical save-state presentation.
// Character Sheet Beautification Pass, Phase 1 (see
// .github/docs/architecture/character-sheet-beauty-pass.md section 7.8:
// "Saving -- a single CharacterSaveIndicator in the vitals bar, not
// per-panel text."). Built this phase so Phase 3's Vitals Bar has it
// ready to drop in; NOT wired into sheet-v2.vue yet -- its intended home
// (the Vitals Bar) doesn't exist until Phase 3, and every per-panel
// `saving`/`error-message` prop it will eventually replace belongs to
// child components (CharacterInventoryPanel.vue and siblings), which are
// outside this phase's file scope (sheet-v2.vue template only).

withDefaults(defineProps<{
  saving?: boolean
  error?: string
}>(), {
  saving: false,
  error: ''
})
</script>

<template>
  <span
    v-if="saving || error"
    class="inline-flex items-center gap-1.5 text-xs"
    :class="error ? 'text-red-300' : 'text-[#9f9278]'"
  >
    <UIcon
      v-if="saving"
      name="i-lucide-loader-2"
      class="h-3.5 w-3.5 animate-spin"
    />
    <UIcon
      v-else-if="error"
      name="i-lucide-alert-triangle"
      class="h-3.5 w-3.5"
    />
    {{ error || 'Saving…' }}
  </span>
</template>
