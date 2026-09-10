<script setup lang="ts">
// CharacterSheetCommandCenter -- Corrective Phase 2R: V1-style Character
// Folio Shell (see eldra-character-sheet-visual-language.md,
// eldra-design-language.md §2/§3/§8). Replaces sheet-v2.vue's previous
// desktop-only Vitals Bar + separate left-rail Identity Card with the ONE
// thing V1 actually had: a single persistent header that answers "whose
// character is this, and what's their HP/AC" without a scroll, at every
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
// sheet-v2.vue exactly as CharacterVitalsBar/CharacterIdentityCard already
// received them before this phase.
//
// PORTRAIT -- A SMALL THUMBNAIL, NOT THE FULL RAIL PORTRAIT
// ---------------------------------------------------------------------------
// This is the always-visible, every-breakpoint anchor (task's own "do not
// hide the portrait" rule) -- so it stays small (h-16/h-20) the way V1's
// own mobile sticky header used a thumbnail, not the tall aspect-[4/5]
// treatment CharacterIdentityCard.vue already owns. CharacterIdentityCard
// itself is UNCHANGED and simply relocated (Corrective Phase 2R's own page
// wiring) to the top of the Sheet/Character tab body, where its full-size
// portrait becomes the "cover page" moment once a player opens that tab --
// exactly V1's own two-portrait-sizes pattern (small header thumbnail,
// full rail portrait), not a new invention.
//
// REST BUTTONS -- A SHORTCUT TO AN EXISTING MUTATION, NOT A NEW CONTROL
// ---------------------------------------------------------------------------
// `rest` emits the exact `{ type: 'short-rest' | 'long-rest' }` shape
// CharacterRecoveryPanel.vue already emits via its own `recovery` event --
// the page wires both to the SAME `mutations.recovery.apply` handler. This
// component adds no validation of its own (e.g. it does not check hit dice
// remaining before allowing Short Rest) -- CharacterRecoveryPanel.vue,
// still present in the Play tab body, remains the one fully-validated
// Recovery control. Disabling only on `saving` here is a deliberate
// simplification, not a missing feature: duplicating Recovery's own
// disable rules in two places would be the kind of "redesign a panel
// deeply" this task's own IMPORTANT section rules out.

import type { EncounterConditionView } from '~/composables/useCharacterSheet'
import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterStatChip from '~/components/characters/CharacterStatChip.vue'
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
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="flex min-w-0 items-start gap-3">
        <div class="eldra-image-frame h-16 w-16 shrink-0 overflow-hidden rounded-none border bg-black/25 sm:h-20 sm:w-20">
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
          <h1 class="eldra-title truncate text-xl font-semibold leading-tight sm:text-2xl">
            {{ characterTitle || 'Character' }}
          </h1>
          <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CharacterStatChip
              label="Level"
              :value="level"
            />
            <CharacterStatChip
              v-for="row in identityRows"
              :key="row.key"
              :label="row.label"
              :value="row.value"
            />
          </div>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-2">
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
  </CharacterSheetSection>
</template>
