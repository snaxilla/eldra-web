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
//
// ---------------------------------------------------------------------------
// ROLL SYSTEM PHASE 3D -- DICE FEEL TUNING
// ---------------------------------------------------------------------------
// Phase 3C's measurements showed animation alone taking ~2800-3200ms --
// physics tuning (gravity/throw strength) was a start but nowhere near this
// phase's 600-800ms target. Reading dice-box-threejs's own DiceBox.js
// source (not guessing) found the REAL dominant cost is not the visible
// tumble at all: `throwFinished()` gates the completion callback on every
// die's underlying `cannon-es` Body reaching `CANNON.Body.SLEEPING`, and
// each die's Body is constructed with `sleepSpeedLimit: 75, sleepTimeLimit:
// 0.9` (hardcoded inside DiceBox.js's own dice-spawning code, not exposed
// through dice-box-threejs's own public config object at all -- see
// `spawnDice`'s `new CANNON.Body({...})` call). `sleepTimeLimit: 0.9` alone
// -- 0.9 SECONDS a die must sit continuously below the speed threshold
// before physics considers it "asleep" -- exceeds this phase's entire
// animation budget by itself, regardless of how fast the tumble itself is
// tuned. This is exactly "waiting for mathematical rest instead of visual
// completion" (this phase's own COMPLETION section), and it is why no
// amount of gravity/strength tuning alone could have hit budget.
//
// THE FIX, AND WHY IT IS TUNING, NOT A REDESIGN: `sleepSpeedLimit`/
// `sleepTimeLimit`/`linearDamping`/`angularDamping`/`ContactMaterial.
// restitution` are ordinary, PUBLIC, documented properties of `cannon-es`
// (the physics engine dice-box-threejs
// itself depends on and constructs) -- not private internals, and not
// something this file monkey-patches on a prototype or forks. Every die's
// `body` object (`instance.diceList[i].body`) and every registered
// `instance.world.contactmaterials[i]` are ordinary data this component can
// read and adjust after the renderer creates them, exactly the same way a
// caller of any physics engine tunes a body's own properties. The
// renderer's OWN decision algorithm ("wait until every die is asleep, then
// reveal") is completely unchanged; only the thresholds that define
// "asleep" and "how bouncy a landing is" move -- squarely "read the
// renderer source, determine which parameters control settle threshold",
// this phase's own explicit instruction.
const containerId = `eldra-dice-three-${Math.random().toString(36).slice(2)}`

const error = ref('')
const ready = ref(false)

let DiceBoxCtor: any = null
let box: any = null
let readyPromise: Promise<any> | null = null

// Roll System Phase 3D -- how long a die is allowed to keep physically
// settling before this component forcibly ends its turn (dice-box-threejs's
// own PUBLIC `iterationLimit` config: one unit is one rendered physics
// frame at its `framerate` of 1/60s, so `60` iterations is ~1 real second).
// This is a CEILING, not a target -- the sleep-threshold and restitution
// tuning below aim to make dice settle naturally well inside these numbers
// most of the time; this only protects the outlier throw (a die balanced
// oddly, an unusual collision) from running away toward dice-box-threejs's
// own default of 1000 iterations (~16.6s). Scaled by dice count per this
// phase's own MULTIPLE DICE section -- more dice colliding naturally take
// a little longer to visually resolve, and forcing a 10-die pool to freeze
// at the same instant as a lone d20 would look abrupt, not decisive.
function iterationLimitForDiceCount(diceCount: number): number {
  if (diceCount <= 1) return 48 // ~800ms ceiling
  if (diceCount <= 3) return 54 // ~900ms ceiling
  if (diceCount <= 10) return 66 // ~1100ms ceiling
  return 78 // ~1300ms ceiling for very large pools
}

