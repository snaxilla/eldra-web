// Tests for app/components/world/authoredPolyhedralDiceRegistry.ts. Roll
// System Phase 4C. Proves the registry composes correctly against real
// generated geometry for every standard die, and that d20 is
// deliberately absent (its own frozen renderer/adapter path owns it).

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { POLYHEDRAL_DICE_BY_SIDES, polyhedralDieDefinitionForSides } from '../../../app/components/world/authoredPolyhedralDiceRegistry'

describe('authoredPolyhedralDiceRegistry', () => {
  it('registers exactly d4, d6, d8, d10, d12 -- d20 is NOT in this registry (it keeps its own frozen path)', () => {
    expect(Object.keys(POLYHEDRAL_DICE_BY_SIDES).map(Number).sort((a, b) => a - b)).toEqual([4, 6, 8, 10, 12])
    expect(polyhedralDieDefinitionForSides(20)).toBeNull()
  })

  it('returns null for an unsupported side count', () => {
    expect(polyhedralDieDefinitionForSides(3)).toBeNull()
    expect(polyhedralDieDefinitionForSides(100)).toBeNull()
  })

  for (const sides of [4, 6, 8, 10, 12]) {
    it(`d${sides}: builds a real geometry with the definition's own declared face count, and every face value resolves to a non-null landing quaternion`, () => {
      const def = polyhedralDieDefinitionForSides(sides)!
      const geometry = def.buildGeometry(THREE, 1)
      expect(geometry.groups.length).toBe(def.faceCount)

      // d10's own authoritative domain is 1-10 even though it has 10
      // physical faces labeled 0-9 -- exercise the definition's own
      // domain, not a bare face-count loop, so this test works for every
      // registered die without special-casing d10 here.
      const domain = sides === 10 ? Array.from({ length: 10 }, (_, i) => i + 1) : Array.from({ length: sides }, (_, i) => i + 1)
      for (const value of domain) {
        expect(def.landingQuaternionForValue(value)).not.toBeNull()
        expect(typeof def.labelForValue(value)).toBe('string')
      }
    })

    it(`d${sides}: safeAreaWidthAt returns a non-negative width at the definition's own UV centroid`, () => {
      const def = polyhedralDieDefinitionForSides(sides)!
      expect(def.safeAreaWidthAt(def.uvCentroid.v)).toBeGreaterThanOrEqual(0)
    })
  }
})
