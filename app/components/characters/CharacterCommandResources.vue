<script setup lang="ts">
// CharacterCommandResources -- Command Center Reconstruction, Phase H5.
// The player's combat dashboard: everything that changes Health, spends a
// Hit Die, rests-adjacent resource state, marks a Death Save, or spends/
// restores a Spell Slot, now lives here instead of scrolling away in a
// separate Recovery section (and, for Spell Slots, a separate Spells tab).
//
// H5's own brief: "Health belongs together. Resources belong together.
// Recovery belongs together." -- the player should rarely need to leave
// the command center during combat. Short Rest/Long Rest already lived in
// the command center's own button row since Header Phase H1; everything
// else that used to live in CharacterRecoveryPanel.vue and
// CharacterSpellcastingPanel.vue's own Spell Slots block moves here.
//
// KEEP BEHAVIOR, ONLY CHANGE PRESENTATION. Every prop and every emit below
// is copied verbatim from CharacterRecoveryPanel.vue (`health`/`maxHp`/
// `hitDiceMax`/`hitDiceAvailable`/`hitDieSize`, `save`/`recovery`) and
// CharacterSpellcastingPanel.vue's own Spell Slots block (`slotLevels`,
// `expend-slot`/`restore-slot`). The page wires both to the EXACT SAME
// mutation functions it already called (`mutations.recovery.save/apply`,
// `mutations.spellcasting.expendSlot/restoreSlot`) -- nothing about what a
// click DOES changed, only where the control that triggers it lives.
// CharacterRecoveryPanel.vue itself is left unused on disk rather than
// deleted (this session's standing "bypass, don't delete" convention);
// CharacterSpellcastingPanel.vue lost only its Spell Slots block, kept
// verbatim otherwise (summary, Add Spell, Known/Prepared list).
//
// COMPACT ON PURPOSE. This sits inside the command center, competing with
// identity and vitals for space that used to belong to one full-width
// Recovery section alone. Primary, frequently-pressed actions (Apply
// Damage/Healing, Spend Hit Die, the HP correction inputs) keep the
// established min-h-11 (44px) touch target used everywhere else in this
// Sheet. Death Save marks and the Spell Slot +/-, both used far less
// often and already small glyphs even in their original full-size panels,
// step down to a smaller (but still real, `aria-label`led) target -- a
// deliberate density trade-off for a dashboard that has to hold six
// clusters of controls in the space one used to occupy, not an
// accessibility oversight.
//
// MATERIAL -- WELL, UNCHANGED. Every cluster here is something the player
// DOES; `eldra-well` was already CharacterRecoveryPanel's and the Spell
// Slots block's own material (Material Phase 1) and is simply carried
// over into the new compact layout.

import type { StoredCharacterHealth } from '~/lib/characters/health'

export type RecoveryActionType =
  | 'damage' | 'heal' | 'spend-hit-die' | 'short-rest' | 'long-rest' | 'reset-death-saves'

const props = withDefaults(defineProps<{
  health: StoredCharacterHealth
  maxHp: number | null
  hitDiceMax: number | null
  hitDiceAvailable: number | null
  hitDieSize: number | null
  recoverySaving?: boolean
  recoveryError?: string
  isCaster?: boolean | null
  slotLevels?: readonly { level: number; max: number; expended: number }[]
  spellSaving?: boolean
}>(), {
  recoverySaving: false,
  recoveryError: '',
  isCaster: null,
  slotLevels: () => [],
  spellSaving: false
})

const emit = defineEmits<{
  save: [StoredCharacterHealth]
  recovery: [{ type: RecoveryActionType; amount?: number }]
  'expend-slot': [number]
  'restore-slot': [number]
}>()

// --- Health correction (direct override) -----------------------------------
// Local drafts so typing never fights a prop the parent may re-assign
// mid-edit -- unchanged from CharacterRecoveryPanel.vue's own reasoning.
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

// --- Damage / Healing: one shared Amount field, two actions -----------------

const amountDraft = ref('')

