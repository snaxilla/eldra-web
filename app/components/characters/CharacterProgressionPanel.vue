<script setup lang="ts">
// CharacterProgressionPanel -- Character Progression Phase 1A's Game Admin
// Level Manager surface.
//
// THIS COMPONENT CALCULATES NOTHING, the same rule every other Sheet panel
// in this family states for itself. The current level, every automatic
// consequence, every required choice, and whether a transition is valid all
// arrive as PROPS already decided by the server
// (server/utils/character-progression-plan.ts) -- this file reads them,
// never derives a level, a Proficiency Bonus, or a choice option itself.
//
// GENERIC ON PURPOSE: no class name, no "Wizard", no 5e vocabulary anywhere
// in this file. `requiredChoices` (always empty against the current Rules
// Package -- see character-progression-plan.ts's own header) renders from
// whatever `label`/`options`/`count` the server sends, exactly the same
// "render from the plan, never `if class === X`" rule this Sheet's own
// CharacterActionsPanel.vue already follows for spell Casts.
//
// GAME ADMIN ONLY: this panel exists at all only because the page renders
// it behind `canEditCharacter` (the same `world.character.edit_any` client
// hint every other admin-only Sheet control already uses) -- it has no
// permission check of its own, matching this task's own "authorization
// belongs at the route/UI boundary, not baked into the domain" requirement.
// A future player-facing Level Up Wizard reuses the identical
// useCharacterProgression composable this panel calls, behind a different
// gate.

import {
  applySlotChange,
  draftToAnswer,
  isNonDistinctMultiSelect,
  reconcileSlotDrafts
} from './characterProgressionChoicePresentation'

export type ProgressionAutomaticConsequenceRow = {
  id: string
  label?: string
  previousValue: unknown
  newValue: unknown
}

export type ProgressionChoiceOptionRow = { id: string; label: string }

export type ProgressionChoiceRow = {
  id: string
  label: string
  options: ProgressionChoiceOptionRow[]
  count: number
  // Character Progression Phase 1B additions -- this choice's own current
  // (possibly tentative) selection and whether it validly answers the
  // choice, mirroring app/lib/characters/progression-plan.ts's own
  // `ProgressionChoice` exactly.
  selected: string[]
  answered: boolean
  // Character Progression Phase 1C -- mirrors `ProgressionChoice.kind`.
  // Not branched on by this panel's own rendering (options/selected/
  // answered already render identically regardless of kind, per this
  // phase's own "reuse the generic choice surface, no Wizard/subclass-
  // specific component" requirement) -- carried through only so this row
  // type stays an honest mirror of the real one.
  kind: 'definition' | 'content'
  // D&D 2024 Character Rules Phase 2A.1 UX Correction -- mirrors
  // `ProgressionChoice.distinct` (app/lib/characters/progression-plan.ts).
  // See `isNonDistinctMultiSelect`'s own header
  // (characterProgressionChoicePresentation.ts) for what this changes.
  distinct?: boolean
}

export type ProgressionLevelStepRow = {
  level: number
  automaticConsequences: ProgressionAutomaticConsequenceRow[]
  requiredChoices: ProgressionChoiceRow[]
}

export type ProgressionPlanRow = {
  currentLevel: number
  targetLevel: number
  steps: ProgressionLevelStepRow[]
  unresolvedChoiceIds: string[]
  unresolvedDecisions?: { decisionId: string, source: string, level: number, owner: { name: string } }[]
  valid: boolean
  fingerprint: string
}

const props = withDefaults(defineProps<{
  currentLevel?: number | null
  pending?: boolean
  errorMessage?: string
  plan?: ProgressionPlanRow | null
  planPending?: boolean
  planErrorMessage?: string
  confirming?: boolean
  confirmErrorMessage?: string
}>(), {
  currentLevel: null,
  pending: false,
  errorMessage: '',
  plan: null,
  planPending: false,
  planErrorMessage: '',
  confirming: false,
  confirmErrorMessage: ''
})

const emit = defineEmits<{
  preview: [{ targetLevel: number }]
  confirm: []
  clearPlan: []
  // Character Progression Phase 1B -- a generic "this choice's own
  // selection changed" event, never named per-choice/per-class. The page
  // (sheet-v2.vue) relays this straight to useCharacterProgression.ts's own
  // `setAnswer`, which re-previews automatically -- this panel never calls
  // the Progression API directly, matching every other emit above.
  answer: [{ choiceId: string; selected: string[] }]
}>()

// Advancement only -- see character-progression-plan.ts's own LEVEL DOWN
// header for why. The picker therefore only ever offers levels above the
// character's own current one.
const MAX_LEVEL = 20

