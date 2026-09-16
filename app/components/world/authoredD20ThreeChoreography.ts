// authoredD20ThreeChoreography -- pure, WebGL-free animation math for the
// Three.js authored d20 renderer. Roll System Phase 4B.1 (Authored
// Three.js d20 Proof of Concept, ADR-024 Option 2).
//
// EXTRACTED FOR THE SAME REASON app/components/admin/health/rollSandbox.ts
// and app/lib/rolls/dice-adapter.ts already are (see each file's own
// header): this repo's Vitest setup has no Vue component-rendering or
// WebGL-capable environment, so anything about this renderer worth
// testing -- duration budget, the authored throw trajectory, the
// overshoot-and-settle easing, "the final state is exact" -- has to be
// plain, importable TypeScript with zero `three`/DOM/WebGL dependency.
// WorldAuthoredThreeDiceRenderer.client.vue imports these constants and
// functions rather than redefining any of them inline; it is otherwise
// thin glue between this math and real `THREE.*` objects.
//
// ---------------------------------------------------------------------------
// THE FIVE BEATS, ONE CONTINUOUS THROW (ADR-024 §6, this phase's own
// CHOREOGRAPHY section)
// ---------------------------------------------------------------------------
// ADR-024 names five beats with five separate budgets. This phase's own
// THE THROW section is explicit that Enter and Roll must NOT read as two
// separate motions with a seam between them ("The d20 should not:
// materialize, spin in place, then rotate to a number... start near the
// lower/right... move inward/upward along a shallow arc... rotate rapidly
// during travel") -- a real thrown object does not pause between
// "appearing" and "moving." So ENTER_MS and ROLL_MS are kept as two named,
// separately budgeted, separately tested constants (their sum,
// `THROW_MS`, is asserted against ADR-024's own combined range), but
// WorldAuthoredThreeDiceRenderer.client.vue drives them as ONE unbroken
// position/rotation curve over `THROW_MS` -- Enter is simply "the first
// instant of the throw," not a discrete step with its own wait().
//
//   ENTER + ROLL (THROW_MS, combined) -- authored Bezier arc from
//     THROW_START_POSITION through THROW_PEAK_POSITION to
//     THROW_LAND_POSITION, plus a fast multi-axis spin
//     (SPIN_X_TURNS/SPIN_Y_TURNS full turns) that does NOT target the
//     authoritative face -- see LAND below for why that is correct, not
//     an oversight.
//   LAND (LAND_MS) -- slerps from whatever quaternion the throw ended at
//     (a fully-known, authored intermediate value -- see
//     WorldAuthoredThreeDiceRenderer.client.vue's own header) to the
//     authoritative `landingQuaternionForFace(face)` target, using
//     `easeOutBack` for a small, controlled rotational overshoot-and-
//     settle (this phase's own AUTHORED MOTION section: "controlled
//     overshoot... controlled landing bounce").
//   FLOURISH (FLOURISH_MS) -- deliberately minimal per this phase's own
//     instruction ("minimal for this phase"): a small scale pulse, no
//     tier logic, no particles.
//   EXIT (EXIT_MS) -- handled by the SAME outer-stage `visible`-driven
//     fade/scale transition Phase 3G/4B already established (not modeled
//     here as a position/rotation curve -- the die's own pose is already
//     settled by the time this beat starts).
//
// `TOTAL_CEREMONY_MS` (all five beats) is asserted, by test, to land
// inside this phase's own 700-900ms target and under its 1000ms hard
// ceiling -- see this file's own test for the exact numbers.
//
// ---------------------------------------------------------------------------
// PHASE 4B.2 (VISUAL POLISH) -- CHOREOGRAPHY POLISH, NOT A REDESIGN
// ---------------------------------------------------------------------------
// This phase's own CHOREOGRAPHY POLISH section: "Polish it, but do NOT
// redesign it unless browser evidence clearly requires it." No evidence
// said the throw arc or spin was wrong -- Phase 4B.1 passed its own
// browser gate with the choreography unchanged -- so `THROW_START/PEAK/
// LAND_POSITION` and `SPIN_X/Y_TURNS` below are BYTE-FOR-BYTE unchanged
// from Phase 4B.1. The one real timing change is `LAND_MS` (170 -> 190):
// this phase adds real squash-and-stretch (`landSquashScaleY/XZ`, below)
// on top of the existing rotational overshoot, and 170ms read as slightly
// rushed once that compression-and-recovery had to fit inside it. 20ms
// buys room for the squash to read clearly without changing what LAND
// fundamentally does.
//
// ---------------------------------------------------------------------------
// PHASE 4B.3 (LIFECYCLE + VISUAL READ) -- EXIT_MS 130 -> 150, SQUASH/BOB
// PUNCHIER, WATCHDOG ADDED
// ---------------------------------------------------------------------------
// Real browser feedback: (1) the die could remain visible indefinitely
// after a roll (see WorldAuthoredThreeDiceRenderer.client.vue's own
// header, LIFECYCLE, for the full traced root cause and fix -- `
// ANIMATION_WATCHDOG_MS` below is this file's own contribution to that
// fix); (2) LAND needed to read as more decisive contact ("THUNK"). Three
// changes here, none of them a redesign:
//   - `EXIT_MS` 130 -> 150, matching the outer stage's own CSS
//     `transition duration-150` exactly (previously 20ms shorter than the
//     visual fade it was supposed to cover) -- this task's own EXIT
//     EXPERIENCE section's own "~100-150ms... quick exit" range.
//   - `LAND_SQUASH_Y`/`LAND_SQUASH_XZ` deepened (a more pronounced
//     compress-and-widen on impact) and `LAND_BOB_HEIGHT` raised
//     slightly -- this task's own CONTACT section: "Make LAND visually
//     decisive... small squash... small scale/position response."
//   - `TOTAL_CEREMONY_MS` re-verified, by test, to still land inside the
//     700-900ms target (now 890ms) and under the 1000ms hard ceiling.
//
// ---------------------------------------------------------------------------
// PHASE 4B.4 (LANDING READABILITY + RESULT HOLD)
// ---------------------------------------------------------------------------
// Real browser feedback, after 4B.3 finally shipped as the actual default
// (see WorldAuthoredThreeDiceRenderer.client.vue's own PHASE 4B.4 header
// for the full traced readability account): the die vanished before a
// player could read it, and the numeral itself was hard to acquire even
// during the brief window it WAS visible. This task's own PRODUCT
// CORRECTION: "the old sub-1000ms target... is NOT sacred... optimize for
// fast tabletop cadence AND a clearly readable result."
//
// TWO CHANGES HERE, BOTH ADDITIVE, NEITHER TOUCHING THE THROW:
//
// 1. `RESULT_HOLD_MS` -- a genuinely NEW, fourth beat, distinct from LAND
//    and EXIT (this task's own RESULT HOLD section). Runs after FLOURISH
//    settles and before EXIT begins. During it, `WorldAuthoredThreeDice
//    Renderer.client.vue`'s own `playD20` calls `animatePhase` with a
//    literal no-op `onFrame` -- position, quaternion, and scale are never
//    touched, so the already-landed, already-settled frame simply repeats
//    for the beat's full duration. This is the safest possible reading of
//    "position fixed, target quaternion fixed... only an extremely subtle
//    flourish may continue": rather than thread a SECOND, independent
//    "subtle flourish" curve through the hold (which is optional per this
//    task's own wording, "MAY continue," not "must"), FLOURISH's existing
//    scale/glint pop already supplies the "decisive contact" emphasis
//    immediately before the hold begins -- RESULT_HOLD itself stays
//    completely, provably static, which is the literal, unambiguous
//    reading of this task's own "No tumble. No rotation. No ambiguity."
//
// 2. `LAND_REST_SCALE` -- the die's permanent resting scale from the
//    instant LAND's exact final pose is locked in, through FLOURISH, and
//    for the entirety of RESULT_HOLD (previously this was a bare `1`,
//    i.e. no size emphasis at all). This is this task's own LAND-ONLY
//    EMPHASIS section's first suggested example, "modest die scale-up
//    during final LAND" -- directly increasing the authoritative face's
//    projected screen size for exactly the window a player is meant to
//    read it, with zero change to camera, FOV, or geometry. `flourishScale`
//    (below) is redefined to pulse ABOVE and settle AT this new resting
//    scale, rather than above and settling at neutral `1` -- so FLOURISH's
//    existing "small pop" now reads as "pop up TO the enlarged, readable
//    size," not "pop and shrink back down."
//
// DURATION BUDGET REBALANCED, NOT PADDED: THROW_MS and LAND_MS are
// BYTE-FOR-BYTE unchanged from Phase 4B.3 (this task's own explicit "Do
// NOT add time to the THROW merely to make the animation longer"). Only
// `RESULT_HOLD_MS` is new time; `TOTAL_CEREMONY_MS` moves from 890ms to
// 1290ms -- inside this task's own suggested ~1100-1300ms target band,
// comfortably under its ~1400ms outer ceiling, and nowhere near the
// 2-3 SECOND physics-era durations ADR-024 rejected.
export type Vec3Like = { x: number; y: number; z: number }

