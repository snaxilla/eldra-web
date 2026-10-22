<script setup lang="ts">
// Character Builder V2 -- Eldra's canonical Character Builder, Phase 1
// (Name + Species + Class + Background).
//
// DATA: consumes ONLY GET /api/worlds/:id/catalogue -- the live World
// Content Catalogue produced by the approved Content Platform
// (server/utils/world-content-catalogue.ts). There is no fixture, no
// hardcoded species/class/background list, and no /entities call anywhere
// in this file; every option a player can pick came from a Content Pack a
// GM actually published and bound. Saving goes to
// POST /api/worlds/:id/characters/create-v2, which re-verifies every choice
// against its own copy of that same catalogue by (packageId, slug) and
// never trusts what this page sends beyond those two fields.
//
// ---------------------------------------------------------------------------
// ADAPTIVE, NOT RESPONSIVE-AS-AN-AFTERTHOUGHT
// ---------------------------------------------------------------------------
// This is one feature-complete application with two LAYOUTS, not a desktop
// app that degrades. The functional core -- the same option pickers, the
// same search, the same validation, the same submit -- is shared verbatim
// between them; only arrangement differs, and only because desktop has room
// to show simultaneously what a phone shows sequentially:
//
//   compact (phone / small tablet / any coarse pointer under 1366px)
//     one step at a time, full-bleed cards, progress rail at the top,
//     sticky bottom action bar within thumb reach.
//
//   roomy (laptop / desktop / large fine-pointer tablet)
//     every step on screen at once in two columns, with a persistent live
//     summary beside them; no stepper, because nothing needs hiding.
//
// NOTHING IS GATED BY LAYOUT. The progress rail is a set of buttons, so a
// phone user can jump to any step at any time exactly as a desktop user can
// scroll to any section -- "Next" is a convenience, never a lock. No feature,
// field, or control exists on one layout and not the other.
//
// The breakpoint heuristic (width < 768, or a coarse pointer at <= 1366)
// deliberately matches the one app/pages/worlds/[id]/entities/[entityId]/sheet.vue
// already uses, so the two character surfaces agree about what "compact"
// means. It is intentionally pointer-aware rather than width-only: an iPad
// in landscape is 1024px wide but is still a touch device and still wants
// large targets.
//
// ---------------------------------------------------------------------------
// TEACHING, NOT JUST CHOOSING (Phase 2)
// ---------------------------------------------------------------------------
// A player must never have to leave the Builder to understand what they are
// selecting. Each choice therefore renders a live preview -- the resolved
// presentation model for the currently selected option -- directly beneath
// its picker, on BOTH layouts.
//
// Beneath the picker, not in a modal, a drawer, or a linked page: selecting
// a Species and reading about it are one continuous act, and every mechanism
// that interrupts it (a dialog to dismiss, a route to come back from) makes
// comparing two options cost more than it should. The preview simply appears
// where the choice was made, and changing the radio changes it in place.
//
// The preview is the SAME component the Character Sheet renders
// (~/components/characters/ContentPresentationPanel.vue) against the SAME
// models, so what a player learns here reads identically on the sheet
// afterwards.
//
// This page still knows nothing about 5etools, Content Packs, or `data`.
// `entry.presentation` arrives already resolved from
// GET /api/worlds/:id/catalogue (server/utils/world-content-catalogue.ts ->
// app/lib/content-presentation); no field name from any game system appears
// anywhere in this file.
//
// ---------------------------------------------------------------------------
// PHASE 3: ABILITY SCORES
// ---------------------------------------------------------------------------
// A fifth step, between Background and Review, rendered by the SAME editor
// the standalone ability-editing page uses
// (~/components/characters/builder/CharacterAbilityScoreEditor.vue), and
// summarised on Review by the SAME read-only panel the Character Sheet
// renders (~/components/characters/CharacterAbilityScoresPanel.vue). This
// page owns no ability-score logic of its own: method switching, point-buy
// budgeting, and completeness all live in the pure modules
// (characterBuilderSelection.ts -> app/lib/characters/ability-scores.ts) and
// are unit-tested there.
//
// Nothing here computes a modifier, save, skill, or hit point from a score.
// Those belong to the Rules Engine, which this page does not import.
//
// ---------------------------------------------------------------------------
// PROFICIENCIES: THE FIRST QUESTION THE CONTENT ASKS
// ---------------------------------------------------------------------------
// A sixth step, between Background and Ability Scores, rendering the
// ChoiceSets the chosen content declares -- "choose two skills from your
// class list."
//
// The step is DECLARED BY DATA, not by this file. Which questions appear,
// how many picks each takes, and which options are offered all come from the
// selected entry's Rules Facet (relayed by GET /api/worlds/:id/catalogue);
// the prompt and the option labels come from the World's active Rules
// Package (GET /api/worlds/:id/rules/choice-options). This page contains no
// skill name and no rule -- pick a different Class and the questions change
// with no code change, which is the whole point.
//
// It stores ONLY what was ticked. Nothing here decides that a ticked skill
// is proficient, and nothing computes a bonus from it: that is the bridge's
// and the evaluator's work, on the next read of the character.

