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
// ERRORS ARE SHOWN VERBATIM (this task's own ERRORS section). A malformed
// formula's 400 already carries OpenDice's own message
// (server/utils/roll-events.ts); this component never substitutes generic
// text for it -- the whole point of a sandbox is seeing exactly what the
// server said.
//
// Pure request-shaping logic lives in ./rollSandbox.ts, not here -- this
// repo has no component-rendering test harness, so anything worth testing
// about this tool has to be importable outside a .vue file (same split
// app/utils/diceBoxRollSummary.ts already established for
// EldraDiceBox.client.vue).
//
// PHASE 2C: USES THE SAME ROLL TRAY, NOT A SECOND HISTORY UI. This
// component used to hand-render its own Result panel and History list
// against its own local `$fetch` calls. Both are gone -- this file now
// calls `useWorldRolls.ts` (the exact composable every sheet surface uses)
// and hands its `history`/`pending`/`error`/pagination state straight to
// `WorldRollTray.vue`, unmodified. "The sandbox simply exercises the
// tray" (this task's own DEVELOPER SANDBOX section) -- the form below is
// the only thing left that is Sandbox-specific.
//
// NOT WIRED (this task's own DO NOT list, Phase 2B+): abilities, saving
// throws, skills, attacks, spells, the dice box, realtime, or the
// Character Sheet. This component knows none of those exist.
//
// ROLL SYSTEM PHASE 4B.1 (AUTHORED THREE.JS d20 PROOF OF CONCEPT): THE
// RENDERER-MODE SELECTOR. This page (`worlds/[id]/admin.vue`,
// `layout: 'world-workspace'`) already mounts the real, shared
// `WorldDiceOverlay.vue` -- the exact same queue/renderer every gameplay
// surface uses -- so rolling `1d20` here exercises whichever renderer is
// selected end to end, not a preview. The selector below is this phase's
// own "a simple development flag is sufficient" FEATURE FLAG / COMPARISON
// requirement made concrete and testable -- Phase 4B's own two-way
// checkbox, widened in place to a mode selector (see
// useDiceRendererMode.ts's own header for why the SAME mechanism was
// extended rather than a second flag system being invented, and for why
// it offers only 'physics'/'authored-three', not a third 'authored-css'
// option). Not a permanent settings surface.

import WorldRollTray from '~/components/world/WorldRollTray.vue'
import { useDiceRendererMode } from '~/composables/useDiceRendererMode'
import { useWorldRolls } from '~/composables/useWorldRolls'
import type { RollVisibility } from '~/lib/rolls/types'
import { buildCustomRollRequestBody } from './rollSandbox'

const diceRendererMode = useDiceRendererMode()

const props = defineProps<{
  worldId: string | number
}>()

const worldId = computed(() => String(props.worldId || ''))

const {
  pending: rolling,
  error: rollError,
  history,
  nextCursor,
  historyPending,
  historyError,
  requestRoll,
  refreshHistory,
  loadMoreHistory
} = useWorldRolls(worldId)

// ---------------------------------------------------------------------------
// Roll form -- the one thing here that isn't the shared composable/Tray.
// ---------------------------------------------------------------------------

const expression = ref('1d20')
const visibility = ref<RollVisibility>('private')
const label = ref('')

async function submitRoll() {
  if (rolling.value) return

  if (!expression.value.trim()) {
    // Mirrors requestRoll's own thrown-and-recorded-in-`error` shape so
    // the Tray's error banner is the one place this ever surfaces --
    // never a second, local error string.
    rollError.value = 'expression is required for a custom roll'
    return
  }

  await requestRoll(buildCustomRollRequestBody({
    expression: expression.value,
    visibility: visibility.value,
    label: label.value
  })).catch(() => {})
}

watch(worldId, () => refreshHistory().catch(() => {}), { immediate: true })
</script>

<template>
  <div>
    <h4 class="text-lg font-semibold text-white">
      Roll Sandbox
    </h4>
    <p class="mt-1 max-w-2xl text-sm leading-6 text-[#9f9278]">
      Rolls a real, server-authoritative <span class="font-mono">custom</span> Roll Event -- OpenDice, persistence, the API, authorization, and history, exactly as any future gameplay feature will use this pipeline. Not wired to abilities, saves, skills, attacks, spells, the dice box, realtime, or the Character Sheet yet.
    </p>

    <!-- Roll System Phase 4B.1 -- renderer-mode selector. Selects which
         DiceRendererAdapter WorldDiceOverlay.vue registers; 'physics'
         remains the default and is unaffected by this selector. Only a
         plain 1d20 roll actually animates on the authored renderer --
         anything else falls back to the physics renderer regardless of
         this selection. No 'authored-css' option -- Phase 4B's own CSS/DOM
         proof of concept was never committed to git and was removed from
         this selector by this phase's own deployment fix; see
         useDiceRendererMode.ts's own header for the full account. -->
    <fieldset class="mt-3">
      <legend class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">
        Dice Renderer (dev)
      </legend>
      <div class="flex flex-wrap items-center gap-4 text-sm text-[#d8ceb8]">
        <label class="flex items-center gap-2">
          <input
            v-model="diceRendererMode"
            type="radio"
            value="physics"
            class="accent-[#c9a45a]"
          >
          Physics (default)
        </label>
        <label class="flex items-center gap-2">
          <input
            v-model="diceRendererMode"
            type="radio"
            value="authored-three"
            class="accent-[#c9a45a]"
          >
          Authored Three.js (Phase 4B.1)
        </label>
      </div>
    </fieldset>

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

    <!-- Phase 2C: the exact same Roll Tray every sheet surface uses -- no
         Sandbox-specific Result/History markup left ("the sandbox simply
         exercises the tray"). `WorldRollTray` docks itself `fixed` to the
         real viewport corner (see its own header) -- this is deliberately
         NOT wrapped in a positioned preview box, so what a developer sees
         here is exactly the same floating tray a player would, not a
         boxed-in approximation of it. -->
    <WorldRollTray
      :rolls="history"
      :pending="rolling"
      :error="rollError"
      :history-pending="historyPending"
      :history-error="historyError"
      :has-more="Boolean(nextCursor)"
      empty-message="No rolls yet in this World."
      @load-more="loadMoreHistory().catch(() => {})"
    />
  </div>
</template>
