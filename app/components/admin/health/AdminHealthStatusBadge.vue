<script setup lang="ts">
// One shared status chip for the Project Health tab's exactly-four states
// (projectHealth.ts's own HealthStatus) -- extracted because both the
// Rules Package Card and every Content Pack Card render the identical
// badge, and this task's own STATUS section is explicit that no fifth
// state may ever appear: a single component with an exhaustive label/class
// map makes that a type-level guarantee rather than a convention two
// separate templates could drift apart on.

import type { HealthStatus } from './projectHealth'

defineProps<{
  status: HealthStatus
}>()

const LABELS: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  'needs-attention': 'Needs Attention',
  'not-configured': 'Not Configured'
}

const CLASSES: Record<HealthStatus, string> = {
  healthy: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  warning: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
  'needs-attention': 'border-red-500/40 bg-red-500/10 text-red-200',
  'not-configured': 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.6)] text-[#9f9278]'
}
</script>

<template>
  <span
    class="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-none border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
    :class="CLASSES[status]"
  >
    {{ LABELS[status] }}
  </span>
</template>
