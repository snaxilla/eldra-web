<script setup lang="ts">
// CharacterSheetCommandCenter -- Header Phase H1: Desktop Command Center
// Reconstruction (see eldra-character-sheet-visual-language.md,
// eldra-design-language.md §2/§3/§8). The one thing V1 actually had: a
// single persistent header that answers "whose character is this, what's
// their state, what can they do right now" without a scroll, at every
// breakpoint -- see eldra-character-sheet-visual-language.md §1.3's audit
// of V1's own sticky header/desktop identity+combat-tile row.
//
// This is the page's one Feature surface (Design Language §8 Rule 1:
// exactly one loud surface per screen). It owns the outer
// `CharacterSheetSection elevation="feature"` wrapper; the numbers row is
// `CharacterVitalsBar` rendered `bare` (see that file's own header for why)
// so there is still only one nested Feature surface, not two.
//
// PRESENTATION ONLY -- computes nothing. Every value is a prop already
// produced by useCharacterSheet.ts, passed straight through from
// sheet-v2.vue.
//
// ---------------------------------------------------------------------------
// H1 -- WHAT THIS PHASE REMOVED, AND WHY
// ---------------------------------------------------------------------------
// The Desktop IA pass added ability score/modifier tiles to this header
// (`CharacterAbilityGrid`, fed by `abilityEntries`). That mixed four
// different concerns into one surface -- identity, abilities, vitals, and
// controls -- and made the header feel crowded rather than authoritative.
// H1's own brief is explicit: "Remove ALL ability presentation from the
// command center... Abilities move completely out of the header." So this
// file no longer imports CharacterAbilityGrid, no longer accepts
// `abilityEntries`, and sheet-v2.vue no longer passes it. Ability scores
// still render exactly where they already did before the Desktop IA pass
// (the Character tab's own "Ability Scores" section) until the next phase
// gives the left reference region its own Ability Grid -- H1's own
// FOLLOW-UP PREPARATION note is explicit that building that grid is NOT
// this phase's job, only clearing the header's claim on the category.
//
// The command center now contains exactly what H1's VITALS section names:
// identity (portrait, name, Species/Class/Background/Level as supporting
// metadata) and play state (HP, AC, Initiative, Speed, Proficiency Bonus,
// Spell Save DC/Attack for casters, conditions, turn state) -- all still
// via the unchanged `CharacterVitalsBar` (bare), which never carried
// ability content in the first place.
//
// ---------------------------------------------------------------------------
// PORTRAIT -- THE COVER OF THE FOLIO, NOT AN AVATAR
// ---------------------------------------------------------------------------
// H1: "approximately the left sixth of the command center... Treat it as
// the illustration on the cover of a character folio." At `xl` (the same
// breakpoint the sheet's own reference region already uses) the portrait
// becomes a genuine grid column sized `minmax(96px,1fr)` against the
// identity/vitals column's `5fr` -- a real ~1:5 proportion, not a fixed
// thumbnail size that happens to look small. Below `xl` it stays a fixed
// square, sized a little larger than before so it still reads as an
// illustration rather than a chat-avatar at any width. Placeholder
// behavior, and the complete absence of upload/edit affordances, are
// unchanged -- H1 is explicit that this phase touches neither.
//
// ---------------------------------------------------------------------------
// IDENTITY -- ONE BLOCK, NOT A ROW OF CHIPS
// ---------------------------------------------------------------------------
// H1: "Reduce the feeling of floating chips. Identity should read as one
// coherent block." Level/Species/Class/Background were each their own
// `CharacterStatChip` pill; they are now one inline metadata line beneath
// the (now visually dominant) name -- "Level 5 · Elf · Wizard · Sage" --
// with an unresolved slot still rendered in the same danger tint
// `identity.identityRows` already carries, so a missing Species/Class/
// Background is still legible, just no longer boxed.
//
// ---------------------------------------------------------------------------
// REST BUTTONS -- A SHORTCUT TO AN EXISTING MUTATION, NOT A NEW CONTROL
// ---------------------------------------------------------------------------
// `rest` emits the exact `{ type: 'short-rest' | 'long-rest' }` shape
// CharacterRecoveryPanel.vue already emits via its own `recovery` event --
// the page wires both to the SAME `mutations.recovery.apply` handler. This
// component adds no validation of its own (e.g. it does not check hit dice
// remaining before allowing Short Rest) -- CharacterRecoveryPanel.vue,
// still present in the Play tab body, remains the one fully-validated
// Recovery control.

import type { EncounterConditionView } from '~/composables/useCharacterSheet'
import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterSaveIndicator from '~/components/characters/CharacterSaveIndicator.vue'
import CharacterVitalsBar from '~/components/characters/CharacterVitalsBar.vue'

withDefaults(defineProps<{
  worldId: string
  characterTitle: string
  imageUrl?: string | null
  level: number
  className: string
  identityRows: readonly { key: string; label: string; value: string; missing: boolean }[]
  currentHp: number
  maxHp: number | null
  temporaryHp: number
  armorClass: number | null
  initiative?: number | null
  speed?: number | null
  proficiencyBonus?: number | null
  isCaster: boolean | null
  spellSaveDc: number | null
  spellAttackBonus: number | null
  conditions: EncounterConditionView[]
  inEncounter: boolean
  isMyTurn: boolean
  round: number | null
  saving: boolean
  error: string
  removeCondition: (conditionInstanceId: string) => void
}>(), {
  imageUrl: null,
  initiative: null,
  speed: null,
  proficiencyBonus: null
})

const emit = defineEmits<{
  rest: [{ type: 'short-rest' | 'long-rest' }]
}>()
</script>

<template>
  <CharacterSheetSection
    elevation="feature"
    density="compact"
  >
    <div class="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(96px,1fr)_5fr] xl:items-start xl:gap-5">
      <!-- Portrait: the folio's cover illustration, not an avatar. -->
      <div class="eldra-image-frame h-20 w-20 shrink-0 overflow-hidden rounded-none border bg-black/25 sm:h-24 sm:w-24 xl:aspect-square xl:h-auto xl:w-full">
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

        <!-- Vitals: current state and immediate play state only -- no
             ability presentation lives here anymore (H1). -->
        <div class="mt-4">
          <CharacterVitalsBar
            bare
            :character-title="characterTitle"
            :level="level"
            :class-name="className"
            :current-hp="currentHp"
            :max-hp="maxHp"
            :temporary-hp="temporaryHp"
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
      </div>
    </div>
  </CharacterSheetSection>
</template>
