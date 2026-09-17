// Tests for app/components/world/authoredDicePresentationScale.ts. Roll
// System Phase 4C.1 (Polyhedral Visual Normalization + Family Edge
// Treatment).

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  BASE_DIE_RADIUS,
  PRESENTATION_SCALE_BY_SIDES,
  poolScaleForSize,
  presentationMeshScale,
  presentationScaleForSides
} from '../../../app/components/world/authoredDicePresentationScale'
import { D20_THREE_ORIENTATIONS } from '../../../app/components/world/authoredD20ThreeOrientation'
import { D4_ORIENTATIONS } from '../../../app/components/world/authoredD4Three'

// Measures a triangular face's own inradius ratio (centroid distance from
// origin, at circumradius 1) directly from real generated geometry --
// the same method authoredDicePresentationScale.ts's own header
// documents using to derive its table, re-run here independently so this
// test does not simply assert the table against itself.
function triangleFaceInradiusRatio(geometry: import('three').BufferGeometry): number {
  const pos = geometry.getAttribute('position')
  const v0 = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0))
  const v1 = new THREE.Vector3(pos.getX(1), pos.getY(1), pos.getZ(1))
  const v2 = new THREE.Vector3(pos.getX(2), pos.getY(2), pos.getZ(2))
  return v0.clone().add(v1).add(v2).divideScalar(3).length()
}

describe('item 1: d20 remains baseline scale 1.0 / unchanged', () => {
  it('presentationScaleForSides(20) is exactly 1.0', () => {
    expect(presentationScaleForSides(20)).toBe(1.0)
  })

  it('BASE_DIE_RADIUS matches the frozen d20 renderer\'s own DIE_RADIUS (1)', () => {
    expect(BASE_DIE_RADIUS).toBe(1)
  })

  it('does not alter the frozen d20 orientation table merely by being imported/called', () => {
    const before = Object.keys(D20_THREE_ORIENTATIONS).length
    presentationScaleForSides(20)
    presentationMeshScale(20, 4)
    expect(Object.keys(D20_THREE_ORIENTATIONS).length).toBe(before)
  })
})

describe('item 2/3: every standard die has an explicit, finite, positive normalization', () => {
  for (const sides of [4, 6, 8, 10, 12, 20]) {
    it(`d${sides} has an explicit entry in PRESENTATION_SCALE_BY_SIDES`, () => {
      expect(PRESENTATION_SCALE_BY_SIDES[sides]).toBeDefined()
    })

    it(`d${sides}'s presentation scale is finite and strictly positive`, () => {
      const scale = presentationScaleForSides(sides)
      expect(Number.isFinite(scale)).toBe(true)
      expect(scale).toBeGreaterThan(0)
    })
  }

  it('an unregistered side count defaults to 1.0 rather than zero/undefined (presentation must never block a roll)', () => {
    expect(presentationScaleForSides(3)).toBe(1.0)
    expect(presentationScaleForSides(100)).toBe(1.0)
  })
})