const selectedTargetLevel = ref<number | null>(null)

const availableTargetLevels = computed(() => {
  const from = (props.currentLevel ?? 1) + 1
  if (from > MAX_LEVEL) return []
  const levels: number[] = []
  for (let level = from; level <= MAX_LEVEL; level++) levels.push(level)
  return levels
})

watch(availableTargetLevels, (levels) => {
  if (selectedTargetLevel.value !== null && !levels.includes(selectedTargetLevel.value)) {
    selectedTargetLevel.value = null
  }
}, { immediate: true })

function requestPreview() {
  if (!selectedTargetLevel.value || props.planPending) return
  emit('preview', { targetLevel: selectedTargetLevel.value })
}

function requestConfirm() {
  // D&D 2024 Character Rules Phase 2A.1 UX Correction -- `planPending`
  // added, mirroring the button's own `:disabled` and
  // useCharacterProgression.ts's own `confirm()` guard: Confirm must stay
  // unavailable while a newer preview is still being built.
  if (props.confirming || props.planPending || !props.plan?.valid) return
  emit('confirm')
}

// Character Progression Phase 1B -- GENERIC CHOICE UX. Renders a
// single-select (radio) control when a choice needs exactly one pick and a
// multi-select (checkbox list) otherwise -- the SAME two-shape rule
// app/lib/spell-mechanics's own Cast Configuration choices already use for
// an identical reason (SpellChoice's own `count`-driven control), never a
// per-choice-id/per-class special case. No universal form engine: a choice
// needing more exotic input than "pick N from a list" is not something the
// current package/content model produces at all (see this phase's own
// audit), so nothing here anticipates one.
//
// D&D 2024 Character Rules Phase 2A.1 UX Correction -- this is now a
// THREE-shape rule, not two: `count === 1` stays radio; `count > 1` splits
// further on `distinct` (`isNonDistinctMultiSelect`, imported above) into
// the existing checkbox list (distinct omitted/true -- unchanged) or the
// new one-control-per-slot rendering (`distinct: false`) -- see
// characterProgressionChoicePresentation.ts's own header for why a
// checkbox list cannot represent the latter at all.
function isSingleSelect(choice: ProgressionChoiceRow): boolean {
  return choice.count === 1
}

function selectSingle(choice: ProgressionChoiceRow, optionId: string) {
  emit('answer', { choiceId: choice.id, selected: [optionId] })
}

function toggleMulti(choice: ProgressionChoiceRow, optionId: string) {
  const already = choice.selected.includes(optionId)
  const next = already
    ? choice.selected.filter((id) => id !== optionId)
    : [...choice.selected, optionId]
  emit('answer', { choiceId: choice.id, selected: next })
}

// D&D 2024 Character Rules Phase 2A.1 UX Correction -- the non-distinct
// counterpart of `toggleMulti` immediately above, for a choice whose
// `distinct: false` legally permits the SAME option to occupy more than
// one of its `count` required slots (e.g. Ability Score Improvement's own
// real "+2 to one ability" shape: the identical option in both slots).
//
// LOCAL DRAFT STATE, keyed by choice id -- see characterProgressionChoicePresentation.ts's
// own "WHY A DRAFT ARRAY" header for why this cannot be re-derived from
// `choice.selected` on every render (filling a LATER slot before an
// EARLIER one would otherwise silently relocate the user's own pick to
// the wrong slot), and its own RECONCILIATION header for why a PARTIAL
// draft specifically must survive a plan replacement (the server only
// ever echoes a choice's answer once it is COMPLETE -- an in-progress
// selection is never echoed back, so re-seeding from `choice.selected` on
// every incoming plan would erase it the instant any OTHER choice
// triggers a re-preview). Mutated locally by the user's own edits,
// exactly like this Sheet's own `healthDraft`/`noteDraft` pattern
// (useCharacterSheet.ts).
const slotDrafts = reactive<Record<string, string[]>>({})

