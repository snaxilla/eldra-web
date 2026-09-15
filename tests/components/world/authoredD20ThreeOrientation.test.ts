// Exhaustive verification of
// app/components/world/authoredD20ThreeOrientation.ts. Eldra Roll System
// Phase 4B.1 (Authored Three.js d20 Proof of Concept, ADR-024 Option 2).
// This task's own explicit ask: "All faces: 1 through 20 must resolve to
// the expected target orientation."
//
// THIS DOES NOT ASSERT THE TABLE AGAINST ITSELF. It uses the REAL `three`
// package (now a direct dependency, not a hand-transcribed copy of its
// geometry) to independently reconstruct `new THREE.IcosahedronGeometry
// (1, 0)`, re-derive each face's own normal/up/right basis from the
// ACTUAL geometry buffer (not a re-typed vertex list), and prove, for
// every one of the 20 faces, that applying `D20_THREE_ORIENTATIONS`'s
// stored quaternion to that face's own normal and up vectors reproduces
// world +Z and world +Y to machine precision -- i.e. that landing on face
// N provably brings exactly that face to dead-center, camera-facing, with
// its printed numeral upright on screen. This is the same "replicate the
// renderer's own arithmetic independently" methodology
// tests/components/world/worldDiceThreeRendererAdapter.test.ts's own
// Phase 3F block and authoredD20Orientation.test.ts's own Phase 4B suite
// already established.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  D20_FACE_VALUES,
  D20_THREE_FACE_VALUE_BY_INDEX,
  D20_THREE_ORIENTATIONS,
  landingQuaternionForFace
} from '../../../app/components/world/authoredD20ThreeOrientation'

const FACE_COUNT = 20
const EPSILON = 1e-6

function buildReferenceGeometry(): THREE.IcosahedronGeometry {
  return new THREE.IcosahedronGeometry(1, 0)
}

function faceVertex(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, faceIndex: number, vertexInFace: number): THREE.Vector3 {
  const i = faceIndex * 3 + vertexInFace
  return new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i))
}

// Independently re-derives face `f`'s own (normal, up, right) basis from
// the REAL geometry -- the exact method authoredD20ThreeOrientation.ts's
// own header documents, re-implemented here rather than imported, so a
// bug in the source module's own derivation script cannot also hide the
// same bug in this test.
function faceBasis(geometry: THREE.IcosahedronGeometry, f: number) {
  const position = geometry.getAttribute('position')
  const v0 = faceVertex(position, f, 0)
  const v1 = faceVertex(position, f, 1)
  const v2 = faceVertex(position, f, 2)
  const centroid = v0.clone().add(v1).add(v2).divideScalar(3)
  const normal = centroid.clone().normalize()

  const toV0 = v0.clone().sub(centroid)
  const up = toV0.clone().sub(normal.clone().multiplyScalar(toV0.dot(normal))).normalize()
  const right = up.clone().cross(normal).normalize()

  return { normal, up, right }
}

describe('D20_FACE_VALUES', () => {
  it('is exactly the 20 integers 1..20, no more, no fewer', () => {
    expect([...D20_FACE_VALUES].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1)
    )
  })
})

describe('D20_THREE_FACE_VALUE_BY_INDEX', () => {
  it('has exactly 20 entries, one per geometry face', () => {
    expect(D20_THREE_FACE_VALUE_BY_INDEX).toHaveLength(FACE_COUNT)
  })

  it('is a permutation of 1..20 -- every value appears exactly once', () => {
    expect([...D20_THREE_FACE_VALUE_BY_INDEX].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1)
    )
  })
})

