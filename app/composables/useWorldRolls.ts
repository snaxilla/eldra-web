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

import type { Ref } from 'vue'
import type { RollEventRecord, RollSourceType, RollVisibility } from '~/lib/rolls/types'

export type RollRequestInput = {
  sourceType: RollSourceType
  actorCharacterId?: string | number
  // Required server-side for 'ability' | 'saving_throw' | 'skill' (§4) --
  // the Rules Engine Value id to re-derive a bonus from, e.g.
  // 'value:skill.stealth.bonus'. Never a modifier or a number.
  sourceKey?: string
  sourceId?: string
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
  // inventing its own fetch. Nothing in Phase 2 renders this list.
  const history = ref<RollEventRecord[]>([])

  function resolvedWorldId(): string {
    return typeof worldId === 'string' ? worldId : worldId.value
  }

  // POST /api/worlds/:id/rolls -- the one write path every roll-triggering
  // control calls. Throws on a server rejection (a stale sourceKey, a
  // capability failure, a malformed custom expression) after recording the
  // message in `error`, so a caller can either read `error` reactively or
  // catch the rejection directly, whichever its own UI needs.
  async function requestRoll(input: RollRequestInput): Promise<RollEventRecord> {
    pending.value = true
    error.value = ''

    try {
      const roll = await $fetch<RollEventRecord>(`/api/worlds/${resolvedWorldId()}/rolls`, {
        method: 'POST',
        body: input
      })
      result.value = roll
      history.value = [roll, ...history.value]
      return roll
    } catch (caught) {
      error.value = extractRollErrorMessage(caught)
      throw caught
    } finally {
      pending.value = false
    }
  }

  // GET /api/worlds/:id/rolls -- the history refresh hook (§7). Replaces
  // `history` outright with the fetched page rather than merging, matching
  // that endpoint's own newest-first contract; a future tray adds its own
  // cursor-paging on top of this same call.
  async function refreshHistory(query: {
    actorCharacterId?: string | number
    encounterId?: string | number
    limit?: number
    cursor?: string | null
  } = {}): Promise<void> {
    const response = await $fetch<{ rolls: RollEventRecord[]; nextCursor: string | null }>(
      `/api/worlds/${resolvedWorldId()}/rolls`,
      { method: 'GET', query }
    )
    history.value = response.rolls
  }

  return { pending, result, error, history, requestRoll, refreshHistory }
}
