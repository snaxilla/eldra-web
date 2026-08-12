<script setup lang="ts">
defineProps<{
  issues: Array<{ severity: 'error' | 'warning'; code: string; message: string; definitionId?: string }>
  bindingGaps: Array<{ kind: string; trait: string; declaredDefault: unknown; reason: string }>
  unboundRecommendedRoles: readonly string[]
}>()

function severityClass(severity: string) {
  return severity === 'error'
    ? 'border-red-500/30 bg-red-500/10 text-red-200'
    : 'border-amber-300/25 bg-amber-400/10 text-amber-100'
}
</script>

<template>
  <div class="grid gap-5 md:grid-cols-2">
    <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Validation Issues
      </div>

      <div
        v-if="!issues.length"
        class="mt-4 rounded-none border border-dashed border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-100"
      >
        No issues -- this package validates cleanly.
      </div>

      <div
        v-else
        class="mt-4 grid gap-2"
      >
        <article
          v-for="(issue, index) in issues"
          :key="`${issue.code}-${index}`"
          class="rounded-none border p-3 text-sm"
          :class="severityClass(issue.severity)"
        >
          <div class="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em]">
            <span>{{ issue.severity }}</span>
            <span>{{ issue.code }}</span>
          </div>
          <p class="mt-1 leading-5">
            {{ issue.message }}
          </p>
          <p
            v-if="issue.definitionId"
            class="mt-1 text-xs opacity-80"
          >
            {{ issue.definitionId }}
          </p>
        </article>
      </div>
    </div>

    <div class="grid gap-5">
      <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Binding Gaps
        </div>

        <div
          v-if="!bindingGaps.length"
          class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
        >
          No binding gaps -- every declared trait has a World-supplied or default value.
        </div>

        <div
          v-else
          class="mt-4 grid gap-2"
        >
          <article
            v-for="gap in bindingGaps"
            :key="`${gap.kind}.${gap.trait}`"
            class="rounded-none border border-amber-300/20 bg-amber-400/5 p-3 text-sm text-amber-100"
          >
            <div class="text-[10px] uppercase tracking-[0.14em] opacity-80">
              {{ gap.kind }}.{{ gap.trait }}
            </div>
            <p class="mt-1 leading-5">
              {{ gap.reason }}
            </p>
            <p class="mt-1 text-xs opacity-80">
              Using default: {{ gap.declaredDefault }}
            </p>
          </article>
        </div>
      </div>

      <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Unbound Recommended Roles
        </div>

        <div
          v-if="!unboundRecommendedRoles.length"
          class="mt-4 rounded-none border border-dashed border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-100"
        >
          All recommended Semantic Roles are bound.
        </div>

        <div
          v-else
          class="mt-4 flex flex-wrap gap-2"
        >
          <span
            v-for="role in unboundRecommendedRoles"
            :key="role"
            class="rounded-none border border-amber-300/20 bg-amber-400/5 px-2 py-1 text-xs text-amber-100"
          >
            {{ role }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
