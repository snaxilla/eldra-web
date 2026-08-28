<script setup lang="ts">
// Character Sheet V2 -- Phase 1. See server/utils/character-assembly.ts and
// server/api/worlds/[id]/characters/[characterId]/assembly.get.ts for the
// design this renders. This page consumes ONLY
// GET /api/worlds/:id/characters/:characterId/assembly -- it holds no
// concept of Content Packs, bindings, the Catalogue, the importer, or
// 5etools; those abstractions are already resolved away behind the
// assembly endpoint by the time this page ever sees a response. Deliberately
// separate from entities/[entityId]/sheet.vue (V1, which reads World
// Entities and a character_sheets row) -- this page never calls
// /entities or /character_sheets. This is an inspection surface only: no
// ability scores, equipment, spellcasting, actions, notes, or editing (this
// task's own NON-GOALS) -- just Name/Species/Class/Background, rendered
// exactly as Assembly resolved them, including "missing" when it did not.
//
// ---------------------------------------------------------------------------
// PHASE 2: THE SAME MODELS THE BUILDER SHOWED
// ---------------------------------------------------------------------------
// Each resolved slot's placeholder card (source book + package id, and
// nothing else) is replaced by the resolved presentation model the Content
// Pack publishes, rendered through the SAME component the Character Builder
// previews with (~/components/characters/ContentPresentationPanel.vue).
//
// Builder and Sheet are two contexts on one model, not two renderings of one
// idea: what a player read while choosing a Species is exactly what they read
// afterwards on the sheet, down to the wording, because it is the same
// component fed by the same resolver.
//
// Provenance stays on the card and does NOT move into the panel: which pack
// and version an entry resolved through is a fact about this character's
// binding, not about the Species, and it is what makes a later "missing"
// state intelligible.
//
// This page still holds no concept of Content Packs' internals, 5etools, or
// `data` -- `entry.presentation` arrives already resolved from the assembly
// endpoint, which gets it from the World Content Catalogue.
//
// ---------------------------------------------------------------------------
// RULES ENGINE INTEGRATION (rules-package-architecture.md §13.1)
// ---------------------------------------------------------------------------
// The ability score panel is replaced by DERIVED output: ability modifiers,
// proficiency bonus, and saving throw / skill proficiencies, all read from
// GET /api/worlds/:id/characters/:characterId/derived.
//
// NOT ONE OF THOSE NUMBERS IS COMPUTED HERE. This page performs no
// arithmetic at all -- it fetches a projection and renders it. The engine
// calculated every value; the bridge supplied every input; this file chose
// only where things sit on screen.
//
// It also names no ability, skill, or Definition ID. It selects which
// CATEGORIES to render (§13.2: "Sheet regions address Rule Categories"),
// which is the agnostic vocabulary -- a package that declares no
// `core.skills` definitions simply produces no skills region, with no
// configuration and no per-system code.
//
// Two absences are legal and rendered as such, never as errors: a World with
// no Rules Package activated, and a package that is activated but broken.
// Those are distinct states and the sheet says which.
//
// ---------------------------------------------------------------------------
// PHASE 3: IDENTITY AND ABILITY SCORES
// ---------------------------------------------------------------------------
// The placeholder identity section (a bare title and a sentence explaining
// the page) is replaced by a real one: Name, then Species / Class /
// Background at a glance, then the six ability scores.
//
// VALUES ONLY. This page displays what the character HAS and derives nothing
// from it -- no modifier beside a score, no saving throw, no skill bonus, no
// armour class, no hit points, no initiative. Every one of those is the Rules
// Engine's (app/lib/rules/**), which this page does not import and must not
// reimplement. When they arrive, they arrive as data.
//
// The Sheet DISPLAYS; the Builder EDITS. There is no inline editing here --
// the ability scores link out to the Builder's own editing surface
// (.../[characterId]/abilities), which is also the path by which a character
// created before Phase 3 acquires scores at all.
//
// ---------------------------------------------------------------------------
// INVENTORY -- THE FIRST V1 FEATURE ON THE NEW ARCHITECTURE
// ---------------------------------------------------------------------------
// V1's Inventory tab, rebuilt on Character Assembly rather than ported. Its
// INFORMATION ARCHITECTURE is preserved (an add panel above a dense two-up
// item grid, quantity/equipped/attuned per card); its PLUMBING is not. There
// is no `character_sheets` row, no `character_sheet_inventory` table, no
// runtime column probing, and no snapshotted 5etools payload: items are
// `(packageId, slug)` references re-resolved against the World's catalogue on
// every read, exactly as Species/Class/Background already are.
//
// Inventory is the ONE editable surface on this page, and deliberately so --
// see CharacterInventoryPanel.vue's header. Picking something up happens at
// the table, not in a character builder.
//
// This page still computes nothing. Every list change is decided by the pure
// module (app/lib/characters/inventory.ts) and saved; no weight, capacity,
// attunement limit, or armour class is calculated anywhere, because those are
// Rule Category 13 (`equipment`) and belong to the Rules Engine.
//
// ---------------------------------------------------------------------------
// NOTES -- THE SECOND V1 FEATURE ON THE NEW ARCHITECTURE
// ---------------------------------------------------------------------------
// V1's Notes tab, reshaped rather than ported: six named fields (General,
// Appearance, Personality, Backstory, Goals, Secrets) instead of an
// open-ended card list, because that is the shape this feature was scoped
// to. Persisted through Character Assembly's same block_instances pattern
// Inventory established -- see server/utils/character-notes.ts.
//
// Notes resolve against nothing: no catalogue join, no Rules Engine call,
// no derived value. They are the one piece of this page that is exactly what
// was typed, both in and out.
//
// `secrets` is an ordinary field, not access-controlled -- see
// character-notes.ts's own note on why: no real GM role exists yet to gate
// it on, and labelling it GM-only here would promise privacy this platform
// cannot enforce.
//
// ---------------------------------------------------------------------------
// HEALTH -- THE SECOND GAMEPLAY-DERIVED SYSTEM, FOLLOWING ARMOR CLASS
// ---------------------------------------------------------------------------
// Same shape as Armor Class: Maximum HP, Hit Dice (total), and Hit Dice
// Available are ALL Rules Engine output, read from
// `derived.byCategory['core.health']` via `findDerivedNumber` -- never
// computed here. Current HP, Temporary HP, Hit Dice spent, and Death Save
// marks are the player's own stored data (server/utils/character-health.ts,
// the same block_instances pattern every other player-data block uses),
// edited directly on the Sheet -- Health is the second deliberate exception
// to "the Sheet displays, the Builder edits" (Inventory was the first, for
// the identical reason: it changes during play, not at creation).
//
// `findDerivedNumber` reads ONLY the three read-only summaries -- never
// Current HP or Death Saves, which the player edits directly through
// CharacterRecoveryPanel.vue (CharacterHealthPanel.vue, renamed in Phase
// 3's display/action split -- see that file's own header). Rendering
// those through the generic `core.health` region too would show the same
// fact twice, through two different paths; see that helper's own note.
//
// ---------------------------------------------------------------------------
// SPELLCASTING -- THE SECOND GAMEPLAY SYSTEM ON THE RULES ENGINE, THE SAME
// SHAPE AS HEALTH
// ---------------------------------------------------------------------------
// Spellcasting Ability Modifier, Spell Save DC, and Spell Attack Bonus are
// ALL Rules Engine output, read via `findDerivedNumber`/`findDerivedBoolean`
// -- never computed here. Known/Prepared spells and expended slot counts are
// the player's own stored data (server/utils/character-spellcasting.ts, the
// same block_instances pattern every other player-data block uses), edited
// directly on the Sheet for the identical reason Inventory and Health are.
//
// `slotLevels` is the ONE piece of interpretation this page's data layer
// performs for Spellcasting: which of the three Spell Slot progression
// Tables (`derived.tables`) applies to THIS character, picked by reading the
// `caster_type` boolean flags this file already hardcodes the Definition ids
// of -- the same "the fixed key names the package's own vocabulary declares"
// posture `findDerivedNumber('core.health', 'value:hit_points.max')`
// immediately above already establishes for Health, one level up (a Table,
// not a Value, because Spell Slot progression is not a formula -- see
// packages/eldra-dnd5e-2024/README.md's own note on why `lookup()` is not
// evaluated). This still computes no NUMBER: it selects a row a Table
// already declares and reads it, exactly as it already selects which
// `derived.collections` entry is the equipment slots. As of Phase 2 (see
// below), this selection lives in useCharacterSheet.ts, not this file.
//
// ---------------------------------------------------------------------------
// ACTIONS -- "WHAT CAN MY CHARACTER DO?", A PROJECTION OF EVERYTHING ABOVE
// ---------------------------------------------------------------------------
// The Character Actions System. Fetched from its own endpoint
// (GET .../actions, server/utils/character-actions.ts) rather than composed
// on this page the way `slotLevels` is above -- Actions combines FIVE
// sources (Species, Class, Background, equipped weapons, prepared spells)
// and attaches Rules Engine numbers to each, which is real orchestration
// work, not the single "pick a table row" selection `slotLevels` performs.
// This page still computes nothing: it renders whatever the endpoint
// already assembled. Read-only -- see CharacterActionsPanel.vue's own
// header for why this is the one panel added by this task with no `@`
// emits at all.
//
// ---------------------------------------------------------------------------
// PHASE 2 (BEAUTIFICATION PASS): DATA LAYER CONSOLIDATION
// ---------------------------------------------------------------------------
// Everything described above as "fetched"/"read from `derived`" now happens
// inside app/composables/useCharacterSheet.ts, and every mutation described
// above as "saved"/"POSTed" now happens inside
// app/composables/useCharacterMutations.ts. This page calls both composables
// once each and renders what they return -- it orchestrates LAYOUT, not
// DATA. See each composable's own header for the reasoning behind its
// specific domain boundaries (notably: why Notes stays local to this page
// rather than becoming a sixth mutation domain, and why Join/Leave Encounter
// lives under the `conditions` mutation group rather than its own).
//
// The identity summary is composed inline rather than extracted into a
// component: it is used by exactly this one page. The ability scores ARE
// extracted (CharacterAbilityScoresPanel), because the Builder's review step
// renders the same panel -- the same test ContentPresentationPanel passed.
// Encounter and Conditions ARE now extracted too (CharacterEncounterPanel,
// CharacterConditionsPanel) -- Phase 2's other stated deliverable, alongside
// the two composables above.

