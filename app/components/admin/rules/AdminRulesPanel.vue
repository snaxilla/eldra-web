<script setup lang="ts">
// Game Admin Rules tab -- Infrastructure Commit 9. See .github/docs/
// architecture/rules-package-infrastructure.md §5 Infra 8/9. Everything
// displayed comes exclusively from GET /api/worlds/:id/rules/summary
// (server/utils/world-runtime-service.ts's summarizeWorldRuntime); this
// component and its children never construct a Registry, a
// DependencyGraph, or resolve World Configuration themselves. Editing
// (activation, optional rules, roll types) always writes through the
// already-existing endpoints and then re-fetches this same summary --
// see loadSummary below, the only place `summary` is ever assigned.

import AdminRulesEmptyState from './AdminRulesEmptyState.vue'
import AdminRulesBrokenState from './AdminRulesBrokenState.vue'
import AdminRulesReadyState from './AdminRulesReadyState.vue'
import AdminRulesActivationPanel from './AdminRulesActivationPanel.vue'
import { classifyRulesSummary } from './rulesSummary'

const props = defineProps<{
  worldId: string | number
}>()

const worldId = computed(() => String(props.worldId || ''))

const summary = ref<any | null>(null)
const summaryPending = ref(false)
const summaryError = ref('')

// The one place `summary` is ever written. Called on mount, on manual
// Refresh, and after every successful activation/config-save (via
// `@activated`/`@changed` below) -- never applied optimistically, so this
// is always a real round-trip to the server, per this commit's own CONFIG
// section ("No optimistic updates. Always refresh from the server").
async function loadSummary() {
  if (!worldId.value) return

  summaryPending.value = true
  summaryError.value = ''

  try {
    summary.value = await $fetch(`/api/worlds/${worldId.value}/rules/summary`)
  } catch (error: any) {
    summary.value = null
    summaryError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load the Rules summary.'
  } finally {
    summaryPending.value = false
  }
}

watch(worldId, loadSummary, { immediate: true })

const state = computed(() => classifyRulesSummary(summary.value))

// Activation must offer switching from EVERY state (unconfigured, broken,
// ready) -- only the ready state has a packageId/version to prefill.
const currentPackageId = computed(() => (state.value === 'ready' ? summary.value?.packageId : undefined))
const currentPackageVersion = computed(() => (state.value === 'ready' ? summary.value?.packageVersion : undefined))
</script>

<template>
  <section class="mt-6 grid gap-5">
    <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            World Rules
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            Active Rules Package
          </h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
            This World's Rules Engine runtime -- the same summary the Character
            Sheet will eventually read.
          </p>
        </div>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
          @click="loadSummary"
        >
          Refresh
        </button>
      </div>

      <div
        v-if="summaryPending"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
      >
        Loading Rules summary...
      </div>

      <div
        v-else-if="summaryError"
        class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
      >
        {{ summaryError }}
      </div>

      <AdminRulesEmptyState
        v-else-if="state === 'unconfigured'"
        class="mt-5"
      />

      <AdminRulesBrokenState
        v-else-if="state === 'broken'"
        class="mt-5"
        :summary="summary"
      />

      <AdminRulesReadyState
        v-else
        class="mt-5"
        :world-id="worldId"
        :summary="summary"
        @changed="loadSummary"
      />
    </div>

    <AdminRulesActivationPanel
      v-if="!summaryPending && !summaryError"
      :world-id="worldId"
      :current-package-id="currentPackageId"
      :current-package-version="currentPackageVersion"
      @activated="loadSummary"
    />
  </section>
</template>
