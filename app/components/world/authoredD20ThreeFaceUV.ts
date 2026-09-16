// authoredD20ThreeFaceUV -- the canonical per-face UV triangle for the d20
// mesh's numeral/albedo texture, and the pure geometry helpers that keep
// the UV buffer (`buildD20FaceGeometry`, consumed by
// WorldAuthoredThreeDiceRenderer.client.vue's own `buildGeometry`) and the
// numeral-drawing safe-area calculation (`paintFaceNumeral`, same file)
// provably in agreement, instead of two independently-hardcoded copies of
// the same three corner fractions that could silently drift apart. Roll
// System Phase 4B.5 (Authored d20 Face UV + Numeral Mapping Repair).
//
// Extracted into its own plain module for the same reason
// authoredD20ThreeChoreography.ts/authoredD20ThreeOrientation.ts already
// are (see each file's own header): this repo's Vitest setup has no
// DOM/WebGL environment, but `three`'s own geometry/math classes
// (`IcosahedronGeometry`, `BufferAttribute`, ...) have no DOM dependency
// at all and run fine under plain Node -- so the ACTUAL generated
// `BufferGeometry` this file produces can be constructed and inspected
// directly in a test, not merely asserted about via hand-written
// duplicate constants ("do not rely on incidental array ordering without
// testing it," this phase's own FACE / MATERIAL CORRESPONDENCE section).
//
// ---------------------------------------------------------------------------
// THE PROVEN ROOT CAUSE (this phase's own trace -- not assumed)
// ---------------------------------------------------------------------------
// Phase 4B.1 already replaced THREE.IcosahedronGeometry's own default
// spherical (azimuth/inclination) UVs -- read directly from
// node_modules/three/src/geometries/PolyhedronGeometry.js's own
// `generateUVs()`/`correctUVs()`/`correctSeam()` -- with a canonical
// top/bottom-right/bottom-left triangle, IDENTICALLY repeated for all 20
// faces via `geometry.setAttribute('uv', ...)` before `addGroup`-ing each
// face its own materialIndex. That part was already correct: every face
// DOES receive its own independent canonical UV triangle, not a
// spherical/atlas sliver of a shared image. This phase's own instruction
// to "prove, don't assume" the spherical-UV hypothesis is answered: it is
// FALSE, proven by reading the actual installed geometry source, not by
// re-reading this codebase's own prior comments about it.
//
// The ACTUAL, proven defect is one property away from the UV VALUES
// entirely. `THREE.Texture.flipY` defaults to `true` (verified in
// node_modules/three/src/textures/Texture.js's own constructor), and
// WebGLTextures.js applies it via
// `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY)` before
// uploading each CanvasTexture. Per the WebGL spec, that setting flips
// the source image vertically on upload -- texture coordinate v=0 ends up
// sampling the CANVAS'S BOTTOM row, and v=1 samples the canvas's TOP row.
// That is the exact opposite of "v behaves like a plain top-to-bottom
// canvas-Y fraction," which every canvas-drawing call in
// `paintFaceNumeral`/`paintFaceBackground`
// (WorldAuthoredThreeDiceRenderer.client.vue) implicitly assumed.
//
// Concretely, with the UV triangle below (top at v=0.08, base at v=0.92)
// and the default `flipY=true`, the ACTUAL sampled triangle in
// canvas-pixel space is the VERTICAL MIRROR of the intended one: the
// "top" vertex's own v=0.08 samples canvas y-fraction `1 - 0.08 = 0.92`
// (the canvas's BOTTOM), and the two "bottom" vertices' v=0.92 sample
// canvas y-fraction `1 - 0.92 = 0.08` (the canvas's TOP) -- a
// downward-pointing sliver, not the upward-pointing one the numeral was
// centered against. The numeral, drawn at the originally-intended
// centroid (canvas y-fraction ~= 0.64), therefore sits far outside the
// narrow region the GPU actually samples at that height: at y=0.64 the
// REAL sampled triangle (per `halfWidthAtCanvasFraction`, below) is only
// ~0.28 of the canvas wide -- comfortably narrower than a two-digit
// numeral's rendered width, and even tight for a one-digit numeral once
// its outline stroke is included. This is the proven cause of "oversized/
// cropped numerals, numerals spilling toward triangle edges."
//
// THE FIX, in two independent parts (both required; see
// WorldAuthoredThreeDiceRenderer.client.vue's own PHASE 4B.5 header for
// exactly where each is applied):
//   1. Set `texture.flipY = false` on every per-face CanvasTexture. This
//      alone makes the GPU sample canvas rows in their natural
//      top-to-bottom order, so v now behaves exactly as every
//      canvas-drawing call already assumed -- with ZERO change to the UV
//      VALUES below, vertex positions, or orientation data.
//   2. Give `paintFaceNumeral` a REAL, principled way to size the glyph
//      against how much room actually exists at its anchor height
//      (`halfWidthAtCanvasFraction`, below) -- measuring the string's own
//      rendered width and scaling to fit, rather than a flat font-size
//      fraction that happened to look plausible against the WRONG
//      sampled region.

export type FaceUVPoint = { u: number; v: number }

// The canonical per-face UV triangle, IDENTICAL for all 20 faces --
// UNCHANGED IN VALUE from Phase 4B.1's own triangle (only `texture.flipY`
// changes how these are actually sampled; the numbers themselves were
// never the defect). Buffer-vertex 0 of every face is, by construction
// (authoredD20ThreeOrientation.ts's own derivation, step 2), the vertex
// that becomes screen-up once a face is landed -- so it is assigned the
// TOP corner here, exactly as before this phase.
export const FACE_UV_TOP: FaceUVPoint = { u: 0.5, v: 0.08 }
export const FACE_UV_BOTTOM_RIGHT: FaceUVPoint = { u: 0.92, v: 0.92 }
export const FACE_UV_BOTTOM_LEFT: FaceUVPoint = { u: 0.08, v: 0.92 }

