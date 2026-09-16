// Tests for app/components/world/authoredD20ThreeSkin.ts. Eldra Roll
// System Phase 4B.2 (Authored d20 Visual Polish + Skin-Ready Material
// Architecture). This phase's own TESTING section: "verify... default
// skin resolves deterministically... material configuration does not
// alter orientation." No `three`/DOM import needed -- this module is
// deliberately plain data (see its own header for why), so this suite
// runs in the same plain-Node Vitest environment as every other pure
// module in this codebase.

import { describe, expect, it } from 'vitest'
import {
  ELDRA_DEFAULT_D20_SKIN,
  resolveDiceSkin,
  type DiceSkin
} from '../../../app/components/world/authoredD20ThreeSkin'
import { D20_FACE_VALUES, D20_THREE_ORIENTATIONS } from '../../../app/components/world/authoredD20ThreeOrientation'

describe('ELDRA_DEFAULT_D20_SKIN', () => {
  it('declares a stable identity (id/name) a future skin list could key on', () => {
    expect(ELDRA_DEFAULT_D20_SKIN.id).toBe('eldra-default')
    expect(ELDRA_DEFAULT_D20_SKIN.name).toBe('Eldra Default')
  })

  it('declares material values within physically sane PBR ranges', () => {
    const { roughness, metalness, emissiveIntensity } = ELDRA_DEFAULT_D20_SKIN.material
    expect(roughness).toBeGreaterThanOrEqual(0)
    expect(roughness).toBeLessThanOrEqual(1)
    expect(metalness).toBeGreaterThanOrEqual(0)
    expect(metalness).toBeLessThanOrEqual(1)
    expect(emissiveIntensity ?? 0).toBeGreaterThanOrEqual(0)
    // "Keep it extremely subtle" (this phase's own FLOURISH section,
    // applied to the baseline glow too) -- the default skin's own glow
    // should read as a bare warmth, not a light source.
    expect(emissiveIntensity ?? 0).toBeLessThan(0.15)
  })

  it('declares every color as a valid CSS hex string', () => {
    const hex = /^#[0-9a-fA-F]{6}$/
    expect(ELDRA_DEFAULT_D20_SKIN.material.baseColor).toMatch(hex)
    expect(ELDRA_DEFAULT_D20_SKIN.material.accentColor).toMatch(hex)
    expect(ELDRA_DEFAULT_D20_SKIN.material.emissiveColor).toMatch(hex)
    expect(ELDRA_DEFAULT_D20_SKIN.numeral.color).toMatch(hex)
    expect(ELDRA_DEFAULT_D20_SKIN.numeral.outlineColor).toMatch(hex)
  })

  it('leaves every optional texture map slot unset -- the default skin is procedural, not image-based', () => {
    const { material } = ELDRA_DEFAULT_D20_SKIN
    expect(material.map).toBeUndefined()
    expect(material.normalMap).toBeUndefined()
    expect(material.roughnessMap).toBeUndefined()
    expect(material.metalnessMap).toBeUndefined()
    expect(material.emissiveMap).toBeUndefined()
  })

  it('is deeply frozen -- a caller cannot mutate the shared default and affect every future roll', () => {
    expect(Object.isFrozen(ELDRA_DEFAULT_D20_SKIN)).toBe(true)
    expect(Object.isFrozen(ELDRA_DEFAULT_D20_SKIN.material)).toBe(true)
    expect(Object.isFrozen(ELDRA_DEFAULT_D20_SKIN.numeral)).toBe(true)
  })
})

describe('resolveDiceSkin', () => {
  it('resolves deterministically to the same default skin across repeated calls with no argument', () => {
    expect(resolveDiceSkin()).toBe(ELDRA_DEFAULT_D20_SKIN)
    expect(resolveDiceSkin()).toBe(resolveDiceSkin())
  })

  it('resolves deterministically to the default skin for null/undefined', () => {
    expect(resolveDiceSkin(null)).toBe(ELDRA_DEFAULT_D20_SKIN)
    expect(resolveDiceSkin(undefined)).toBe(ELDRA_DEFAULT_D20_SKIN)
  })

  it('passes a supplied skin through unchanged, never silently substituting the default', () => {
    const customSkin: DiceSkin = {
      id: 'test-custom',
      name: 'Test Custom',
      material: { baseColor: '#123456', roughness: 0.5, metalness: 0.5 },
      numeral: { color: '#abcdef' }
    }
    expect(resolveDiceSkin(customSkin)).toBe(customSkin)
  })
})

describe('material configuration is orientation-blind (this phase\'s own ABSOLUTE INVARIANTS)', () => {
  it('the skin module has no notion of "face" or "orientation" -- it exposes no such field', () => {
    const keys = new Set([
      ...Object.keys(ELDRA_DEFAULT_D20_SKIN),
      ...Object.keys(ELDRA_DEFAULT_D20_SKIN.material),
      ...Object.keys(ELDRA_DEFAULT_D20_SKIN.numeral)
    ])
    for (const forbidden of ['face', 'quaternion', 'orientation', 'rotation', 'target']) {
      expect(keys.has(forbidden)).toBe(false)
    }
  })

  it('all 20 authoritative orientations remain intact regardless of which skin is active (skin and orientation are independent modules)', () => {
    // Not a redundant "assert the table against itself" check -- this
    // proves importing/using the skin module has no side effect on the
    // orientation module (they are genuinely independent files with no
    // shared mutable state), by re-checking the same invariant
    // authoredD20ThreeOrientation.test.ts already establishes in full,
    // AFTER this file's own skin resolution has run.
    resolveDiceSkin(ELDRA_DEFAULT_D20_SKIN)
    expect(Object.keys(D20_THREE_ORIENTATIONS).map(Number).sort((a, b) => a - b)).toEqual(
      [...D20_FACE_VALUES].sort((a, b) => a - b)
    )
  })
})
