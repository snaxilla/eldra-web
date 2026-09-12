<script setup lang="ts">
// CharacterSkillList -- the persistent skills table. Desktop IA pass (D&D
// Beyond reference layout), whose middle column is a four-column skill
// table -- proficiency marker, the ability the skill keys off, the skill,
// the bonus -- that stays on screen no matter which tab is open.
//
// PERSISTENT, NOT TAB CONTENT. This is the approved decision and the
// reference layout's own behaviour: switching to Spells does not hide your
// skills, because "what do I roll for that?" is asked constantly and is not
// a destination you navigate to. It lives in the center region beside the
// tab body at very wide widths, and stacks directly above the tab bar
// below that -- never behind a tab, at any width.
//
// Each row is ONE fact assembled from two Rules Engine Values (the bonus
// and the proficiency flag) by `groupDerivedValues` -- see that helper's
// header for why the pairing names no skill and no Definition id. The
// `MOD` column is the package's own qualifier tag, not a lookup table in
// this file: a package that tags a skill with the attribute it keys off
// gets that column for free, and one that doesn't simply renders it empty.
//
// COMPUTES NOTHING. The bonus is the engine's; proficiency is the engine's.
//
// MATERIAL -- WELL, BECAUSE THE ROW IS ACTUALLY ACTIONABLE. Unlike the
// ability tiles and the saves grid, a skill row DOES something when
// clicked: it opens the shared context drawer. Design Language §8 Rule 2
// ("interactive controls always sit on a Steel well") is therefore
// satisfied rather than violated here, and the material is doing real work
// -- it is the only signal distinguishing the rows you can open from the
// reference blocks you cannot.
//
// ELDRA ROLL SYSTEM PHASE 2 -- A SECOND, DISTINCT CONTROL, NOT A
// REPLACEMENT. eldra-roll-system.md §8/§14 Phase 2: "a skill row now does
// two things: open detail on most of the row, roll on an explicit
// control," the same split CharacterActionsPanel.vue already draws between
// opening a detail drawer and its own Resolve button. The bonus figure
// itself becomes that explicit roll control -- the one number a player
// actually watches -- while the rest of the row keeps opening the drawer
// exactly as before. Rolling sends ONLY `sourceKey` (the Rules Engine id
// the bonus was read from); the server re-derives the number itself
// (§3) -- this component never computes or sends a modifier.

import {
  formatDerivedValue,
  groupDerivedValues,
  type DerivedValue
} from './characterDerivedValues'

export type CharacterSkillRow = {
  key: string
  label: string
  qualifier: string | null
  value: string
  proficient: boolean | null
  // The Rules Engine Value id the bonus was actually read from (e.g.
  // 'value:skill.stealth.bonus') -- distinct from `key`, which is the
  // GROUPING stem `groupDerivedValues` assigned this row (see that
  // helper's own header) and is never itself a real Definition id when a
  // bonus/proficiency pair shares one. This is the id a roll request must
  // name.
  sourceKey: string
}

const props = withDefaults(defineProps<{
  entries?: readonly DerivedValue[]
  emptyMessage?: string
  rolling?: boolean
}>(), {
  entries: () => [],
  emptyMessage: 'No skills are declared by this World’s rules.',
  rolling: false
})

const emit = defineEmits<{
  select: [CharacterSkillRow]
  roll: [CharacterSkillRow]
}>()

const rows = computed<(CharacterSkillRow & { error: string | null })[]>(() =>
  groupDerivedValues(props.entries)
    .map((group) => {
      const bonus = group.numbers[0] ?? null
      const flag = group.flags[0] ?? null

      return {
        key: group.key,
        label: group.label,
        qualifier: group.qualifier,
        value: bonus ? formatDerivedValue(bonus) : '—',
        proficient: typeof flag?.value === 'boolean' ? flag.value : null,
        sourceKey: bonus?.id ?? group.key,
        error: group.error
      }
    })
    // Alphabetical, like every printed skill list -- a player scans this
    // table by name, never by the order a package happens to declare in.
    .sort((a, b) => a.label.localeCompare(b.label))
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

    <template v-else>
      <!-- Column headings, matching the reference sheet's own table head.
           Hidden from assistive technology: each row already carries a
           complete accessible name, so reading the headings again would
           only add noise. -->
      <div
        aria-hidden="true"
        class="grid grid-cols-[1.25rem_2rem_minmax(0,1fr)_2.5rem] items-center gap-2 border-b border-[rgba(201,164,90,0.16)] px-2 pb-1 text-[0.55rem] uppercase tracking-[0.16em] text-[#6f6754]"
      >
        <span>Prof</span>
        <span>Mod</span>
        <span>Skill</span>
        <span class="text-right">Bonus</span>
      </div>

      <ul class="mt-1 grid gap-0.5">
        <li
          v-for="row in rows"
          :key="row.key"
        >
          <div class="eldra-well grid w-full grid-cols-[1.25rem_2rem_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-none px-2 py-1.5">
            <button
              type="button"
              class="col-span-3 grid grid-cols-[1.25rem_2rem_minmax(0,1fr)] items-center gap-2 rounded-none py-0 text-left transition"
              :aria-label="`${row.label}${row.proficient ? ', proficient' : ''} — view details`"
              @click="emit('select', row)"
            >
              <span
                class="text-xs"
                :class="row.proficient ? 'text-[#fff7df]' : 'text-[#6f6754]'"
              >
                <span aria-hidden="true">{{ row.proficient === null ? '·' : row.proficient ? '●' : '○' }}</span>
              </span>

              <span class="truncate text-[0.6rem] uppercase tracking-[0.12em] text-[#9f9278]">
                {{ row.qualifier || '' }}
              </span>

              <span class="min-w-0 truncate text-sm text-[#d8ceb8]">
                {{ row.label }}
              </span>
            </button>

            <button
              type="button"
              class="rounded-none text-right transition hover:text-[#f5e7bd] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="rolling"
              :aria-label="`Roll ${row.label}, bonus ${row.value}`"
              @click="emit('roll', row)"
            >
              <span
                v-if="row.error"
                :title="row.error"
                class="text-[0.65rem] uppercase tracking-[0.1em] text-red-300"
              >Err</span>

              <span
                v-else
                class="text-sm font-semibold tabular-nums text-[#fff7df]"
              >{{ row.value }}</span>
            </button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
