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
// Death Saves used to be deliberately NOT duplicated here -- Command
// Center Reconstruction Phase H5 gave CharacterCommandResources.vue that
// tracker in full, as a PERMANENT resource-grid card. Character Sheet
// Caster Pass 0.1 reverses that placement decision (not the underlying
// reasoning that Death Saves are sheet-header state, never Roll Tray/
// Context Rail): browser review found permanent resource-grid space for a
// control that matters only when a character is at 0 HP -- and irrelevant
// the rest of the time -- a worse use of that space than the contextual
// vitals-row placement below. See "DEATH SAVES -- CASTER PASS 0.1" further
// down for the full trace. HP still shifts to a danger tint at 0 (§7.9),
// unchanged -- that signal and the Death Save controls' own visibility are
// two independent things that both happen to trigger at the same
// threshold, not one mechanism serving both.
//
// ---------------------------------------------------------------------------
// `bare` -- CORRECTIVE PHASE 2R, FOLIO SHELL
// ---------------------------------------------------------------------------
// eldra-character-sheet-visual-language.md / eldra-design-language.md's
// "exactly one Feature surface per screen" rule now applies to the whole
// page's new command center (CharacterSheetCommandCenter.vue), not to this
// component standing alone -- the command center already supplies its OWN
// outer Feature surface, plus the portrait/name/level/species-class-
// background identity content this bar's own top row used to show. `bare`
// therefore does two things, both purely presentational: (1) render a
// plain wrapper instead of a second nested `CharacterSheetSection`, and
// (2) skip the identity/chips/save-indicator row so it is never shown
// twice. Nothing about HOW a value is read or computed changes -- every
// prop, and the numbers row beneath, is byte-identical to before. Default
// (`bare: false`) is unchanged, in case this component is ever used
// standalone again.
//
// Initiative/Speed/Proficiency Bonus are new, optional number cells added
// to the SAME row HP/AC/Save DC/Attack already live in -- matching V1's own
// single combined stat-tile row (SheetDesktopOverviewDashboard.vue's
// `combatCards`), not a second strip. `null` renders as "--", the same
// "reserved, not yet available" posture every other absent Rules Engine
// value in this Sheet already uses (Initiative and Speed have no Rules
// Package category yet -- see character-sheet-beauty-pass.md §1.8b/§3.3).

import type { EncounterConditionView } from '~/composables/useCharacterSheet'
import type { StoredDeathSaves } from '~/lib/characters/health'
import type { RecoveryActionType } from '~/components/characters/CharacterCommandResources.vue'
import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterStatChip from '~/components/characters/CharacterStatChip.vue'
import CharacterSaveIndicator from '~/components/characters/CharacterSaveIndicator.vue'

const props = withDefaults(defineProps<{
  characterTitle: string
  level: number
  className: string
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
  deathSaves: StoredDeathSaves
  deathSavesSaving?: boolean
  conditions: EncounterConditionView[]
  inEncounter: boolean
  isMyTurn: boolean
  round: number | null
  saving: boolean
  error: string
  removeCondition: (conditionInstanceId: string) => void
  bare?: boolean
}>(), {
  initiative: null,
  speed: null,
  proficiencyBonus: null,
  deathSavesSaving: false,
  bare: false
})

const emit = defineEmits<{
  'mark-death-save': [{ kind: 'successes' | 'failures'; nextCount: number }]
  recovery: [{ type: RecoveryActionType }]
}>()

const wrapper = computed(() => (props.bare ? 'div' : CharacterSheetSection))
const wrapperProps = computed(() => (props.bare ? {} : { elevation: 'feature' as const, density: 'compact' as const }))

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

// ---------------------------------------------------------------------------
// DEATH SAVES -- CASTER PASS 0.1 (CONTEXTUAL)
// ---------------------------------------------------------------------------
// Visible ONLY at Current HP <= 0 -- reusing `atZeroHp` above verbatim
// rather than a second `currentHp <= 0` check: that computed already
// encodes the one refinement worth keeping ("0 is only meaningful once a
// REAL Max HP exists" -- a character with no Health record yet also reads
// `currentHp: 0`, and should not flash Death Save controls before its own
// data has loaded). Preserves ALL existing semantics -- clicking mark N
// sets the count to N, clicking an already-filled mark clears back down to
// just before it (byte-identical toggle logic to CharacterCommandResources
// .vue's OLD `setDeathSaveMarks`, which owned this before Caster Pass
// 0.1); Reset still zeroes both counts through the SAME 'reset-death-saves'
// Recovery action. Visibility and mutation are deliberately independent:
// healing above zero hides this control (this component simply stops
// rendering it), but does NOT itself clear `deathSaves` -- `applyHealing`
// (app/lib/characters/health.ts) never touches death saves, only Long
// Rest and Reset do, and neither of those changed here. A character
// dropped back to 0 HP later will see whatever marks were already there.
function markDeathSave(kind: 'successes' | 'failures', count: number) {
  const current = props.deathSaves[kind]
  const nextCount = current === count ? count - 1 : count
  emit('mark-death-save', { kind, nextCount })
}