// D&D 2024 Character Rules Phase 2A.1 UX Correction (round 2) -- replaces
// the previous fingerprint-keyed "wipe everything" watcher, which this
// panel's own real browser defect traced back to: `useCharacterProgression.ts`'s
// `previewPlan` used to null `plan.value` before every re-preview, which
// transiently set `props.plan` (and therefore `props.plan?.fingerprint`)
// to `undefined` and back on EVERY answered choice -- firing this exact
// watcher on every single re-preview and wiping an in-progress ASI
// selection the instant it ran. That root cause is fixed at its own source
// (`previewPlan` no longer nulls an existing plan); THIS watcher is
// additionally rebuilt to the generic reconciliation rule
// `reconcileSlotDrafts` describes, rather than continuing to rely on
// "the fingerprint merely happens not to change between re-previews" as
// its only protection -- a correct but ACCIDENTAL property of today's
// fingerprint formula (level/package/content identity only, never
// `targetLevel`/answers), not a guarantee this panel should depend on.
//
// `newPlan === null` is the one real, DELIBERATE reset signal left once
// `previewPlan` no longer transiently nulls the plan -- it now only
// happens via Cancel (`clearPlan`) or a successful Confirm, both of which
// legitimately end this editing session and should drop every draft.
watch(
  () => props.plan,
  (newPlan) => {
    if (!newPlan) {
      for (const key of Object.keys(slotDrafts)) delete slotDrafts[key]
      return
    }

    const currentChoices = newPlan.steps.flatMap((step) => step.requiredChoices)
    const reconciled = reconcileSlotDrafts(slotDrafts, currentChoices)

    for (const key of Object.keys(slotDrafts)) {
      if (!(key in reconciled)) delete slotDrafts[key]
    }
    Object.assign(slotDrafts, reconciled)
  },
  { immediate: true, deep: false }
)

// A plain, defensive read -- by the time this template renders, the
// `watch` above (immediate, and re-run on every plan replacement) has
// already reconciled `slotDrafts` for every current choice, so this
// should always find an entry. The blank fallback exists only so a
// genuinely unexpected gap renders empty slots rather than throwing.
function draftFor(choice: ProgressionChoiceRow): string[] {
  return slotDrafts[choice.id] ?? Array(choice.count).fill('')
}

