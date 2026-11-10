<script setup lang="ts">
// WorldManualDiceRack -- Eldra Roll System Phase 4B.7 (Roll Tray Manual
// Dice Controls, .github/docs/architecture/eldra-roll-system.md,
// adr-024-authored-dice-presentation.md).
//
// A compact handful of physical dice, sitting in WorldRollTray.vue below
// its existing Private/Table controls and above roll history (this
// phase's own PRODUCT GOAL). Real tabletop play frequently needs a roll
// that doesn't come from any Character Sheet mechanic -- "roll a d4 for
// gold," "everybody roll a d20," "roll me a d100 for the Wild Magic
// table" -- and this is that surface.
//
// PURELY PRESENTATIONAL, LIKE EVERYTHING ELSE IN THIS FILE'S FAMILY. This
// component knows the seven dice exist (app/lib/rolls/requests.ts's own
// `MANUAL_DICE`) and how to draw a silhouette for each -- nothing about
// visibility, nothing about `useWorldRolls`, nothing about the server. It
// emits `roll` with the clicked `ManualDieOption`; the PAGE that already
// owns a `useWorldRolls()` instance and its own Private/Table selection
// (sheet-v2.vue's `rollVisibility`, AdminRollSandbox.vue's own
// `visibility`) is what turns that into an actual request
// (`buildManualRollRequestBody(die, visibility)` -> `requestRoll(...)`) --
// the exact same "emit a domain payload, let the page decide" shape
// WorldRollTray.vue's own `load-more` emit and sheet-v2.vue's
// `rollAbility`/`rollSave`/`rollSkill` handlers already establish. This
// component is never wired to `useWorldRolls` directly, so mounting it
// twice on one page (impossible today, since only one Tray ever mounts at
// once) could never create a second, diverging roll pipeline.
//
// SILHOUETTES, NOT UNICODE GLYPHS (this phase's own DICE RACK VISUAL
// DESIGN section). Each die is a small inline SVG polygon/circle plus its
// own "d4"/"d20"/etc label underneath -- the label is the actual
// identifier; the silhouette is a supporting cue, not something a player
// is expected to recognize a 12-sided solid from at 32px. Charcoal/gold/
// ivory, matching the Tray's own `.eldra-well`/`.eldra-gold-chip`
// material rather than inventing a new one.
//
// ONE CLICK, ONE DIE (this phase's own FUTURE MULTI-DIE INTERACTION
// section: design the boundary, do not build quantity/modifier/
// custom-expression UI yet). Each control is a single real `<button>`
// with an accessible name ("Roll a d20") -- keyboard-activatable for
// free, nothing built on a non-interactive div.

import { MANUAL_DICE, type ManualDieOption } from '~/lib/rolls/requests'

withDefaults(defineProps<{
  // Prevents accidental duplicate submission while a roll (any roll --
  // this phase's own INTERACTION section: "do not globally disable the
  // entire Roll Tray") is already in flight. Only this rack's own
  // buttons are affected -- history, Load More, and collapse all stay
  // usable regardless.
  disabled?: boolean
  dice?: readonly ManualDieOption[]
  // Roll Tray collapse-with-dice pass -- a second layout for the SAME
  // seven dice/shapes/roll contract, for CharacterSheetRollRail.vue's
  // collapsed (w-14) rail: one icon-only column, no label text (there is
  // no room for it), no eldra-well group chrome (seven individually
  // bordered buttons read better stacked than one wide well would at
  // this width). Still the exact same `dice`/`disabled` props and `roll`
  // emit as the expanded rack -- a compact caller never needs a second
  // roll pipeline.
  compact?: boolean
}>(), {
  disabled: false,
  dice: () => MANUAL_DICE,
  compact: false
})

const emit = defineEmits<{
  roll: [ManualDieOption]
}>()

// One small SVG shape per die type -- a supporting silhouette, not a
// literal render of the solid (this phase's own "the user should never
// need to identify a polyhedron solely by shape" -- the label under each
// one is the actual identifier). Plain point/circle data, no per-type
// component needed for shapes this simple.
const SHAPE_BY_SIDES: Record<number, { kind: 'polygon'; points: string } | { kind: 'circle' }> = {
  4: { kind: 'polygon', points: '12,3 21,19 3,19' },
  6: { kind: 'polygon', points: '5,5 19,5 19,19 5,19' },
  8: { kind: 'polygon', points: '12,2 21,12 12,22 3,12' },
  10: { kind: 'polygon', points: '12,2 19,9 15,22 9,22 5,9' },
  12: { kind: 'polygon', points: '12,2 21,9 17,20 7,20 3,9' },
  20: { kind: 'polygon', points: '12,2 20,7 20,17 12,22 4,17 4,7' },
  100: { kind: 'circle' }
}
</script>

<template>
  <div
    class="flex items-center rounded-none"
    :class="compact ? 'flex-col gap-1' : 'eldra-well flex-wrap gap-1.5 px-2 py-2'"
    role="group"
    aria-label="Manual dice"
  >
    <button
      v-for="die in dice"
      :key="die.type"
      type="button"
      class="flex shrink-0 items-center justify-center rounded-none border border-transparent text-center transition hover:border-[rgba(201,164,90,0.4)] hover:bg-[rgba(201,164,90,0.08)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent"
      :class="compact ? 'flex-col p-1.5' : 'flex-col gap-1 px-2 py-1.5'"
      :disabled="disabled"
      :title="die.ariaLabel"
      :aria-label="die.ariaLabel"
      @click="emit('roll', die)"
    >
      <svg
        viewBox="0 0 24 24"
        class="shrink-0 text-[#c9a45a]"
        :class="compact ? 'h-5 w-5' : 'h-6 w-6'"
        aria-hidden="true"
      >
        <circle
          v-if="SHAPE_BY_SIDES[die.sides]?.kind === 'circle'"
          cx="12"
          cy="12"
          r="9.5"
          fill="rgba(201,164,90,0.14)"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <polygon
          v-else
          :points="(SHAPE_BY_SIDES[die.sides] as { kind: 'polygon'; points: string }).points"
          fill="rgba(201,164,90,0.14)"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
      <!-- Compact: no room for the label under the icon -- `title`/
           `aria-label` above already carry the identity ("Roll a d20")
           for a tooltip and for assistive tech. -->
      <span
        v-if="!compact"
        class="text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-[#d8ceb8]"
      >
        {{ die.type }}
      </span>
    </button>
  </div>
</template>
