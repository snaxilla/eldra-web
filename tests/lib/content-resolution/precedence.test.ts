import { describe, expect, it } from 'vitest'
import { comparePrecedence, selectWinner, type PrecedenceCandidate } from '../../../app/lib/content-resolution/precedence'

function candidate(packageId: string, overrides: Partial<PrecedenceCandidate['binding']> = {}): PrecedenceCandidate {
  return { packageId, binding: { bindingMode: 'pinned', priority: null, createdAt: null, ...overrides } }
}

describe('comparePrecedence', () => {
  it('rank 2: a workspace binding outranks a pinned binding regardless of priority/recency', () => {
    const workspace = candidate('workspace:w1', { bindingMode: 'workspace', priority: 99, createdAt: '2020-01-01T00:00:00Z' })
    const pinned = candidate('eldra.solaris.xphb', { bindingMode: 'pinned', priority: 1, createdAt: '2026-01-01T00:00:00Z' })
    expect(comparePrecedence(workspace, pinned)).toBeLessThan(0)
  })

  it('rank 3: lower explicit priority wins (1 beats 2)', () => {
    const higher = candidate('a', { priority: 1 })
    const lower = candidate('b', { priority: 2 })
    expect(comparePrecedence(higher, lower)).toBeLessThan(0)
  })

  it('rank 3: null priority sorts last', () => {
    const withPriority = candidate('a', { priority: 5 })
    const noPriority = candidate('b', { priority: null })
    expect(comparePrecedence(withPriority, noPriority)).toBeLessThan(0)
  })

  it('rank 4: more recently bound wins when priorities tie', () => {
    const older = candidate('a', { createdAt: '2020-01-01T00:00:00Z' })
    const newer = candidate('b', { createdAt: '2026-01-01T00:00:00Z' })
    expect(comparePrecedence(newer, older)).toBeLessThan(0)
  })

  it('rank 5: packageId ascending is the final tiebreak', () => {
    const a = candidate('eldra.aaa')
    const b = candidate('eldra.bbb')
    expect(comparePrecedence(a, b)).toBeLessThan(0)
    expect(comparePrecedence(b, a)).toBeGreaterThan(0)
  })

  it('is a total order: no two DISTINCT bindings ever compare equal', () => {
    const candidates = [
      candidate('eldra.aaa'),
      candidate('eldra.bbb', { priority: 1 }),
      candidate('eldra.ccc', { createdAt: '2025-06-01T00:00:00Z' }),
      candidate('workspace:w1', { bindingMode: 'workspace' })
    ]
    for (let i = 0; i < candidates.length; i++) {
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue
        expect(comparePrecedence(candidates[i]!, candidates[j]!)).not.toBe(0)
      }
    }
  })

  it('is antisymmetric: comparePrecedence(a,b) and comparePrecedence(b,a) have opposite signs', () => {
    const a = candidate('eldra.aaa', { priority: 2 })
    const b = candidate('eldra.bbb', { priority: 1 })
    expect(Math.sign(comparePrecedence(a, b))).toBe(-Math.sign(comparePrecedence(b, a)))
  })
})

describe('selectWinner', () => {
  it('returns the single candidate as the winner for a group of one', () => {
    const only = candidate('eldra.only')
    expect(selectWinner([only])).toEqual({ winner: only, shadowed: [] })
  })

  it('splits a group into the precedence winner and every other member as shadowed', () => {
    const workspace = candidate('workspace:w1', { bindingMode: 'workspace' })
    const pinned = candidate('eldra.solaris.xphb')
    const { winner, shadowed } = selectWinner([pinned, workspace])
    expect(winner).toBe(workspace)
    expect(shadowed).toEqual([pinned])
  })

  it('throws on an empty group rather than returning an undefined winner', () => {
    expect(() => selectWinner([])).toThrow()
  })
})
