// Unit tests for
// app/components/world/worldAuthoredThreeDiceRendererAdapter.ts -- Eldra
// Roll System Phase 4B.1 (Authored Three.js d20 Proof of Concept,
// ADR-024 Option 2).
//
// No Vue SFC/DOM/WebGL is exercised here (this repo's Vitest setup has no
// Vue component-rendering or WebGL-capable environment) -- `box` is a
// plain `ref()` holding a hand-built stand-in for
// WorldAuthoredThreeDiceRenderer.client.vue's own `defineExpose` shape,
// matching every sibling adapter test's established boundary
// (worldDiceThreeRendererAdapter.test.ts, worldAuthoredDiceRendererAdapter
// .test.ts).

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  createAuthoredThreeDiceRendererAdapter,
  extractSingleD20Face,
  type WorldAuthoredThreeDiceRendererExposed
} from '../../../app/components/world/worldAuthoredThreeDiceRendererAdapter'
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

describe('extractSingleD20Face -- Phase 4B.1\'s own "single d20 rolls only" gate', () => {
  it('extracts the face for every value 1-20 on a plain 1d20 roll', () => {
    for (let face = 1; face <= 20; face++) {
      const record = roll({ dice: [dieGroup({ sides: 20, results: [face], kept: [face] })] })
      expect(extractSingleD20Face(record)).toBe(face)
    }
  })

  it('returns null for a roll with no dice at all (a manual roll)', () => {
    expect(extractSingleD20Face(roll({ dice: [] }))).toBeNull()
  })

  it('returns null for a non-d20 die (out of scope)', () => {
    const record = roll({ dice: [dieGroup({ sides: 6, results: [4], kept: [4] })] })
    expect(extractSingleD20Face(record)).toBeNull()
  })

  it('returns null for an advantage roll (two d20s in one group) -- never animates just the first', () => {
    const record = roll({
      dice: [dieGroup({ sides: 20, results: [11, 20], keptFlags: [false, true], kept: [20], naturalHigh: true })]
    })
    expect(extractSingleD20Face(record)).toBeNull()
  })

  it('returns null for a multi-group custom roll, even if one group is a lone d20', () => {
    const record = roll({
      dice: [
        dieGroup({ sides: 20, results: [17], kept: [17] }),
        dieGroup({ sides: 6, results: [3], kept: [3] })
      ]
    })
    expect(extractSingleD20Face(record)).toBeNull()
  })

  it('returns null for a damage roll (multiple d20s, no keep rule)', () => {
    const record = roll({
      dice: [dieGroup({ sides: 20, results: [5, 12], keptFlags: [true, true], kept: [5, 12] })]
    })
    expect(extractSingleD20Face(record)).toBeNull()
  })
})

describe('createAuthoredThreeDiceRendererAdapter -- play()', () => {
  function exposed(overrides: Partial<WorldAuthoredThreeDiceRendererExposed> = {}): WorldAuthoredThreeDiceRendererExposed {
    return {
      playD20: vi.fn().mockResolvedValue(undefined),
      error: '',
      ...overrides
    }
  }

  it('throws when the renderer instance is not mounted -- never silently no-ops', async () => {
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(null)
    const adapter = createAuthoredThreeDiceRendererAdapter(box)

    await expect(adapter.play({ id: 'roll-1', roll: roll() })).rejects.toThrow('WorldAuthoredThreeDiceRenderer is not mounted')
  })

  it('calls playD20 with the exact authoritative face for a plain 1d20 roll', async () => {
    const playD20 = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(exposed({ playD20 }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box)

    const record = roll({ dice: [dieGroup({ sides: 20, results: [17], kept: [17] })] })
    await adapter.play({ id: 'roll-1', roll: record })

    expect(playD20).toHaveBeenCalledWith(17)
    expect(playD20).toHaveBeenCalledTimes(1)
  })

  it('never calls playD20 for a roll outside Phase 4B.1\'s scope -- resolves immediately instead', async () => {
    const playD20 = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(exposed({ playD20 }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box)

    const record = roll({ dice: [dieGroup({ sides: 6, results: [4], kept: [4] })] })
    await adapter.play({ id: 'roll-1', roll: record })

    expect(playD20).not.toHaveBeenCalled()
  })

  it('never calls onRendererFailed when the renderer reports no error', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(exposed({ error: '' }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll() })
    expect(onRendererFailed).not.toHaveBeenCalled()
  })

  it('calls onRendererFailed when the renderer reports an error after playD20() resolves', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(exposed({ error: 'WebGL unavailable' }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll() })
    expect(onRendererFailed).toHaveBeenCalledTimes(1)
  })

  it('does not throw when no onRendererFailed callback was provided, even if the renderer errored', async () => {
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(exposed({ error: 'boom' }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box)

    await expect(adapter.play({ id: 'roll-1', roll: roll() })).resolves.toBeUndefined()
  })

  it('never calls onRendererFailed for an out-of-scope roll, even though playD20 was never called', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(exposed({ error: '' }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll({ dice: [] }) })
    expect(onRendererFailed).not.toHaveBeenCalled()
  })
})

describe('createAuthoredThreeDiceRendererAdapter -- prepare()/dispose()', () => {
  it('are both no-ops that never throw', async () => {
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(null)
    const adapter = createAuthoredThreeDiceRendererAdapter(box)

    await expect(adapter.prepare()).resolves.toBeUndefined()
    expect(() => adapter.dispose()).not.toThrow()
  })
})
