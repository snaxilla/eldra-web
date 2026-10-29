<script setup lang="ts">
// CharacterSheetRollRailEntry -- one row in CharacterSheetRollRail.vue's
// history feed. A SHEET-SPECIFIC redesign of WorldRollTrayEntry.vue's row,
// not that component reused with extra classes (see CharacterSheetRollRail.vue's
// own header for why): WorldRollTrayEntry.vue truncates the roller/label line
// and the expression/total line, which read fine in the floating Tray's own
// fixed `sm:w-96` but actively fights this rail's own content requirement
// ("long roll names and details wrap naturally", "totals remain easy to spot
// without colliding with titles or badges" -- this task's own §2). This row
// answers both by splitting what WorldRollTrayEntry.vue squeezes onto two
// crowded baselines into three deliberate rows: identity+badge (wraps, never
// truncates), the total alone at a size that cannot collide with anything
// beside it, then the technical expression/dice breakdown underneath as
// secondary detail.
//
// Same data, same formatting helpers, same `.eldra-gold-chip` visibility
// badge as the floating Tray -- only the arrangement and the color system
// (eldra-text-* tokens, not raw hex) are new, matching this rail's own
// token-based surface rather than the floating Tray's ornate-panel palette.

import WorldRollVisibilityBadge from '~/components/world/WorldRollVisibilityBadge.vue'
import { formatRelativeRollTime, formatRollDieGroup, formatRollModifiers } from '~/lib/rolls/format'
import type { RollEventRecord } from '~/lib/rolls/types'

const props = withDefaults(defineProps<{
  roll: RollEventRecord
  isLatest?: boolean
}>(), {
  isLatest: false
})

const now = ref(new Date())
let tick: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  tick = setInterval(() => {
    now.value = new Date()
  }, 30_000)
})

onBeforeUnmount(() => {
  if (tick) clearInterval(tick)
})

const relativeTime = computed(() => formatRelativeRollTime(props.roll.createdAt, now.value))
</script>

<template>
  <li
    class="border p-3 transition-colors"
    :class="isLatest
      ? 'border-eldra-accent/45 bg-eldra-accent/10'
      : 'border-eldra-accent/16 bg-eldra-ink/50'"
  >
    <div class="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
      <p class="min-w-0 flex-1 text-sm leading-snug text-eldra-text-soft">
        <span class="font-semibold text-eldra-text-strong">{{ roll.rollerDisplayName }}</span>
        <span class="text-eldra-text-faint"> rolled </span>
        <span class="text-eldra-text-strong">{{ roll.label }}</span>
      </p>
      <WorldRollVisibilityBadge :visibility="roll.visibility" class="shrink-0" />
    </div>

    <!-- The total gets its OWN row, at a size nothing else here competes
         with -- the collision this row exists to avoid. -->
    <div class="mt-2 flex items-baseline gap-3">
      <span
        class="font-mono text-2xl font-semibold leading-none tabular-nums"
        :class="isLatest ? 'text-eldra-accent-bright' : 'text-eldra-text-strong'"
      >{{ roll.total }}</span>
      <span class="min-w-0 flex-1 truncate font-mono text-xs text-eldra-text-faint">
        {{ roll.expression }} <span v-if="roll.modifiers.length">({{ formatRollModifiers(roll) }})</span>
      </span>
    </div>

    <div
      v-if="roll.dice.length"
      class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.65rem] text-eldra-text-ghost"
    >
      <span
        v-for="(group, index) in roll.dice"
        :key="index"
      >{{ formatRollDieGroup(group, index) }}</span>
    </div>

    <p class="mt-1.5 text-right text-[0.65rem] text-eldra-text-ghost">
      {{ relativeTime }}
    </p>
  </li>
</template>
