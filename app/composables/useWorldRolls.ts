// useWorldRolls -- Eldra Roll System Phase 2 (Character Sheet
// click-to-roll, .github/docs/architecture/eldra-roll-system.md §8). The
// one client composable a roll-triggering surface calls to talk to the
// real Roll Event API (Phase 1: POST/GET /api/worlds/:id/rolls).
//
// PURELY A CLIENT FOR THE ROLL EVENT API. No gameplay derivation, no dice
// math, no Rules Engine import -- matching §2's "the server decides
// reality, the client makes reality feel magical": a caller here names a
// roll SOURCE (sourceType + sourceKey/expression + actorCharacterId +
// visibility) and this file does nothing but POST it, track pending/
// result/error, and hand back what the server returned, unmodified. It
// never computes a bonus, a total, or a die face.
//
// REPLACES useCharacterSheetRolls.ts AS V2'S ROLL CALL SITE. That
// composable's own header already names this file as its Phase 2
// successor ("a real, production-ready call site must eventually generate
// its seed server-side... this document is that real call site"). It is
// not deleted (CLAUDE.md forbids deleting files without approval) and
// keeps running exactly as before for its one remaining caller, V1's
// entities/[entityId]/sheet.vue -- out of this system's scope entirely.
// No component under app/components/characters/*.vue or
// app/pages/worlds/[id]/characters/** may import
// useCharacterSheetRolls.ts from here on; this file is that surface's only
// roll composable now.
//
// PHASE 2C ADDITION: `nextCursor`/`historyPending`/`historyError`/
// `loadMoreHistory` -- the Roll Tray (WorldRollTray.vue) needs real
// pagination, not just the single-page `refreshHistory` Phase 2 shipped.
// Mirrors AdminRollSandbox.vue's own pre-existing local
// history/nextCursor/historyPending pattern, moved here so the Sandbox and
// every sheet surface share ONE history/pagination implementation instead
// of two ("Do NOT build two history UIs" -- Phase 2C's own instruction).
//
// PHASE 2D ADDITION: this composable now also subscribes to
// GET /api/worlds/:id/rolls/stream (the SSE broadcast
// server/utils/roll-realtime-bridge.ts feeds) automatically on mount and
// unsubscribes automatically on unmount -- no caller action required
// (this task's own CLIENT section). A broadcast roll is inserted through
// the EXACT SAME `prependUniqueRoll` (app/lib/rolls/history.ts) a
// successful `requestRoll` response already used, so `history` -- and
// therefore WorldRollTray.vue, unmodified -- can never tell whether an
// entry came from this client's own POST or another player's `table`
// roll. Duplicate suppression (the requester's own roll, echoed back by
// its own broadcast) is that same function's job, not a second check
// here.
//
// PHASE 3A ADDITION (the Dice Presentation Layer,
// eldra-roll-system.md §11): a NEWLY-ARRIVED roll -- from `requestRoll`'s
// own POST response, or from the SSE broadcast handler -- no longer goes
// straight into `history`. It is first handed to the shared
// `useDiceAnimationQueue()` singleton (~/composables/useDiceAnimationQueue.ts)
// via `revealAfterAnimation`, and only added to `history` once that
// queue's own `enqueue()` Promise resolves -- i.e. once the placeholder
// animation (or, later, a real renderer) has actually played. This is
// "the Roll Tray should now own the animation stage... New behavior:
// Animation placeholder -> History entry" cashed out exactly: this file
// still owns history/reveal-timing, the queue still owns
// animation/timing/queue/cleanup, and neither reaches into the other's
// state. `refreshHistory`/`loadMoreHistory` (bulk, historical pages) are
// deliberately UNCHANGED -- animating dozens of already-old rolls on
// initial load or "Load More" would be exactly the unwanted spectacle
// this phase's own NO RENDERER YET section warns against; only rolls that
// "just happened" pass through the queue at all.

import type { Ref } from 'vue'
import { useDiceAnimationQueue } from '~/composables/useDiceAnimationQueue'
import { prependUniqueRoll } from '~/lib/rolls/history'
import type { RollEventRecord, RollSourceType, RollVisibility } from '~/lib/rolls/types'

export type RollRequestInput = {
  sourceType: RollSourceType
  actorCharacterId?: string | number
  // Required server-side for 'ability' | 'saving_throw' | 'skill' (§4) --
  // the Rules Engine Value id to re-derive a bonus from, e.g.
  // 'value:skill.stealth.bonus'. Never a modifier or a number.
  sourceKey?: string
  sourceId?: string
  // Required for 'action_attack' | 'damage' ONLY (Character Sheet Body
  // Phase 1A) -- names WHICH of this character's own actions to roll;
  // server/utils/character-actions.ts's `resolveAttackAction` re-derives
  // every mechanic from it, never trusting a modifier or expression.
  actionId?: string
  // Required for 'custom' ONLY -- every other sourceType derives its own
  // expression server-side and this field must not be sent for those (the
  // route rejects it, §7).
  expression?: string
  label?: string
  visibility?: RollVisibility
  encounterId?: string | number
  metadata?: Record<string, unknown>
}

