// Unit tests for app/composables/useDiceAnimationQueue.ts -- the Dice
// Presentation Layer's animation host. Eldra Roll System Phase 3A
// (.github/docs/architecture/eldra-roll-system.md §11).
//
// Fake timers drive every wait deterministically (`vi.useFakeTimers()` +
// `vi.advanceTimersByTimeAsync`) -- this file proves the LIFECYCLE and
// QUEUE ordering, not real wall-clock durations. Vue's reactivity works
// standalone outside a component instance (no lifecycle hooks are called
// here, only `ref`/`computed`), so this composable is directly testable
// under plain Vitest, matching useCharacterSheetRolls.ts's own precedent.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetDiceAnimationQueueForTests,
  COMPLETE_HOLD_MS,
  PENDING_BEAT_MS,
  PLACEHOLDER_ANIMATION_MS,
  useDiceAnimationQueue
} from '../../app/composables/useDiceAnimationQueue'
import type { RollEventRecord } from '../../app/lib/rolls/types'

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

beforeEach(() => {
  __resetDiceAnimationQueueForTests()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// Advances fake time and flushes microtasks together -- a bare
// `vi.advanceTimersByTimeAsync` already does both, but named here so each
// call site reads as "let this much presentation time pass."
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('useDiceAnimationQueue -- lifecycle', () => {
  it('walks idle -> pending -> animating -> complete -> idle for a single request', async () => {
    const queue = useDiceAnimationQueue()
    expect(queue.state.value).toBe('idle')
    expect(queue.current.value).toBeNull()

    const settled = queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })

    // Synchronously after enqueue, the request has not yet had its first
    // tick -- the Promise executor runs synchronously but `runQueue`'s
    // first `await` yields immediately.
    await advance(0)
    expect(queue.state.value).toBe('pending')
    expect(queue.current.value?.id).toBe('roll-1')

    await advance(PENDING_BEAT_MS)
    expect(queue.state.value).toBe('animating')
    expect(queue.current.value?.id).toBe('roll-1')

    await advance(PLACEHOLDER_ANIMATION_MS)
    expect(queue.state.value).toBe('complete')

    const result = await settled
    expect(result).toEqual({ id: 'roll-1', roll: roll({ id: 'roll-1' }), completed: true })

    await advance(COMPLETE_HOLD_MS)
    expect(queue.state.value).toBe('idle')
    expect(queue.current.value).toBeNull()
  })

  it('resolves enqueue() exactly when state reaches complete, not before', async () => {
    const queue = useDiceAnimationQueue()
    let resolvedAt: string | null = null

    const settled = queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })
    settled.then(() => { resolvedAt = queue.state.value })

    await advance(PENDING_BEAT_MS + PLACEHOLDER_ANIMATION_MS - 1)
    expect(resolvedAt).toBeNull()

    await advance(1)
    await settled
    expect(resolvedAt).toBe('complete')
  })
})

describe('useDiceAnimationQueue -- queue ordering', () => {
  it('processes multiple queued rolls sequentially, never interrupting the current animation', async () => {
    const queue = useDiceAnimationQueue()
    const order: string[] = []

    const first = queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) }).then((r) => order.push(r.id))
    const second = queue.enqueue({ id: 'roll-2', roll: roll({ id: 'roll-2' }) }).then((r) => order.push(r.id))
    const third = queue.enqueue({ id: 'roll-3', roll: roll({ id: 'roll-3' }) }).then((r) => order.push(r.id))

    // The moment the first request starts, the other two are still queued
    // -- never interrupted, never dropped.
    await advance(0)
    expect(queue.current.value?.id).toBe('roll-1')
    expect(queue.queueLength.value).toBe(2)

    const oneTurn = PENDING_BEAT_MS + PLACEHOLDER_ANIMATION_MS + COMPLETE_HOLD_MS
    await advance(oneTurn)
    expect(queue.current.value?.id).toBe('roll-2')
    expect(queue.queueLength.value).toBe(1)

    await advance(oneTurn)
    expect(queue.current.value?.id).toBe('roll-3')
    expect(queue.queueLength.value).toBe(0)

    await advance(oneTurn)
    await Promise.all([first, second, third])

    expect(order).toEqual(['roll-1', 'roll-2', 'roll-3'])
    expect(queue.state.value).toBe('idle')
  })

  it('suppresses a duplicate id -- the same roll enqueued twice animates once and resolves both callers', async () => {
    const queue = useDiceAnimationQueue()

    const a = queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })
    const b = queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })

    await advance(0)
    // Only one entry ever entered the queue for this id -- nothing to
    // wait behind.
    expect(queue.queueLength.value).toBe(0)

    await advance(PENDING_BEAT_MS + PLACEHOLDER_ANIMATION_MS)

    const [resultA, resultB] = await Promise.all([a, b])
    expect(resultA.completed).toBe(true)
    expect(resultB.completed).toBe(true)
    expect(resultA.id).toBe('roll-1')
    expect(resultB.id).toBe('roll-1')
  })

  it('also suppresses a duplicate enqueued while the first is still WAITING in the queue (not yet current)', async () => {
    const queue = useDiceAnimationQueue()

    queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })
    const waitingFirst = queue.enqueue({ id: 'roll-2', roll: roll({ id: 'roll-2' }) })
    const waitingDuplicate = queue.enqueue({ id: 'roll-2', roll: roll({ id: 'roll-2' }) })

    await advance(0)
    // roll-1 is current; only ONE roll-2 entry should be queued behind it.
    expect(queue.queueLength.value).toBe(1)

    const oneTurn = PENDING_BEAT_MS + PLACEHOLDER_ANIMATION_MS + COMPLETE_HOLD_MS
    await advance(oneTurn * 2)

    await Promise.all([waitingFirst, waitingDuplicate])
  })
})