import CharacterAbilityScoresPanel from '~/components/characters/CharacterAbilityScoresPanel.vue'
import CharacterInventoryPanel from '~/components/characters/CharacterInventoryPanel.vue'
import CharacterNotesPanel from '~/components/characters/CharacterNotesPanel.vue'
import CharacterRecoveryPanel from '~/components/characters/CharacterRecoveryPanel.vue'
import CharacterSpellcastingPanel from '~/components/characters/CharacterSpellcastingPanel.vue'
import CharacterDerivedPanel from '~/components/characters/CharacterDerivedPanel.vue'
import CharacterActionsPanel from '~/components/characters/CharacterActionsPanel.vue'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterStatChip from '~/components/characters/CharacterStatChip.vue'
import CharacterEmptyState from '~/components/characters/CharacterEmptyState.vue'
import CharacterEncounterPanel from '~/components/characters/CharacterEncounterPanel.vue'
import CharacterConditionsPanel from '~/components/characters/CharacterConditionsPanel.vue'
import CharacterVitalsBar from '~/components/characters/CharacterVitalsBar.vue'
import { useCharacterSheet } from '~/composables/useCharacterSheet'
import { useCharacterMutations } from '~/composables/useCharacterMutations'
import type { StoredCharacterNotes } from '~/lib/characters/character-notes'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const characterId = computed(() => String(route.params.characterId || ''))

