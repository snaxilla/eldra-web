// Unit tests for app/components/world/worldDiceThreeRendererAdapter.ts --
// the real DiceRendererAdapter. Eldra Roll System Phase 3B (Renderer
// Replacement) (.github/docs/architecture/eldra-roll-system.md §11).
//
// No Vue SFC/DOM is exercised here (this repo's Vitest setup has no Vue
// component-rendering support) -- `box` is a plain `ref()` holding a
// hand-built stand-in for WorldDiceThreeRenderer.client.vue's own
// `defineExpose` shape, matching eldraDiceRendererAdapter.test.ts's own
// established boundary for this exact file's predecessor.

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  buildPredeterminedNotation,
  countDice,
  createWorldDiceThreeRendererAdapter,
  SETTLE_CONFIRMATION_BEAT_MS,
  type WorldDiceThreeRendererExposed
} from '../../../app/components/world/worldDiceThreeRendererAdapter'
import type { RollDieGroup, RollEventRecord } from '../../../app/lib/rolls/types'

function dieGroup(overrides: Partial<RollDieGroup> = {}): RollDieGroup {
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
    dice: [dieGroup()],
    modifier: 5,
    modifiers: [5],
    total: 19,
    visibility: 'table',
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...overrides
  }
}

describe('buildPredeterminedNotation', () => {
  it('builds a single-group forced-outcome notation, e.g. a d20 that MUST show 20', () => {
    const record = roll({ dice: [dieGroup({ sides: 20, results: [20], kept: [20], naturalHigh: true })] })
    expect(buildPredeterminedNotation(record)).toBe('1d20@20')
  })

  it('forces EVERY die in the group, including ones a keep rule dropped -- never trimmed to just kept', () => {
    // Advantage: 2d20, keep the higher of [11, 20].
    const record = roll({
      dice: [dieGroup({ sides: 20, results: [11, 20], keptFlags: [false, true], kept: [20], naturalHigh: true })]
    })
    expect(buildPredeterminedNotation(record)).toBe('2d20@11,20')
  })

  it('builds a multi-group notation for a custom roll, positionally ordered by group then index', () => {
    const record = roll({
      dice: [
        dieGroup({ sides: 6, results: [3, 5], kept: [3, 5], keptFlags: [true, true] }),
        dieGroup({ sides: 4, results: [2], kept: [2], keptFlags: [true] })
      ]
    })
    expect(buildPredeterminedNotation(record)).toBe('2d6+1d4@3,5,2')
  })

  it('never encodes sign -- a physical die face is never negative', () => {
    const record = roll({ dice: [dieGroup({ sides: 4, sign: -1, results: [3], kept: [3] })] })
    expect(buildPredeterminedNotation(record)).toBe('1d4@3')
  })

  it('returns null for a manual roll with no dice at all -- nothing to force, nothing to animate', () => {
    const record = roll({ dice: [] })
    expect(buildPredeterminedNotation(record)).toBeNull()
  })
})

describe('countDice', () => {
  it('counts every die across every group, including ones a keep rule dropped', () => {
    const record = roll({
      dice: [
        dieGroup({ sides: 20, results: [11, 20], keptFlags: [false, true], kept: [20] }),
        dieGroup({ sides: 6, results: [3, 5, 1], kept: [3, 5, 1], keptFlags: [true, true, true] })
      ]
    })
    expect(countDice(record)).toBe(5)
  })

  it('is zero for a manual roll with no dice', () => {
    expect(countDice(roll({ dice: [] }))).toBe(0)
  })
})

