<script setup lang="ts">
// CharacterEncounterPanel -- Character Sheet Beautification Pass, Phase 2
// (see .github/docs/architecture/character-sheet-beauty-pass.md §8.2,
// §11 Phase 2). Extracted verbatim from sheet-v2.vue's inline Encounter
// markup: encounter selection, round/current-turn display, Join/Leave.
// Presentation only -- no fetch of its own. `encounter` is
// useCharacterSheet.ts's `encounter` group (a `reactive()` object) passed
// straight through, so selecting an encounter here (`v-model` on a nested
// property of that same shared object) is visible to the composable's own
// `watch` that loads the encounter view -- exactly how selection already
// worked inline before this extraction. `mutations` is
// useCharacterMutations.ts's `conditions` group (Join/Leave live there;
// see that file's header for why they share a domain with the condition
// actions rather than getting a domain of their own).
//
// The Conditions block that used to render nested inside this same
// section stays nested in the same DOM position -- via the `conditions`
// slot -- rather than becoming a new top-level section, since this task's
// own NON-GOALS rule out section movement.

import type { EncounterView } from '~/composables/useCharacterSheet'

const props = defineProps<{
  encounter: {
    available: Array<{ id: string | number; title: string }>
    selectedId: string
    view: EncounterView | null
    pending: boolean
    error: string
    isInSelected: boolean
  }
  mutations: {
    join: () => void
    leave: () => void
  }
}>()

const selectedId = computed({
  get: () => props.encounter.selectedId,
  set: (value: string) => { props.encounter.selectedId = value }
})
</script>

<template>
  <div>
    <label class="block">
      <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Encounter</span>
      <select
        v-model="selectedId"
        class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-[#f5e7bd]"
      >
        <option
          value=""
          class="bg-[#090909]"
        >
          No encounter selected
        </option>
        <option
          v-for="option in encounter.available"
          :key="option.id"
          :value="String(option.id)"
          class="bg-[#090909]"
        >
          {{ option.title }}
        </option>
      </select>
    </label>

    <p
      v-if="encounter.error"
      class="mt-3 rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ encounter.error }}
    </p>

    <template v-if="encounter.view">
      <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Round</span>
          <div class="text-lg font-semibold tabular-nums text-[#fff7df]">{{ encounter.view.round }}</div>
        </div>
        <div>
          <span class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Current Turn</span>
          <div class="text-lg font-semibold text-[#fff7df]">
            {{ encounter.view.currentCombatant?.characterTitle ?? '—' }}
          </div>
        </div>
      </div>

      <button
        v-if="!encounter.isInSelected"
        type="button"
        class="eldra-button mt-3 min-h-11 w-full rounded-none px-3 text-sm font-semibold disabled:opacity-50"
        :disabled="encounter.pending || encounter.view.status === 'ended'"
        @click="mutations.join()"
      >
        Join Encounter
      </button>
      <button
        v-else
        type="button"
        class="mt-3 min-h-11 w-full rounded-none border border-red-500/20 bg-red-500/10 px-3 text-sm text-red-200 disabled:opacity-50"
        :disabled="encounter.pending"
        @click="mutations.leave()"
      >
        Leave Encounter
      </button>

      <slot name="conditions" />
    </template>
  </div>
</template>