// Single Character Sheet data-loading entry point -- see
// app/composables/useCharacterSheet.ts. Replaces what used to be six
// `useFetch` calls made directly in this script (three of them
// sequential, blocking each other in turn); this page now consumes that
// composable's state rather than coordinating its own fetching.
const sheet = await useCharacterSheet(worldId, characterId)

// One mutation surface for Recovery/Combat/Inventory/Spellcasting/
// Conditions -- see app/composables/useCharacterMutations.ts.
const mutations = useCharacterMutations(worldId, characterId, sheet)

const {
  assembly,
  blueprint,
  notAvailableMessage,
  errorMessage,
  pending,
  error,
  identity,
  derived,
  derivedPending,
  derivedUnavailable,
  derivedRegions,
  maxHp,
  hitDiceMax,
  hitDiceAvailable,
  hitDieSize,
  armorClass,
  characterLevel,
  spellcastingIsCaster,
  spellcastingAbilityMod,
  spellcastingSaveDc,
  spellcastingAttackBonus,
  inventoryItems,
  inventoryOptions,
  noteDraft,
  healthDraft,
  spellItems,
  spellOptions,
  slotLevels,
  actions: characterActions,
  actionsPending,
  actionsUnavailableMessage,
  combatTargetOptions,
  encounter,
  conditions
} = sheet