// ---------------------------------------------------------------------------
// Duration budget (ms) -- ADR-024 §6 target ranges, this phase's own
// CHOREOGRAPHY section
// ---------------------------------------------------------------------------
export const ENTER_MS = 100
export const ROLL_MS = 350
export const THROW_MS = ENTER_MS + ROLL_MS
export const LAND_MS = 190
export const FLOURISH_MS = 100
// PHASE 4B.4 -- the new, distinct "let the player actually read it" beat.
// 400ms sits in the middle of this task's own suggested 350-450ms range:
// long enough for a two-digit numeral to be consciously read (not merely
// glimpsed), short enough that repeated tabletop rolls do not feel
// sluggish (this task's own "the hold feels satisfying, not sluggish").
export const RESULT_HOLD_MS = 400
export const EXIT_MS = 150
export const TOTAL_CEREMONY_MS = THROW_MS + LAND_MS + FLOURISH_MS + RESULT_HOLD_MS + EXIT_MS

// ---------------------------------------------------------------------------
// PHASE 4B.3 -- LIFECYCLE WATCHDOG (this task's own PART A: "the temporary
// die presentation must eventually return to its hidden, idle state...
// There must be no code path where a completed/failed roll leaves the die
// visible forever")
// ---------------------------------------------------------------------------
// A hard wall-clock ceiling layered ON TOP OF each beat's own
// `requestAnimationFrame`-driven pacing -- see
// WorldAuthoredThreeDiceRenderer.client.vue's own `animatePhase` for
// exactly how this is used. Traced root cause: NOTHING in the previous
// implementation bounded a beat's own real-world duration except
// `requestAnimationFrame` itself continuing to fire at its ordinary
// cadence. Two real, provable ways that assumption fails: (1) an
// exception thrown inside a rAF callback is NOT caught by the `try/catch`
// that originally called `animatePhase` -- rAF callbacks run in a later,
// detached browser task, so an uncaught per-frame error leaves that
// beat's own Promise permanently pending, with no `reject` path anywhere
// in the old code to unstick it; (2) browsers throttle or fully suspend
// `requestAnimationFrame` for a backgrounded/minimized tab, so a beat
// waiting purely on rAF can stall for an arbitrary, unbounded amount of
// real time. Either one leaves `visible` stuck at `true` forever, exactly
// the reported defect. `ANIMATION_WATCHDOG_MS` fixes both: it is added ON
// TOP OF whichever beat's own `durationMs` is currently running (e.g.
// `THROW_MS` + this margin, `LAND_MS` + this margin, ...), so rAF reaches
// `t=1` well before the watchdog's own timeout in the ordinary case --
// zero added latency on the happy path (this task's own "do not add
// substantial latency") -- and only forces a beat to finish as a genuine
// last-resort safety net.
export const ANIMATION_WATCHDOG_MS = 400

