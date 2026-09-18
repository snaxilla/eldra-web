// Unit tests for
// app/components/world/worldAuthoredThreeDiceRendererAdapter.ts -- Eldra
// Roll System Phase 4B.1 (Authored Three.js d20 Proof of Concept,
// ADR-024 Option 2) + Phase 4C (Authored Polyhedral Dice + Multi-Die
// Presentation, the pool-dispatch tests below).
//
// No Vue SFC/DOM/WebGL is exercised here (this repo's Vitest setup has no
// Vue component-rendering or WebGL-capable environment) -- `box`/
// `polyhedralBox` are plain `ref()`s holding hand-built stand-ins for
// each renderer's own `defineExpose` shape, matching every sibling
// adapter test's established boundary.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { PLACEHOLDER_ANIMATION_MS } from '../../../app/composables/useDiceAnimationQueue'
import {
  createAuthoredThreeDiceRendererAdapter,
  extractPoolPresentation,
  extractSingleD20Face,
  type WorldAuthoredPolyhedralDiceRendererExposed,
  type WorldAuthoredThreeDiceRendererExposed
} from '../../../app/components/world/worldAuthoredThreeDiceRendererAdapter'
import { MAX_POOL_SIZE } from '../../../app/components/world/authoredPolyhedralPoolTypes'
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

