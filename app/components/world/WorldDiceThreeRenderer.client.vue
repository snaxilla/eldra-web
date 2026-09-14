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
//
// ---------------------------------------------------------------------------
// ROLL SYSTEM PHASE 3E.1 -- RENDERER COMPLETION INVESTIGATION
// ---------------------------------------------------------------------------
// Real browser observation: the die is "often still rotating or visually
// ambiguous" when the animation ends -- Phase 3D's own tuning was too
// aggressive on TWO separate, independently-traceable axes, not one:
//
// 1. `iterationLimit` (then this file's own `iterationLimitForDiceCount`,
//    removed outright in Phase 3F below -- it turned out to be a
//    determinism hazard, not merely a mis-sized ceiling) was
//    set as though it were the PRIMARY duration control (48-78 frames,
//    tightly matched to the 600-800ms target) rather than the rare-outlier
//    SAFETY NET `DiceBox.js`'s own `throwFinished()` design implies
//    (`forcedFinish = this.iteration > this.iterationLimit` converts every
//    die to KINEMATIC immediately, whatever its current motion, the instant
//    this fires -- an abrupt freeze, not a settle). Ordinary variance in a
//    throw's random toss vector/collision pattern means a normal fraction
//    of throws legitimately need more frames than a tightly-matched ceiling
//    allows, and those throws are exactly the ones this task's own
//    BACKGROUND describes: visibly still moving when the animation ends.
// 2. `sleepSpeedLimit: 140` / `sleepTimeLimit: 0.12` made "asleep" fire at
//    a residual velocity/confirmation-time close enough to "still visibly
//    moving" that even throws NOT hitting the iteration ceiling could still
//    read as ambiguous -- correctly identified in Phase 3E, but Phase 3E's
//    own fix (a fixed post-signal beat in the ADAPTER) could only delay
//    revealing an unconvincing ending, never make the ending itself look
//    convincing. This task's own IMPORTANT section is explicit that this
//    was the wrong lever to keep pulling.
//
// PROOF, NOT GUESSWORK: `roll()` below now logs, after every throw,
// `instance.iteration` against `instance.iterationLimit` -- `DiceBox.js`'s
// own `animateThrow()` increments `iteration` once per rendered frame and
// the loop only exits once `throwFinished()` returns true, so
// `iteration >= iterationLimit` at exit is direct, verifiable evidence the
// ceiling (not natural sleep) ended that specific throw, and
// `iteration < iterationLimit` is equally direct evidence physics genuinely
// settled first. NO alternate completion signal exists to switch to --
// dice-box-threejs exposes exactly one ("every die asleep, or forced") --
// so the fix is REBALANCING both axes toward "physics settling naturally,
// well inside a now-generous ceiling" rather than either accepting a
// premature "asleep" or a mid-motion forced freeze. Per this task's own
// explicit preference ("a 900ms satisfying animation" over "a 650ms
// awkward one"), every value below is deliberately less aggressive than
// Phase 3D, not reverted to dice-box-threejs's own original (slow)
// defaults.
//
// ---------------------------------------------------------------------------
// ROLL SYSTEM PHASE 3F -- DETERMINISTIC FACE MAPPING (THE REAL ROOT CAUSE)
// ---------------------------------------------------------------------------
// SYMPTOM: the visible face frequently disagreed with the authoritative
// RollEventRecord (tray 5 / die 20, tray 15 / die 2). The NOTATION was never
// wrong -- `@20` really does mean "display 20" (proven from source in
// worldDiceThreeRendererAdapter.ts's own Phase 3F header). What was wrong was
// THIS FILE, and specifically the two paragraphs directly above.
//
// HOW dice-box-threejs ACTUALLY GUARANTEES A FORCED FACE -- `rollDice()`, in
// order, all SYNCHRONOUS:
//   1. `spawnDice(vectors[i])`      -- create each die's cannon-es Body.
//   2. `simulateThrow()`            -- run the physics SILENTLY to rest, and
//                                      record which face each die naturally
//                                      landed on (`storeRolledValue`).
//   3. `spawnDice(vectors[i], die)` -- DESTROY and re-create every Body from
//                                      the identical starting vectors.
//   4. `swapDiceFace(die, result[i])` -- swap textures so the face predicted
//                                      in step 2 now PRINTS the forced value.
//   5. `animateThrow()`             -- replay the same throw, visibly.
// The entire guarantee rests on step 5 reproducing step 2 EXACTLY. Same
// starting vectors, same world, same body parameters => same resting
// orientation => the face step 4 re-textured is the face that ends up up.
// It is deterministic replay, not a constraint solver: nothing re-checks the
// result afterwards, and nothing can correct it.
//
// WHAT PHASE 3D/3E.1 BROKE: `applyFastSettleTuning()` was called from
// `roll()` AFTER `instance.roll(notation)` returned -- i.e. after step 5 had
// already been scheduled, and long after step 2 had already decided the
// answer. The old comment here reasoned that this was safe because step 3
// re-creates the bodies, so the patch "always reaches the real bodies the
// visible animation uses, never the discarded silent-simulation ones." That
// is true, and it is exactly the bug: it reaches ONLY the visible pass.
// Step 2 ran with cannon-es's spawn defaults (sleepSpeedLimit 75,
// sleepTimeLimit 0.9, damping 0.1/0.1) while step 5 ran with 95/0.35 and
// damping 0.3/0.3. Different damping is a different trajectory, so the die
// came to rest in a DIFFERENT orientation than the one whose texture had
// been swapped -- a visibly wrong face, with no error anywhere.
// `iterationLimit` compounded it: `throwFinished()`'s
// `forcedFinish = this.iteration > this.iterationLimit` applies to BOTH
// passes, but `simulateThrow()` increments `iteration` once per PHYSICS STEP
// while `animateThrow()` increments it once per RENDERED FRAME and steps
// physics `Math.floor(elapsed / framerate)` times per frame. At 75-120 the
// ceiling was being hit routinely, and any dropped frame made the visible
// pass freeze at a different physics step than the silent one -- a second,
// independent source of divergence.
//
// THE FIX, AND WHY IT IS NOT A PHYSICS CHANGE: every tuning VALUE below is
// byte-for-byte the Phase 3E.1 value -- sleepSpeedLimit 95, sleepTimeLimit
// 0.35, damping 0.3/0.3, gravity_multiplier 1000, strength 0.5, restitution
// cap 0.22. Nothing about the feel is re-tuned. What changes is WHEN the
// tuning is applied: it now hooks `spawnDice` itself, so steps 1 and 3 both
// produce bodies with identical parameters and steps 2 and 5 simulate the
// SAME physics. The per-roll `iterationLimit` override is removed so natural
// sleep -- which is a pure function of that identical trajectory, and so
// identical in both passes -- is what ends a throw, instead of a
// frame-jitter-dependent forced freeze. This is the same shape of fix as
// Phase 3E: change WHEN, not WHAT.
const containerId = `eldra-dice-three-${Math.random().toString(36).slice(2)}`

