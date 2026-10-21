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
  createResourceWriteSequencer,
  mergeResourceOverrides,
  type DisplayableResource,
  type ResourceOverrides
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

describe('createResourceWriteSequencer -- real browser defect, rapid double-click', () => {
  it('a superseded ticket is never "latest" once a newer one has been issued for the same resourceId', () => {
    const sequencer = createResourceWriteSequencer()
    const ticket1 = sequencer.next('resource:rage')
    const ticket2 = sequencer.next('resource:rage')

    expect(sequencer.isLatest('resource:rage', ticket1)).toBe(false)
    expect(sequencer.isLatest('resource:rage', ticket2)).toBe(true)
  })

  it('different resourceIds never supersede one another', () => {
    const sequencer = createResourceWriteSequencer()
    const rageTicket = sequencer.next('resource:rage')
    sequencer.next('resource:bardic.inspiration')

    expect(sequencer.isLatest('resource:rage', rageTicket)).toBe(true)
  })

  it('REGRESSION -- a rapid double-click no longer lets the earlier PUT response revert the later optimistic value', async () => {
    // Reproduces useCharacterMutations.ts's adjustResource/
    // performResourceWrite orchestration verbatim (that module is
    // Vue-coupled and cannot run directly under Vitest), WITH the
    // sequencer fix wired in exactly as it is there -- proving the fix,
    // not just the helper in isolation.
    const rage = (expended: number, max = 2): DisplayableResource => ({ id: 'resource:rage', max, expended, remaining: max - expended })
    const base = [rage(0, 2)]
    let overrides: ResourceOverrides = {}
    const observed: number[] = []

    const queue = createResourceWriteQueue()
    const sequencer = createResourceWriteSequencer()

    let serverExpended = 0
    function simulatedPut(delayMs: number): Promise<{ resource: { expended: number } }> {
      return new Promise((resolve) => {
        setTimeout(() => {
          serverExpended += 1
          resolve({ resource: { expended: serverExpended } })
        }, delayMs)
      })
    }

    function adjustResource(delayMs: number) {
      const current = mergeResourceOverrides(base, overrides).find((c) => c.id === 'resource:rage')!
      overrides = applyResourceOverride(overrides, 'resource:rage', computeOptimisticExpended(current, 'expend', 1))
      observed.push(mergeResourceOverrides(base, overrides)[0].expended)
      const ticket = sequencer.next('resource:rage')

      return queue.enqueue('resource:rage', async () => {
        try {
          const result = await simulatedPut(delayMs)
          sequencer.recordConfirmed('resource:rage', result.resource.expended)
          if (!sequencer.isLatest('resource:rage', ticket)) return
          overrides = applyResourceOverride(overrides, 'resource:rage', result.resource.expended)
          observed.push(mergeResourceOverrides(base, overrides)[0].expended)
        } catch {
          if (!sequencer.isLatest('resource:rage', ticket)) return
          const lastConfirmed = sequencer.getLastConfirmed('resource:rage')
          overrides = lastConfirmed !== undefined
            ? applyResourceOverride(overrides, 'resource:rage', lastConfirmed)
            : clearResourceOverride(overrides, 'resource:rage')
        }
      })
    }

    const click1 = adjustResource(20) // slower first write
    await new Promise((resolve) => setTimeout(resolve, 1))
    const click2 = adjustResource(5)
    await Promise.all([click1, click2])

    expect(mergeResourceOverrides(base, overrides)[0].expended).toBe(2)
    // No dip back to 1 in between -- click 1's own now-stale response is
    // silently dropped, only click 2's (the latest ticket) ever applies.
    expect(observed).toEqual([1, 2, 2])
  })
})

