<script setup lang="ts">
import { rulesFailureDetails } from './rulesSummary'

const props = defineProps<{
  summary: {
    configured: true
    ok: false
    stage: 'package-load' | 'runtime-construction'
    failure: Record<string, unknown>
  }
}>()

// Visually and textually distinct from the unconfigured empty state --
// this World HAS a configuration, and it is broken. Never collapsed into
// "no rules configured" (rules-package-infrastructure.md §5.1's own
// warning about this exact failure mode).
const stageLabel = computed(() =>
  props.summary.stage === 'package-load'
    ? 'Loading the active Rules Package failed'
    : 'Building the Rules runtime failed'
)

const details = computed(() => rulesFailureDetails(props.summary.failure))
</script>

<template>
  <div class="rounded-none border border-red-500/30 bg-red-500/10 p-5">
    <div class="flex items-center gap-2 text-red-200">
      <UIcon name="i-lucide-alert-triangle" class="h-5 w-5" />
      <span class="text-xs font-semibold uppercase tracking-[0.2em]">Configured, but broken</span>
    </div>

    <h3 class="mt-3 text-lg font-semibold text-white">
      {{ stageLabel }}
    </h3>

    <p class="mt-2 text-sm leading-6 text-red-100/90">
      This World has an active Rules Package configuration, but its runtime could
      not be built. Nothing has been silently disabled or defaulted -- fix the
      underlying package or configuration, then refresh.
    </p>

    <dl class="mt-4 grid gap-2 rounded-none border border-red-500/20 bg-[rgba(8,17,27,0.42)] p-3 text-sm">
      <div
        v-for="[key, value] in details"
        :key="key"
        class="grid grid-cols-[140px_minmax(0,1fr)] gap-3"
      >
        <dt class="text-[10px] uppercase tracking-[0.16em] text-red-200/80">
          {{ key }}
        </dt>
        <dd class="break-words text-red-50">
          {{ value }}
        </dd>
      </div>
    </dl>
  </div>
</template>
