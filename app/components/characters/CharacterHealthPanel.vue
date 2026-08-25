<script setup lang="ts">
// Health for Character Sheet V2 -- the Health System's editable surface.
//
// Mirrors CharacterInventoryPanel.vue and CharacterNotesPanel.vue's shared
// shape: a page owns load/save, this component owns layout and emits
// intent, and NOTHING here computes a game value. Maximum HP, Hit Dice
// (total), and Hit Dice Available all arrive as PROPS already evaluated by
// the Rules Engine (server/utils/character-derived.ts's `core.health`
// region) -- this file reads them, never recomputes them. The only
// arithmetic in this file is `Math.max`/`Math.min` clamping a DRAFT to a
// legal range before it is sent, which is UI convenience, not a game rule:
// the server re-validates every value independently
// (app/lib/characters/health.ts's own normalize function is the actual
// authority).
//
// ---------------------------------------------------------------------------
// ALWAYS EDITABLE, LIKE INVENTORY -- NOT LIKE ABILITY SCORES
// ---------------------------------------------------------------------------
// Sheet-V2's usual rule is "the Sheet displays, the Builder edits." Health
// is the second deliberate exception (Inventory was the first, and for the
// identical reason): taking damage, healing, spending a Hit Die, and
// marking a death save all happen DURING PLAY, not at character creation.
// Routing them through the Builder would be wrong about when they happen.
// There is no Builder step for Health, and this task does not add one.
//
// ---------------------------------------------------------------------------
// MOBILE
// ---------------------------------------------------------------------------
// Current/Temporary HP are plain number inputs (min-h-11, a mobile numeric
// keypad is already "easy adjustment" for an arbitrary damage/heal amount).
// Hit Dice spent uses +/-1 stepper buttons instead, matching
// CharacterInventoryPanel's own quantity stepper -- spending is always one
// die at a time, so a free-type field would be the wrong control for it.
// Death save marks are three same-sized tap targets per row, not small
// checkboxes -- large enough to hit reliably with a thumb mid-session.

import type { StoredCharacterHealth } from '~/lib/characters/health'

const props = withDefaults(defineProps<{
  health: StoredCharacterHealth
  maxHp: number | null
  hitDiceMax: number | null
  hitDiceAvailable: number | null
  hitDieSize: number | null
  saving?: boolean
  errorMessage?: string
}>(), {
  saving: false,
  errorMessage: ''
})

const emit = defineEmits<{
  save: [StoredCharacterHealth]
}>()

// Local drafts for the two free-type fields, so typing never fights a prop
// the parent may re-assign mid-edit (the same reason CharacterNotesPanel
// holds its own draft rather than binding straight to the prop).
const currentHpDraft = ref(String(props.health.currentHp))
const temporaryHpDraft = ref(String(props.health.temporaryHp))

watch(
  () => props.health,
  (value) => {
    currentHpDraft.value = String(value.currentHp)
    temporaryHpDraft.value = String(value.temporaryHp)
  }
)

function clampNonNegative(raw: string): number {
  const parsed = Math.trunc(Number(raw))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function saveWith(patch: Partial<StoredCharacterHealth>) {
  emit('save', { ...props.health, ...patch })
}

function commitCurrentHp() {
  const next = clampNonNegative(currentHpDraft.value)
  currentHpDraft.value = String(next)
  if (next === props.health.currentHp) return
  saveWith({ currentHp: next })
}

function commitTemporaryHp() {
  const next = clampNonNegative(temporaryHpDraft.value)
  temporaryHpDraft.value = String(next)
  if (next === props.health.temporaryHp) return
  saveWith({ temporaryHp: next })
}

function adjustHitDiceSpent(delta: number) {
  const next = props.health.hitDiceSpent + delta
  if (next < 0) return
  saveWith({ hitDiceSpent: next })
}

// Clicking mark N sets the count to N -- clicking an already-filled mark
// clears back down to just before it. The one interaction every physical
// and digital 5e sheet already uses for a 3-box death save track.
function setDeathSaveMarks(kind: 'successes' | 'failures', count: number) {
  const current = props.health.deathSaves[kind]
  const next = current === count ? count - 1 : count
  saveWith({ deathSaves: { ...props.health.deathSaves, [kind]: next } })
}

const hitDiceLabel = computed(() => {
  if (props.hitDieSize == null) return 'Hit Dice'
  return `Hit Dice (d${props.hitDieSize})`
})
</script>

<template>
  <div class="grid gap-4">
    <p
      v-if="errorMessage"
      class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </p>

    <!-- Hit Points ----------------------------------------------------- -->
    <div class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Hit Points</span>
        <span class="text-xs text-[#9f9278]">
          Maximum: <span class="text-[#fff7df]">{{ maxHp ?? '—' }}</span>
        </span>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Current</span>
          <input
            v-model="currentHpDraft"
            inputmode="numeric"
            class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-lg font-semibold tabular-nums text-white"
            :disabled="saving"
            @blur="commitCurrentHp"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Temporary</span>
          <input
            v-model="temporaryHpDraft"
            inputmode="numeric"
            class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-lg font-semibold tabular-nums text-white"
            :disabled="saving"
            @blur="commitTemporaryHp"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
          >
        </label>
      </div>
    </div>

    <!-- Hit Dice --------------------------------------------------------- -->
    <div class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">{{ hitDiceLabel }}</span>
          <p class="mt-1 text-sm text-[#d8ceb8]">
            {{ hitDiceAvailable ?? '—' }} of {{ hitDiceMax ?? '—' }} available
          </p>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-sm font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="saving || health.hitDiceSpent <= 0"
            aria-label="Restore a Hit Die"
            @click="adjustHitDiceSpent(-1)"
          >
            −
          </button>
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-sm font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="saving || (hitDiceAvailable != null && hitDiceAvailable <= 0)"
            aria-label="Spend a Hit Die"
            @click="adjustHitDiceSpent(1)"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <!-- Death Saves -------------------------------------------------------- -->
    <div class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-4">
      <span class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Death Saves</span>

      <div
        v-for="kind in (['successes', 'failures'] as const)"
        :key="kind"
        class="mt-3 flex items-center justify-between gap-3"
      >
        <span class="text-sm capitalize text-[#d8ceb8]">{{ kind }}</span>
        <div class="flex gap-2">
          <button
            v-for="mark in [1, 2, 3]"
            :key="mark"
            type="button"
            class="size-11 rounded-full border text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed"
            :class="mark <= health.deathSaves[kind]
              ? (kind === 'successes'
                ? 'border-[#9ec37d] bg-[rgba(158,195,125,0.22)]'
                : 'border-red-500 bg-red-950/40')
              : 'border-[rgba(201,164,90,0.24)] bg-transparent'"
            :disabled="saving"
            :aria-label="`${kind} mark ${mark}`"
            :aria-pressed="mark <= health.deathSaves[kind]"
            @click="setDeathSaveMarks(kind, mark)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
