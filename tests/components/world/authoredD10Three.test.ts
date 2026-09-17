// Tests for app/components/world/authoredD10Three.ts. Roll System Phase
// 4C. A pentagonal trapezohedron has no three.js primitive -- these tests
// verify the hand-authored geometry is actually correct (planar,
// congruent, properly antipodal kite faces), not merely "looks reasonable".

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  D10_FACE_COUNT, D10_KITE_VERTICES, D10_PHYSICAL_FACE_VALUES, D10_FACE_VALUE_BY_INDEX, D10_ORIENTATIONS,
  buildD10Geometry, labelForAuthoritativeD10Value, landingQuaternionForD10PhysicalFace, physicalFaceForAuthoritativeD10Value
} from '../../../app/components/world/authoredD10Three'

describe('D10 geometry correctness -- all 10 faces', () => {
  it('has exactly 10 kite faces (60 vertices, 20 triangles)', () => {
    const geometry = buildD10Geometry(THREE, 1)
    expect(geometry.getAttribute('position').count).toBe(60)
    expect(geometry.groups).toHaveLength(D10_FACE_COUNT)
  })

  it('every kite face is planar (its 4 real vertices lie in one plane)', () => {
    for (const kite of D10_KITE_VERTICES) {
      const [apex, b, c, d] = kite.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      const centroid = apex!.clone().add(b!).add(c!).add(d!).divideScalar(4)
      const normal = new THREE.Vector3().crossVectors(b!.clone().sub(apex!), c!.clone().sub(apex!)).normalize()
      const devD = d!.clone().sub(centroid).dot(normal)
      expect(Math.abs(devD)).toBeLessThan(1e-6)
    }
  })

  it('every kite face is congruent (identical edge lengths and diagonal across all 10 faces)', () => {
    const shapes = D10_KITE_VERTICES.map((kite) => {
      const [apex, b, c, d] = kite.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      return {
        apexB: apex!.distanceTo(b!), bc: b!.distanceTo(c!), cd: c!.distanceTo(d!), dApex: d!.distanceTo(apex!), diag: apex!.distanceTo(c!)
      }
    })
    const first = shapes[0]!
    for (const shape of shapes) {
      expect(shape.apexB).toBeCloseTo(first.apexB, 4)
      expect(shape.bc).toBeCloseTo(first.bc, 4)
      expect(shape.cd).toBeCloseTo(first.cd, 4)
      expect(shape.dApex).toBeCloseTo(first.dApex, 4)
      expect(shape.diag).toBeCloseTo(first.diag, 4)
    }
  })

  it('faces are properly antipodal (face-centroid direction dot products are exactly -1)', () => {
    const centroids = D10_KITE_VERTICES.map((kite) => {
      const pts = kite.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      return pts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(4).normalize()
    })
    for (let f = 0; f < 10; f++) {
      let best = -1, bestDot = 2
      for (let g = 0; g < 10; g++) {
        if (g === f) continue
        const dot = centroids[f]!.dot(centroids[g]!)
        if (dot < bestDot) { bestDot = dot; best = g }
      }
      expect(bestDot).toBeCloseTo(-1, 6)
    }
  })

  it('does not modify D10_KITE_VERTICES\' own raw coordinates when building the geometry', () => {
    const before = JSON.stringify(D10_KITE_VERTICES)
    buildD10Geometry(THREE, 1)
    expect(JSON.stringify(D10_KITE_VERTICES)).toBe(before)
  })
})

