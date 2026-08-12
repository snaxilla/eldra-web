<script setup lang="ts">
import AdminRulesRollTypesList from './AdminRulesRollTypesList.vue'
import AdminRulesDiagnosticsPanel from './AdminRulesDiagnosticsPanel.vue'
import AdminRulesOptionalRulesEditor from './AdminRulesOptionalRulesEditor.vue'
import AdminRulesRollTypesEditor from './AdminRulesRollTypesEditor.vue'
import type { RollVisibility, WorldRollTypeOverride } from '../../../lib/rules/types'

// `visibility` fields below use the real `RollVisibility` union, not a
// plain `string` -- a structural look-alike here previously drifted from
// AdminRulesRollTypesEditor.vue's own prop types and only surfaced as a
// typecheck failure at the point they were wired together (see that
// file's own note). Importing the real type keeps the two from silently
// diverging again.
defineProps<{
  worldId: string | number
  summary: {
    configured: true
    packageId: string
    packageVersion: string
    integrityHash: string
    rollTypes: Array<{ id: string; label: string; rollSpec: string; surfaces: readonly string[]; visibility?: RollVisibility; order: number }>
    bindingGaps: Array<{ kind: string; trait: string; declaredDefault: unknown; reason: string }>
    unboundRecommendedRoles: readonly string[]
    issues: Array<{ severity: 'error' | 'warning'; code: string; message: string; definitionId?: string }>
    settings: Record<string, Record<string, unknown>>
    optionalRules: Array<{
      key: string
      label: string
      description?: string
      value: unknown
      valueType: 'boolean' | 'number' | 'enum'
      default: unknown
      options?: string[]
      min?: number
      max?: number
    }>
    rollTypeOverrides: Record<string, WorldRollTypeOverride>
    rollTypeSettings: Array<{
      id: string
      label: string
      surfaces: readonly string[]
      enabled: boolean
      order: number
      visibility?: RollVisibility
      declaredVisibility?: RollVisibility
    }>
  }
}>()

// Editing (Infra 9) never updates local state optimistically -- both
// editors PATCH the server, then emit `changed`, which this component
// re-emits so AdminRulesPanel re-fetches GET /rules/summary. Nothing here
// mutates `summary` in place.
defineEmits<{ changed: [] }>()
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

    <AdminRulesOptionalRulesEditor
      :world-id="worldId"
      :settings="summary.settings"
      :optional-rules="summary.optionalRules"
      @changed="$emit('changed')"
    />

    <AdminRulesRollTypesEditor
      :world-id="worldId"
      :roll-type-overrides="summary.rollTypeOverrides"
      :roll-type-settings="summary.rollTypeSettings"
      @changed="$emit('changed')"
    />

    <AdminRulesDiagnosticsPanel
      :issues="summary.issues"
      :binding-gaps="summary.bindingGaps"
      :unbound-recommended-roles="summary.unboundRecommendedRoles"
    />
  </div>
</template>
