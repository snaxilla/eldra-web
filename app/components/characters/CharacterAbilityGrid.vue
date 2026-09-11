<script setup lang="ts">
// CharacterAbilityGrid -- the six abilities, in the left reference region,
// first, ahead of Saving Throws. See CharacterReferencePanels.vue for the
// ordering.
//
// H3: LIST-BASED, MATCHING SKILLS -- NOT A CARD GRID. Header Phase H1
// removed ability presentation from the command center; Phase H2 gave it
// a card-grid home in the reference region; Phase H3 rejects the card grid
// itself. Abilities, Saving Throws, and Skills are all mechanical
// reference information and this task's own brief is explicit that they
// "should share one visual language" -- and that Skills (CharacterSkillList
// .vue) is the canonical one, never redesigned, with Abilities and Saves
// brought toward it. So this is now one row per ability, the same
// `eldra-quiet` hairline-divider rows the rest of this region uses, never
// a `rounded-none border ... bg-[...]` card.
//
// FIXES THE SPLIT MODIFIER (§2.3.2), SCORE LEADS. The score and its
// modifier are two separate Rules Engine Values; V2 rendered them in two
// different cards, so reading "16 (+3)" meant looking in two places. They
// are paired back together by `groupDerivedValues` -- see that helper's
// own header for why pairing by id structure and value type names no
// ability and no Definition id, and so keeps this list renderable by a
// package that has never heard of Strength. The score is the large,
// primary number; the modifier follows in parentheses on the same line,
// never as an equal-weight standalone value -- "STR 15 (+2)", matching
// eldra-character-sheet-visual-language.md §2.3.2's own worked example.
//
// COMPUTES NOTHING. Both numbers come off the engine already evaluated;
// this file chooses only which is large and which is parenthetical.
//
// MATERIAL -- QUIET, NOT WELL. A row is read, not pressed: nothing here
// responds to a click yet, and Design Language §8 Rule 2 is explicit that
// well material on something inert "is a lie the color is telling" --
// exactly the same reasoning CharacterSaveList.vue's own header already
// gives for saves. When rolling arrives (Visual Language Phase 8) these
// rows become the natural place for it, and the material changes with the
// behavior, not before it.

import {
  formatDerivedValue,
  groupDerivedValues,
  type DerivedValue
} from './characterDerivedValues'

const props = withDefaults(defineProps<{
  entries?: readonly DerivedValue[]
}>(), {
  entries: () => []
})

const rows = computed(() =>
  groupDerivedValues(props.entries)
    .filter((group) => group.numbers.length > 0)
    .map((group) => {
      const score = group.numbers[0]!
      const modifier = group.numbers[1] ?? null

      return {
        key: group.key,
        label: group.label,
        error: group.error,
        score: formatDerivedValue(score),
        modifier: modifier ? formatDerivedValue(modifier) : null
      }
    })
)
</script>

<template>
  <ul
    v-if="rows.length"
    class="grid gap-0.5"
  >
    <li
      v-for="row in rows"
      :key="row.key"
      class="eldra-quiet grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5"
    >
      <span class="min-w-0 truncate text-sm text-[#d8ceb8]">
        {{ row.label }}
      </span>

      <span
        v-if="row.error"
        :title="row.error"
        class="text-right text-[0.65rem] uppercase tracking-[0.1em] text-red-300"
      >Err</span>

      <span
        v-else
        class="text-right text-sm font-semibold tabular-nums text-[#fff7df]"
      >
        {{ row.score }}
        <span
          v-if="row.modifier"
          class="font-normal text-[#9f9278]"
        >({{ row.modifier }})</span>
      </span>
    </li>
  </ul>
</template>
