// Character Resource Interaction -- RESOURCE INTERACTION PERFORMANCE
// (real browser defect, Bob the Barbarian: clicking a Rage/Bardic
// Inspiration/etc. orb visibly waited on a full derived-character refresh
// before the orb changed at all).
//
// A pure, Vue-free description of the optimistic-overlay and request-
// ordering decisions useCharacterSheet.ts/useCharacterMutations.ts wire
// together -- the IDENTICAL "pure helpers beside an untestable boundary"
// pattern characterDerivedRefreshLifecycle.ts and
// characterProgressionRequestLifecycle.ts already established (this
// repo's Vitest environment has no Nuxt runtime, so `useFetch`/`$fetch`/
// `useCharacterSheet` cannot be exercised directly in a test, but every
// DECISION that matters can be).
//
// ---------------------------------------------------------------------------
// THE THREE DECISIONS THIS FILE OWNS
// ---------------------------------------------------------------------------
// 1. OVERLAY MERGE -- `mergeResourceOverrides`: authoritative base (whatever
//    the Rules Engine last evaluated) + a small resourceId -> expended
//    overlay = what the Sheet actually displays. Never touches `max` (a
//    resource click can never change its own maximum -- see
//    useCharacterSheet.ts's own header for why).
// 2. OPTIMISTIC COMPUTATION -- `computeOptimisticExpended`: the immediate
//    guess shown BEFORE any network call resolves, using the exact same
//    pure clamp functions (`expendResource`/`restoreResource`,
//    app/lib/characters/resources.ts) the server itself uses -- never a
//    second reimplementation of their bounds logic, and never a
//    recomputed maximum.
// 3. ORDERING -- `createResourceWriteQueue`: serializes the NETWORK call
//    per resourceId (the server's own PUT route is a read-modify-write
//    against one persisted record; two concurrent writes for the SAME
//    resource could otherwise race and lose an update), while leaving
//    DIFFERENT resourceIds fully independent of one another. Because at
//    most one write per resourceId is ever in flight, no response for a
//    given resource can arrive out of the order its own request was sent
//    -- "stale response" protection falls out of this structure, never
//    out of comparing timestamps.

import { expendResource, restoreResource } from '~/lib/characters/resources'

export type ResourceOverrides = Record<string, number>

// Presence of the key (never its value) means "overridden" -- the one
// subtlety that rules out storing overrides in the exact same shape
// `expendResource`/`restoreResource` persist (those delete a key once it
// reaches zero, correct for "the PERSISTED record has nothing spent," but
// wrong here: "overridden to zero" and "no override, trust a possibly-
// stale authoritative base" must stay distinguishable).
export function applyResourceOverride(overrides: ResourceOverrides, resourceId: string, expended: number): ResourceOverrides {
  return { ...overrides, [resourceId]: expended }
}

export function clearResourceOverride(overrides: ResourceOverrides, resourceId: string): ResourceOverrides {
  if (!(resourceId in overrides)) return overrides
  const next = { ...overrides }
  delete next[resourceId]
  return next
}

export type DisplayableResource = { id: string, max: number, expended: number, remaining: number }

// AUTHORITATIVE BASE + OPTIMISTIC OVERLAY = DISPLAYED STATE. `base` is
// never mutated; a resource with no override passes through unchanged
// (including object identity, so an unrelated resource's reference stays
// stable across a render -- cheap for any caller that memoizes on it).
export function mergeResourceOverrides<T extends DisplayableResource>(base: readonly T[], overrides: ResourceOverrides): T[] {
  if (Object.keys(overrides).length === 0) return base as T[]
  return base.map((resource) => {
    if (!(resource.id in overrides)) return resource
    const expended = overrides[resource.id] ?? resource.expended
    return { ...resource, expended, remaining: resource.max - expended }
  })
}

// The immediate visual guess for ONE click, computed from whatever is
// CURRENTLY displayed (itself possibly already an earlier optimistic
// guess from a rapid prior click on this same resource) -- so a burst of
// clicks accumulates correctly without waiting for a round trip between
// them. Reuses the server's own pure clamp functions; never trusted as
// authority by anything downstream of this -- the authoritative PUT
// response always reconciles or rolls this back.
export function computeOptimisticExpended(
  current: { max: number, expended: number },
  action: 'expend' | 'restore',
  amount: number
): number {
  const probe: Record<string, number> = { current: current.expended }
  const next = action === 'expend'
    ? expendResource(probe, 'current', current.max, amount)
    : restoreResource(probe, 'current', amount)
  return next.current ?? 0
}

// ---------------------------------------------------------------------------
// Per-key serialized write queue.
// ---------------------------------------------------------------------------
// Deliberately NOT "coalesce rapid clicks into one write" (Option B,
// considered and rejected): a rapid EXPEND then RESTORE has no single
// combined request to coalesce into (the route takes exactly one
// direction per call, and inventing a batch/delta endpoint would be new
// server contract this task does not need), and the server already
// independently clamps every individual call's result against the real
// max/zero -- so a strict per-resource FIFO of individual calls (Option
// A) is both simpler and sufficient.
export type ResourceWriteQueue = {
  // Chains `task` onto whatever is already queued for `key`; `task` never
  // starts until every previously-enqueued task for the SAME key has
  // settled (success or failure). Different keys' queues never wait on
  // each other.
  enqueue: (key: string, task: () => Promise<void>) => Promise<void>
  // True while at least one task for `key` is queued or running.
  isPending: (key: string) => boolean
}

export function createResourceWriteQueue(): ResourceWriteQueue {
  const queues: Record<string, Promise<void>> = {}

  function enqueue(key: string, task: () => Promise<void>): Promise<void> {
    // `.catch(() => {})` on the PREVIOUS link, not on `queued` itself --
    // a failed write must never "poison" the chain for this key (a
    // rejected promise's `.then(task)` would otherwise skip `task`
    // entirely, silently wedging every future click on this same
    // resource). `queued` itself still rejects when THIS task fails, so
    // its own caller (the one `await`ing this specific enqueue call)
    // still genuinely observes the failure.
    const previous = (queues[key] ?? Promise.resolve()).catch(() => {})
    const queued = previous.then(task)
    queues[key] = queued
    // `.finally` attached DIRECTLY to `queued` (not to a derived `.catch()`
    // promise) so this cleanup runs in the SAME settle-callback batch as
    // anything else already awaiting `queued` -- in particular, a caller
    // doing `await enqueue(...)` must see `isPending(key)` already false
    // the instant its own await resumes, never one extra microtask late.
    // The trailing `.catch(() => {})` is attached to `.finally`'s OWN
    // returned promise (a separate downstream link), purely so a failed
    // task here is never reported as an unhandled rejection -- it cannot
    // delay the cleanup above, which already ran.
    queued.finally(() => {
      // Only the LAST-enqueued call for this key clears its own slot --
      // if a newer call has since replaced `queues[key]`, this stale
      // reference no-ops, and `isPending` correctly keeps reporting true
      // until that newer call's own turn finishes.
      if (queues[key] === queued) delete queues[key]
    }).catch(() => {})
    return queued
  }

  function isPending(key: string): boolean {
    return key in queues
  }

  return { enqueue, isPending }
}