// ---------------------------------------------------------------------------
// The authored throw trajectory -- "start near the lower/right
// presentation area... move inward/upward along a shallow arc" (this
// phase's own THE THROW section). Units are die-radii (the die's own
// geometry uses radius 1 -- see authoredD20ThreeOrientation.ts), centered
// on the stage; `THROW_LAND_POSITION` is the stage's own dead-center,
// matching the origin every `landingQuaternionForFace` target already
// assumes as "camera-facing."
// ---------------------------------------------------------------------------
export const THROW_START_POSITION: Vec3Like = { x: 1.15, y: -0.95, z: -0.4 }
export const THROW_PEAK_POSITION: Vec3Like = { x: 0.05, y: 0.55, z: 0.45 }
export const THROW_LAND_POSITION: Vec3Like = { x: 0, y: 0, z: 0 }

// Full turns accumulated over the ENTIRE throw -- deliberately not a
// round "1 turn" (this phase's own ROTATION STRATEGY: "Do NOT simply
// interpolate identity -> target... that will look like a model viewer.
// The ROLL phase should contain deliberate extra rotations"). Two
// different axes, two different turn counts, so the tumble reads as
// irregular/authored rather than a single clean spin.
export const SPIN_X_TURNS = 3
export const SPIN_Y_TURNS = 2.25

// A gentle rotational overshoot for LAND -- "controlled overshoot...
// controlled landing bounce," not an exaggerated bounce-house wobble.
export const LAND_OVERSHOOT = 1.2

