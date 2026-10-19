<script setup lang="ts">
// CharacterSheetBottomSheet -- the bottom-sheet presentation of the sheet's
// contextual inspector (Phase 4C). Extracted unchanged from
// CharacterSheetCompanionLayout.vue so the compact desktop presentation can
// present the SAME inspector content the same way, instead of laying the
// 380px workspace rail over the gameplay columns.
//
// Presentation only: a scrim, a sheet fixed to the bottom of the viewport
// (laid over the page, so the page's own scroll position is never
// touched), and a grip that closes the sheet when swiped down. What goes
// inside is the host's slot -- WorldEntityContextDrawer in its `inline`
// placement. Escape and focus handling stay with CharacterSheetShell.
withDefaults(defineProps<{
  open: boolean
  label?: string
}>(), {
  label: 'Details'
})

const emit = defineEmits<{
  close: []
}>()

const dragOffset = ref(0)
let dragStartY: number | null = null

function onGripStart(event: TouchEvent) {
  dragStartY = event.touches[0]?.clientY ?? null
}

function onGripMove(event: TouchEvent) {
  if (dragStartY === null) return
  dragOffset.value = Math.max(0, (event.touches[0]?.clientY ?? dragStartY) - dragStartY)
}

function onGripEnd() {
  if (dragOffset.value > 80) emit('close')
  dragOffset.value = 0
  dragStartY = null
}
</script>

<template>
  <div
    v-if="open"
    class="eldra-bottom-sheet__scrim"
    aria-hidden="true"
    @click="emit('close')"
  />
  <aside
    class="eldra-bottom-sheet"
    :class="open ? 'is-open' : ''"
    :aria-label="label"
    :style="dragOffset ? { translate: `0 ${dragOffset}px` } : undefined"
    data-sheet-region="inspector"
    data-sheet-inspector-host
  >
    <div
      class="eldra-bottom-sheet__grip"
      aria-hidden="true"
      @touchstart.passive="onGripStart"
      @touchmove.passive="onGripMove"
      @touchend="onGripEnd"
      @touchcancel="onGripEnd"
    >
      <span />
    </div>
    <slot />
  </aside>
</template>

<style scoped>
.eldra-bottom-sheet__scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgb(0 0 0 / 0.5);
}

.eldra-bottom-sheet {
  display: none;
  position: fixed;
  inset: auto 0 0;
  z-index: 61;
  height: min(85dvh, 44rem);
  padding-bottom: env(safe-area-inset-bottom);
}

.eldra-bottom-sheet.is-open {
  display: flex;
  flex-direction: column;
}

.eldra-bottom-sheet > :deep(:last-child) {
  flex: 1;
  min-height: 0;
}

.eldra-bottom-sheet__grip {
  display: flex;
  justify-content: center;
  padding: 0.5rem 0 0.25rem;
  margin-bottom: -0.25rem;
  position: relative;
  z-index: 1;
  touch-action: none;
  background: rgb(var(--eldra-panel-rgb) / max(var(--eldra-panel-alpha), 0.94));
  border-top: 1px solid var(--eldra-border);
}

.eldra-bottom-sheet__grip span {
  display: block;
  width: 2.5rem;
  height: 0.25rem;
  border-radius: 999px;
  background: rgb(var(--eldra-accent-rgb) / 0.45);
}

/* On a wide desktop container the sheet is centred at a readable width
   rather than stretched edge to edge. */
@media (min-width: 900px) {
  .eldra-bottom-sheet {
    left: 50%;
    right: auto;
    width: min(44rem, calc(100vw - 2rem));
    transform: translateX(-50%);
    height: min(70dvh, 40rem);
  }
}
</style>
