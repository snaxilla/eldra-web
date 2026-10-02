// Unit tests for app/composables/characterResourceInteraction.ts --
// RESOURCE INTERACTION PERFORMANCE (real browser defect: a resource-orb
// click visibly waited on a full derived-character refresh before the
// orb changed at all). Pure module, no Vue/Nuxt runtime needed -- mirrors
// characterDerivedRefreshLifecycle.test.ts's own precedent exactly.
//
// These tests prove the ACCEPTANCE requirement at its only testable
// boundary: "visual resource state changes synchronously with user input,
// before awaited network completion, and no full derived fetch is
// required before the visual change." `mergeResourceOverrides`/
// `applyResourceOverride` ARE that synchronous visual-state change (no
// `await` anywhere in them); `createResourceWriteQueue` is what proves
// ordering/isolation without relying on timing luck.

import { describe, expect, it } from 'vitest'
import {
  applyResourceOverride,
  clearResourceOverride,
  computeOptimisticExpended,
  createResourceWriteQueue,
  mergeResourceOverrides,
  type DisplayableResource
} from '../../app/composables/characterResourceInteraction'

function rage(expended = 0, max = 2): DisplayableResource {
  return { id: 'resource:barbarian.rage', max, expended, remaining: max - expended }
}

describe('mergeResourceOverrides -- authoritative base + optimistic overlay', () => {
  it('passes an unrelated resource through completely unchanged (same object identity)', () => {
    const base = [rage(0, 2)]
    const merged = mergeResourceOverrides(base, { 'resource:bardic.inspiration': 1 })
    expect(merged[0]).toBe(base[0])
  })

  it('returns the exact same array reference when there are no overrides at all', () => {
    const base = [rage(0, 2)]
    expect(mergeResourceOverrides(base, {})).toBe(base)
  })

  it('an override of exactly 0 is still applied -- distinct from "no override"', () => {
    const base = [rage(1, 2)] // authoritative: 1 expended (possibly stale)
    const merged = mergeResourceOverrides(base, { 'resource:barbarian.rage': 0 })
    expect(merged[0].expended).toBe(0)
    expect(merged[0].remaining).toBe(2)
  })

  it('never changes max, even while expended/remaining are overridden', () => {
    const base = [rage(0, 2)]
    const merged = mergeResourceOverrides(base, { 'resource:barbarian.rage': 2 })
    expect(merged[0].max).toBe(2)
    expect(merged[0].remaining).toBe(0)
  })
})

describe('applyResourceOverride / clearResourceOverride', () => {
  it('REQUIREMENT 1/2 -- spend/restore updates displayed state immediately, with no network call involved at all', () => {
    const base = [rage(0, 2)]
    const afterSpend = mergeResourceOverrides(base, applyResourceOverride({}, 'resource:barbarian.rage', 1))
    expect(afterSpend[0].expended).toBe(1)

    const afterRestore = mergeResourceOverrides(base, applyResourceOverride({ 'resource:barbarian.rage': 1 }, 'resource:barbarian.rage', 0))
    expect(afterRestore[0].expended).toBe(0)
  })

  it('REQUIREMENT 3 -- a successful response reconciling to the SAME value produces no visible reversal', () => {
    const optimistic = applyResourceOverride({}, 'resource:barbarian.rage', 1)
    // The authoritative PUT response agrees with the optimistic guess --
    // reconciling just re-applies the identical value, so the merged
    // display never jumps back and forth.
    const reconciled = applyResourceOverride(optimistic, 'resource:barbarian.rage', 1)
    expect(mergeResourceOverrides([rage(0, 2)], reconciled)[0].expended).toBe(1)
  })

  it('REQUIREMENT 4/5 -- a failed spend/restore rolls back to the authoritative base', () => {
    const base = [rage(0, 2)]
    const optimistic = applyResourceOverride({}, 'resource:barbarian.rage', 1)
    const rolledBack = clearResourceOverride(optimistic, 'resource:barbarian.rage')
    expect(mergeResourceOverrides(base, rolledBack)[0].expended).toBe(0)
  })

  it('clearing an id with no override is a no-op (returns the same reference)', () => {
    const overrides = { 'resource:bardic.inspiration': 1 }
    expect(clearResourceOverride(overrides, 'resource:barbarian.rage')).toBe(overrides)
  })
})