describe('D10 physical face value mapping -- opposite faces sum to 9', () => {
  it('D10_PHYSICAL_FACE_VALUES is exactly 0..9, D10_FACE_VALUE_BY_INDEX is a permutation of it', () => {
    expect([...D10_PHYSICAL_FACE_VALUES].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect([...D10_FACE_VALUE_BY_INDEX].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('antipodal kite faces are assigned physical labels summing to 9', () => {
    const centroids = D10_KITE_VERTICES.map((kite) => {
      const pts = kite.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      return pts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(4).normalize()
    })
    for (let f = 0; f < 10; f++) {
      let best = -1, bestDot = 2
      for (let g = 0; g < 10; g++) {
        if (g === f) continue
        const dot = centroids[f]!.dot(centroids[g]!)
        if (dot < bestDot) { bestDot = dot; best = g }
      }
      expect(D10_FACE_VALUE_BY_INDEX[f]! + D10_FACE_VALUE_BY_INDEX[best]!).toBe(9)
    }
  })
})

describe('D10 authoritative 1-10 domain reconciliation', () => {
  it('values 1-9 map directly to their own same-numbered physical face', () => {
    for (let v = 1; v <= 9; v++) {
      expect(physicalFaceForAuthoritativeD10Value(v)).toBe(v)
      expect(labelForAuthoritativeD10Value(v)).toBe(String(v))
    }
  })

  it('value 10 maps to physical face "0" (the real d10 tabletop convention)', () => {
    expect(physicalFaceForAuthoritativeD10Value(10)).toBe(0)
    expect(labelForAuthoritativeD10Value(10)).toBe('0')
  })

  it('rejects values outside 1-10', () => {
    expect(physicalFaceForAuthoritativeD10Value(0)).toBeNull()
    expect(physicalFaceForAuthoritativeD10Value(11)).toBeNull()
  })
})

describe('D10 authoritative orientation', () => {
  it('for all 10 faces, the stored quaternion brings that face\'s own real (normal, up=toward apex) to world (+Z, +Y)', () => {
    for (let f = 0; f < 10; f++) {
      const kite = D10_KITE_VERTICES[f]!
      const [apex, b, c, d] = kite.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      const centroid = apex!.clone().add(b!).add(c!).add(d!).divideScalar(4)
      const normal = centroid.clone().normalize()
      const toApex = apex!.clone().sub(centroid)
      const upLocal = toApex.clone().sub(normal.clone().multiplyScalar(toApex.dot(normal))).normalize()

      const physicalFace = D10_FACE_VALUE_BY_INDEX[f]!
      const qData = D10_ORIENTATIONS[physicalFace]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)
      expect(normal.clone().applyQuaternion(q).z).toBeCloseTo(1, 6)
      expect(upLocal.clone().applyQuaternion(q).y).toBeCloseTo(1, 6)
    }
  })

  it('landingQuaternionForD10PhysicalFace returns null outside 0-9', () => {
    expect(landingQuaternionForD10PhysicalFace(-1)).toBeNull()
    expect(landingQuaternionForD10PhysicalFace(10)).toBeNull()
  })
})

describe('D10 UV handedness -- +U maps to visible right, +V maps to visible up', () => {
  it('for all 10 faces, the wing vertex assigned the higher-u corner lands screen-right, the other lands screen-left, and the apex lands screen-up', () => {
    for (let f = 0; f < 10; f++) {
      const kite = D10_KITE_VERTICES[f]!
      const [apex, b, c, d] = kite.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      const centroid = apex!.clone().add(b!).add(c!).add(d!).divideScalar(4)
      const physicalFace = D10_FACE_VALUE_BY_INDEX[f]!
      const qData = D10_ORIENTATIONS[physicalFace]!
      const q = new THREE.Quaternion(qData.x, qData.y, qData.z, qData.w)

      // canonical UV: apex->top(u=0.5), b->left(u=0.08), c->bottom(u=0.5), d->right(u=0.92)
      const screenApex = apex!.clone().sub(centroid).applyQuaternion(q)
      const screenB = b!.clone().sub(centroid).applyQuaternion(q)
      const screenD = d!.clone().sub(centroid).applyQuaternion(q)
      expect(screenApex.y).toBeGreaterThan(0)
      expect(screenB.x).toBeLessThan(0)
      expect(screenD.x).toBeGreaterThan(0)
    }
  })
})
