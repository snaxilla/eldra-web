<script setup lang="ts">
// CharacterCommandResources -- Command Center Reconstruction, Phase H5.
// The player's combat dashboard: everything that changes Health, spends a
// Hit Die, rests-adjacent resource state, marks a Death Save, or spends/
// restores a Spell Slot, now lives here instead of scrolling away in a
// separate Recovery section (and, for Spell Slots, a separate Spells tab).
//
// H5's own brief: "Health belongs together. Resources belong together.
// Recovery belongs together." -- the player should rarely need to leave
// the command center during combat. Everything that used to live in
// CharacterRecoveryPanel.vue and CharacterSpellcastingPanel.vue's own
// Spell Slots block moves here.
//
// HEADER CLEANUP 2: SHORT REST / LONG REST MOVE IN, HIT DICE STOPS BEING
// ISOLATED. Short Rest/Long Rest lived in the command center's own
// top-right button row (beside Back) since Header Phase H1 -- real-browser
// feedback flagged that as mixing navigation with a character action, and
// that Hit Dice sat alone with no visual link to the rest action that, in
// this domain, already spends one automatically (see the new Rest card's
// own comment below for the full trace). Both buttons emit `recovery`
// through the EXACT SAME `emitRecovery` helper Spend Hit Die already used
// -- CharacterSheetCommandCenter.vue's own separate `rest` emit is now
// unused and removed there, not duplicated here.
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
// Recovery section alone. Primary, frequently-pressed actions (Damage,
// Heal, Temp HP, Spend Hit Die) keep the established min-h-11 (44px) touch
// target used everywhere else in this Sheet. Death Save marks and the
// Spell Slot +/-, both used far less often and already small glyphs even
// in their original full-size panels, step down to a smaller (but still
// real, `aria-label`led) target -- a deliberate density trade-off for a
// dashboard that has to hold five clusters of controls in the space one
// used to occupy, not an accessibility oversight.
//
// MATERIAL -- WELL, UNCHANGED. Every cluster here is something the player
// DOES; `eldra-well` was already CharacterRecoveryPanel's and the Spell
// Slots block's own material (Material Phase 1) and is simply carried
// over into the new compact layout.
//
// ---------------------------------------------------------------------------
// CHARACTER SHEET HEADER CLEANUP 1 -- "HP CORRECTION" REMOVED
// ---------------------------------------------------------------------------
// "HP Correction" (a separate block with raw Current HP/Temporary HP number
// inputs, PUT-ing a direct override with no rules applied) was confusing,
// non-player-facing terminology occupying its own header block -- real-
// browser feedback flagged it directly. Traced before editing: those two
// inputs were the ONLY controls on this Sheet that bypassed the Recovery
// System's domain mutations entirely (see health.ts/character-recovery.ts).
// Removed outright; Temp HP is now the third action in the renamed
// DAMAGE / HEAL block below, going through the SAME `recovery` emit
// Damage/Heal already use (POST .../recovery -> a real domain mutation,
// `grantTemporaryHp`), not a client-side-only state change. Its semantic
// (replace-if-higher, matching 5e RAW -- temporary HP never stacks) was
// confirmed with the product owner before implementing, since nothing in
// this repository's rules package or domain layer declared a Temp-HP-
// granting contract beforehand.

import type { StoredCharacterHealth } from '~/lib/characters/health'

export type RecoveryActionType =
  | 'damage' | 'heal' | 'temp-hp' | 'spend-hit-die' | 'short-rest' | 'long-rest' | 'reset-death-saves'

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

function saveWith(patch: Partial<StoredCharacterHealth>) {
  emit('save', { ...props.health, ...patch })
}

// --- Damage / Heal / Temp HP: one shared Amount field, three actions -------
// Character Sheet Header Cleanup 1: "HP Correction" (raw current/temp HP
// override inputs, a direct PUT with no rules applied) is gone from this
// normal header -- see this file's own header comment. Every action here
// instead goes through the Recovery System's domain mutations (`recovery`
// emit -> POST .../recovery -> server/utils/character-recovery.ts), so
// Damage/Heal/Temp HP always obey the same rules the Rules Engine and
// Encounter resolution already agree on. One real capability is
// intentionally lost with HP Correction's removal: there is no longer any
// control that sets Current HP to an arbitrary typed number (including
// above Maximum HP, which Heal deliberately never allows) -- an accepted,
// explicit product decision, not an oversight.

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

