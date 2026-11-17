// Unit tests for app/lib/item-mechanics/dnd5e-editing.ts -- the Items
// Mechanics Editing (release one) pure merge/validation layer. Fixtures
// reuse the SAME real XPHB weapons dnd5e.test.ts already pins, so a
// mechanics override's effect is verified against real corpus shape, not
// an idealized one.

import { describe, expect, it } from 'vitest'
import {
  applyDnd5eItemMechanicsOverrides,
  buildPropertyOverrideArray,
  effectiveAttunementValue,
  effectiveDamageValue,
  isItemMechanicsOverridePath,
  isSupportedDamageDiceExpression,
  propertyRows,
  validateItemMechanicsOverrideValue
} from '../../../app/lib/item-mechanics/dnd5e-editing'
import { resolveDnd5eItemAttunementRequired, resolveDnd5eItemMechanics } from '../../../app/lib/item-mechanics/dnd5e'
import type { FieldOverride } from '../../../app/lib/content-authoring/overrides'

const SHORTSWORD = {
  name: 'Shortsword', source: 'XPHB', type: 'M|XPHB', weaponCategory: 'martial',
  property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'], dmg1: '1d6', dmgType: 'P', weapon: true, rarity: 'none', weight: 1
}

function override(path: string, value: unknown): FieldOverride {
  return { channel: 'mechanics', path, value, authoredBy: 'acct-1', authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }
}

describe('isItemMechanicsOverridePath', () => {
  it('accepts exactly the five approved logical fields', () => {
    expect(isItemMechanicsOverridePath('rarity')).toBe(true)
    expect(isItemMechanicsOverridePath('weight')).toBe(true)
    expect(isItemMechanicsOverridePath('attunement')).toBe(true)
    expect(isItemMechanicsOverridePath('damage')).toBe(true)
    expect(isItemMechanicsOverridePath('property')).toBe(true)
  })

  it('rejects a raw 5etools key (not a logical field) and excluded fields', () => {
    expect(isItemMechanicsOverridePath('reqAttune')).toBe(false)
    expect(isItemMechanicsOverridePath('dmg1')).toBe(false)
    expect(isItemMechanicsOverridePath('type')).toBe(false)
    expect(isItemMechanicsOverridePath('weaponCategory')).toBe(false)
    expect(isItemMechanicsOverridePath('mastery')).toBe(false)
    expect(isItemMechanicsOverridePath('ac')).toBe(false)
    expect(isItemMechanicsOverridePath('value')).toBe(false)
    expect(isItemMechanicsOverridePath('__proto__')).toBe(false)
  })
})

describe('isSupportedDamageDiceExpression', () => {
  it('accepts bare NdM, matching the real roll parser exactly', () => {
    expect(isSupportedDamageDiceExpression('1d8')).toBe(true)
    expect(isSupportedDamageDiceExpression('2d6')).toBe(true)
  })

  it('rejects a modifier-bearing expression the real roll parser cannot accept', () => {
    expect(isSupportedDamageDiceExpression('1d8+2')).toBe(false)
  })

  it('rejects zero/negative counts or faces', () => {
    expect(isSupportedDamageDiceExpression('0d6')).toBe(false)
    expect(isSupportedDamageDiceExpression('1d0')).toBe(false)
  })

  it('rejects an absurd value beyond the sanity bound', () => {
    expect(isSupportedDamageDiceExpression('9999d9999')).toBe(false)
  })
})

describe('validateItemMechanicsOverrideValue', () => {
  it('rarity: non-empty string required', () => {
    expect(validateItemMechanicsOverrideValue('rarity', 'rare')).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('rarity', '')).toMatchObject({ ok: false })
    expect(validateItemMechanicsOverrideValue('rarity', 5)).toMatchObject({ ok: false })
  })

  it('weight: finite number >= 0, zero is valid', () => {
    expect(validateItemMechanicsOverrideValue('weight', 0)).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('weight', 3.5)).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('weight', -1)).toMatchObject({ ok: false })
    expect(validateItemMechanicsOverrideValue('weight', Number.POSITIVE_INFINITY)).toMatchObject({ ok: false })
    expect(validateItemMechanicsOverrideValue('weight', '3')).toMatchObject({ ok: false })
  })

  it('property: must be an array, an empty array is valid', () => {
    expect(validateItemMechanicsOverrideValue('property', [])).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('property', ['F'])).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('property', 'F')).toMatchObject({ ok: false })
  })

  it('attunement: required boolean + text string-or-null, false is a valid "required"', () => {
    expect(validateItemMechanicsOverrideValue('attunement', { required: false, text: null })).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('attunement', { required: true, text: 'by a Spellcaster' })).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('attunement', { required: 'yes', text: null })).toMatchObject({ ok: false })
    expect(validateItemMechanicsOverrideValue('attunement', { required: true, text: 5 })).toMatchObject({ ok: false })
    expect(validateItemMechanicsOverrideValue('attunement', null)).toMatchObject({ ok: false })
  })

  it('damage: dice must be a supported expression, damageType must be B/P/S/null', () => {
    expect(validateItemMechanicsOverrideValue('damage', { dice: '1d8', damageType: 'S' })).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('damage', { dice: '1d8', damageType: null })).toEqual({ ok: true })
    expect(validateItemMechanicsOverrideValue('damage', { dice: '1d8+2', damageType: 'S' })).toMatchObject({ ok: false })
    expect(validateItemMechanicsOverrideValue('damage', { dice: '1d8', damageType: 'FIRE' })).toMatchObject({ ok: false })
  })

  it('an unrecognized path is rejected', () => {
    expect(validateItemMechanicsOverrideValue('reqAttune', true)).toMatchObject({ ok: false })
  })
})