import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import CharacterAbilityScoresPanel from '~/components/characters/CharacterAbilityScoresPanel.vue'
import CharacterAbilityScoreEditor from '~/components/characters/builder/CharacterAbilityScoreEditor.vue'
import {
  CHOICE_KEYS,
  STEP_KEYS,
  STEP_LABELS,
  activeAssignment,
  choiceOptionLabelOverrides,
  creationChoicePresentation,
  creationContentPresentation,
  equipmentChoiceSections,
  setContentChoiceSelections,
  setEquipmentSelection,
  type BuilderCreationContext,
  declaredChoices,
  draftAbilityScores,
  emptyDraft,
  findOptionByKey,
  isDraftComplete,
  isStepComplete,
  missingRequirements,
  nextStep,
  optionKey,
  previousStep,
  pruneChoices,
  setChoiceSelections,
  setSpellSelections,
  spellRequirementSections,
  switchAbilityMethod,
  toCreatePayload,
  type BuilderCatalogueEntry,
  type BuilderChoiceKey,
  type BuilderStepKey,
  withCreationBlockers
} from '~/components/characters/builder/characterBuilderSelection'
import CharacterBuilderOptionPicker from '~/components/characters/builder/CharacterBuilderOptionPicker.vue'
import CharacterChoiceSetPicker from '~/components/characters/builder/CharacterChoiceSetPicker.vue'
import CreationStageRail from '~/components/characters/builder/CreationStageRail.vue'
import CharacterPreviewPanel from '~/components/characters/builder/CharacterPreviewPanel.vue'
import CreationDetailPanel from '~/components/characters/builder/CreationDetailPanel.vue'
import CreationValidationBanner from '~/components/characters/builder/CreationValidationBanner.vue'
import type { AbilityKey, AbilityScoreMethod } from '~/lib/characters/ability-scores'
import { serializeContentRef } from '~/lib/characters/progression-plan'
import type { PresentationEntry } from '~/lib/content-presentation'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

type WorldCatalogue = {
  worldId: string
  packs: Array<{ ok: boolean; packageId: string; version: string }>
  species: BuilderCatalogueEntry[]
  classes: BuilderCatalogueEntry[]
  backgrounds: BuilderCatalogueEntry[]
  // PHASE 2C.2B -- content-backed creation choices (Fighting Style) pick from these.
  feats: BuilderCatalogueEntry[]
  // D&D 2024 Character Rules P2 -- for a 'spells' category content choice (mirrors `feats`).
  spells: BuilderCatalogueEntry[]
  // D&D 2024 Character Rules P8B -- for resolving an `item`/`crossReference` EquipmentGrant's real
  // title. Already part of GET /api/worlds/:id/catalogue's own response (server/utils/
  // world-content-catalogue.ts's `WorldGameplayCatalogue.items`); only newly typed/threaded here.
  items: BuilderCatalogueEntry[]
}

const { data: catalogue, pending: catalogueLoading, error: catalogueError } = await useFetch<WorldCatalogue>(
  () => `/api/worlds/${worldId.value}/catalogue`
)

// PHASE 0 -- each option says why it cannot be chosen yet (the same authority the server enforces).
const optionsFor = computed<Record<BuilderChoiceKey, BuilderCatalogueEntry[]>>(() => ({
  species: withCreationBlockers(catalogue.value?.species ?? [], 'species'),
  class: withCreationBlockers(catalogue.value?.classes ?? [], 'class'),
  background: withCreationBlockers(catalogue.value?.backgrounds ?? [], 'background')
}))

const hasAnyBoundPack = computed(() => (catalogue.value?.packs?.length ?? 0) > 0)
const catalogueIsEmpty = computed(
  () => !catalogueLoading.value && CHOICE_KEYS.every((key) => optionsFor.value[key].length === 0)
)

// ---------------------------------------------------------------------------
// Adaptive layout -- see this file's header.
// ---------------------------------------------------------------------------

const viewportWidth = ref(0)
const pointerCoarse = ref(false)

function updateViewport() {
  if (!import.meta.client) return
  viewportWidth.value = window.innerWidth || 0
  pointerCoarse.value = window.matchMedia?.('(pointer: coarse)').matches || false
}

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  window.addEventListener('orientationchange', updateViewport)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('orientationchange', updateViewport)
})

// Defaults to the roomy layout during SSR / before measurement, then
// corrects on mount. Both layouts render the same controls, so a brief
// pre-hydration mismatch changes arrangement only, never capability.
const compact = computed(() => {
  const width = viewportWidth.value
  if (!width) return false
  return width < 768 || (pointerCoarse.value && width <= 1366)
})

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

