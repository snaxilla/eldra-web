// Unit tests for app/lib/rolls/history.ts -- Eldra Roll System Phase 2D
// (realtime broadcast, .github/docs/architecture/eldra-roll-system.md
// §10). Covers this task's own "duplicate suppression" testing
// requirement directly, since the shared insertion function
// (useWorldRolls.ts's own POST-response and SSE-broadcast paths both call
// this) is where that behavior actually lives.

import { describe, expect, it } from 'vitest'
import { prependUniqueRoll } from '../../../app/lib/rolls/history'
import type { RollEventRecord } from '../../../app/lib/rolls/types'

function roll(overrides: Partial<RollEventRecord> = {}): RollEventRecord {
  return {
    id: 'roll-1',
    worldId: '5',
    encounterId: null,
    actorCharacterId: null,
    rollerUserId: 'account-1',
    rollerDisplayName: 'Ada Lovelace',
    label: 'Stealth Check',
    sourceType: 'skill',
    sourceKey: 'value:skill.stealth.bonus',
    sourceId: null,
    expression: '1d20',
    dice: [],
    modifier: 0,
    modifiers: [],
    total: 14,
    visibility: 'table',
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...overrides
  }
}

describe('prependUniqueRoll', () => {
  it('prepends a new roll onto an empty history', () => {
    const result = prependUniqueRoll([], roll())
    expect(result).toEqual([roll()])
  })

  it('prepends a new roll ahead of existing ones, never appending', () => {
    const existing = roll({ id: 'roll-0' })
    const incoming = roll({ id: 'roll-1' })

    const result = prependUniqueRoll([existing], incoming)

    expect(result.map((r) => r.id)).toEqual(['roll-1', 'roll-0'])
  })

  it('suppresses a duplicate by id -- the requester\'s own roll echoed back by its own broadcast', () => {
    const existing = roll({ id: 'roll-1', total: 14 })
    // A structurally different object (e.g. re-parsed from a different
    // JSON payload) but the SAME id must still be recognized as the same
    // roll, never inserted twice.
    const echoed = roll({ id: 'roll-1', total: 14 })

    const result = prependUniqueRoll([existing], echoed)

    expect(result).toHaveLength(1)
    expect(result[0]).toBe(existing)
  })

  it('returns the exact same array reference for a duplicate, never a needless copy', () => {
    const history = [roll({ id: 'roll-1' })]
    const result = prependUniqueRoll(history, roll({ id: 'roll-1' }))

    expect(result).toBe(history)
  })

  it('treats two different rolls with different ids as distinct, even with identical other fields', () => {
    const first = roll({ id: 'roll-1' })
    const second = roll({ id: 'roll-2' })

    const result = prependUniqueRoll([first], second)

    expect(result.map((r) => r.id)).toEqual(['roll-2', 'roll-1'])
  })
})
