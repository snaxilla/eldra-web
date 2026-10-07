// D&D 2024 Character Rules Phase 2A.1 UX Correction -- pure helpers behind
// CharacterProgressionPanel.vue's generic non-distinct multi-select
// rendering.
//
// Extracted for the same reason app/components/characters/builder/
// characterBuilderSelection.ts already is: this repo has no DOM test
// environment (vitest.config.ts is `environment: 'node'`), so a Vue
// template's own decision logic is only unit-testable when it lives in a
// plain module beside the component. Everything here is pure -- no I/O, no
// Vue, no DOM.
//
// ---------------------------------------------------------------------------
// THE GAP THIS CLOSES
// ---------------------------------------------------------------------------
// CharacterProgressionPanel.vue's pre-existing multi-select control is a
// checkbox list (`toggleMulti`): clicking an ALREADY-CHECKED option REMOVES
// it. That is correct for every choice with `distinct` omitted/true (an
// option may appear at most once in `selected`), but structurally cannot
// represent a `distinct: false` choice's own legal duplicate-occurrence
// answers -- `choice:feat.asi-ability-increase`'s real "+2 to one ability"
// shape needs the SAME option selected twice, which no checkbox can express
// (checking a box twice is definitionally impossible). The engine and
// server have supported this since Phase 2A.1's own implementation; this
// correction is the missing UI affordance, not a new server capability.
//
// ---------------------------------------------------------------------------
// WHY A DRAFT ARRAY, SEPARATE FROM THE EMITTED ANSWER
// ---------------------------------------------------------------------------
// The emitted answer (`string[]`, the same shape `validateChoiceSelection`
// already requires) can never contain a blank placeholder -- every member
// must be a real Definition id. That is fine for a COMPLETE answer, but
// loses positional information for an INCOMPLETE one: if a user fills slot
// 2 before slot 1, the emitted array (whatever is non-blank) would be
// `['wis']` with no way to tell, on the next render, whether that value
// belongs in slot 1 or slot 2 -- re-deriving slot positions FROM the
// filtered emitted array is lossy and would silently move the user's own
// pick to the wrong slot the moment they filled a LATER slot first.
//
// So the component keeps its own DRAFT array -- always exactly `count`
// entries, `''` meaning "empty" -- as local UI state, seeded ONCE from the
// current answer (`draftFromAnswer`) and updated in place
// (`applySlotChange`) thereafter; only `draftToAnswer` ever produces the
// filtered, server-shaped answer, and only at emit time. This mirrors the
// same "decoupled draft ref, seeded from props, mutated locally, never
// re-derived from what was last sent" pattern this codebase already uses
// for `healthDraft`/`noteDraft` (useCharacterSheet.ts) -- not a new pattern
// invented for this choice shape.
//
// ---------------------------------------------------------------------------
// THE GENERIC RULE, NOT AN ASI SPECIAL CASE
// ---------------------------------------------------------------------------
// Every function here reads only `count`/`distinct`/`selected`/a draft
// array -- the same generic choice metadata the checkbox/radio paths
// already key off of. No feat id, no ability name, no "ASI", no level, no
// class appears anywhere in this file. A future package-authored choice
// with the identical shape (count > 1, distinct: false) renders through
// this exact path with zero code change here, which is the whole point.

export type PresentableProgressionChoice = {
  count: number
  distinct?: boolean
}

// A choice needs ONE SELECTION CONTROL PER REQUIRED SLOT (rather than the
// existing checkbox list) exactly when it BOTH permits repeats
// (`distinct === false`) AND requires more than one pick. `count <= 1`
// stays on the existing single-select/radio path unchanged -- "the same
// option twice" has no meaning when only one pick is ever required, so
// there is nothing for this new rendering mode to add there. `distinct`
// omitted or `true` (every choice authored before this phase, and every
// OTHER choice authored since) stays on the existing checkbox path,
// unchanged -- this function must return `false` for those, never enable
// duplicates globally.
export function isNonDistinctMultiSelect(choice: PresentableProgressionChoice): boolean {
  return choice.count > 1 && choice.distinct === false
}

// Seeds an initial DRAFT array (see this file's own header) of exactly
// `count` slots from a stored/tentative `selected` answer -- positional,
// `''` for any slot the answer does not (yet) fill. Called ONCE per choice
// (the first time its id is seen), never on every render -- re-seeding
// from `selected` on every render is exactly the lossy round-trip this
// file's header explains why to avoid.
export function draftFromAnswer(selected: readonly string[], count: number): string[] {
  const draft: string[] = []
  for (let index = 0; index < count; index++) {
    draft.push(selected[index] ?? '')
  }
  return draft
}

