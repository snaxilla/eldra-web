// authoredD10Three -- authored d10 (pentagonal trapezohedron) geometry/
// orientation/UV. Roll System Phase 4C. A standard tabletop d10 is NOT a
// Platonic solid and three.js ships no primitive for it -- this geometry
// is hand-derived, not approximated with a sphere/d12/arbitrary shape.
//
// DERIVATION (a one-off Node script, not committed, using the real
// `three` package -- same precedent as every other module in this
// family): a pentagonal trapezohedron is the DUAL of a pentagonal
// antiprism. Built a uniform pentagonal antiprism (top pentagon radius 1
// at z=+0.5, bottom pentagon radius 1 at z=-0.5 rotated 36 degrees --
// this exact 0.5 half-height is the value that makes the antiprism's own
// ring edges and slant edges equal length, verified algebraically:
// c^2 = (1-cos36)(1+2cos36)/2 = 0.25), then computed its CLASSICAL DUAL:
// one dual vertex per antiprism FACE (reciprocated through the unit
// sphere: dual point = face_normal / distance_from_origin_to_face_plane),
// giving 12 vertices (2 pentagon-face duals = the two apexes, 10
// triangle-face duals = the 10 "equatorial" vertices, which fall on TWO
// slightly different heights, matching a real d10's own visible
// "zigzag" equator). Verified computationally, not assumed: all 10
// resulting kite faces are PLANAR (cross-product/tangent dot ~1e-8),
// CONGRUENT (identical edge lengths/diagonal to 4 decimal places), and
// properly antipodal (face centroid dot products of exactly -1.0000).
//
// FACE VALUES: standard opposite-faces-sum-to-9 convention for a 0-9
// labeled d10 (0<->9, 1<->8, 2<->7, 3<->6, 4<->5), matching antipodal
// pairing verified from the real derived geometry.
//
// AUTHORITATIVE VALUE DOMAIN: `RollDieGroup.results` for a standalone
// "1d10" reports 1-10 (OpenDice's own convention), never 0-9 -- but the
// PHYSICAL die's 10 faces are conventionally printed 0-9, with the "0"
// face representing what the 1-10 domain calls "10" (the same
// convention every real tabletop d10 uses). `D10_FACE_VALUE_BY_INDEX`
// below is keyed by this file's own 0-9 physical face labels;
// `labelForAuthoritativeValue`/`faceIndexForAuthoritativeValue` do the
// 1-10 <-> physical-face translation explicitly, once, so nothing else
// in this die family invents a second interpretation of that boundary.
//
// HANDEDNESS: empirically verified for all 10 faces -- after landing,
// the kite's own [apex,B,C,D] boundary lands at screen positions
// [top, left, bottom, right] UNIFORMLY across every face, so the
// canonical UV below assigns those four screen roles with no per-face
// exception.
import type { QuatLike, UVPoint, Vec3Like } from './authoredPolyhedralGeometry'

// Physical face labels 0-9 (NOT the 1-10 authoritative domain -- see this
// file's own header).
export const D10_PHYSICAL_FACE_VALUES: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
export const D10_FACE_COUNT = 10

// kite index (0-9, matching D10_KITE_VERTICES) -> printed physical label (0-9).
export const D10_FACE_VALUE_BY_INDEX: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 6, 5, 9, 8, 7])

// Orientation table keyed by PHYSICAL face label (0-9).
export const D10_ORIENTATIONS: Readonly<Record<number, QuatLike>> = Object.freeze({
  0: { x: -0.31342384, y: -0.31342384, z: -0.63384975, w: 0.63384975 },
  1: { x: -0.0693393, y: -0.43779112, z: -0.88536275, w: 0.14022768 },
  2: { x: 0.20123049, y: -0.39493707, z: -0.79869727, w: -0.40695659 },
  3: { x: -0.39493707, y: 0.20123049, z: 0.40695659, w: 0.79869727 },
  4: { x: -0.43779112, y: -0.0693393, z: -0.14022768, w: 0.88536275 },
  6: { x: -0.79869727, y: 0.40695659, z: -0.20123049, w: -0.39493707 },
  5: { x: -0.88536275, y: -0.14022768, z: 0.0693393, w: -0.43779112 },
  9: { x: -0.63384975, y: -0.63384975, z: 0.31342384, w: -0.31342384 },
  8: { x: -0.14022768, y: -0.88536275, z: 0.43779112, w: -0.0693393 },
  7: { x: 0.40695659, y: -0.79869727, z: 0.39493707, w: 0.20123049 }
})

export function landingQuaternionForD10PhysicalFace(physicalFace: number): QuatLike | null {
  return D10_ORIENTATIONS[physicalFace] ?? null
}

// Standalone d10 roll (authoritative domain 1-10): value 10 lands on
// physical face "0"; values 1-9 land on their own same-numbered face.
export function physicalFaceForAuthoritativeD10Value(value: number): number | null {
  if (value < 1 || value > 10 || !Number.isInteger(value)) return null
  return value === 10 ? 0 : value
}
export function labelForAuthoritativeD10Value(value: number): string {
  return value === 10 ? '0' : String(value)
}