function applyTempHpAction() {
  if (parsedAmount.value === null) return
  emitRecovery('temp-hp', parsedAmount.value)
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
      <!-- Damage / Heal ----------------------------------------------------
           Header Cleanup 1 correction: back to col-span-1 at `sm:` (the
           same single-column footprint this block had before "HP
           Correction" was removed). Real-browser feedback: col-span-2
           made this block unnecessarily wide -- empty header space is
           acceptable and expected to hold future features, so it is not
           filled just because it is available. Three buttons no longer
           fit one row cleanly at this narrower width, so Damage/Heal
           share a row and Temp HP takes its own row below, rather than
           three cramped equal-width buttons or widening the block. -->
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
        <button
          type="button"
          class="mt-1.5 min-h-11 w-full rounded-none border border-[rgba(201,164,90,0.5)] bg-[rgba(201,164,90,0.12)] text-xs font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="recoverySaving || parsedAmount === null"
          @click="applyTempHpAction"
        >
          Temp HP
        </button>
      </div>

      <!-- Rest ---------------------------------------------------------------
           Character Sheet Header Cleanup 2: Short Rest/Long Rest move here
           from the top header (CharacterSheetCommandCenter.vue's own
           identity row) and replace the previously-isolated Hit Dice card.
           Hit Dice belong conceptually INSIDE Rest -- a 5e player reaches
           for a Hit Die WHILE resting, not as a standalone header stat --
           not beside Back at the top of the sheet. Traced before building
           this (server/utils/character-recovery.ts's own header/tests):
           Short Rest and Long Rest are, and remain, atomic RecoveryActions
           with no persisted "rest session" of any kind -- Short Rest
           already auto-spends exactly one Hit Die server-side, so this
           block does not invent an ordering requirement between the two
           rest buttons and Spend Hit Die below; all three are simply
           grouped because they are the same gameplay concept, not because
           clicking one gates another. `col-span-2` at the base (mobile)
           width, unlike every OTHER card here, because this one now holds
           two real buttons plus the Hit Dice line/action -- narrower than
           that and "Short Rest"/"Long Rest" would need to wrap or
           truncate; `sm:col-span-1` restores the single-card footprint the
           PRODUCT GOAL names ("[Damage/Heal] [Rest] [Death Saves]
           [future/empty space]") once the row itself is wide enough. -->
      <div class="eldra-well col-span-2 rounded-none p-2 sm:col-span-1">
        <div class="text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">
          Rest
        </div>

        <div class="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            class="eldra-button flex min-h-11 items-center justify-center gap-1.5 rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="recoverySaving"
            @click="emitRecovery('short-rest')"
          >
            <UIcon
              name="i-lucide-coffee"
              class="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span class="truncate">Short Rest</span>
          </button>

          <button
            type="button"
            class="eldra-button flex min-h-11 items-center justify-center gap-1.5 rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="recoverySaving"
            @click="emitRecovery('long-rest')"
          >
            <!-- The installed Lucide set (@iconify-json/lucide) has no
                 "campfire" glyph -- confirmed by inspecting its own
                 icons.json before choosing this -- so "flame" is the
                 closest semantically-correct alternative, per this task's
                 own explicit instruction to prefer Campfire over Flame
                 only when Campfire actually exists. -->
            <UIcon
              name="i-lucide-flame"
              class="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span class="truncate">Long Rest</span>
          </button>
        </div>

        <div class="mt-2 flex items-center justify-between gap-2 border-t border-[rgba(201,164,90,0.14)] pt-1.5">
          <span class="min-w-0 truncate text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">{{ hitDiceLabel }}</span>
          <span class="shrink-0 text-sm tabular-nums text-[#d8ceb8]">{{ hitDiceAvailable ?? '—' }} / {{ hitDiceMax ?? '—' }}</span>
        </div>
        <button
          type="button"
          class="eldra-button mt-1.5 min-h-11 w-full rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="recoverySaving || (hitDiceAvailable != null && hitDiceAvailable <= 0)"
          @click="emitRecovery('spend-hit-die')"
        >
          Spend Hit Die
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
