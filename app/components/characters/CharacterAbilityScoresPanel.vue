<script setup lang="ts">
// Read-only Ability Scores -- Character Builder / Character Sheet Phase 3.
//
// Rendered by BOTH character surfaces, the same way ContentPresentationPanel
// already is:
//   Builder review step -- "here is what I just assigned"
//   Character Sheet     -- "here is what this character has"
//
// VALUES ONLY. This component displays six numbers and computes nothing from
// them: no modifier, no saving throw, no skill bonus, no armor class, no hit
// points, no initiative. Those are the Rules Engine's (app/lib/rules/**),
// which this file neither imports nor duplicates. If a modifier ever appears
// beside a score here, it must arrive as data from that engine -- never be
// derived in this template.
//
// ---------------------------------------------------------------------------
// MOBILE, AND WHY CONTAINER QUERIES RATHER THAN BREAKPOINTS
// ---------------------------------------------------------------------------
// Six tiles that reflow rather than a table that scrolls: a table would
// either overflow horizontally at 320px or shrink the numbers past
// legibility, and the numbers are the entire content.
//
// The reflow is driven by `@container`, NOT by viewport breakpoints, because
// this component renders at two very different WIDTHS on the same screen:
// full-bleed on the Character Sheet, and inside the Builder's ~20rem desktop
// summary sidebar. A viewport-keyed `lg:grid-cols-6` would put six tiles in
// that 320px sidebar on a desktop -- ~45px each -- while a phone got two.
// Container queries ask the right question: how much room does THIS panel
// have, regardless of how big the window is.

import { ABILITY_ABBREVIATIONS, ABILITY_KEYS, ABILITY_LABELS, type AbilityScores } from '~/lib/characters/ability-scores'

withDefaults(defineProps<{
  scores?: AbilityScores | null
  // Shown in place of the tiles when a character has no scores recorded --
  // a real state (every character created before Phase 3 is in it), not an
  // error.
  emptyMessage?: string
}>(), {
  scores: null,
  emptyMessage: 'No ability scores have been assigned yet.'
})
</script>

<template>
  <div class="@container min-w-0">
    <p
      v-if="!scores"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-4 text-sm text-[#9f9278]"
    >
      {{ emptyMessage }}
    </p>

    <dl
      v-else
      class="grid grid-cols-2 gap-2 @xs:grid-cols-3 @2xl:grid-cols-6"
    >
      <div
        v-for="key in ABILITY_KEYS"
        :key="key"
        class="min-w-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.55)] px-3 py-3 text-center"
      >
        <dt class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
          {{ ABILITY_ABBREVIATIONS[key] }}
          <span class="sr-only">{{ ABILITY_LABELS[key] }}</span>
        </dt>
        <dd class="mt-1 text-2xl font-semibold tabular-nums text-[#fff7df]">
          {{ scores[key] }}
        </dd>
      </div>
    </dl>
  </div>
</template>
