<script setup lang="ts">
// CharacterAbilityGrid -- the six ability tiles. Originally built for the
// command center (Desktop IA pass); Header Phase H1 removed ability
// presentation from the header entirely, and Phase H2 gives it the home
// H1 deferred: first in the left reference region, ahead of Saving Throws
// -- read constantly, changed almost never, exactly the reference-region
// profile Saves and Defenses already have. See CharacterReferencePanels.vue
// for the ordering.
//
// FIXES THE SPLIT MODIFIER (§2.3.2). The score and its modifier are two
// separate Rules Engine Values; V2 rendered them in two different cards, so
// reading "16 (+3)" meant looking in two places. They are paired back
// together by `groupDerivedValues` -- see that helper's own header for why
// pairing by id structure and value type names no ability and no Definition
// id, and so keeps this tile renderable by a package that has never heard
// of Strength.
//
// SCORE LEADS, MODIFIER FOLLOWS IN PARENS -- Phase H2's own correction.
// "STR 15 (+2)" is the canonical reading order (matching
// eldra-character-sheet-visual-language.md §2.3.2's own "16 (+3)"
// example): the score is the large, primary number; the modifier sits
// beside/beneath it in parentheses, never as an equal-weight standalone
// card. `numbers[0]` is the parent Value (the score) when the package
// declares one; anything further derived from it (the modifier) comes
// after -- a package declaring only one of the two renders only that one,
// never a fabricated companion.
//
// COMPUTES NOTHING. Both numbers come off the engine already evaluated;
// this file chooses only which is large and which is parenthetical.
//
// MATERIAL -- FRAME, NOT WELL. A tile is read, not pressed: nothing here
// responds to a click yet, and Design Language §8 Rule 2 is explicit that
// well material on something inert "is a lie the color is telling". When
// rolling arrives (Visual Language Phase 8) these tiles become the natural
// place for it, and the material changes with the behavior, not before it.

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

const tiles = computed(() =>
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
  <div
    v-if="tiles.length"
    class="@container min-w-0"
  >
    <div class="grid grid-cols-2 gap-2 @sm:grid-cols-3 @lg:grid-cols-6">
      <div
        v-for="tile in tiles"
        :key="tile.key"
        class="min-w-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.55)] px-2 py-2 text-center"
      >
        <div class="truncate text-[0.55rem] uppercase tracking-[0.18em] text-[#9f9278]">
          {{ tile.label }}
        </div>

        <div
          v-if="tile.error"
          :title="tile.error"
          class="mt-1 text-xs uppercase tracking-[0.1em] text-red-300"
        >
          Error
        </div>

        <template v-else>
          <div class="mt-0.5 text-2xl font-semibold leading-tight tabular-nums text-[#fff7df]">
            {{ tile.score }}
          </div>

          <div
            v-if="tile.modifier"
            class="mt-0.5 text-xs tabular-nums text-[#9f9278]"
          >
            ({{ tile.modifier }})
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
