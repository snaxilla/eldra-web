// Unit tests for app/utils/diceBoxRollSummary.ts -- the pure logic behind
// EldraDiceBox's RollEvent-consuming `rollResult` method. No Vue/DOM
// mounting is exercised here (this repo's Vitest setup has no Vue SFC
// support); these tests cover exactly the transformation `rollResult`
// delegates to, which is the part responsible for "no duplicate
// randomness generation" and "the RollEvent must remain authoritative".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summarizeRollEvent } from '../../app/utils/diceBoxRollSummary'

function rollResult(overrides: Record<string, any> = {}) {
  return {
    rollSpecId: 'roll:test',
    seed: 'fixed-seed',
    successRuleKind: 'none',
    manual: false,
    dice: { count: 1, faces: 20, modifier: 5 },
    rolls: [14],
    rerolls: [],
    kept: [14],
    keptIndices: [0],
    total: 19,
    ...overrides
  }
}

describe('summarizeRollEvent -- RollEvent consumption', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('every displayed number is sourced from the RollResult, not computed independently', () => {
    const summary = summarizeRollEvent('event-1', 'Strength Check', rollResult())
    expect(summary).toEqual({
      id: 'event-1',
      label: 'Strength Check',
      kind: 'Strength Check',
      notation: '1d20+5',
      diceNotation: '1d20',
      total: 19,
      diceTotal: 14,
      diceValues: [14],
      modifier: 5,
      criticalOutcome: '',
      raw: rollResult(),
      rolledAt: '2026-01-01T00:00:00.000Z'
    })
  })

  it('never fabricates a total when RollResult.total is absent (manual roll)', () => {
    const summary = summarizeRollEvent('event-2', 'GM Call', {
      rollSpecId: 'roll:test',
      seed: 'fixed-seed',
      successRuleKind: 'manual',
      manual: true,
      rolls: [],
      rerolls: [],
      kept: [],
      keptIndices: []
    })
    expect(summary.total).toBeNull()
    expect(summary.diceNotation).toBe('')
    expect(summary.notation).toBe('manual')
    expect(summary.diceValues).toEqual([])
  })
})

describe('summarizeRollEvent -- deterministic rendering inputs', () => {
  it('the same RollResult always produces the same summary (minus the display timestamp)', () => {
    const result = rollResult({ dice: { count: 2, faces: 6, modifier: -1 }, rolls: [3, 5], kept: [3, 5], total: 7 })
    const first = summarizeRollEvent('event-a', 'Damage', result)
    const second = summarizeRollEvent('event-a', 'Damage', result)
    const { rolledAt: rolledAtFirst, ...restFirst } = first
    const { rolledAt: rolledAtSecond, ...restSecond } = second
    expect(restFirst).toEqual(restSecond)
  })
})

describe('summarizeRollEvent -- repeated identical RollEvents', () => {
  it('calling it repeatedly with the same event id and result never drifts', () => {
    const result = rollResult()
    const summaries = Array.from({ length: 5 }, () => summarizeRollEvent('event-repeat', 'Check', result))
    for (const summary of summaries) {
      expect(summary.total).toBe(19)
      expect(summary.diceValues).toEqual([14])
      expect(summary.modifier).toBe(5)
    }
  })
})

describe('summarizeRollEvent -- existing renderer compatibility', () => {
  it('produces the exact field shape EldraDiceBox\'s latestRoll state already expects', () => {
    const summary = summarizeRollEvent('event-3', 'Wisdom Save', rollResult())
    expect(Object.keys(summary).sort()).toEqual(
      ['criticalOutcome', 'diceNotation', 'diceTotal', 'diceValues', 'id', 'kind', 'label', 'modifier', 'notation', 'raw', 'rolledAt', 'total'].sort()
    )
  })

  it('detects a natural 20 on a single d20 roll for the existing critical-success banner', () => {
    const summary = summarizeRollEvent('event-4', 'Attack', rollResult({ dice: { count: 1, faces: 20, modifier: 0 }, rolls: [20], kept: [20], total: 20 }))
    expect(summary.criticalOutcome).toBe('nat20')
  })

  it('detects a natural 1 on a single d20 roll for the existing critical-failure banner', () => {
    const summary = summarizeRollEvent('event-5', 'Attack', rollResult({ dice: { count: 1, faces: 20, modifier: 0 }, rolls: [1], kept: [1], total: 1 }))
    expect(summary.criticalOutcome).toBe('nat1')
  })

  it('does not report a critical outcome for non-d20 dice', () => {
    const summary = summarizeRollEvent('event-6', 'Damage', rollResult({ dice: { count: 1, faces: 6, modifier: 0 }, rolls: [1], kept: [1], total: 1 }))
    expect(summary.criticalOutcome).toBe('')
  })
})

describe('summarizeRollEvent -- no duplicate randomness generation', () => {
  it('is a pure function: the same input always yields the same output, no internal randomness', () => {
    const result = rollResult()
    const outputs = new Set(
      Array.from({ length: 20 }, () => {
        const { rolledAt, ...rest } = summarizeRollEvent('stable-id', 'Check', result)
        return JSON.stringify(rest)
      })
    )
    expect(outputs.size).toBe(1)
  })

  it('never invents dice values beyond what RollResult.rolls provided', () => {
    const result = rollResult({ dice: { count: 3, faces: 6, modifier: 2 }, rolls: [2, 4, 6], kept: [2, 4, 6], total: 14 })
    const summary = summarizeRollEvent('event-7', 'Pool', result)
    expect(summary.diceValues).toEqual([2, 4, 6])
    expect(summary.diceValues).toHaveLength(3)
  })
})
