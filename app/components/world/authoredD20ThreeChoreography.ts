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

export type Vec3Like = { x: number; y: number; z: number }

// ---------------------------------------------------------------------------
// Duration budget (ms) -- ADR-024 §6 target ranges, this phase's own
// CHOREOGRAPHY section
// ---------------------------------------------------------------------------
export const ENTER_MS = 100
export const ROLL_MS = 350
export const THROW_MS = ENTER_MS + ROLL_MS
export const LAND_MS = 170
export const FLOURISH_MS = 100
export const EXIT_MS = 130
export const TOTAL_CEREMONY_MS = THROW_MS + LAND_MS + FLOURISH_MS + EXIT_MS

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
// this composes with the rotational settle.
export const LAND_BOB_HEIGHT = 0.06

// A tiny, tier-blind FLOURISH scale pulse -- deliberately small (this
// phase's own "minimal for this phase").
export const FLOURISH_SCALE_PEAK = 1.05

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

// The FLOURISH scale pulse -- 1 at the start and end of the beat, peaking
// at `peak` partway through.
export function flourishScale(t: number, peak: number = FLOURISH_SCALE_PEAK): number {
  return 1 + Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI) * (peak - 1)
}
