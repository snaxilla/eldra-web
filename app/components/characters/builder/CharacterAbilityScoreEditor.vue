<script setup lang="ts">
// The Ability Score step -- Character Builder / Character Sheet Phase 3.
//
// Used by BOTH Builder surfaces, identically:
//   create-v2.vue                       -- assigning scores for a new character
//   [characterId]/abilities.vue         -- editing an existing character's
//
// The Builder teaches, the Sheet displays, the Rules Engine calculates. This
// component belongs to the first of those three: it explains what each method
// IS, shows a live budget while a player spends it, and never computes a
// modifier, save, skill, or hit point from what it collects. Every rule it
// enforces is an ENTRY constraint (may I type this?) rather than a derivation
// (what does this number mean?) -- see app/lib/characters/ability-scores.ts's
// own boundary note, where all of that logic lives, pure and unit-tested.
//
// ---------------------------------------------------------------------------
// MOBILE IS NOT A REDUCED MODE
// ---------------------------------------------------------------------------
// One component, every viewport, no JS breakpoint and no layout prop -- there
// is nothing here a phone should not have. What makes it work with thumbs:
//
//   - Point Buy and Manual use 48x48px (h-12 w-12) -/+ steppers, comfortably
//     past the 44px iOS target guidance, rather than a slider (imprecise with
//     a thumb, and impossible to hit an exact 13) or a bare number field
//     (summons a keyboard to change a value by one).
//   - Standard Array uses a native <select>, which on iOS and Android is a
//     full-height native picker -- better than any custom dropdown, and free.
//   - Manual keeps a real <input type="number"> BESIDE its steppers, because
//     typing 17 directly beats nine taps; `inputmode="numeric"` gets the
//     numeric keypad rather than the full keyboard.
//   - The points-remaining budget is stated as text, never as colour alone.
//   - Rows stack at every width; nothing scrolls sideways.

import {
  ABILITY_ABBREVIATIONS,
  ABILITY_KEYS,
  ABILITY_LABELS,
  ABILITY_SCORE_METHODS,
  ABILITY_SCORE_METHOD_DESCRIPTIONS,
  ABILITY_SCORE_METHOD_LABELS,
  MAX_STORED_ABILITY_SCORE,
  MIN_STORED_ABILITY_SCORE,
  POINT_BUY_BUDGET,
  canLowerPointBuy,
  canRaisePointBuy,
  isAbilityScoreMethodAvailable,
  pointBuyRemaining,
  remainingStandardArrayValues,
  type AbilityKey,
  type AbilityScoreAssignment,
  type AbilityScoreMethod
} from '~/lib/characters/ability-scores'

const props = defineProps<{
  method: AbilityScoreMethod
  assignment: AbilityScoreAssignment
}>()

const emit = defineEmits<{
  'update:method': [value: AbilityScoreMethod]
  'update:ability': [key: AbilityKey, value: number | null]
}>()

const remainingPoints = computed(() => pointBuyRemaining(props.assignment))

// Which Standard Array values are still on the table, plus whatever this row
// already holds -- so a row's own current value never vanishes from its own
// dropdown.
function standardArrayOptionsFor(key: AbilityKey): number[] {
  const remaining = remainingStandardArrayValues(props.assignment)
  const current = props.assignment[key]
  const options = typeof current === 'number' ? [current, ...remaining] : remaining
  return [...new Set(options)].sort((a, b) => b - a)
}

function onStandardArraySelect(key: AbilityKey, raw: string) {
  emit('update:ability', key, raw === '' ? null : Number(raw))
}

function step(key: AbilityKey, delta: number) {
  const current = props.assignment[key]
  if (typeof current !== 'number') return
  emit('update:ability', key, current + delta)
}

