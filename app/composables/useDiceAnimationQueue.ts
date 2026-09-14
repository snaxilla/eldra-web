// useDiceAnimationQueue -- the Dice Presentation Layer's animation HOST.
// Eldra Roll System Phase 3A
// (.github/docs/architecture/eldra-roll-system.md §11,
// adr-023-server-authoritative-gameplay-events.md).
//
// COMPONENT RESPONSIBILITIES (this task's own section): this file owns
// animation STATE, TIMING, QUEUE, and CLEANUP -- nothing else. It never
// reads or writes `useWorldRolls().history`, never knows what a Roll Tray
// is, and never imports a Character Sheet component. A caller
// (useWorldRolls.ts) that owns history decides WHEN to reveal an entry by
// awaiting `enqueue()`'s own returned Promise -- this module only ever
// reports "your turn is done," never "now go update your own state."
//
// A SINGLE, WORLD-SCOPED SINGLETON (this task's own WORLD SCOPE section:
// "every future gameplay system should use the same overlay"). Not
// `useState` -- Nuxt's `useState` exists for SSR-serializable state, and
// this queue's internal bookkeeping (resolver callbacks, a renderer
// instance) is neither serializable nor ever needed during SSR (dice
// animation is an inherently client-only, ephemeral, safe-to-lose-on-reload
// concern -- there is nothing here worth surviving a page refresh). A
// module-scoped singleton, created lazily on first call, is the correct,
// simpler tool: every caller across the app -- WorldDiceOverlay.vue
// (mounted once at the World layout level) and every `useWorldRolls()`
// instance (Character Sheet, Developer Sandbox, any future gameplay
// surface) -- shares the exact same reactive queue with no prop drilling
// and no event bus.
//
// ---------------------------------------------------------------------------
// LIFECYCLE (this task's own LIFECYCLE section)
// ---------------------------------------------------------------------------
//   Roll requested          -- enqueue() is called; the request either
//                               starts running immediately (queue was
//                               empty) or waits its turn (this task's own
//                               QUEUE section: "if multiple Roll Events
//                               arrive quickly, queue them... do not
//                               interrupt an animation... process
//                               sequentially").
//   Roll pending    (state 'pending')   -- popped off the queue, `current`
//                               is now this request, a brief beat before
//                               the placeholder visibly starts.
//   Animation begins (state 'animating') -- the registered
//                               `DiceRendererAdapter.play()` runs, or (all
//                               of Phase 3A, since no renderer exists yet)
//                               a fixed-duration placeholder wait.
//   Animation completes (state 'complete') -- the request's own Promise
//                               resolves with `{ completed: true }` HERE,
//                               which is the exact moment
//                               `useWorldRolls.ts` reveals the roll in
//                               `history` (Phase 2C's Roll Tray already
//                               renders whatever `history` contains --
//                               this is "Roll Tray entry becomes visible"
//                               happening in the CALLER, not in this file).
//   (idle)                  -- after a short hold (so the reveal has a
//                               beat, not an instant cut), `current`
//                               clears and either the next queued request
//                               starts or the overlay has nothing left to
//                               show ("Overlay clears").
//
// A `generation` counter guards every `await` inside the processing loop:
// `clear()` increments it, and a suspended loop iteration that resumes
// after a `clear()` recognizes its own generation is stale and stops
// immediately, rather than mutating `state`/`current` after the queue was
// supposedly reset (this is CLEANUP, not just a queue -- this task's own
// TESTING section names "cleanup" as a first-class thing to verify).
//
// ---------------------------------------------------------------------------
// RENDERER SEAM (~/lib/dice-presentation/renderer.ts)
// ---------------------------------------------------------------------------
// `setRenderer(adapter)` is the ONLY way a real renderer (Phase 3B, not
// built here) ever enters this file. With no adapter registered -- true
// for the whole of Phase 3A -- `animating` runs a fixed
// `PLACEHOLDER_ANIMATION_MS` wait instead, so the full lifecycle above is
// real and observable today, without a single renderer dependency
// installed.

// Explicit `ref`/`computed` import, unlike this codebase's Nuxt-auto-import
// composables (useWorldRolls.ts included) -- this file must also run
// correctly under the project's existing plain-Vitest unit test setup
// (vitest.config.ts has no Nuxt auto-import transform), which this task's
// own TESTING section requires exercising directly (animation queue,
// lifecycle, cleanup, multiple queued rolls). Mirrors
// useCharacterSheetRolls.ts's own identical, already-documented reason for
// doing the same thing. Explicit imports work identically inside Nuxt's
// build, so this loses nothing there.
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { DiceAnimationRequest, DiceAnimationResult, DiceAnimationState } from '~/lib/dice-presentation/types'
import type { DiceRendererAdapter } from '~/lib/dice-presentation/renderer'

// Tasteful, fixed placeholder timings (this task's own "the important
// part is lifecycle, not spectacle"). `PENDING_BEAT_MS`/`COMPLETE_HOLD_MS`
// exist so the STATE CHANGE itself is legible (never an instant, jarring
// cut) and are NOT replaced by a future renderer; `PLACEHOLDER_ANIMATION_MS`
// is what Phase 3A uses in place of a real `play()` call and IS entirely
// superseded once a renderer is registered.
export const PENDING_BEAT_MS = 150
export const PLACEHOLDER_ANIMATION_MS = 900
export const COMPLETE_HOLD_MS = 250

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type QueueEntry = {
  request: DiceAnimationRequest
  resolvers: Array<(result: DiceAnimationResult) => void>
}

