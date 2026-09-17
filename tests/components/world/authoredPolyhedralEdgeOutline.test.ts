// Tests for the shared edge-outline treatment Roll System Phase 4C.1
// (Polyhedral Visual Normalization + Family Edge Treatment) adds to
// WorldAuthoredPolyhedralDiceRenderer.client.vue -- restated there from
// the frozen d20 renderer's own `buildEdgeOutline`
// (`THREE.EdgesGeometry(geometry, 1)`), applied here to the REAL
// generated geometry for every standard die.
//
// THE CENTRAL CLAIM UNDER TEST: `EdgesGeometry`'s own angle-threshold
// filtering excludes an internal seam between two triangles ONLY when
// those triangles are exactly coplanar (angle ~0). d10's kite faces and
// d12's pentagon faces are each internally split into 2/3 triangles for
// rendering, but those splits are along a real, physical, mathematically
// PLANAR face (proven in authoredD10Three.ts's/authoredD12Three.ts's own
// derivation) -- so the internal split line should NEVER appear as a
// visible edge. The strongest available proof is a WHOLE-GEOMETRY edge
// count against each solid's own real topological edge count (Euler's
// formula, V - E + F = 2): if internal seams leaked through, the
// measured count would be LARGER than the true value, not merely
// "close."

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildD4Geometry } from '../../../app/components/world/authoredD4Three'
import { buildD6Geometry } from '../../../app/components/world/authoredD6Three'
import { buildD8Geometry } from '../../../app/components/world/authoredD8Three'
import { buildD10Geometry } from '../../../app/components/world/authoredD10Three'
import { buildD12Geometry } from '../../../app/components/world/authoredD12Three'
import { buildD20FaceGeometry } from '../../../app/components/world/authoredD20ThreeFaceUV'

function edgeCount(geometry: import('three').BufferGeometry): number {
  const edges = new THREE.EdgesGeometry(geometry, 1)
  return edges.getAttribute('position').count / 2
}

describe('item 10: edge extraction produces visible boundary edges for every die', () => {
  it('every standard die geometry produces at least one edge segment', () => {
    expect(edgeCount(buildD4Geometry(THREE, 1))).toBeGreaterThan(0)
    expect(edgeCount(buildD6Geometry(THREE, 1))).toBeGreaterThan(0)
    expect(edgeCount(buildD8Geometry(THREE, 1))).toBeGreaterThan(0)
    expect(edgeCount(buildD10Geometry(THREE, 1))).toBeGreaterThan(0)
    expect(edgeCount(buildD12Geometry(THREE, 1))).toBeGreaterThan(0)
  })
})

describe('items 10-12: whole-geometry edge counts match each solid\'s own real topology exactly (Euler\'s formula V-E+F=2) -- no internal triangulation leaks through', () => {
  // V, F per solid; E derived from Euler's formula, independent of this
  // codebase's own geometry-construction code.
  const cases: Array<{ name: string; build: () => import('three').BufferGeometry; vertices: number; faces: number }> = [
    { name: 'd4 (tetrahedron)', build: () => buildD4Geometry(THREE, 1), vertices: 4, faces: 4 },
    { name: 'd6 (cube)', build: () => buildD6Geometry(THREE, 1), vertices: 8, faces: 6 },
    { name: 'd8 (octahedron)', build: () => buildD8Geometry(THREE, 1), vertices: 6, faces: 8 },
    { name: 'd10 (pentagonal trapezohedron)', build: () => buildD10Geometry(THREE, 1), vertices: 12, faces: 10 },
    { name: 'd12 (dodecahedron)', build: () => buildD12Geometry(THREE, 1), vertices: 20, faces: 12 },
    { name: 'd20 (icosahedron, frozen)', build: () => buildD20FaceGeometry(THREE, 1), vertices: 12, faces: 20 }
  ]

  for (const { name, build, vertices, faces } of cases) {
    it(`${name}: measured edge count equals the Euler-derived true edge count`, () => {
      const expectedEdges = vertices - 2 + faces // V - E + F = 2  =>  E = V + F - 2
      expect(edgeCount(build())).toBe(expectedEdges)
    })
  }
})

describe('item 11: d12 edge extraction does NOT expose internal pentagon fan-triangulation lines', () => {
  it('a single pentagon face (3 fan triangles) produces exactly 5 edges, not 5 + internal fan lines', () => {
    const geometry = buildD12Geometry(THREE, 1)
    // Isolate face 0's own 9 vertices (3 triangles) into a standalone geometry.
    const pos = geometry.getAttribute('position')
    const positions: number[] = []
    for (let i = 0; i < 9; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    const faceGeometry = new THREE.BufferGeometry()
    faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    faceGeometry.computeVertexNormals()

    expect(edgeCount(faceGeometry)).toBe(5)
  })

  it('the full 12-pentagon geometry has exactly 30 edges (dodecahedron\'s own true count), never the 36 it would show if each face\'s 3 internal fan seams leaked through', () => {
    expect(edgeCount(buildD12Geometry(THREE, 1))).toBe(30)
  })
})

describe('item 12: d10 edge extraction follows real physical kite boundaries, not the internal diagonal split', () => {
  it('a single kite face (2 triangles) produces exactly 4 edges, not 4 + the internal diagonal', () => {
    const geometry = buildD10Geometry(THREE, 1)
    const pos = geometry.getAttribute('position')
    const positions: number[] = []
    for (let i = 0; i < 6; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    const faceGeometry = new THREE.BufferGeometry()
    faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    faceGeometry.computeVertexNormals()

    expect(edgeCount(faceGeometry)).toBe(4)
  })

  it('the full 10-kite geometry has exactly 20 edges (a pentagonal trapezohedron\'s own true count), never the 30 it would show if each face\'s own internal diagonal leaked through', () => {
    expect(edgeCount(buildD10Geometry(THREE, 1))).toBe(20)
  })
})