describe('extractSingleD20Face -- Phase 4B.1\'s own "single d20 rolls only" gate (unchanged by Phase 4C)', () => {
  it('extracts the face for every value 1-20 on a plain 1d20 roll', () => {
    for (let face = 1; face <= 20; face++) {
      const record = roll({ dice: [dieGroup({ sides: 20, results: [face], kept: [face] })] })
      expect(extractSingleD20Face(record)).toBe(face)
    }
  })

  it('returns null for a roll with no dice at all (a manual roll)', () => {
    expect(extractSingleD20Face(roll({ dice: [] }))).toBeNull()
  })

  it('returns null for a non-d20 die (out of this specific function\'s scope -- now handled by extractPoolPresentation instead)', () => {
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

describe('extractPoolPresentation -- Phase 4C', () => {
  it('a manual d4/d6/d8/d10/d12 roll produces one spec, kept=true', () => {
    for (const sides of [4, 6, 8, 10, 12]) {
      const record = roll({ expression: `1d${sides}`, dice: [dieGroup({ sides, results: [1], kept: [1] })] })
      expect(extractPoolPresentation(record)).toEqual([{ sides, value: 1, kept: true }])
    }
  })

  it('individual RollEventRecord results map POSITIONALLY to individual specs -- 2d6 produces two specs in order, values untouched', () => {
    const record = roll({
      expression: '2d6',
      dice: [dieGroup({ sides: 6, results: [3, 5], keptFlags: [true, true], kept: [3, 5], total: 8 })]
    })
    expect(extractPoolPresentation(record)).toEqual([
      { sides: 6, value: 3, kept: true },
      { sides: 6, value: 5, kept: true }
    ])
  })

  it('4d6 produces four specs, no result duplicated or dropped from the presentation', () => {
    const record = roll({
      expression: '4d6',
      dice: [dieGroup({ sides: 6, results: [1, 2, 3, 4], keptFlags: [true, true, true, true], kept: [1, 2, 3, 4] })]
    })
    expect(extractPoolPresentation(record)).toEqual([
      { sides: 6, value: 1, kept: true },
      { sides: 6, value: 2, kept: true },
      { sides: 6, value: 3, kept: true },
      { sides: 6, value: 4, kept: true }
    ])
  })

  it('mixed dice groups (e.g. "1d8+1d4") flatten across groups, in order', () => {
    const record = roll({
      expression: '1d8+1d4',
      dice: [
        dieGroup({ sides: 8, results: [6], kept: [6] }),
        dieGroup({ sides: 4, results: [2], kept: [2] })
      ]
    })
    expect(extractPoolPresentation(record)).toEqual([
      { sides: 8, value: 6, kept: true },
      { sides: 4, value: 2, kept: true }
    ])
  })

  it('advantage/disadvantage-style pools preserve authoritative kept/dropped metadata from keptFlags, not inferred', () => {
    const record = roll({
      dice: [dieGroup({ sides: 20, results: [11, 20], keptFlags: [false, true], kept: [20], naturalHigh: true })]
    })
    expect(extractPoolPresentation(record)).toEqual([
      { sides: 20, value: 11, kept: false },
      { sides: 20, value: 20, kept: true }
    ])
  })

  it('a missing keptFlags entry defaults to kept=true, never inferring a false drop', () => {
    const record = roll({
      dice: [dieGroup({ sides: 20, results: [11, 20], keptFlags: [] as boolean[], kept: [20] })]
    })
    expect(extractPoolPresentation(record)).toEqual([
      { sides: 20, value: 11, kept: true },
      { sides: 20, value: 20, kept: true }
    ])
  })

  it('rejects an unsupported die type (falls back honestly rather than misrepresenting the roll)', () => {
    const record = roll({ expression: '1d3', dice: [dieGroup({ sides: 3, results: [2], kept: [2] })] })
    expect(extractPoolPresentation(record)).toBeNull()
  })

  it('rejects a pool larger than MAX_POOL_SIZE', () => {
    const results = Array.from({ length: MAX_POOL_SIZE + 1 }, () => 3)
    const record = roll({
      dice: [dieGroup({ sides: 6, results, keptFlags: results.map(() => true), kept: results })]
    })
    expect(extractPoolPresentation(record)).toBeNull()
  })

  it('accepts a pool at exactly MAX_POOL_SIZE', () => {
    const results = Array.from({ length: MAX_POOL_SIZE }, () => 3)
    const record = roll({
      dice: [dieGroup({ sides: 6, results, keptFlags: results.map(() => true), kept: results })]
    })
    expect(extractPoolPresentation(record)).toHaveLength(MAX_POOL_SIZE)
  })

  it('a d100 roll produces exactly two d10 specs (tens, ones), never a third die and never a second random result', () => {
    const record = roll({ expression: '1d100', dice: [dieGroup({ sides: 100, results: [73], kept: [73] })] })
    const pool = extractPoolPresentation(record)
    expect(pool).toHaveLength(2)
    expect(pool![0]).toEqual({ sides: 10, value: 7, kept: true, labelRole: 'tens' })
    expect(pool![1]).toEqual({ sides: 10, value: 3, kept: true })
  })

  it('d100 special cases: 1, 10, 20, 90, 99, 100 -- values are the AUTHORITATIVE 1-10 domain fed to the d10 orientation lookup (physical face 0 <- authoritative value 10, per authoredD10Three.ts\'s own convention)', () => {
    // [authoritative d100 value, expected pool[0] (tens-die) value, expected pool[1] (ones-die) value]
    const cases: Array<[number, number, number]> = [
      [1, 10, 1], // tens digit 0 -> physical face 0 -> authoritative value 10; ones digit 1 -> value 1
      [10, 1, 10], // tens digit 10 -> physical face 1 -> value 1; ones digit 0 -> physical face 0 -> value 10
      [20, 2, 10],
      [90, 9, 10],
      [99, 9, 9],
      [100, 10, 10] // tens digit 0 and ones digit 0 -- the conventional "00+0 = 100" reading
    ]
    for (const [value, tensValue, onesValue] of cases) {
      const record = roll({ expression: '1d100', dice: [dieGroup({ sides: 100, results: [value], kept: [value] })] })
      const pool = extractPoolPresentation(record)!
      expect(pool[0]!.value).toBe(tensValue)
      expect(pool[1]!.value).toBe(onesValue)
    }
  })

  it('never generates a second random result for d100 -- calling twice with the same record is fully deterministic', () => {
    const record = roll({ expression: '1d100', dice: [dieGroup({ sides: 100, results: [42], kept: [42] })] })
    expect(extractPoolPresentation(record)).toEqual(extractPoolPresentation(record))
  })
})

describe('createAuthoredThreeDiceRendererAdapter -- play() dispatch', () => {
  function d20Exposed(overrides: Partial<WorldAuthoredThreeDiceRendererExposed> = {}): WorldAuthoredThreeDiceRendererExposed {
    return { playD20: vi.fn().mockResolvedValue(undefined), error: '', ...overrides }
  }
  function poolExposed(overrides: Partial<WorldAuthoredPolyhedralDiceRendererExposed> = {}): WorldAuthoredPolyhedralDiceRendererExposed {
    return { playPool: vi.fn().mockResolvedValue(undefined), error: '', ...overrides }
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('throws when the frozen d20 renderer is not mounted for a plain 1d20 roll', async () => {
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(null)
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed())
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox)

    await expect(adapter.play({ id: 'roll-1', roll: roll() })).rejects.toThrow('WorldAuthoredThreeDiceRenderer is not mounted')
  })

  it('calls playD20 (the frozen path) with the exact authoritative face for a plain 1d20 roll -- never routed to the pool renderer', async () => {
    const playD20 = vi.fn().mockResolvedValue(undefined)
    const playPool = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed({ playD20 }))
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed({ playPool }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox)

    const record = roll({ dice: [dieGroup({ sides: 20, results: [17], kept: [17] })] })
    await adapter.play({ id: 'roll-1', roll: record })

    expect(playD20).toHaveBeenCalledWith(17)
    expect(playD20).toHaveBeenCalledTimes(1)
    expect(playPool).not.toHaveBeenCalled()
  })

  it('routes a manual d6 roll to the pool renderer, not the frozen d20 renderer', async () => {
    const playD20 = vi.fn().mockResolvedValue(undefined)
    const playPool = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed({ playD20 }))
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed({ playPool }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox)

    const record = roll({ expression: '1d6', dice: [dieGroup({ sides: 6, results: [4], kept: [4] })] })
    await adapter.play({ id: 'roll-1', roll: record })

    expect(playPool).toHaveBeenCalledWith([{ sides: 6, value: 4, kept: true }])
    expect(playD20).not.toHaveBeenCalled()
  })

  // Character Sheet Header Cleanup 2.1 -- Spend Hit Die's new authoritative
  // RollEvent (`sourceType: 'hit_die'`, server/utils/roll-events.ts's
  // createHitDieRollEvent) must present through this SAME general pool
  // route, exactly like any other authoritative single-die roll -- it is
  // NOT a third, Hit-Die-specific presentation path, and it must NOT be
  // intentionally treated as unsupported/placeholder-only. This dispatch
  // function is sourceType-agnostic (it only inspects `dice`), so these
  // tests exist to pin that behavior explicitly for this specific source,
  // not to re-derive what `extractPoolPresentation`'s own describe block
  // above already proves generically for every supported side count.
  it.each([6, 8, 10, 12] as const)(
    'routes a Hit Die RollEvent (sourceType: hit_die, 1d%i) to the pool renderer with the RAW face, not a placeholder',
    async (sides) => {
      const playPool = vi.fn().mockResolvedValue(undefined)
      const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed())
      const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed({ playPool }))
      const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox)

      // Bobbert: d8, CON +1, server rolls raw 5 -- generalized here across
      // every supported Hit Die size. `total`/`modifier` carry the
      // healing-relevant raw+CON sum (6 for the d8 case); the pool spec
      // passed to the renderer must carry only the RAW face (5), never the
      // healing total -- the authored die must show 5, not 6.
      const rawFace = Math.min(5, sides)
      const record = roll({
        sourceType: 'hit_die',
        sourceKey: null,
        label: `Hit Die (d${sides})`,
        expression: `1d${sides}+1`,
        dice: [dieGroup({ sides, results: [rawFace], kept: [rawFace], total: rawFace })],
        modifier: 1,
        modifiers: [1],
        total: rawFace + 1,
        visibility: 'private'
      })

      await adapter.play({ id: 'roll-1', roll: record })

      expect(playPool).toHaveBeenCalledWith([{ sides, value: rawFace, kept: true }])
    }
  )

  it('routes a 2d20 advantage pool to the pool renderer, with both dice and their kept/dropped flags intact', async () => {
    const playPool = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed())
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed({ playPool }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox)

    const record = roll({
      dice: [dieGroup({ sides: 20, results: [11, 20], keptFlags: [false, true], kept: [20], naturalHigh: true })]
    })
    await adapter.play({ id: 'roll-1', roll: record })

    expect(playPool).toHaveBeenCalledWith([
      { sides: 20, value: 11, kept: false },
      { sides: 20, value: 20, kept: true }
    ])
  })

  it('throws when the pool renderer is not mounted for an in-scope pool roll', async () => {
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed())
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(null)
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox)

    const record = roll({ expression: '1d6', dice: [dieGroup({ sides: 6, results: [4], kept: [4] })] })
    await expect(adapter.play({ id: 'roll-1', roll: record })).rejects.toThrow('WorldAuthoredPolyhedralDiceRenderer is not mounted')
  })

  it('waits out PLACEHOLDER_ANIMATION_MS for a roll neither renderer can present (unsupported die), calling neither playD20 nor playPool (Phase 4B.7\'s own fallback, preserved)', async () => {
    const playD20 = vi.fn().mockResolvedValue(undefined)
    const playPool = vi.fn().mockResolvedValue(undefined)
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed({ playD20 }))
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed({ playPool }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox)

    const record = roll({ expression: '1d3', dice: [dieGroup({ sides: 3, results: [2], kept: [2] })] })
    const played = adapter.play({ id: 'roll-1', roll: record })

    await vi.advanceTimersByTimeAsync(PLACEHOLDER_ANIMATION_MS)
    await played

    expect(playD20).not.toHaveBeenCalled()
    expect(playPool).not.toHaveBeenCalled()
  })

  it('never calls onRendererFailed when the frozen d20 renderer reports no error', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed({ error: '' }))
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed())
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll() })
    expect(onRendererFailed).not.toHaveBeenCalled()
  })

  it('calls onRendererFailed when the frozen d20 renderer reports an error after playD20() resolves', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed({ error: 'WebGL unavailable' }))
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed())
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox, onRendererFailed)

    await adapter.play({ id: 'roll-1', roll: roll() })
    expect(onRendererFailed).toHaveBeenCalledTimes(1)
  })

  it('calls onRendererFailed when the pool renderer reports an error after playPool() resolves', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed())
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed({ error: 'WebGL unavailable' }))
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox, onRendererFailed)

    const record = roll({ expression: '1d6', dice: [dieGroup({ sides: 6, results: [4], kept: [4] })] })
    await adapter.play({ id: 'roll-1', roll: record })
    expect(onRendererFailed).toHaveBeenCalledTimes(1)
  })

  it('never calls onRendererFailed for an out-of-scope roll', async () => {
    const onRendererFailed = vi.fn()
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(d20Exposed())
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(poolExposed())
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox, onRendererFailed)

    const played = adapter.play({ id: 'roll-1', roll: roll({ dice: [] }) })
    await vi.advanceTimersByTimeAsync(PLACEHOLDER_ANIMATION_MS)
    await played

    expect(onRendererFailed).not.toHaveBeenCalled()
  })
})

describe('createAuthoredThreeDiceRendererAdapter -- prepare()/dispose()', () => {
  it('are both no-ops that never throw', async () => {
    const box = ref<WorldAuthoredThreeDiceRendererExposed | null>(null)
    const polyhedralBox = ref<WorldAuthoredPolyhedralDiceRendererExposed | null>(null)
    const adapter = createAuthoredThreeDiceRendererAdapter(box, polyhedralBox)

    await expect(adapter.prepare()).resolves.toBeUndefined()
    expect(() => adapter.dispose()).not.toThrow()
  })
})
