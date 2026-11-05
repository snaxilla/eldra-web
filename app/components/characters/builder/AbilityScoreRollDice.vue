<script setup lang="ts">
// A compact, inline 4d6-drop-lowest visual for ONE just-rolled ability --
// Character Purgatory bug-fix pass, Ability Scores -> Roll. Deliberately
// NOT the Roll Tray (WorldRollTray.vue) and NOT the 3D dice box
// (EldraDiceBox.client.vue/WorldDiceThreeRenderer.client.vue): the task's
// own brief is explicit ("do not open or require the full Roll Tray...
// show only a compact 4d6 visual for this interaction, in context with
// the ability being rolled"). Four small squares and a total, nothing
// more -- the data itself (`RollDieGroup`) is the SAME shape every other
// Roll System consumer already uses (app/lib/rolls/types.ts), so this
// component's only job is presentation.
//
// NON-BLOCKING. The ability's score is already updated by the time this
// renders (CharacterAbilityScoreEditor.vue emits the new score
// synchronously, before this component's props even exist for this
// render) -- the fade-in below is a purely decorative CSS animation on
// already-resolved data, never a delay gating the score update itself.
import type { RollDieGroup } from '~/lib/rolls/types'

const props = defineProps<{
  dice: RollDieGroup
  abilityLabel: string
}>()

// One accessible sentence stands in for the four individual squares,
// which are themselves aria-hidden -- a screen reader hears this once,
// instead of four bare numbers with no stated meaning.
const summary = computed(() => {
  const kept: number[] = []
  const dropped: number[] = []
  props.dice.results.forEach((face, index) => {
    (props.dice.keptFlags[index] ? kept : dropped).push(face)
  })
  const droppedText = dropped.length ? `, dropped ${dropped.join(', ')}` : ''
  return `Rolled ${props.dice.results.join(', ')} for ${props.abilityLabel}${droppedText}. Total ${props.dice.total}.`
})
</script>

<template>
  <div
    role="status"
    :aria-label="summary"
    class="flex flex-wrap items-center gap-1.5"
  >
    <span
      v-for="(face, index) in dice.results"
      :key="index"
      aria-hidden="true"
      class="eldra-roll-die flex h-7 w-7 shrink-0 items-center justify-center rounded-none border text-xs font-semibold tabular-nums"
      :class="dice.keptFlags[index]
        ? 'border-[rgba(201,164,90,0.55)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
        : 'border-[rgba(201,164,90,0.18)] text-[#6f6754] line-through'"
      :style="{ animationDelay: `${index * 40}ms` }"
    >{{ face }}</span>
    <span
      aria-hidden="true"
      class="ml-0.5 text-xs text-[#9f9278]"
    >= {{ dice.total }}</span>
  </div>
</template>

<style scoped>
.eldra-roll-die {
  animation: eldra-roll-die-in 300ms ease-out both;
}

@keyframes eldra-roll-die-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Decorative only -- the score itself already updated before this
   element exists at all, so removing the animation loses nothing but
   the fade. */
@media (prefers-reduced-motion: reduce) {
  .eldra-roll-die {
    animation: none;
  }
}
</style>