const draft = reactive(emptyDraft())
const activeStep = ref<BuilderStepKey>('identity')

// The picker speaks in composite (packageId::slug) keys -- never bare slugs,
// which can collide across packs. See characterBuilderSelection.ts.
const selectedKeys = computed<Record<BuilderChoiceKey, string>>(() => ({
  species: optionKey(draft.species),
  class: optionKey(draft.class),
  background: optionKey(draft.background)
}))

function chooseOption(key: BuilderChoiceKey, value: string) {
  draft[key] = findOptionByKey(optionsFor.value[key], value)
}

// CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- IDENTITY. Species renders INLINE within the
// merged 'identity' stage below (see STEP_KEYS's own header on the merge) -- this is the
// remainder CHOICE_KEYS renders through the generic per-key stage loop.
const STAGE_PICKER_KEYS: readonly BuilderChoiceKey[] = ['class', 'background']

// ---------------------------------------------------------------------------
// Ability scores (Phase 3) -- state only; all logic is in the pure modules.
// ---------------------------------------------------------------------------

const abilityAssignment = computed(() => activeAssignment(draft))
const abilityScores = computed(() => draftAbilityScores(draft))

function chooseAbilityMethod(method: AbilityScoreMethod) {
  switchAbilityMethod(draft, method)
}

function setAbility(key: AbilityKey, value: number | null) {
  draft.abilities.byMethod[draft.abilities.method][key] = value
}

// ---------------------------------------------------------------------------
// Proficiencies -- state only; every rule lives in the pure module.
// ---------------------------------------------------------------------------

// Prompts and option labels for the World's active Rules Package. A World
// with no package activated returns `available: false`, and the step simply
// shows nothing to answer -- the Builder stays usable either way.
const { data: choiceOptions } = await useFetch<{
  available: boolean
  choiceSets?: Record<string, { prompt: string; label?: string; distinct?: boolean; maxPerOption?: number; writesToIfAlreadyActive?: string; contentCategory?: string; contentFilter?: { category: string; variants?: readonly string[] } }>
  optionLabels?: Record<string, string>
  // LANGUAGE CORPUS + POLICY PHASE -- the active package's own package-wide creation facts/
  // choices, relayed verbatim (see server/utils/world-rules-choice-options.ts).
  universalCreation?: { grants?: { set: string; to: boolean | number | string }[]; choices?: { choiceSet: string; count: number; from?: string[]; requiresActive?: (string | null)[] }[] }
}>(() => `/api/worlds/${worldId.value}/rules/choice-options`)

// CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- PLAYER-FACING LABELS.
// `choiceOptionLabelOverrides` only ever REPLACES an option whose own
// authored label is internal plumbing (Magic Initiate's own "List 1/2/3"
// gates) with the real class-list name the SAME facet already declares
// structurally -- see that function's own header. Spread order matters:
// the override wins only where it has an answer.
const optionLabels = computed(() => ({
  ...(choiceOptions.value?.optionLabels ?? {}),
  ...choiceOptionLabelOverrides(draft, creationContext.value)
}))

// PHASE 2C.2B -- the one creation context the Builder judges against: which
// choice sets are CONTENT-backed (the package's own declaration, echoed by the
// choice-options endpoint) and the World's catalogue feats. Presentation only:
// the server re-derives every decision from the same package and catalogue.
const creationContext = computed<BuilderCreationContext>(() => {
  const sets = choiceOptions.value?.choiceSets ?? {}
  return {
    contentSelectorOf: (choiceSetId) => {
      const set = sets[choiceSetId]
      return set?.contentCategory ? { category: set.contentCategory, filter: set.contentFilter } : null
    },
    // P7 -- the package's own distinctness and per-option ceiling, the same rule the server applies.
    // CHARACTER MECHANICS PHASE A5 -- relayed so the Builder judges Keen Mind's/Observant's
    // own conditional-output choice by the same exemption the server applies.
    choiceSetRule: (choiceSetId) => {
      const set = sets[choiceSetId]
      return set ? { distinct: set.distinct, maxPerOption: set.maxPerOption, writesToIfAlreadyActive: set.writesToIfAlreadyActive } : null
    },
    feats: catalogue.value?.feats ?? [],
    // D&D 2024 Character Rules P2 -- already fetched (the same /catalogue response), just threaded
    // through now so a future real 'spells' choice needs no new wiring here.
    spells: catalogue.value?.spells ?? [],
    // D&D 2024 Character Rules P8B -- already fetched (the same /catalogue response); threaded
    // through for equipment-grant title resolution.
    items: catalogue.value?.items ?? [],
    // LANGUAGE CORPUS + POLICY PHASE -- relayed verbatim from the SAME choice-options response,
    // so the Builder's own 'universal' slot (characterBuilderSelection.ts's own
    // creationChoicePresentation) matches the real server's identical construction.
    universalFacet: choiceOptions.value?.universalCreation ?? null
  }
})