const error = ref('')
const ready = ref(false)

let DiceBoxCtor: any = null
let box: any = null
let readyPromise: Promise<any> | null = null

// Roll System Phase 3D, rebalanced in Phase 3E.1, RE-SITED in Phase 3F.
// Each die's cannon-es Body is created inside dice-box-threejs's own
// `spawnDice()` with these values hardcoded and no config hook to set any
// of them up front:
//   - sleepSpeedLimit / sleepTimeLimit -- how still, and for how long,
//     before physics calls a die "asleep." dice-box-threejs's own spawn
//     defaults are 75 / 0.9s; 0.9s of waiting AFTER a die has visually
//     stopped is pure dead time (Phase 3D's original finding, unchanged).
//   - linearDamping / angularDamping -- velocity/spin lost per physics step
//     independent of collisions ("air resistance"). Spawn default 0.1/0.1.
// THE VALUES BELOW ARE UNCHANGED FROM PHASE 3E.1. Phase 3F changes only
// where they are applied from -- see this file's own header. Applying them
// inside `spawnDice` is what makes the silent pre-simulation and the
// visible animation run IDENTICAL physics, which is the entire basis of
// dice-box-threejs's forced-face guarantee.
function applySettleTuningToBodies(instance: any): void {
  for (const dicemesh of instance?.diceList ?? []) {
    const dieBody = dicemesh?.body
    if (!dieBody) continue
    dieBody.sleepSpeedLimit = 95
    dieBody.sleepTimeLimit = 0.35
    dieBody.linearDamping = 0.3
    dieBody.angularDamping = 0.3
  }
}