describe('FAILURE RECONCILIATION -- a superseded success must not be lost to a later failure', () => {
  // Reproduces performResourceWrite's fixed orchestration verbatim: on
  // success, `recordConfirmed` runs regardless of ticket recency (a
  // superseded success is still a real, persisted server fact); on
  // failure, the override rolls back to `getLastConfirmed`, never
  // straight to the original base, UNLESS nothing has ever been
  // confirmed for this resourceId.
  function makeHarness() {
    const rage = (expended: number, max = 2): DisplayableResource => ({ id: 'resource:rage', max, expended, remaining: max - expended })
    const base = [rage(0, 2)]
    let overrides: ResourceOverrides = {}
    const queue = createResourceWriteQueue()
    const sequencer = createResourceWriteSequencer()

    function adjustResource(outcome: 'success' | 'failure', delayMs: number, serverExpended?: number) {
      const current = mergeResourceOverrides(base, overrides).find((c) => c.id === 'resource:rage')!
      overrides = applyResourceOverride(overrides, 'resource:rage', computeOptimisticExpended(current, 'expend', 1))
      const ticket = sequencer.next('resource:rage')

      return queue.enqueue('resource:rage', async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        if (outcome === 'success') {
          sequencer.recordConfirmed('resource:rage', serverExpended!)
          if (!sequencer.isLatest('resource:rage', ticket)) return
          overrides = applyResourceOverride(overrides, 'resource:rage', serverExpended!)
        } else {
          if (!sequencer.isLatest('resource:rage', ticket)) return
          const lastConfirmed = sequencer.getLastConfirmed('resource:rage')
          overrides = lastConfirmed !== undefined
            ? applyResourceOverride(overrides, 'resource:rage', lastConfirmed)
            : clearResourceOverride(overrides, 'resource:rage')
        }
      })
    }

    return { adjustResource, display: () => mergeResourceOverrides(base, overrides)[0].expended }
  }

  it('A succeeds (expended=1), B fails -> final state is 1, never stuck at B\'s failed optimistic 2', async () => {
    const h = makeHarness()
    const a = h.adjustResource('success', 20, 1)
    await new Promise((resolve) => setTimeout(resolve, 1))
    const b = h.adjustResource('failure', 5)
    await Promise.all([a, b])
    expect(h.display()).toBe(1)
  })

  it('A fails, B succeeds (expended=2) -> final state is 2', async () => {
    const h = makeHarness()
    const a = h.adjustResource('failure', 20)
    await new Promise((resolve) => setTimeout(resolve, 1))
    const b = h.adjustResource('success', 5, 2)
    await Promise.all([a, b])
    expect(h.display()).toBe(2)
  })

  it('both fail -> final state is 0 (the original base; nothing was ever confirmed)', async () => {
    const h = makeHarness()
    const a = h.adjustResource('failure', 20)
    await new Promise((resolve) => setTimeout(resolve, 1))
    const b = h.adjustResource('failure', 5)
    await Promise.all([a, b])
    expect(h.display()).toBe(0)
  })

  it('both succeed -> final state is 2 (B\'s own confirmed value, the true latest)', async () => {
    const h = makeHarness()
    const a = h.adjustResource('success', 20, 1)
    await new Promise((resolve) => setTimeout(resolve, 1))
    const b = h.adjustResource('success', 5, 2)
    await Promise.all([a, b])
    expect(h.display()).toBe(2)
  })

  it('different resourceIds reconcile independently', async () => {
    const rage = (expended: number, max = 2) => ({ id: 'resource:rage', max, expended, remaining: max - expended })
    const inspiration = (expended: number, max = 3) => ({ id: 'resource:bardic.inspiration', max, expended, remaining: max - expended })
    const base = [rage(0, 2), inspiration(0, 3)]
    let overrides: ResourceOverrides = {}
    const queue = createResourceWriteQueue()
    const sequencer = createResourceWriteSequencer()

    function adjustResource(resourceId: string, outcome: 'success' | 'failure', delayMs: number, serverExpended?: number) {
      const current = mergeResourceOverrides(base, overrides).find((c) => c.id === resourceId)!
      overrides = applyResourceOverride(overrides, resourceId, computeOptimisticExpended(current, 'expend', 1))
      const ticket = sequencer.next(resourceId)

      return queue.enqueue(resourceId, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        if (outcome === 'success') {
          sequencer.recordConfirmed(resourceId, serverExpended!)
          if (!sequencer.isLatest(resourceId, ticket)) return
          overrides = applyResourceOverride(overrides, resourceId, serverExpended!)
        } else {
          if (!sequencer.isLatest(resourceId, ticket)) return
          const lastConfirmed = sequencer.getLastConfirmed(resourceId)
          overrides = lastConfirmed !== undefined
            ? applyResourceOverride(overrides, resourceId, lastConfirmed)
            : clearResourceOverride(overrides, resourceId)
        }
      })
    }

    // Rage: A succeeds then B fails -> should settle on 1 (A's confirmed value).
    const rageA = adjustResource('resource:rage', 'success', 20, 1)
    // Bardic Inspiration: single failing write, independent of Rage entirely.
    const inspirationFail = adjustResource('resource:bardic.inspiration', 'failure', 5)
    await new Promise((resolve) => setTimeout(resolve, 1))
    const rageB = adjustResource('resource:rage', 'failure', 5)

    await Promise.all([rageA, inspirationFail, rageB])

    expect(mergeResourceOverrides(base, overrides).find((c) => c.id === 'resource:rage')!.expended).toBe(1)
    expect(mergeResourceOverrides(base, overrides).find((c) => c.id === 'resource:bardic.inspiration')!.expended).toBe(0)
  })
})
