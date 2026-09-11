<script setup lang="ts">
// CharacterHealthBar -- Command Center Reconstruction, Phase H5. A visible
// health bar beside the HP numbers CharacterVitalsBar already shows, so
// condition reads at a glance instead of requiring the player to do the
// division themselves.
//
// PRESENTATION ONLY, USES EXISTING VALUES. `currentHp`/`maxHp` are the
// exact same props already flowing into CharacterVitalsBar and
// CharacterCommandResources -- this component computes a ratio to decide
// width and colour, and nothing else. No new gameplay, no new Rules Engine
// call, no fabricated value: a `null` Maximum HP (no Health record yet)
// renders no bar at all, the same "absence is legal" posture the rest of
// this Sheet already takes for a missing derived value.
//
// THRESHOLDS, EXACTLY AS SPECIFIED. Above 50% green, 50% down to 33%
// yellow, below 33% red -- a plain ratio of current to maximum, not a
// blend with Temporary HP (already shown as its own "+N temp" label
// beside the bar, per CharacterVitalsBar's own existing treatment).
//
// COLOUR IS NOT THE ONLY SIGNAL. The numeric HP text next to this bar
// already exists and is never removed -- this is a second, faster read of
// the same fact, matching §7.6's "shape/text, never colour alone" rule by
// construction rather than needing its own label.
const props = defineProps<{
  currentHp: number
  maxHp: number | null
}>()

const ratio = computed(() => {
  if (!props.maxHp || props.maxHp <= 0) return null
  return Math.max(0, Math.min(1, props.currentHp / props.maxHp))
})

const widthPercent = computed(() => `${Math.round((ratio.value ?? 0) * 100)}%`)

// Above 50% -> green, 50% down to 33% -> yellow, below 33% -> red.
const barColor = computed(() => {
  const value = ratio.value ?? 0
  if (value > 0.5) return '#9ec37d'
  if (value >= 0.33) return '#c9922c'
  return '#ef4444'
})
</script>

<template>
  <div
    v-if="ratio !== null"
    class="h-1.5 w-full overflow-hidden rounded-none bg-[rgba(9,17,26,0.62)]"
    role="progressbar"
    aria-label="Hit points"
    :aria-valuenow="currentHp"
    :aria-valuemin="0"
    :aria-valuemax="maxHp ?? undefined"
  >
    <div
      class="h-full transition-[width,background-color] duration-200"
      :style="{ width: widthPercent, backgroundColor: barColor }"
    />
  </div>
</template>
