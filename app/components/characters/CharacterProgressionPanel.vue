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
               this file's own header. Always empty against the current
               Rules Package, never hidden entirely: the moment a future
               package declares one, it appears here with no template
               change. -->
          <div
            v-if="step.requiredChoices.length"
            class="mt-2 grid gap-2"
          >
            <p
              v-for="choice in step.requiredChoices"
              :key="choice.id"
              class="text-xs text-[#e0a94a]"
            >
              Requires: {{ choice.label }} (choose {{ choice.count }})
            </p>
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
