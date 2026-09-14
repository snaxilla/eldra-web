<script setup lang="ts">
// WorldDiceThreeRenderer -- Eldra Roll System Phase 3B (Renderer
// Replacement). THE renderer implementation for the Dice Presentation
// Layer (.github/docs/architecture/eldra-roll-system.md §11), replacing
// the headless EldraDiceBox instance WorldDiceOverlay.vue used to mount.
//
// WHY THIS FILE EXISTS AT ALL (restated from the rejection this phase
// responds to): @3d-dice/dice-box@1.1.4 (EldraDiceBox.client.vue's own
// library) has no "land on this face" hook -- every physics-rendered die
// resolves its VISIBLE face via raycasting against wherever the physics
// simulation actually settled it, with no override. That die could
// therefore visually show a face that disagrees with the authoritative
// RollEventRecord total while a SEPARATE text readout claims the correct
// number -- exactly the "mask incorrect physics" failure mode this phase
// was commissioned to eliminate. @3d-dice/dice-box-threejs solves this
// HONESTLY, not with a UI trick: its `DiceBox.roll(notation)` pre-runs the
// physics simulation once, unrendered, checks whether the die naturally
// settled on the requested face, and -- only if not -- swaps which texture
// face shows which pip count on that die's mesh BEFORE the visible
// animation ever plays (source: 3d-dice/dice-box-threejs `DiceBox.js`,
// `rollDice()`/`swapDiceFace()`). The player never sees an intermediate
// wrong face; the physical die they watch tumble is, from the very first
// visible frame, showing pips that will resolve to the requested value.
// This is still "physics for spectacle, number from the server" -- it is
// just no longer possible for the SPECTACLE to visibly contradict the
// server.
//
// THIS COMPONENT KNOWS NOTHING ABOUT RollEventRecord, ActorState, or
// Eldra's roll domain -- it takes a plain dice-box-threejs NOTATION STRING
// (already including that library's own `@val,val,...` forced-outcome
// suffix) and plays it. ALL translation from a RollEventRecord into that
// notation lives in worldDiceThreeRendererAdapter.ts, matching
// ~/lib/dice-presentation/renderer.ts's own rule: "no third-party renderer
// type crosses this boundary." Mirrors the exact split
// EldraDiceBox.client.vue already draws between its own generic
// `rollDice(notation)` and its RollEvent-aware `rollResult(event)` --
// restated here as two separate files instead of two methods on one file,
// since this component IS the lowest-level renderer wrapper and the
// adapter IS the RollEventRecord-aware layer above it.
//
// HEADLESS BY DESIGN, NOT BY PROP. Unlike EldraDiceBox.client.vue (which
// has a `headless` prop because ONE file serves two callers), this
// component has exactly one caller (WorldDiceOverlay.vue) and exactly one
// job: mount the canvas, play the animation, expose nothing else. Any
// result card / history strip / critical-hit banner belongs to
// WorldDiceStage.vue / WorldRollTray.vue, not here -- rendering a second
// copy would be the exact "two history UIs" duplication this project has
// avoided since Phase 2C.
//
// LAZY INIT (this phase's own PERFORMANCE requirement, carried over
// unchanged from the renderer this file replaces): @3d-dice/dice-box-threejs
// (and its own three/cannon-es dependencies) is dynamically imported only
// on the FIRST roll(), never eagerly on mount -- this instance mounts once
// per World page view, so loading a 3D physics/rendering stack on every
// page that never rolls dice would be wasted work.
//
// FAILURE MODE: `roll()` never rejects. Any failure (WebGL unavailable,
// asset load failure, an unsupported/malformed notation) is caught and
// recorded in `error`; the caller (worldDiceThreeRendererAdapter.ts) reads
// `error` after `roll()` resolves and reports the renderer as failed,
// exactly the same two-step contract EldraDiceBox.client.vue's own
// `rollResult()`/`error` already established -- gameplay must never be
// blocked by a presentation failure.

const containerId = `eldra-dice-three-${Math.random().toString(36).slice(2)}`

const error = ref('')
const ready = ref(false)

let DiceBoxCtor: any = null
let box: any = null
let readyPromise: Promise<any> | null = null

