// authoredD6Three -- authored d6 (cube) geometry/orientation/UV. Roll
// System Phase 4C. See authoredD4Three.ts's own header for the shared
// derivation method; this file documents only what's DIFFERENT about a
// cube.
//
// GEOMETRY: `THREE.BoxGeometry(size,size,size)` -- verified against
// three@0.143.0's own source: UNLIKE every other die in this family, this
// is an INDEXED geometry (24 vertices, `setIndex`), and it already builds
// 6 `geometry.addGroup` calls internally (materialIndex 0-5, one per
// face, in the fixed order +X,-X,+Y,-Y,+Z,-Z) with a already-sane square
// UV per face (0..1 both axes, 4 corners, no triangular-safe-area math
// needed at all -- a d6 face is simply the whole texture).
//
// HANDEDNESS -- THE ONE REAL DEFECT FOUND: `BoxGeometry`'s own built-in
// UV has v correct (v=0 at each face's own top edge, matching this
// family's `texture.flipY=false` convention exactly) but u BACKWARDS --
// verified empirically (a one-off derivation script, not committed): for
// all 6 faces, canvas u=0 lands at screen-RIGHT and u=1 lands at
// screen-LEFT after that face's own landing quaternion. `buildD6Geometry`
// below rebuilds the UV attribute with u replaced by `1-u`, correcting
// this with zero change to vertex positions, face grouping, or the
// orientation table.
//
// FACE VALUES: standard opposite-faces-sum-to-7 convention (1<->6,
// 2<->5, 3<->4), matching Box's own antipodal (+X/-X, +Y/-Y, +Z/-Z)
// face-normal pairing (verified from the real geometry).
import type { QuatLike } from './authoredPolyhedralGeometry'

export const D6_FACE_VALUES: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6])
export const D6_FACE_COUNT = 6

// materialIndex (BoxGeometry's own fixed +X,-X,+Y,-Y,+Z,-Z group order)
// -> printed value.
export const D6_FACE_VALUE_BY_INDEX: readonly number[] = Object.freeze([1, 6, 2, 5, 3, 4])

export const D6_ORIENTATIONS: Readonly<Record<number, QuatLike>> = Object.freeze({
  1: { x: -0.70710678, y: 0, z: -0.70710678, w: 0 },
  6: { x: 0.70710678, y: 0, z: -0.70710678, w: 0 },
  2: { x: 0, y: -0.70710678, z: -0.70710678, w: 0 },
  5: { x: 0, y: 0.70710678, z: -0.70710678, w: 0 },
  3: { x: 0, y: 0, z: -1, w: 0 },
  4: { x: -1, y: 0, z: 0, w: 0 }
})

export function landingQuaternionForD6(value: number): QuatLike | null {
  return D6_ORIENTATIONS[value] ?? null
}

// The numeral sits centered on the whole face, per this die's own square
// safe area (no triangle/kite/pentagon math needed) -- see
// authoredPolyhedralGeometry.ts's own `squareHalfWidthAt`.
export const D6_UV_CENTROID = { u: 0.5, v: 0.5 }
export const D6_SAFE_TOP_V = 0.08
export const D6_SAFE_BOTTOM_V = 0.92
export const D6_SAFE_HALF_WIDTH = 0.42

export function buildD6Geometry(three: typeof import('three'), size: number): import('three').BoxGeometry {
  const geometry = new three.BoxGeometry(size, size, size)
  const uv = geometry.getAttribute('uv')
  const flipped = new Float32Array(uv.count * 2)
  for (let i = 0; i < uv.count; i++) {
    flipped[i * 2] = 1 - uv.getX(i)
    flipped[i * 2 + 1] = uv.getY(i)
  }
  geometry.setAttribute('uv', new three.BufferAttribute(flipped, 2))
  return geometry
}