// Same extraction shape already established for this exact API by
// app/components/admin/health/rollSandbox.ts's own tested
// `extractServerErrorMessage` -- restated here rather than imported
// because that module lives beside its own Sandbox component and this
// composable has no reason to depend on an admin-only file for a helper
// this small.
function extractRollErrorMessage(error: unknown): string {
  const err = error as any
  return (
    err?.data?.statusMessage ||
    err?.data?.message ||
    err?.statusMessage ||
    err?.message ||
    String(error)
  )
}

export function useWorldRolls(worldId: Ref<string> | string) {
  const pending = ref(false)
  // The latest roll this composable instance has produced -- Phase 2's own
  // "lightweight inline/latest-result presentation," not the full history
  // tray (§9, a later phase).
  const result = ref<RollEventRecord | null>(null)
  const error = ref('')
  // Forward-declared per §8's own sketch of this composable, so a future
  // Roll History Tray (§9) has a ready-made refresh hook rather than
  // inventing its own fetch. Rendered for real by WorldRollTray.vue as of
  // Phase 2C.
  const history = ref<RollEventRecord[]>([])
  // Keyset-pagination state for `loadMoreHistory` (§7's `nextCursor`) --
  // `null` means either "never loaded" or "no more pages," which
  // `WorldRollTray.vue` distinguishes using `history.value.length`.
  const nextCursor = ref<string | null>(null)
  const historyPending = ref(false)
  const historyError = ref('')

  function resolvedWorldId(): string {
    return typeof worldId === 'string' ? worldId : worldId.value
  }

  // The one shared, world-scoped animation queue (Phase 3A) -- calling
  // useDiceAnimationQueue() here does not create a new one; it returns
  // the exact same singleton WorldDiceOverlay.vue reads.
  const diceQueue = useDiceAnimationQueue()

  // ---------------------------------------------------------------------
  // Roll System Phase 3C (Roll Performance Audit) -- client-side pipeline
  // timing. "Measure first, optimize second": logs how long the network
  // round-trip and the queue+animation stage each took, against this
  // phase's own <1000ms (target) / <750ms (stretch) / ~500ms (ideal)
  // click-to-Tray budget. `performance.now()` (monotonic, sub-millisecond),
  // never Date.now(). `clickedAt` is `undefined` for a roll that arrived
  // via SSE broadcast (another player's roll) -- there is no "click" on
  // THIS client for that roll, so only the queue+animation stage is
  // reported, never a misleading "total since click" for an event this
  // client never clicked.
  // ---------------------------------------------------------------------
  function logClientRollPerf(roll: RollEventRecord, clickedAt: number | undefined, respondedAt: number | undefined) {
    return (revealedAt: number) => {
      const parts: string[] = []
      if (clickedAt !== undefined && respondedAt !== undefined) {
        parts.push(`network=${(respondedAt - clickedAt).toFixed(1)}ms`)
        parts.push(`queue+animation=${(revealedAt - respondedAt).toFixed(1)}ms`)
        parts.push(`total=${(revealedAt - clickedAt).toFixed(1)}ms`)
      } else {
        parts.push(`queue+animation=${(revealedAt - (respondedAt ?? revealedAt)).toFixed(1)}ms`)
      }
      console.log(`[roll-perf] client "${roll.label}" ${parts.join(' ')}`)
    }
  }

  // Queues a just-arrived roll for celebration and reveals it in
  // `history` only once its turn is over -- never rejects (see
  // useDiceAnimationQueue.ts's own `enqueue`: a torn-down overlay still
  // resolves every waiting request, just with `completed: false`), so
  // gameplay truth reaching the Tray is never actually blocked on
  // presentation succeeding.
  function revealAfterAnimation(roll: RollEventRecord, clickedAt?: number, respondedAt?: number) {
    const logReveal = logClientRollPerf(roll, clickedAt, respondedAt)
    diceQueue.enqueue({ id: roll.id, roll }).then(() => {
      history.value = prependUniqueRoll(history.value, roll)
      logReveal(performance.now())
    })
  }

  // POST /api/worlds/:id/rolls -- the one write path every roll-triggering
  // control calls. Throws on a server rejection (a stale sourceKey, a
  // capability failure, a malformed custom expression) after recording the
  // message in `error`, so a caller can either read `error` reactively or
  // catch the rejection directly, whichever its own UI needs.
  async function requestRoll(input: RollRequestInput): Promise<RollEventRecord> {
    // As close to "click" as this composable can observe -- the actual DOM
    // click handler that called requestRoll() ran a negligible instant
    // earlier.
    const clickedAt = performance.now()
    pending.value = true
    error.value = ''

    try {
      const roll = await $fetch<RollEventRecord>(`/api/worlds/${resolvedWorldId()}/rolls`, {
        method: 'POST',
        body: input
      })
      const respondedAt = performance.now()
      result.value = roll
      revealAfterAnimation(roll, clickedAt, respondedAt)
      return roll
    } catch (caught) {
      error.value = extractRollErrorMessage(caught)
      throw caught
    } finally {
      pending.value = false
    }
  }

  type RollsListQuery = {
    actorCharacterId?: string | number
    encounterId?: string | number
    limit?: number
  }

  // GET /api/worlds/:id/rolls -- the history refresh hook (§7), first page.
  // Replaces `history` outright rather than merging, matching that
  // endpoint's own newest-first contract, and resets `nextCursor` to
  // whatever this fresh page reports.
  async function refreshHistory(query: RollsListQuery = {}): Promise<void> {
    historyPending.value = true
    historyError.value = ''

    try {
      const response = await $fetch<{ rolls: RollEventRecord[]; nextCursor: string | null }>(
        `/api/worlds/${resolvedWorldId()}/rolls`,
        { method: 'GET', query }
      )
      history.value = response.rolls
      nextCursor.value = response.nextCursor
    } catch (caught) {
      historyError.value = extractRollErrorMessage(caught)
      throw caught
    } finally {
      historyPending.value = false
    }
  }

  // Resumes from `nextCursor` and APPENDS the next page -- the Roll Tray's
  // "Load More" (§9's own "retain the existing pagination... Load More
  // belongs at the bottom"). A no-op when there is nothing more to load or
  // a load is already in flight, so a caller can wire this directly to a
  // button's `@click` without its own guard.
  async function loadMoreHistory(query: RollsListQuery = {}): Promise<void> {
    if (!nextCursor.value || historyPending.value) return

    historyPending.value = true
    historyError.value = ''

    try {
      const response = await $fetch<{ rolls: RollEventRecord[]; nextCursor: string | null }>(
        `/api/worlds/${resolvedWorldId()}/rolls`,
        { method: 'GET', query: { ...query, cursor: nextCursor.value } }
      )
      history.value = [...history.value, ...response.rolls]
      nextCursor.value = response.nextCursor
    } catch (caught) {
      historyError.value = extractRollErrorMessage(caught)
      throw caught
    } finally {
      historyPending.value = false
    }
  }

  // ---------------------------------------------------------------------
  // Realtime -- GET /api/worlds/:id/rolls/stream (§10, Phase 2D). One
  // EventSource per composable instance (matching one `useWorldRolls()`
  // call per mounted roll-triggering page/component), opened on mount and
  // closed on unmount -- `EventSource` is a browser-only API, and
  // `onMounted`/`onBeforeUnmount` already guarantee this never runs
  // during SSR.
  // ---------------------------------------------------------------------

  let eventSource: EventSource | null = null

  function handleRollBroadcast(event: MessageEvent) {
    try {
      const payload = JSON.parse(event.data)
      if (payload?.roll) {
        revealAfterAnimation(payload.roll as RollEventRecord)
      }
    } catch {
      // A malformed broadcast payload is not this client's problem to
      // surface as an error -- the next well-formed event (or the next
      // `refreshHistory`) recovers on its own.
    }
  }

  function subscribeToRollBroadcasts() {
    if (eventSource) return

    eventSource = new EventSource(`/api/worlds/${resolvedWorldId()}/rolls/stream`)
    eventSource.addEventListener('roll', handleRollBroadcast)
    // No `onerror` handling beyond letting it exist: EventSource retries
    // a dropped connection on its own (the platform's own reconnect,
    // this task's own "disconnect/reconnect" behavior) -- there is
    // nothing this composable needs to do differently while that
    // happens, since `history` already reflects everything up to the
    // drop and `refreshHistory`/`loadMoreHistory` remain available
    // regardless of stream state.
  }

  function unsubscribeFromRollBroadcasts() {
    eventSource?.close()
    eventSource = null
  }

  onMounted(subscribeToRollBroadcasts)
  onBeforeUnmount(unsubscribeFromRollBroadcasts)

  return {
    pending,
    result,
    error,
    history,
    nextCursor,
    historyPending,
    historyError,
    requestRoll,
    refreshHistory,
    loadMoreHistory
  }
}
