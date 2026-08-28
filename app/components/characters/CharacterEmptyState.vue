<script setup lang="ts">
// CharacterEmptyState -- the canonical "nothing here yet" presentation.
// Character Sheet Beautification Pass, Phase 1 (see
// .github/docs/architecture/character-sheet-beauty-pass.md section 7.8:
// "Empty -- icon + one-line explanation + the action that fixes it, in
// `eldra-empty`" and section 8.2). Uses the existing `.eldra-empty`
// global class (already the established empty-state treatment elsewhere
// in the app -- WorldEntityInteractivePage.vue, enemies.vue) rather than
// a bespoke style, per that "foundations already in place" listing.
//
// `compact` trades the centered/padded full treatment for a slim inline
// row, for empty messages that sit inside an already-small area (e.g. a
// character's own condition list) where the full block would be an
// actual visual escalation, not just a wrapper change.

withDefaults(defineProps<{
  message?: string
  icon?: string
  compact?: boolean
}>(), {
  message: '',
  icon: '',
  compact: false
})
</script>

<template>
  <div
    class="eldra-empty rounded-none"
    :class="compact ? 'p-3' : 'p-10 text-center shadow-xl'"
  >
    <UIcon
      v-if="icon"
      :name="icon"
      :class="compact ? 'mb-1.5 inline-block h-4 w-4 align-[-2px] text-[#9f9278]' : 'mx-auto mb-3 h-8 w-8 text-[#9f9278]'"
    />
    <p
      class="text-sm text-[#d8ceb8]"
      :class="compact ? '' : 'mx-auto max-w-sm'"
    >
      <slot>{{ message }}</slot>
    </p>
    <div
      v-if="$slots.action"
      :class="compact ? 'mt-2' : 'mt-3 flex justify-center'"
    >
      <slot name="action" />
    </div>
  </div>
</template>
