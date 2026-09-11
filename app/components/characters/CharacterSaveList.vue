<script setup lang="ts">
// CharacterSaveList -- saving throws, second in the desktop left region
// (Header Phase H3), right after Abilities.
//
// H3: ONE ROW PER SAVE, MATCHING SKILLS -- NOT A TWO-UP CARD GRID. Saves
// previously sat in a compact `@container`-driven two-column grid of
// bordered boxes -- a visually distinct "third system" next to Abilities'
// old card grid and Skills' own list. This task's own brief is explicit
// that Abilities, Saving Throws, and Skills "should share one visual
// language" and that Skills (CharacterSkillList.vue) is the canonical one,
// never redesigned. So this is now a single-column list of `eldra-quiet`
// hairline-divider rows, the same shape CharacterAbilityGrid.vue's rows
// now use, with the two things this task says to keep: the proficiency
// indicator and the total bonus. The compact two-up grid's abbreviated
// qualifier label (space-constrained by two columns) is no longer needed
// now that a save gets its own full row -- the full label renders instead,
// the same way Skills already shows a skill's full name rather than an
// abbreviation.
//
// Each row is ONE fact assembled from two Rules Engine Values (the bonus
// and the proficiency flag) by `groupDerivedValues` -- see that helper for
// why the pairing names no ability and no Definition id. Nothing here is
// computed: the bonus already includes whatever proficiency contributed,
// because the engine put it there.
//
// MATERIAL -- QUIET, NOT WELL. Saves are read here, never rolled here (the
// approved scope makes actions/spells/items/features/skills selectable, and
// deliberately not saves), so per Design Language §8 Rule 2 they do not get
// the interactive well material -- the same distinction
// CharacterActionsPanel.vue already draws between a resolvable row and a
// passive one, and CharacterAbilityGrid.vue's rows now draw too.
//
// Shape + text, never colour alone (§7.6): the proficiency marker is a
// filled/hollow glyph with a screen-reader label, matching exactly how
// CharacterDerivedPanel.vue already renders a boolean.

import {
  formatDerivedValue,
  groupDerivedValues,
  type DerivedValue
} from './characterDerivedValues'

const props = withDefaults(defineProps<{
  entries?: readonly DerivedValue[]
  emptyMessage?: string
}>(), {
  entries: () => [],
  emptyMessage: 'No saving throws are declared by this World’s rules.'
})

const rows = computed(() =>
  groupDerivedValues(props.entries).map((group) => {
    const bonus = group.numbers[0] ?? null
    const flag = group.flags[0] ?? null

    return {
      key: group.key,
      label: group.label,
      value: bonus ? formatDerivedValue(bonus) : '—',
      proficient: typeof flag?.value === 'boolean' ? flag.value : null,
      error: group.error
    }
  })
)
</script>

<template>
  <div class="min-w-0">
    <p
      v-if="!rows.length"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-3 text-sm text-[#9f9278]"
    >
      {{ emptyMessage }}
    </p>

    <ul
      v-else
      class="grid gap-0.5"
    >
      <li
        v-for="row in rows"
        :key="row.key"
        class="eldra-quiet grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5"
      >
        <span
          v-if="row.proficient !== null"
          class="text-xs"
          :class="row.proficient ? 'text-[#fff7df]' : 'text-[#6f6754]'"
        >
          <span aria-hidden="true">{{ row.proficient ? '●' : '○' }}</span>
          <span class="sr-only">{{ row.proficient ? 'Proficient' : 'Not proficient' }}</span>
        </span>
        <span v-else />

        <span class="min-w-0 truncate text-sm text-[#d8ceb8]">
          {{ row.label }}
        </span>

        <span
          v-if="row.error"
          :title="row.error"
          class="text-right text-[0.65rem] uppercase tracking-[0.1em] text-red-300"
        >Error</span>

        <span
          v-else
          class="text-right text-sm font-semibold tabular-nums text-[#fff7df]"
        >{{ row.value }}</span>
      </li>
    </ul>
  </div>
</template>
