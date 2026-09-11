<script setup lang="ts">
// CharacterSaveList -- saving throws, two-up, in the desktop left region.
// Desktop IA pass (D&D Beyond reference layout), which puts saves in a
// compact two-column grid at the top of its left column: a proficiency
// marker, the ability it keys off, and the bonus.
//
// Each row is ONE fact assembled from two Rules Engine Values (the bonus
// and the proficiency flag) by `groupDerivedValues` -- see that helper for
// why the pairing names no ability and no Definition id. Nothing here is
// computed: the bonus already includes whatever proficiency contributed,
// because the engine put it there.
//
// MATERIAL -- FRAME, NOT WELL. Saves are read here, never rolled here (the
// approved scope makes actions/spells/items/features/skills selectable, and
// deliberately not saves), so per Design Language §8 Rule 2 they do not get
// the interactive well material. This is the same distinction
// CharacterActionsPanel.vue already draws between a resolvable row and a
// passive one.
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
      // The qualifier tag (e.g. the ability a save keys off) is the most
      // compact label a two-up grid can carry; the full label is kept for
      // assistive technology and for packages that declare no qualifier.
      short: group.qualifier ? group.qualifier.toUpperCase() : group.label,
      label: group.label,
      value: bonus ? formatDerivedValue(bonus) : '—',
      proficient: typeof flag?.value === 'boolean' ? flag.value : null,
      error: group.error
    }
  })
)
</script>

<template>
  <div class="@container min-w-0">
    <p
      v-if="!rows.length"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-3 text-sm text-[#9f9278]"
    >
      {{ emptyMessage }}
    </p>

    <ul
      v-else
      class="grid grid-cols-1 gap-1 @[16rem]:grid-cols-2"
    >
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex min-w-0 items-center gap-2 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.45)] px-2 py-1.5"
      >
        <span
          v-if="row.proficient !== null"
          class="shrink-0 text-xs"
          :class="row.proficient ? 'text-[#fff7df]' : 'text-[#6f6754]'"
        >
          <span aria-hidden="true">{{ row.proficient ? '●' : '○' }}</span>
          <span class="sr-only">{{ row.proficient ? 'Proficient' : 'Not proficient' }}</span>
        </span>

        <span
          class="min-w-0 flex-1 truncate text-xs uppercase tracking-[0.12em] text-[#d8ceb8]"
          :title="row.label"
        >
          {{ row.short }}
        </span>

        <span
          v-if="row.error"
          :title="row.error"
          class="shrink-0 text-[0.65rem] uppercase tracking-[0.1em] text-red-300"
        >Error</span>

        <span
          v-else
          class="shrink-0 text-sm font-semibold tabular-nums text-[#fff7df]"
        >{{ row.value }}</span>
      </li>
    </ul>
  </div>
</template>