function onManualInput(key: AbilityKey, raw: string) {
  if (raw === '') {
    emit('update:ability', key, null)
    return
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return
  emit('update:ability', key, Math.round(parsed))
}

function canStepManual(key: AbilityKey, delta: number): boolean {
  const current = props.assignment[key]
  if (typeof current !== 'number') return false
  const next = current + delta
  return next >= MIN_STORED_ABILITY_SCORE && next <= MAX_STORED_ABILITY_SCORE
}
</script>

<template>
  <div class="min-w-0">
    <!-- Method picker ---------------------------------------------------- -->
    <fieldset class="border-0 p-0">
      <legend class="sr-only">Ability score method</legend>
      <div class="grid gap-2 sm:grid-cols-2">
        <label
          v-for="option in ABILITY_SCORE_METHODS"
          :key="option"
          class="group relative flex min-h-14 items-start gap-3 rounded-none border px-4 py-3 transition"
          :class="[
            isAbilityScoreMethodAvailable(option) ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
            method === option
              ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)]'
              : 'border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] hover:border-[rgba(201,164,90,0.42)]'
          ]"
        >
          <input
            type="radio"
            name="ability-score-method"
            class="peer sr-only"
            :value="option"
            :checked="method === option"
            :disabled="!isAbilityScoreMethodAvailable(option)"
            @change="emit('update:method', option)"
          >

          <!-- Shape + fill, never colour alone. -->
          <span
            aria-hidden="true"
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition"
            :class="method === option
              ? 'border-[rgba(201,164,90,0.85)] bg-[rgba(201,164,90,0.85)]'
              : 'border-[rgba(201,164,90,0.35)]'"
          >
            <span
              v-if="method === option"
              class="h-2 w-2 rounded-full bg-[#12100b]"
            />
          </span>

          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-[#fff7df]">
              {{ ABILITY_SCORE_METHOD_LABELS[option] }}
              <span
                v-if="!isAbilityScoreMethodAvailable(option)"
                class="ml-1 text-xs font-normal uppercase tracking-[0.12em] text-[#9f9278]"
              >· Coming soon</span>
            </span>
            <span class="mt-0.5 block text-xs leading-5 text-[#9f9278]">
              {{ ABILITY_SCORE_METHOD_DESCRIPTIONS[option] }}
            </span>
          </span>

          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 ring-2 ring-transparent peer-focus-visible:ring-[rgba(201,164,90,0.65)]"
          />
        </label>
      </div>
    </fieldset>

    <!-- STANDARD ARRAY --------------------------------------------------- -->
    <div
      v-if="method === 'standard-array'"
      class="mt-5"
    >
      <p class="text-sm leading-6 text-[#d8ceb8]">
        Assign each value to one ability. Every value is used exactly once.
      </p>

      <div class="mt-4 grid gap-2">
        <div
          v-for="key in ABILITY_KEYS"
          :key="key"
          class="flex min-w-0 items-center gap-3 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] px-4 py-3"
        >
          <label
            :for="`ability-${key}`"
            class="min-w-0 flex-1"
          >
            <span class="block text-sm font-semibold text-[#fff7df]">{{ ABILITY_LABELS[key] }}</span>
            <span class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">{{ ABILITY_ABBREVIATIONS[key] }}</span>
          </label>
          <select
            :id="`ability-${key}`"
            class="min-h-12 w-28 shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-3 text-base text-[#fff7df] outline-none focus-visible:border-[rgba(201,164,90,0.58)] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.35)]"
            :value="assignment[key] === null ? '' : String(assignment[key])"
            @change="onStandardArraySelect(key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              —
            </option>
            <option
              v-for="value in standardArrayOptionsFor(key)"
              :key="value"
              :value="String(value)"
            >
              {{ value }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- POINT BUY -------------------------------------------------------- -->
    <div
      v-else-if="method === 'point-buy'"
      class="mt-5"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-3">
        <span class="text-sm text-[#d8ceb8]">Points remaining</span>
        <span
          class="text-xl font-semibold tabular-nums"
          :class="remainingPoints === 0 ? 'text-[#9f9278]' : 'text-[#fff7df]'"
        >
          {{ remainingPoints }} <span class="text-sm font-normal text-[#9f9278]">of {{ POINT_BUY_BUDGET }}</span>
        </span>
      </div>

      <div class="mt-4 grid gap-2">
        <div
          v-for="key in ABILITY_KEYS"
          :key="key"
          class="flex min-w-0 items-center gap-2 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] px-3 py-3 sm:gap-3 sm:px-4"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-[#fff7df]">{{ ABILITY_LABELS[key] }}</span>
            <span class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">{{ ABILITY_ABBREVIATIONS[key] }}</span>
          </span>

          <button
            type="button"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] text-xl leading-none text-[#d8ceb8] transition disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
            :disabled="!canLowerPointBuy(assignment, key)"
            :aria-label="`Lower ${ABILITY_LABELS[key]}`"
            @click="step(key, -1)"
          >
            &minus;
          </button>

          <output
            class="w-10 shrink-0 text-center text-xl font-semibold tabular-nums text-[#fff7df]"
            :aria-label="`${ABILITY_LABELS[key]} score`"
          >
            {{ assignment[key] ?? '—' }}
          </output>

          <button
            type="button"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] text-xl leading-none text-[#d8ceb8] transition disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
            :disabled="!canRaisePointBuy(assignment, key)"
            :aria-label="`Raise ${ABILITY_LABELS[key]}`"
            @click="step(key, 1)"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <!-- MANUAL ----------------------------------------------------------- -->
    <div
      v-else-if="method === 'manual'"
      class="mt-5"
    >
      <p class="text-sm leading-6 text-[#d8ceb8]">
        Enter each score directly. Values from {{ MIN_STORED_ABILITY_SCORE }} to {{ MAX_STORED_ABILITY_SCORE }} are accepted.
      </p>

      <div class="mt-4 grid gap-2">
        <div
          v-for="key in ABILITY_KEYS"
          :key="key"
          class="flex min-w-0 items-center gap-2 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] px-3 py-3 sm:gap-3 sm:px-4"
        >
          <label
            :for="`ability-manual-${key}`"
            class="min-w-0 flex-1"
          >
            <span class="block text-sm font-semibold text-[#fff7df]">{{ ABILITY_LABELS[key] }}</span>
            <span class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">{{ ABILITY_ABBREVIATIONS[key] }}</span>
          </label>

          <button
            type="button"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] text-xl leading-none text-[#d8ceb8] transition disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
            :disabled="!canStepManual(key, -1)"
            :aria-label="`Lower ${ABILITY_LABELS[key]}`"
            @click="step(key, -1)"
          >
            &minus;
          </button>

          <!-- Typing beats nine taps; the steppers are for nudging. -->
          <input
            :id="`ability-manual-${key}`"
            type="number"
            inputmode="numeric"
            :min="MIN_STORED_ABILITY_SCORE"
            :max="MAX_STORED_ABILITY_SCORE"
            :value="assignment[key] ?? ''"
            class="min-h-12 w-16 shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,10,8,0.6)] px-2 text-center text-lg tabular-nums text-[#fff7df] outline-none focus-visible:border-[rgba(201,164,90,0.58)] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.35)]"
            @input="onManualInput(key, ($event.target as HTMLInputElement).value)"
          >

          <button
            type="button"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] text-xl leading-none text-[#d8ceb8] transition disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
            :disabled="!canStepManual(key, 1)"
            :aria-label="`Raise ${ABILITY_LABELS[key]}`"
            @click="step(key, 1)"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <!-- ROLL (stub) ------------------------------------------------------ -->
    <div
      v-else
      class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.30)] bg-[rgba(20,17,12,0.55)] p-4"
    >
      <p class="text-sm font-semibold text-[#f5e7bd]">
        Rolling is not available yet.
      </p>
      <p class="mt-1 text-sm leading-6 text-[#9f9278]">
        In-app dice rolling for ability scores is coming in a later phase. If you rolled your scores at the table,
        choose <strong class="font-semibold text-[#d8ceb8]">Manual Entry</strong> above and type them in.
      </p>
    </div>
  </div>
</template>
