// Tests for app/components/world/authoredD100Percentile.ts. Roll System
// Phase 4C. Proves the conventional percentile-dice decomposition is
// applied consistently, and explicitly that NO second random value is
// ever generated -- this module is a pure function of the one
// authoritative value.

import { describe, expect, it } from 'vitest'
import { onesDieLabel, percentileDigitsForD100, tensDieLabel } from '../../../app/components/world/authoredD100Percentile'

describe('percentileDigitsForD100 -- explicit special cases', () => {
  it('1 -> tens 0 ("00"), ones 1', () => {
    expect(percentileDigitsForD100(1)).toEqual({ tens: 0, ones: 1 })
  })
  it('10 -> tens 10, ones 0', () => {
    expect(percentileDigitsForD100(10)).toEqual({ tens: 10, ones: 0 })
  })
  it('20 -> tens 20, ones 0', () => {
    expect(percentileDigitsForD100(20)).toEqual({ tens: 20, ones: 0 })
  })
  it('90 -> tens 90, ones 0', () => {
    expect(percentileDigitsForD100(90)).toEqual({ tens: 90, ones: 0 })
  })
  it('99 -> tens 90, ones 9', () => {
    expect(percentileDigitsForD100(99)).toEqual({ tens: 90, ones: 9 })
  })
  it('100 -> tens 0 ("00"), ones 0 -- the conventional "00+0 means 100" reading', () => {
    expect(percentileDigitsForD100(100)).toEqual({ tens: 0, ones: 0 })
  })
  it('73 -> tens 70, ones 3 (worked example from the task itself)', () => {
    expect(percentileDigitsForD100(73)).toEqual({ tens: 70, ones: 3 })
  })
  it('42 -> tens 40, ones 2 (worked example from the task itself)', () => {
    expect(percentileDigitsForD100(42)).toEqual({ tens: 40, ones: 2 })
  })
})

describe('percentileDigitsForD100 -- exhaustive 1-100 domain', () => {
  it('every value 1-100 decomposes to a tens digit in {0,10,...,90} and a ones digit in 0-9, recombining to the original value (except the 100/0 special reading)', () => {
    for (let v = 1; v <= 100; v++) {
      const { tens, ones } = percentileDigitsForD100(v)
      expect([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]).toContain(tens)
      expect(ones).toBeGreaterThanOrEqual(0)
      expect(ones).toBeLessThanOrEqual(9)
      const recombined = tens + ones
      // Every value EXCEPT 100 recombines directly; 100 is the one
      // conventional exception (tens=0,ones=0 reads as 100, not 0).
      if (v === 100) {
        expect(recombined).toBe(0)
      } else {
        expect(recombined).toBe(v)
      }
    }
  })

  it('rejects values outside 1-100', () => {
    expect(() => percentileDigitsForD100(0)).toThrow()
    expect(() => percentileDigitsForD100(101)).toThrow()
    expect(() => percentileDigitsForD100(1.5)).toThrow()
  })

  it('is a pure function -- calling it twice with the same value never produces different results (no hidden randomness, no second roll)', () => {
    for (const v of [1, 17, 50, 73, 100]) {
      expect(percentileDigitsForD100(v)).toEqual(percentileDigitsForD100(v))
    }
  })
})

describe('label formatting', () => {
  it('tensDieLabel prints "00" for zero, and the bare number otherwise', () => {
    expect(tensDieLabel(0)).toBe('00')
    expect(tensDieLabel(70)).toBe('70')
  })
  it('onesDieLabel prints the bare digit 0-9', () => {
    expect(onesDieLabel(0)).toBe('0')
    expect(onesDieLabel(9)).toBe('9')
  })
})
