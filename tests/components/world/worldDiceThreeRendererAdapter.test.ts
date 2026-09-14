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
  DIE_FACE_MAPPINGS,
  notationValueForFace,
  SETTLE_CONFIRMATION_BEAT_MS,
  visibleLabelForFace,
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

// ---------------------------------------------------------------------------
// ROLL SYSTEM PHASE 3F -- DETERMINISTIC FACE MAPPING VERIFICATION
// ---------------------------------------------------------------------------
// This block does NOT assert that our table matches itself. It replicates
// @3d-dice/dice-box-threejs@0.0.12's OWN arithmetic, transcribed from its
// shipped bundle (`dist/dice-box-threejs.es.js`), and pushes every face of
// every supported die all the way through it:
//
//   notation `@` value
//     -> DiceNotation.parseNotation()  : `n[1].match(/(\b)*(\-\d+|\d+)(\b)*/gi)`
//                                        pushed verbatim into `result`
//     -> DiceBox.rollDice()            : `swapDiceFace(diceList[i], result[i])`
//     -> swapDiceFace()                : `o = n.values.indexOf(t)`, then
//                                        `materialIndex = o + c`, where
//                                        `c = 2`, or `1` for the d10 shape,
//                                        or `o + 1` for the d2 shape
//     -> mesh.getFaceValue()           : `c = materialIndex - 1`, then
//                                        `c += 1` for the d10/d2 shapes, and
//                                        `value = values[(c - 1) % values.length]`
//     -> visible face value
//
// If that chain does not return the number the Roll Tray shows, the mapping
// is wrong. That is the actual property under test.
const D10_SHAPE_TYPES = new Set(['d10', 'd100'])

// Faithful replication of swapDiceFace()'s own materialIndex arithmetic.
function materialIndexForFace(notationType: string, faceIndex: number): number {
  if (notationType === 'd2') return faceIndex + 1
  if (D10_SHAPE_TYPES.has(notationType)) return faceIndex + 1
  return faceIndex + 2
}

// Faithful replication of getFaceValue()'s own materialIndex -> value
// arithmetic. Returns what the settled die will actually read as.
function visibleValueForMaterialIndex(notationType: string, materialIndex: number, values: number[]): number {
  let c = materialIndex - 1
  if (notationType === 'd2' || D10_SHAPE_TYPES.has(notationType)) c += 1
  return values[(c - 1) % values.length]!
}

// The whole chain, end to end, exactly as the renderer runs it.
// `null` models swapDiceFace()'s own silent bail-out
// (`if (s < 0 || o < 0 || s == o) return`) -- the case where a forced value
// is simply ignored and the die shows whatever physics produced.
function rendererVisibleValueFor(sides: number, notationValue: number): number | null {
  const mapping = DIE_FACE_MAPPINGS[sides]
  if (!mapping) return null
  const faceIndex = mapping.values.indexOf(notationValue)
  if (faceIndex < 0) return null
  const materialIndex = materialIndexForFace(mapping.notationType, faceIndex)
  return visibleValueForMaterialIndex(mapping.notationType, materialIndex, mapping.values)
}

