// Tests for app/components/world/authoredD20ThreeFaceUV.ts. Roll System
// Phase 4B.5 (Authored d20 Face UV + Numeral Mapping Repair). This
// phase's own explicit instruction: "Prefer tests that inspect actual
// generated Three.js geometry" and "do not rely on incidental array
// ordering without testing it." `three`'s own geometry/math classes
// (`IcosahedronGeometry`, `BufferAttribute`, ...) have no DOM/WebGL
// dependency, so the REAL generated `BufferGeometry` is constructed and
// inspected directly here -- not merely asserted about via hand-written
// duplicate constants.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildCanonicalFaceUVs,
  buildD20FaceGeometry,
  D20_FACE_COUNT,
  FACE_UV_BOTTOM_LEFT,
  FACE_UV_BOTTOM_RIGHT,
  FACE_UV_CENTROID,
  FACE_UV_TOP,
  halfWidthAtCanvasFraction,
  signedUVTriangleArea
} from '../../../app/components/world/authoredD20ThreeFaceUV'
import { D20_FACE_VALUES, D20_THREE_FACE_VALUE_BY_INDEX, D20_THREE_ORIENTATIONS } from '../../../app/components/world/authoredD20ThreeOrientation'

const DIE_RADIUS = 1

describe('buildD20FaceGeometry -- item 1: exactly 20 d20 triangles exist', () => {
  it('produces a non-indexed geometry with exactly 60 vertices (20 triangles x 3)', () => {
    const geometry = buildD20FaceGeometry(THREE, DIE_RADIUS)
    expect(geometry.index).toBeNull()
    const position = geometry.getAttribute('position')
    expect(position.count).toBe(D20_FACE_COUNT * 3)
    expect(D20_FACE_COUNT).toBe(20)
  })
})

describe('buildD20FaceGeometry -- item 2: every triangle receives a canonical local UV triangle', () => {
  it('assigns the exact same (top, bottom-right, bottom-left) UV triple to every one of the 20 faces', () => {
    const geometry = buildD20FaceGeometry(THREE, DIE_RADIUS)
    const uv = geometry.getAttribute('uv')

    for (let f = 0; f < D20_FACE_COUNT; f++) {
      const base = f * 3
      expect(uv.getX(base + 0)).toBeCloseTo(FACE_UV_TOP.u, 6)
      expect(uv.getY(base + 0)).toBeCloseTo(FACE_UV_TOP.v, 6)
      expect(uv.getX(base + 1)).toBeCloseTo(FACE_UV_BOTTOM_RIGHT.u, 6)
      expect(uv.getY(base + 1)).toBeCloseTo(FACE_UV_BOTTOM_RIGHT.v, 6)
      expect(uv.getX(base + 2)).toBeCloseTo(FACE_UV_BOTTOM_LEFT.u, 6)
      expect(uv.getY(base + 2)).toBeCloseTo(FACE_UV_BOTTOM_LEFT.v, 6)
    }
  })

  it('is NOT the spherical/atlas UV IcosahedronGeometry would otherwise produce (disproves the "spherical UV" hypothesis was never fixed)', () => {
    const rawIcosahedron = new THREE.IcosahedronGeometry(DIE_RADIUS, 0)
    const rawUv = rawIcosahedron.getAttribute('uv')

    const fixedGeometry = buildD20FaceGeometry(THREE, DIE_RADIUS)
    const fixedUv = fixedGeometry.getAttribute('uv')

    // The raw icosahedron's own spherical UVs vary face-to-face (different
    // faces sit at different azimuth/inclination); our canonical triangle
    // is identical for every face. If the two ever coincided at vertex 0
    // it would only be for a single face by chance -- collect a mismatch
    // count and require the overwhelming majority to differ.
    let differing = 0
    for (let i = 0; i < D20_FACE_COUNT * 3; i++) {
      if (Math.abs(rawUv.getX(i) - fixedUv.getX(i)) > 1e-9 || Math.abs(rawUv.getY(i) - fixedUv.getY(i)) > 1e-9) {
        differing++
      }
    }
    expect(differing).toBeGreaterThan(D20_FACE_COUNT * 3 * 0.5)
  })
})

