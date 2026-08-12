<script setup lang="ts">
// Edits a World's roll-type overrides (enable/disable, order, visibility)
// -- Infrastructure Commit 9. Only `rollTypes` is ever sent to PATCH
// /rules/config, and it is always the World's FULL current override map
// with just the entries this editor manages replaced -- see
// buildRollTypeOverridesPatch (rulesConfigEdits.ts) for why, and for the
// one piece of this component's logic that is actually unit-tested.
//
// Deliberately renders EVERY package-declared roll type, including ones
// the World has disabled -- world-runtime-service.ts's `rollTypeSettings`
// exists specifically because the already-resolved `rollTypes` list drops
// disabled entries entirely (world-config.ts's `composeRollTypes`), which
// would make a disabled roll type impossible to see, let alone re-enable.

import { buildRollTypeOverridesPatch, type RollTypeOverrideDraftEntry } from './rulesConfigEdits'
import type { RollVisibility, WorldRollTypeOverride } from '../../../lib/rules/types'

// Imports the real WorldRollTypeOverride (app/lib/rules/types.ts) rather
// than re-declaring a structural look-alike here -- a local copy with
// `visibility?: string` (instead of the real `RollVisibility` union)
// caused exactly the kind of drift this file's own comments warn other
// modules about: it type-checked in isolation but failed at the call into
// buildRollTypeOverridesPatch, which expects the real type.
type RollTypeSettingView = {
  id: string
  label: string
  surfaces: readonly string[]
  enabled: boolean
  order: number
  visibility?: RollVisibility
  declaredVisibility?: RollVisibility
}

const props = defineProps<{
  worldId: string | number
  rollTypeOverrides: Record<string, WorldRollTypeOverride>
  rollTypeSettings: RollTypeSettingView[]
}>()

// See AdminRulesOptionalRulesEditor.vue's identical note: no optimistic
// updates, `changed` triggers the parent's re-fetch, which reseeds `draft`.
const emit = defineEmits<{ changed: [] }>()

// world-configuration.md §D.5: the closed override operation set. An
// empty string means "no override -- use the package's declared default",
// not the literal value "" -- see save()'s omission of a blank choice.
const VISIBILITY_CHOICES = ['public', 'gm', 'self', 'blind'] as const

const draft = ref<Record<string, RollTypeOverrideDraftEntry>>({})

function seedDraft() {
  const next: Record<string, RollTypeOverrideDraftEntry> = {}
  for (const rollType of props.rollTypeSettings) {
    next[rollType.id] = { enabled: rollType.enabled, order: rollType.order, visibility: rollType.visibility ?? '' }
  }
  draft.value = next
}

watch(() => props.rollTypeSettings, seedDraft, { immediate: true })

const saving = ref(false)
const error = ref('')
const success = ref('')

async function save() {
  saving.value = true
  error.value = ''
  success.value = ''

  const nextOverrides = buildRollTypeOverridesPatch(props.rollTypeOverrides, draft.value)

  try {
    await $fetch(`/api/worlds/${props.worldId}/rules/config`, {
      method: 'PATCH',
      body: { rollTypes: nextOverrides }
    })
    success.value = 'Roll type settings saved.'
    emit('changed')
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.data?.message || err?.message || 'Failed to save roll type settings.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
      Roll Types
    </div>
    <h3 class="mt-2 text-lg font-semibold text-white">
      Configure Package Roll Types
    </h3>

    <div
      v-if="!rollTypeSettings.length"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
    >
      This package declares no roll types.
    </div>

    <div
      v-else
      class="mt-4 grid gap-2"
    >
      <div
        v-for="rollType in rollTypeSettings"
        :key="rollType.id"
        class="grid grid-cols-1 items-center gap-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.38)] p-3 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-white">
            {{ rollType.label }}
          </div>
          <div class="mt-1 truncate text-xs text-[#9f9278]">
            {{ rollType.surfaces.join(', ') }}
          </div>
        </div>

        <label
          v-if="draft[rollType.id]"
          class="flex items-center gap-2 text-xs text-[#d8ceb8]"
        >
          <input
            v-model="draft[rollType.id]!.enabled"
            type="checkbox"
            class="h-4 w-4"
          >
          Enabled
        </label>

        <label
          v-if="draft[rollType.id]"
          class="flex items-center gap-2 text-xs text-[#d8ceb8]"
        >
          Order
          <input
            v-model.number="draft[rollType.id]!.order"
            type="number"
            class="eldra-input w-16 rounded-none px-2 py-1 text-sm text-white"
          >
        </label>

        <select
          v-if="draft[rollType.id]"
          v-model="draft[rollType.id]!.visibility"
          class="eldra-input w-32 rounded-none px-2 py-1 text-xs text-white"
        >
          <option
            value=""
            class="bg-[#090909] text-[#f5e7bd]"
          >
            Default{{ rollType.declaredVisibility ? ` (${rollType.declaredVisibility})` : '' }}
          </option>
          <option
            v-for="choice in VISIBILITY_CHOICES"
            :key="choice"
            :value="choice"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ choice }}
          </option>
        </select>
      </div>
    </div>

    <div
      v-if="error"
      class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
    >
      {{ error }}
    </div>

    <div
      v-if="success"
      class="mt-4 rounded-none border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100"
    >
      {{ success }}
    </div>

    <button
      v-if="rollTypeSettings.length"
      type="button"
      class="eldra-button mt-4 rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
      :disabled="saving"
      @click="save"
    >
      {{ saving ? 'Saving...' : 'Save Roll Type Settings' }}
    </button>
  </div>
</template>
