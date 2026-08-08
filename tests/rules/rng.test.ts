// Unit tests for the Roll Engine's seeded RNG (app/lib/rules/rng.ts).

import { describe, expect, it } from 'vitest'
import { createSeededRng } from '../../app/lib/rules/rng'

describe('createSeededRng', () => {
  it('the same seed produces the exact same sequence of next() values', () => {
    const a = createSeededRng('seed-alpha')
    const b = createSeededRng('seed-alpha')
    const sequenceA = Array.from({ length: 20 }, () => a.next())
    const sequenceB = Array.from({ length: 20 }, () => b.next())
    expect(sequenceA).toEqual(sequenceB)
  })

  it('the same seed produces the exact same sequence of nextInt() values', () => {
    const a = createSeededRng('seed-beta')
    const b = createSeededRng('seed-beta')
    const sequenceA = Array.from({ length: 20 }, () => a.nextInt(20))
    const sequenceB = Array.from({ length: 20 }, () => b.nextInt(20))
    expect(sequenceA).toEqual(sequenceB)
  })

  it('different seeds produce different sequences', () => {
    const a = createSeededRng('seed-one')
    const b = createSeededRng('seed-two')
    const sequenceA = Array.from({ length: 20 }, () => a.nextInt(1000))
    const sequenceB = Array.from({ length: 20 }, () => b.nextInt(1000))
    expect(sequenceA).not.toEqual(sequenceB)
  })

  it('next() always stays in [0, 1)', () => {
    const rng = createSeededRng('range-check')
    for (let i = 0; i < 500; i++) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('nextInt(faces) always stays in [0, faces)', () => {
    const rng = createSeededRng('range-check-int')
    for (let i = 0; i < 500; i++) {
      const value = rng.nextInt(6)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(6)
    }
  })

  it('a stream advances across repeated calls rather than repeating the first value', () => {
    const rng = createSeededRng('advance-check')
    const first = rng.next()
    const second = rng.next()
    expect(first).not.toBe(second)
  })
})
