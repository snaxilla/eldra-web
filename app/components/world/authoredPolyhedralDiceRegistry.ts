// authoredPolyhedralDiceRegistry -- Roll System Phase 4C. The one place
// that maps `RollDieGroup.sides` to the standard die's own authored
// geometry/orientation/UV/safe-area/numeral behavior. A definition
// registry, not a plugin framework (this task's own explicit "do not
// over-engineer... this is a fixed standard dice family") -- five plain
// objects and a lookup function, nothing dynamic, nothing extensible at
// runtime. d20 is DELIBERATELY NOT in this registry: its own frozen
// renderer/adapter path (WorldAuthoredThreeDiceRenderer.client.vue,
// worldAuthoredThreeDiceRendererAdapter.ts) remains completely
// independent and untouched for a standalone single-d20 roll (see
// WorldAuthoredPolyhedralDiceRenderer.client.vue's own header for exactly
// how a POOL that happens to include d20s, e.g. 2d20 advantage, still
// reuses this same frozen d20 orientation/skin data without touching the
// frozen files).
import type { QuatLike, UVPoint } from './authoredPolyhedralGeometry'
import {
  D4_FACE_COUNT, D4_FACE_VALUE_BY_INDEX, D4_UV_BOTTOM_LEFT, D4_UV_BOTTOM_RIGHT,
  D4_UV_CENTROID, D4_UV_TOP, buildD4Geometry, landingQuaternionForD4
} from './authoredD4Three'
import { D6_FACE_COUNT, D6_FACE_VALUE_BY_INDEX, D6_SAFE_BOTTOM_V, D6_SAFE_HALF_WIDTH, D6_SAFE_TOP_V, D6_UV_CENTROID, buildD6Geometry, landingQuaternionForD6 } from './authoredD6Three'
import {
  D8_FACE_COUNT, D8_FACE_VALUE_BY_INDEX, D8_UV_BOTTOM_LEFT, D8_UV_BOTTOM_RIGHT,
  D8_UV_CENTROID, D8_UV_TOP, buildD8Geometry, landingQuaternionForD8
} from './authoredD8Three'
import {
  D10_FACE_COUNT, D10_SAFE_WING_HALF_WIDTH, D10_SAFE_WING_V, D10_UV_APEX, D10_UV_BOTTOM, D10_UV_CENTROID,
  buildD10Geometry, labelForAuthoritativeD10Value, landingQuaternionForD10PhysicalFace, physicalFaceForAuthoritativeD10Value
} from './authoredD10Three'
import {
  D12_FACE_COUNT, D12_SAFE_BOTTOM_HALF_WIDTH, D12_SAFE_BOTTOM_V, D12_SAFE_SHOULDER_HALF_WIDTH, D12_SAFE_SHOULDER_V,
  D12_UV_CENTROID, D12_UV_TOP, buildD12Geometry, landingQuaternionForD12
} from './authoredD12Three'
import { triangleHalfWidthAt, squareHalfWidthAt, kiteHalfWidthAt, pentagonHalfWidthAt } from './authoredPolyhedralGeometry'

// A face-shape-appropriate function computing how much horizontal room
// (fraction of texture width) is available at canvas-fraction height `y`
// -- what `paintDieNumeral` (the renderer's own numeral-drawing function)
// fits a value's rendered text width against, generalizing
// authoredD20ThreeFaceUV.ts's own `halfWidthAtCanvasFraction` to every
// face shape this family uses.
export type SafeAreaWidthFn = (y: number) => number

export type PolyhedralDieDefinition = {
  sides: number
  faceCount: number
  uvCentroid: UVPoint
  safeAreaWidthAt: SafeAreaWidthFn
  buildGeometry: (three: typeof import('three'), radius: number) => import('three').BufferGeometry
  landingQuaternionForValue: (value: number) => QuatLike | null
  labelForValue: (value: number) => string
}

const d4: PolyhedralDieDefinition = {
  sides: 4,
  faceCount: D4_FACE_COUNT,
  uvCentroid: D4_UV_CENTROID,
  safeAreaWidthAt: (y) => triangleHalfWidthAt(D4_UV_TOP, D4_UV_BOTTOM_LEFT, D4_UV_BOTTOM_RIGHT, y),
  buildGeometry: buildD4Geometry,
  landingQuaternionForValue: landingQuaternionForD4,
  labelForValue: (value) => String(value)
}

const d6: PolyhedralDieDefinition = {
  sides: 6,
  faceCount: D6_FACE_COUNT,
  uvCentroid: D6_UV_CENTROID,
  safeAreaWidthAt: (y) => squareHalfWidthAt(D6_SAFE_TOP_V, D6_SAFE_BOTTOM_V, D6_SAFE_HALF_WIDTH, y),
  buildGeometry: buildD6Geometry,
  landingQuaternionForValue: landingQuaternionForD6,
  labelForValue: (value) => String(value)
}

const d8: PolyhedralDieDefinition = {
  sides: 8,
  faceCount: D8_FACE_COUNT,
  uvCentroid: D8_UV_CENTROID,
  safeAreaWidthAt: (y) => triangleHalfWidthAt(D8_UV_TOP, D8_UV_BOTTOM_LEFT, D8_UV_BOTTOM_RIGHT, y),
  buildGeometry: buildD8Geometry,
  landingQuaternionForValue: landingQuaternionForD8,
  labelForValue: (value) => String(value)
}

const d10: PolyhedralDieDefinition = {
  sides: 10,
  faceCount: D10_FACE_COUNT,
  uvCentroid: D10_UV_CENTROID,
  safeAreaWidthAt: (y) => kiteHalfWidthAt(D10_UV_APEX.v, D10_SAFE_WING_V, D10_UV_BOTTOM.v, D10_SAFE_WING_HALF_WIDTH, y),
  buildGeometry: buildD10Geometry,
  landingQuaternionForValue: (value) => {
    const physicalFace = physicalFaceForAuthoritativeD10Value(value)
    return physicalFace === null ? null : landingQuaternionForD10PhysicalFace(physicalFace)
  },
  labelForValue: labelForAuthoritativeD10Value
}

const d12: PolyhedralDieDefinition = {
  sides: 12,
  faceCount: D12_FACE_COUNT,
  uvCentroid: D12_UV_CENTROID,
  safeAreaWidthAt: (y) => pentagonHalfWidthAt(D12_UV_TOP.v, D12_SAFE_SHOULDER_V, D12_SAFE_BOTTOM_V, D12_SAFE_SHOULDER_HALF_WIDTH, D12_SAFE_BOTTOM_HALF_WIDTH, y),
  buildGeometry: buildD12Geometry,
  landingQuaternionForValue: landingQuaternionForD12,
  labelForValue: (value) => String(value)
}

// d20 is NOT registered here -- see this file's own header.
export const POLYHEDRAL_DICE_BY_SIDES: Readonly<Record<number, PolyhedralDieDefinition>> = Object.freeze({
  4: d4, 6: d6, 8: d8, 10: d10, 12: d12
})

export function polyhedralDieDefinitionForSides(sides: number): PolyhedralDieDefinition | null {
  return POLYHEDRAL_DICE_BY_SIDES[sides] ?? null
}

export { D4_FACE_VALUE_BY_INDEX, D6_FACE_VALUE_BY_INDEX, D8_FACE_VALUE_BY_INDEX }
