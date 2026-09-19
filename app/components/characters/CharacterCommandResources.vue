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
import { spellSlotsToCharacterResources } from './characterResourcePresentation'
import CharacterResourceOrbs from './CharacterResourceOrbs.vue'

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
  slotLevels?: readonly { level: number; max: number; expended: number }[]
  spellSaving?: boolean
}>(), {
  recoverySaving: false,
  recoveryError: '',
  slotLevels: () => [],
  spellSaving: false
})

// Caster Pass 0.1: Death Saves moved out of this component entirely -- see
// CharacterVitalsBar.vue, which now owns them (contextual, shown only at
// Current HP <= 0). This was the only consumer of a direct `save` (PUT
// .../health) emit anywhere in this file; nothing else here bypasses the
// Recovery System's own `recovery` emit, so `save` is removed rather than
// kept unused.
const emit = defineEmits<{
  recovery: [{ type: RecoveryActionType; amount?: number }]
  'expend-slot': [number]
  'restore-slot': [number]
}>()

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
// Header Cleanup 2.1: "Spend Hit Die" is disabled with no Hit Die available
// (unchanged) OR at full Current HP (new -- server/utils/character-
// recovery.ts enforces the SAME guard authoritatively; this is a UI
// convenience, not the only place it is checked) -- spending a die at full
// HP would waste the resource and the roll it now produces for zero
// benefit. Uses `health`/`maxHp`, both already props here for Damage/Heal;
// no new prop was added for this.

const hitDiceLabel = computed(() => {
  if (props.hitDieSize == null) return 'Hit Dice'
  return `Hit Dice (d${props.hitDieSize})`
})

// --- Spell Slots -> Character Resource orbs -------------------------------
// Caster Pass 0.1: adapts the EXISTING `slotLevels` prop (unchanged --
// still Rules Engine Table rows + persisted `expendedSlots`, see
// useCharacterSheet.ts's own `slotLevels` computed) into the generic
// Character Resource presentation contract (characterResourcePresentation.ts).
// `resourceGroups` is `[]` for a non-caster (or a caster with no levels),
// which is exactly what makes CharacterResourceOrbs.vue render nothing --
// no empty "Resources" card for Bobbert.
//
// A resource-orb click carries only `{groupId, poolId}` -- generic
// identifiers a future Sorcery Points/Rage group would use identically.
// Today there is exactly ONE group ('spell-slots', from the adapter above),
// so routing an orb click back to the existing `expend-slot`/`restore-slot`
// emits (unchanged -- still plain slot-level numbers, still relayed to
// mutations.spellcasting.expendSlot/restoreSlot exactly as before) only
// needs to parse `poolId` back into the level number the adapter derived
// it from. A second real resource group would need this switch extended
// by its own group id -- not before one exists.
const resourceGroups = computed(() => spellSlotsToCharacterResources(props.slotLevels))

function handleResourceExpend({ groupId, poolId }: { groupId: string; poolId: string }) {
  if (groupId === 'spell-slots') emit('expend-slot', Number(poolId))
}

function handleResourceRestore({ groupId, poolId }: { groupId: string; poolId: string }) {
  if (groupId === 'spell-slots') emit('restore-slot', Number(poolId))
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

    <!-- Header Cleanup 3 root cause, traced not guessed: this grid never
         set `items-*`, so it used CSS Grid's own default -- `stretch`.
         `items-start` makes each card size to its OWN content instead of
         the row's tallest, with zero effect on mobile (each card already
         occupies its own full-width row there, alone, so there is no
         taller sibling to have been stretching against).

         Caster Pass 0.1: Death Saves no longer live in this grid at all
         (see CharacterVitalsBar.vue -- they are now contextual, shown only
         at Current HP <= 0, in the header's vitals row instead of
         permanent resource-grid space). The row is now
         [ Damage/Heal ] [ Rest ] [ Character Resources ], and Resources
         gets the two columns Death Saves and the old Spell Slots card used
         to split between them -- "use the available half-header
         intelligently" rather than four equal 1/4-width cards, since
         resource density varies wildly between characters (a non-caster
         has none; a high-level caster may have up to nine spell-slot
         pools). -->
    <div class="grid grid-cols-2 items-start gap-2 sm:grid-cols-4">
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
           with no persisted "rest session" of any kind, so this block does
           not invent an ordering requirement between the two rest buttons
           and Spend Hit Die below; all three are simply grouped because
           they are the same gameplay concept, not because clicking one
           gates another. `col-span-2` at the base (mobile) width, unlike
           every OTHER card here, because this one now holds two real
           buttons plus the Hit Dice line/action -- narrower than that and
           "Short Rest"/"Long Rest" would need to wrap or truncate;
           `sm:col-span-1` restores the single-card footprint the current
           layout ("[Damage/Heal] [Rest] [Character Resources]") gives it
           once the row itself is wide enough.

           HEADER CLEANUP 2.1 CORRECTION: Short Rest no longer auto-spends
           a Hit Die (it used to, via the deterministic Rules Engine
           average -- see character-recovery.ts's own header for why that
           could not coexist with Spend Hit Die becoming a real
           authoritative roll). Spending a Hit Die during a Short Rest is
           now always this sheet's own explicit "Spend Hit Die" click. -->
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
          :disabled="recoverySaving || (hitDiceAvailable != null && hitDiceAvailable <= 0) || (maxHp != null && health.currentHp >= maxHp)"
          @click="emitRecovery('spend-hit-die')"
        >
          Spend Hit Die
        </button>
      </div>

      <!-- Character Resources -- Caster Pass 0.1. Replaces both the old
           Spell Slots stepper card AND the old permanent Death Saves card
           (moved to CharacterVitalsBar.vue, contextual at Current HP <= 0
           -- see this file's OWN removal of that markup in this same
           diff). `col-span-2 sm:col-span-2` (not `sm:col-span-1`): with
           only three cards left in this row, Resources takes the TWO
           columns Death Saves and Spell Slots used to split between them
           -- "use the available half-header intelligently" rather than a
           tiny 1/4-width card, since resource density varies wildly (zero
           groups for a non-caster, up to nine spell-slot pools for a
           high-level full caster). `v-if="resourceGroups.length"` (not
           `isCaster`) is deliberate: `spellSlotsToCharacterResources`
           already returns `[]` for a non-caster OR a caster with no levels
           this character currently has, so checking the ADAPTER's own
           output is the one true source of "is there anything to show",
           not a second, possibly-drifting `isCaster` check.

           CharacterResourceOrbs.vue owns the actual orb rendering/click
           semantics (see that file's own header) -- this component's job
           is only the adapter call and routing an orb click back to the
           EXACT SAME `expend-slot`/`restore-slot` emits this file already
           had, unchanged in shape (still a plain slot-level `number`). -->
      <div
        v-if="resourceGroups.length"
        class="eldra-well col-span-2 rounded-none p-2 sm:col-span-2"
      >
        <CharacterResourceOrbs
          :groups="resourceGroups"
          :saving="spellSaving"
          @expend="handleResourceExpend"
          @restore="handleResourceRestore"
        />
      </div>
    </div>
  </div>
</template>