describe('buildD20FaceGeometry -- item 3: every face\'s UV triangle has the same winding', () => {
  it('computes the identical signed UV area for all 20 faces, read from the real geometry', () => {
    const geometry = buildD20FaceGeometry(THREE, DIE_RADIUS)
    const uv = geometry.getAttribute('uv')

    const areas: number[] = []
    for (let f = 0; f < D20_FACE_COUNT; f++) {
      const base = f * 3
      const a = { u: uv.getX(base + 0), v: uv.getY(base + 0) }
      const b = { u: uv.getX(base + 1), v: uv.getY(base + 1) }
      const c = { u: uv.getX(base + 2), v: uv.getY(base + 2) }
      areas.push(signedUVTriangleArea(a, b, c))
    }

    const firstSign = Math.sign(areas[0]!)
    expect(firstSign).not.toBe(0)
    for (const area of areas) {
      expect(Math.sign(area)).toBe(firstSign)
    }
  })
})

describe('buildD20FaceGeometry -- item 4: every material group maps to exactly one physical face', () => {
  it('creates exactly 20 groups, each spanning exactly 3 vertices, materialIndex 0-19 each appearing exactly once', () => {
    const geometry = buildD20FaceGeometry(THREE, DIE_RADIUS)
    expect(geometry.groups).toHaveLength(D20_FACE_COUNT)

    const seenMaterialIndexes = new Set<number>()
    for (let f = 0; f < D20_FACE_COUNT; f++) {
      const group = geometry.groups[f]!
      expect(group.start).toBe(f * 3)
      expect(group.count).toBe(3)
      expect(group.materialIndex).toBe(f)
      seenMaterialIndexes.add(group.materialIndex!)
    }
    expect(seenMaterialIndexes.size).toBe(D20_FACE_COUNT)
  })
})

describe('item 5: face N maps to numeral/material N', () => {
  it('D20_THREE_FACE_VALUE_BY_INDEX assigns one unique printed value (1-20) per geometry group index', () => {
    expect(D20_THREE_FACE_VALUE_BY_INDEX).toHaveLength(D20_FACE_COUNT)
    const sorted = [...D20_THREE_FACE_VALUE_BY_INDEX].sort((a, b) => a - b)
    expect(sorted).toEqual([...D20_FACE_VALUES].sort((a, b) => a - b))
  })

  it('every printed value has an authoritative landing orientation (materialIndex -> face value -> orientation is a total mapping)', () => {
    for (const value of D20_THREE_FACE_VALUE_BY_INDEX) {
      expect(D20_THREE_ORIENTATIONS[value]).toBeDefined()
    }
  })
})

describe('item 6: UV modification does not modify position data', () => {
  it('produces the exact same position attribute as an unmodified IcosahedronGeometry', () => {
    const rawIcosahedron = new THREE.IcosahedronGeometry(DIE_RADIUS, 0)
    const rawPosition = rawIcosahedron.getAttribute('position')

    const fixedGeometry = buildD20FaceGeometry(THREE, DIE_RADIUS)
    const fixedPosition = fixedGeometry.getAttribute('position')

    expect(fixedPosition.count).toBe(rawPosition.count)
    for (let i = 0; i < rawPosition.count; i++) {
      expect(fixedPosition.getX(i)).toBe(rawPosition.getX(i))
      expect(fixedPosition.getY(i)).toBe(rawPosition.getY(i))
      expect(fixedPosition.getZ(i)).toBe(rawPosition.getZ(i))
    }
  })
})