// A tiny, tier-blind landing "impact" dip (die-radius units) during LAND
// -- see WorldAuthoredThreeDiceRenderer.client.vue's own header for how
// this composes with the rotational settle. Raised slightly this phase
// (0.06 -> 0.07) alongside the squash below, for a more decisive "THUNK"
// (this task's own CONTACT section) -- still a small fraction of the
// die's own radius (1.0), never a bounce.
export const LAND_BOB_HEIGHT = 0.07

// PHASE 4B.4 -- the die's permanent resting scale for LAND's exact final
// pose, through FLOURISH's own settle, and for the entirety of
// RESULT_HOLD. See this file's own PHASE 4B.4 header for why this exists
// (LAND-ONLY EMPHASIS's "modest die scale-up") -- deliberately modest
// (+12%), enough to measurably enlarge the projected face without reading
// as a jump-scare pop or breaking "the physical-looking 3D die itself
// must communicate the result" (this task's own NUMERAL READABILITY
// framing: emphasize, do not replace, the physical object).
export const LAND_REST_SCALE = 1.12

// A tiny, tier-blind FLOURISH scale pulse -- deliberately small (this
// phase's own "minimal for this phase"). PHASE 4B.4: peaks ABOVE, and
// settles AT, `LAND_REST_SCALE` (previously peaked above, and settled at,
// neutral `1`) -- see `flourishScale`'s own updated doc, below.
export const FLOURISH_SCALE_PEAK = LAND_REST_SCALE + 0.06

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

// Quadratic Bezier through `start` -> `control` -> `end`, evaluated at
// `t`. At `t=1` this is EXACTLY `end` (the `(1-t)^2`/`2(1-t)t` terms are
// exactly zero and `t^2` is exactly 1) -- verified as an exact-equality
// test, not merely "close," since the throw's own final position must be
// dead-center with no residual drift for LAND to begin from a known point.
export function bezierPoint(t: number, start: Vec3Like, control: Vec3Like, end: Vec3Like): Vec3Like {
  const mt = 1 - t
  const a = mt * mt
  const b = 2 * mt * t
  const c = t * t
  return {
    x: a * start.x + b * control.x + c * end.x,
    y: a * start.y + b * control.y + c * end.y,
    z: a * start.z + b * control.z + c * end.z
  }
}

// Decelerating ease -- used for the throw's own position/spin-angle
// progress so the arc settles rather than stopping abruptly.
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

// Standard "back" ease -- produces a value that rises slightly ABOVE 1
// partway through, then returns to EXACTLY 1 at `t=1` (algebraically:
// `(t-1)` is exactly 0 at `t=1`, so every term but the leading `1`
// vanishes) -- the closed-form basis for LAND's rotational
// overshoot-and-settle. `overshoot` controls how far past 1 the curve
// rises; this phase's own default (`LAND_OVERSHOOT`, above) is
// deliberately modest.
export function easeOutBack(t: number, overshoot: number = LAND_OVERSHOOT): number {
  const c3 = overshoot + 1
  const shifted = t - 1
  return 1 + c3 * shifted * shifted * shifted + overshoot * shifted * shifted
}

// The landing "impact" dip used during LAND -- zero at the start and end
// of the beat, peaking at `LAND_BOB_HEIGHT` partway through. Pure
// cosmetic motion; never affects orientation or timing.
export function landBobOffset(t: number, peakHeight: number = LAND_BOB_HEIGHT): number {
  return Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI) * peakHeight
}

// The FLOURISH scale pulse -- `LAND_REST_SCALE` at the start AND end of
// the beat (PHASE 4B.4: previously neutral `1` at start/end), peaking at
// `peak` partway through. Starting from `LAND_REST_SCALE` rather than `1`
// matters: the caller sets the die's scale to `LAND_REST_SCALE` the
// instant LAND's exact final pose locks in (WorldAuthoredThreeDice
// Renderer.client.vue's own `playD20`), so this function's own t=0 value
// must match that already-applied scale exactly, or the first FLOURISH
// frame would visibly jump.
export function flourishScale(t: number, peak: number = FLOURISH_SCALE_PEAK): number {
  return LAND_REST_SCALE + Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI) * (peak - LAND_REST_SCALE)
}

