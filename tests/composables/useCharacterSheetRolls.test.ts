// Unit tests for the Character Sheet's Roll Service integration
// (app/composables/useCharacterSheetRolls.ts). No Vue component
// mounting/rendering is exercised here -- this repo's Vitest setup
// (vitest.config.ts) has no DOM/Vue Test Utils integration, so these
// tests exercise the composable's own logic and reactive state directly,
// which is exactly what the sheet's template binds to for display.

import { describe, expect, it } from 'vitest'
import { useCharacterSheetRolls } from '../../app/composables/useCharacterSheetRolls'

describe('useCharacterSheetRolls -- successful requestRoll integration', () => {
  it('rollD20Check executes through the Roll Service and returns ok:true', () => {
    const { rollD20Check } = useCharacterSheetRolls()
    const event = rollD20Check(5, 'Strength Check', 'sheet-success-check')
    expect(event.ok).toBe(true)
    if (!event.ok) throw new Error('expected success')
    expect(event.result.rolls).toHaveLength(1)
    expect(event.result.rolls[0]).toBeGreaterThanOrEqual(1)
    expect(event.result.rolls[0]).toBeLessThanOrEqual(20)
    expect(event.result.dice?.modifier).toBe(5)
    expect(event.result.total).toBe(event.result.rolls[0]! + 5)
  })

  it('a negative bonus is included correctly', () => {
    const { rollD20Check } = useCharacterSheetRolls()
    const event = rollD20Check(-2, 'Stealth Check', 'sheet-negative-check')
    expect(event.ok).toBe(true)
    if (!event.ok) throw new Error('expected success')
    expect(event.result.dice?.modifier).toBe(-2)
    expect(event.result.total).toBe(event.result.rolls[0]! - 2)
  })
})

describe('useCharacterSheetRolls -- RollResult display', () => {
  it('lastRollEvent and lastRollLabel reactively reflect the most recent roll (what the sheet template binds to)', () => {
    const { lastRollEvent, lastRollLabel, rollD20Check } = useCharacterSheetRolls()
    expect(lastRollEvent.value).toBeNull()
    expect(lastRollLabel.value).toBe('')

    const event = rollD20Check(3, 'Wisdom Save', 'sheet-display-check')

    expect(lastRollEvent.value).toEqual(event)
    expect(lastRollLabel.value).toBe('Wisdom Save')
  })
})

describe('useCharacterSheetRolls -- RollEvent failure handling', () => {
  it('a non-finite bonus produces ok:false with a clear message, never swallowed', () => {
    const { lastRollEvent, rollD20Check } = useCharacterSheetRolls()
    const event = rollD20Check(Number.NaN, 'Broken Check')
    expect(event.ok).toBe(false)
    if (event.ok) throw new Error('expected failure')
    expect(event.error.message).toContain('Broken Check')
    expect(event.error.message.length).toBeGreaterThan(0)
    // The failure is visible in the same reactive state a success would
    // populate -- the template has no separate "swallowed error" path.
    expect(lastRollEvent.value).toEqual(event)
  })
})

describe('useCharacterSheetRolls -- repeated rolls', () => {
  it('calling rollD20Check multiple times updates state each time, not just on the first call', () => {
    const { lastRollEvent, lastRollLabel, rollD20Check } = useCharacterSheetRolls()

    const first = rollD20Check(1, 'Perception Check')
    expect(lastRollEvent.value).toEqual(first)
    expect(lastRollLabel.value).toBe('Perception Check')

    const second = rollD20Check(4, 'Athletics Check')
    expect(lastRollEvent.value).toEqual(second)
    expect(lastRollLabel.value).toBe('Athletics Check')
    expect(lastRollEvent.value).not.toEqual(first)
  })
})

describe('useCharacterSheetRolls -- deterministic repeated results with identical seed', () => {
  it('the same seed override produces byte-identical RollEvents across repeated calls', () => {
    const { rollD20Check } = useCharacterSheetRolls()
    const first = rollD20Check(2, 'Insight Check', 'deterministic-sheet-seed')
    const second = rollD20Check(2, 'Insight Check', 'deterministic-sheet-seed')
    expect(first).toEqual(second)
  })

  it('omitting the seed override produces a fresh seed (and very likely a different roll) each call', () => {
    const { rollD20Check } = useCharacterSheetRolls()
    const first = rollD20Check(2, 'Insight Check')
    const second = rollD20Check(2, 'Insight Check')
    expect(first.eventId).not.toBe(second.eventId)
  })
})