// Each entry is [apex, B, C, D] (apex always local index 0).
export const D10_KITE_VERTICES: readonly Vec3Like[][] = Object.freeze([
  [{ x: 0, y: 0, z: 2 }, { x: 0.89442719, y: -0.64983939, z: 0.21114562 }, { x: 1.10557281, y: 0, z: -0.21114562 }, { x: 0.89442719, y: 0.64983939, z: 0.21114562 }],
  [{ x: 0, y: 0, z: 2 }, { x: 0.89442719, y: 0.64983939, z: 0.21114562 }, { x: 0.34164079, y: 1.05146222, z: -0.21114562 }, { x: -0.34164079, y: 1.05146222, z: 0.21114562 }],
  [{ x: 0, y: 0, z: 2 }, { x: -0.34164079, y: 1.05146222, z: 0.21114562 }, { x: -0.89442719, y: 0.64983939, z: -0.21114562 }, { x: -1.10557281, y: 0, z: 0.21114562 }],
  [{ x: 0, y: 0, z: 2 }, { x: -1.10557281, y: 0, z: 0.21114562 }, { x: -0.89442719, y: -0.64983939, z: -0.21114562 }, { x: -0.34164079, y: -1.05146222, z: 0.21114562 }],
  [{ x: 0, y: 0, z: 2 }, { x: -0.34164079, y: -1.05146222, z: 0.21114562 }, { x: 0.34164079, y: -1.05146222, z: -0.21114562 }, { x: 0.89442719, y: -0.64983939, z: 0.21114562 }],
  [{ x: 0, y: 0, z: -2 }, { x: 0.34164079, y: 1.05146222, z: -0.21114562 }, { x: 0.89442719, y: 0.64983939, z: 0.21114562 }, { x: 1.10557281, y: 0, z: -0.21114562 }],
  [{ x: 0, y: 0, z: -2 }, { x: -0.89442719, y: 0.64983939, z: -0.21114562 }, { x: -0.34164079, y: 1.05146222, z: 0.21114562 }, { x: 0.34164079, y: 1.05146222, z: -0.21114562 }],
  [{ x: 0, y: 0, z: -2 }, { x: -0.89442719, y: -0.64983939, z: -0.21114562 }, { x: -1.10557281, y: 0, z: 0.21114562 }, { x: -0.89442719, y: 0.64983939, z: -0.21114562 }],
  [{ x: 0, y: 0, z: -2 }, { x: 0.34164079, y: -1.05146222, z: -0.21114562 }, { x: -0.34164079, y: -1.05146222, z: 0.21114562 }, { x: -0.89442719, y: -0.64983939, z: -0.21114562 }],
  [{ x: 0, y: 0, z: -2 }, { x: 1.10557281, y: 0, z: -0.21114562 }, { x: 0.89442719, y: -0.64983939, z: 0.21114562 }, { x: 0.34164079, y: -1.05146222, z: -0.21114562 }]
])

// Canonical kite UV, proven from the uniform screen-space landing
// positions of [apex,B,C,D]: apex->top, B->left, C->bottom, D->right.
export const D10_UV_APEX: UVPoint = { u: 0.5, v: 0.08 }
export const D10_UV_LEFT: UVPoint = { u: 0.08, v: 0.76 }
export const D10_UV_BOTTOM: UVPoint = { u: 0.5, v: 0.92 }
export const D10_UV_RIGHT: UVPoint = { u: 0.92, v: 0.76 }
export const D10_UV_CENTROID: UVPoint = {
  u: (D10_UV_APEX.u + D10_UV_LEFT.u + D10_UV_BOTTOM.u + D10_UV_RIGHT.u) / 4,
  v: (D10_UV_APEX.v + D10_UV_LEFT.v + D10_UV_BOTTOM.v + D10_UV_RIGHT.v) / 4
}
// Kite safe-area shape constants (authoredPolyhedralGeometry.ts's own
// `kiteHalfWidthAt`).
export const D10_SAFE_WING_V = D10_UV_LEFT.v
export const D10_SAFE_WING_HALF_WIDTH = D10_UV_RIGHT.u - D10_UV_CENTROID.u

function buildKiteUVBlock(): number[] {
  const seq = [D10_UV_APEX, D10_UV_LEFT, D10_UV_BOTTOM, D10_UV_APEX, D10_UV_BOTTOM, D10_UV_RIGHT]
  return seq.flatMap((p) => [p.u, p.v])
}

export function buildD10Geometry(three: typeof import('three'), radius: number): import('three').BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const uvBlock = buildKiteUVBlock()
  // The derived vertex coordinates have circumradius 2 (apex) -- scale so
  // the die's OWN circumradius matches `radius`, consistent with every
  // sibling die's own `radius` parameter meaning.
  const scaleFactor = radius / 2

  for (const kite of D10_KITE_VERTICES) {
    const [apex, b, c, d] = kite
    const scaled = [apex, b, c, apex, c, d].map((v) => ({
      x: v!.x * scaleFactor, y: v!.y * scaleFactor, z: v!.z * scaleFactor
    }))
    for (const v of scaled) positions.push(v.x, v.y, v.z)
    uvs.push(...uvBlock)
  }

  const geometry = new three.BufferGeometry()
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new three.Float32BufferAttribute(uvs, 2))
  geometry.clearGroups()
  for (let f = 0; f < D10_FACE_COUNT; f++) geometry.addGroup(f * 6, 6, f)
  geometry.computeVertexNormals()
  return geometry
}