// ---------------------------------------------------------------------------
// Notes -- state and saving only; the pure module owns the shape. The one
// domain this phase deliberately did NOT move into useCharacterMutations.ts
// -- see that composable's own header for why (its task-scoped mutation
// list names Recovery/Combat/Inventory/Spellcasting/Conditions, not Notes).
// ---------------------------------------------------------------------------

const notesSaving = ref(false)
const notesError = ref('')

async function saveNotes(next: StoredCharacterNotes) {
  if (notesSaving.value) return

  const previous = noteDraft.value
  noteDraft.value = next
  notesSaving.value = true
  notesError.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/notes`, {
      method: 'PUT',
      body: next
    })
  } catch (saveError: any) {
    noteDraft.value = previous
    notesError.value =
      saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save notes'
  } finally {
    notesSaving.value = false
  }
}

// ---------------------------------------------------------------------------
// Vitals Bar -- Phase 3. Composes values already exposed by useCharacterSheet
// / useCharacterMutations into the shape CharacterVitalsBar.vue needs; no
// new fetch, no new arithmetic on a Rules Engine value (`characterClassName`
// only picks which already-resolved slot's title to show).
// ---------------------------------------------------------------------------

const characterClassName = computed(() => {
  const classSection = identity.value.sections.find((section) => section.key === 'class')
  if (!classSection) return ''
  return classSection.slot.status === 'resolved' ? classSection.slot.entry.title : 'Missing'
})

const isMyTurn = computed(() => conditions.myCombatant?.isCurrentTurn ?? false)

// One combined CharacterSaveIndicator for the whole page (§7.8: "a single
// CharacterSaveIndicator in the vitals bar, not per-panel text") --
// composed from every mutation domain's own saving/error, including Notes.
const vitalsSaving = computed(() =>
  mutations.recovery.saving
  || mutations.combat.resolving
  || mutations.inventory.saving
  || mutations.spellcasting.saving
  || encounter.pending
  || notesSaving.value
)

const vitalsError = computed(() =>
  mutations.recovery.error
  || mutations.combat.error
  || mutations.inventory.error
  || mutations.spellcasting.error
  || encounter.error
  || notesError.value
)
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <!-- max-w-4xl rather than 3xl: the cards now carry trait prose and
         two-column fact grids, not two lines of provenance. px-4 on phones
         keeps those same cards readable with no horizontal scroll. -->
    <div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <!-- Vitals Bar: sticky within THIS page's own overflow-y-auto root
           (see the class on this file's outermost div), never `fixed` --
           per the approved plan's own risk note on why. §7.2's Feature
           elevation tier, max one per screen, spent here. -->
      <CharacterVitalsBar
        v-if="blueprint"
        class="sticky top-0 z-20 mb-4"
        :character-title="identity.characterTitle"
        :level="characterLevel"
        :class-name="characterClassName"
        :current-hp="healthDraft.currentHp"
        :max-hp="maxHp"
        :temporary-hp="healthDraft.temporaryHp"
        :armor-class="armorClass"
        :is-caster="spellcastingIsCaster"
        :spell-save-dc="spellcastingSaveDc"
        :spell-attack-bonus="spellcastingAttackBonus"
        :conditions="conditions.mine"
        :in-encounter="encounter.isInSelected"
        :is-my-turn="isMyTurn"
        :round="encounter.view?.round ?? null"
        :saving="vitalsSaving"
        :error="vitalsError"
        :remove-condition="mutations.conditions.remove"
      />

      <div class="eldra-kicker text-xs">
        Character Sheet
      </div>
      <h1 class="eldra-title mt-2 break-words text-3xl font-semibold">
        {{ identity.characterTitle || 'Character Sheet' }}
      </h1>

      <!-- Identity at a glance: who this character is, in one line on a
           phone-friendly wrapping list. The full Species/Class/Background
           detail cards follow further down. -->
      <dl
        v-if="blueprint"
        class="mt-3 flex flex-wrap gap-x-6 gap-y-2"
      >
        <div
          v-for="row in identity.identityRows"
          :key="row.key"
          class="min-w-0"
        >
          <dt class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
            {{ row.label }}
          </dt>
          <dd
            class="break-words text-base font-semibold"
            :class="row.missing ? 'text-red-300' : 'text-[#fff7df]'"
          >
            {{ row.value }}
          </dd>
        </div>
      </dl>

      <NuxtLink
        :to="`/worlds/${worldId}/characters`"
        class="mt-4 inline-block text-sm text-[#9f9278] hover:text-[#d8ceb8]"
      >
        &larr; Back to Characters
      </NuxtLink>

      <div
        v-if="pending"
        class="mt-8 text-sm text-[#9f9278]"
      >
        Loading this character's Assembly…
      </div>

      <div
        v-else-if="error"
        class="mt-8 rounded-none border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
      >
        {{ errorMessage }}
      </div>

      <div
        v-else-if="assembly && !assembly.available"
        class="mt-8"
      >
        <CharacterEmptyState
          icon="i-lucide-file-question"
          :message="notAvailableMessage"
        />
      </div>

      <div
        v-else-if="blueprint"
        class="mt-8 grid gap-4"
      >
        <!-- Ability Scores. Values only -- nothing on this page derives a
             modifier, save, skill, AC, HP, or initiative from them. -->
        <CharacterSheetSection heading="Ability Scores">
          <!-- The Sheet displays; the Builder edits. -->
          <template #heading-end>
            <NuxtLink
              :to="`/worlds/${worldId}/characters/${characterId}/abilities`"
              class="text-sm text-[#9f9278] underline-offset-4 hover:text-[#d8ceb8] hover:underline"
            >
              {{ blueprint.abilityScores ? 'Edit' : 'Assign' }}
            </NuxtLink>
          </template>

          <div class="mt-3">
            <CharacterAbilityScoresPanel
              :scores="blueprint.abilityScores?.scores ?? null"
              empty-message="No ability scores have been assigned yet. Use Assign above to set them."
            />
          </div>
        </CharacterSheetSection>

        <!-- Derived by the Rules Engine. Every value below was computed by
             the evaluator from this character's data and the World's active
             Rules Package; nothing on this page calculates. -->
        <CharacterSheetSection heading="Derived">
          <template #heading-end>
            <p
              v-if="derived"
              class="break-words text-xs text-[#6f6754]"
            >
              {{ derived.packageId }}@{{ derived.packageVersion }}
            </p>
          </template>

          <p
            v-if="derivedPending"
            class="mt-3 text-sm text-[#9f9278]"
          >
            Evaluating this character against the World's rules…
          </p>

          <p
            v-else-if="!derived"
            class="mt-3 rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-4 text-sm text-[#9f9278]"
          >
            {{ derivedUnavailable }}
          </p>

          <div
            v-else
            class="mt-3 grid gap-5"
          >
            <div
              v-for="region in derivedRegions"
              :key="region.category"
              class="min-w-0"
            >
              <h3 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
                {{ region.label }}
              </h3>
              <CharacterDerivedPanel :entries="region.entries" />
            </div>

            <!-- Equipment Slots: declared by the active Rules Package's
                 Collection metadata (registry.getById('collection:equipment')
                 .slots), not computed here. No per-slot occupancy is shown --
                 that needs an item to declare WHICH slot it fills, which
                 needs a Rules Facet no item authors yet (see the actor
                 bridge's header). What the package declares (which slots
                 exist, and their capacity) is real Rules Engine output and
                 is shown as such. -->
            <div
              v-for="collection in derived.collections"
              :key="collection.id"
              class="min-w-0"
            >
              <h3 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
                {{ collection.label || 'Equipment Slots' }}
              </h3>
              <div class="flex flex-wrap gap-2">
                <CharacterStatChip
                  v-for="equipmentSlot in collection.slots"
                  :key="equipmentSlot.id"
                  :label="equipmentSlot.id"
                  :value="equipmentSlot.capacity"
                />
              </div>
            </div>

            <!-- Declared by a Species, Class, or Background and not yet
                 answered. Stated rather than silently omitted, because "you
                 still have skills to choose" is information a player needs
                 -- and it disappears on its own once they are answered,
                 because `pendingChoices` is derived from the current answers
                 rather than from a flag anything has to clear.
                 The Sheet still renders; it does not edit. The link goes to
                 the Builder-context page that does. -->
            <p
              v-if="derived.pendingChoices.length"
              class="text-xs leading-5 text-[#6f6754]"
            >
              {{ derived.pendingChoices.length }} proficiency
              {{ derived.pendingChoices.length === 1 ? 'choice is' : 'choices are' }}
              still outstanding, so those proficiencies show as unselected.
              <NuxtLink
                :to="`/worlds/${worldId}/characters/${characterId}/proficiencies`"
                class="text-[#c9a45a] underline underline-offset-2 hover:text-[#f5e7bd]"
              >
                Choose them
              </NuxtLink>.
            </p>
          </div>
        </CharacterSheetSection>

        <!-- Inventory: the one editable region on this page. See the
             file header and CharacterInventoryPanel.vue for why. -->
        <CharacterSheetSection heading="Inventory">
          <div class="mt-4">
            <CharacterInventoryPanel
              :items="inventoryItems"
              :options="inventoryOptions"
              :saving="mutations.inventory.saving"
              :error-message="mutations.inventory.error"
              @add="mutations.inventory.add"
              @remove="mutations.inventory.remove"
              @change-quantity="mutations.inventory.changeQuantity"
              @toggle-flag="mutations.inventory.toggleFlag"
            />
          </div>
        </CharacterSheetSection>

        <!-- Notes: also editable -- see CharacterNotesPanel.vue's header. -->
        <CharacterSheetSection heading="Notes">
          <div class="mt-4">
            <CharacterNotesPanel
              :notes="noteDraft"
              :saving="notesSaving"
              :error-message="notesError"
              @save="saveNotes"
            />
          </div>
        </CharacterSheetSection>

        <!-- Recovery: HP/AC/etc. now DISPLAY in the Vitals Bar above; this
             section keeps every ACTION that changes them -- see
             CharacterRecoveryPanel.vue's own header. -->
        <CharacterSheetSection heading="Recovery">
          <div class="mt-4">
            <CharacterRecoveryPanel
              :health="healthDraft"
              :max-hp="maxHp"
              :hit-dice-max="hitDiceMax"
              :hit-dice-available="hitDiceAvailable"
              :hit-die-size="hitDieSize"
              :saving="mutations.recovery.saving"
              :error-message="mutations.recovery.error"
              @save="mutations.recovery.save"
              @recovery="mutations.recovery.apply"
            />
          </div>
        </CharacterSheetSection>

        <!-- Spellcasting: also editable -- see CharacterSpellcastingPanel.vue's
             header. -->
        <CharacterSheetSection heading="Spellcasting">
          <div class="mt-4">
            <CharacterSpellcastingPanel
              :spells="spellItems"
              :options="spellOptions"
              :slot-levels="slotLevels"
              :is-caster="spellcastingIsCaster"
              :ability-mod="spellcastingAbilityMod"
              :save-dc="spellcastingSaveDc"
              :attack-bonus="spellcastingAttackBonus"
              :saving="mutations.spellcasting.saving"
              :error-message="mutations.spellcasting.error"
              @add="mutations.spellcasting.add"
              @remove="mutations.spellcasting.remove"
              @toggle-flag="mutations.spellcasting.toggleFlag"
              @expend-slot="mutations.spellcasting.expendSlot"
              @restore-slot="mutations.spellcasting.restoreSlot"
            />
          </div>
        </CharacterSheetSection>

        <!-- Actions: "what can my character do?", and now "execute one
             against one target" -- this character's own state is never
             edited here (Combat Resolution mutates the TARGET's HP, not
             this character's own stored data). See CharacterActionsPanel.vue's
             own header for why. -->
        <CharacterSheetSection heading="Actions">
          <div class="mt-4">
            <CharacterActionsPanel
              :actions="characterActions"
              :pending="actionsPending"
              :error-message="actionsUnavailableMessage || mutations.combat.error"
              :target-options="combatTargetOptions"
              :results="mutations.combat.results"
              :resolving="mutations.combat.resolving"
              @resolve="mutations.combat.resolve"
            />
          </div>
        </CharacterSheetSection>

        <!-- Encounter: status, whose turn it is, Join/Leave, and (nested,
             exactly where it always rendered) this character's own
             Conditions -- Resolve Action is the Actions panel above,
             unchanged. Both panels are presentation only; all data and
             mutation state comes from useCharacterSheet.ts /
             useCharacterMutations.ts via the `encounter`/`conditions`/
             `mutations` props. -->
        <CharacterSheetSection heading="Encounter">
          <div class="mt-4">
            <CharacterEncounterPanel
              :encounter="encounter"
              :mutations="mutations.conditions"
            >
              <template #conditions>
                <CharacterConditionsPanel
                  v-if="encounter.isInSelected"
                  :conditions="conditions"
                  :mutations="mutations.conditions"
                  :pending="encounter.pending"
                  :encounter-ended="encounter.view?.status === 'ended'"
                />
              </template>
            </CharacterEncounterPanel>
          </div>
        </CharacterSheetSection>

        <CharacterSheetSection
          v-for="section in identity.sections"
          :key="section.key"
          :heading="section.label"
        >
          <template v-if="section.slot.status === 'resolved'">
            <!-- When the pack publishes details, the panel supplies the name
                 and source line itself; the bare title is the fallback for an
                 entry that resolved but carries no presentation model. -->
            <div
              v-if="!section.slot.entry.presentation"
              class="mt-2 break-words text-xl font-semibold text-white"
            >
              {{ section.slot.entry.title }}
            </div>

            <div class="mt-2">
              <ContentPresentationPanel
                :entry="section.slot.entry.presentation"
                context="detail"
                :empty-message="`This Content Pack publishes no further details for this ${section.label.toLowerCase()}.`"
              />
            </div>

            <!-- Which bound pack this choice resolved through -- a fact about
                 this character, not about the Species/Class/Background. -->
            <p class="mt-4 break-words border-t border-[rgba(201,164,90,0.14)] pt-3 text-xs text-[#6f6754]">
              Resolved from {{ section.slot.entry.packageId }}@{{ section.slot.entry.packageVersion }}
            </p>
          </template>

          <template v-else>
            <div class="mt-2 rounded-none border border-red-900 bg-red-950/40 p-3">
              <div class="text-sm font-semibold uppercase tracking-[0.1em] text-red-300">
                Missing
              </div>
              <p class="mt-1 text-sm text-red-200">
                {{ section.slot.reason }}
              </p>
              <dl
                v-if="section.slot.packageId"
                class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs"
              >
                <dt class="text-red-300/70">
                  Package
                </dt>
                <dd class="text-red-200">
                  {{ section.slot.packageId }}
                </dd>
              </dl>
            </div>
          </template>
        </CharacterSheetSection>
      </div>
    </div>
  </div>
</template>
