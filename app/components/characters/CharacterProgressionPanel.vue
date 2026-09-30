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
  if (props.confirming || !props.plan?.valid) return
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
        <p class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">
          Plan: Level {{ plan.currentLevel }} → Level {{ plan.targetLevel }}
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

              <div class="mt-1.5 grid gap-1">
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
            :disabled="!plan.valid || confirming"
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

          <p
            v-if="!plan.valid"
            class="text-xs text-[#e0a94a]"
          >
            Resolve every required choice above before confirming.
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
