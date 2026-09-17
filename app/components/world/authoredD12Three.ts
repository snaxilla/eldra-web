// authoredD12Three -- authored d12 (dodecahedron) geometry/orientation/UV.
// Roll System Phase 4C. See authoredD4Three.ts's own header for the
// shared derivation method; this file documents only what's DIFFERENT
// about a pentagonal-faced solid.
//
// GEOMETRY -- THE HARD CASE. `THREE.DodecahedronGeometry(radius, 0)` also
// extends `PolyhedronGeometry`, but (verified directly against its own
// source) each of its 12 PHYSICAL pentagon faces is pre-triangulated into
// 3 triangles fanned from one shared vertex (36 triangles total, 108
// non-indexed buffer vertices) -- unlike every triangular die in this
// family, "one materialIndex per buffer-triangle" does NOT correspond to
// "one materialIndex per physical face" here. This module therefore does
// NOT reuse `DodecahedronGeometry`'s own raw buffer -- `D12_PENTAGON
// _VERTICES` below hardcodes each pentagon's own 5 real vertex positions,
// in a fixed [shared, A, B, C, D] boundary order (extracted from that
// same real geometry by a one-off derivation script that identified the
// vertex shared by all 3 triangles of each face-group and walked the
// remaining boundary edge-to-edge -- not committed, matching
// authoredD20ThreeOrientation.ts's own documented precedent).
// `buildD12Geometry` re-triangulates each pentagon as
// (shared,A,B),(shared,B,C),(shared,C,D) -- verified outward-winding by
// the same script -- giving 12 groups of 9 buffer vertices (3 triangles)
// each, one materialIndex per PHYSICAL face.
//
// ORIENTATION: normal=normalize(centroid), up_local=perpendicular
// component of (shared-centroid) -- "shared" plays the same "up
// reference" role buffer-vertex-0 plays for a triangular die.
//
// HANDEDNESS: empirically verified for all 12 faces -- after landing,
// the pentagon boundary [shared,A,B,C,D] lands at screen positions
// [top, upper-left, lower-left, lower-right, upper-right] UNIFORMLY
// across every face (a clean, verified counter-clockwise walk), so the
// canonical UV below assigns those exact five screen roles with no
// per-face exception needed.
//
// FACE VALUES: standard opposite-faces-sum-to-13 convention (1<->12,
// 2<->11, ..., 6<->7), matching antipodal pairing verified from the real
// geometry's own pentagon centroids.
import type { QuatLike, UVPoint, Vec3Like } from './authoredPolyhedralGeometry'

export const D12_FACE_VALUES: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
export const D12_FACE_COUNT = 12

// pentagon index (0-11, matching D12_PENTAGON_VERTICES) -> printed value.
export const D12_FACE_VALUE_BY_INDEX: readonly number[] = Object.freeze([1, 2, 3, 4, 11, 5, 6, 10, 12, 9, 7, 8])

export const D12_ORIENTATIONS: Readonly<Record<number, QuatLike>> = Object.freeze({
  1: { x: 0.28623056, y: -0.39396257, z: -0.70661304, w: 0.51338442 },
  2: { x: -0.24348226, y: -0.66386474, z: -0.55613273, w: 0.43671088 },
  3: { x: -0.68019314, y: -0.68019314, z: -0.19322861, w: 0.19322861 },
  4: { x: -0.85709336, y: -0.43671086, z: 0.24348226, w: -0.1240604 },
  11: { x: 0.43671088, y: 0.55613273, z: -0.66386474, w: 0.24348226 },
  5: { x: -0.70661304, y: -0.51338442, z: -0.28623056, w: -0.39396257 },
  6: { x: 0.55613273, y: 0.43671088, z: -0.24348226, w: 0.66386474 },
  10: { x: 0.19322861, y: 0.19322861, z: -0.68019314, w: 0.68019314 },
  12: { x: -0.51338442, y: -0.70661304, z: 0.39396257, w: 0.28623056 },
  9: { x: -0.1240604, y: -0.24348226, z: -0.43671086, w: 0.85709336 },
  7: { x: -0.39396258, y: -0.58719118, z: -0.02641992, w: 0.70661304 },
  8: { x: -0.39396257, y: 0.28623056, z: -0.51338442, w: 0.70661304 }
})

