// authoredD20ThreeOrientation -- the explicit d20 landing-quaternion table
// for the Three.js-based authored renderer. Roll System Phase 4B.1
// (Authored Three.js d20 Proof of Concept, ADR-024 Option 2), implementing
// ADR-024 (.github/docs/architecture/adr-024-authored-dice-presentation.md)
// §7 ("Face presentation -- determinism by construction") and this
// phase's own AUTHORITATIVE FACE ORIENTATIONS section: "Given face = N,
// there must exist targetQuaternion(N) or equivalent... explicit and
// testable."
//
// REUSES PHASE 4B'S MATHEMATICAL WORK, NOT ITS CODE. Phase 4B's own
// authoredD20Orientation.ts solved "what CSS rotation brings face N to
// the front" for a hand-placed sphere of independent face cards. This
// module solves the analogous problem for a SINGLE RIGID MESH (a real
// THREE.IcosahedronGeometry) sharing one rotation for all 20 faces at
// once -- a harder problem, because a rigid body's orientation must
// simultaneously satisfy TWO constraints per face (which way it points,
// AND which way is "up" for that specific face's printed numeral), not
// one. Nothing here imports from or depends on Phase 4B's own module;
// this is an independent derivation for an independent renderer, per this
// phase's own "do not couple the new renderer to [the old one's] runtime
// behavior" instruction -- read as applying equally to Phase 4B's CSS
// proof of concept, not only to dice-box-threejs.
//
// ---------------------------------------------------------------------------
// DERIVATION (for verification / re-derivation -- not executed by the
// app; a one-off Node ESM script, using the REAL `three` package Eldra
// now depends on directly, not a hand-transcribed copy of its geometry,
// produced the tables below)
// ---------------------------------------------------------------------------
// 1. GEOMETRY. `new THREE.IcosahedronGeometry(radius, 0)` -- read directly
//    from three@0.143.0's own source (node_modules/three/src/geometries/
//    IcosahedronGeometry.js, PolyhedronGeometry.js): a non-indexed
//    BufferGeometry of exactly 20 triangles (60 vertices), one triangle
//    per face, IN THE SAME ORDER as the library's own internal 20-face
//    index list (itself the same canonical 12-vertex golden-ratio
//    icosahedron construction Phase 4B's own module already documents).
//    Face `f`'s three vertices live at buffer positions `3f, 3f+1, 3f+2`.
// 2. PER-FACE FRAME. For each face `f`:
//      centroid = mean(v0, v1, v2)
//      normal   = normalize(centroid)         -- outward normal; the
//                 icosahedron is centered at the origin, so a face's
//                 centroid direction is exactly its normal direction.
//      up_local = normalize(v0 - centroid, then Gram-Schmidt-orthogonalized
//                 against `normal`) -- i.e. the (normal-perpendicular
//                 component of the) direction from this face's centroid
//                 toward ITS OWN buffer-vertex-0. This is the same vertex
//                 WorldAuthoredThreeDiceRenderer.client.vue's own UV
//                 assignment treats as "the top of this face's printed
//                 numeral" -- see that file's own header -- so "up_local"
//                 and "numeral up" are the same direction BY
//                 CONSTRUCTION, not by coincidence or trial and error.
//      right_local = normalize(up_local × normal)
// 3. LANDING QUATERNION. `localBasis` = the 3x3/4x4 matrix whose COLUMNS
//    are [right_local, up_local, normal] -- i.e. "this face's own
//    coordinate frame, expressed in the die's local/object space." The
//    quaternion that brings normal -> world +Z (camera-facing) AND
//    up_local -> world +Y (screen-up) SIMULTANEOUSLY is the ROTATION
//    (not just the matrix) `transpose(localBasis)` (= its inverse, since
//    localBasis is orthonormal) converted to a quaternion via
//    `THREE.Quaternion.setFromRotationMatrix`.
// 4. VALUE ASSIGNMENT. The icosahedron is centrally symmetric (like Phase
//    4B's own derivation already established), so its 20 faces form 10
//    antipodal pairs; values 1-10 were assigned to one face of each pair
//    (in pairing-discovery order) and 21-that-value to its partner,
//    matching the real d20 convention that opposite faces sum to 21 --
//    the SAME method Phase 4B's own module uses, independently re-run
//    here against this geometry's own face order (which need not, and in
//    fact does not, match Phase 4B's pairing order 1:1 -- the two
//    renderers assign values to geometrically DIFFERENT constructions,
//    so there is no requirement, and no attempt, to keep "face index 5"
//    meaning the same thing across both).
// 5. VERIFICATION (performed by the derivation script itself, then
//    independently re-verified in
//    tests/components/world/authoredD20ThreeOrientation.test.ts, which
//    replicates this exact basis-construction and quaternion arithmetic
//    rather than merely checking the tables "look reasonable"): for every
//    one of the 20 faces, applying that face's own landing quaternion to
//    its own `normal` and `up_local` vectors reproduces world +Z and
//    world +Y respectively to within ~1e-16 (double-precision floating
//    point noise) -- i.e. landing on face N provably brings exactly that
//    face to dead-center, camera-facing, with its printed numeral upright
//    on screen.

