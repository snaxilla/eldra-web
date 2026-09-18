// Unit tests for app/lib/content-actions/damage-presentation.ts --
// Character Sheet Body Phase 1A.1 Browser Polish's resolved-damage
// formatter. Every case is pure structured-input/text-output: no fixture
// ever supplies a prose string, matching this module's own "no prose
// parsing, ever" rule.

import { describe, expect, it } from 'vitest'
import { resolveActionDamage, formatActionDamage } from '../../../app/lib/content-actions/damage-presentation'

describe('resolveActionDamage', () => {
  it('resolves a flat (Unarmed Strike-shaped) action with a positive modifier', () => {
    const resolved = resolveActionDamage({ damageFlatBase: 1, damageAbilityModifier: 1, damageType: 'bludgeoning' })
    expect(resolved).toEqual({ kind: 'flat', total: 2, type: 'bludgeoning' })
  })

  it('resolves a flat action with a zero modifier', () => {
    const resolved = resolveActionDamage({ damageFlatBase: 1, damageAbilityModifier: 0, damageType: 'bludgeoning' })
    expect(resolved).toEqual({ kind: 'flat', total: 1, type: 'bludgeoning' })
  })

  it('resolves a flat action with a negative modifier', () => {
    const resolved = resolveActionDamage({ damageFlatBase: 1, damageAbilityModifier: -1, damageType: 'bludgeoning' })
    expect(resolved).toEqual({ kind: 'flat', total: 0, type: 'bludgeoning' })
  })

  it('resolves a dice (weapon-shaped) action with a positive modifier', () => {
    const resolved = resolveActionDamage({ damageRoll: { count: 1, faces: 6 }, damageAbilityModifier: 2, damageType: 'piercing' })
    expect(resolved).toEqual({ kind: 'dice', count: 1, faces: 6, modifier: 2, type: 'piercing' })
  })

  it('resolves a dice action with a zero modifier', () => {
    const resolved = resolveActionDamage({ damageRoll: { count: 1, faces: 6 }, damageAbilityModifier: 0, damageType: 'piercing' })
    expect(resolved).toEqual({ kind: 'dice', count: 1, faces: 6, modifier: 0, type: 'piercing' })
  })

  it('resolves a dice action with a negative modifier', () => {
    const resolved = resolveActionDamage({ damageRoll: { count: 1, faces: 6 }, damageAbilityModifier: -1, damageType: 'piercing' })
    expect(resolved).toEqual({ kind: 'dice', count: 1, faces: 6, modifier: -1, type: 'piercing' })
  })

  it('resolves multi-die damage', () => {
    const resolved = resolveActionDamage({ damageRoll: { count: 2, faces: 6 }, damageAbilityModifier: 3, damageType: 'slashing' })
    expect(resolved).toEqual({ kind: 'dice', count: 2, faces: 6, modifier: 3, type: 'slashing' })
  })

  it('prefers dice over a flat base when (unrealistically) both are present', () => {
    const resolved = resolveActionDamage({
      damageRoll: { count: 1, faces: 6 }, damageFlatBase: 1, damageAbilityModifier: 2, damageType: 'piercing'
    })
    expect(resolved?.kind).toBe('dice')
  })

  it('returns undefined for an action with neither dice nor a flat base (e.g. a spell with no damage)', () => {
    expect(resolveActionDamage({ damageAbilityModifier: 2, damageType: 'fire' })).toBeUndefined()
  })

  it('returns undefined -- never a fabricated modifier -- when the ability modifier is unavailable (dice)', () => {
    expect(resolveActionDamage({ damageRoll: { count: 1, faces: 6 }, damageType: 'piercing' })).toBeUndefined()
  })

  it('returns undefined -- never a fabricated modifier -- when the ability modifier is unavailable (flat)', () => {
    expect(resolveActionDamage({ damageFlatBase: 1, damageType: 'bludgeoning' })).toBeUndefined()
  })

  it('never reads a `damage` prose field even if one is present alongside it', () => {
    const withProse = { damage: '1d6 piercing', damageRoll: { count: 1, faces: 6 }, damageAbilityModifier: 2, damageType: 'piercing' }
    expect(resolveActionDamage(withProse)).toEqual({ kind: 'dice', count: 1, faces: 6, modifier: 2, type: 'piercing' })
  })
})

describe('formatActionDamage', () => {
  it('formats dice with a positive modifier', () => {
    expect(formatActionDamage({ kind: 'dice', count: 1, faces: 6, modifier: 2, type: 'piercing' })).toBe('1d6+2 piercing')
  })

  it('formats dice with a zero modifier -- no "+0"', () => {
    expect(formatActionDamage({ kind: 'dice', count: 1, faces: 6, modifier: 0, type: 'piercing' })).toBe('1d6 piercing')
  })

  it('formats dice with a negative modifier', () => {
    expect(formatActionDamage({ kind: 'dice', count: 1, faces: 6, modifier: -1, type: 'piercing' })).toBe('1d6-1 piercing')
  })

  it('formats multi-die damage', () => {
    expect(formatActionDamage({ kind: 'dice', count: 2, faces: 6, modifier: 3, type: 'slashing' })).toBe('2d6+3 slashing')
  })

  it('formats flat damage', () => {
    expect(formatActionDamage({ kind: 'flat', total: 2, type: 'bludgeoning' })).toBe('2 bludgeoning')
  })

  it('formats flat zero/negative totals as a plain number', () => {
    expect(formatActionDamage({ kind: 'flat', total: 0, type: 'bludgeoning' })).toBe('0 bludgeoning')
    expect(formatActionDamage({ kind: 'flat', total: -1, type: 'bludgeoning' })).toBe('-1 bludgeoning')
  })

  it('omits the trailing type when absent', () => {
    expect(formatActionDamage({ kind: 'dice', count: 1, faces: 6, modifier: 2 })).toBe('1d6+2')
    expect(formatActionDamage({ kind: 'flat', total: 2 })).toBe('2')
  })
})