function setSlot(choice: ProgressionChoiceRow, slotIndex: number, value: string) {
  const next = applySlotChange(draftFor(choice), slotIndex, value)
  slotDrafts[choice.id] = next
  emit('answer', { choiceId: choice.id, selected: draftToAnswer(next) })
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>

<template>
  <div class="grid gap-3">
    <p
      v-if="pending"
      class="text-sm text-[#9f9278]"
    >
      Loading progression…
    </p>

    <p
      v-else-if="errorMessage"
      class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </p>

    <template v-else>
      <p class="text-sm text-[#d8ceb8]">
        <span class="text-[#6f6754]">Current Level</span>
        <span class="ml-2 text-base font-semibold text-[#fff7df]">{{ currentLevel }}</span>
      </p>

      <p
        v-if="availableTargetLevels.length === 0"
        class="text-sm text-[#9f9278]"
      >
        This character is already at the maximum level.
      </p>

      <div
        v-else
        class="flex flex-wrap items-end gap-2"
      >
        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Target Level</span>
          <select
            v-model.number="selectedTargetLevel"
            class="eldra-input min-h-11 rounded-none px-3 py-2 text-sm text-white"
          >
            <option
              :value="null"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              Select a level…
            </option>
            <option
              v-for="level in availableTargetLevels"
              :key="level"
              :value="level"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ level }}
            </option>
          </select>
        </label>

        <button
          type="button"
          class="eldra-button min-h-11 rounded-none px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!selectedTargetLevel || planPending"
          @click="requestPreview"
        >
          {{ planPending ? 'Building plan…' : 'Preview' }}
        </button>
      </div>

      <p
        v-if="planErrorMessage"
        class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
      >
        {{ planErrorMessage }}
      </p>

      <div
        v-if="plan"
        class="eldra-well grid gap-3 rounded-none p-3"
      >
        <p class="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-[#9f9278]">
          <span>Plan: Level {{ plan.currentLevel }} → Level {{ plan.targetLevel }}</span>
          <!-- D&D 2024 Character Rules Phase 2A.1 UX Correction -- the plan
               itself stays rendered during a re-preview (see `previewPlan`'s
               own header, useCharacterProgression.ts, for the real defect
               this replaces); this is the "optionally show Recalculating…"
               busy indicator the correction's own EXPECTED BEHAVIOR names,
               never a reason to hide the plan it describes. -->
          <span
            v-if="planPending"
            class="text-[#e0a94a]"
          >
            Recalculating…
          </span>
        </p>

        <div
          v-for="step in plan.steps"
          :key="step.level"
          class="border-l-2 border-[rgba(201,164,90,0.3)] pl-3"
        >
          <p class="text-sm font-semibold text-[#fff7df]">
            Level {{ step.level }}
          </p>

          <ul
            v-if="step.automaticConsequences.length"
            class="mt-1 grid gap-0.5 text-xs text-[#d8ceb8]"
          >
            <li
              v-for="consequence in step.automaticConsequences"
              :key="consequence.id"
            >
              {{ consequence.label || consequence.id }}: {{ formatValue(consequence.previousValue) }} → {{ formatValue(consequence.newValue) }}
            </li>
          </ul>
          <p
            v-else
            class="mt-1 text-xs text-[#6f6754]"
          >
            No automatic changes at this level.
          </p>

          <!-- Rendered generically from whatever the server sends -- see
               this file's own header. Empty for the overwhelming majority
               of levels/characters, never hidden entirely: the moment
               package content declares one, it appears here with no
               template change (Character Progression Phase 1B's own one
               real authored case: Wizard Level 2's Scholar/Expertise
               choice). GENERIC CHOICE UX: single-select (radio) when
               `count === 1`, multi-select (checkbox list) otherwise -- see
               `isSingleSelect`'s own header. -->
          <div
            v-if="step.requiredChoices.length"
            class="mt-2 grid gap-2"
          >
            <div
              v-for="choice in step.requiredChoices"
              :key="choice.id"
              class="eldra-well rounded-none p-2"
            >
              <p class="text-xs font-semibold text-[#e0a94a]">
                Requires: {{ choice.label }} (choose {{ choice.count }})
                <span v-if="choice.answered">✓</span>
              </p>

              <!-- D&D 2024 Character Rules Phase 2A.1 UX Correction -- a
                   THIRD rendering mode, between the single-select radio
                   group and the (distinct) checkbox list: one <select>
                   per required slot, for a `distinct: false` choice that
                   needs more than one pick. See characterProgressionChoicePresentation.ts's
                   own header for why a checkbox list cannot represent this
                   shape at all (the same option legally occupying more
                   than one slot). Generic labels ("Selection N") --
                   nothing here names a feat, an ability, or a class; the
                   generic choice model this panel already reads carries no
                   richer semantic label to use instead. -->
              <div
                v-if="isNonDistinctMultiSelect(choice)"
                class="mt-1.5 grid gap-1.5"
              >
                <label
                  v-for="(slotValue, slotIndex) in draftFor(choice)"
                  :key="slotIndex"
                  class="block"
                >
                  <span class="mb-1 block text-[0.65rem] uppercase tracking-[0.18em] text-[#9f9278]">
                    Selection {{ slotIndex + 1 }}
                  </span>
                  <select
                    :value="slotValue"
                    class="eldra-input min-h-9 w-full rounded-none px-2 py-1.5 text-xs text-white"
                    @change="setSlot(choice, slotIndex, ($event.target as HTMLSelectElement).value)"
                  >
                    <option
                      value=""
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      Select…
                    </option>
                    <option
                      v-for="option in choice.options"
                      :key="option.id"
                      :value="option.id"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>

              <div
                v-else
                class="mt-1.5 grid gap-1"
              >
                <label
                  v-for="option in choice.options"
                  :key="option.id"
                  class="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-[#d8ceb8]"
                >
                  <input
                    v-if="isSingleSelect(choice)"
                    type="radio"
                    :name="choice.id"
                    :checked="choice.selected.includes(option.id)"
                    @change="selectSingle(choice, option.id)"
                  >
                  <input
                    v-else
                    type="checkbox"
                    :checked="choice.selected.includes(option.id)"
                    @change="toggleMulti(choice, option.id)"
                  >
                  {{ option.label }}
                </label>
              </div>
            </div>
          </div>
        </div>

        <p
          v-if="confirmErrorMessage"
          class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
        >
          {{ confirmErrorMessage }}
        </p>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="eldra-button min-h-11 rounded-none px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!plan.valid || confirming || planPending"
            @click="requestConfirm"
          >
            {{ confirming ? 'Confirming…' : 'Confirm Level Up' }}
          </button>

          <button
            type="button"
            class="min-h-11 rounded-none px-3 text-xs text-[#9f9278] transition hover:text-[#d8ceb8]"
            @click="emit('clearPlan')"
          >
            Cancel
          </button>

          <!-- PHASE 0 -- a mandatory decision Eldra cannot record yet is named, never omitted. -->
          <div
            v-if="plan.unresolvedDecisions?.length"
            class="space-y-1 rounded-none border border-[rgba(224,169,74,0.4)] p-3 text-xs text-[#e0a94a]"
          >
            <p
              v-for="item in plan.unresolvedDecisions"
              :key="item.decisionId"
            >
              This level includes a required choice Eldra cannot record yet: {{ item.source }} ({{ item.owner.name }}, level {{ item.level }}).
            </p>
          </div>

          <p
            v-if="!plan.valid && !plan.unresolvedDecisions?.length"
            class="text-xs text-[#e0a94a]"
          >
            Resolve every required choice above before confirming.
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
