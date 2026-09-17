// Tests for app/components/world/authoredD8Three.ts. Roll System Phase
// 4C. Same independent-re-derivation discipline as authoredD4Three.test.ts.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  D8_FACE_COUNT, D8_FACE_VALUES, D8_FACE_VALUE_BY_INDEX, D8_ORIENTATIONS,
  D8_UV_BOTTOM_LEFT, D8_UV_BOTTOM_RIGHT, D8_UV_TOP,
  buildD8CanonicalUVs, buildD8Geometry, landingQuaternionForD8
} from '../../../app/components/world/authoredD8Three'

describe('D8 geometry -- all 8 faces', () => {
  it('is non-indexed with exactly 8 triangular faces (24 vertices)', () => {
    const geometry = buildD8Geometry(THREE, 1)
    expect(geometry.index).toBeNull()
    expect(geometry.getAttribute('position').count).toBe(D8_FACE_COUNT * 3)
  })

  it('creates exactly 8 material groups, one per face', () => {
    const geometry = buildD8Geometry(THREE, 1)
    expect(geometry.groups).toHaveLength(8)
    for (let f = 0; f < 8; f++) expect(geometry.groups[f]).toEqual({ start: f * 3, count: 3, materialIndex: f })
  })

  it('does not modify vertex positions relative to a raw OctahedronGeometry', () => {
    const raw = new THREE.OctahedronGeometry(1, 0)
    const fixed = buildD8Geometry(THREE, 1)
    const rawPos = raw.getAttribute('position')
    const fixedPos = fixed.getAttribute('position')
    for (let i = 0; i < rawPos.count; i++) {
      expect(fixedPos.getX(i)).toBe(rawPos.getX(i))
      expect(fixedPos.getY(i)).toBe(rawPos.getY(i))
      expect(fixedPos.getZ(i)).toBe(rawPos.getZ(i))
    }
  })
})

describe('D8 face/value mapping -- opposite faces sum to 9', () => {
  it('D8_FACE_VALUES is exactly 1..8, D8_FACE_VALUE_BY_INDEX is a permutation of it', () => {
    expect([...D8_FACE_VALUES].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...D8_FACE_VALUE_BY_INDEX].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('geometrically antipodal faces (real face-centroid dot product ~ -1) are assigned values summing to 9', () => {
    const geometry = buildD8Geometry(THREE, 1)
    const pos = geometry.getAttribute('position')
    const centroids: THREE.Vector3[] = []
    for (let f = 0; f < 8; f++) {
      const base = f * 3
      const v0 = new THREE.Vector3(pos.getX(base), pos.getY(base), pos.getZ(base))
      const v1 = new THREE.Vector3(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1))
      const v2 = new THREE.Vector3(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2))
      centroids.push(v0.clone().add(v1).add(v2).divideScalar(3).normalize())
    }
    for (let f = 0; f < 8; f++) {
      let best = -1, bestDot = 2
      for (let g = 0; g < 8; g++) {
        if (g === f) continue
        const dot = centroids[f]!.dot(centroids[g]!)
        if (dot < bestDot) { bestDot = dot; best = g }
      }
      expect(bestDot).toBeCloseTo(-1, 6)
      expect(D8_FACE_VALUE_BY_INDEX[f]! + D8_FACE_VALUE_BY_INDEX[best]!).toBe(9)
    }
  })
})

describe('D8 authoritative orientation', () => {
  it('for all 8 faces, the stored quaternion brings that face\'s own real (normal, up) to world (+Z, +Y)', () => {
    const geometry = buildD8Geometry(THREE, 1)
    const pos = geometry.getAttribute('position')
    for (let f = 0; f < 8; f++) {
      const base = f * 3
      const v0 = new THREE.Vector3(pos.getX(base), pos.getY(base), pos.getZ(base))
      const v1 = new THREE.Vector3(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1))
      const v2 = new THREE.Vector3(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2))
      const centroid = v0.clone().add(v1).add(v2).divideScalar(3)
      const normal = centroid.clone().normalize()
      const toV0 = v0.clone().sub(centroid)
      const upLocal = toV0.clone().sub(normal.clone().multiplyScalar(toV0.dot(normal))).normalize()
      const value = D8_FACE_VALUE_BY_INDEX[f]!
      const qData = D8_ORIENTATIONS[value]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)
      expect(normal.clone().applyQuaternion(q).z).toBeCloseTo(1, 6)
      expect(upLocal.clone().applyQuaternion(q).y).toBeCloseTo(1, 6)
    }
  })

  it('landingQuaternionForD8 returns null outside 1-8', () => {
    expect(landingQuaternionForD8(0)).toBeNull()
    expect(landingQuaternionForD8(9)).toBeNull()
  })
})

describe('D8 UV handedness', () => {
  it('for all 8 faces, buffer-vertex 2 lands screen-right, buffer-vertex 1 lands screen-left', () => {
    const geometry = buildD8Geometry(THREE, 1)
    const pos = geometry.getAttribute('position')
    for (let f = 0; f < 8; f++) {
      const base = f * 3
      const v0 = new THREE.Vector3(pos.getX(base), pos.getY(base), pos.getZ(base))
      const v1 = new THREE.Vector3(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1))
      const v2 = new THREE.Vector3(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2))
      const centroid = v0.clone().add(v1).add(v2).divideScalar(3)
      const value = D8_FACE_VALUE_BY_INDEX[f]!
      const qData = D8_ORIENTATIONS[value]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)
      expect(v2.clone().sub(centroid).applyQuaternion(q).x).toBeGreaterThan(0)
      expect(v1.clone().sub(centroid).applyQuaternion(q).x).toBeLessThan(0)
    }
  })

  it('canonical UV assigns vertex1 the LEFT corner and vertex2 the RIGHT corner', () => {
    const uvs = buildD8CanonicalUVs()
    for (let f = 0; f < 8; f++) {
      const base = f * 6
      expect(uvs[base + 0]).toBeCloseTo(D8_UV_TOP.u, 6)
      expect(uvs[base + 2]).toBeCloseTo(D8_UV_BOTTOM_LEFT.u, 6)
      expect(uvs[base + 4]).toBeCloseTo(D8_UV_BOTTOM_RIGHT.u, 6)
    }
  })
})
