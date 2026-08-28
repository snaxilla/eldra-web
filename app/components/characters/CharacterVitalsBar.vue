<script setup lang="ts">
// CharacterVitalsBar -- Character Sheet Beautification Pass, Phase 3 (see
// .github/docs/architecture/character-sheet-beauty-pass.md §3.1/§3.2 "T0",
// §7.2, §7.3, §7.9, §8.1, §11 Phase 3). The single highest-impact change:
// HP, AC, Spell Save DC/Attack, Active Conditions, and turn state stop
// scrolling away. Sticky at the top of the page's own scroll container
// (sheet-v2.vue's own `overflow-y-auto` root -- see that file for why
// `sticky`, never `fixed`, is correct here).
//
// Presentation only -- no fetch, no mutation of its own beyond the one
// Condition-chip "remove" affordance §7.6 documents as part of the chip
// itself (reuses useCharacterMutations.ts's existing `conditions.remove`,
// passed in as a prop; this file does not call $fetch). Every value is a
// prop already produced by useCharacterSheet.ts -- this component
// performs no arithmetic and reads no `derived` value directly.
//
// Uses the three primitives this phase's task explicitly names:
// CharacterSheetSection (elevation="feature" -- §7.2's "Vitals bar only,
// max 1 per screen" tier, unused until now), CharacterStatChip (Level/
// Class), and CharacterSaveIndicator (one combined saving/error state,
// composed by the page from every mutation domain -- see sheet-v2.vue's
// own `vitalsSaving`/`vitalsError`). HP/AC/DC/Attack get their own markup
// rather than being forced into CharacterStatChip's small label/value
// pill shape, because §7.3's typography table gives "vital numbers" a
// materially larger treatment (text-3xl/4xl) that chip was never sized
// for -- this is content-specific presentation the doc's own component
// budget (~250 lines) already expects this file to own, not a missing
// generic primitive to invent.
//
// Death Saves are deliberately NOT duplicated here -- this task's own
// DISPLAY list does not name them, and CharacterRecoveryPanel.vue already
// owns that tracker in full. HP shifts to a danger tint at 0 (§7.9), which
// is the one HP=0 signal this bar surfaces.

import type { EncounterConditionView } from '~/composables/useCharacterSheet'
import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterStatChip from '~/components/characters/CharacterStatChip.vue'
import CharacterSaveIndicator from '~/components/characters/CharacterSaveIndicator.vue'

const props = defineProps<{
  characterTitle: string
  level: number
  className: string
  currentHp: number
  maxHp: number | null
  temporaryHp: number
  armorClass: number | null
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
}>()

// Only a REAL Maximum HP (Rules Engine output) makes 0 meaningful --
// `currentHp` defaults to 0 for a character with no Health record yet,
// which is "no data", not "dying".
const atZeroHp = computed(() => props.maxHp != null && props.currentHp <= 0)

// §7.9: green top edge in-encounter-and-my-turn, danger tint at HP = 0.
// A 150ms color transition only -- "nothing flashes at a table."
const combatEmphasisClass = computed(() => {
  if (atZeroHp.value) return 'border-t-2 border-t-red-500/70 transition-colors duration-150'
  if (props.isMyTurn) return 'border-t-2 border-t-[#9ec37d] transition-colors duration-150'
  return 'transition-colors duration-150'
})

function formatBonus(value: number | null): string {
  if (value == null) return '—'
  return value >= 0 ? `+${value}` : String(value)
}
</script>

<template>
  <CharacterSheetSection
    elevation="feature"
    density="compact"
    :class="combatEmphasisClass"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="truncate text-lg font-semibold text-[#fff7df]">
          {{ characterTitle || 'Character' }}
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-1.5">
          <CharacterStatChip
            label="Level"
            :value="level"
          />
          <CharacterStatChip
            label="Class"
            :value="className"
          />
        </div>
      </div>

      <CharacterSaveIndicator
        :saving="saving"
        :error="error"
      />
    </div>

    <div class="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div>
        <div class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
          HP
        </div>
        <div
          class="text-3xl font-semibold tabular-nums"
          :class="atZeroHp ? 'text-red-300' : 'text-[#fff7df]'"
        >
          {{ currentHp }}<span class="text-lg text-[#9f9278]"> / {{ maxHp ?? '—' }}</span>
        </div>
        <div
          v-if="temporaryHp > 0"
          class="text-xs text-[#9ec37d]"
        >
          +{{ temporaryHp }} temp
        </div>
      </div>

      <div>
        <div class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
          AC
        </div>
        <div class="text-3xl font-semibold tabular-nums text-[#fff7df]">
          {{ armorClass ?? '—' }}
        </div>
      </div>

      <template v-if="isCaster">
        <div>
          <div class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
            Save DC
          </div>
          <div class="text-3xl font-semibold tabular-nums text-[#fff7df]">
            {{ spellSaveDc ?? '—' }}
          </div>
        </div>

        <div>
          <div class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
            Attack
          </div>
          <div class="text-3xl font-semibold tabular-nums text-[#fff7df]">
            {{ formatBonus(spellAttackBonus) }}
          </div>
        </div>
      </template>

      <!-- Conditions: same eldra-gold-chip treatment CharacterConditionsPanel.vue
           uses, so a condition looks identical wherever it appears. -->
      <div
        v-if="conditions.length"
        class="flex flex-wrap items-center gap-1.5"
      >
        <span
          v-for="condition in conditions"
          :key="condition.id"
          class="eldra-gold-chip inline-flex items-center gap-1 rounded-none border px-2 py-0.5 text-xs uppercase tracking-[0.06em]"
          :class="condition.duration === 0 ? 'border-red-500/50 bg-red-500/10 text-red-200' : ''"
        >
          {{ condition.label }}
          <span v-if="condition.duration !== null">×{{ condition.duration }}</span>
          <button
            type="button"
            class="ml-0.5 text-[#9f9278] hover:text-[#d8ceb8]"
            :aria-label="`Remove ${condition.label}`"
            @click="removeCondition(condition.id)"
          >
            ×
          </button>
        </span>
      </div>

      <!-- Turn indicator: color is never the only signal -- always paired
           with a "Your turn" label, per §7.6. -->
      <div
        v-if="inEncounter"
        class="flex items-center gap-1.5 text-xs text-[#d8ceb8]"
      >
        <span
          class="h-2 w-2 rounded-full"
          :class="isMyTurn ? 'bg-[#9ec37d]' : 'bg-[rgba(201,164,90,0.35)]'"
        />
        <span>{{ isMyTurn ? 'Your turn' : `Round ${round ?? '—'}` }}</span>
      </div>
    </div>
  </CharacterSheetSection>
</template>