export type D20ThreeOrientation = {
  x: number
  y: number
  z: number
  w: number
}

// The 20 supported face values -- exactly `1..20`, matching
// authoredD20Orientation.ts's own identically-named export (Phase 4B),
// restated here rather than imported so this module has zero dependency
// on that one (see this file's own header).
export const D20_FACE_VALUES: readonly number[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
])

// The explicit landing-quaternion table, keyed by printed face VALUE
// (1-20) -- what WorldAuthoredThreeDiceRenderer.client.vue's own
// `playD20(face)` looks up directly, in place of anything a simulation
// might discover.
export const D20_THREE_ORIENTATIONS: Readonly<Record<number, D20ThreeOrientation>> = Object.freeze({
  1: { x: -0.41182856, y: 0.20425989, z: 0.84159247, w: -0.28354408 },
  2: { x: 0.00000000, y: 0.56708814, z: 0.82365712, w: 0.00000000 },
  3: { x: 0.41182855, y: 0.71330799, z: 0.49111273, w: 0.28354407 },
  4: { x: 0.66635261, y: 0.58706842, z: -0.02902003, w: 0.45878394 },
  5: { x: 0.66635261, y: 0.23658868, z: -0.53806812, w: 0.45878394 },
  6: { x: -0.02902003, y: -0.45878394, z: -0.66635261, w: 0.58706842 },
  7: { x: 0.12828449, y: 0.12828449, z: -0.69537263, w: 0.69537263 },
  8: { x: 0.23658868, y: 0.66635261, z: -0.45878394, w: 0.53806812 },
  9: { x: 0.25452405, y: 0.94989667, z: -0.04695538, w: 0.17523987 },
  10: { x: 0.17523986, y: 0.87061250, z: 0.38280853, w: -0.25452405 },
  11: { x: -0.45878394, y: 0.02902003, z: 0.58706842, w: 0.66635261 },
  12: { x: 0.12828449, y: -0.12828449, z: 0.69537263, w: 0.69537263 },
  13: { x: 0.66635261, y: -0.23658868, z: 0.53806812, w: 0.45878394 },
  14: { x: 0.94989667, y: -0.25452405, z: 0.17523987, w: 0.04695538 },
  15: { x: 0.87061250, y: -0.17523986, z: -0.25452405, w: -0.38280853 },
  16: { x: 0.23658868, y: -0.66635261, z: 0.45878394, w: 0.53806812 },
  17: { x: -0.20425989, y: -0.41182856, z: 0.28354408, w: 0.84159247 },
  18: { x: -0.56708814, y: 0.00000000, z: 0.00000000, w: 0.82365712 },
  19: { x: 0.71330799, y: -0.41182855, z: 0.28354407, w: -0.49111273 },
  20: { x: -0.58706842, y: 0.66635261, z: -0.45878394, w: -0.02902003 }
})

// Face-index (0-19, in the SAME order `new THREE.IcosahedronGeometry(r,
// 0)` produces its 20 triangles, and therefore the exact order
// WorldAuthoredThreeDiceRenderer.client.vue's own `geometry.addGroup(3f,
// 3, f)` assigns materialIndex `f`) -> printed value. This is what
// actually drives "which numbered material goes on which physical
// triangle" at mesh-construction time; `D20_THREE_ORIENTATIONS` above is
// what drives "which way to rotate the finished mesh." The two tables
// were produced by, and are consistent with, the SAME derivation run
// (see this file's own header) -- they are not independently guessed
// numbers that merely need to happen to agree.
export const D20_THREE_FACE_VALUE_BY_INDEX: readonly number[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 20, 16, 12, 11, 15, 14, 13
])

// The landing quaternion for `value`, or `null` for anything outside the
// 20 supported faces -- never a guessed/default orientation. Returns a
// plain `{x,y,z,w}` object (not a `THREE.Quaternion` instance) so this
// module stays free of any `three` import -- WorldAuthoredThreeDice
// Renderer.client.vue's own `THREE.Quaternion.set(x,y,z,w)` is the one
// place this plain data becomes a real quaternion, matching this
// codebase's established "renderer-specific types never cross the
// adapter boundary" discipline (~/lib/dice-presentation/renderer.ts),
// extended here one layer further in, to keep even this PURE data module
// trivially testable without a WebGL-capable environment.
export function landingQuaternionForFace(value: number): D20ThreeOrientation | null {
  return D20_THREE_ORIENTATIONS[value] ?? null
}