const parsedAmount = computed(() => {
  const parsed = Math.trunc(Number(amountDraft.value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
})

function emitRecovery(type: RecoveryActionType, amount?: number) {
  emit('recovery', amount === undefined ? { type } : { type, amount })
}

function applyDamageAction() {
  if (parsedAmount.value === null) return
  emitRecovery('damage', parsedAmount.value)
  amountDraft.value = ''
}

function applyHealingAction() {
  if (parsedAmount.value === null) return
  emitRecovery('heal', parsedAmount.value)
  amountDraft.value = ''
}

// --- Hit Dice ----------------------------------------------------------------

const hitDiceLabel = computed(() => {
  if (props.hitDieSize == null) return 'Hit Dice'
  return `Hit Dice (d${props.hitDieSize})`
})

// --- Death Saves ---------------------------------------------------------
// Clicking mark N sets the count to N -- clicking an already-filled mark
// clears back down to just before it, unchanged from CharacterRecoveryPanel.

function setDeathSaveMarks(kind: 'successes' | 'failures', count: number) {
  const current = props.health.deathSaves[kind]
  const next = current === count ? count - 1 : count
  saveWith({ deathSaves: { ...props.health.deathSaves, [kind]: next } })
}
</script>

<template>
  <div class="grid gap-2">
    <p
      v-if="recoveryError"
      class="rounded-none border border-red-900 bg-red-950/40 p-2 text-xs text-red-300"
    >
      {{ recoveryError }}
    </p>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <!-- HP correction -------------------------------------------------- -->
      <div class="eldra-well col-span-2 rounded-none p-2 sm:col-span-1">
        <div class="text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">
          HP Correction
        </div>
        <div class="mt-1.5 grid grid-cols-2 gap-1.5">
          <label class="block">
            <span class="sr-only">Current HP</span>
            <input
              v-model="currentHpDraft"
              inputmode="numeric"
              aria-label="Current HP"
              class="eldra-input min-h-11 w-full rounded-none px-2 py-1 text-center text-sm font-semibold tabular-nums text-white"
              :disabled="recoverySaving"
              @blur="commitCurrentHp"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
            >
          </label>
          <label class="block">
            <span class="sr-only">Temporary HP</span>
            <input
              v-model="temporaryHpDraft"
              inputmode="numeric"
              aria-label="Temporary HP"
              class="eldra-input min-h-11 w-full rounded-none px-2 py-1 text-center text-sm font-semibold tabular-nums text-white"
              :disabled="recoverySaving"
              @blur="commitTemporaryHp"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
            >
          </label>
        </div>
      </div>

      <!-- Damage / Healing ------------------------------------------------ -->
      <div class="eldra-well col-span-2 rounded-none p-2 sm:col-span-1">
        <div class="text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">
          Damage / Heal
        </div>
        <input
          v-model="amountDraft"
          inputmode="numeric"
          placeholder="0"
          aria-label="Amount"
          class="eldra-input mt-1.5 min-h-11 w-full rounded-none px-2 py-1 text-center text-sm font-semibold tabular-nums text-white"
          :disabled="recoverySaving"
        >
        <div class="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            class="min-h-11 rounded-none border border-red-900/60 bg-red-950/20 text-xs font-semibold text-red-200 focus-visible:ring-2 focus-visible:ring-red-500/60 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="recoverySaving || parsedAmount === null"
            @click="applyDamageAction"
          >
            Damage
          </button>
          <button
            type="button"
            class="eldra-button min-h-11 rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="recoverySaving || parsedAmount === null"
            @click="applyHealingAction"
          >
            Heal
          </button>
        </div>
      </div>

      <!-- Hit Dice ---------------------------------------------------------- -->
      <div class="eldra-well rounded-none p-2">
        <div class="text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">
          {{ hitDiceLabel }}
        </div>
        <div class="mt-1.5 text-sm tabular-nums text-[#d8ceb8]">
          {{ hitDiceAvailable ?? '—' }} / {{ hitDiceMax ?? '—' }}
        </div>
        <button
          type="button"
          class="eldra-button mt-1.5 min-h-11 w-full rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="recoverySaving || (hitDiceAvailable != null && hitDiceAvailable <= 0)"
          @click="emitRecovery('spend-hit-die')"
        >
          Spend
        </button>
      </div>

      <!-- Death Saves --------------------------------------------------- -->
      <div class="eldra-well rounded-none p-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">Death Saves</span>
          <button
            type="button"
            class="text-[0.6rem] uppercase tracking-[0.1em] text-[#9f9278] underline-offset-2 hover:text-[#d8ceb8] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="recoverySaving || (health.deathSaves.successes === 0 && health.deathSaves.failures === 0)"
            @click="emitRecovery('reset-death-saves')"
          >
            Reset
          </button>
        </div>

        <div
          v-for="kind in (['successes', 'failures'] as const)"
          :key="kind"
          class="mt-1.5 flex items-center justify-between gap-2"
        >
          <span class="text-[0.65rem] capitalize text-[#d8ceb8]">{{ kind === 'successes' ? 'Succ.' : 'Fail.' }}</span>
          <div class="flex gap-1">
            <button
              v-for="mark in [1, 2, 3]"
              :key="mark"
              type="button"
              class="size-8 shrink-0 rounded-full border text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed"
              :class="mark <= health.deathSaves[kind]
                ? (kind === 'successes'
                  ? 'border-[#9ec37d] bg-[rgba(158,195,125,0.22)]'
                  : 'border-red-500 bg-red-950/40')
                : 'border-[rgba(201,164,90,0.24)] bg-transparent'"
              :disabled="recoverySaving"
              :aria-label="`${kind} mark ${mark}`"
              :aria-pressed="mark <= health.deathSaves[kind]"
              @click="setDeathSaveMarks(kind, mark)"
            />
          </div>
        </div>
      </div>

      <!-- Spell Slots -- casters only, full width so every level fits. ---- -->
      <div
        v-if="isCaster && slotLevels.length"
        class="eldra-well col-span-2 rounded-none p-2 sm:col-span-4"
      >
        <div class="text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">
          Spell Slots
        </div>

        <div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
          <div
            v-for="slot in slotLevels"
            :key="slot.level"
            class="flex items-center gap-1.5"
          >
            <span class="text-xs font-semibold uppercase tracking-[0.08em] text-[#d8ceb8]">L{{ slot.level }}</span>
            <span class="text-xs tabular-nums text-[#9f9278]">{{ slot.max - slot.expended }}/{{ slot.max }}</span>
            <button
              type="button"
              class="min-h-9 min-w-9 rounded-none border border-[rgba(201,164,90,0.24)] text-xs font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="spellSaving || slot.expended <= 0"
              :aria-label="`Restore a level ${slot.level} spell slot`"
              @click="emit('restore-slot', slot.level)"
            >
              −
            </button>
            <button
              type="button"
              class="min-h-9 min-w-9 rounded-none border border-[rgba(201,164,90,0.24)] text-xs font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="spellSaving || slot.expended >= slot.max"
              :aria-label="`Expend a level ${slot.level} spell slot`"
              @click="emit('expend-slot', slot.level)"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
