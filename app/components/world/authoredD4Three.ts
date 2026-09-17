// authoredD4Three -- authored d4 (tetrahedron) geometry/orientation/UV.
// Roll System Phase 4C (Authored Polyhedral Dice + Multi-Die
// Presentation). Mirrors authoredD20ThreeOrientation.ts/
// authoredD20ThreeFaceUV.ts's own method exactly, independently derived
// for this die -- no import from, or dependency on, any frozen d20 file.
//
// GEOMETRY: `THREE.TetrahedronGeometry(radius, 0)` -- verified directly
// against three@0.143.0's own source
// (node_modules/three/src/geometries/TetrahedronGeometry.js): extends the
// SAME `PolyhedronGeometry` base class IcosahedronGeometry does, so it is
// non-indexed with exactly 4 triangles (12 vertices), one triangle per
// physical face, face `f` at buffer positions `3f,3f+1,3f+2` -- identical
// topology to d20, just 4 faces instead of 20.
//
// FACE VALUES: a tetrahedron has no natural antipodal-face pairing (each
// face is opposite a VERTEX, not another face, unlike d6/d8/d12/d20) --
// there is no "opposite faces sum to N" convention for a d4. Values 1-4
// are assigned to the geometry's own 4 buffer-triangle faces in order
// (face 0->1, 1->2, 2->3, 3->4), an authored, arbitrary-but-consistent,
// explicitly tested choice, not an incidental one.
//
// ORIENTATION: derived exactly like d20 -- normal=normalize(centroid),
// up_local=perpendicular component of (v0-centroid), right_local=
// up_local x normal, landing quaternion brings normal->+Z, up_local->+Y.
// HANDEDNESS: empirically verified (not assumed) by a one-off derivation
// script applying each face's own resulting quaternion to its real
// vertices -- for all 4 faces, buffer-vertex 1 lands at NEGATIVE world X
// (screen-left) and buffer-vertex 2 lands at POSITIVE world X
// (screen-right), the same pattern d20 has post-Phase-4B.6 -- so the UV
// assignment below (vertex1->left corner, vertex2->right corner) is
// correct by construction, not by the same assumption that caused the
// d20 mirror bug.
import type { QuatLike, UVPoint, Vec3Like } from './authoredPolyhedralGeometry'

export const D4_FACE_VALUES: readonly number[] = Object.freeze([1, 2, 3, 4])
export const D4_FACE_COUNT = 4

// materialIndex (buffer-triangle index 0-3) -> printed value.
export const D4_FACE_VALUE_BY_INDEX: readonly number[] = Object.freeze([1, 2, 3, 4])

export const D4_ORIENTATIONS: Readonly<Record<number, QuatLike>> = Object.freeze({
  1: { x: 0.3647052, y: -0.27984814, z: -0.88047624, w: 0.1159169 },
  2: { x: -0.88047624, y: -0.1159169, z: -0.3647052, w: -0.27984814 },
  3: { x: -0.1759199, y: 0.4247082, z: -0.82047324, w: -0.33985114 },
  4: { x: -0.70455634, y: -0.5406251, z: 0.45576804, w: 0.060003 }
})

export function landingQuaternionForD4(value: number): QuatLike | null {
  return D4_ORIENTATIONS[value] ?? null
}

// Canonical per-face UV triangle -- IDENTICAL to d20's own shape
// (top/bottom-left/bottom-right), restated (not imported) per this file's
// own header. vertex0->top, vertex1->LEFT (proven screen-left), vertex2->
// RIGHT (proven screen-right).
export const D4_UV_TOP: UVPoint = { u: 0.5, v: 0.08 }
export const D4_UV_BOTTOM_LEFT: UVPoint = { u: 0.08, v: 0.92 }
export const D4_UV_BOTTOM_RIGHT: UVPoint = { u: 0.92, v: 0.92 }
export const D4_UV_CENTROID: UVPoint = {
  u: (D4_UV_TOP.u + D4_UV_BOTTOM_LEFT.u + D4_UV_BOTTOM_RIGHT.u) / 3,
  v: (D4_UV_TOP.v + D4_UV_BOTTOM_LEFT.v + D4_UV_BOTTOM_RIGHT.v) / 3
}

export function buildD4CanonicalUVs(): Float32Array {
  const uvs = new Float32Array(D4_FACE_COUNT * 3 * 2)
  for (let f = 0; f < D4_FACE_COUNT; f++) {
    const base = f * 6
    uvs[base + 0] = D4_UV_TOP.u; uvs[base + 1] = D4_UV_TOP.v
    uvs[base + 2] = D4_UV_BOTTOM_LEFT.u; uvs[base + 3] = D4_UV_BOTTOM_LEFT.v
    uvs[base + 4] = D4_UV_BOTTOM_RIGHT.u; uvs[base + 5] = D4_UV_BOTTOM_RIGHT.v
  }
  return uvs
}

export function buildD4Geometry(three: typeof import('three'), radius: number): import('three').TetrahedronGeometry {
  const geometry = new three.TetrahedronGeometry(radius, 0)
  geometry.setAttribute('uv', new three.BufferAttribute(buildD4CanonicalUVs(), 2))
  geometry.clearGroups()
  for (let f = 0; f < D4_FACE_COUNT; f++) geometry.addGroup(f * 3, 3, f)
  return geometry
}

// Re-exported for callers that only need plain vertex-position math
// (tests, safe-area verification) without constructing a real geometry.
export type { Vec3Like }