describe('Phase 3F -- deterministic face mapping, verified against the renderer\'s own arithmetic', () => {
  const supportedSides = Object.keys(DIE_FACE_MAPPINGS).map(Number).sort((a, b) => a - b)

  it('supports exactly the dice whose renderer face values are the contiguous run 1..sides', () => {
    // d100 is deliberately ABSENT: its descriptor is `values: [10, 100, 10]`,
    // which expands to decades ([10, 20, ... 100]), so a percentile result of
    // 57 has no face at all. Unsupported sides are handled by refusing to
    // animate, never by guessing -- see buildPredeterminedNotation.
    expect(supportedSides).toEqual([1, 2, 3, 4, 6, 8, 10, 12, 20])
    for (const sides of supportedSides) {
      expect(DIE_FACE_MAPPINGS[sides]!.values).toEqual(
        Array.from({ length: sides }, (_, i) => i + 1)
      )
    }
  })

  // THE CORE PROOF. Every face of every supported die, through the renderer's
  // real arithmetic. d20 in full is the task's explicit minimum bar; the rest
  // are covered because the mapping must be documented per die type, not
  // assumed to generalize from d20.
  for (const sides of [1, 2, 3, 4, 6, 8, 10, 12, 20]) {
    it(`d${sides}: every face survives the full notation -> renderer -> visible-face chain`, () => {
      const mapping = DIE_FACE_MAPPINGS[sides]!
      for (let face = 1; face <= sides; face++) {
        // 1. The authoritative record's face becomes the `@` value verbatim.
        expect(notationValueForFace(sides, face)).toBe(face)

        // 2. The adapter emits it in the notation.
        const record = roll({
          dice: [dieGroup({ sides, results: [face], kept: [face], keptFlags: [true] })]
        })
        expect(buildPredeterminedNotation(record)).toBe(`1${mapping.notationType}@${face}`)

        // 3. The renderer's own arithmetic resolves that `@` value back to
        //    the SAME number the Roll Tray will display.
        expect(rendererVisibleValueFor(sides, face)).toBe(face)

        // 4. And the glyph physically printed on that face is the documented
        //    one (d10's tenth face prints "0" by percentile convention --
        //    its VALUE is still 10, which is what step 3 just proved).
        expect(visibleLabelForFace(sides, face)).toBe(mapping.labels[face - 1])
      }
    })
  }

  it('d20 nat 1 and nat 20 specifically -- the two faces a player will notice instantly', () => {
    expect(buildPredeterminedNotation(roll({
      dice: [dieGroup({ sides: 20, results: [1], kept: [1], naturalLow: true })]
    }))).toBe('1d20@1')
    expect(rendererVisibleValueFor(20, 1)).toBe(1)

    expect(buildPredeterminedNotation(roll({
      dice: [dieGroup({ sides: 20, results: [20], kept: [20], naturalHigh: true })]
    }))).toBe('1d20@20')
    expect(rendererVisibleValueFor(20, 20)).toBe(20)
  })

  it('d10 face 10 maps to the face printed "0" without ever becoming 0 in the notation', () => {
    // swapDiceFace special-cases `t == 0` back to 10 for d10, but Eldra must
    // never rely on that: the record says 10, the notation says 10.
    expect(buildPredeterminedNotation(roll({
      dice: [dieGroup({ sides: 10, results: [10], kept: [10] })]
    }))).toBe('1d10@10')
    expect(visibleLabelForFace(10, 10)).toBe('0')
    expect(rendererVisibleValueFor(10, 10)).toBe(10)
  })

  it('refuses faces outside a supported die rather than emitting a value swapDiceFace would silently ignore', () => {
    expect(notationValueForFace(20, 0)).toBeNull()
    expect(notationValueForFace(20, 21)).toBeNull()
    expect(rendererVisibleValueFor(20, 21)).toBeNull()
    expect(buildPredeterminedNotation(roll({
      dice: [dieGroup({ sides: 20, results: [21], kept: [21] })]
    }))).toBeNull()
  })

  it('refuses die types the renderer has no geometry for -- these are dropped from diceList and shift every later die', () => {
    for (const sides of [5, 7, 14, 16, 30, 100]) {
      expect(notationValueForFace(sides, 1)).toBeNull()
      expect(buildPredeterminedNotation(roll({
        dice: [dieGroup({ sides, results: [1], kept: [1] })]
      }))).toBeNull()
    }
  })

  it('refuses the WHOLE roll if any single group is unsupported -- a partial roll would mis-map its supported dice too', () => {
    // 1d20 + 1d7: dice-box-threejs never pushes the d7 into `diceList`, so
    // `result[1]` (the d7's value) would be applied to whatever die landed at
    // index 1 -- or dropped. All-or-nothing is the only safe behaviour.
    const record = roll({
      dice: [
        dieGroup({ sides: 20, results: [18], kept: [18] }),
        dieGroup({ sides: 7, results: [4], kept: [4] })
      ]
    })
    expect(buildPredeterminedNotation(record)).toBeNull()
  })

  it('keeps forced values positionally aligned with diceList across multiple groups', () => {
    // rollDice() walks `result[i]` against `diceList[i]`, and diceList is
    // filled in declaration order -- so group order and within-group order
    // must both be preserved exactly.
    const record = roll({
      dice: [
        dieGroup({ sides: 20, results: [11, 20], keptFlags: [false, true], kept: [20] }),
        dieGroup({ sides: 6, results: [3, 5, 1], kept: [3, 5, 1], keptFlags: [true, true, true] }),
        dieGroup({ sides: 4, results: [2], kept: [2], keptFlags: [true] })
      ]
    })
    expect(buildPredeterminedNotation(record)).toBe('2d20+3d6+1d4@11,20,3,5,1,2')

    // And every one of those forced values independently resolves to itself.
    for (const [sides, face] of [[20, 11], [20, 20], [6, 3], [6, 5], [6, 1], [4, 2]] as const) {
      expect(rendererVisibleValueFor(sides, face)).toBe(face)
    }
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
