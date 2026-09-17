// Tests for app/components/world/authoredD12Three.ts. Roll System Phase
// 4C.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  D12_FACE_COUNT, D12_FACE_VALUES, D12_FACE_VALUE_BY_INDEX, D12_ORIENTATIONS, D12_PENTAGON_VERTICES,
  buildD12Geometry, landingQuaternionForD12
} from '../../../app/components/world/authoredD12Three'

describe('D12 geometry -- all 12 pentagonal faces', () => {
  it('has exactly 12 pentagon faces (108 vertices, 36 triangles)', () => {
    const geometry = buildD12Geometry(THREE, 1)
    expect(geometry.getAttribute('position').count).toBe(108)
    expect(geometry.groups).toHaveLength(D12_FACE_COUNT)
  })

  it('each group spans exactly 9 vertices (3 triangles) with a unique materialIndex', () => {
    const geometry = buildD12Geometry(THREE, 1)
    const seen = new Set<number>()
    for (let f = 0; f < 12; f++) {
      const group = geometry.groups[f]!
      expect(group.start).toBe(f * 9)
      expect(group.count).toBe(9)
      seen.add(group.materialIndex!)
    }
    expect(seen.size).toBe(12)
  })

  it('every pentagon is planar and regular (five equal edge lengths)', () => {
    for (const pentagon of D12_PENTAGON_VERTICES) {
      const pts = pentagon.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      const centroid = pts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(5)
      const normal = centroid.clone().normalize()
      for (const p of pts) {
        expect(Math.abs(p.clone().sub(centroid).dot(normal))).toBeLessThan(1e-6)
      }
      const edges = pts.map((p, i) => p.distanceTo(pts[(i + 1) % 5]!))
      for (const e of edges) expect(e).toBeCloseTo(edges[0]!, 4)
    }
  })

  it('does not modify vertex positions -- rebuilding the geometry never mutates D12_PENTAGON_VERTICES', () => {
    const before = JSON.stringify(D12_PENTAGON_VERTICES)
    buildD12Geometry(THREE, 1)
    expect(JSON.stringify(D12_PENTAGON_VERTICES)).toBe(before)
  })
})

describe('D12 face/value mapping -- opposite faces sum to 13', () => {
  it('D12_FACE_VALUES is exactly 1..12, D12_FACE_VALUE_BY_INDEX is a permutation of it', () => {
    expect([...D12_FACE_VALUES].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect([...D12_FACE_VALUE_BY_INDEX].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
  })

  it('geometrically antipodal pentagons are assigned values summing to 13', () => {
    const centroids = D12_PENTAGON_VERTICES.map((pentagon) => {
      const pts = pentagon.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      return pts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(5).normalize()
    })
    for (let f = 0; f < 12; f++) {
      let best = -1, bestDot = 2
      for (let g = 0; g < 12; g++) {
        if (g === f) continue
        const dot = centroids[f]!.dot(centroids[g]!)
        if (dot < bestDot) { bestDot = dot; best = g }
      }
      expect(bestDot).toBeCloseTo(-1, 6)
      expect(D12_FACE_VALUE_BY_INDEX[f]! + D12_FACE_VALUE_BY_INDEX[best]!).toBe(13)
    }
  })
})

describe('D12 authoritative orientation', () => {
  it('for all 12 faces, the stored quaternion brings that face\'s own real (normal, up=toward shared vertex) to world (+Z, +Y)', () => {
    for (let f = 0; f < 12; f++) {
      const pentagon = D12_PENTAGON_VERTICES[f]!
      const pts = pentagon.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      const centroid = pts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(5)
      const normal = centroid.clone().normalize()
      const toShared = pts[0]!.clone().sub(centroid)
      const upLocal = toShared.clone().sub(normal.clone().multiplyScalar(toShared.dot(normal))).normalize()

      const value = D12_FACE_VALUE_BY_INDEX[f]!
      const qData = D12_ORIENTATIONS[value]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)
      expect(normal.clone().applyQuaternion(q).z).toBeCloseTo(1, 6)
      expect(upLocal.clone().applyQuaternion(q).y).toBeCloseTo(1, 6)
    }
  })

  it('landingQuaternionForD12 returns null outside 1-12', () => {
    expect(landingQuaternionForD12(0)).toBeNull()
    expect(landingQuaternionForD12(13)).toBeNull()
  })
})

describe('D12 UV handedness', () => {
  it('for all 12 faces, the shared/apex vertex lands screen-up, and A/D land screen-left/right respectively', () => {
    for (let f = 0; f < 12; f++) {
      const pentagon = D12_PENTAGON_VERTICES[f]!
      const pts = pentagon.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      const centroid = pts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(5)
      const value = D12_FACE_VALUE_BY_INDEX[f]!
      const qData = D12_ORIENTATIONS[value]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)

      const screenShared = pts[0]!.clone().sub(centroid).applyQuaternion(q)
      const screenA = pts[1]!.clone().sub(centroid).applyQuaternion(q)
      const screenD = pts[4]!.clone().sub(centroid).applyQuaternion(q)
      expect(screenShared.y).toBeGreaterThan(0)
      expect(screenA.x).toBeLessThan(0)
      expect(screenD.x).toBeGreaterThan(0)
    }
  })
})