describe('applyDnd5eItemMechanicsOverrides -- pure merge', () => {
  it('returns rawData UNCHANGED (same reference) when there are no overrides', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [])
    expect(result).toBe(SHORTSWORD)
  })

  it('never mutates rawData, and preserves every untouched field', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [override('rarity', 'rare')]) as Record<string, unknown>
    expect(SHORTSWORD.rarity).toBe('none') // original untouched
    expect(result).not.toBe(SHORTSWORD)
    expect(result.rarity).toBe('rare')
    // Every other field preserved verbatim, including ones this release
    // never edits (mastery, weaponCategory, source, name).
    expect(result.mastery).toEqual(SHORTSWORD.mastery)
    expect(result.weaponCategory).toBe('martial')
    expect(result.name).toBe('Shortsword')
    expect(result.dmg1).toBe('1d6')
  })

  it('respects an explicit weight of 0 (falsy, not treated as absent)', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [override('weight', 0)]) as Record<string, unknown>
    expect(result.weight).toBe(0)
  })

  it('respects an explicit empty property array (clearing all properties, not ignored)', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [override('property', [])]) as Record<string, unknown>
    expect(result.property).toEqual([])
  })

  it('damage: writes dmg1/dmgType together; a null damageType removes dmgType rather than storing null', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [override('damage', { dice: '2d6', damageType: null })]) as Record<string, unknown>
    expect(result.dmg1).toBe('2d6')
    expect('dmgType' in result).toBe(false)
  })

  it('attunement: enabling with text sets reqAttune to the text and clears legacy attunement', () => {
    const base = { ...SHORTSWORD, attunement: true } // a record that ALSO carries the legacy boolean
    const result = applyDnd5eItemMechanicsOverrides(base, [override('attunement', { required: true, text: 'by a Spellcaster' })]) as Record<string, unknown>
    expect(result.reqAttune).toBe('by a Spellcaster')
    expect(result.attunement).toBe(false)
  })

  it('attunement: enabling with no text sets reqAttune to true (not an empty string)', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [override('attunement', { required: true, text: null })]) as Record<string, unknown>
    expect(result.reqAttune).toBe(true)
  })

  it('attunement: disabling clears BOTH reqAttune and the legacy attunement field, even when the base record has attunement truthy -- no OR fallback re-enabling', () => {
    const base = { ...SHORTSWORD, reqAttune: 'by a Spellcaster', attunement: true }
    const result = applyDnd5eItemMechanicsOverrides(base, [override('attunement', { required: false, text: null })]) as Record<string, unknown>
    expect(result.reqAttune).toBe(false)
    expect(result.attunement).toBe(false)
    // Prove the real resolver agrees -- this is the actual guarantee that matters.
    expect(resolveDnd5eItemAttunementRequired(result)).toBe(false)
  })

  it('a resolved weapon still resolves correctly after an unrelated mechanics override (rarity) is applied', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [override('rarity', 'rare')])
    expect(resolveDnd5eItemMechanics(result)).toMatchObject({ kind: 'weapon', weaponCategory: 'martial' })
  })

  it('an edited damage dice is reflected for the real resolveWeaponAction-style dmg1 read', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [override('damage', { dice: '3d8', damageType: 'S' })]) as Record<string, unknown>
    expect(result.dmg1).toBe('3d8')
    expect(result.dmgType).toBe('S')
  })

  it('multiple overrides in the same call all apply, each independently', () => {
    const result = applyDnd5eItemMechanicsOverrides(SHORTSWORD, [
      override('rarity', 'rare'),
      override('weight', 2),
      override('property', ['F'])
    ]) as Record<string, unknown>
    expect(result.rarity).toBe('rare')
    expect(result.weight).toBe(2)
    expect(result.property).toEqual(['F'])
  })

  it('non-object rawData is returned unchanged', () => {
    expect(applyDnd5eItemMechanicsOverrides(null, [override('rarity', 'rare')])).toBeNull()
    expect(applyDnd5eItemMechanicsOverrides('x', [override('rarity', 'rare')])).toBe('x')
  })
})