// The ONE place a single slot's new pick becomes the NEXT draft array.
// Total, never throws: an out-of-range `slotIndex` is simply not present
// in `draft` and this returns `draft` unchanged, the same "do nothing
// rather than guess" posture every other pure mutation in this codebase's
// `app/lib/characters/*` family already takes for an out-of-range input.
export function applySlotChange(draft: readonly string[], slotIndex: number, value: string): string[] {
  if (slotIndex < 0 || slotIndex >= draft.length) return [...draft]
  const next = [...draft]
  next[slotIndex] = value
  return next
}

// The ONE place a draft array becomes the emitted, server-shaped answer.
// Blank slots are dropped entirely, never submitted as an empty-string
// array member -- an incomplete answer is therefore a SHORTER array than
// `count`, never a same-length array with holes in it.
//
// PARTIAL SELECTION (this phase's own explicit question, answered per its
// own instruction to "use existing progression-choice conventions"): this
// mirrors the EXISTING checkbox path's own behavior exactly --
// `toggleMulti` (CharacterProgressionPanel.vue) already emits whatever
// `selected` currently holds after every single click, complete or not,
// and relies entirely on the server's own `validateChoiceSelection`
// (count mismatch) to report the choice as unanswered until every slot is
// filled. This is the identical "always emit the current real state, let
// count-validation decide answered-ness" rule, restated for slots instead
// of toggles -- not a new policy invented for this choice shape.
export function draftToAnswer(draft: readonly string[]): string[] {
  return draft.filter((slot) => slot !== '')
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules Phase 2A.1 UX Correction (round 2) --
// RECONCILIATION across a plan replacement.
// ---------------------------------------------------------------------------
// VERIFIED, NOT ASSUMED: `character-derived.ts` only ever echoes a choice's
// `selected` back as non-empty when the stored/tentative answer FULLY and
// VALIDLY answers it (`validateChoiceSelection`'s own count check -- a
// Definition-kind choice's answer only reaches `ActorState.choices` at all
// when `validation.ok` is true). A still-incomplete answer -- `['int']`
// against a `count: 2` choice -- is therefore echoed back as `selected: []`
// by every rebuilt plan, NOT as `['int']`. Re-seeding a slot draft from
// `choice.selected` on every incoming plan (rather than only once, the
// first time a choice id is seen) would therefore erase an in-progress,
// still-incomplete selection the instant the NEXT unrelated choice
// triggers a re-preview -- the real browser defect this reconciliation
// closes, independent of (and in addition to) not blanking the plan
// itself during that re-preview.
export type PresentableProgressionChoiceForReconciliation = {
  id: string
  count: number
  distinct?: boolean
  selected: readonly string[]
}

// One generic rule, applied per choice id, never per feat/ability/class:
//   - a choice still present in the new plan, with an EXISTING local draft
//     -> the draft survives UNCHANGED (it is UX state the user is mid-way
//        through; only the user's own edits or an authoritative COMPLETE
//        answer may change it -- see `draftFromAnswer`'s own "echoed only
//        when complete" note above for why the complete case is already
//        handled: a complete answer seeds correctly the FIRST time a
//        choice id is seen, and never needs re-seeding after that since
//        the draft itself already reflects it).
//   - a choice newly present, with NO existing draft -> seeded from
//     whatever the new plan echoes (`draftFromAnswer`), exactly as before.
//   - a choice NO LONGER present in the new plan -> its draft is dropped
//     entirely (never left as orphaned state that could leak into a
//     different, later choice that happened to reuse the same id).
// Only `isNonDistinctMultiSelect` choices are tracked at all -- radio and
// checkbox choices remain fully props-driven (no draft) exactly as before.
export function reconcileSlotDrafts(
  existingDrafts: Readonly<Record<string, readonly string[]>>,
  currentChoices: readonly PresentableProgressionChoiceForReconciliation[]
): Record<string, string[]> {
  const next: Record<string, string[]> = {}

  for (const choice of currentChoices) {
    if (!isNonDistinctMultiSelect(choice)) continue

    const existing = existingDrafts[choice.id]
    next[choice.id] = existing ? [...existing] : draftFromAnswer(choice.selected, choice.count)
  }

  return next
}

// P7 -- true when ONE option already fills its per-option ceiling in the OTHER slots, so this
// slot must not offer it again. No ceiling (`undefined`) means an option is never at its cap.
// Pure and slot-positional, so it is testable without a DOM (see this file's header).
export function isSlotOptionAtCap(
  draft: readonly string[],
  slotIndex: number,
  option: string,
  maxPerOption: number | undefined
): boolean {
  if (maxPerOption === undefined) return false
  const elsewhere = draft.filter((value, index) => index !== slotIndex && value === option).length
  return elsewhere >= maxPerOption
}