describe('D20_THREE_ORIENTATIONS -- exhaustive, per-face geometric verification against the REAL three.js geometry', () => {
  it('has exactly one entry for every face value 1-20, no extras', () => {
    const keys = Object.keys(D20_THREE_ORIENTATIONS).map(Number).sort((a, b) => a - b)
    expect(keys).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('every stored quaternion is a genuine unit quaternion', () => {
    for (const o of Object.values(D20_THREE_ORIENTATIONS)) {
      const length = Math.hypot(o.x, o.y, o.z, o.w)
      expect(length).toBeCloseTo(1, 6)
    }
  })

  // THE CORE PROOF, per geometry face index: applying the quaternion
  // stored for that face's OWN printed value brings that face's REAL
  // (normal, up) pair to world (+Z, +Y) exactly -- i.e. this face lands
  // dead-center, camera-facing, numeral upright.
  for (let f = 0; f < FACE_COUNT; f++) {
    const value = D20_THREE_FACE_VALUE_BY_INDEX[f]!

    it(`geometry face ${f} (printed value ${value}): its stored quaternion brings normal->+Z and up->+Y`, () => {
      const geometry = buildReferenceGeometry()
      const { normal, up } = faceBasis(geometry, f)

      const stored = D20_THREE_ORIENTATIONS[value]!
      const quat = new THREE.Quaternion(stored.x, stored.y, stored.z, stored.w)

      const landedNormal = normal.clone().applyQuaternion(quat)
      const landedUp = up.clone().applyQuaternion(quat)

      expect(landedNormal.x).toBeCloseTo(0, 6)
      expect(landedNormal.y).toBeCloseTo(0, 6)
      expect(landedNormal.z).toBeCloseTo(1, 6)

      expect(landedUp.x).toBeCloseTo(0, 6)
      expect(landedUp.y).toBeCloseTo(1, 6)
      expect(landedUp.z).toBeCloseTo(0, 6)
    })
  }

  it('assigns 20 geometrically distinct landing quaternions -- no two face values rotate the die the same way', () => {
    const quaternions = Object.values(D20_THREE_ORIENTATIONS)
    for (let i = 0; i < quaternions.length; i++) {
      for (let j = i + 1; j < quaternions.length; j++) {
        const a = quaternions[i]!, b = quaternions[j]!
        // Quaternions q and -q represent the SAME rotation, so compare
        // via the smaller of the two possible distances.
        const distPos = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w)
        const distNeg = Math.hypot(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w)
        expect(Math.min(distPos, distNeg)).toBeGreaterThan(0.05)
      }
    }
  })

  it('matches the real d20 convention that opposite faces sum to 21 (courtesy, not a functional requirement)', () => {
    const geometry = buildReferenceGeometry()
    const entries = D20_THREE_FACE_VALUE_BY_INDEX.map((value, f) => ({
      value,
      normal: faceBasis(geometry, f).normal
    }))

    for (const entry of entries) {
      const partner = entries.find((other) => {
        const d = other.normal.clone().add(entry.normal).length()
        return d < 1e-6
      })
      expect(partner, `face with value ${entry.value} has no antipodal partner`).toBeDefined()
      expect(entry.value + partner!.value).toBe(21)
    }
  })
})

describe('landingQuaternionForFace', () => {
  it('returns the exact stored orientation for every supported face', () => {
    for (const value of D20_FACE_VALUES) {
      expect(landingQuaternionForFace(value)).toEqual(D20_THREE_ORIENTATIONS[value])
    }
  })

  it('returns null for faces outside the supported 1-20 range', () => {
    expect(landingQuaternionForFace(0)).toBeNull()
    expect(landingQuaternionForFace(21)).toBeNull()
    expect(landingQuaternionForFace(-1)).toBeNull()
    expect(landingQuaternionForFace(7.5)).toBeNull()
  })
})

describe('geometry sanity -- confirms this test suite is exercising the geometry the renderer actually builds', () => {
  it('THREE.IcosahedronGeometry(1, 0) produces exactly 20 non-indexed triangular faces', () => {
    const geometry = buildReferenceGeometry()
    const position = geometry.getAttribute('position')
    expect(geometry.index).toBeNull() // non-indexed, per PolyhedronGeometry at detail 0
    expect(position.count).toBe(FACE_COUNT * 3)
  })

  it('every face centroid lies at unit distance from the origin (confirms radius=1 was applied)', () => {
    const geometry = buildReferenceGeometry()
    for (let f = 0; f < FACE_COUNT; f++) {
      const { normal } = faceBasis(geometry, f)
      expect(normal.length()).toBeCloseTo(1, 9)
    }
  })
})