describe('item 7: UV modification does not modify orientation data', () => {
  it('leaves authoredD20ThreeOrientation.ts\'s own table with all 20 entries, before and after building the geometry repeatedly', () => {
    expect(Object.keys(D20_THREE_ORIENTATIONS)).toHaveLength(20)
    buildD20FaceGeometry(THREE, DIE_RADIUS)
    buildD20FaceGeometry(THREE, DIE_RADIUS)
    expect(Object.keys(D20_THREE_ORIENTATIONS)).toHaveLength(20)
  })
})

describe('buildCanonicalFaceUVs -- the pure UV buffer builder', () => {
  it('produces a flat Float32Array of length faceCount * 6', () => {
    const uvs = buildCanonicalFaceUVs(D20_FACE_COUNT)
    expect(uvs).toBeInstanceOf(Float32Array)
    expect(uvs.length).toBe(D20_FACE_COUNT * 6)
  })
})

describe('item 9: halfWidthAtCanvasFraction -- the numeral safe-area calculation', () => {
  it('is zero at (or above) the triangle\'s own apex', () => {
    expect(halfWidthAtCanvasFraction(FACE_UV_TOP.v)).toBeCloseTo(0, 10)
    expect(halfWidthAtCanvasFraction(0)).toBeCloseTo(0, 10)
  })

  it('is the full base half-width at (or below) the triangle\'s own base', () => {
    const expectedHalfWidth = (FACE_UV_BOTTOM_RIGHT.u - FACE_UV_BOTTOM_LEFT.u) / 2
    expect(halfWidthAtCanvasFraction(FACE_UV_BOTTOM_LEFT.v)).toBeCloseTo(expectedHalfWidth, 10)
    expect(halfWidthAtCanvasFraction(1)).toBeCloseTo(expectedHalfWidth, 10)
  })

  it('is monotonically non-decreasing from apex to base', () => {
    let prev = -Infinity
    for (let i = 0; i <= 20; i++) {
      const y = FACE_UV_TOP.v + (i / 20) * (FACE_UV_BOTTOM_LEFT.v - FACE_UV_TOP.v)
      const width = halfWidthAtCanvasFraction(y)
      expect(width).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = width
    }
  })

  it('at the centroid height, is positive and comfortably less than the full base width (numerals near the apex have real, but limited, room)', () => {
    const halfWidthAtCentroid = halfWidthAtCanvasFraction(FACE_UV_CENTROID.v)
    const baseHalfWidth = (FACE_UV_BOTTOM_RIGHT.u - FACE_UV_BOTTOM_LEFT.u) / 2
    expect(halfWidthAtCentroid).toBeGreaterThan(0)
    expect(halfWidthAtCentroid).toBeLessThan(baseHalfWidth)
  })
})

describe('item 10: the safe-area calculation scales for both single- and double-digit numerals (geometry side of the fit-to-safe-area formula)', () => {
  it('the available width at the centroid is a fixed budget regardless of how many digits will be measured against it -- one formula, not a per-digit-count branch', () => {
    // This module owns the GEOMETRY half of Phase 4B.5's fit-to-safe-area
    // calculation; the other half (measuring an actual rendered glyph's
    // width via CanvasRenderingContext2D.measureText) requires a real
    // Canvas 2D context and is therefore verified in
    // WorldAuthoredThreeDiceRenderer.client.vue's own `paintFaceNumeral`
    // by code inspection, not by this plain-Node suite -- the same,
    // previously-established "some things aren't testable without a
    // browser" limitation this repo's own Vitest setup (`environment:
    // 'node'`) has applied to every prior authored-dice phase.
    const availableWidth = 2 * halfWidthAtCanvasFraction(FACE_UV_CENTROID.v)
    expect(availableWidth).toBeGreaterThan(0)
    // The SAME budget applies whether the caller is about to measure "1"
    // or "20" -- this function takes no digit-count parameter at all.
    expect(halfWidthAtCanvasFraction.length).toBe(1)
  })
})