// Roll System Phase 3F -- installs the tuning above as a `spawnDice` hook,
// exactly once per renderer instance.
//
// `spawnDice` is the ONE place dice-box-threejs constructs a die's Body, and
// it is called in BOTH of `rollDice()`'s passes (before `simulateThrow()`,
// and again to reset every Body before `animateThrow()`). Wrapping it is
// therefore the only point at which a caller can guarantee both passes see
// the same physics -- there is no config hook, and patching after `roll()`
// returns provably reaches only the second pass (that was the bug).
//
// The wrapper re-applies to every die in `diceList` rather than just the one
// spawned, because `spawnDice` pushes to `diceList` only on first creation
// and mutates in place on the reset pass -- walking the list covers both
// shapes without depending on which argument form was used. The list is at
// most a handful of dice, so the cost is irrelevant next to the physics step
// it precedes.
function installSettleTuningHook(instance: any): void {
  const originalSpawnDice = instance?.spawnDice
  if (typeof originalSpawnDice !== 'function') return

  instance.spawnDice = function patchedSpawnDice(...args: any[]) {
    const spawned = originalSpawnDice.apply(this, args)
    applySettleTuningToBodies(this)
    return spawned
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
    // ROLL SYSTEM PHASE 3D, REBALANCED IN PHASE 3E.1 -- animation duration
    // tuning. dice-box-threejs's own defaults (gravity_multiplier: 400,
    // strength: 1 -- see its DiceBox.js defaultConfig) are tuned for a
    // slower, more dramatic tabletop-simulator throw. Phase 3D pushed both
    // aggressively (1400/0.4) chasing a tight 600-800ms target and produced
    // a throw so short/steep it read as abrupt rather than satisfying (this
    // task's own investigation). Moderated here toward a throw with a real,
    // readable arc -- still meaningfully faster than dice-box-threejs's own
    // defaults, just no longer fighting the tumble itself to hit a number;
    // the sleep-threshold tuning above (not raw fall speed) is now the
    // primary duration lever. None of this changes the predetermined-face
    // guarantee -- see this file's own roll() logging to confirm the
    // resulting real-world duration and retune further if needed.
    const instance = new DiceBoxCtor(`#${containerId}`, {
      theme_colorset: 'white',
      theme_material: 'plastic',
      sounds: false,
      gravity_multiplier: 1000,
      strength: 0.5
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

    // Roll System Phase 3F -- must be installed BEFORE the first `roll()`,
    // since `roll()` synchronously runs both spawn passes and the silent
    // pre-simulation between them. Installed once per instance, here,
    // alongside the other one-time world setup.
    installSettleTuningHook(instance)

    // Roll System Phase 3D, REBALANCED IN PHASE 3E.1 -- see this file's own
    // header. `makeWorldBox()` (called once, inside `initialize()`)
    // registers desk/wall/dice contact materials with hardcoded restitution
    // (bounciness) of 0.5-1.0 -- no config hook exposes these either.
    // `world.contactmaterials` is a standard, public `cannon-es` `World`
    // property (an ordinary array of `ContactMaterial`, each with a plain,
    // documented `.restitution` field). Phase 3D capped this at 0.15,
    // steep enough that a die's landing could look like it stuck rather
    // than settled; raised slightly here so one or two real, visible
    // bounces remain -- reading as an actual landing, not "not long
    // tumbles" taken to the point of no motion at all.
    for (const contactMaterial of instance.world?.contactmaterials ?? []) {
      contactMaterial.restitution = Math.min(contactMaterial.restitution, 0.22)
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
// is retained for the perf log only -- Phase 3F removed the per-roll
// settle ceiling it used to size (see this file's own Phase 3F header),
// but the adapter's `roll(notation, diceCount)` contract is deliberately
// left alone rather than churned for a diagnostic.
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

    // Roll System Phase 3F -- `iterationLimit` is deliberately NOT set here
    // any more. dice-box-threejs's own default (1000, ~16.6s) is left in
    // place as the genuine runaway guard it was designed to be. Any tighter
    // ceiling makes `throwFinished()`'s `forcedFinish` path the normal way a
    // throw ends, and that path is NOT deterministic between the silent
    // pre-simulation and the visible animation: `simulateThrow()` counts one
    // iteration per physics step, `animateThrow()` counts one per rendered
    // frame while stepping physics `floor(elapsed / framerate)` times. A
    // single dropped frame therefore freezes the visible die at a different
    // physics step than the one that chose its face. Duration is instead
    // controlled by the sleep thresholds in `applySettleTuningToBodies`,
    // which now apply identically to both passes and so end both at the same
    // step. See this file's own Phase 3F header.
    //
    // `instance.roll(notation)` runs `rollDice()` -- both spawn passes, the
    // silent `simulateThrow()`, and `swapDiceFace()` -- SYNCHRONOUSLY before
    // it returns its still-pending Promise (its `new Promise(executor)`
    // executor runs synchronously; only `animateThrow` is deferred to
    // requestAnimationFrame). Nothing may be patched onto the dice bodies
    // between this call and the await: by the time it returns, the forced
    // face has already been decided. That is precisely why the settle tuning
    // is installed as a `spawnDice` hook at init instead.
    await instance.roll(notation)
    const tDone = performance.now()

    // Roll System Phase 3E.1 -- PROOF, not guesswork, of which mechanism
    // actually ended THIS throw. `DiceBox.js`'s own `animateThrow()`
    // increments `instance.iteration` once per rendered frame and the loop
    // only exits once `throwFinished()` returns true; `forcedFinish` there
    // is exactly `this.iteration > this.iterationLimit`. So reading both
    // values the instant `roll()` resolves says, unambiguously, which path
    // fired for this specific throw -- no assumption, no guess.
    //
    // PHASE 3F RAISES THE STAKES ON THIS LINE. With the per-roll ceiling
    // removed, `endedBy` should now read "physics settled naturally" on
    // every ordinary throw. If it EVER reads "iterationLimit (forced)",
    // that throw took the one completion path that is NOT deterministic
    // between the silent pre-simulation and the visible animation -- so it
    // is also exactly the throw at risk of showing a face that disagrees
    // with the Roll Tray. This line is therefore the direct early warning
    // for a face-mapping regression, not merely a perf datapoint.
    const endedBy = instance.iteration >= instance.iterationLimit ? 'iterationLimit (forced)' : 'physics settled naturally'

    // Actual animation duration, measured, not guessed. The
    // `wasAlreadyInitialized` split matters: on the very first roll this
    // page view, `tReady - tStart` also includes the one-time init cost
    // logged above, which would otherwise make the FIRST roll look like a
    // slow animation when it is actually a slow (one-time) setup.
    console.log(
      `[roll-perf] WorldDiceThreeRenderer.roll("${notation}", diceCount=${diceCount}): animation=${(tDone - tReady).toFixed(1)}ms, ` +
      `endedBy=${endedBy} (iteration=${instance.iteration}/${instance.iterationLimit})` +
      (wasAlreadyInitialized ? '' : ' (renderer init included in a separate log line above, not in this number)')
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
