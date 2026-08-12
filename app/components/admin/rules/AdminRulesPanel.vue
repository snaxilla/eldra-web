<script setup lang="ts">
// Game Admin Rules tab -- read-only. See .github/docs/architecture/
// rules-package-infrastructure.md §5 Infra 8. Everything displayed comes
// exclusively from GET /api/worlds/:id/rules/summary
// (server/utils/world-runtime-service.ts's summarizeWorldRuntime); this
// component and its children never construct a Registry, a
// DependencyGraph, or resolve World Configuration themselves -- they only
// render whatever that one endpoint returns.

import AdminRulesEmptyState from './AdminRulesEmptyState.vue'
import AdminRulesBrokenState from './AdminRulesBrokenState.vue'
import AdminRulesReadyState from './AdminRulesReadyState.vue'
import { classifyRulesSummary } from './rulesSummary'

const props = defineProps<{
  worldId: string | number
}>()

const worldId = computed(() => String(props.worldId || ''))

const summary = ref<any | null>(null)
const summaryPending = ref(false)
const summaryError = ref('')

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
</script>

<template>
  <section class="mt-6">
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
            Read-only view of this World's Rules Engine runtime -- the same
            summary the Character Sheet will eventually read. Activation and
            editing land in a future commit.
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
        :summary="summary"
      />
    </div>
  </section>
</template>
