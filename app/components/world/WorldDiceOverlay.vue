<script setup lang="ts">
// WorldDiceOverlay -- the World-scoped mount point for the Dice
// Presentation Layer. Eldra Roll System Phase 3A
// (.github/docs/architecture/eldra-roll-system.md §11).
//
// WORLD SCOPE, NOT CHARACTER SHEET (this task's own section, verbatim):
// mounted exactly ONCE, in app/layouts/world-workspace.vue, so it is
// present for every page a World workspace renders -- the Character
// Sheet today, and an Encounter Screen / World Map / future DM Screen /
// Developer Sandbox tomorrow -- without any of those surfaces mounting
// their own copy. This file itself holds no state at all: it is pure
// positioning chrome around WorldDiceStage.vue, which reads the shared
// useDiceAnimationQueue() singleton directly.
//
// LOCATION: docked bottom-right on desktop/tablet, sitting ABOVE where
// WorldRollTray.vue itself docks (`bottom-6`) so a completed animation
// visually settles into the tray beneath it once the queue reveals it --
// the same "one, canonical, world-scoped celebration point" every future
// gameplay system shares. Mobile centers it near the bottom, above the
// same reserved space WorldRollTray.vue's own mobile sheet already
// respects. `z-35` sits deliberately between WorldRollTray's `z-30` and
// any modal-level `z-50+` surface -- never fighting either for stacking
// order.
//
// RENDERS NOTHING VISIBLE WHEN IDLE: WorldDiceStage.vue's own `v-if`
// means this fixed-position host is inert chrome (zero opacity, zero
// pointer capture) until a roll is actually queued -- never a permanent
// panel.

import WorldDiceStage from '~/components/world/WorldDiceStage.vue'
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-24 z-[35] flex justify-center sm:inset-x-auto sm:bottom-28 sm:right-6 sm:justify-end">
    <div class="pointer-events-auto">
      <WorldDiceStage />
    </div>
  </div>
</template>