describe('useDiceAnimationQueue -- cleanup', () => {
  it('clear() resolves every queued and in-flight request with completed:false, and resets state to idle', async () => {
    const queue = useDiceAnimationQueue()

    const current = queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })
    const queued = queue.enqueue({ id: 'roll-2', roll: roll({ id: 'roll-2' }) })

    await advance(PENDING_BEAT_MS)
    expect(queue.state.value).toBe('animating')

    queue.clear()

    expect(queue.state.value).toBe('idle')
    expect(queue.current.value).toBeNull()
    expect(queue.queueLength.value).toBe(0)

    const [currentResult, queuedResult] = await Promise.all([current, queued])
    expect(currentResult).toEqual({ id: 'roll-1', roll: roll({ id: 'roll-1' }), completed: false })
    expect(queuedResult).toEqual({ id: 'roll-2', roll: roll({ id: 'roll-2' }), completed: false })
  })

  it('a stale in-flight loop iteration never resumes state after clear() (no phantom re-animation)', async () => {
    const queue = useDiceAnimationQueue()

    queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })
    await advance(PENDING_BEAT_MS)
    expect(queue.state.value).toBe('animating')

    queue.clear()
    expect(queue.state.value).toBe('idle')

    // The original loop iteration was suspended mid-`await` inside the
    // placeholder wait; letting that timer fire must NOT flip state back
    // to 'complete' or repopulate `current`.
    await advance(PLACEHOLDER_ANIMATION_MS + COMPLETE_HOLD_MS + 10)

    expect(queue.state.value).toBe('idle')
    expect(queue.current.value).toBeNull()
  })

  it('accepts a new roll immediately after clear(), starting a fresh run', async () => {
    const queue = useDiceAnimationQueue()

    queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })
    await advance(PENDING_BEAT_MS)
    queue.clear()

    const settled = queue.enqueue({ id: 'roll-2', roll: roll({ id: 'roll-2' }) })
    await advance(0)
    expect(queue.current.value?.id).toBe('roll-2')

    await advance(PENDING_BEAT_MS + PLACEHOLDER_ANIMATION_MS)
    const result = await settled
    expect(result.completed).toBe(true)
  })
})

describe('useDiceAnimationQueue -- renderer seam', () => {
  it('calls a registered renderer\'s play() instead of the built-in placeholder wait', async () => {
    const queue = useDiceAnimationQueue()
    const play = vi.fn().mockResolvedValue(undefined)
    queue.setRenderer({ prepare: vi.fn(), play, dispose: vi.fn() })

    const settled = queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })
    await advance(PENDING_BEAT_MS)
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ id: 'roll-1' }))

    // No PLACEHOLDER_ANIMATION_MS wait is used once a renderer is
    // registered -- resolving the renderer's own play() Promise is what
    // advances the state, immediately, with no extra elapsed time needed.
    await Promise.resolve()
    await advance(0)
    expect(queue.state.value).toBe('complete')

    await advance(COMPLETE_HOLD_MS)
    await settled
  })

  it('still resolves as completed:true when a renderer\'s play() rejects -- presentation failure is never a gameplay failure', async () => {
    const queue = useDiceAnimationQueue()
    queue.setRenderer({ prepare: vi.fn(), play: vi.fn().mockRejectedValue(new Error('boom')), dispose: vi.fn() })

    const settled = queue.enqueue({ id: 'roll-1', roll: roll({ id: 'roll-1' }) })
    await advance(PENDING_BEAT_MS)
    await advance(0)
    await advance(COMPLETE_HOLD_MS)

    const result = await settled
    expect(result.completed).toBe(true)
  })
})
