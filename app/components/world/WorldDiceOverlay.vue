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
// LOCATION -- ROLL SYSTEM PHASE 4C.2 (DICE STAGE POSITION
// NORMALIZATION). Screen position now belongs entirely to
// WorldDicePresentationStage.vue -- see that component's own header, and
// app/lib/dice-presentation/placement.ts's own header, for the full
// traced root cause (four independently hand-tuned `fixed` positions
// across four renderer files) this centralizes. This file's own job is
// unchanged: mount the stage once, register whichever adapter the
// current DiceRendererMode selects, and let EVERY renderer -- the Phase
// 3A placeholder, the physics comparison renderer, the frozen authored
// d20, and the general authored polyhedral renderer -- render as the
// stage's own children, sharing its one position/size/z-index instead of
// each owning a separate one.
//
// RENDERS NOTHING VISIBLE WHEN IDLE: WorldDiceStage.vue's own `v-if`
// means the stage is inert chrome (zero opacity content, `pointer-events:
// none` throughout) until a roll is actually queued -- never a permanent
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
// PHASE 4B (AUTHORED CSS d20 PROOF OF CONCEPT): REJECTED, NEVER SHIPPED
// ---------------------------------------------------------------------------
// Phase 4B's CSS/DOM renderer (`WorldAuthoredDiceRenderer.vue`) validated
// the authored-presentation architecture (deterministic targets, fixed
// duration, DiceRendererAdapter as the correct seam) but its visual
// quality did not clear ADR-024's gate -- Phase 4B.1's Three.js renderer,
// below, is the result. That CSS component and its own exhaustive
// orientation tests were NEVER committed (a Phase 4B.1 deployment-fix
// audit -- `git ls-tree HEAD`/`git status` -- proved this directly: the
// component existed only as an untracked working-tree file, which is
// exactly why a from-git production build failed with `ENOENT` for it
// while every local build, which still had that untracked file sitting
// on disk, kept passing). It is intentionally NOT imported or mounted
// here -- this file's own committed code must depend only on committed
// code. The file remains on disk locally as design history/evidence per
// that audit's own findings; it is simply no longer wired to anything
// production loads. Reintroducing it as a real, selectable mode is a
// separate, future decision (committing it for real, first) -- not an
// automatic consequence of it still existing on someone's machine.
//
// ---------------------------------------------------------------------------
// PHASE 4B.1 (AUTHORED THREE.JS d20 PROOF OF CONCEPT, ADR-024 OPTION 2): A
// SECOND RENDERER
// ---------------------------------------------------------------------------
// WorldAuthoredThreeDiceRenderer.client.vue mounts here too -- a real
// WebGL/Three.js renderer (`.client.vue` suffix required), invoked as
// ADR-024's own named fallback after Phase 4B's CSS/DOM approach.
// `useDiceAnimationQueue.ts` only ever holds ONE registered renderer at a
// time (`setRenderer()` replaces, never adds); `useDiceRendererMode()` (a
// plain, session-local `useState`, default `'physics'`) decides which of
// the two adapters is actually registered, and is watched so choosing a
// different mode (AdminRollSandbox.vue's own selector) takes effect on
// the very next roll with no page reload. Both renderer components remain
// mounted regardless of mode -- each dynamically imports its own 3D
// library only on the FIRST roll it actually renders, so an unregistered,
// never-called renderer costs nothing merely by being present in the DOM.
//
// ---------------------------------------------------------------------------
// PHASE 4C (AUTHORED POLYHEDRAL DICE + MULTI-DIE PRESENTATION): A THIRD
// COMPONENT, ONE ADAPTER
// ---------------------------------------------------------------------------
// WorldAuthoredPolyhedralDiceRenderer.client.vue mounts here too -- the
// general d4/d6/d8/d10/d12/pooled-d20/d100 renderer. It does NOT get its
// own `DiceRendererMode` branch: `createAuthoredThreeDiceRendererAdapter`
// (see that file's own header) is the SAME single adapter registered for
// `'authored-three'` mode as before, now taking a SECOND ref and
// internally dispatching per-request between the frozen single-d20
// renderer and this new general one. The frozen renderer's own file,
// adapter scope check, and every one of its accepted behaviors are
// completely unchanged by this addition.

import WorldAuthoredPolyhedralDiceRenderer from '~/components/world/WorldAuthoredPolyhedralDiceRenderer.client.vue'
import WorldAuthoredThreeDiceRenderer from '~/components/world/WorldAuthoredThreeDiceRenderer.client.vue'
import WorldDicePresentationStage from '~/components/world/WorldDicePresentationStage.vue'
import WorldDiceStage from '~/components/world/WorldDiceStage.vue'
import WorldDiceThreeRenderer from '~/components/world/WorldDiceThreeRenderer.client.vue'
import { createAuthoredThreeDiceRendererAdapter, type WorldAuthoredPolyhedralDiceRendererExposed, type WorldAuthoredThreeDiceRendererExposed } from '~/components/world/worldAuthoredThreeDiceRendererAdapter'
import { createWorldDiceThreeRendererAdapter, type WorldDiceThreeRendererExposed } from '~/components/world/worldDiceThreeRendererAdapter'
import { useDiceRendererMode } from '~/composables/useDiceRendererMode'
import { useDiceAnimationQueue } from '~/composables/useDiceAnimationQueue'

const diceBoxRef = ref<WorldDiceThreeRendererExposed | null>(null)
const authoredThreeDiceBoxRef = ref<WorldAuthoredThreeDiceRendererExposed | null>(null)
const authoredPolyhedralDiceBoxRef = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(null)
const diceQueue = useDiceAnimationQueue()
const diceRendererMode = useDiceRendererMode()

// Registers whichever renderer the mode currently selects. Re-run on
// mount and on every mode change (see the `watch` below) -- both paths
// call `setRenderer()`, which simply replaces whatever was registered
// before, so re-registering the SAME renderer the mode already selected
// is harmless, not just safe.
function registerActiveRenderer() {
  if (diceRendererMode.value === 'authored-three') {
    diceQueue.setRenderer(createAuthoredThreeDiceRendererAdapter(authoredThreeDiceBoxRef, authoredPolyhedralDiceBoxRef, () => {
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
  <WorldDicePresentationStage>
    <div class="pointer-events-auto absolute inset-0 flex items-center justify-center">
      <WorldDiceStage />
    </div>

    <ClientOnly>
      <WorldDiceThreeRenderer ref="diceBoxRef" />
      <WorldAuthoredThreeDiceRenderer ref="authoredThreeDiceBoxRef" />
      <WorldAuthoredPolyhedralDiceRenderer ref="authoredPolyhedralDiceBoxRef" />
    </ClientOnly>
  </WorldDicePresentationStage>
</template>
