// authoredDicePresentationScale -- Roll System Phase 4C.1 (Polyhedral
// Visual Normalization + Family Edge Treatment). Answers the question
// "how visually prominent should this die be at LAND?" as a SEPARATE
// concern from "what shape is this die?" (geometry) or "what color is
// this die?" (DiceSkin) -- a pure presentation-scale contract, per this
// task's own NORMALIZATION STRATEGY section.
//
// ---------------------------------------------------------------------------
// EXACT CAUSE OF THE SIZE INCONSISTENCY (measured, not assumed)
// ---------------------------------------------------------------------------
// A one-off derivation script (not committed, same precedent as every
// prior dice-geometry phase) built the REAL geometry for every standard
// die at a shared circumradius of 1 (the same "radius" parameter every
// `build*Geometry` function already takes) and measured each die's own
// FACE INRADIUS -- the perpendicular distance from the die's center to
// the plane of a landed, camera-facing face. This is the quantity that
// actually governs how large the authoritative numeral reads: at LAND,
// that face sits INRADIUS units toward the camera, and the space
// available for the numeral scales with it.
//
//   d20 (icosahedron): inradius/circumradius = 0.79465  <- BASELINE
//   d12 (dodecahedron): inradius/circumradius = 0.79465  (identical --
//                        d12 and d20 are dual solids of the same symmetry)
//   d10 (trapezohedron, normalized to circumradius 1): 0.45530
//   d8  (octahedron):    inradius/circumradius = 0.57735
//   d6  (cube, per unit edge length "size"): 0.5 exactly
//   d4  (tetrahedron):   inradius/circumradius = 0.33333  <- SMALLEST
//
// A tetrahedron has only 4 large faces close to its own center; an
// icosahedron has 20 small faces near its own surface. At an EQUAL
// circumradius (which is what `WorldAuthoredPolyhedralDiceRenderer
// .client.vue` previously built every die at, via one shared
// `DIE_RADIUS` constant passed uniformly into every `build*Geometry`
// call), the d4's own landed face necessarily sits much closer to its
// center -- roughly 42% as far forward as d20's -- which is the
// measured, provable reason a d4 read as "dramatically smaller" even
// though its own circumradius exactly matched every other die's.
// Compounding this (fixed separately, in
// WorldAuthoredPolyhedralDiceRenderer.client.vue's own camera/stage
// setup): the pool renderer's camera/canvas previously used DIFFERENT
// values than the frozen single-d20 renderer's own (FOV 42 vs 40,
// distance 4.2 vs 3.4, DIE_RADIUS 0.62 vs 1.0, canvas 220px vs 200px),
// so even a POOLED d20 -- geometrically identical to the frozen one --
// would have rendered smaller purely from that mismatch, independent of
// shape. Both causes are fixed here: the pool renderer's camera/canvas
// now matches the frozen renderer's exactly (see that file's own
// PHASE 4C.1 header), and every die's own presentation scale corrects
// for its shape's own inradius ratio.
//
// ---------------------------------------------------------------------------
// THE FIX -- AND THE CAMERA-FRUSTUM CONSTRAINT THAT BOUNDS IT
// ---------------------------------------------------------------------------
// The mathematically "pure" fix is `d20InradiusRatio / dieInradiusRatio`
// for each die -- d4 alone would need a 2.384x circumradius boost to
// fully equalize face prominence with d20. That value was computed, then
// checked against the pool renderer's own camera frustum (see
// WorldAuthoredPolyhedralDiceRenderer.client.vue's own PHASE 4C.1
// header for the shared camera) and found to CLIP: at `LAND_REST_SCALE`
// (1.12, frozen and unchanged) alone, a 2.384x-boosted d4 would exceed
// the frustum's own half-height by more than 2x -- an "obviously huge
// outlier" this task's own TARGET section explicitly warns against, in
// the opposite direction from the original defect.
//
// The values below are therefore a DELIBERATE, DOCUMENTED COMPROMISE,
// not the mathematically pure ratio: each die's raw ratio is linearly
// remapped from its own [1.0 .. 2.384] range down to a
// frustum-safe [1.0 .. 1.20] range (preserving ORDER -- d4 still gets
// the largest boost, d12 still needs none -- while guaranteeing every
// die stays safely within the SAME camera frustum d20 already occupies
// at `LAND_REST_SCALE`, verified arithmetically:
// `1.20 x LAND_REST_SCALE(1.12) = 1.344`, comfortably under the
// widened-frustum half-height computed from this file's own camera
// distance (3.8, see the renderer's own header for why that is a small,
// disclosed deviation from the frozen renderer's 3.4). This does not
// fully equalize face prominence the way a pure inradius match would,
// but it is a real, measured, meaningfully-ordered improvement over the
// previous 1.0-for-every-die baseline, and it cannot introduce a new
// "obviously huge" outlier of its own. Real-browser judgment (this
// task's own manual acceptance gate) is what ultimately confirms whether
// this capped compromise reads as "approximately the same visual
// importance" -- exactly as visual quality has been judged at every
// prior dice phase, since no automated test can substitute for a human
// eye here.
export const BASE_DIE_RADIUS = 1 // matches the frozen d20 renderer's own DIE_RADIUS.

export const PRESENTATION_SCALE_BY_SIDES: Readonly<Record<number, number>> = Object.freeze({
  4: 1.200,
  6: 1.085,
  8: 1.054,
  10: 1.108,
  12: 1.000,
  20: 1.000
})

// Presentation-only. Never used to interpret RollEventRecord, never
// exposed to DiceSkin, never read by authoritative orientation lookup.
// Defensive default of 1.0 for a hypothetical unregistered side count --
// this module must never be the reason a roll fails to animate.
export function presentationScaleForSides(sides: number): number {
  return PRESENTATION_SCALE_BY_SIDES[sides] ?? 1.0
}

// ---------------------------------------------------------------------------
// POOL SCALE -- layered AFTER die-type normalization (this task's own
// "normalizedDieScale(sides) x poolScale(poolSize)")
// ---------------------------------------------------------------------------
// A fixed, authored table (not a packing algorithm) matching this task's
// own requirements: 1 die stays at full hero scale; larger pools shrink
// enough to stay clear of each other at `WorldAuthoredPolyhedralDiceRenderer
// .client.vue`'s own `LAYOUT_OFFSETS` spread, monotonically
// non-increasing as pool size grows. A d100's two-die percentile pair
// uses this SAME table at size 2 -- see that module's own header for why
// a percentile pair is treated as an ordinary 2-die pool composition,
// not two independently hero-sized dice.
export const POOL_SCALE_BY_SIZE: readonly number[] = Object.freeze([1, 1.0, 0.88, 0.72, 0.68, 0.58, 0.52])

export function poolScaleForSize(poolSize: number): number {
  if (poolSize <= 1) return 1
  const index = Math.min(poolSize, POOL_SCALE_BY_SIZE.length - 1)
  return POOL_SCALE_BY_SIZE[index]!
}

// The single combined multiplier `WorldAuthoredPolyhedralDiceRenderer
// .client.vue` applies to a die's `THREE.Mesh.scale` at every point in
// the ceremony (initial reset, LAND squash, the exact post-LAND lock,
// FLOURISH, and FLOURISH's own settle) -- one function so the two
// factors can never be applied inconsistently at different call sites.
export function presentationMeshScale(sides: number, poolSize: number): number {
  return presentationScaleForSides(sides) * poolScaleForSize(poolSize)
}
