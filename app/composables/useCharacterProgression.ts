// useCharacterProgression -- Character Progression Phase 1A (Game Admin
// Level Manager), extended by Phase 1B (Package-Authored Progression
// Declarations + Level-Triggered Choices). The one client composable the
// Level Manager panel calls; mirrors useWorldRolls.ts's own "one focused
// composable per feature area" shape rather than folding into
// useCharacterMutations.ts, since Progression is not one of that
// composable's own five named domains (Recovery/Combat/Inventory/
// Spellcasting/Conditions) and has its own two-step preview/confirm
// lifecycle none of those five share.
//
// PURELY A CLIENT FOR THE PROGRESSION API. No level-transition logic, no
// Rules Engine knowledge, no game vocabulary -- a caller previews a target
// level, reads back a plan the SERVER computed
// (server/utils/character-progression-plan.ts), and confirms that exact
// plan. This file never decides what a level grants, never decides whether
// a choice is legal, and never computes a choice's own answered/valid state
// -- it only relays intent (which level, which tentative answers) and
// renders what the server already decided.
//
// CHOICE ANSWERS DURING PREVIEW (Character Progression Phase 1B) --
// `answers` below is TENTATIVE, client-only state until `confirm()` sends
// it as the transition's own final selections; nothing here ever persists
// it independently. `setAnswer` immediately re-previews the ALREADY-loaded
// plan's own `targetLevel` with the updated answer merged in -- "select an
// option" and "re-evaluate the plan" are the same user action, matching
// this task's own "select answers -> re-evaluate plan -> choices resolve"
// flow without a separate manual re-preview step.
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
import {
  applyPreviewFailure,
  applyPreviewSuccess,
  beginPreviewRequest,
  canConfirm,
  invalidatePendingPreview,
  isStaleRequest,
  type PreviewRequestState
} from './characterProgressionRequestLifecycle'

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

  // Character Progression Phase 1B -- this transition's own TENTATIVE
  // choice selections, keyed by `ProgressionChoice.id` (the SAME stable key
  // the server both reads them back by and, on a successful `confirm()`,
  // persists them under). Client-only state until `confirm()` sends it;
  // never written anywhere on its own -- see this file's own CHOICE
  // ANSWERS DURING PREVIEW header.
  const answers = ref<Record<string, string[]>>({})

  // D&D 2024 Character Rules Phase 2A.1 UX Correction -- every DECISION
  // about the preview-request lifecycle (whether to clear an existing
  // plan, whether a response is still the latest one, whether Confirm is
  // available) lives in the pure, directly-unit-tested
  // characterProgressionRequestLifecycle.ts, not here -- this composable
  // only holds the reactive refs and applies that module's own return
  // values to them. See that file's own header for the real browser
  // defect this replaces: `previewPlan` used to unconditionally null
  // `plan.value` before every request, including the automatic re-preview
  // `setAnswer` issues after EVERY answered choice, which made the entire
  // rendered plan disappear for the duration of every re-preview and, as a
  // direct side effect, wiped CharacterProgressionPanel.vue's own
  // non-distinct slot drafts too (see that component's own reconciliation
  // header for the second half of that chain).
  function requestState(): PreviewRequestState<ProgressionPlan> {
    return { plan: plan.value, planPending: planPending.value, latestRequestId: requestLifecycleId }
  }

  let requestLifecycleId = 0

  async function previewPlan(targetLevel: number): Promise<void> {
    const { nextState, requestId } = beginPreviewRequest(requestState())
    requestLifecycleId = nextState.latestRequestId
    planPending.value = nextState.planPending
    planError.value = ''
    confirmError.value = ''

    try {
      const response = await $fetch<{ ok: true; plan: ProgressionPlan }>(
        `/api/worlds/${resolvedWorldId()}/characters/${resolvedCharacterId()}/progression/plan`,
        { method: 'POST', body: { targetLevel, answers: answers.value } }
      )
      const applied = applyPreviewSuccess(requestState(), requestId, response.plan)
      plan.value = applied.plan
      planPending.value = applied.planPending
    } catch (caught) {
      // Keep the LAST VALID plan visible on a failed re-preview -- the
      // user should still see what they were editing when the request
      // failed, with the error surfaced alongside it, never a blanked
      // panel. `applyPreviewFailure` leaves `plan` untouched; only
      // `planPending` (and, here, the error message) may change, and only
      // if this is still the latest request.
      const stale = isStaleRequest(requestState(), requestId)
      const applied = applyPreviewFailure(requestState(), requestId)
      planPending.value = applied.planPending
      if (!stale) {
        planError.value = extractErrorMessage(caught)
      }
    }
  }

  // Character Progression Phase 1B -- records a tentative answer and
  // immediately re-previews the CURRENTLY LOADED plan's own `targetLevel`
  // with it applied -- "select an option" and "re-evaluate the plan" are
  // the same user action (this file's own header). A no-op with no plan
  // loaded yet, since there is nothing to re-preview against.
  async function setAnswer(choiceId: string, selected: string[]): Promise<void> {
    const targetLevel = plan.value?.targetLevel
    answers.value = { ...answers.value, [choiceId]: selected }
    if (targetLevel !== undefined) await previewPlan(targetLevel)
  }

  // Confirms EXACTLY the plan currently held (its own targetLevel and
  // fingerprint), submitting this composable's own tentative `answers` as
  // that transition's final selections -- never a caller-supplied level, so
  // a stray click can never confirm something other than what was just
  // previewed.
  // D&D 2024 Character Rules Phase 2A.1 UX Correction -- gated through the
  // SAME `canConfirm` predicate CharacterProgressionPanel.vue's own Confirm
  // button now also evaluates: a plan must exist, be valid, and no request
  // (a preview OR a confirm already in flight) may currently be pending.
  // This is the authoritative copy, not merely a UI nicety -- a stray or
  // programmatic call must be refused exactly as a disabled button already
  // prevents a real click.
  async function confirm(): Promise<boolean> {
    if (!canConfirm(plan.value, confirming.value, planPending.value)) return false
    const { targetLevel, fingerprint } = plan.value!

    // Invalidate any preview request still in flight -- a confirm is about
    // to replace `plan`/`answers` wholesale, and a stale preview response
    // arriving afterward must never resurrect the plan this confirm just
    // cleared (see `previewPlan`'s own stale-request guard, which this
    // relies on).
    requestLifecycleId = invalidatePendingPreview(requestState()).latestRequestId

    confirming.value = true
    confirmError.value = ''

    try {
      // The response IS read (typed here for callers who might want it
      // later), but this composable itself only needs to know the write
      // succeeded -- the page's own post-confirm `sheet.refresh()` is what
      // makes the new level (and everything Rules-Engine-derived from it,
      // including any newly-answered progression choice) visible, not
      // anything held here.
      await $fetch<ConfirmProgressionResponse>(
        `/api/worlds/${resolvedWorldId()}/characters/${resolvedCharacterId()}/progression/confirm`,
        { method: 'POST', body: { targetLevel, fingerprint, answers: answers.value } }
      )
      plan.value = null
      answers.value = {}
      return true
    } catch (caught) {
      confirmError.value = extractErrorMessage(caught)
      return false
    } finally {
      confirming.value = false
    }
  }

  function clearPlan(): void {
    // Same reasoning as `confirm()` above -- a stale preview response
    // arriving after Cancel must never repopulate the plan this just
    // cleared.
    requestLifecycleId = invalidatePendingPreview(requestState()).latestRequestId
    plan.value = null
    planError.value = ''
    answers.value = {}
  }

  return {
    plan,
    planPending,
    planError,
    confirming,
    confirmError,
    answers,
    setAnswer,
    previewPlan,
    confirm,
    clearPlan
  }
}
