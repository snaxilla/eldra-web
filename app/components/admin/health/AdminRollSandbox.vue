<script setup lang="ts">
// Developer Roll Sandbox -- Eldra Roll System Phase 2A. See
// .github/docs/architecture/eldra-roll-system.md.
//
// The first real client of the Roll Event infrastructure Phase 1 built.
// Exists to prove OpenDice -> Roll Event persistence -> API ->
// Authorization -> History all work together, before any gameplay system
// (Character Sheet click-to-roll, the Actions tab, Combat) depends on the
// same pipeline. This is a developer tool, not a preview of gameplay UI --
// it exercises `sourceType: 'custom'` only (Phase 1's own scope) against
// the real POST/GET /api/worlds/:id/rolls endpoints, with no mock, no
// stub, and no shortcut around authorization.
//
// DELIBERATELY NOT BEAUTIFIED (this task's own instruction: "Correctness
// is more important than appearance"). The Result panel shows the actual
// RollEventRecord the server returned -- field by field, plus the raw
// JSON underneath -- never a recomputed or prettied-up summary that could
// silently disagree with what the server actually persisted.
//
// ERRORS ARE SHOWN VERBATIM (this task's own ERRORS section). A malformed
// formula's 400 already carries OpenDice's own message
// (server/utils/roll-events.ts); this component never substitutes generic
// text for it -- the whole point of a sandbox is seeing exactly what the
// server said.
//
// Pure display/request-shaping logic lives in ./rollSandbox.ts, not here
// -- this repo has no component-rendering test harness, so anything worth
// testing about this tool has to be importable outside a .vue file (same
// split app/utils/diceBoxRollSummary.ts already established for
// EldraDiceBox.client.vue).
//
// NOT WIRED (this task's own DO NOT list, Phase 2B+): abilities, saving
// throws, skills, attacks, spells, the dice box, realtime, or the
// Character Sheet. This component knows none of those exist.

import type { RollEventRecord, RollVisibility } from '~/lib/rolls/types'
import {
  buildCustomRollRequestBody,
  extractServerErrorMessage,
  formatRollDieGroup,
  formatRollModifiers
} from './rollSandbox'

const props = defineProps<{
  worldId: string | number
}>()

const worldId = computed(() => String(props.worldId || ''))

// ---------------------------------------------------------------------------
// Roll form
// ---------------------------------------------------------------------------

const expression = ref('1d20')
const visibility = ref<RollVisibility>('private')
const label = ref('')

const rolling = ref(false)
const rollError = ref('')
const latestRoll = ref<RollEventRecord | null>(null)

async function submitRoll() {
  if (rolling.value) return

  if (!expression.value.trim()) {
    rollError.value = 'expression is required for a custom roll'
    return
  }

  rolling.value = true
  rollError.value = ''

  try {
    const roll = await $fetch<RollEventRecord>(`/api/worlds/${worldId.value}/rolls`, {
      method: 'POST',
      body: buildCustomRollRequestBody({
        expression: expression.value,
        visibility: visibility.value,
        label: label.value
      })
    })

    latestRoll.value = roll
    // The server already returned the exact row it persisted -- prepend
    // it to history immediately rather than waiting on a manual Refresh:
    // eldra-roll-system.md §13's own "server stores the result before
    // broadcasting it" already means this IS the durable record, not a
    // preview of one.
    history.value = [roll, ...history.value]
  } catch (error: any) {
    rollError.value = extractServerErrorMessage(error)
  } finally {
    rolling.value = false
  }
}

// ---------------------------------------------------------------------------
// History -- GET /api/worlds/:id/rolls, newest first (the endpoint's own
// default sort, eldra-roll-system.md §7), with cursor-based "Load more."
// ---------------------------------------------------------------------------

type RollsListResponse = { rolls: RollEventRecord[]; nextCursor: string | null }

const history = ref<RollEventRecord[]>([])
const historyPending = ref(false)
const historyError = ref('')
const nextCursor = ref<string | null>(null)

async function loadHistory() {
  if (!worldId.value) return

  historyPending.value = true
  historyError.value = ''

  try {
    const result = await $fetch<RollsListResponse>(`/api/worlds/${worldId.value}/rolls`)
    history.value = result.rolls
    nextCursor.value = result.nextCursor
  } catch (error: any) {
    historyError.value = extractServerErrorMessage(error)
  } finally {
    historyPending.value = false
  }
}

async function loadMoreHistory() {
  if (!nextCursor.value || historyPending.value) return

  historyPending.value = true
  historyError.value = ''

  try {
    const result = await $fetch<RollsListResponse>(`/api/worlds/${worldId.value}/rolls`, {
      query: { cursor: nextCursor.value }
    })
    history.value = [...history.value, ...result.rolls]
    nextCursor.value = result.nextCursor
  } catch (error: any) {
    historyError.value = extractServerErrorMessage(error)
  } finally {
    historyPending.value = false
  }
}

watch(worldId, loadHistory, { immediate: true })
</script>

