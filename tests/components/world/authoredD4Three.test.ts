// Tests for app/components/world/authoredD4Three.ts. Roll System Phase
// 4C. Mirrors authoredD20ThreeOrientation.test.ts's own independent
// re-derivation discipline: re-derives each face's basis from a freshly
// built real `THREE.TetrahedronGeometry`, rather than trusting the
// module's own hardcoded table against itself.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  D4_FACE_COUNT, D4_FACE_VALUES, D4_FACE_VALUE_BY_INDEX, D4_ORIENTATIONS,
  D4_UV_BOTTOM_LEFT, D4_UV_BOTTOM_RIGHT, D4_UV_TOP,
  buildD4CanonicalUVs, buildD4Geometry, landingQuaternionForD4
} from '../../../app/components/world/authoredD4Three'

describe('D4 geometry -- all 4 faces', () => {
  it('is a non-indexed geometry with exactly 4 triangular faces (12 vertices)', () => {
    const geometry = buildD4Geometry(THREE, 1)
    expect(geometry.index).toBeNull()
    expect(geometry.getAttribute('position').count).toBe(D4_FACE_COUNT * 3)
  })

  it('creates exactly 4 material groups, one per face', () => {
    const geometry = buildD4Geometry(THREE, 1)
    expect(geometry.groups).toHaveLength(4)
    for (let f = 0; f < 4; f++) {
      expect(geometry.groups[f]).toEqual({ start: f * 3, count: 3, materialIndex: f })
    }
  })

  it('does not modify vertex positions relative to a raw TetrahedronGeometry', () => {
    const raw = new THREE.TetrahedronGeometry(1, 0)
    const fixed = buildD4Geometry(THREE, 1)
    const rawPos = raw.getAttribute('position')
    const fixedPos = fixed.getAttribute('position')
    for (let i = 0; i < rawPos.count; i++) {
      expect(fixedPos.getX(i)).toBe(rawPos.getX(i))
      expect(fixedPos.getY(i)).toBe(rawPos.getY(i))
      expect(fixedPos.getZ(i)).toBe(rawPos.getZ(i))
    }
  })
})

describe('D4 face/value mapping', () => {
  it('D4_FACE_VALUES is exactly 1..4', () => {
    expect([...D4_FACE_VALUES].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })

  it('D4_FACE_VALUE_BY_INDEX is a permutation of 1..4', () => {
    expect([...D4_FACE_VALUE_BY_INDEX].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })
})

describe('D4 authoritative orientation', () => {
  it('for all 4 faces, the stored quaternion brings that face\'s own real (normal, up) to world (+Z, +Y)', () => {
    const geometry = buildD4Geometry(THREE, 1)
    const pos = geometry.getAttribute('position')

    for (let f = 0; f < 4; f++) {
      const base = f * 3
      const v0 = new THREE.Vector3(pos.getX(base), pos.getY(base), pos.getZ(base))
      const v1 = new THREE.Vector3(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1))
      const v2 = new THREE.Vector3(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2))
      const centroid = v0.clone().add(v1).add(v2).divideScalar(3)
      const normal = centroid.clone().normalize()
      const toV0 = v0.clone().sub(centroid)
      const upLocal = toV0.clone().sub(normal.clone().multiplyScalar(toV0.dot(normal))).normalize()

      const value = D4_FACE_VALUE_BY_INDEX[f]!
      const qData = D4_ORIENTATIONS[value]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)

      const n2 = normal.clone().applyQuaternion(q)
      const u2 = upLocal.clone().applyQuaternion(q)
      expect(n2.z).toBeCloseTo(1, 6)
      expect(u2.y).toBeCloseTo(1, 6)
    }
  })

  it('landingQuaternionForD4 returns null outside 1-4', () => {
    expect(landingQuaternionForD4(0)).toBeNull()
    expect(landingQuaternionForD4(5)).toBeNull()
  })
})

describe('D4 UV handedness -- +U maps to visible right, not visible left', () => {
  it('for all 4 faces, buffer-vertex 2 (assigned the higher-u corner) lands at positive world X, and buffer-vertex 1 (lower-u) lands at negative world X', () => {
    const geometry = buildD4Geometry(THREE, 1)
    const pos = geometry.getAttribute('position')

    for (let f = 0; f < 4; f++) {
      const base = f * 3
      const v0 = new THREE.Vector3(pos.getX(base), pos.getY(base), pos.getZ(base))
      const v1 = new THREE.Vector3(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1))
      const v2 = new THREE.Vector3(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2))
      const centroid = v0.clone().add(v1).add(v2).divideScalar(3)

      const value = D4_FACE_VALUE_BY_INDEX[f]!
      const qData = D4_ORIENTATIONS[value]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)

      const screen1 = v1.clone().sub(centroid).applyQuaternion(q)
      const screen2 = v2.clone().sub(centroid).applyQuaternion(q)
      expect(screen2.x).toBeGreaterThan(0)
      expect(screen1.x).toBeLessThan(0)
    }
  })

  it('the canonical UV triangle assigns vertex1 the LEFT corner and vertex2 the RIGHT corner', () => {
    const uvs = buildD4CanonicalUVs()
    for (let f = 0; f < 4; f++) {
      const base = f * 6
      expect(uvs[base + 0]).toBeCloseTo(D4_UV_TOP.u, 6)
      expect(uvs[base + 2]).toBeCloseTo(D4_UV_BOTTOM_LEFT.u, 6)
      expect(uvs[base + 4]).toBeCloseTo(D4_UV_BOTTOM_RIGHT.u, 6)
    }
  })
})

describe('D4 numeral fit', () => {
  it('every face value renders as a single digit "1".."4" (no two-digit values on a d4)', () => {
    for (const value of D4_FACE_VALUES) {
      expect(String(value)).toMatch(/^[1-4]$/)
    }
  })
})