describe('createWorldDiceThreeRendererAdapter -- play()', () => {
  function exposed(overrides: Partial<WorldDiceThreeRendererExposed> = {}): WorldDiceThreeRendererExposed {
    return {
      roll: vi.fn().mockResolvedValue(undefined),
      error: '',
      ...overrides
    }
  }

  it('throws when the renderer instance is not mounted -- never silently no-ops', async () => {
    const box = ref<WorldDiceThreeRendererExposed | null>(null)
    const adapter = createWorldDiceThreeRendererAdapter(box)

    await expect(adapter.play({ id: 'roll-1', roll: roll() })).rejects.toThrow('WorldDiceThreeRenderer is not mounted')
  })

  it('calls roll() with a forced-outcome notation built from the already-authoritative record, plus the dice count', async () => {
    const rollMock = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldDiceThreeRendererExposed | null>(exposed({ roll: rollMock }))
    const adapter = createWorldDiceThreeRendererAdapter(box)

    const record = roll({ id: 'roll-42', dice: [dieGroup({ sides: 20, results: [20], kept: [20] })] })
    await adapter.play({ id: 'roll-42', roll: record })

    expect(rollMock).toHaveBeenCalledWith('1d20@20', 1)
  })

  it('passes the total dice count across every group, for a multi-die roll', async () => {
    const rollMock = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldDiceThreeRendererExposed | null>(exposed({ roll: rollMock }))
    const adapter = createWorldDiceThreeRendererAdapter(box)

    const record = roll({
      dice: [
        dieGroup({ sides: 6, results: [3, 5], kept: [3, 5], keptFlags: [true, true] }),
        dieGroup({ sides: 4, results: [2], kept: [2], keptFlags: [true] })
      ]
    })
    await adapter.play({ id: 'roll-1', roll: record })

    expect(rollMock).toHaveBeenCalledWith('2d6+1d4@3,5,2', 3)
  })

  it('never calls roll() for a manual roll with no dice -- resolves immediately instead', async () => {
    const rollMock = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldDiceThreeRendererExposed | null>(exposed({ roll: rollMock }))
    const adapter = createWorldDiceThreeRendererAdapter(box)

    await adapter.play({ id: 'roll-1', roll: roll({ dice: [] }) })
    expect(rollMock).not.toHaveBeenCalled()
  })

  it('never calls onRendererFailed when the renderer reports no error', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldDiceThreeRendererExposed | null>(exposed({ error: '' }))
    const adapter = createWorldDiceThreeRendererAdapter(box, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll() })
    expect(onRendererFailed).not.toHaveBeenCalled()
  })

  it('calls onRendererFailed when the renderer reports an error after roll() resolves (graceful fallback trigger)', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldDiceThreeRendererExposed | null>(exposed({ error: '3D dice failed to render.' }))
    const adapter = createWorldDiceThreeRendererAdapter(box, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll() })
    expect(onRendererFailed).toHaveBeenCalledTimes(1)
  })

  it('does not throw when no onRendererFailed callback was provided, even if the renderer errored', async () => {
    const box = ref<WorldDiceThreeRendererExposed | null>(exposed({ error: 'boom' }))
    const adapter = createWorldDiceThreeRendererAdapter(box)

    await expect(adapter.play({ id: 'roll-1', roll: roll() })).resolves.toBeUndefined()
  })
})

describe('createWorldDiceThreeRendererAdapter -- Phase 3E settle-confirmation beat', () => {
  function exposed(overrides: Partial<WorldDiceThreeRendererExposed> = {}): WorldDiceThreeRendererExposed {
    return {
      roll: vi.fn().mockResolvedValue(undefined),
      error: '',
      ...overrides
    }
  }

  it('does not resolve play() until the settle-confirmation beat has elapsed after roll() resolves -- the Roll Tray must never reveal before this', async () => {
    vi.useFakeTimers()
    try {
      const box = ref<WorldDiceThreeRendererExposed | null>(exposed({ error: '' }))
      const adapter = createWorldDiceThreeRendererAdapter(box)

      let resolved = false
      const playPromise = adapter.play({ id: 'roll-1', roll: roll() }).then(() => {
        resolved = true
      })

      // Flushes roll()'s own already-resolved Promise without advancing any
      // setTimeout-driven wait yet.
      await vi.advanceTimersByTimeAsync(0)
      expect(resolved).toBe(false)

      await vi.advanceTimersByTimeAsync(SETTLE_CONFIRMATION_BEAT_MS - 1)
      expect(resolved).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await playPromise
      expect(resolved).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips the settle-confirmation beat entirely on a renderer error -- a broken renderer must fall back promptly, never sit through a beat for a settle that never happened', async () => {
    vi.useFakeTimers()
    try {
      const onRendererFailed = vi.fn()
      const box = ref<WorldDiceThreeRendererExposed | null>(exposed({ error: '3D dice failed to render.' }))
      const adapter = createWorldDiceThreeRendererAdapter(box, onRendererFailed)

      let resolved = false
      adapter.play({ id: 'roll-1', roll: roll() }).then(() => {
        resolved = true
      })

      await vi.advanceTimersByTimeAsync(0)
      expect(resolved).toBe(true)
      expect(onRendererFailed).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('createWorldDiceThreeRendererAdapter -- prepare()/dispose()', () => {
  it('are both no-ops that never throw', async () => {
    const box = ref<WorldDiceThreeRendererExposed | null>(null)
    const adapter = createWorldDiceThreeRendererAdapter(box)

    await expect(adapter.prepare()).resolves.toBeUndefined()
    expect(() => adapter.dispose()).not.toThrow()
  })
})