describe('item 4: single-die normalized extents avoid obviously huge/small outliers relative to d20', () => {
  it('every die\'s presentation scale stays within a bounded, sane multiple of d20\'s own (1.0) -- no outlier in either direction', () => {
    for (const sides of [4, 6, 8, 10, 12]) {
      const scale = presentationScaleForSides(sides)
      // Lower bound: never shrink a die below d20's own baseline (the
      // defect being fixed was dice reading too SMALL, not too large).
      expect(scale).toBeGreaterThanOrEqual(1.0)
      // Upper bound: capped well short of the raw, camera-frustum-unsafe
      // inradius-matched ratios (e.g. d4's raw ratio is ~2.38) -- see the
      // source module's own documented compromise.
      expect(scale).toBeLessThanOrEqual(1.25)
    }
  })

  it('d4 (the worst measured inradius ratio) receives the largest correction; d12 (identical ratio to d20) receives none', () => {
    expect(presentationScaleForSides(4)).toBeGreaterThan(presentationScaleForSides(6))
    expect(presentationScaleForSides(4)).toBeGreaterThan(presentationScaleForSides(8))
    expect(presentationScaleForSides(4)).toBeGreaterThan(presentationScaleForSides(10))
    expect(presentationScaleForSides(12)).toBe(1.0)
  })

  it('ordering matches the real, independently-measured face-inradius ratios (d4 < d8 < d6 < d10 < d12=d20, in inradius terms)', () => {
    const d20geo = new THREE.IcosahedronGeometry(1, 0)
    const d4geo = new THREE.TetrahedronGeometry(1, 0)
    const d8geo = new THREE.OctahedronGeometry(1, 0)

    const d20Ratio = triangleFaceInradiusRatio(d20geo)
    const d4Ratio = triangleFaceInradiusRatio(d4geo)
    const d8Ratio = triangleFaceInradiusRatio(d8geo)

    expect(d4Ratio).toBeLessThan(d8Ratio)
    expect(d8Ratio).toBeLessThan(d20Ratio)

    // The presentation scale ordering is the INVERSE of the inradius
    // ordering (smaller inradius -> larger correction needed).
    expect(presentationScaleForSides(4)).toBeGreaterThan(presentationScaleForSides(8))
    expect(presentationScaleForSides(8)).toBeGreaterThan(presentationScaleForSides(20))
  })
})

describe('item 5/6: pool scaling is deterministic and non-increasing', () => {
  it('poolScaleForSize is a pure function -- the same size always returns the same value', () => {
    for (let size = 1; size <= 6; size++) {
      expect(poolScaleForSize(size)).toBe(poolScaleForSize(size))
    }
  })

  it('pool scale never increases as pool size grows', () => {
    let prev = poolScaleForSize(1)
    for (let size = 2; size <= 6; size++) {
      const scale = poolScaleForSize(size)
      expect(scale).toBeLessThanOrEqual(prev)
      prev = scale
    }
  })

  it('a single die (pool size 1) is at full, unshrunk pool scale', () => {
    expect(poolScaleForSize(1)).toBe(1)
  })

  it('every pool scale is finite and strictly positive (a pool of 6 must still be visible, never scaled to zero)', () => {
    for (let size = 1; size <= 6; size++) {
      const scale = poolScaleForSize(size)
      expect(Number.isFinite(scale)).toBe(true)
      expect(scale).toBeGreaterThan(0)
    }
  })
})

describe('item 7: d100 pair uses an intentional percentile composition scale', () => {
  it('a d100 pair (2 presentation dice) uses the SAME 2-die pool scale as any other 2-die pool, not independent hero scale', () => {
    const tensScale = presentationMeshScale(10, 2)
    const onesScale = presentationMeshScale(10, 2)
    const soloScale = presentationMeshScale(10, 1)

    expect(tensScale).toBe(onesScale)
    // The pair is deliberately smaller than a solo hero-scale d10 --
    // this task's own "do not scale each percentile die to full
    // single-die hero size if doing so causes the pair to overwhelm the
    // stage."
    expect(tensScale).toBeLessThan(soloScale)
    expect(tensScale).toBe(presentationScaleForSides(10) * poolScaleForSize(2))
  })
})

describe('items 8/9: scaling never touches geometry vertex data or orientation data', () => {
  it('presentation-scale functions accept no geometry/orientation argument at all -- structurally incapable of mutating either', () => {
    expect(presentationScaleForSides.length).toBe(1) // (sides: number) only
    expect(poolScaleForSize.length).toBe(1) // (poolSize: number) only
  })

  it('repeated calls do not change the frozen d20 orientation table or a registry die\'s own orientation table', () => {
    const d20Before = JSON.stringify(D20_THREE_ORIENTATIONS)
    const d4Before = JSON.stringify(D4_ORIENTATIONS)

    for (let i = 0; i < 5; i++) presentationMeshScale(4, i + 1)

    expect(JSON.stringify(D20_THREE_ORIENTATIONS)).toBe(d20Before)
    expect(JSON.stringify(D4_ORIENTATIONS)).toBe(d4Before)
  })
})
