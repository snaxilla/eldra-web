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
//    DIFFERENT resourceIds fully independent of one another. This
//    guarantees responses for one resourceId are never seen out of the
//    order their own requests were sent -- but, on its own, does NOT
//    guarantee an EARLIER request's response can never visibly overwrite
//    a NEWER optimistic guess already applied ahead of it (see
//    `createResourceWriteSequencer` immediately below for that gap).
// 4. SEQUENCING -- `createResourceWriteSequencer`: a real, reproduced
//    browser defect (see this file's own test suite, "rapid double-click"),
//    found DOWNSTREAM of the queue above. The queue only serializes
//    NETWORK CALLS; it says nothing about which RESPONSE is still the
//    user's current intent by the time it arrives. Two rapid clicks on
//    the same orb (expend, expend) produce: optimistic 1, optimistic 2,
//    THEN click 1's own PUT resolves and unconditionally re-applies ITS
//    OWN authoritative value (1) -- visibly reverting the display back
//    to "1 expended" for one render, before click 2's PUT finally
//    resolves and corrects it back to 2. The sequencer hands each write a
//    ticket; a write's success/failure handler only touches the DISPLAYED
//    override if its own ticket is STILL the latest one issued for that
//    resourceId -- a superseded response's value is never shown directly,
//    since a newer write (whose own eventual response WILL be applied)
//    has already superseded it.
//
//    FAILURE RECONCILIATION -- a superseded SUCCESS is still RECORDED
//    (`recordConfirmed`), even though it is not shown, because it is a
//    REAL, persisted server fact a later FAILURE must be able to fall
//    back to. Example: click A (expend, succeeds, server confirms
//    expended=1) is superseded by click B (expend, issued before A's
//    response lands); if B then FAILS, the display must settle on A's
//    own confirmed 1 -- NOT on the original pre-click base (0, which
//    would silently un-spend a use the server genuinely recorded) and
//    NOT on B's own failed optimistic guess (2, which never happened).
//    A failure handler therefore rolls back to `getLastConfirmed`, never
//    straight to the base, and only clears the override outright when
//    NOTHING for that resourceId has ever been confirmed in this session.

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

// ---------------------------------------------------------------------------
// Per-key write sequencer -- real browser defect, rapid double-click.
// ---------------------------------------------------------------------------
// See this file's own header, decision 4, for the full scenario this
// closes. `next(resourceId)` is called ONCE per write, synchronously,
// at the same moment the optimistic overlay is applied (never inside the
// queued task itself, which may not run until long after a NEWER click
// has already issued its own ticket). A write's response handler then
// asks `isLatest(resourceId, itsOwnTicket)` before touching the override:
// true only for the most recently issued ticket for that resourceId --
// false for any ticket a later click has since superseded, in which case
// the response is silently dropped (the superseding click's own eventual
// response is what will be applied instead).
export type ResourceWriteSequencer = {
  next: (resourceId: string) => number
  isLatest: (resourceId: string, ticket: number) => boolean
  // Records a write's REAL, server-confirmed expended count -- called on
  // every success, regardless of whether that ticket is still latest (a
  // superseded success is still a fact a later failure may need). Never
  // called on failure: a failed write confirms nothing.
  recordConfirmed: (resourceId: string, expended: number) => void
  // CROSS-CHARACTER LEAK -- this sequencer is created ONCE per Sheet
  // page MOUNT (useCharacterMutations.ts), not once per character: there
  // is no `:key` on `<NuxtPage/>` forcing a remount when only the
  // `:characterId` route param changes, so navigating from one
  // character's Sheet to another's (same route component) reuses the
  // SAME sequencer instance. Resource ids are GENERIC, package-authored
  // strings ('resource:rage', ...), shared by every character who has
  // that resource -- so without a reset, a value confirmed for character
  // A is still sitting in `lastConfirmed` when character B's own later
  // failure looks it up, reconciling to A's leftover number instead of
  // B's own, correct base. The caller resets this on every characterId
  // change (`watch(characterId, ...)` in useCharacterMutations.ts).
  reset: () => void
  // The most recently CONFIRMED (successfully persisted) value for this
  // resourceId in this session, or `undefined` if nothing ever succeeded
  // -- the fallback a failure handler reconciles to, never the original
  // base (which would silently discard an earlier sibling write's real,
  // persisted result).
  getLastConfirmed: (resourceId: string) => number | undefined
}

export function createResourceWriteSequencer(): ResourceWriteSequencer {
  // ONE counter shared across every resourceId, and NEVER reset -- see
  // `reset()` below for why. A per-resourceId counter that restarted at 1
  // on every reset could let a stale PRE-reset ticket numerically collide
  // with a fresh POST-reset one for the same resourceId; a single
  // never-rewound counter makes every ticket this sequencer has ever
  // issued globally unique, so a reset can never produce a collision.
  let counter = 0
  let latestTicket: Record<string, number> = {}
  let lastConfirmed: Record<string, number> = {}

  function next(resourceId: string): number {
    const ticket = ++counter
    latestTicket[resourceId] = ticket
    return ticket
  }

  function reset(): void {
    // Fresh objects, not `delete`-each-key -- a write issued before the
    // reset (e.g. a slow request from the PREVIOUS character, still in
    // flight) that resolves afterward looks up a resourceId that no
    // longer exists in the NEW map at all, so `isLatest` correctly reads
    // false (superseded). `counter` is deliberately NOT reset here (see
    // its own comment) -- only the per-resourceId records are cleared.
    latestTicket = {}
    lastConfirmed = {}
  }

  function isLatest(resourceId: string, ticket: number): boolean {
    return latestTicket[resourceId] === ticket
  }

  function recordConfirmed(resourceId: string, expended: number): void {
    lastConfirmed[resourceId] = expended
  }

  function getLastConfirmed(resourceId: string): number | undefined {
    return lastConfirmed[resourceId]
  }

  return { next, isLatest, recordConfirmed, getLastConfirmed, reset }
}