// ---------------------------------------------------------------------------
// PHASE 4B.2 -- CONTACT / WEIGHT (no physics, no collision system)
// ---------------------------------------------------------------------------
// This phase's own CONTACT / WEIGHT section names a short list of
// presentation-only techniques for perceived weight; two are implemented
// as pure math here (squash-and-stretch, contact-shadow response), applied
// to real Three.js objects by WorldAuthoredThreeDiceRenderer.client.vue.
// Neither reads or affects the die's own orientation/position TRUTH --
// squash only ever touches `scale`, and the shadow is a second, separate
// object with no bearing on the die's own transform.

// Squash-and-stretch on impact -- classic animation-principle "contact"
// cue (compressed and widened for an instant, then springs back to
// neutral) applied to LAND's own progress `t`, recovering well before
// LAND ends so it never fights FLOURISH's own separate settle pulse.
// `easeOutBack` (above) is reused here as the recovery curve, at a gentler
// overshoot than LAND's own rotational one -- this is a scale bounce, not
// a rotation, and should read as softer. Deepened this phase (0.86/1.08
// -> 0.80/1.14) -- browser feedback named LAND as not yet reading as
// decisive contact ("the player should perceive: THUNK"); a more
// pronounced compress-and-widen is the cheapest, purely-authored way to
// sell that without simulating an actual impact.
export const LAND_SQUASH_Y = 0.80
export const LAND_SQUASH_XZ = 1.14
const LAND_SQUASH_RECOVERY_FRACTION = 0.45

export function landSquashScaleY(t: number): number {
  const recoverT = Math.min(Math.max(t, 0) / LAND_SQUASH_RECOVERY_FRACTION, 1)
  return LAND_SQUASH_Y + (1 - LAND_SQUASH_Y) * easeOutBack(recoverT, 0.6)
}

export function landSquashScaleXZ(t: number): number {
  const recoverT = Math.min(Math.max(t, 0) / LAND_SQUASH_RECOVERY_FRACTION, 1)
  return LAND_SQUASH_XZ + (1 - LAND_SQUASH_XZ) * easeOutBack(recoverT, 0.6)
}

// Contact shadow -- a cheap, presentation-only "blob shadow" (this
// phase's own CONTACT section lists this explicitly: "soft contact
// shadow... shadow tightening as the die approaches LAND"). Driven purely
// by the die's OWN already-computed height above the stage floor
// (`Math.abs(position.y)`, since the authored trajectory both starts
// below and arcs above the floor at y=0) -- this reuses position data the
// throw/land curves above already produce every frame; it does not
// simulate or measure anything new. Larger height -> smaller, fainter
// shadow (die is "away" from the table); height near zero -> largest,
// darkest shadow (die is in, or approaching, contact).
export const SHADOW_MIN_SCALE = 0.55
export const SHADOW_MAX_SCALE = 1.05
export const SHADOW_MAX_OPACITY = 0.35
// Die-radius units of |y| beyond which the shadow is already at its
// smallest/faintest -- tuned against THROW_START_POSITION.y (-0.95) and
// THROW_PEAK_POSITION.y (0.55), the largest |y| excursions the authored
// trajectory actually reaches.
export const SHADOW_HEIGHT_FALLOFF = 1.0

export function shadowScaleForHeight(height: number): number {
  const t = Math.min(Math.max(Math.abs(height) / SHADOW_HEIGHT_FALLOFF, 0), 1)
  return SHADOW_MAX_SCALE - t * (SHADOW_MAX_SCALE - SHADOW_MIN_SCALE)
}

export function shadowOpacityForHeight(height: number): number {
  const t = Math.min(Math.max(Math.abs(height) / SHADOW_HEIGHT_FALLOFF, 0), 1)
  return SHADOW_MAX_OPACITY * (1 - t)
}

// ---------------------------------------------------------------------------
// PHASE 4B.2 -- FLOURISH glint (this phase's own FLOURISH section: "very
// subtle baseline flourish... tiny gold glint... Keep it extremely
// subtle")
// ---------------------------------------------------------------------------
// A brief boost ON TOP OF the active DiceSkin's own baseline
// `emissiveIntensity` (authoredD20ThreeSkin.ts) -- zero at the start/end
// of FLOURISH, peaking briefly in the middle. Deliberately tier-blind:
// nothing here reads the roll's total, natural-20/1 status, or anything
// else about WHAT was rolled -- every roll gets the identical, small
// glint (Natural 20/1-specific effects remain Phase 4D, per this phase's
// own explicit instruction).
export const FLOURISH_EMISSIVE_BOOST_PEAK = 0.35

export function flourishEmissiveBoost(t: number, peak: number = FLOURISH_EMISSIVE_BOOST_PEAK): number {
  return Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI) * peak
}
