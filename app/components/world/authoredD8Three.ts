// authoredD8Three -- authored d8 (octahedron) geometry/orientation/UV.
// Roll System Phase 4C. Mirrors authoredD4Three.ts's own method (which
// itself mirrors the frozen d20 modules) -- see that file's own header
// for the shared rationale, restated per-die rather than imported.
//
// GEOMETRY: `THREE.OctahedronGeometry(radius, 0)` -- verified against
// three@0.143.0's own source: extends `PolyhedronGeometry`, non-indexed,
// exactly 8 triangles (24 vertices), one triangle per physical face.
//
// FACE VALUES: standard tabletop d8 convention, opposite faces sum to 9
// (1<->8, 2<->7, 3<->6, 4<->5). Antipodal pairing verified directly from
// the real geometry's own face centroids (a one-off derivation script,
// not committed, matching authoredD20ThreeOrientation.ts's precedent).
//
// HANDEDNESS: empirically verified for all 8 faces -- buffer-vertex 1
// lands screen-left, buffer-vertex 2 lands screen-right after that face's
// own landing quaternion, the identical pattern d4/d20 share (all three
// are triangular PolyhedronGeometry-family solids built the same way).
import type { QuatLike, UVPoint } from './authoredPolyhedralGeometry'

export const D8_FACE_VALUES: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
export const D8_FACE_COUNT = 8

// materialIndex (buffer-triangle index 0-7) -> printed value.
export const D8_FACE_VALUE_BY_INDEX: readonly number[] = Object.freeze([1, 2, 3, 4, 7, 8, 5, 6])

export const D8_ORIENTATIONS: Readonly<Record<number, QuatLike>> = Object.freeze({
  1: { x: 0.27984814, y: -0.3647052, z: -0.1159169, w: 0.88047624 },
  2: { x: -0.4247082, y: -0.1759199, z: -0.33985114, w: 0.82047324 },
  3: { x: -0.88047624, y: 0.1159169, z: -0.3647052, w: 0.27984814 },
  4: { x: -0.82047324, y: 0.33985114, z: -0.1759199, w: -0.4247082 },
  5: { x: 0.3647052, y: 0.27984814, z: -0.88047624, w: -0.1159169 },
  6: { x: 0.1759199, y: -0.4247082, z: -0.82047324, w: -0.33985114 },
  7: { x: -0.1159169, y: -0.88047624, z: -0.27984814, w: -0.3647052 },
  8: { x: -0.33985114, y: -0.82047324, z: 0.4247082, w: -0.1759199 }
})

export function landingQuaternionForD8(value: number): QuatLike | null {
  return D8_ORIENTATIONS[value] ?? null
}

export const D8_UV_TOP: UVPoint = { u: 0.5, v: 0.08 }
export const D8_UV_BOTTOM_LEFT: UVPoint = { u: 0.08, v: 0.92 }
export const D8_UV_BOTTOM_RIGHT: UVPoint = { u: 0.92, v: 0.92 }
export const D8_UV_CENTROID: UVPoint = {
  u: (D8_UV_TOP.u + D8_UV_BOTTOM_LEFT.u + D8_UV_BOTTOM_RIGHT.u) / 3,
  v: (D8_UV_TOP.v + D8_UV_BOTTOM_LEFT.v + D8_UV_BOTTOM_RIGHT.v) / 3
}

export function buildD8CanonicalUVs(): Float32Array {
  const uvs = new Float32Array(D8_FACE_COUNT * 3 * 2)
  for (let f = 0; f < D8_FACE_COUNT; f++) {
    const base = f * 6
    uvs[base + 0] = D8_UV_TOP.u; uvs[base + 1] = D8_UV_TOP.v
    uvs[base + 2] = D8_UV_BOTTOM_LEFT.u; uvs[base + 3] = D8_UV_BOTTOM_LEFT.v
    uvs[base + 4] = D8_UV_BOTTOM_RIGHT.u; uvs[base + 5] = D8_UV_BOTTOM_RIGHT.v
  }
  return uvs
}

export function buildD8Geometry(three: typeof import('three'), radius: number): import('three').OctahedronGeometry {
  const geometry = new three.OctahedronGeometry(radius, 0)
  geometry.setAttribute('uv', new three.BufferAttribute(buildD8CanonicalUVs(), 2))
  geometry.clearGroups()
  for (let f = 0; f < D8_FACE_COUNT; f++) geometry.addGroup(f * 3, 3, f)
  return geometry
}
