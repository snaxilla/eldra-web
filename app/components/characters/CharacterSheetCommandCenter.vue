<script setup lang="ts">
// CharacterSheetCommandCenter -- Command Center Reconstruction, Phase H5
// (see eldra-character-sheet-visual-language.md, eldra-design-language.md
// §2/§3/§8). The single persistent header that answers "whose character
// is this, what's their state, what can they do right now" without a
// scroll, at every breakpoint -- see eldra-character-sheet-visual-
// language.md §1.3's audit of V1's own sticky header/desktop identity+
// combat-tile row.
//
// This is the page's one Feature surface (Design Language §8 Rule 1:
// exactly one loud surface per screen). It owns the outer
// `CharacterSheetSection elevation="feature"` wrapper; the numbers row is
// `CharacterVitalsBar` rendered `bare` (see that file's own header for why)
// so there is still only one nested Feature surface, not two.
//
// PRESENTATION ONLY, EXCEPT WHERE H5 SAYS OTHERWISE. Identity/vitals stay
// presentation-only. Health/Recovery/Death Saves/Spell Slots are now real
// mutation surfaces -- see `CharacterCommandResources.vue`'s own header for
// why moving them here does not change what any of them DO, only where
// the control lives.
//
// ---------------------------------------------------------------------------
// H5 -- THE COMMAND CENTER BECOMES THE COMBAT HUD
// ---------------------------------------------------------------------------
// H1's own DISPLAY list ("HP, AC, Initiative, Speed, Proficiency Bonus,
// Spell Save DC/Attack, conditions, turn state") was read-only play STATE.
// H5's brief goes further: "Health belongs together. Resources belong
// together. Recovery belongs together" -- the player should rarely need
// to leave the command center during combat. So this file now also
// renders a visible Health Bar (`CharacterHealthBar.vue`) right beneath
// the Vitals numbers, and `CharacterCommandResources.vue` beneath that --
// HP correction, Damage/Heal, Hit Dice, Death Saves, and (for casters)
// Spell Slots, everything CharacterRecoveryPanel.vue and
// CharacterSpellcastingPanel.vue's own Spell Slots block used to own
// alone in a separate, scrolled-away section. Short Rest/Long Rest
// already lived in this file's own button row since H1 and are
// unchanged.
//
// ---------------------------------------------------------------------------
// PORTRAIT -- THE COVER OF THE FOLIO, NOT AN AVATAR
// ---------------------------------------------------------------------------
// "Approximately the left sixth of the command center... Treat it as the
// illustration on the cover of a character folio" (Header Phase H1). At
// `xl` (the same breakpoint the sheet's own reference region already
// uses) the portrait becomes a genuine grid column sized
// `minmax(96px,1fr)` against the identity/vitals column's `5fr` -- a real
// ~1:5 proportion, not a fixed thumbnail size that happens to look small.
// Below `xl` it stays a fixed square-ish `aspect-[4/5]` block, the same
// character-portrait proportion CharacterIdentityCard.vue already
// established (Phase H2 corrected an earlier square). Placeholder
// behavior, and the complete absence of upload/edit affordances, are
// unchanged by any phase.
//
// ---------------------------------------------------------------------------
// IDENTITY -- ONE BLOCK, NOT A ROW OF CHIPS
// ---------------------------------------------------------------------------
// "Reduce the feeling of floating chips. Identity should read as one
// coherent block" (Header Phase H1). Level/Species/Class/Background are
// one inline metadata line beneath the visually dominant name -- "Level 5
// · Elf · Wizard · Sage" -- with an unresolved slot still rendered in the
// same danger tint `identity.identityRows` already carries.
//
// ---------------------------------------------------------------------------
// REST BUTTONS -- A SHORTCUT TO AN EXISTING MUTATION, NOT A NEW CONTROL
// ---------------------------------------------------------------------------
// `rest` emits the exact `{ type: 'short-rest' | 'long-rest' }` shape
// `recovery` below also carries -- the page wires both to the SAME
// `mutations.recovery.apply` handler. This component adds no validation
// of its own (e.g. it does not check hit dice remaining before allowing
// Short Rest); that validation lives server-side, exactly as it did when
// the button lived in CharacterRecoveryPanel.vue.

import type { EncounterConditionView } from '~/composables/useCharacterSheet'
import type { StoredCharacterHealth } from '~/lib/characters/health'
import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterSaveIndicator from '~/components/characters/CharacterSaveIndicator.vue'
import CharacterVitalsBar from '~/components/characters/CharacterVitalsBar.vue'
import CharacterHealthBar from '~/components/characters/CharacterHealthBar.vue'
import CharacterCommandResources, { type RecoveryActionType } from '~/components/characters/CharacterCommandResources.vue'

withDefaults(defineProps<{
  worldId: string
  characterTitle: string
  imageUrl?: string | null
  level: number
  className: string
  identityRows: readonly { key: string; label: string; value: string; missing: boolean }[]
  health: StoredCharacterHealth
  maxHp: number | null
  hitDiceMax: number | null
  hitDiceAvailable: number | null
  hitDieSize: number | null
  armorClass: number | null
  initiative?: number | null
  speed?: number | null
  proficiencyBonus?: number | null
  isCaster: boolean | null
  spellSaveDc: number | null
  spellAttackBonus: number | null
  slotLevels?: readonly { level: number; max: number; expended: number }[]
  conditions: EncounterConditionView[]
  inEncounter: boolean
  isMyTurn: boolean
  round: number | null
  saving: boolean
  error: string
  recoverySaving?: boolean
  recoveryError?: string
  spellSaving?: boolean
  removeCondition: (conditionInstanceId: string) => void
}>(), {
  imageUrl: null,
  initiative: null,
  speed: null,
  proficiencyBonus: null,
  slotLevels: () => [],
  recoverySaving: false,
  recoveryError: '',
  spellSaving: false
})