export function landingQuaternionForD12(value: number): QuatLike | null {
  return D12_ORIENTATIONS[value] ?? null
}

// Each entry is [shared, A, B, C, D] -- real vertex positions of a unit
// (radius-1) dodecahedron, pentagon index matching
// `D12_FACE_VALUE_BY_INDEX`.
export const D12_PENTAGON_VERTICES: readonly Vec3Like[][] = Object.freeze([
  [{ x: -0.57735026, y: 0.57735026, z: 0.57735026 }, { x: 0, y: 0.3568221, z: 0.93417233 }, { x: 0.57735026, y: 0.57735026, z: 0.57735026 }, { x: 0.3568221, y: 0.93417233, z: 0 }, { x: -0.3568221, y: 0.93417233, z: 0 }],
  [{ x: 0.57735026, y: 0.57735026, z: 0.57735026 }, { x: 0.93417233, y: 0, z: 0.3568221 }, { x: 0.93417233, y: 0, z: -0.3568221 }, { x: 0.57735026, y: 0.57735026, z: -0.57735026 }, { x: 0.3568221, y: 0.93417233, z: 0 }],
  [{ x: 0.93417233, y: 0, z: -0.3568221 }, { x: 0.57735026, y: -0.57735026, z: -0.57735026 }, { x: 0, y: -0.3568221, z: -0.93417233 }, { x: 0, y: 0.3568221, z: -0.93417233 }, { x: 0.57735026, y: 0.57735026, z: -0.57735026 }],
  [{ x: 0, y: -0.3568221, z: -0.93417233 }, { x: -0.57735026, y: -0.57735026, z: -0.57735026 }, { x: -0.93417233, y: 0, z: -0.3568221 }, { x: -0.57735026, y: 0.57735026, z: -0.57735026 }, { x: 0, y: 0.3568221, z: -0.93417233 }],
  [{ x: -0.57735026, y: -0.57735026, z: -0.57735026 }, { x: -0.3568221, y: -0.93417233, z: 0 }, { x: -0.57735026, y: -0.57735026, z: 0.57735026 }, { x: -0.93417233, y: 0, z: 0.3568221 }, { x: -0.93417233, y: 0, z: -0.3568221 }],
  [{ x: 0.57735026, y: 0.57735026, z: -0.57735026 }, { x: 0, y: 0.3568221, z: -0.93417233 }, { x: -0.57735026, y: 0.57735026, z: -0.57735026 }, { x: -0.3568221, y: 0.93417233, z: 0 }, { x: 0.3568221, y: 0.93417233, z: 0 }],
  [{ x: -0.57735026, y: 0.57735026, z: -0.57735026 }, { x: -0.93417233, y: 0, z: -0.3568221 }, { x: -0.93417233, y: 0, z: 0.3568221 }, { x: -0.57735026, y: 0.57735026, z: 0.57735026 }, { x: -0.3568221, y: 0.93417233, z: 0 }],
  [{ x: -0.93417233, y: 0, z: 0.3568221 }, { x: -0.57735026, y: -0.57735026, z: 0.57735026 }, { x: 0, y: -0.3568221, z: 0.93417233 }, { x: 0, y: 0.3568221, z: 0.93417233 }, { x: -0.57735026, y: 0.57735026, z: 0.57735026 }],
  [{ x: 0.57735026, y: -0.57735026, z: -0.57735026 }, { x: 0.3568221, y: -0.93417233, z: 0 }, { x: -0.3568221, y: -0.93417233, z: 0 }, { x: -0.57735026, y: -0.57735026, z: -0.57735026 }, { x: 0, y: -0.3568221, z: -0.93417233 }],
  [{ x: 0, y: 0.3568221, z: 0.93417233 }, { x: 0, y: -0.3568221, z: 0.93417233 }, { x: 0.57735026, y: -0.57735026, z: 0.57735026 }, { x: 0.93417233, y: 0, z: 0.3568221 }, { x: 0.57735026, y: 0.57735026, z: 0.57735026 }],
  [{ x: 0.93417233, y: 0, z: 0.3568221 }, { x: 0.57735026, y: -0.57735026, z: 0.57735026 }, { x: 0.3568221, y: -0.93417233, z: 0 }, { x: 0.57735026, y: -0.57735026, z: -0.57735026 }, { x: 0.93417233, y: 0, z: -0.3568221 }],
  [{ x: -0.57735026, y: -0.57735026, z: 0.57735026 }, { x: -0.3568221, y: -0.93417233, z: 0 }, { x: 0.3568221, y: -0.93417233, z: 0 }, { x: 0.57735026, y: -0.57735026, z: 0.57735026 }, { x: 0, y: -0.3568221, z: 0.93417233 }]
])

