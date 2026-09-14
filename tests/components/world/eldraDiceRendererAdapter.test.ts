// Unit tests for app/components/world/eldraDiceRendererAdapter.ts -- the
// real DiceRendererAdapter. Eldra Roll System Phase 3B
// (.github/docs/architecture/eldra-roll-system.md §11).
//
// No Vue SFC/DOM is exercised here (this repo's Vitest setup has no Vue
// component-rendering support) -- `box` is a plain `ref()` holding a
// hand-built stand-in for EldraDiceBox.client.vue's own `defineExpose`
// shape, exactly the same boundary tests/utils/diceBoxRollSummary.test.ts
// already draws for that component's other pure logic.

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  createEldraDiceRendererAdapter,
  toLegacyRollResult,
  type EldraDiceBoxExposed
} from '../../../app/components/world/eldraDiceRendererAdapter'
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

describe('toLegacyRollResult', () => {
  it('reshapes a single-group RollEventRecord into the RollResult-like shape summarizeRollEvent expects', () => {
    const result = toLegacyRollResult(roll())
    expect(result).toEqual({
      dice: { count: 1, faces: 20, modifier: 5 },
      rolls: [14],
      kept: [14],
      total: 19
    })
  })

  it('flattens every group\'s rolls/kept for a multi-term custom roll', () => {
    const record = roll({
      dice: [
        dieGroup({ sides: 8, results: [6], kept: [6], total: 6 }),
        dieGroup({ sides: 4, results: [2], kept: [2], total: 2 })
      ],
      modifier: 3,
      total: 11
    })

    const result = toLegacyRollResult(record)
    expect(result.rolls).toEqual([6, 2])
    expect(result.kept).toEqual([6, 2])
    expect(result.total).toBe(11)
  })

  it('prefers the d20 group for the physics/critical-detection notation, even when it is not first', () => {
    const record = roll({
      dice: [
        dieGroup({ sides: 6, results: [3], kept: [3] }),
        dieGroup({ sides: 20, results: [20], kept: [20], naturalHigh: true })
      ]
    })

    const result = toLegacyRollResult(record)
    expect(result.dice).toEqual({ count: 1, faces: 20, modifier: record.modifier })
  })

  it('falls back to the first group when no d20 group exists', () => {
    const record = roll({ dice: [dieGroup({ sides: 6, results: [1, 4], kept: [1, 4] })] })
    const result = toLegacyRollResult(record)
    expect(result.dice).toEqual({ count: 2, faces: 6, modifier: record.modifier })
  })

  it('never invents dice values beyond what the record actually reports', () => {
    const record = roll({ dice: [dieGroup({ results: [7, 3], kept: [7] })] })
    const result = toLegacyRollResult(record)
    expect(result.rolls).toEqual([7, 3])
    expect(result.kept).toEqual([7])
  })
})

describe('createEldraDiceRendererAdapter -- play()', () => {
  function exposed(overrides: Partial<EldraDiceBoxExposed> = {}): EldraDiceBoxExposed {
    return {
      rollResult: vi.fn().mockResolvedValue(undefined),
      error: '',
      ...overrides
    }
  }

  it('throws when the headless EldraDiceBox instance is not mounted -- never silently no-ops', async () => {
    const box = ref<EldraDiceBoxExposed | null>(null)
    const adapter = createEldraDiceRendererAdapter(box)

    await expect(adapter.play({ id: 'roll-1', roll: roll() })).rejects.toThrow('EldraDiceBox is not mounted')
  })

  it('calls rollResult with an already-authoritative event, never a fresh randomness request', async () => {
    const rollResultMock = vi.fn().mockResolvedValue(undefined)
    const box = ref<EldraDiceBoxExposed | null>(exposed({ rollResult: rollResultMock }))
    const adapter = createEldraDiceRendererAdapter(box)

    const record = roll({ id: 'roll-42', label: 'Athletics Check' })
    await adapter.play({ id: 'roll-42', roll: record })

    expect(rollResultMock).toHaveBeenCalledWith(
      { ok: true, eventId: 'roll-42', result: toLegacyRollResult(record) },
      'Athletics Check'
    )
  })

  it('never calls onRendererFailed when the renderer reports no error', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<EldraDiceBoxExposed | null>(exposed({ error: '' }))
    const adapter = createEldraDiceRendererAdapter(box, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll() })
    expect(onRendererFailed).not.toHaveBeenCalled()
  })

  it('calls onRendererFailed when the renderer reports an error after play() resolves (graceful fallback trigger)', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<EldraDiceBoxExposed | null>(exposed({ error: '3D dice failed to initialize.' }))
    const adapter = createEldraDiceRendererAdapter(box, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll() })
    expect(onRendererFailed).toHaveBeenCalledTimes(1)
  })

  it('does not throw when no onRendererFailed callback was provided, even if the renderer errored', async () => {
    const box = ref<EldraDiceBoxExposed | null>(exposed({ error: 'boom' }))
    const adapter = createEldraDiceRendererAdapter(box)

    await expect(adapter.play({ id: 'roll-1', roll: roll() })).resolves.toBeUndefined()
  })
})

describe('createEldraDiceRendererAdapter -- prepare()/dispose()', () => {
  it('are both no-ops that never throw', async () => {
    const box = ref<EldraDiceBoxExposed | null>(null)
    const adapter = createEldraDiceRendererAdapter(box)

    await expect(adapter.prepare()).resolves.toBeUndefined()
    expect(() => adapter.dispose()).not.toThrow()
  })
})