const emit = defineEmits<{
  rest: [{ type: 'short-rest' | 'long-rest' }]
  save: [StoredCharacterHealth]
  recovery: [{ type: RecoveryActionType; amount?: number }]
  'expend-slot': [number]
  'restore-slot': [number]
}>()
</script>

<template>
  <CharacterSheetSection
    elevation="feature"
    density="compact"
  >
    <div class="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(96px,1fr)_5fr] xl:items-start xl:gap-5">
      <!-- Portrait: the folio's cover illustration, not an avatar. Always
           aspect-[4/5] -- sized by WIDTH at every breakpoint so the ratio
           holds instead of being fixed-square below `xl`. -->
      <div class="eldra-image-frame aspect-[4/5] w-16 h-auto shrink-0 overflow-hidden rounded-none border bg-black/25 sm:w-20 xl:w-full">
        <img
          v-if="imageUrl"
          :src="imageUrl"
          :alt="characterTitle || 'Character portrait'"
          class="h-full w-full object-cover object-top"
          loading="lazy"
        >
        <div
          v-else
          class="flex h-full w-full items-center justify-center text-center text-[9px] uppercase tracking-[0.1em] text-[#9f9278]"
        >
          No portrait
        </div>
      </div>

      <div class="min-w-0">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <!-- Identity: one coherent block -- dominant name, one metadata
               line beneath it. No chips. -->
          <div class="min-w-0">
            <h1 class="eldra-title truncate text-2xl font-semibold leading-tight sm:text-3xl">
              {{ characterTitle || 'Character' }}
            </h1>
            <p class="mt-1 flex flex-wrap items-baseline gap-x-1.5 truncate text-sm text-[#d8ceb8]">
              <span class="text-[#9f9278]">Level {{ level }}</span>
              <template
                v-for="row in identityRows"
                :key="row.key"
              >
                <span class="text-[#9f9278]">·</span>
                <span :class="row.missing ? 'text-red-300' : ''">{{ row.value }}</span>
              </template>
            </p>
          </div>

          <!-- Command buttons: tight, aligned with the identity block. -->
          <div class="flex shrink-0 items-center gap-1.5">
            <CharacterSaveIndicator
              :saving="saving"
              :error="error"
            />

            <NuxtLink
              :to="`/worlds/${worldId}/characters`"
              class="eldra-button rounded-none px-3 py-1.5 text-xs font-semibold"
            >
              Back
            </NuxtLink>

            <button
              type="button"
              class="eldra-button rounded-none px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="saving"
              @click="emit('rest', { type: 'short-rest' })"
            >
              Short Rest
            </button>

            <button
              type="button"
              class="eldra-button rounded-none px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="saving"
              @click="emit('rest', { type: 'long-rest' })"
            >
              Long Rest
            </button>
          </div>
        </div>

        <!-- Health Bar: instant visual condition, right beneath identity,
             right above the numbers it summarizes. -->
        <div class="mt-3">
          <CharacterHealthBar
            :current-hp="health.currentHp"
            :max-hp="maxHp"
          />
        </div>

        <!-- Vitals: current state and immediate play state. -->
        <div class="mt-3">
          <CharacterVitalsBar
            bare
            :character-title="characterTitle"
            :level="level"
            :class-name="className"
            :current-hp="health.currentHp"
            :max-hp="maxHp"
            :temporary-hp="health.temporaryHp"
            :armor-class="armorClass"
            :initiative="initiative"
            :speed="speed"
            :proficiency-bonus="proficiencyBonus"
            :is-caster="isCaster"
            :spell-save-dc="spellSaveDc"
            :spell-attack-bonus="spellAttackBonus"
            :conditions="conditions"
            :in-encounter="inEncounter"
            :is-my-turn="isMyTurn"
            :round="round"
            :saving="saving"
            :error="error"
            :remove-condition="removeCondition"
          />
        </div>

        <!-- The combat HUD: Health correction, Damage/Heal, Hit Dice,
             Death Saves, and (for casters) Spell Slots -- everything H5
             moves out of the Play tab's own Recovery section and the
             Spells tab's Spell Slots block. -->
        <div class="mt-3">
          <CharacterCommandResources
            :health="health"
            :max-hp="maxHp"
            :hit-dice-max="hitDiceMax"
            :hit-dice-available="hitDiceAvailable"
            :hit-die-size="hitDieSize"
            :recovery-saving="recoverySaving"
            :recovery-error="recoveryError"
            :is-caster="isCaster"
            :slot-levels="slotLevels"
            :spell-saving="spellSaving"
            @save="emit('save', $event)"
            @recovery="emit('recovery', $event)"
            @expend-slot="emit('expend-slot', $event)"
            @restore-slot="emit('restore-slot', $event)"
          />
        </div>
      </div>
    </div>
  </CharacterSheetSection>
</template>
