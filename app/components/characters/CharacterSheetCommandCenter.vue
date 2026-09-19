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
// alone in a separate, scrolled-away section.
//
// HEADER CLEANUP 2: SHORT REST / LONG REST NO LONGER LIVE HERE. They sat
// in this file's own top-right button row, beside Back, since H1 --
// real-browser feedback flagged that as mixing navigation (Back) with a
// character/gameplay action. Both buttons moved into
// CharacterCommandResources.vue's own new Rest card (grouped with the Hit
// Dice they are conceptually inseparable from in 5e play); this file's own
// `rest` emit is gone along with them -- `recovery` (already relayed
// below) is the only event this component emits for any recovery action
// now, matching what CharacterCommandResources.vue already emitted for
// Damage/Heal/Temp HP/Spend Hit Die/Death Saves all along.
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
// DECEASED PORTRAIT PRESENTATION -- HEADER CLEANUP 3, FLAVOR ONLY
// ---------------------------------------------------------------------------
// Three failed Death Saves grays out and red-X's the portrait -- see
// `isDeceased`'s own script comment and app/lib/characters/health.ts's
// `isCharacterDeceasedFromDeathSaves` for the full trace/rationale. This is
// derived PRESENTATION, not new gameplay authority: no persisted flag, no
// Entity/Rules Engine change, no effect on HP/Rest/Actions/permissions.
// Portrait edit affordances (Add/Change/Remove) remain fully usable while
// deceased -- the overlay is `pointer-events-none` throughout.
//
import type { EncounterConditionView } from '~/composables/useCharacterSheet'
import { isCharacterDeceasedFromDeathSaves, type StoredCharacterHealth } from '~/lib/characters/health'
import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterSaveIndicator from '~/components/characters/CharacterSaveIndicator.vue'
import CharacterVitalsBar from '~/components/characters/CharacterVitalsBar.vue'
import CharacterHealthBar from '~/components/characters/CharacterHealthBar.vue'
import CharacterCommandResources, { type RecoveryActionType } from '~/components/characters/CharacterCommandResources.vue'

const props = withDefaults(defineProps<{
  worldId: string
  characterTitle: string
  imageUrl?: string | null
  canEditPortrait?: boolean
  portraitSaving?: boolean
  portraitError?: string
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
  canEditPortrait: false,
  portraitSaving: false,
  portraitError: '',
  initiative: null,
  speed: null,
  proficiencyBonus: null,
  slotLevels: () => [],
  recoverySaving: false,
  recoveryError: '',
  spellSaving: false
})

const emit = defineEmits<{
  save: [StoredCharacterHealth]
  recovery: [{ type: RecoveryActionType; amount?: number }]
  'expend-slot': [number]
  'restore-slot': [number]
  'update-portrait': [File]
  'clear-portrait': []
}>()

// ---------------------------------------------------------------------------
// PORTRAIT -- HEADER CLEANUP 1 (PLAY-MODE PORTRAIT MANAGEMENT)
// ---------------------------------------------------------------------------
// Play Mode no longer depends on Build Mode for portrait changes -- the
// legacy sheet's own upload flow (a hidden native `<input type="file">`,
// gated behind `mode === 'build'`) is replicated here verbatim, minus the
// Build Mode gate, replaced by `canEditPortrait` (this Sheet's own
// `world.character.edit_any` capability check -- see useCharacterSheet.ts's
// own note on why this is the one reused pattern, not a new permission
// model). No second upload system: this still just captures a `File` and
// hands it to the page, which POSTs it through the exact same
// `.../characters/:id/update` endpoint Build Mode already uses.
const portraitFileInput = ref<HTMLInputElement | null>(null)

function triggerPortraitUpload() {
  if (!props.canEditPortrait) return
  portraitFileInput.value?.click()
}

function handlePortraitFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('update-portrait', file)
  input.value = ''
}

// ---------------------------------------------------------------------------
// DECEASED PORTRAIT PRESENTATION -- HEADER CLEANUP 3, FLAVOR ONLY
// ---------------------------------------------------------------------------
// Derives directly from `props.health.deathSaves` -- the SAME authoritative
// state Reset Death Saves/Long Rest/the mark buttons (now in
// CharacterVitalsBar, see Caster Pass 0.1 below) already mutate (see
// isCharacterDeceasedFromDeathSaves's own header in app/lib/characters/
// health.ts for the full trace: no dead/deceased concept existed anywhere
// in this codebase before this task, and this adds no persisted flag, no
// new gameplay authority -- a plain `computed`, not a second ref, so there
// is nothing that can drift from `health` and nothing to reset separately.
// Resetting failures below 3 (Reset Death Saves, Long Rest, or any future
// correction) makes this `false` on the very next render, automatically.
// This computed is completely UNCHANGED by Caster Pass 0.1 -- it reads the
// same `health.deathSaves`, regardless of whether the mark CONTROLS are
// currently visible; visibility and the deceased flavor rule are
// deliberately separate concerns.
const isDeceased = computed(() => isCharacterDeceasedFromDeathSaves(props.health.deathSaves))