describe('computeOptimisticExpended -- REQUIREMENT 6, bounds remain authoritative', () => {
  it('expend clamps at max, never exceeding the real maximum client-side', () => {
    expect(computeOptimisticExpended({ max: 2, expended: 2 }, 'expend', 1)).toBe(2)
  })

  it('restore clamps at zero, never going negative', () => {
    expect(computeOptimisticExpended({ max: 2, expended: 0 }, 'restore', 1)).toBe(0)
  })

  it('an ordinary expend/restore moves by exactly `amount`', () => {
    expect(computeOptimisticExpended({ max: 4, expended: 1 }, 'expend', 1)).toBe(2)
    expect(computeOptimisticExpended({ max: 4, expended: 2 }, 'restore', 1)).toBe(1)
  })

  it('a large-pool ("points" style) amount is honored up to the real max', () => {
    expect(computeOptimisticExpended({ max: 20, expended: 0 }, 'expend', 15)).toBe(15)
    expect(computeOptimisticExpended({ max: 20, expended: 15 }, 'expend', 15)).toBe(20)
  })
})

describe('createResourceWriteQueue -- ordering/isolation, no timing luck', () => {
  it('REQUIREMENT 7/8 -- rapid spends for the SAME resource run strictly one at a time, in enqueue order', async () => {
    const queue = createResourceWriteQueue()
    const order: number[] = []
    let concurrent = 0
    let maxConcurrent = 0

    function task(n: number) {
      return async () => {
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push(n)
        concurrent -= 1
      }
    }

    await Promise.all([
      queue.enqueue('rage', task(1)),
      queue.enqueue('rage', task(2)),
      queue.enqueue('rage', task(3))
    ])

    expect(order).toEqual([1, 2, 3])
    expect(maxConcurrent).toBe(1)
  })

  it('REQUIREMENT 9 -- a later-enqueued task can never START before an earlier one for the SAME key has settled (stale-response protection by construction, not timestamp comparison)', async () => {
    const queue = createResourceWriteQueue()
    const started: number[] = []
    const finished: number[] = []

    function task(n: number, delayMs: number) {
      return async () => {
        started.push(n)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        finished.push(n)
      }
    }

    // Task 1 is deliberately SLOWER than task 2 -- if the queue did not
    // serialize, task 2 (enqueued second) could finish FIRST and task 1's
    // own later-arriving response could stomp over it.
    const first = queue.enqueue('rage', task(1, 20))
    const second = queue.enqueue('rage', task(2, 1))
    await Promise.all([first, second])

    expect(started).toEqual([1, 2])
    expect(finished).toEqual([1, 2])
  })

  it('REQUIREMENT 10 -- an unrelated resource is never blocked by a different resource\'s pending write', async () => {
    const queue = createResourceWriteQueue()
    let slowStillRunning = false

    const slow = queue.enqueue('rage', async () => {
      slowStillRunning = true
      await new Promise((resolve) => setTimeout(resolve, 20))
      slowStillRunning = false
    })

    let fastRanWhileSlowWasPending = false
    const fast = queue.enqueue('bardic-inspiration', async () => {
      fastRanWhileSlowWasPending = slowStillRunning
    })

    await Promise.all([slow, fast])
    expect(fastRanWhileSlowWasPending).toBe(true)
  })

  it('isPending reflects queued-or-running state per key, and clears once settled', async () => {
    const queue = createResourceWriteQueue()
    expect(queue.isPending('rage')).toBe(false)

    let release: () => void = () => {}
    const released = new Promise<void>((resolve) => { release = resolve })
    const pendingTask = queue.enqueue('rage', () => released)
    expect(queue.isPending('rage')).toBe(true)
    expect(queue.isPending('bardic-inspiration')).toBe(false)

    release()
    await pendingTask
    expect(queue.isPending('rage')).toBe(false)
  })

  it('a failing task still clears its own pending slot (does not wedge the queue for subsequent clicks)', async () => {
    const queue = createResourceWriteQueue()
    await expect(queue.enqueue('rage', async () => { throw new Error('server rejected') })).rejects.toThrow()
    expect(queue.isPending('rage')).toBe(false)

    let secondRan = false
    await queue.enqueue('rage', async () => { secondRan = true })
    expect(secondRan).toBe(true)
  })
})