async function ensureBox(): Promise<any> {
  if (box) return box
  if (readyPromise) return readyPromise

  readyPromise = (async () => {
    // Roll System Phase 3C (Roll Performance Audit) -- confirms, in the
    // browser console, that renderer initialization runs exactly ONCE per
    // page view, never per roll: this whole function is guarded by the
    // `box`/`readyPromise` checks above, so this log line can only ever
    // appear a single time for the lifetime of one mounted
    // WorldDiceThreeRenderer instance. If it ever appears more than once
    // for the same session, THAT is the bug to chase -- not a redesign,
    // an init-guard regression.
    const tInitStart = performance.now()
    console.log('[roll-perf] WorldDiceThreeRenderer: initializing (should log ONCE per page view)')

    await nextTick()

    if (!DiceBoxCtor) {
      const mod: any = await import('@3d-dice/dice-box-threejs')
      DiceBoxCtor = mod.default || mod
    }
    const tImported = performance.now()

    // Plain, undecorated dice -- deliberately no `theme_texture`/`sounds`
    // (both would require copying static assets out of the package's own
    // `public/` folder into Eldra's static assets, per that package's own
    // README note). This phase's INSTALLATION section asks for the minimum
    // install; a themed/skinned die is explicitly Phase 8 (Dice Skins),
    // named as future scope, not this phase's job.
    //
    // ROLL SYSTEM PHASE 3C -- animation duration tuning (this phase's own
    // ANIMATION section: target 600-800ms, "satisfying, not cinematic").
    // dice-box-threejs's own defaults (gravity_multiplier: 400, strength: 1
    // -- see its DiceBox.js defaultConfig) are tuned for a slower,
    // more dramatic tabletop-simulator throw. `gravity_multiplier` raised
    // and `strength` (toss force) lowered here settle the physics faster
    // without changing the predetermined-face guarantee at all (§11's
    // "physics for spectacle, number from the server" is unaffected by
    // HOW FAST the spectacle resolves) -- see this file's own roll()
    // logging below to confirm the resulting real-world duration and
    // retune further if needed.
    const instance = new DiceBoxCtor(`#${containerId}`, {
      theme_colorset: 'white',
      theme_material: 'plastic',
      sounds: false,
      gravity_multiplier: 800,
      strength: 0.6
    })

    // THE ACTUAL RUNTIME BUG (Phase 3B.2): the constructor above only
    // assigns config and builds the DiceFactory/DiceColors helpers -- it
    // creates no THREE.WebGLRenderer, no camera, no CANNON world gravity,
    // and appends NO <canvas> to the container. All of that happens inside
    // this SEPARATE, mandatory `initialize()` method (confirmed by reading
    // dice-box-threejs's own DiceBox.js: `renderer.domElement` is only
    // created and appended here, and `this.camera` is only assigned deep
    // inside the `setDimensions()` call this method makes). Every prior
    // `roll()` call was silently throwing on `this.renderer.render(...)`
    // (via `clearDice()`) because `this.renderer` was `undefined` --
    // caught by this function's own try/catch below, surfaced only as
    // `error`, which is exactly why no 3D dice ever appeared: no canvas
    // element existed in the DOM at all, and every roll silently fell back
    // to the placeholder via `onRendererFailed`.
    await instance.initialize()
    const tInitialized = performance.now()

    console.log(
      `[roll-perf] WorldDiceThreeRenderer: initialized in ${(tInitialized - tInitStart).toFixed(1)}ms ` +
      `(import=${(tImported - tInitStart).toFixed(1)}ms, initialize()=${(tInitialized - tImported).toFixed(1)}ms) -- one-time cost, not paid again this page view`
    )

    box = instance
    ready.value = true
    return instance
  })()

  return readyPromise
}

// The one method this component exposes. `notation` is an ALREADY-BUILT
// dice-box-threejs notation string (see worldDiceThreeRendererAdapter.ts's
// own buildPredeterminedNotation) -- this function has no idea what a
// RollEventRecord is, matching this file's own header note.
async function roll(notation: string): Promise<void> {
  error.value = ''
  const tStart = performance.now()
  const wasAlreadyInitialized = box !== null

  try {
    const instance = await ensureBox()
    const tReady = performance.now()

    if (typeof instance.clearDice === 'function') {
      instance.clearDice()
    }

    await instance.roll(notation)
    const tDone = performance.now()

    // Roll System Phase 3C -- actual animation duration, measured, not
    // guessed. Target 600-800ms (this phase's own ANIMATION section). The
    // `wasAlreadyInitialized` split matters: on the very first roll this
    // page view, `tReady - tStart` also includes the one-time init cost
    // logged above, which would otherwise make the FIRST roll look like a
    // slow animation when it is actually a slow (one-time) setup.
    console.log(
      `[roll-perf] WorldDiceThreeRenderer.roll("${notation}"): animation=${(tDone - tReady).toFixed(1)}ms` +
      (wasAlreadyInitialized ? '' : ` (renderer init included in a separate log line above, not in this number)`)
    )
  } catch (err: any) {
    error.value = err?.message || '3D dice failed to render.'
  }
}

onBeforeUnmount(() => {
  try {
    box?.clearDice?.()
  } catch {
    // Tearing down a already-broken renderer must never throw during
    // unmount -- matches EldraDiceBox.client.vue's own onBeforeUnmount
    // posture.
  }
})

defineExpose({
  roll,
  error,
  ready
})
</script>

<template>
  <div
    :id="containerId"
    class="eldra-dice-three-stage pointer-events-none fixed inset-0 z-[175]"
  />
</template>

<style scoped>
.eldra-dice-three-stage {
  width: 100vw;
  height: 100dvh;
}

.eldra-dice-three-stage :deep(canvas) {
  position: absolute !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
}
</style>