export type DiceAnimationQueue = {
  state: Ref<DiceAnimationState>
  current: Ref<DiceAnimationRequest | null>
  queueLength: ComputedRef<number>
  // Queues (or joins, if already queued/animating) one already-persisted
  // roll for celebration. Resolves once this SPECIFIC request's turn is
  // over -- never rejects; a presentation failure is never a gameplay
  // failure (see `runQueue`'s own try/catch around `renderer.play`).
  enqueue: (request: DiceAnimationRequest) => Promise<DiceAnimationResult>
  // The renderer seam (~/lib/dice-presentation/renderer.ts) -- `null`
  // (the default) means "run the built-in placeholder," matching this
  // phase's own "no renderer yet" scope exactly.
  setRenderer: (adapter: DiceRendererAdapter | null) => void
  // Drops every queued and in-flight request immediately, resolving each
  // with `completed: false` rather than leaving any caller's `enqueue()`
  // Promise unresolved forever -- presentation being torn down must never
  // be a reason gameplay truth stays hidden from whoever was waiting to
  // reveal it.
  clear: () => void
}

function createDiceAnimationQueue(): DiceAnimationQueue {
  const state = ref<DiceAnimationState>('idle')
  const current = ref<DiceAnimationRequest | null>(null)
  // Reactive, UI-facing queue contents (e.g. a future "+2 more queued"
  // indicator) -- kept in sync with the internal `entries` array below,
  // which additionally carries each entry's own resolver callbacks that
  // have no business being reactive state.
  const queue = ref<DiceAnimationRequest[]>([])

  const entries: QueueEntry[] = []
  let currentEntry: QueueEntry | null = null
  let renderer: DiceRendererAdapter | null = null
  let running = false
  let generation = 0

  function findEntry(id: string): QueueEntry | null {
    if (currentEntry?.request.id === id) return currentEntry
    return entries.find((entry) => entry.request.id === id) ?? null
  }

  function enqueue(request: DiceAnimationRequest): Promise<DiceAnimationResult> {
    return new Promise((resolve) => {
      // Duplicate suppression by id (mirrors app/lib/rolls/history.ts's
      // own rule) -- the identical roll must never occupy two queue slots
      // or animate twice, whether it arrives twice from one client (a
      // POST response racing its own SSE echo) or is enqueued again
      // before its first turn finishes.
      const existing = findEntry(request.id)
      if (existing) {
        existing.resolvers.push(resolve)
        return
      }

      entries.push({ request, resolvers: [resolve] })
      queue.value = [...queue.value, request]
      void runQueue()
    })
  }

  async function runQueue(): Promise<void> {
    if (running) return
    running = true
    const myGeneration = generation

    while (entries.length > 0) {
      if (generation !== myGeneration) return

      const entry = entries.shift()!
      queue.value = queue.value.filter((queued) => queued.id !== entry.request.id)
      currentEntry = entry
      current.value = entry.request

      state.value = 'pending'
      await wait(PENDING_BEAT_MS)
      if (generation !== myGeneration) return

      state.value = 'animating'
      if (renderer) {
        try {
          await renderer.play(entry.request)
        } catch {
          // The visual flourish failed; the authoritative result still
          // reveals normally -- matching EldraDiceBox.client.vue's own
          // identical posture for the older pipeline.
        }
      } else {
        await wait(PLACEHOLDER_ANIMATION_MS)
      }
      if (generation !== myGeneration) return

      state.value = 'complete'
      const result: DiceAnimationResult = { id: entry.request.id, roll: entry.request.roll, completed: true }
      for (const resolve of entry.resolvers) resolve(result)

      await wait(COMPLETE_HOLD_MS)
      if (generation !== myGeneration) return

      currentEntry = null
      current.value = null
    }

    state.value = 'idle'
    running = false
  }

  function setRenderer(adapter: DiceRendererAdapter | null) {
    renderer = adapter
  }

  function clear() {
    generation += 1

    const stranded = currentEntry ? [currentEntry, ...entries] : [...entries]

    entries.length = 0
    queue.value = []
    currentEntry = null
    current.value = null
    state.value = 'idle'
    running = false

    for (const entry of stranded) {
      const result: DiceAnimationResult = { id: entry.request.id, roll: entry.request.roll, completed: false }
      for (const resolve of entry.resolvers) resolve(result)
    }
  }

  const queueLength = computed(() => queue.value.length)

  return { state, current, queueLength, enqueue, setRenderer, clear }
}

let singleton: DiceAnimationQueue | null = null

export function useDiceAnimationQueue(): DiceAnimationQueue {
  if (!singleton) singleton = createDiceAnimationQueue()
  return singleton
}

// Test-only escape hatch, matching the same need
// tests/server/utils/roll-realtime-bridge.test.ts's own globalThis-backed
// bridge state has, just solved differently here since this singleton is
// a plain module variable, not a globalThis key: without this, every test
// file sharing this module's cache would observe every other test file's
// leftover queue state.
export function __resetDiceAnimationQueueForTests(): void {
  singleton = null
}
