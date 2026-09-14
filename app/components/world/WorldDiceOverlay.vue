<script setup lang="ts">
// WorldDiceOverlay -- the World-scoped mount point for the Dice
// Presentation Layer. Eldra Roll System Phase 3A/3B
// (.github/docs/architecture/eldra-roll-system.md §11).
//
// WORLD SCOPE, NOT CHARACTER SHEET (this task's own section, verbatim):
// mounted exactly ONCE, in app/layouts/world-workspace.vue, so it is
// present for every page a World workspace renders -- the Character
// Sheet today, and an Encounter Screen / World Map / future DM Screen /
// Developer Sandbox tomorrow -- without any of those surfaces mounting
// their own copy. WorldDiceStage.vue reads the shared
// useDiceAnimationQueue() singleton directly (no props from this file);
// this component's own job is positioning chrome PLUS -- as of Phase
// 3B -- registering the real renderer that queue plays through.
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
//
// ---------------------------------------------------------------------------
// PHASE 3B: THE ONE PLACE THE REAL RENDERER IS MOUNTED AND REGISTERED
// ---------------------------------------------------------------------------
// A single, headless EldraDiceBox instance mounts here (`<ClientOnly>`,
// matching the DOM/WebGL-only reason entities/[entityId]/sheet.vue's own
// mount already needs it) -- NOT inside the Character Sheet, an
// Encounter, the Developer Sandbox, or WorldRollTray.vue itself (this
// task's own WORLD SCOPE section: those consume the presentation layer,
// they do not own it). `headless` suppresses EldraDiceBox's own result
// card/history strip/critical banners, which would otherwise duplicate
// WorldDiceStage.vue/WorldRollTray.vue -- see that prop's own doc on
// EldraDiceBox.client.vue.
//
// The adapter (eldraDiceRendererAdapter.ts) is registered with the shared
// queue on mount and un-registered on unmount -- `useDiceAnimationQueue()`
// falls back to its own built-in placeholder automatically whenever no
// renderer is registered (Phase 3A's own design), which is also exactly
// how FAILURE MODE is satisfied: if a `play()` call reports the renderer
// errored, the adapter calls back here to un-register itself, and every
// later roll (this session) uses the placeholder instead -- gameplay
// keeps moving either way, since the queue's own promise always resolves
// regardless of which path ran.

import EldraDiceBox from '~/components/EldraDiceBox.client.vue'
import WorldDiceStage from '~/components/world/WorldDiceStage.vue'
import { createEldraDiceRendererAdapter, type EldraDiceBoxExposed } from '~/components/world/eldraDiceRendererAdapter'
import { useDiceAnimationQueue } from '~/composables/useDiceAnimationQueue'

const diceBoxRef = ref<EldraDiceBoxExposed | null>(null)
const diceQueue = useDiceAnimationQueue()

onMounted(() => {
  const adapter = createEldraDiceRendererAdapter(diceBoxRef, () => {
    diceQueue.setRenderer(null)
  })
  diceQueue.setRenderer(adapter)
})

onBeforeUnmount(() => {
  diceQueue.setRenderer(null)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-24 z-[35] flex justify-center sm:inset-x-auto sm:bottom-28 sm:right-6 sm:justify-end">
    <div class="pointer-events-auto">
      <WorldDiceStage />
    </div>
  </div>

  <ClientOnly>
    <EldraDiceBox
      ref="diceBoxRef"
      headless
    />
  </ClientOnly>
</template>
