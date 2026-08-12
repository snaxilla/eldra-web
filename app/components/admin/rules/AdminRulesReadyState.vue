<script setup lang="ts">
import AdminRulesRollTypesList from './AdminRulesRollTypesList.vue'
import AdminRulesDiagnosticsPanel from './AdminRulesDiagnosticsPanel.vue'

defineProps<{
  summary: {
    configured: true
    packageId: string
    packageVersion: string
    integrityHash: string
    rollTypes: Array<{ id: string; label: string; rollSpec: string; surfaces: readonly string[]; visibility?: string; order: number }>
    bindingGaps: Array<{ kind: string; trait: string; declaredDefault: unknown; reason: string }>
    unboundRecommendedRoles: readonly string[]
    issues: Array<{ severity: 'error' | 'warning'; code: string; message: string; definitionId?: string }>
  }
}>()
</script>

<template>
  <div class="grid gap-5">
    <div class="grid gap-4 rounded-none border border-emerald-400/20 bg-emerald-400/5 p-4 sm:grid-cols-3">
      <div>
        <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
          Package
        </div>
        <div
          class="mt-1 truncate text-sm font-semibold text-white"
          :title="summary.packageId"
        >
          {{ summary.packageId }}
        </div>
      </div>

      <div>
        <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
          Version
        </div>
        <div class="mt-1 text-sm font-semibold text-white">
          {{ summary.packageVersion }}
        </div>
      </div>

      <div>
        <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
          Integrity
        </div>
        <div
          class="mt-1 truncate font-mono text-xs text-[#d8ceb8]"
          :title="summary.integrityHash"
        >
          {{ summary.integrityHash }}
        </div>
      </div>
    </div>

    <AdminRulesRollTypesList :roll-types="summary.rollTypes" />

    <AdminRulesDiagnosticsPanel
      :issues="summary.issues"
      :binding-gaps="summary.bindingGaps"
      :unbound-recommended-roles="summary.unboundRecommendedRoles"
    />
  </div>
</template>
