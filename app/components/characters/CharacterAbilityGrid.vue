<script setup lang="ts">
// CharacterAbilityGrid -- the six ability tiles, in the command center.
// Desktop IA pass (D&D Beyond reference layout); the component the
// Beautification Pass §8.2 named and the Visual Language doc's Phase 3
// scoped as "merge score + modifier into one tile", finally built.
//
// WHY THE COMMAND CENTER AND NOT A RAIL: the reference sheet this pass is
// matched against puts the ability row in its top strip, not in a column,
// and that is the right call for the same reason the Vitals Bar is -- a
// modifier is quoted out loud constantly and read from every tab, so it
// belongs in the one region that never scrolls away.
//
// FIXES THE SPLIT MODIFIER (§2.3.2). The score and its modifier are two
// separate Rules Engine Values; V2 rendered them in two different cards, so
// reading "16 (+3)" meant looking in two places. They are paired back
// together by `groupDerivedValues` -- see that helper's own header for why
// pairing by id structure and value type names no ability and no Definition
// id, and so keeps this tile renderable by a package that has never heard
// of Strength.
//
// COMPUTES NOTHING. Both numbers come off the engine already evaluated;
// this file chooses only which is large and which sits in the pill.
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
      // `numbers[0]` is the parent Value (the score) when the package
      // declares one; anything further derived from it (the modifier) comes
      // after. A package declaring only one of the two renders only that
      // one, at the large size -- never a fabricated companion.
      const parent = group.numbers[0]!
      const derivedFromParent = group.numbers[1] ?? null

      const lead = derivedFromParent ?? parent
      const support = derivedFromParent ? parent : null

      return {
        key: group.key,
        label: group.label,
        error: group.error,
        lead: formatDerivedValue(lead),
        support: support ? formatDerivedValue(support) : null
      }
    })
)
</script>

<template>
  <div
    v-if="tiles.length"
    class="@container min-w-0"
  >
    <div class="grid grid-cols-3 gap-2 @md:grid-cols-6">
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
            {{ tile.lead }}
          </div>

          <div
            v-if="tile.support"
            class="mx-auto mt-1 w-fit rounded-none border border-[rgba(201,164,90,0.28)] px-2 text-xs tabular-nums text-[#d8ceb8]"
          >
            {{ tile.support }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
