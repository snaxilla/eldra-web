<script setup lang="ts">
// Edits a World's optional-rule values -- Infrastructure Commit 9. Only
// `settings` is ever sent to PATCH /rules/config, and it is always the
// World's FULL current settings with just the `rules` kind replaced, never
// the draft alone -- see buildOptionalRulesSettingsPatch (rulesConfigEdits.ts)
// for why, and for the one piece of this component's logic that is
// actually unit-tested.

import { buildOptionalRulesSettingsPatch } from './rulesConfigEdits'

type OptionalRuleView = {
  key: string
  label: string
  description?: string
  value: unknown
  valueType: 'boolean' | 'number' | 'enum'
  default: unknown
  options?: string[]
  min?: number
  max?: number
}

const props = defineProps<{
  worldId: string | number
  settings: Record<string, Record<string, unknown>>
  optionalRules: OptionalRuleView[]
}>()

// No optimistic updates: a save's result is never applied to `draft`
// directly. `changed` tells the parent to re-fetch GET /rules/summary,
// which flows a fresh `optionalRules` prop back down, which reseeds
// `draft` below -- the same round-trip every other editor in this
// milestone uses.
const emit = defineEmits<{ changed: [] }>()

const draft = ref<Record<string, any>>({})

function seedDraft() {
  const next: Record<string, unknown> = {}
  for (const rule of props.optionalRules) next[rule.key] = rule.value
  draft.value = next
}

watch(() => props.optionalRules, seedDraft, { immediate: true })

const saving = ref(false)
const error = ref('')
const success = ref('')

async function save() {
  saving.value = true
  error.value = ''
  success.value = ''

  const nextSettings = buildOptionalRulesSettingsPatch(props.settings, draft.value)

  try {
    await $fetch(`/api/worlds/${props.worldId}/rules/config`, {
      method: 'PATCH',
      body: { settings: nextSettings }
    })
    success.value = 'Optional rules saved.'
    emit('changed')
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.data?.message || err?.message || 'Failed to save optional rules.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
      Optional Rules
    </div>
    <h3 class="mt-2 text-lg font-semibold text-white">
      Rules This World Can Toggle
    </h3>

    <div
      v-if="!optionalRules.length"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
    >
      This package declares no optional rules.
    </div>

    <div
      v-else
      class="mt-4 grid gap-4"
    >
      <div
        v-for="rule in optionalRules"
        :key="rule.key"
        class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.38)] p-3"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-white">
              {{ rule.label }}
            </div>
            <p
              v-if="rule.description"
              class="mt-1 text-xs leading-5 text-[#9f9278]"
            >
              {{ rule.description }}
            </p>
          </div>

          <label
            v-if="rule.valueType === 'boolean'"
            class="flex shrink-0 items-center gap-2 text-sm text-[#d8ceb8]"
          >
            <input
              v-model="draft[rule.key]"
              type="checkbox"
              class="h-4 w-4"
            >
            Enabled
          </label>

          <input
            v-else-if="rule.valueType === 'number'"
            v-model.number="draft[rule.key]"
            type="number"
            :min="rule.min"
            :max="rule.max"
            class="eldra-input w-28 shrink-0 rounded-none px-3 py-2 text-sm text-white"
          >

          <select
            v-else
            v-model="draft[rule.key]"
            class="eldra-input w-40 shrink-0 rounded-none px-3 py-2 text-sm text-white"
          >
            <option
              v-for="option in rule.options ?? []"
              :key="option"
              :value="option"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option }}
            </option>
          </select>
        </div>

        <p class="mt-2 text-[10px] uppercase tracking-[0.14em] text-[#9f9278]">
          Package default: {{ rule.default }}
        </p>
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
      v-if="optionalRules.length"
      type="button"
      class="eldra-button mt-4 rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
      :disabled="saving"
      @click="save"
    >
      {{ saving ? 'Saving...' : 'Save Optional Rules' }}
    </button>
  </div>
</template>
