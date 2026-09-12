// Unit tests for the Developer Roll Sandbox's pure helpers
// (app/components/admin/health/rollSandbox.ts). Eldra Roll System
// Phase 2A. Mirrors projectHealth.test.ts's own precedent exactly: this
// repo has no component-rendering test harness, so this is the test
// coverage for the one piece of the Sandbox that isn't already exercised
// by tests/server/utils/roll-events.test.ts and the Phase 1 route tests
// (the actual roll/visibility/pagination behavior lives there, not here).

import { describe, expect, it } from 'vitest'
import {
  buildCustomRollRequestBody,
  extractServerErrorMessage,
  formatRollDieGroup,
  formatRollModifiers
} from '../../../../app/components/admin/health/rollSandbox'
import type { RollDieGroup } from '../../../../app/lib/rolls/types'

describe('buildCustomRollRequestBody', () => {
  it('always sends sourceType "custom" -- Phase 2A supports nothing else', () => {
    const body = buildCustomRollRequestBody({ expression: '1d20', visibility: 'private', label: '' })
    expect(body.sourceType).toBe('custom')
  })

  it('trims the expression and passes visibility through unchanged', () => {
    const body = buildCustomRollRequestBody({ expression: '  2d6+3  ', visibility: 'table', label: '' })
    expect(body.expression).toBe('2d6+3')
    expect(body.visibility).toBe('table')
  })

  it('omits label entirely when blank, rather than sending an empty string', () => {
    const body = buildCustomRollRequestBody({ expression: '1d20', visibility: 'private', label: '   ' })
    expect(body).not.toHaveProperty('label')
  })

  it('includes a trimmed label when one is given', () => {
    const body = buildCustomRollRequestBody({ expression: '1d20', visibility: 'private', label: '  Debug roll  ' })
    expect(body.label).toBe('Debug roll')
  })
})

describe('extractServerErrorMessage', () => {
  it('prefers error.data.statusMessage -- the shape a thrown H3 error takes through $fetch', () => {
    expect(extractServerErrorMessage({ data: { statusMessage: 'A roll may use at most 1000 dice' } })).toBe(
      'A roll may use at most 1000 dice'
    )
  })

  it('falls back through data.message, statusMessage, message, in that order', () => {
    expect(extractServerErrorMessage({ data: { message: 'from data.message' } })).toBe('from data.message')
    expect(extractServerErrorMessage({ statusMessage: 'from statusMessage' })).toBe('from statusMessage')
    expect(extractServerErrorMessage({ message: 'from message' })).toBe('from message')
  })

  it('never collapses to a generic string -- falls back to String(error) as a last resort', () => {
    expect(extractServerErrorMessage('a plain string error')).toBe('a plain string error')
  })
})

describe('formatRollDieGroup', () => {
  function group(overrides: Partial<RollDieGroup> = {}): RollDieGroup {
    return {
      sides: 20,
      sign: 1,
      results: [14],
      keptFlags: [true],
      kept: [14],
      advantageState: 'normal',
      multiplier: 1,
      total: 14,
      naturalHigh: false,
      naturalLow: false,
      ...overrides
    }
  }

  it('formats a simple single-die group', () => {
    expect(formatRollDieGroup(group(), 0)).toBe('d20 #1: [14] -> 14')
  })

  it('parenthesizes a dropped die rather than hiding it', () => {
    const g = group({
      sides: 20,
      results: [17, 4],
      keptFlags: [true, false],
      kept: [17],
      advantageState: 'advantage',
      total: 17
    })
    expect(formatRollDieGroup(g, 0)).toBe('d20 #1: [17, (4)] -> 17')
  })

  it('numbers groups from 1, using the index passed in', () => {
    expect(formatRollDieGroup(group({ sides: 6 }), 2)).toBe('d6 #3: [14] -> 14')
  })
})

describe('formatRollModifiers', () => {
  it('returns "(none)" for an empty modifiers array, never a blank string', () => {
    expect(formatRollModifiers({ modifiers: [] })).toBe('(none)')
  })

  it('signs each modifier independently, never collapsing them into one sum', () => {
    expect(formatRollModifiers({ modifiers: [1, -6] })).toBe('+1 -6')
  })

  it('signs a single positive modifier', () => {
    expect(formatRollModifiers({ modifiers: [5] })).toBe('+5')
  })
})