const proficiencyChoices = computed(() => declaredChoices(draft, creationContext.value))

// The content (ContentRef) choices the current selection declares, shaped for the
// same generic picker: options are encoded refs, labels are catalogue titles.
const contentPresentations = computed(() => creationContentPresentation(draft, creationContext.value))
const contentChoicePickers = computed(() => contentPresentations.value.map((presentation) => ({
  key: presentation.key,
  slot: presentation.slot,
  choiceSetId: presentation.choiceSetId,
  count: presentation.count,
  options: presentation.offered.filter((option) => option.eligible).map((option) => option.ref),
  distinct: true
})))
const contentOffered = computed(() => new Map(contentPresentations.value.map((presentation) => [
  presentation.key,
  presentation.offered.map((option) => ({ value: option.ref, eligible: option.eligible, reason: option.reason }))
])))
const contentLabels = computed(() => Object.fromEntries(
  contentPresentations.value.flatMap((presentation) => presentation.offered.map((option) => [option.ref, option.title]))
))
function contentSelectionsFor(key: string): string[] {
  return contentPresentations.value.find((presentation) => presentation.key === key)?.selected ?? []
}
function contentOfferedFor(key: string) {
  return contentOffered.value.get(key)
}
function chooseContentSelections(key: string, selected: string[]) {
  setContentChoiceSelections(draft, key, selected, creationContext.value)
}

// The same shared eligibility the save route applies, keyed for the picker:
// every offered option annotated, and the EFFECTIVE selection (never a stale
// illegal answer). Recomputes whenever Species/Class/Background or any
// proficiency answer changes -- no reload, no separate fetch.
const presentationByKey = computed(() => new Map(
  creationChoicePresentation(draft, creationContext.value).map((presentation) => [presentation.key, presentation])
))

function promptFor(choiceSetId: string): string {
  return choiceOptions.value?.choiceSets?.[choiceSetId]?.prompt || 'Choose your options.'
}

function selectionsFor(key: string): string[] {
  return presentationByKey.value.get(key)?.selected ?? []
}

function offeredFor(key: string) {
  return presentationByKey.value.get(key)?.offered
}

function chooseSelections(key: string, selected: string[]) {
  setChoiceSelections(draft, key, selected, creationContext.value)
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P3.3 -- Level-1 spell acquisition. One generic section
// per requirement the chosen Class's own facet declares (cantrips, prepared spells,
// Wizard's spellbook, ...) -- no eight-class branch, no hardcoded picker. Recomputes
// from `draft`/`creationContext` exactly like every other step, including Wizard's
// own spellbook -> prepared dependency: a tentative spellbook answer is already part
// of the SAME plan the prepared section reads, so no save/reload/prepare round trip.
const spellSections = computed(() => spellRequirementSections(draft, creationContext.value))

// CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- SPELL DISCOVERY. Every spell's own already-
// resolved presentation (level/school/casting time/range/duration/components/effect text --
// resolveDnd5ePresentation's own new 'spell' branch, content-presentation/dnd5e.ts), keyed by the
// SAME wire ref format spellRequirementSections' own option/selection values already use, so
// CharacterChoiceSetPicker's `optionDetails` lookup needs no second ref format. The catalogue's
// own `/catalogue` response already carries this -- no second fetch, no new server call.
const spellPresentationByRef = computed<Record<string, PresentationEntry | null>>(() => {
  const byRef: Record<string, PresentationEntry | null> = {}
  for (const entry of catalogue.value?.spells ?? []) {
    byRef[serializeContentRef({ packageId: entry.packageId, slug: entry.slug })] = entry.presentation ?? null
  }
  return byRef
})

function spellSelectionsFor(requirementId: string): string[] {
  return draft.spellSelections[requirementId] ?? []
}

function chooseSpellSelections(requirementId: string, selected: string[]) {
  setSpellSelections(draft, requirementId, selected)
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P8B -- starting equipment. One generic section per live
// startingEquipment choice the selected slots declare (today: class and background) -- no
// class/background-name branch, no bundle-id branch. Recomputes from `draft`/`creationContext`
// exactly like every other step, including cross-reference grants (Monk's artisan-or-instrument,
// the gaming-set backgrounds), which read the SAME `draft.choices.selections` the Proficiencies
// step already answers -- no save/reload round trip needed to see a resolved cross-reference item.
const equipmentSections = computed(() => equipmentChoiceSections(draft, creationContext.value))

function chooseEquipmentBundle(choiceId: string, bundleId: string) {
  setEquipmentSelection(draft, choiceId, bundleId)
}

// Changing Species/Class/Background changes which questions are asked, so
// answers to questions that are no longer asked are dropped immediately --
// see pruneChoices. Watching the three refs rather than pruning inside
// chooseOption keeps this true no matter how a selection changes. Immediate, so
// a draft that already holds an illegal answer is sanitised at presentation
// time too, not only after the next slot change.
watch(
  () => CHOICE_KEYS.map((key) => optionKey(draft[key])).join('|'),
  () => pruneChoices(draft, creationContext.value),
  { immediate: true }
)

const steps = computed(() =>
  STEP_KEYS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    complete: isStepComplete(draft, key, creationContext.value)
  }))
)

