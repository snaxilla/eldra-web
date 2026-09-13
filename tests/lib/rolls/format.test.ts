// Unit tests for app/lib/rolls/format.ts -- Eldra Roll System Phase 2C
// (the Roll Tray, .github/docs/architecture/eldra-roll-system.md §9).
//
// extractServerErrorMessage/formatRollDieGroup/formatRollModifiers moved
// here from app/components/admin/health/rollSandbox.ts (which re-exports
// them unchanged) -- their behavior is already proven by
// tests/components/admin/health/rollSandbox.test.ts, so this file only
// covers the one function that's actually new: formatRelativeRollTime.

import { describe, expect, it } from 'vitest'
import { formatRelativeRollTime } from '../../../app/lib/rolls/format'

describe('formatRelativeRollTime', () => {
  const now = new Date('2026-01-01T12:00:00.000Z')

  it('reads "just now" for anything under a minute old', () => {
    expect(formatRelativeRollTime('2026-01-01T11:59:59.500Z', now)).toBe('just now')
    expect(formatRelativeRollTime('2026-01-01T12:00:00.000Z', now)).toBe('just now')
  })

  it('reads in whole minutes under an hour', () => {
    expect(formatRelativeRollTime('2026-01-01T11:55:00.000Z', now)).toBe('5m ago')
    expect(formatRelativeRollTime('2026-01-01T11:01:00.000Z', now)).toBe('59m ago')
  })

  it('reads in whole hours under a day', () => {
    expect(formatRelativeRollTime('2026-01-01T09:00:00.000Z', now)).toBe('3h ago')
    expect(formatRelativeRollTime('2026-01-01T00:00:01.000Z', now)).toBe('11h ago')
  })

  it('reads in whole days beyond that', () => {
    expect(formatRelativeRollTime('2025-12-30T12:00:00.000Z', now)).toBe('2d ago')
  })

  it('returns an empty string for an unparseable timestamp rather than "NaNm ago"', () => {
    expect(formatRelativeRollTime('not-a-date', now)).toBe('')
  })
})
