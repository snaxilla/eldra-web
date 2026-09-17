// Tests for app/components/world/authoredD6Three.ts. Roll System Phase
// 4C.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  D6_FACE_COUNT, D6_FACE_VALUES, D6_FACE_VALUE_BY_INDEX, D6_ORIENTATIONS,
  buildD6Geometry, landingQuaternionForD6
} from '../../../app/components/world/authoredD6Three'

function groupVertices(geometry: import('three').BufferGeometry, groupIndex: number) {
  const { start, count } = geometry.groups[groupIndex]!
  const index = geometry.getIndex()!
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const seen = new Map<number, { pos: THREE.Vector3; uv: { u: number; v: number } }>()
  for (let i = start; i < start + count; i++) {
    const vi = index.getX(i)
    if (!seen.has(vi)) {
      seen.set(vi, { pos: new THREE.Vector3(pos.getX(vi), pos.getY(vi), pos.getZ(vi)), uv: { u: uv.getX(vi), v: uv.getY(vi) } })
    }
  }
  return [...seen.values()]
}

describe('D6 geometry -- all 6 faces', () => {
  it('is indexed, with exactly 6 material groups (one per cube face)', () => {
    const geometry = buildD6Geometry(THREE, 2)
    expect(geometry.index).not.toBeNull()
    expect(geometry.groups).toHaveLength(D6_FACE_COUNT)
  })

  it('does not modify vertex positions relative to a raw BoxGeometry', () => {
    const raw = new THREE.BoxGeometry(2, 2, 2)
    const fixed = buildD6Geometry(THREE, 2)
    const rawPos = raw.getAttribute('position')
    const fixedPos = fixed.getAttribute('position')
    for (let i = 0; i < rawPos.count; i++) {
      expect(fixedPos.getX(i)).toBe(rawPos.getX(i))
      expect(fixedPos.getY(i)).toBe(rawPos.getY(i))
      expect(fixedPos.getZ(i)).toBe(rawPos.getZ(i))
    }
  })
})

describe('D6 face/value mapping -- opposite faces sum to 7', () => {
  it('D6_FACE_VALUES is exactly 1..6', () => {
    expect([...D6_FACE_VALUES].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('geometrically antipodal faces are assigned values summing to 7', () => {
    const geometry = buildD6Geometry(THREE, 2)
    const centroids = geometry.groups.map((_, g) => {
      const verts = groupVertices(geometry, g).map((v) => v.pos)
      return verts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(verts.length).normalize()
    })
    for (let f = 0; f < 6; f++) {
      let best = -1, bestDot = 2
      for (let g = 0; g < 6; g++) {
        if (g === f) continue
        const dot = centroids[f]!.dot(centroids[g]!)
        if (dot < bestDot) { bestDot = dot; best = g }
      }
      expect(bestDot).toBeCloseTo(-1, 6)
      expect(D6_FACE_VALUE_BY_INDEX[f]! + D6_FACE_VALUE_BY_INDEX[best]!).toBe(7)
    }
  })
})

describe('D6 authoritative orientation', () => {
  it('for all 6 faces, the stored quaternion brings that face\'s own real outward normal to world +Z', () => {
    const geometry = buildD6Geometry(THREE, 2)
    for (let f = 0; f < 6; f++) {
      const verts = groupVertices(geometry, f).map((v) => v.pos)
      const centroid = verts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(verts.length)
      const normal = centroid.clone().normalize()
      const value = D6_FACE_VALUE_BY_INDEX[f]!
      const qData = D6_ORIENTATIONS[value]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)
      expect(normal.clone().applyQuaternion(q).z).toBeCloseTo(1, 6)
    }
  })

  it('landingQuaternionForD6 returns null outside 1-6', () => {
    expect(landingQuaternionForD6(0)).toBeNull()
    expect(landingQuaternionForD6(7)).toBeNull()
  })
})

describe('D6 UV handedness -- +U maps to visible right after the flip fix', () => {
  it('for all 6 faces, the vertex with the higher stored u lands at a more positive screen X than the vertex with the lower stored u', () => {
    const geometry = buildD6Geometry(THREE, 2)
    for (let f = 0; f < 6; f++) {
      const verts = groupVertices(geometry, f)
      const centroid = verts.reduce((a, v) => a.add(v.pos), new THREE.Vector3()).divideScalar(verts.length)
      const value = D6_FACE_VALUE_BY_INDEX[f]!
      const qData = D6_ORIENTATIONS[value]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)

      const sorted = [...verts].sort((a, b) => a.uv.u - b.uv.u)
      const lowU = sorted[0]!
      const highU = sorted[sorted.length - 1]!
      const lowScreenX = lowU.pos.clone().sub(centroid).applyQuaternion(q).x
      const highScreenX = highU.pos.clone().sub(centroid).applyQuaternion(q).x
      expect(highScreenX).toBeGreaterThan(lowScreenX)
    }
  })

  it('is NOT the raw BoxGeometry UV (which this file\'s own header proves is horizontally backwards)', () => {
    const raw = new THREE.BoxGeometry(2, 2, 2)
    const fixed = buildD6Geometry(THREE, 2)
    const rawUv = raw.getAttribute('uv')
    const fixedUv = fixed.getAttribute('uv')
    let differing = 0
    for (let i = 0; i < rawUv.count; i++) {
      if (Math.abs(rawUv.getX(i) - fixedUv.getX(i)) > 1e-9) differing++
    }
    expect(differing).toBeGreaterThan(0)
  })
})
