<script setup lang="ts">
// CharacterAbilityGrid -- the six abilities, in the left reference region,
// first, ahead of Saving Throws. See CharacterReferencePanels.vue for the
// ordering.
//
// H3: LIST-BASED, MATCHING SKILLS -- NOT A CARD GRID. Header Phase H1
// removed ability presentation from the command center; Phase H2 gave it
// a card-grid home in the reference region; Phase H3 rejected the card
// grid itself. Abilities, Saving Throws, and Skills are all mechanical
// reference information and share one visual language -- Skills
// (CharacterSkillList.vue) is the canonical one, never redesigned, with
// Abilities and Saves brought toward it. So this is one row per ability,
// never a `rounded-none border ... bg-[...]` card.
//
// H4: WELL MATERIAL, ENLARGED -- "A LARGER VERSION OF A SKILL ROW". H3's
// own fix used `eldra-quiet` (a bare hairline divider) because nothing
// here was clickable, and Design Language §8 Rule 2 says well material on
// something inert "is a lie the color is telling". H4's brief overrides
// that on purpose, explicitly, for exactly this row: Abilities are named
// "the primary mechanical reference" and are asked to "carry slightly
// more visual weight than Skills" while still visibly belonging to the
// same family -- so the row keeps Skills' well material and general shape
// (grid row, right-aligned bold value, tabular numerals) but at a larger
// scale (bigger padding, bigger score, an uppercase/tracked label) than
// Skills' own rows, which are NOT touched. H4 called this a deliberate,
// scoped exception to "well means interactive" ("here it means 'the first
// thing to scan'") -- Eldra Roll System Phase 2 (§8/§14) makes that
// exception moot by giving the row a real interaction after all: the well
// now means exactly what it means on Skills again, because clicking one of
// these rows rolls it.
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
// ELDRA ROLL SYSTEM PHASE 2 -- WHOLE ROW IS THE ROLL CONTROL. Unlike
// Skills (which splits "open detail" from "roll" across one row, because a
// skill row already opened a drawer), an ability row had no existing
// interaction to preserve, so the entire row becomes the roll button. A
// click rolls the ABILITY MODIFIER (`sourceKey`, the `.mod` Value's own
// id), never the raw score -- an ability check adds the modifier, not the
// score itself. This component sends only that id; the server re-derives
// the number (§3).

import {
  formatDerivedValue,
  groupDerivedValues,
  type DerivedValue
} from './characterDerivedValues'

export type CharacterAbilityRow = {
  key: string
  label: string
  error: string | null
  score: string
  modifier: string | null
  // The Rules Engine Value id a roll request must name -- the ability
  // MODIFIER's own id when the package declares one (e.g.
  // 'value:ability.str.mod'), never the raw score's id.
  sourceKey: string
}

const props = withDefaults(defineProps<{
  entries?: readonly DerivedValue[]
  rolling?: boolean
}>(), {
  entries: () => [],
  rolling: false
})

const emit = defineEmits<{
  roll: [CharacterAbilityRow]
}>()

// Which row's roll is in flight -- the initiation feedback for the one
// control the player pressed, cleared when the page's roll settles.
const rollingKey = ref<string | null>(null)
watch(() => props.rolling, (rolling) => { if (!rolling) rollingKey.value = null })

function roll(row: CharacterAbilityRow) {
  rollingKey.value = row.key
  emit('roll', row)
}

const rows = computed<CharacterAbilityRow[]>(() =>
  groupDerivedValues(props.entries)
    .filter((group) => group.numbers.length > 0)
    .map((group) => {
      const score = group.numbers[0]!
      const modifier = group.numbers.find((entry) => entry.id !== score.id) ?? null

      return {
        key: group.key,
        label: group.label,
        error: group.error,
        score: formatDerivedValue(score),
        modifier: modifier ? formatDerivedValue(modifier) : null,
        sourceKey: modifier?.id ?? score.id
      }
    })
)
</script>

<template>
  <!-- Phase 4B: tiles, modifier first -- the number a player rolls with is
       the dominant one, the score its quieter badge. Three across in a
       narrow rail, six across once the container allows. -->
  <div
    v-if="rows.length"
    class="@container"
  >
    <ul class="grid grid-cols-3 gap-1.5 @md:grid-cols-6">
      <li
        v-for="row in rows"
        :key="row.key"
      >
        <button
          type="button"
          class="eldra-well eldra-rollable relative flex w-full flex-col items-center rounded-none px-1 pb-2 pt-1.5 text-center disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="rolling"
          :aria-busy="rollingKey === row.key && rolling ? 'true' : undefined"
          :aria-label="`Roll ${row.label}${row.modifier ? `, ${row.modifier}` : ''}`"
          @click="roll(row)"
        >
          <UIcon
            name="i-lucide-dices"
            class="eldra-roll-hint absolute right-1 top-1 h-3 w-3"
            aria-hidden="true"
          />
          <span
            class="w-full truncate px-3 text-[0.55rem] font-semibold uppercase tracking-[0.04em] text-eldra-text-faint"
            :title="row.label"
          >
            {{ row.label }}
          </span>

          <span
            v-if="row.error"
            :title="row.error"
            class="mt-1 text-[0.65rem] uppercase tracking-[0.1em] text-red-300"
          >Err</span>

          <template v-else>
            <span class="mt-0.5 text-2xl font-semibold leading-none tabular-nums text-eldra-text-strong">
              {{ row.modifier ?? row.score }}
            </span>
            <span
              v-if="row.modifier"
              class="mt-1.5 min-w-8 border border-eldra-accent/24 px-1.5 text-xs tabular-nums text-eldra-text-soft"
            >{{ row.score }}</span>
          </template>
        </button>
      </li>
    </ul>
  </div>
</template>
