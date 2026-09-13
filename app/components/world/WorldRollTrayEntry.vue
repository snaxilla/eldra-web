<script setup lang="ts">
// WorldRollTrayEntry -- one row in WorldRollTray.vue's feed. Eldra Roll
// System Phase 2C, eldra-roll-system.md §9's own CONTENT list: player
// name, roll label, expression, individual dice, modifier, total,
// visibility icon, relative timestamp, Private/Table badge. Every field
// here is already on the `RollEventRecord` the server returned --
// COMPUTES NOTHING beyond formatting (formatRollDieGroup/formatRollModifiers,
// app/lib/rolls/format.ts), the same "the tray displays, it never
// recomputes" discipline every other Roll System consumer already follows.
//
// MATERIAL: reuses the exact bordered row AdminRollSandbox.vue's own
// History list already used (rounded-none border ... bg-[rgba(20,17,12,0.4)]),
// not a new one -- this task's own "reuse existing materials, do not
// duplicate styling." `isLatest` only brightens the border/background a
// step, the emphasis the brief asks for ("the newest roll should be
// visually emphasized") without inventing a second visual language.
//
// RELATIVE TIME TICKS ON ITS OWN. A roll's age keeps changing the longer
// the tray stays open (this is a live feed, not a one-shot render), so
// this component owns a small interval nudging its own `now` forward
// every 30s -- coarse enough that formatRelativeRollTime's own minute-level
// precision never needs finer-grained wakeups.

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
    class="rounded-none border p-2.5 transition-colors"
    :class="isLatest
      ? 'border-[rgba(201,164,90,0.4)] bg-[rgba(201,164,90,0.08)]'
      : 'border-[rgba(201,164,90,0.14)] bg-[rgba(20,17,12,0.4)]'"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
      <span class="min-w-0 truncate text-sm text-[#d8ceb8]">
        <span class="font-semibold text-[#fff7df]">{{ roll.rollerDisplayName }}</span>
        <span class="text-[#9f9278]"> rolled </span>
        <span class="text-[#fff7df]">{{ roll.label }}</span>
      </span>
      <WorldRollVisibilityBadge :visibility="roll.visibility" />
    </div>

    <div class="mt-1.5 flex items-baseline justify-between gap-2">
      <span class="min-w-0 truncate font-mono text-xs text-[#9f9278]">
        {{ roll.expression }} <span v-if="roll.modifiers.length">({{ formatRollModifiers(roll) }})</span>
      </span>
      <span
        class="shrink-0 font-mono text-lg font-semibold tabular-nums"
        :class="isLatest ? 'text-[#f5e7bd]' : 'text-[#fff7df]'"
      >{{ roll.total }}</span>
    </div>

    <div
      v-if="roll.dice.length"
      class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.65rem] text-[#6f6754]"
    >
      <span
        v-for="(group, index) in roll.dice"
        :key="index"
      >{{ formatRollDieGroup(group, index) }}</span>
    </div>

    <div class="mt-1 text-right text-[0.65rem] text-[#6f6754]">
      {{ relativeTime }}
    </div>
  </li>
</template>
