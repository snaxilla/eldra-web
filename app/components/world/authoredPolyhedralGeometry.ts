// authoredPolyhedralGeometry -- shared pure math for Roll System Phase 4C
// (Authored Polyhedral Dice + Multi-Die Presentation). Generalizes the
// per-face UV/handedness/safe-area techniques
// authoredD20ThreeFaceUV.ts already proved out for the triangular d20 to
// the OTHER face shapes the standard dice family needs (square d6,
// pentagonal d12, kite d10) -- WITHOUT touching a single frozen d20 file.
// d20 keeps its own independent module; nothing here is imported by it,
// and nothing here changes its behavior.
//
// EVERY ORIENTATION/HANDEDNESS CLAIM IN THIS DIE FAMILY WAS PROVEN, NOT
// ASSUMED -- the same discipline Phase 4B.6 learned the hard way for d20.
// A one-off Node script (not committed -- matching authoredD20ThreeOrientation
// .ts's own documented precedent) built each die's REAL geometry with the
// REAL installed `three` package, derived each face's (right, up, normal)
// basis the same way authoredD20ThreeOrientation.ts does, and then
// EMPIRICALLY checked -- by applying the resulting landing quaternion to
// each face's own actual vertices -- which vertex lands on screen-left vs
// screen-right, and which lands on screen-top vs screen-bottom, before any
// UV corner was assigned. The per-die modules that follow (authoredD4Three
// .ts etc.) hardcode the RESULT of that verification, exactly as
// authoredD20ThreeOrientation.ts hardcodes its own script's output.

export type Vec3Like = { x: number; y: number; z: number }
export type QuatLike = { x: number; y: number; z: number; w: number }
export type UVPoint = { u: number; v: number }

// Barycentric weights of 2D point `p` inside triangle (p0,p1,p2) -- used to
// interpolate a UV-space point back into the SAME face's real 3D vertices
// (e.g. for safe-area/marker verification in tests). Standard closed form.
export function barycentricWeights(p0: UVPoint, p1: UVPoint, p2: UVPoint, p: UVPoint): [number, number, number] {
  const denom = (p1.v - p2.v) * (p0.u - p2.u) + (p2.u - p1.u) * (p0.v - p2.v)
  const w0 = ((p1.v - p2.v) * (p.u - p2.u) + (p2.u - p1.u) * (p.v - p2.v)) / denom
  const w1 = ((p2.v - p0.v) * (p.u - p2.u) + (p0.u - p2.u) * (p.v - p2.v)) / denom
  return [w0, w1, 1 - w0 - w1]
}

// Signed area of 2D triangle (a,b,c) -- sign indicates winding direction.
export function signedArea(a: UVPoint, b: UVPoint, c: UVPoint): number {
  return (b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v)
}

// ---------------------------------------------------------------------------
// Safe-area width functions, one per face shape this die family uses.
// Each returns the HALF-WIDTH (fraction of texture width) available at
// canvas-fraction height `y`, matching authoredD20ThreeFaceUV.ts's own
// `halfWidthAtCanvasFraction` contract exactly (same units, same
// "assumes flipY=false so y and v are the same axis" precondition) --
// generalized here from "one canonical triangle" to whichever shape a
// given die's canonical UV footprint actually is.
// ---------------------------------------------------------------------------

// Isosceles triangle, apex at `top`, level base between `bottomLeft`/
// `bottomRight` -- structurally identical to authoredD20ThreeFaceUV.ts's
// own function, restated here (not imported) so this module has zero
// dependency on the frozen d20 file, matching that file's own "independent
// derivation for an independent concern" discipline.
export function triangleHalfWidthAt(top: UVPoint, bottomLeft: UVPoint, bottomRight: UVPoint, y: number): number {
  const baseHalfWidth = (bottomRight.u - bottomLeft.u) / 2
  const t = Math.min(Math.max((y - top.v) / (bottomLeft.v - top.v), 0), 1)
  return baseHalfWidth * t
}

// Axis-aligned square/rectangle safe area (d6): constant half-width
// between the top and bottom edges, zero outside them.
export function squareHalfWidthAt(topV: number, bottomV: number, halfWidth: number, y: number): number {
  if (y < topV || y > bottomV) return 0
  return halfWidth
}

// Kite (d10): apex at top, level "wing" corners at `wingV`, bottom point
// at `bottomV` -- half-width ramps UP from 0 at the apex to `wingHalfWidth`
// at the wings, then back DOWN to 0 at the bottom point. Two linear
// segments, mirroring the kite's own two triangle halves.
export function kiteHalfWidthAt(topV: number, wingV: number, bottomV: number, wingHalfWidth: number, y: number): number {
  if (y <= topV || y >= bottomV) return 0
  if (y <= wingV) {
    const t = (y - topV) / (wingV - topV)
    return wingHalfWidth * t
  }
  const t = (y - wingV) / (bottomV - wingV)
  return wingHalfWidth * (1 - t)
}

// Regular-ish pentagon (d12): apex at top (`topV`), two "shoulder" corners
// at `shoulderV` (the widest point, half-width = `shoulderHalfWidth`), two
// "foot" corners at `bottomV` narrower by `bottomHalfWidth`. Three linear
// segments: apex->shoulder (widening), shoulder->foot (narrowing).
export function pentagonHalfWidthAt(
  topV: number,
  shoulderV: number,
  bottomV: number,
  shoulderHalfWidth: number,
  bottomHalfWidth: number,
  y: number
): number {
  if (y <= topV) return 0
  if (y <= shoulderV) {
    const t = (y - topV) / (shoulderV - topV)
    return shoulderHalfWidth * t
  }
  if (y >= bottomV) return bottomHalfWidth
  const t = (y - shoulderV) / (bottomV - shoulderV)
  return shoulderHalfWidth + (bottomHalfWidth - shoulderHalfWidth) * t
}