function resetDeathSaves() {
  emit('recovery', { type: 'reset-death-saves' })
}
</script>

<template>
  <component
    :is="wrapper"
    v-bind="wrapperProps"
    :class="combatEmphasisClass"
  >
    <div
      v-if="!bare"
      class="flex flex-wrap items-start justify-between gap-3"
    >
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

    <div
      class="flex flex-wrap items-end gap-x-6 gap-y-3"
      :class="bare ? '' : 'mt-3'"
    >
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

      <div>
        <div class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
          Initiative
        </div>
        <div class="text-3xl font-semibold tabular-nums text-[#fff7df]">
          {{ formatBonus(initiative) }}
        </div>
      </div>

      <div>
        <div class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
          Speed
        </div>
        <div class="text-3xl font-semibold tabular-nums text-[#fff7df]">
          {{ speed ?? '—' }}
        </div>
      </div>

      <div>
        <div class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
          Prof. Bonus
        </div>
        <div class="text-3xl font-semibold tabular-nums text-[#fff7df]">
          {{ formatBonus(proficiencyBonus) }}
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
          <!-- Character Sheet Caster Pass 0: label only, "Attack" ->
               "Spell Atk" -- a bare "Attack" beside Save DC read as
               ambiguous with a weapon attack bonus once a caster's header
               was actually seen in the browser. `spellAttackBonus` itself
               is unchanged (still exactly this prop, still Rules Engine
               output) -- this is a presentation-only correction, not a
               vitals bar redesign. -->
          <div class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
            Spell Atk
          </div>
          <div class="text-3xl font-semibold tabular-nums text-[#fff7df]">
            {{ formatBonus(spellAttackBonus) }}
          </div>
        </div>
      </template>

      <!-- Death Saves -- Caster Pass 0.1, contextual (see `atZeroHp`'s own
           comment above and the DEATH SAVES script section below). Fails
           on the LEFT, Successes on the RIGHT (product preference), Reset
           last -- compact enough to sit in this numbers row rather than
           claiming a card of its own. Same red/green Eldra color language
           CharacterCommandResources.vue's marks used, same aria-label/
           aria-pressed semantics, same click-to-toggle behavior -- only
           WHERE this lives, and WHEN it renders, changed. -->
      <div
        v-if="atZeroHp"
        class="flex flex-wrap items-center gap-3"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">Fails</span>
          <div class="flex gap-1">
            <button
              v-for="mark in [1, 2, 3]"
              :key="`failures-${mark}`"
              type="button"
              class="size-6 shrink-0 rounded-full border text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed"
              :class="mark <= deathSaves.failures
                ? 'border-red-500 bg-red-950/40'
                : 'border-[rgba(201,164,90,0.24)] bg-transparent'"
              :disabled="deathSavesSaving"
              :aria-label="`Death save failure mark ${mark}`"
              :aria-pressed="mark <= deathSaves.failures"
              @click="markDeathSave('failures', mark)"
            />
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <span class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">Succ</span>
          <div class="flex gap-1">
            <button
              v-for="mark in [1, 2, 3]"
              :key="`successes-${mark}`"
              type="button"
              class="size-6 shrink-0 rounded-full border text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed"
              :class="mark <= deathSaves.successes
                ? 'border-[#9ec37d] bg-[rgba(158,195,125,0.22)]'
                : 'border-[rgba(201,164,90,0.24)] bg-transparent'"
              :disabled="deathSavesSaving"
              :aria-label="`Death save success mark ${mark}`"
              :aria-pressed="mark <= deathSaves.successes"
              @click="markDeathSave('successes', mark)"
            />
          </div>
        </div>

        <button
          type="button"
          class="text-[0.65rem] uppercase tracking-[0.15em] text-[#9f9278] underline-offset-2 hover:text-[#d8ceb8] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="deathSavesSaving || (deathSaves.successes === 0 && deathSaves.failures === 0)"
          @click="resetDeathSaves"
        >
          Reset
        </button>
      </div>

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
  </component>
</template>