const complete = computed(() => isDraftComplete(draft, creationContext.value))
const outstanding = computed(() => missingRequirements(draft, creationContext.value))

// CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- NAVIGATION. "Stage N of Total" for the
// persistent top toolbar, below.
const activeStepPosition = computed(() => STEP_KEYS.indexOf(activeStep.value) + 1)

const summaryRows = computed(() =>
  CHOICE_KEYS.map((key) => ({
    key,
    label: STEP_LABELS[key],
    entry: draft[key]
  }))
)

// CINEMATIC REDESIGN (Milestone B1) -- the generic {key, label, title,
// sourceBook} shape CharacterPreviewPanel.vue reads; `summaryRows` already
// carries everything this needs, restated here only because the preview
// panel is deliberately typed against no Builder-specific shape at all
// (see that component's own header -- B2's Level-Up Wizard previews an
// EXISTING character, never this draft).
const previewRows = computed(() =>
  summaryRows.value.map((row) => ({
    key: row.key,
    label: row.label,
    title: row.entry?.title ?? null,
    sourceBook: row.entry?.sourceBook
  }))
)

function goTo(step: BuilderStepKey) {
  activeStep.value = step
}

function goNext() {
  const next = nextStep(activeStep.value)
  if (next) activeStep.value = next
}

function goBack() {
  const previous = previousStep(activeStep.value)
  if (previous) activeStep.value = previous
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const creating = ref(false)
const createErrorMessage = ref('')

async function createCharacter() {
  const payload = toCreatePayload(draft, creationContext.value)
  if (!payload || creating.value) return

  creating.value = true
  createErrorMessage.value = ''

  try {
    const created = await $fetch<{ id?: string | number }>(
      `/api/worlds/${worldId.value}/characters/create-v2`,
      { method: 'POST', body: payload }
    )

    if (created?.id) {
      await navigateTo(`/worlds/${worldId.value}/characters/${created.id}/sheet`)
    } else {
      await navigateTo(`/worlds/${worldId.value}/characters`)
    }
  } catch (error: any) {
    createErrorMessage.value =
      error?.data?.statusMessage || error?.statusMessage || 'Failed to create character'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <!-- Atmospheric backdrop -- restrained, fixed, never competing with the
         choices themselves (this task's own "restrained transitions and
         motion" direction). -->
    <div
      aria-hidden="true"
      class="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(120%_60%_at_50%_-10%,rgb(var(--eldra-accent-rgb)/0.10),transparent_60%)]"
    />

    <div
      class="mx-auto px-4 pb-32 pt-8 sm:px-6"
      :class="compact ? 'max-w-2xl' : 'max-w-7xl pb-16'"
    >
      <div class="eldra-kicker text-xs">
        Character Builder
      </div>
      <h1 class="eldra-title mt-2 font-serif text-2xl font-semibold sm:text-3xl">
        Create Character
      </h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-eldra-text-soft">
        Choose a Species, Class, and Background from this World's bound Content Packs.
      </p>

      <!-- States ---------------------------------------------------------- -->
      <div
        v-if="catalogueLoading"
        class="mt-8 text-sm text-eldra-text-faint"
      >
        Loading the World's Content Catalogue…
      </div>

      <div
        v-else-if="catalogueError"
        class="mt-8 rounded-none border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
      >
        Could not load this World's Content Catalogue. Try again shortly.
      </div>

      <div
        v-else-if="catalogueIsEmpty"
        class="mt-8 rounded-none border border-eldra-accent/24 bg-eldra-panel/72 p-4 text-sm text-eldra-text-soft"
      >
        <template v-if="!hasAnyBoundPack">
          This World has no Content Packs bound yet. Bind one from Game Admin before creating a character.
        </template>
        <template v-else>
          This World's bound Content Packs contain no Species, Classes, or Backgrounds yet.
        </template>
      </div>

      <!-- ================================================================ -->
      <!-- CINEMATIC COMPOSITION -- three regions, one shared stage content.
           `compact` (see this file's own header for the exact heuristic)
           changes ONLY arrangement: a vertical Region A rail beside a
           sticky Region B preview on desktop/tablet becomes a horizontal
           rail above a compact preview strip on a phone, and the inline
           Back/Next buttons become a thumb-reach sticky bar -- never a
           change in which stage, choice, or control exists. See this
           file's own header on why nothing is ever gated by layout. -->
      <!-- ================================================================ -->
      <template v-else>
        <!-- CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- NAVIGATION. A PERSISTENT top
             toolbar, sticky to this page's own scroll container -- Back/Next/Create are
             reachable the instant a stage opens, never after scrolling past a long
             description first (the real reported problem with the previous bottom-only
             placement on desktop/tablet). Replaces both the old inline desktop buttons and
             the old phone-only fixed bottom bar -- one control, one place, every viewport. -->
        <div class="sticky top-0 z-30 -mx-4 mb-6 flex items-center justify-between gap-3 border-b border-eldra-accent/24 bg-eldra-ink/92 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
          <button
            type="button"
            class="min-h-11 shrink-0 rounded-none border border-eldra-accent/24 px-4 text-sm font-semibold text-eldra-text-soft disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
            :disabled="!previousStep(activeStep)"
            @click="goBack"
          >
            Back
          </button>

          <p class="min-w-0 truncate text-center text-xs uppercase tracking-[0.14em] text-eldra-text-faint">
            Stage {{ activeStepPosition }} of {{ steps.length }} · <span class="text-eldra-text-soft">{{ STEP_LABELS[activeStep] }}</span>
          </p>

          <button
            v-if="activeStep !== 'review'"
            type="button"
            class="eldra-button min-h-11 shrink-0 rounded-none px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
            @click="goNext"
          >
            Next
          </button>
          <button
            v-else
            type="button"
            class="eldra-button min-h-11 shrink-0 rounded-none px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
            :disabled="!complete || creating"
            @click="createCharacter"
          >
            {{ creating ? 'Creating…' : 'Create Character' }}
          </button>
        </div>

        <div
          class="mt-6"
          :class="compact ? 'flex flex-col gap-4' : 'grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_21rem] lg:items-start'"
        >
          <!-- Region A: Navigation / Progress ---------------------------- -->
          <aside :class="compact ? '' : 'lg:order-1'">
            <CreationStageRail
              :stages="steps"
              :active-key="activeStep"
              :vertical="!compact"
              @select="(key: string) => goTo(key as BuilderStepKey)"
            />
          </aside>

          <!-- Region B: Character Preview --------------------------------- -->
          <aside :class="compact ? '' : 'lg:order-3 lg:sticky lg:top-8'">
            <CharacterPreviewPanel
              :name="draft.name"
              :rows="previewRows"
              :compact="compact"
            />

            <!-- Desktop/tablet's extra room shows the ability summary
                 continuously -- a phone reaches the identical summary on
                 its own Review stage instead (Region C below). Back/Next/
                 Create live in the persistent top toolbar now (every
                 viewport), so this panel stays focused on readability:
                 clean ability scores, and incomplete requirements kept
                 COMPACT and expandable rather than a growing list. -->
            <div
              v-if="!compact"
              class="eldra-ornate-panel eldra-frame-corners mt-4 rounded-none border border-eldra-accent/24 bg-eldra-panel/64 p-4 backdrop-blur"
            >
              <div class="mb-2 text-xs uppercase tracking-[0.2em] text-eldra-text-ghost">
                {{ STEP_LABELS.abilities }}
              </div>
              <CharacterAbilityScoresPanel
                :scores="abilityScores"
                empty-message="Not assigned yet."
              />

              <CreationValidationBanner
                :messages="outstanding"
                :error-message="createErrorMessage"
                compact
                class="mt-4"
              />

              <NuxtLink
                :to="`/worlds/${worldId}/characters`"
                class="eldra-arcane-link mt-3 inline-block text-sm text-eldra-text-faint"
              >
                Cancel
              </NuxtLink>
            </div>
          </aside>

          <!-- Region C: Choices / Details ---------------------------------- -->
          <main class="min-w-0 lg:order-2">
            <section>
              <!-- CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- IDENTITY. Name AND Species,
                   one stage: the reported problem was a near-empty "just type a name" screen
                   with the single most visually rich choice in the whole Builder stranded on
                   its own separate stage right after it. -->
              <div v-if="activeStep === 'identity'">
                <label
                  for="character-name"
                  class="mb-2 block text-sm font-semibold text-eldra-text-soft"
                >Character Name</label>
                <input
                  id="character-name"
                  v-model="draft.name"
                  type="text"
                  autocomplete="off"
                  placeholder="Character name"
                  class="eldra-input min-h-12 w-full max-w-md rounded-none px-4 py-3 text-base"
                >

                <h2 class="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-eldra-accent-text">
                  Species
                </h2>
                <CharacterBuilderOptionPicker
                  label="Species"
                  name="builder-species"
                  :options="optionsFor.species"
                  :model-value="selectedKeys.species"
                  :compact="compact"
                  @update:model-value="(value: string) => chooseOption('species', value)"
                />

                <!-- Prominent species artwork/description, updating reactively as the
                     selection changes -- the SAME component, same models the Character
                     Sheet renders. -->
                <div class="mt-5">
                  <CreationDetailPanel title="About this Species">
                    <ContentPresentationPanel
                      v-if="draft.species"
                      :entry="draft.species?.presentation"
                      context="preview"
                      collapse-first-section
                      empty-message="This Content Pack publishes no further details for this species."
                    />
                    <p
                      v-else
                      class="text-sm text-eldra-text-faint"
                    >
                      Choose a species above to see what it is and what it grants.
                    </p>
                  </CreationDetailPanel>
                </div>
              </div>

              <div
                v-for="key in STAGE_PICKER_KEYS"
                v-show="activeStep === key"
                :key="key"
              >
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-eldra-accent-text">
                  {{ STEP_LABELS[key] }}
                </h2>
                <CharacterBuilderOptionPicker
                  :label="STEP_LABELS[key]"
                  :name="`builder-${key}`"
                  :options="optionsFor[key]"
                  :model-value="selectedKeys[key]"
                  :compact="compact"
                  @update:model-value="(value: string) => chooseOption(key, value)"
                />

                <!-- Live preview: the selected option, explained in place.
                     Same component, same models the Character Sheet renders. -->
                <div class="mt-5">
                  <CreationDetailPanel :title="`About this ${STEP_LABELS[key]}`">
                    <ContentPresentationPanel
                      v-if="draft[key]"
                      :entry="draft[key]?.presentation"
                      context="preview"
                      collapse-first-section
                      :empty-message="`This Content Pack publishes no further details for this ${STEP_LABELS[key].toLowerCase()}.`"
                    />
                    <p
                      v-else
                      class="text-sm text-eldra-text-faint"
                    >
                      Choose a {{ STEP_LABELS[key].toLowerCase() }} above to see what it is and what it grants.
                    </p>
                  </CreationDetailPanel>
                </div>
              </div>

              <div v-if="activeStep === 'proficiencies'">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-eldra-accent-text">
                  {{ STEP_LABELS.proficiencies }}
                </h2>
                <p
                  v-if="!proficiencyChoices.length && !contentChoicePickers.length"
                  class="text-sm leading-6 text-eldra-text-faint"
                >
                  The Species, Class, and Background you chose ask no proficiency
                  questions, so there is nothing to answer here.
                </p>

                <div
                  v-else
                  class="grid gap-6"
                >
                  <CharacterChoiceSetPicker
                    v-for="choice in proficiencyChoices"
                    :key="choice.key"
                    :choice="choice"
                    :selected="selectionsFor(choice.key)"
                    :offered="offeredFor(choice.key)"
                    :prompt="promptFor(choice.choiceSetId)"
                    :option-labels="optionLabels"
                    :slot-label="STEP_LABELS[choice.slot as BuilderChoiceKey]"
                    @update:selected="(value: string[]) => chooseSelections(choice.key, value)"
                  />
                  <CharacterChoiceSetPicker
                    v-for="choice in contentChoicePickers"
                    :key="choice.key"
                    :choice="choice"
                    :selected="contentSelectionsFor(choice.key)"
                    :offered="contentOfferedFor(choice.key)"
                    :prompt="promptFor(choice.choiceSetId)"
                    :option-labels="contentLabels"
                    :slot-label="STEP_LABELS[choice.slot as BuilderChoiceKey]"
                    @update:selected="(value: string[]) => chooseContentSelections(choice.key, value)"
                  />
                </div>
              </div>

              <div v-if="activeStep === 'spells'">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-eldra-accent-text">
                  {{ STEP_LABELS.spells }}
                </h2>
                <p
                  v-if="!spellSections.length"
                  class="text-sm leading-6 text-eldra-text-faint"
                >
                  The Class you chose grants no spells at Level 1, so there is nothing to answer here.
                </p>

                <div
                  v-else
                  class="grid gap-6"
                >
                  <CharacterChoiceSetPicker
                    v-for="section in spellSections"
                    :key="section.requirementId"
                    :choice="section.choice"
                    :selected="spellSelectionsFor(section.requirementId)"
                    :option-labels="section.optionLabels"
                    :option-details="spellPresentationByRef"
                    :prompt="`Choose ${section.choice.count} ${section.label.toLowerCase()}`"
                    :slot-label="STEP_LABELS.class"
                    @update:selected="(value: string[]) => chooseSpellSelections(section.requirementId, value)"
                  />
                </div>
              </div>

              <div v-if="activeStep === 'equipment'">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-eldra-accent-text">
                  {{ STEP_LABELS.equipment }}
                </h2>
                <p
                  v-if="!equipmentSections.length"
                  class="text-sm leading-6 text-eldra-text-faint"
                >
                  The Species, Class, and Background you chose declare no starting-equipment choice,
                  so there is nothing to answer here.
                </p>

                <div
                  v-else
                  class="grid gap-6"
                >
                  <fieldset
                    v-for="section in equipmentSections"
                    :key="section.choiceId"
                    class="min-w-0 border-0 p-0"
                  >
                    <legend class="mb-2 text-xs uppercase tracking-[0.2em] text-eldra-text-ghost">
                      {{ STEP_LABELS[section.slot] }} starting equipment
                    </legend>
                    <div class="grid gap-2">
                      <label
                        v-for="bundle in section.bundles"
                        :key="bundle.id"
                        class="group relative flex min-h-14 items-start gap-3 rounded-none border px-4 py-3 transition cursor-pointer"
                        :class="section.selectedBundleId === bundle.id
                          ? 'border-eldra-accent/62 bg-eldra-accent/16'
                          : 'border-eldra-accent/20 bg-eldra-panel/55 hover:border-eldra-accent/42 hover:bg-eldra-accent/8'"
                      >
                        <input
                          :name="`equipment-${section.choiceId}`"
                          type="radio"
                          class="peer sr-only"
                          :value="bundle.id"
                          :checked="section.selectedBundleId === bundle.id"
                          @change="chooseEquipmentBundle(section.choiceId, bundle.id)"
                        >
                        <span
                          aria-hidden="true"
                          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition"
                          :class="section.selectedBundleId === bundle.id
                            ? 'border-eldra-accent-bright bg-eldra-accent-bright'
                            : 'border-eldra-accent/35'"
                        >
                          <span
                            v-if="section.selectedBundleId === bundle.id"
                            class="h-2 w-2 rounded-full bg-eldra-ink"
                          />
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="block text-base font-semibold text-eldra-text-strong">{{ bundle.label }}</span>
                          <span class="mt-0.5 block text-xs text-eldra-text-faint">{{ bundle.summary }}</span>
                        </span>
                        <span
                          aria-hidden="true"
                          class="pointer-events-none absolute inset-0 ring-2 ring-transparent peer-focus-visible:ring-eldra-accent/65"
                        />
                      </label>
                    </div>
                  </fieldset>
                </div>
              </div>

              <div v-if="activeStep === 'abilities'">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-eldra-accent-text">
                  {{ STEP_LABELS.abilities }}
                </h2>
                <CharacterAbilityScoreEditor
                  :method="draft.abilities.method"
                  :assignment="abilityAssignment"
                  @update:method="chooseAbilityMethod"
                  @update:ability="setAbility"
                />
              </div>

              <div v-if="activeStep === 'review'">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-eldra-accent-text">
                  Review
                </h2>

                <!-- Desktop/tablet already shows the ability summary and
                     Create action continuously in Region B -- a phone
                     reaches them here instead, on its own Review stage. -->
                <div
                  v-if="compact"
                  class="mb-5 rounded-none border border-eldra-accent/20 bg-eldra-panel/55 p-3"
                >
                  <div class="mb-2 text-xs uppercase tracking-[0.2em] text-eldra-text-ghost">
                    {{ STEP_LABELS.abilities }}
                  </div>
                  <CharacterAbilityScoresPanel
                    :scores="abilityScores"
                    empty-message="Not assigned yet."
                  />
                </div>

                <!-- Everything chosen, explained, one last time before the
                     Create button is reachable. -->
                <div class="grid gap-4">
                  <div
                    v-for="row in summaryRows"
                    :key="`review-${row.key}`"
                  >
                    <CreationDetailPanel :title="row.label">
                      <ContentPresentationPanel
                        v-if="row.entry"
                        :entry="row.entry.presentation"
                        context="preview"
                        collapse-first-section
                        :empty-message="`This Content Pack publishes no further details for this ${row.label.toLowerCase()}.`"
                      />
                      <p
                        v-else
                        class="text-sm text-eldra-text-faint"
                      >
                        No {{ row.label.toLowerCase() }} chosen yet.
                      </p>
                    </CreationDetailPanel>
                  </div>
                </div>

                <!-- CINEMATIC CREATOR REFINEMENT (Milestone B1.1) -- NAVIGATION. Back/Next/
                     Create itself now live in the persistent top toolbar (every viewport) --
                     this stays the Review stage's own validation feedback, moved up from the
                     old bottom bar it used to share a home with. -->
                <CreationValidationBanner
                  :messages="outstanding"
                  :error-message="createErrorMessage"
                  class="mt-5"
                />
              </div>
            </section>
          </main>
        </div>
      </template>
    </div>
  </div>
</template>
