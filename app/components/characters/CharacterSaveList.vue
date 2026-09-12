<script setup lang="ts">
// CharacterSaveList -- saving throws, second in the desktop left region
// (Header Phase H3), right after Abilities.
//
// H3: ONE ROW PER SAVE, MATCHING SKILLS -- NOT A TWO-UP CARD GRID. Saves
// previously sat in a compact `@container`-driven two-column grid of
// bordered boxes -- a visually distinct "third system" next to Abilities'
// old card grid and Skills' own list. Abilities, Saving Throws, and Skills
// are all mechanical reference information that share one visual language,
// with Skills (CharacterSkillList.vue) the canonical one, never redesigned.
// So this is a single-column list, one row per save, keeping the two
// things that matter: the proficiency indicator and the total bonus. The
// old two-up grid's abbreviated qualifier label (space-constrained by two
// columns) is no longer needed now that a save gets its own full row --
// the full label renders instead, the same way Skills already shows a
// skill's full name rather than an abbreviation.
//
// Each row is ONE fact assembled from two Rules Engine Values (the bonus
// and the proficiency flag) by `groupDerivedValues` -- see that helper for
// why the pairing names no ability and no Definition id. Nothing here is
// computed: the bonus already includes whatever proficiency contributed,
// because the engine put it there.
//
// H4: WELL MATERIAL, SKILLS' OWN SCALE, NOT ABILITIES'. H3 used
// `eldra-quiet` (a bare hairline divider) here because nothing was rolled
// from a save row at the time -- Design Language §8 Rule 2's usual
// reading. H4's own brief overrode that on purpose for this row too, the
// same deliberate, scoped exception CharacterAbilityGrid.vue's rows
// documented: Saves are asked to "apply the same visual family" as
// Abilities and Skills, kept "visually lighter than Abilities but clearly
// heavier than ordinary reference text". So this row adopted well
// material -- closing the gap toward Skills' own language -- but stayed at
// Skills' row SCALE (no enlargement; Abilities alone gets that), which is
// exactly what keeps it lighter than Abilities. Eldra Roll System Phase 2
// (§8/§14) is what finally gives the well its click: saving throws join
// abilities and skills as rollable rows.
//
// Shape + text, never colour alone (§7.6): the proficiency marker is a
// filled/hollow glyph with a screen-reader label, matching exactly how
// CharacterDerivedPanel.vue already renders a boolean.
//
// ELDRA ROLL SYSTEM PHASE 2 -- WHOLE ROW IS THE ROLL CONTROL, MATCHING
// CharacterAbilityGrid.vue. No prior drawer/select interaction existed on
// this row to preserve, so the entire row becomes the roll button, sending
// only `sourceKey` (the `.bonus` Value's own id) -- the server re-derives
// the number (§3), this component sends no modifier.

import {
  formatDerivedValue,
  groupDerivedValues,
  type DerivedValue
} from './characterDerivedValues'

export type CharacterSaveRow = {
  key: string
  label: string
  value: string
  proficient: boolean | null
  error: string | null
  sourceKey: string
}

const props = withDefaults(defineProps<{
  entries?: readonly DerivedValue[]
  emptyMessage?: string
  rolling?: boolean
}>(), {
  entries: () => [],
  emptyMessage: 'No saving throws are declared by this World’s rules.',
  rolling: false
})

const emit = defineEmits<{
  roll: [CharacterSaveRow]
}>()

const rows = computed<CharacterSaveRow[]>(() =>
  groupDerivedValues(props.entries).map((group) => {
    const bonus = group.numbers[0] ?? null
    const flag = group.flags[0] ?? null

    return {
      key: group.key,
      label: group.label,
      value: bonus ? formatDerivedValue(bonus) : '—',
      proficient: typeof flag?.value === 'boolean' ? flag.value : null,
      error: group.error,
      sourceKey: bonus?.id ?? group.key
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
      >
        <button
          type="button"
          class="eldra-well grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-none px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="rolling"
          :aria-label="`Roll ${row.label} Save${row.proficient ? ', proficient' : ''}`"
          @click="emit('roll', row)"
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
        </button>
      </li>
    </ul>
  </div>
</template>
