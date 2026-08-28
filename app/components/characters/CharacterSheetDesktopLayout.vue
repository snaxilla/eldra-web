<script setup lang="ts">
// CharacterSheetDesktopLayout -- Character Sheet Beautification Pass,
// Phase 4 (see .github/docs/architecture/character-sheet-beauty-pass.md
// §4, §8.1, §11 Phase 4). The 3-column grid itself: left rail / center /
// right rail, exactly the column widths and breakpoints §4 specifies.
// Owns no data -- `vitalsHeight` (measured by CharacterSheetShell.vue) is
// the only input, used to keep both rails sticky immediately below the
// Vitals Bar and independently scrollable within their own remaining
// viewport height, per §4's own CSS ("sticky top-[var(--vitals-h)]
// max-h-[calc(100dvh-var(--vitals-h))] overflow-y-auto") and this task's
// explicit "Independent rail scrolling" / "Sticky rails beneath the
// Vitals Bar" requirements.

defineProps<{
  vitalsHeight: number
}>()
</script>

<template>
  <div class="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px] 2xl:grid-cols-[320px_minmax(0,1fr)_340px]">
    <aside
      class="min-w-0 overflow-y-auto"
      :style="{ position: 'sticky', top: `${vitalsHeight}px`, maxHeight: `calc(100dvh - ${vitalsHeight}px)` }"
    >
      <div class="grid gap-4">
        <slot name="left" />
      </div>
    </aside>

    <div class="min-w-0">
      <slot name="center" />
    </div>

    <aside
      class="min-w-0 overflow-y-auto"
      :style="{ position: 'sticky', top: `${vitalsHeight}px`, maxHeight: `calc(100dvh - ${vitalsHeight}px)` }"
    >
      <div class="grid gap-4">
        <slot name="right" />
      </div>
    </aside>
  </div>
</template>
