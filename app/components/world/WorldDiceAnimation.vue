<script setup lang="ts">
// WorldDiceAnimation -- the innermost, purely presentational piece of the
// Dice Presentation Layer. Eldra Roll System Phase 3A
// (.github/docs/architecture/eldra-roll-system.md §11).
//
// PURE PLACEHOLDER, NO QUEUE KNOWLEDGE. This component renders exactly one
// `DiceAnimationRequest` in exactly one `DiceAnimationState` -- it never
// imports useDiceAnimationQueue.ts, never decides what comes next, and
// never reads history/pagination/visibility (WorldRollTray.vue's own
// domain, per this task's own COMPONENT RESPONSIBILITIES). This is also
// the ONE piece of the three-component split
// (WorldDiceOverlay/WorldDiceStage/WorldDiceAnimation) a future Phase 3B
// renderer most directly supersedes or augments: today it is a CSS
// icon/fade/scale; the day a DiceRendererAdapter is registered
// (~/lib/dice-presentation/renderer.ts), a real implementation plays
// INSIDE the same slot this file currently fills, without
// WorldDiceStage.vue or WorldDiceOverlay.vue needing to change at all.
//
// "SIMPLE DIE ICON. FADE. SCALE. SUBTLE MOTION." (this task's own
// examples, verbatim) -- a single `i-lucide-dices` icon that gently
// rocks while `state === 'animating'`, settles when `state === 'complete'`
// and reveals the roll's own already-authoritative total. NEVER a
// contrived readout: every number below came from `request.roll`, which
// was already final before this component ever mounted.

import type { DiceAnimationRequest, DiceAnimationState } from '~/lib/dice-presentation/types'

defineProps<{
  request: DiceAnimationRequest
  state: DiceAnimationState
}>()
</script>

<template>
  <div class="flex min-w-[9rem] flex-col items-center gap-2 text-center">
    <div
      class="flex h-12 w-12 items-center justify-center rounded-none border border-[rgba(201,164,90,0.4)] bg-[rgba(201,164,90,0.1)] transition-transform duration-300"
      :class="state === 'animating' ? 'eldra-dice-tumble' : 'scale-100'"
    >
      <UIcon
        name="i-lucide-dices"
        class="h-6 w-6 text-[#c9a45a]"
      />
    </div>

    <div class="min-w-0 max-w-[10rem] truncate text-xs uppercase tracking-[0.18em] text-[#9f9278]">
      {{ request.roll.label }}
    </div>

    <div
      v-if="state === 'complete'"
      class="font-mono text-2xl font-semibold text-[#fff7df]"
    >
      {{ request.roll.total }}
    </div>
    <div
      v-else
      class="text-xs text-[#6f6754]"
    >
      Rolling…
    </div>
  </div>
</template>

<style scoped>
/* Subtle motion only -- no particles, no bounce past a few degrees. */
.eldra-dice-tumble {
  animation: eldra-dice-tumble 900ms ease-in-out infinite;
}

@keyframes eldra-dice-tumble {
  0%,
  100% {
    transform: rotate(-6deg) scale(1);
  }

  50% {
    transform: rotate(6deg) scale(1.08);
  }
}
</style>
