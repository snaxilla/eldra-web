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
        { method: 'POST', body: { targetLevel, answers: answers.value } }
      )
      plan.value = response.plan
    } catch (caught) {
      planError.value = extractErrorMessage(caught)
    } finally {
      planPending.value = false
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
  async function confirm(): Promise<boolean> {
    if (confirming.value || !plan.value) return false
    const { targetLevel, fingerprint } = plan.value

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