// A d20 has exactly 20 triangular faces -- restated here (rather than
// imported from authoredD20ThreeOrientation.ts) so this module has zero
// dependency on that one, matching that file's own "independent
// derivation for an independent concern" discipline.
export const D20_FACE_COUNT = 20

// The centroid of the canonical UV triangle -- the numeral's anchor point
// in BOTH UV space and (once `texture.flipY = false` makes the two agree)
// canvas-pixel-fraction space.
export const FACE_UV_CENTROID: FaceUVPoint = {
  u: (FACE_UV_TOP.u + FACE_UV_BOTTOM_RIGHT.u + FACE_UV_BOTTOM_LEFT.u) / 3,
  v: (FACE_UV_TOP.v + FACE_UV_BOTTOM_RIGHT.v + FACE_UV_BOTTOM_LEFT.v) / 3
}

// Builds the flat per-vertex UV buffer for the die's non-indexed
// BufferGeometry -- the SAME canonical triangle, repeated identically for
// each of the 20 faces' own 3 buffer vertices. Face `f` occupies buffer
// positions `3f, 3f+1, 3f+2` (matching `authoredD20ThreeOrientation.ts`'s
// own documented buffer layout, and `IcosahedronGeometry(radius, 0)`'s own
// non-indexed, "one triangle's 3 vertices per contiguous buffer slice"
// construction -- verified directly against
// node_modules/three/src/geometries/PolyhedronGeometry.js, which builds
// `position`/`normal`/`uv` as flat `Float32BufferAttribute`s with no
// index attribute at all).
export function buildCanonicalFaceUVs(faceCount: number = D20_FACE_COUNT): Float32Array {
  const uvs = new Float32Array(faceCount * 3 * 2)
  for (let f = 0; f < faceCount; f++) {
    const base = f * 6
    uvs[base + 0] = FACE_UV_TOP.u
    uvs[base + 1] = FACE_UV_TOP.v
    uvs[base + 2] = FACE_UV_BOTTOM_RIGHT.u
    uvs[base + 3] = FACE_UV_BOTTOM_RIGHT.v
    uvs[base + 4] = FACE_UV_BOTTOM_LEFT.u
    uvs[base + 5] = FACE_UV_BOTTOM_LEFT.v
  }
  return uvs
}

// Builds the d20's mesh geometry: a real `THREE.IcosahedronGeometry`
// (vertex POSITIONS untouched, still Phase 4B.1's own construction), with
// its default spherical UVs replaced by the canonical per-face triangle
// above, and one `geometry.addGroup` per face so 20 independent
// `MeshStandardMaterial`s (one numeral each) can be painted onto one
// physical mesh -- see this file's own header for the full rationale.
// Takes the live `three` module (not a hardcoded import) so this stays
// testable with the SAME real package the renderer uses, matching
// authoredD20ThreeOrientation.ts's own derivation-script discipline.
// Edge-normal softening (WorldAuthoredThreeDiceRenderer.client.vue's own
// `applySoftenedEdgeNormals`) is deliberately NOT applied here -- that is
// a presentation-only lighting concern, unrelated to UV/face-mapping
// correctness, and stays the renderer's own responsibility.
export function buildD20FaceGeometry(three: typeof import('three'), radius: number): import('three').IcosahedronGeometry {
  const geometry = new three.IcosahedronGeometry(radius, 0)

  geometry.setAttribute('uv', new three.BufferAttribute(buildCanonicalFaceUVs(), 2))

  geometry.clearGroups()
  for (let f = 0; f < D20_FACE_COUNT; f++) geometry.addGroup(f * 3, 3, f)

  return geometry
}

// The signed area of 2D triangle (a, b, c) -- its SIGN (not magnitude)
// indicates winding direction; positive and negative correspond to the
// two opposite windings. Used to prove every face's own UV triangle winds
// the SAME direction (this phase's own "normalize winding rather than
// rotating individual textures ad hoc"), which is true here BY
// CONSTRUCTION (`buildCanonicalFaceUVs` assigns the literal same three
// points, in the same order, to every face) but is proven by test against
// the real generated geometry rather than merely asserted.
export function signedUVTriangleArea(a: FaceUVPoint, b: FaceUVPoint, c: FaceUVPoint): number {
  return (b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v)
}

// How much horizontal room (as a FRACTION of the texture's own width)
// exists at canvas-fraction height `y`, inside the canonical UV triangle
// -- assuming `texture.flipY = false` (this module's own header), so `y`
// and `v` are the same axis and this triangle IS the actually-sampled
// one, not its mirror. Zero at/above the apex (`FACE_UV_TOP.v`, where the
// triangle is a single point), the full base half-width at/below the base
// (`FACE_UV_BOTTOM_LEFT.v`/`FACE_UV_BOTTOM_RIGHT.v` -- the canonical
// triangle is isosceles with a level base, so these are equal). This is
// the real, principled quantity `paintFaceNumeral`
// (WorldAuthoredThreeDiceRenderer.client.vue) fits a numeral's rendered
// width against, replacing a flat, unverified font-size fraction.
export function halfWidthAtCanvasFraction(y: number): number {
  const topV = FACE_UV_TOP.v
  const baseV = FACE_UV_BOTTOM_LEFT.v
  const baseHalfWidth = (FACE_UV_BOTTOM_RIGHT.u - FACE_UV_BOTTOM_LEFT.u) / 2
  const t = Math.min(Math.max((y - topV) / (baseV - topV), 0), 1)
  return baseHalfWidth * t
}