<template>
  <div>
    <h4 class="text-lg font-semibold text-white">
      Roll Sandbox
    </h4>
    <p class="mt-1 max-w-2xl text-sm leading-6 text-[#9f9278]">
      Rolls a real, server-authoritative <span class="font-mono">custom</span> Roll Event -- OpenDice, persistence, the API, authorization, and history, exactly as any future gameplay feature will use this pipeline. Not wired to abilities, saves, skills, attacks, spells, the dice box, realtime, or the Character Sheet yet.
    </p>

    <!-- Form -->
    <form
      class="mt-4 grid gap-3 sm:grid-cols-2"
      @submit.prevent="submitRoll"
    >
      <label class="block sm:col-span-2">
        <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Roll Expression</span>
        <input
          v-model="expression"
          type="text"
          placeholder="1d20"
          class="eldra-input w-full rounded-none px-3 py-2 font-mono text-sm text-white"
        >
      </label>

      <fieldset class="block">
        <legend class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">
          Visibility
        </legend>
        <div class="flex items-center gap-4 text-sm text-[#d8ceb8]">
          <label class="flex items-center gap-2">
            <input
              v-model="visibility"
              type="radio"
              value="private"
            >
            Private
          </label>
          <label class="flex items-center gap-2">
            <input
              v-model="visibility"
              type="radio"
              value="table"
            >
            Table
          </label>
        </div>
      </fieldset>

      <label class="block">
        <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Label (optional)</span>
        <input
          v-model="label"
          type="text"
          placeholder="e.g. Debug roll"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
        >
      </label>

      <div class="sm:col-span-2">
        <button
          type="submit"
          class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="rolling"
        >
          {{ rolling ? 'Rolling…' : 'Roll' }}
        </button>
      </div>
    </form>

    <!-- Errors -- the server's own message, verbatim -->
    <div
      v-if="rollError"
      class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 font-mono text-xs leading-5 text-red-200"
    >
      {{ rollError }}
    </div>

    <!-- Result -->
    <div
      v-if="latestRoll"
      class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
    >
      <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">
        Result
      </div>

      <dl class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
            Expression
          </dt>
          <dd class="font-mono text-sm text-[#fff7df]">
            {{ latestRoll.expression }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
            Total
          </dt>
          <dd class="font-mono text-lg font-semibold text-[#fff7df]">
            {{ latestRoll.total }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
            Individual dice
          </dt>
          <dd class="mt-1 grid gap-1 font-mono text-xs text-[#d8ceb8]">
            <div
              v-for="(group, index) in latestRoll.dice"
              :key="index"
            >
              {{ formatRollDieGroup(group, index) }}
            </div>
            <div
              v-if="!latestRoll.dice.length"
              class="text-[#6f6754]"
            >
              (no dice)
            </div>
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
            Modifier(s)
          </dt>
          <dd class="font-mono text-sm text-[#d8ceb8]">
            {{ formatRollModifiers(latestRoll) }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
            Visibility
          </dt>
          <dd class="text-sm text-[#d8ceb8]">
            {{ latestRoll.visibility }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
            Timestamp
          </dt>
          <dd class="font-mono text-xs text-[#d8ceb8]">
            {{ latestRoll.createdAt }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
            Roll ID
          </dt>
          <dd
            class="truncate font-mono text-xs text-[#d8ceb8]"
            :title="latestRoll.id"
          >
            {{ latestRoll.id }}
          </dd>
        </div>
      </dl>

      <details class="mt-3">
        <summary class="cursor-pointer text-xs uppercase tracking-[0.18em] text-[#9f9278]">
          Raw RollEventRecord
        </summary>
        <pre class="mt-2 overflow-x-auto rounded-none border border-[rgba(201,164,90,0.14)] bg-black/30 p-3 font-mono text-xs text-[#d8ceb8]">{{ JSON.stringify(latestRoll, null, 2) }}</pre>
      </details>
    </div>

    <!-- History -->
    <div class="mt-6">
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">
          Roll History — GET /api/worlds/:id/rolls
        </div>
        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-1.5 text-xs font-semibold text-[#fff7df] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="historyPending"
          @click="loadHistory"
        >
          {{ historyPending && !history.length ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div
        v-if="historyError"
        class="mt-2 rounded-none border border-red-500/20 bg-red-500/10 p-3 font-mono text-xs leading-5 text-red-200"
      >
        {{ historyError }}
      </div>

      <p
        v-else-if="!historyPending && !history.length"
        class="mt-2 text-sm text-[#9f9278]"
      >
        No rolls yet in this World.
      </p>

      <ul
        v-else
        class="mt-2 grid gap-1.5"
      >
        <li
          v-for="roll in history"
          :key="roll.id"
          class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(20,17,12,0.4)] p-2.5 font-mono text-xs text-[#d8ceb8]"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="truncate text-[#fff7df]">{{ roll.label }}</span>
            <span class="shrink-0 font-semibold text-[#fff7df]">{{ roll.total }}</span>
          </div>
          <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[#9f9278]">
            <span>{{ roll.expression }}</span>
            <span>{{ formatRollModifiers(roll) }}</span>
            <span>{{ roll.visibility }}</span>
            <span>{{ roll.createdAt }}</span>
            <span
              class="truncate"
              :title="roll.id"
            >{{ roll.id }}</span>
          </div>
          <div class="mt-1 text-[#6f6754]">
            <span
              v-for="(group, index) in roll.dice"
              :key="index"
              class="mr-3"
            >{{ formatRollDieGroup(group, index) }}</span>
          </div>
        </li>
      </ul>

      <button
        v-if="nextCursor"
        type="button"
        class="mt-3 rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-1.5 text-xs font-semibold text-[#fff7df] disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="historyPending"
        @click="loadMoreHistory"
      >
        {{ historyPending ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>