// ---------------------------------------------------------------------------
// DEATH SAVES -- CASTER PASS 0.1 (CONTEXTUAL, MOVED FROM
// CharacterCommandResources.vue INTO CharacterVitalsBar)
// ---------------------------------------------------------------------------
// CharacterVitalsBar.vue owns the mark-click TOGGLE semantics (it already
// has `deathSaves` as a prop and resolves "click mark N" into the already-
// intended next count, byte-identical logic to the one this file used to
// relay from CharacterCommandResources.vue's own `setDeathSaveMarks`) and
// emits the RESOLVED `{ kind, nextCount }`. This file is the one that owns
// the full authoritative `health` object every other mutation here already
// reads/patches (`saveWith`'s old job), so it is the natural place to
// build the patched record and reuse the EXACT SAME `save` emit (PUT
// .../health) Damage/Heal/Temp HP's old "HP Correction" removal already
// established as this Sheet's one direct-health-write path.
function handleMarkDeathSave({ kind, nextCount }: { kind: 'successes' | 'failures'; nextCount: number }) {
  emit('save', { ...props.health, deathSaves: { ...props.health.deathSaves, [kind]: nextCount } })
}
</script>

<template>
  <CharacterSheetSection
    elevation="feature"
    density="compact"
  >
    <div class="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(96px,1fr)_5fr] xl:items-stretch xl:gap-5">
      <!-- Portrait: the folio's cover illustration, not an avatar.
           aspect-[4/5] below `xl` (a fixed-ratio thumbnail beside identity
           in a flex row); at `xl` the grid ITSELF now stretches this
           column to the row's full height (`xl:items-stretch` above, was
           `xl:items-start` -- the exact root cause of the reported "empty
           header space below the portrait": `items-start` opted the
           portrait's shorter aspect-ratio-derived height out of Grid's
           default stretch, so it never matched the identity column's
           taller content), so `xl:aspect-auto xl:h-full` here lets the
           frame consume that stretched height instead of staying locked
           to its own aspect ratio -- a real stretch behavior, not a
           hardcoded pixel height. Wrapped (rather than being the grid
           item itself) so the error message below it doesn't add a third
           child to a 2-column grid. `relative` on the frame itself, plus
           an absolutely-positioned fill (img/placeholder/overlay) rather
           than relying on `aspect-ratio` alone to size a flex/grid child
           -- the previously reported "frame taller than the image"
           defect -- so the portrait always fills its frame exactly
           (`inset-0 h-full w-full object-cover`), cropping gracefully
           instead of leaving a gap or stretching. -->
      <div class="w-16 shrink-0 sm:w-20 xl:w-full xl:h-full">
      <div class="eldra-image-frame group relative aspect-[4/5] w-full overflow-hidden rounded-none border bg-black/25 xl:aspect-auto xl:h-full">
        <img
          v-if="imageUrl"
          :src="imageUrl"
          :alt="characterTitle || 'Character portrait'"
          class="absolute inset-0 h-full w-full object-cover object-top transition duration-200"
          :class="isDeceased ? 'grayscale' : ''"
          loading="lazy"
        >
        <button
          v-else-if="canEditPortrait"
          type="button"
          class="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-1 text-center text-[#9f9278] transition hover:bg-[rgba(201,164,90,0.1)] focus-visible:bg-[rgba(201,164,90,0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed"
          :disabled="portraitSaving"
          aria-label="Add character portrait"
          @click="triggerPortraitUpload"
        >
          <UIcon name="i-lucide-image-plus" class="h-4 w-4" />
          <span class="text-[9px] uppercase tracking-[0.1em]">{{ portraitSaving ? 'Saving…' : 'Add portrait' }}</span>
        </button>
        <div
          v-else
          class="absolute inset-0 flex h-full w-full items-center justify-center text-center text-[9px] uppercase tracking-[0.1em] text-[#9f9278]"
        >
          No portrait
        </div>

        <!-- Deceased presentation -- Header Cleanup 3, flavor only (see
             `isDeceased`'s own script comment above). Always in the DOM,
             opacity-toggled rather than v-if, so the ~200ms transition
             actually animates instead of snapping in/out. `pointer-
             events-none` throughout: never intercepts the Add/Change/
             Remove controls below, which keep working identically while
             deceased (Change/Remove also carry their own `z-10`, so they
             stay visually on top of this too, not just clickable through
             it). Works with or without a portrait image -- the dark
             overlay and red X render over the placeholder/"No portrait"
             state exactly the same way, since neither depends on `imageUrl`. -->
        <span
          v-if="isDeceased"
          class="sr-only"
        >
          Deceased
        </span>
        <div
          class="pointer-events-none absolute inset-0 bg-black/35 transition-opacity duration-200"
          :class="isDeceased ? 'opacity-100' : 'opacity-0'"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-200"
          :class="isDeceased ? 'opacity-100' : 'opacity-0'"
          aria-hidden="true"
        >
          <div class="absolute left-1/2 top-1/2 h-1 w-[200%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-600 shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
          <div class="absolute left-1/2 top-1/2 h-1 w-[200%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-600 shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
        </div>

        <!-- Hover/focus edit affordances, shown only over an EXISTING
             portrait -- discoverable without a mouse: `opacity-100` by
             default (touch has no hover), dimmed on pointer-capable/
             desktop viewports until hover OR keyboard focus
             (`md:opacity-0 md:group-hover:opacity-100
             focus-visible:opacity-100`, the same pattern the legacy
             sheet's own Build Mode portrait editor already used, minus
             its Build Mode gate). -->
        <button
          v-if="canEditPortrait && imageUrl"
          type="button"
          class="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-1 bg-black/80 px-1 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#fff7df] opacity-100 transition focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed md:opacity-0 md:group-hover:opacity-100"
          :disabled="portraitSaving"
          aria-label="Change character portrait"
          @click="triggerPortraitUpload"
        >
          <UIcon name="i-lucide-camera" class="h-3 w-3" />
          <span>{{ portraitSaving ? 'Saving…' : 'Change' }}</span>
        </button>

        <button
          v-if="canEditPortrait && imageUrl"
          type="button"
          class="absolute right-0 top-0 z-10 bg-black/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#d8ceb8] opacity-100 transition hover:text-red-300 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed md:opacity-0 md:group-hover:opacity-100"
          :disabled="portraitSaving"
          aria-label="Remove character portrait"
          @click="emit('clear-portrait')"
        >
          ✕
        </button>

        <input
          ref="portraitFileInput"
          type="file"
          accept="image/*"
          class="sr-only"
          tabindex="-1"
          @change="handlePortraitFileChange"
        >
      </div>

      <p
        v-if="portraitError"
        class="mt-1.5 text-[10px] text-red-300"
      >
        {{ portraitError }}
      </p>
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

          <!-- Command buttons: tight, aligned with the identity block.
               Header Cleanup 2: Short Rest/Long Rest are gone from here --
               navigation (Back) no longer shares this row with a character
               action; both moved into CharacterCommandResources.vue's own
               Rest card below. Not replaced with filler -- empty header
               space here is acceptable and expected to hold a future
               feature, not filled just because it is available. -->
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

        <!-- Vitals: current state and immediate play state. Caster Pass
             0.1: also carries the now-contextual Death Saves (see
             CharacterVitalsBar's own header for the visibility rule) --
             `health`/`recovery-saving` are the same props/emit vocabulary
             CharacterCommandResources already used for them, just relayed
             from a different mount point now. -->
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
            :death-saves="health.deathSaves"
            :death-saves-saving="recoverySaving"
            :conditions="conditions"
            :in-encounter="inEncounter"
            :is-my-turn="isMyTurn"
            :round="round"
            :saving="saving"
            :error="error"
            :remove-condition="removeCondition"
            @mark-death-save="handleMarkDeathSave"
            @recovery="emit('recovery', $event)"
          />
        </div>

        <!-- The combat HUD: Health correction, Damage/Heal, Hit Dice, and
             Character Resources (Spell Slots today) -- everything H5 moves
             out of the Play tab's own Recovery section and the Spells
             tab's Spell Slots block. Death Saves no longer live here as of
             Caster Pass 0.1 -- see CharacterVitalsBar's own mount below,
             which now owns them contextually. -->
        <div class="mt-3">
          <CharacterCommandResources
            :health="health"
            :max-hp="maxHp"
            :hit-dice-max="hitDiceMax"
            :hit-dice-available="hitDiceAvailable"
            :hit-die-size="hitDieSize"
            :recovery-saving="recoverySaving"
            :recovery-error="recoveryError"
            :slot-levels="slotLevels"
            :spell-saving="spellSaving"
            @recovery="emit('recovery', $event)"
            @expend-slot="emit('expend-slot', $event)"
            @restore-slot="emit('restore-slot', $event)"
          />
        </div>
      </div>
    </div>
  </CharacterSheetSection>
</template>
