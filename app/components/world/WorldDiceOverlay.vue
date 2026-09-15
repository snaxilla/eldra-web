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
// PHASE 3B (RENDERER REPLACEMENT): THE ONE PLACE THE REAL RENDERER IS
// MOUNTED AND REGISTERED
// ---------------------------------------------------------------------------
// A single WorldDiceThreeRenderer instance mounts here (`<ClientOnly>`,
// matching the DOM/WebGL-only reason entities/[entityId]/sheet.vue's own
// EldraDiceBox mount already needs it) -- NOT inside the Character Sheet,
// an Encounter, the Developer Sandbox, or WorldRollTray.vue itself (this
// task's own WORLD SCOPE section: those consume the presentation layer,
// they do not own it). WorldDiceThreeRenderer.client.vue renders only a
// canvas -- no result card/history strip/critical banners of its own,
// which would otherwise duplicate WorldDiceStage.vue/WorldRollTray.vue.
//
// This REPLACES the previously-registered EldraDiceBox-backed renderer
// (@3d-dice/dice-box@1.1.4): that library cannot guarantee a die's visible
// resting face matches the authoritative RollEventRecord -- see
// worldDiceThreeRendererAdapter.ts's and WorldDiceThreeRenderer
// .client.vue's own headers for the full reasoning and the predetermined-
// outcome mechanism @3d-dice/dice-box-threejs uses instead.
// EldraDiceBox.client.vue and @3d-dice/dice-box remain installed and
// unchanged for entities/[entityId]/sheet.vue's own separate, still-legacy
// notation-only roll path -- this file no longer imports either.
//
// The adapter (worldDiceThreeRendererAdapter.ts) is registered with the
// shared queue on mount and un-registered on unmount --
// `useDiceAnimationQueue()` falls back to its own built-in placeholder
// automatically whenever no renderer is registered (Phase 3A's own
// design), which is also exactly how FAILURE MODE is satisfied: if a
// `play()` call reports the renderer errored, the adapter calls back here
// to un-register itself, and every later roll (this session) uses the
// placeholder instead -- gameplay keeps moving either way, since the
// queue's own promise always resolves regardless of which path ran.
//
// ---------------------------------------------------------------------------
// PHASE 4B (AUTHORED CSS d20 PROOF OF CONCEPT): A SECOND RENDERER,
// SELECTABLE, RETAINED
// ---------------------------------------------------------------------------
// WorldAuthoredDiceRenderer.vue mounts here TOO, unconditionally,
// alongside WorldDiceThreeRenderer -- ADR-024 §13's migration plan is
// explicit that renderers coexist through Phase 4F. Its purpose
// (validating the authored-presentation architecture: deterministic
// targets, fixed duration, DiceRendererAdapter as the correct seam) is
// done -- Phase 4B.1's own CSS/DOM visual quality did not clear ADR-024's
// gate, which is why Phase 4B.1 exists at all -- but the component and
// its exhaustive orientation tests remain genuine, working evidence, and
// a genuine three-way comparison option, not dead code. See
// useDiceRendererMode.ts's own header for the full reasoning behind
// keeping it registerable rather than deleting it.
//
// ---------------------------------------------------------------------------
// PHASE 4B.1 (AUTHORED THREE.JS d20 PROOF OF CONCEPT, ADR-024 OPTION 2): A
// THIRD RENDERER
// ---------------------------------------------------------------------------
// WorldAuthoredThreeDiceRenderer.client.vue mounts here too -- a real
// WebGL/Three.js renderer (`.client.vue` suffix required, unlike its CSS
// sibling), invoked as ADR-024's own named fallback after Phase 4B's
// CSS/DOM approach. `useDiceAnimationQueue.ts` only ever holds ONE
// registered renderer at a time (`setRenderer()` replaces, never adds);
// `useDiceRendererMode()` (a plain, session-local `useState`, default
// `'physics'` -- Phase 4B's own boolean flag, widened to a three-way mode
// now that three renderers exist to choose between, see that composable's
// own header) decides which of the three adapters is actually registered,
// and is watched so choosing a different mode (AdminRollSandbox.vue's own
// selector) takes effect on the very next roll with no page reload. All
// three renderer components remain mounted regardless of mode --
// WorldDiceThreeRenderer's and WorldAuthoredThreeDiceRenderer's own lazy
// self-init (each dynamically imports its own 3D library only on the
// FIRST roll it actually renders) and WorldAuthoredDiceRenderer's own
// zero-asset CSS/DOM approach all mean an unregistered, never-called
// renderer costs nothing merely by being present in the DOM.

import WorldAuthoredDiceRenderer from '~/components/world/WorldAuthoredDiceRenderer.vue'
import WorldAuthoredThreeDiceRenderer from '~/components/world/WorldAuthoredThreeDiceRenderer.client.vue'
import WorldDiceStage from '~/components/world/WorldDiceStage.vue'
import WorldDiceThreeRenderer from '~/components/world/WorldDiceThreeRenderer.client.vue'
import { createAuthoredDiceRendererAdapter, type WorldAuthoredDiceRendererExposed } from '~/components/world/worldAuthoredDiceRendererAdapter'
import { createAuthoredThreeDiceRendererAdapter, type WorldAuthoredThreeDiceRendererExposed } from '~/components/world/worldAuthoredThreeDiceRendererAdapter'
import { createWorldDiceThreeRendererAdapter, type WorldDiceThreeRendererExposed } from '~/components/world/worldDiceThreeRendererAdapter'
import { useDiceRendererMode } from '~/composables/useDiceRendererMode'
import { useDiceAnimationQueue } from '~/composables/useDiceAnimationQueue'

const diceBoxRef = ref<WorldDiceThreeRendererExposed | null>(null)
const authoredDiceBoxRef = ref<WorldAuthoredDiceRendererExposed | null>(null)
const authoredThreeDiceBoxRef = ref<WorldAuthoredThreeDiceRendererExposed | null>(null)
const diceQueue = useDiceAnimationQueue()
const diceRendererMode = useDiceRendererMode()

// Registers whichever renderer the mode currently selects. Re-run on
// mount and on every mode change (see the `watch` below) -- every path
// calls `setRenderer()`, which simply replaces whatever was registered
// before, so re-registering the SAME renderer the mode already selected
// is harmless, not just safe.
function registerActiveRenderer() {
  if (diceRendererMode.value === 'authored-three') {
    diceQueue.setRenderer(createAuthoredThreeDiceRendererAdapter(authoredThreeDiceBoxRef, () => {
      diceQueue.setRenderer(null)
    }))
  } else if (diceRendererMode.value === 'authored-css') {
    diceQueue.setRenderer(createAuthoredDiceRendererAdapter(authoredDiceBoxRef, () => {
      diceQueue.setRenderer(null)
    }))
  } else {
    diceQueue.setRenderer(createWorldDiceThreeRendererAdapter(diceBoxRef, () => {
      diceQueue.setRenderer(null)
    }))
  }
}

onMounted(() => {
  registerActiveRenderer()
})

watch(diceRendererMode, () => {
  registerActiveRenderer()
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
    <WorldDiceThreeRenderer ref="diceBoxRef" />
    <WorldAuthoredDiceRenderer ref="authoredDiceBoxRef" />
    <WorldAuthoredThreeDiceRenderer ref="authoredThreeDiceBoxRef" />
  </ClientOnly>
</template>
