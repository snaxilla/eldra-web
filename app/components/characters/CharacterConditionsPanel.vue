<script setup lang="ts">
// CharacterConditionsPanel -- Character Sheet Beautification Pass, Phase 2
// (see .github/docs/architecture/character-sheet-beauty-pass.md §8.2,
// §11 Phase 2). Extracted verbatim from sheet-v2.vue's inline Conditions
// markup (nested inside the Encounter section): this character's own
// active conditions -- Display, Remove, Tick duration -- plus the
// Apply-condition form. No automation; a duration reaching zero is
// shown, never auto-cleared (matches encounter.ts's no-automation rule).
//
// Presentation only -- no fetch of its own. `conditions` is
// useCharacterSheet.ts's `conditions` group; `mutations` is
// useCharacterMutations.ts's `conditions` group (Apply/Remove/Tick, plus
// the `draft` form-state object the Apply form binds to directly -- the
// same "shared reactive object passed through as a prop" relationship
// CharacterEncounterPanel.vue's `encounter` prop has, justified here
// because `apply()` itself reads `draft` when called).

import CharacterEmptyState from '~/components/characters/CharacterEmptyState.vue'
import type { EncounterCombatantView, EncounterConditionOption } from '~/composables/useCharacterSheet'

defineProps<{
  conditions: {
    myCombatant: EncounterCombatantView | null
    available: EncounterConditionOption[]
  }
  mutations: {
    draft: { conditionId: string; duration: string; source: string }
    apply: () => void
    remove: (conditionInstanceId: string) => void
    tick: (conditionInstanceId: string, delta: number) => void
  }
  pending: boolean
  encounterEnded: boolean
}>()
</script>

<template>
  <div class="mt-4 border-t border-[rgba(201,164,90,0.14)] pt-4">
    <span class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Conditions</span>

    <div
      v-if="!conditions.myCombatant?.conditions.length"
      class="mt-2"
    >
      <CharacterEmptyState
        compact
        message="None active."
      />
    </div>

    <div
      v-else
      class="mt-2 grid gap-1.5"
    >
      <div
        v-for="condition in conditions.myCombatant!.conditions"
        :key="condition.id"
        class="flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <span class="text-[#d8ceb8]">
          <span class="eldra-gold-chip rounded-none border px-2 py-0.5 uppercase tracking-[0.06em]">{{ condition.label }}</span>
          <span
            v-if="condition.source"
            class="ml-2 text-[#6f6754]"
          >from {{ condition.source }}</span>
        </span>

        <div class="flex shrink-0 items-center gap-1">
          <template v-if="condition.duration !== null">
            <button
              type="button"
              class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-[#d8ceb8] disabled:opacity-50"
              :disabled="pending"
              @click="mutations.tick(condition.id, -1)"
            >
              −
            </button>
            <span class="min-w-6 text-center tabular-nums text-[#fff7df]">{{ condition.duration }}</span>
            <button
              type="button"
              class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-[#d8ceb8] disabled:opacity-50"
              :disabled="pending"
              @click="mutations.tick(condition.id, 1)"
            >
              +
            </button>
          </template>
          <button
            type="button"
            class="min-h-11 rounded-none border border-red-500/20 bg-red-500/10 px-2 text-red-200 disabled:opacity-50"
            :disabled="pending"
            @click="mutations.remove(condition.id)"
          >
            Remove
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="!encounterEnded"
      class="mt-3 grid gap-2"
    >
      <input
        v-model="mutations.draft.conditionId"
        list="my-condition-catalog-options"
        placeholder="Apply condition…"
        class="eldra-input min-h-11 rounded-none px-3 py-2 text-xs"
      >
      <datalist id="my-condition-catalog-options">
        <option
          v-for="option in conditions.available"
          :key="option.id"
          :value="option.id"
        >
          {{ option.label }}
        </option>
      </datalist>
      <div class="grid grid-cols-2 gap-2">
        <input
          v-model="mutations.draft.duration"
          inputmode="numeric"
          placeholder="Duration"
          class="eldra-input min-h-11 rounded-none px-3 py-2 text-xs"
        >
        <input
          v-model="mutations.draft.source"
          placeholder="Source (optional)"
          class="eldra-input min-h-11 rounded-none px-3 py-2 text-xs"
        >
      </div>
      <button
        type="button"
        class="eldra-button min-h-11 rounded-none px-3 text-xs font-semibold disabled:opacity-50"
        :disabled="pending || !mutations.draft.conditionId"
        @click="mutations.apply()"
      >
        Apply
      </button>
    </div>
  </div>
</template>