// Roll System Phase 3D -- see this file's own header for the full citation.
// Each die's cannon-es Body is created inside dice-box-threejs's own
// `spawnDice()` with FOUR hardcoded values this component can only reach
// AFTER they exist, with no config hook to set any of them up front:
//   - sleepSpeedLimit: 75 / sleepTimeLimit: 0.9 -- how still, and for how
//     long, before physics calls a die "asleep" (see this file's own
//     header: 0.9s alone blows the entire animation budget).
//   - linearDamping: 0.1 / angularDamping: 0.1 -- how much velocity/spin a
//     die loses per physics step independent of collisions ("air
//     resistance"). Low damping lets a die keep bouncing/spinning near-
//     full-strength for many collisions before it ever gets slow enough to
//     start the sleep countdown at all.
// Called once per roll, right after `instance.roll()` has synchronously
// spawned this throw's FINAL dice (see `roll()` below for exactly why that
// timing is safe, and DiceBox.js's own `spawnDice()`: every call --
// including the internal reset pass before the visible animation --
// constructs a brand-new Body with these same defaults, so patching after
// `roll()` returns always reaches the real bodies the visible animation
// uses, never the discarded silent-simulation ones).
function applyFastSettleTuning(instance: any): void {
  for (const dicemesh of instance?.diceList ?? []) {
    const dieBody = dicemesh?.body
    if (!dieBody) continue
    dieBody.sleepSpeedLimit = 140
    dieBody.sleepTimeLimit = 0.12
    dieBody.linearDamping = 0.5
    dieBody.angularDamping = 0.5
  }
}

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
    // ROLL SYSTEM PHASE 3D -- animation duration tuning (target 600-800ms,
    // "satisfying, not cinematic," "reduce unnecessary motion, increase
    // decisiveness"). dice-box-threejs's own defaults (gravity_multiplier:
    // 400, strength: 1 -- see its DiceBox.js defaultConfig) are tuned for a
    // slower, more dramatic tabletop-simulator throw; Phase 3C's own more
    // moderate retune (800/0.6) measured at ~2800-3200ms -- still far over
    // budget, which is what led to actually reading the source for Phase
    // 3D rather than tuning further blind (see this file's own header: the
    // dominant cost turned out to be the hardcoded sleep-threshold wait
    // below, not the tumble itself). `gravity_multiplier` raised further
    // and `strength` (toss force) lowered further here shortens the ACTIVE
    // tumbling phase specifically; none of this changes the predetermined-
    // face guarantee -- see this file's own roll() logging to confirm the
    // resulting real-world duration and retune further if needed.
    const instance = new DiceBoxCtor(`#${containerId}`, {
      theme_colorset: 'white',
      theme_material: 'plastic',
      sounds: false,
      gravity_multiplier: 1400,
      strength: 0.4
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

    // Roll System Phase 3D -- see this file's own header. `makeWorldBox()`
    // (called once, inside `initialize()`) registers desk/wall/dice contact
    // materials with hardcoded restitution (bounciness) of 0.5-1.0 -- no
    // config hook exposes these either. `world.contactmaterials` is a
    // standard, public `cannon-es` `World` property (an ordinary array of
    // `ContactMaterial`, each with a plain, documented `.restitution`
    // field) -- capping it low here, ONCE, for the lifetime of this
    // renderer instance, means every die loses most of its bounce on
    // landing instead of bouncing repeatedly before settling, directly
    // satisfying "reduce unnecessary motion... not long tumbles."
    for (const contactMaterial of instance.world?.contactmaterials ?? []) {
      contactMaterial.restitution = Math.min(contactMaterial.restitution, 0.15)
    }

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
// RollEventRecord is, matching this file's own header note. `diceCount`
// (Phase 3D) sizes this one roll's own settle ceiling -- see
// iterationLimitForDiceCount's own header.
async function roll(notation: string, diceCount: number): Promise<void> {
  error.value = ''
  const tStart = performance.now()
  const wasAlreadyInitialized = box !== null

  try {
    const instance = await ensureBox()
    const tReady = performance.now()

    if (typeof instance.clearDice === 'function') {
      instance.clearDice()
    }

    // Read fresh by `throwFinished()` on every frame (a plain instance
    // property dice-box-threejs's own config already assigns this way) --
    // safe to set per-roll with no re-initialization.
    instance.iterationLimit = iterationLimitForDiceCount(diceCount)

    // `instance.roll(notation)` is an `async` function with no `await`
    // before it synchronously calls `rollDice()`, which synchronously
    // spawns every die's `cannon-es` Body BEFORE the first
    // `requestAnimationFrame` of the visible animation ever fires (source:
    // DiceBox.js's own `roll()`/`rollDice()` -- the `new Promise(executor)`
    // executor runs synchronously, and `animateThrow` is what's deferred,
    // not the spawning). This means the dice bodies already exist, with
    // their default sleep thresholds, in the same synchronous tick this
    // call returns its (still-pending) Promise -- exactly the window
    // `shortenSettleThreshold` needs to patch them before any settling has
    // had a chance to begin.
    const rollPromise = instance.roll(notation)
    applyFastSettleTuning(instance)

    await rollPromise
    const tDone = performance.now()

    // Roll System Phase 3D -- actual animation duration, measured, not
    // guessed. Target 600-800ms. The `wasAlreadyInitialized` split matters:
    // on the very first roll this page view, `tReady - tStart` also
    // includes the one-time init cost logged above, which would otherwise
    // make the FIRST roll look like a slow animation when it is actually a
    // slow (one-time) setup.
    console.log(
      `[roll-perf] WorldDiceThreeRenderer.roll("${notation}", diceCount=${diceCount}, iterationLimit=${instance.iterationLimit}): animation=${(tDone - tReady).toFixed(1)}ms` +
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
