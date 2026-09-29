// useCharacterProgression -- Character Progression Phase 1A (Game Admin
// Level Manager). The one client composable the Level Manager panel calls;
// mirrors useWorldRolls.ts's own "one focused composable per feature area"
// shape rather than folding into useCharacterMutations.ts, since Progression
// is not one of that composable's own five named domains (Recovery/Combat/
// Inventory/Spellcasting/Conditions) and has its own two-step preview/
// confirm lifecycle none of those five share.
//
// PURELY A CLIENT FOR THE PROGRESSION API. No level-transition logic, no
// Rules Engine knowledge, no game vocabulary -- a caller previews a target
// level, reads back a plan the SERVER computed
// (server/utils/character-progression-plan.ts), and confirms that exact
// plan. This file never decides what a level grants; it only relays intent
// and renders what the server already decided.
//
// FUTURE PLAYER LEVEL UP WIZARD CONTRACT: `previewPlan`/`confirm` below call
// the EXACT SAME two routes (POST .../progression/plan,
// POST .../progression/confirm) a future player-facing wizard will call --
// this composable is not itself gated to admins; the PAGE decides whether to
// render the panel that uses it (today: `canEditCharacter` only), matching
// this task's own "authorization belongs at the route/UI boundary, not the
// domain" requirement.

import type { Ref } from 'vue'
import type { ProgressionPlan } from '~/lib/characters/progression-plan'
import type { StoredCharacterProgression } from '~/lib/characters/progression'

type ConfirmProgressionResponse = { ok: true; progression: StoredCharacterProgression; currentLevel: number }

function extractErrorMessage(error: unknown): string {
  const err = error as any
  return (
    err?.data?.statusMessage ||
    err?.data?.message ||
    err?.statusMessage ||
    err?.message ||
    String(error)
  )
}

export function useCharacterProgression(worldId: Ref<string> | string, characterId: Ref<string> | string) {
  function resolvedWorldId(): string {
    return typeof worldId === 'string' ? worldId : worldId.value
  }
  function resolvedCharacterId(): string {
    return typeof characterId === 'string' ? characterId : characterId.value
  }

  // No `current`/`refreshCurrent` here: the character's own current total
  // level is already `useCharacterSheet.ts`'s own `characterLevel`
  // (Rules-Engine-derived, refreshed by its existing `refresh()`/
  // `refreshDerived()` -- exactly what a successful `confirm()` below
  // already triggers) -- fetching it a second time from
  // GET .../progression here would be a second, potentially-drifting copy
  // of the identical number. That route still exists server-side (a real,
  // useful read API for a future consumer that needs the raw per-class
  // breakdown), just not duplicated into this composable's own state.

  const plan = ref<ProgressionPlan | null>(null)
  const planPending = ref(false)
  const planError = ref('')

  const confirming = ref(false)
  const confirmError = ref('')

  // Clears any previously-previewed plan -- a stale plan object sitting in
  // memory while the admin picks a NEW target level would be confusing to
  // render and is never valid to confirm against a level they didn't just
  // preview.
  async function previewPlan(targetLevel: number): Promise<void> {
    if (planPending.value) return
    plan.value = null
    planPending.value = true
    planError.value = ''
    confirmError.value = ''

    try {
      const response = await $fetch<{ ok: true; plan: ProgressionPlan }>(
        `/api/worlds/${resolvedWorldId()}/characters/${resolvedCharacterId()}/progression/plan`,
        { method: 'POST', body: { targetLevel } }
      )
      plan.value = response.plan
    } catch (caught) {
      planError.value = extractErrorMessage(caught)
    } finally {
      planPending.value = false
    }
  }

  // Confirms EXACTLY the plan currently held (its own targetLevel and
  // fingerprint) -- never a caller-supplied level, so a stray click can
  // never confirm something other than what was just previewed.
  async function confirm(): Promise<boolean> {
    if (confirming.value || !plan.value) return false
    const { targetLevel, fingerprint } = plan.value

    confirming.value = true
    confirmError.value = ''

    try {
      // The response IS read (typed here for callers who might want it
      // later), but this composable itself only needs to know the write
      // succeeded -- the page's own post-confirm `sheet.refresh()` is what
      // makes the new level (and everything Rules-Engine-derived from it)
      // visible, not anything held here.
      await $fetch<ConfirmProgressionResponse>(
        `/api/worlds/${resolvedWorldId()}/characters/${resolvedCharacterId()}/progression/confirm`,
        { method: 'POST', body: { targetLevel, fingerprint } }
      )
      plan.value = null
      return true
    } catch (caught) {
      confirmError.value = extractErrorMessage(caught)
      return false
    } finally {
      confirming.value = false
    }
  }

  function clearPlan(): void {
    plan.value = null
    planError.value = ''
  }

  return {
    plan,
    planPending,
    planError,
    confirming,
    confirmError,
    previewPlan,
    confirm,
    clearPlan
  }
}