describe('propertyRows / buildPropertyOverrideArray -- lossless weapon-property editing', () => {
  it('bare-string known codes report "on", absent known codes report "off"', () => {
    const rows = propertyRows(['F|XPHB', 'L|XPHB'])
    expect(rows.find((r) => r.property === 'finesse')?.state).toBe('on')
    expect(rows.find((r) => r.property === 'light')?.state).toBe('on')
    expect(rows.find((r) => r.property === 'versatile')?.state).toBe('off')
  })

  it('a note-bearing object entry (Lance\'s real shape) reports "locked", never "on"/toggle-able', () => {
    const rows = propertyRows([{ uid: '2H|XPHB', note: 'unless mounted' }])
    const row = rows.find((r) => r.property === 'two-handed')
    expect(row?.state).toBe('locked')
    expect(row?.note).toBe('unless mounted')
  })

  it('an unrecognized code (not one of the nine editable ones) produces no row at all', () => {
    const rows = propertyRows(['S|XPHB']) // Special -- deliberately not modeled, per types.ts's own header
    expect(rows.some((r) => r.code === 'S')).toBe(false)
    expect(rows).toHaveLength(9) // still exactly the nine editable codes, unaffected
  })

  it('a duplicate code collapses to one row via .find (first match), never double-counted', () => {
    const rows = propertyRows(['F|XPHB', 'F|XPHB'])
    expect(rows.filter((r) => r.property === 'finesse')).toHaveLength(1)
  })

  it('buildPropertyOverrideArray preserves an unrecognized code entry verbatim', () => {
    const raw = ['S|XPHB', 'F|XPHB']
    const result = buildPropertyOverrideArray(raw, { finesse: true })
    expect(result).toContain('S|XPHB')
  })

  it('buildPropertyOverrideArray preserves a note-bearing entry verbatim, even when its checkbox state is absent from `checked`', () => {
    const raw = [{ uid: '2H|XPHB', note: 'unless mounted' }, 'F|XPHB']
    const result = buildPropertyOverrideArray(raw, { finesse: true }) // no 'two-handed' key at all
    expect(result).toContainEqual({ uid: '2H|XPHB', note: 'unless mounted' })
  })

  it('unchecking a previously-set editable property removes it without touching other entries', () => {
    const raw = ['F|XPHB', 'L|XPHB']
    const result = buildPropertyOverrideArray(raw, { finesse: false, light: true })
    expect(result).toEqual(['L'])
  })

  it('checking a new editable property adds a bare code, appended after preserved entries', () => {
    const raw = [{ uid: '2H|XPHB', note: 'unless mounted' }]
    const result = buildPropertyOverrideArray(raw, { versatile: true })
    expect(result).toEqual([{ uid: '2H|XPHB', note: 'unless mounted' }, 'V'])
  })

  it('an all-off checked map with no prior properties produces an empty array', () => {
    expect(buildPropertyOverrideArray([], {})).toEqual([])
  })
})

describe('effectiveAttunementValue / effectiveDamageValue -- draft-seeding readers', () => {
  it('attunement: reads required=true and the restriction text from reqAttune', () => {
    expect(effectiveAttunementValue({ reqAttune: 'by a Spellcaster' })).toEqual({ required: true, text: 'by a Spellcaster' })
  })

  it('attunement: a bare `true` has no text', () => {
    expect(effectiveAttunementValue({ reqAttune: true })).toEqual({ required: true, text: null })
  })

  it('attunement: legacy attunement alone still reports required=true (OR precedence preserved for reading)', () => {
    expect(effectiveAttunementValue({ attunement: true })).toEqual({ required: true, text: null })
  })

  it('attunement: neither field set reports not required', () => {
    expect(effectiveAttunementValue({})).toEqual({ required: false, text: null })
  })

  it('damage: reads dmg1/dmgType when present', () => {
    expect(effectiveDamageValue({ dmg1: '1d6', dmgType: 'P' })).toEqual({ dice: '1d6', damageType: 'P' })
  })

  it('damage: null when the item has no dmg1 (not a weapon)', () => {
    expect(effectiveDamageValue({})).toBeNull()
  })
})