// Canonical pentagon UV, proven (not assumed) from the real, uniform
// screen-space landing positions of [shared,A,B,C,D] across all 12 faces:
// shared->top, A->upper-left, B->lower-left, C->lower-right, D->upper-right.
export const D12_UV_TOP: UVPoint = { u: 0.5, v: 0.08 }
export const D12_UV_UPPER_LEFT: UVPoint = { u: 0.08, v: 0.40 }
export const D12_UV_LOWER_LEFT: UVPoint = { u: 0.24, v: 0.92 }
export const D12_UV_LOWER_RIGHT: UVPoint = { u: 0.76, v: 0.92 }
export const D12_UV_UPPER_RIGHT: UVPoint = { u: 0.92, v: 0.40 }
export const D12_UV_CENTROID: UVPoint = {
  u: (D12_UV_TOP.u + D12_UV_UPPER_LEFT.u + D12_UV_LOWER_LEFT.u + D12_UV_LOWER_RIGHT.u + D12_UV_UPPER_RIGHT.u) / 5,
  v: (D12_UV_TOP.v + D12_UV_UPPER_LEFT.v + D12_UV_LOWER_LEFT.v + D12_UV_LOWER_RIGHT.v + D12_UV_UPPER_RIGHT.v) / 5
}
// Pentagon safe-area shape constants (authoredPolyhedralGeometry.ts's own
// `pentagonHalfWidthAt`): apex at TOP.v, widest at the shoulder corners'
// own v (UPPER_LEFT/UPPER_RIGHT share one v), narrower again at the foot
// corners' v (LOWER_LEFT/LOWER_RIGHT share one v).
export const D12_SAFE_SHOULDER_V = D12_UV_UPPER_LEFT.v
export const D12_SAFE_BOTTOM_V = D12_UV_LOWER_LEFT.v
export const D12_SAFE_SHOULDER_HALF_WIDTH = D12_UV_UPPER_RIGHT.u - D12_UV_CENTROID.u
export const D12_SAFE_BOTTOM_HALF_WIDTH = D12_UV_LOWER_RIGHT.u - D12_UV_CENTROID.u

// Builds one pentagon's 9-vertex (3-triangle fan) UV block, in the SAME
// [shared,A,B,shared,B,C,shared,C,D] order `buildD12Geometry` emits
// positions in.
function buildPentagonUVBlock(): number[] {
  const seq = [
    D12_UV_TOP, D12_UV_UPPER_LEFT, D12_UV_LOWER_LEFT,
    D12_UV_TOP, D12_UV_LOWER_LEFT, D12_UV_LOWER_RIGHT,
    D12_UV_TOP, D12_UV_LOWER_RIGHT, D12_UV_UPPER_RIGHT
  ]
  return seq.flatMap((p) => [p.u, p.v])
}

export function buildD12Geometry(three: typeof import('three'), radius: number): import('three').BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const uvBlock = buildPentagonUVBlock()

  for (const pentagon of D12_PENTAGON_VERTICES) {
    const [shared, a, b, c, d] = pentagon
    const scaled = [shared, a, b, shared, b, c, shared, c, d].map((v) => ({
      x: v!.x * radius, y: v!.y * radius, z: v!.z * radius
    }))
    for (const v of scaled) positions.push(v.x, v.y, v.z)
    uvs.push(...uvBlock)
  }

  const geometry = new three.BufferGeometry()
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new three.Float32BufferAttribute(uvs, 2))
  geometry.clearGroups()
  for (let f = 0; f < D12_FACE_COUNT; f++) geometry.addGroup(f * 9, 9, f)
  geometry.computeVertexNormals()
  return geometry
}
