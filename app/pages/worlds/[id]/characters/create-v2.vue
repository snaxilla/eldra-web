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
// CHARACTER CREATOR V3 -- CINEMATIC PRESENTATION
// ---------------------------------------------------------------------------
// V3 re-composes this page as a full-bleed stage: a dynamic backdrop
// (CreatorBackdrop, fed by creator-presentation.ts's documented precedence),
// a collapsed icon rail for stage navigation, a hero for the selected content,
// and compact portrait rosters for the choices. It is PRESENTATION ONLY -- the
// draft, every characterBuilderSelection.ts function, every API call and the
// create payload below are unchanged, and no rule is evaluated here.
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
//   (V3: `compact` is now width-only -- see the `compact` computed below -- so a
//   landscape tablet gets the cinematic composition with touch-sized controls.)
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
// V3 NOTE ON THE BREAKPOINT: the Character Sheet's heuristic (width < 768, or a
// coarse pointer at <= 1366) would put every tablet, landscape included, on the
// stacked phone layout and hide the cinematic composition from the devices this
// milestone targets first. The creator therefore switches on width alone
// (< 900px) and keeps every control at touch size (>= 44px) at ALL widths, so a
// touch tablet still gets large targets without losing the composition.
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
import CreatorBackdrop from '~/components/characters/builder/CreatorBackdrop.vue'
import CreationHero from '~/components/characters/builder/CreationHero.vue'
import CreationEquipmentChoices from '~/components/characters/builder/CreationEquipmentChoices.vue'
import {
  resolveCreatorBackdrop,
  resolveCreatorTransition,
  stageHeroKind,
  type CreatorSelection
} from '~/lib/characters/creator-presentation'
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

function updateViewport() {
  if (!import.meta.client) return
  viewportWidth.value = window.innerWidth || 0
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
  return width < 900
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

// ---------------------------------------------------------------------------
// V3 presentation state -- backdrop resolution and stage furniture. Reads the
// draft; writes nothing to it.
// ---------------------------------------------------------------------------

const { config: presentationConfig } = useCreatorPresentation()

function artOf(entry: BuilderCatalogueEntry | null | undefined) {
  return entry ? { slug: entry.slug, imageUrl: entry.presentation?.image?.url ?? null } : null
}
const selectionArt = computed<CreatorSelection>(() => ({
  species: artOf(draft.species),
  class: artOf(draft.class),
  background: artOf(draft.background)
}))

// An artwork URL the browser could not load is remembered, so the resolver
// degrades to the next tier instead of leaving a blank stage.
const failedBackdropUrls = ref<ReadonlySet<string>>(new Set())
function onBackdropFailed(url: string) {
  failedBackdropUrls.value = new Set([...failedBackdropUrls.value, url])
}

const backdrop = computed(() =>
  resolveCreatorBackdrop(presentationConfig.value, activeStep.value, selectionArt.value, {
    failedUrls: failedBackdropUrls.value
  })
)
const transition = computed(() => resolveCreatorTransition(presentationConfig.value))

// The hero's content for the current stage, and whether its art is already the
// backdrop (then the hero shows no second copy of it).
const heroKind = computed(() => stageHeroKind(activeStep.value))
const heroEntry = computed(() => draft[heroKind.value])
const heroFigureUrl = computed(() => {
  const url = heroEntry.value?.presentation?.image?.url ?? null
  return url && url !== backdrop.value.image ? url : null
})
// The species' art is the character's portrait on every stage.
const portraitUrl = computed(() => draft.species?.presentation?.image?.url ?? null)

const STAGE_ICONS: Record<BuilderStepKey, string> = {
  identity: 'i-lucide-user',
  species: 'i-lucide-user',
  class: 'i-lucide-swords',
  background: 'i-lucide-scroll-text',
  proficiencies: 'i-lucide-graduation-cap',
  spells: 'i-lucide-wand-sparkles',
  equipment: 'i-lucide-backpack',
  abilities: 'i-lucide-dices',
  review: 'i-lucide-clipboard-check'
}
const STAGE_BLURBS: Partial<Record<BuilderStepKey, string>> = {
  proficiencies: 'The skills and training your choices grant. Pick what you want to be good at.',
  spells: 'The magic you begin with. Read any spell without choosing it; tick the ones you want.',
  equipment: 'What you carry as you set out. Choose one package for each source.',
  abilities: 'The six scores that shape everything your character attempts.',
  review: 'Everything you chose, one last time, before your story begins.'
}

const stageNav = computed(() => steps.value.map((step) => ({ ...step, icon: STAGE_ICONS[step.key] })))

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
  <!-- CHARACTER CREATOR V3 -- one full-bleed stage. The backdrop sits behind
       everything; the rail, toolbar and stage content float over it as dark
       glass so the artwork is never covered by an opaque slab. -->
  <!-- `absolute inset-0` (the layout's slot wrapper is `relative`) rather than `h-full`: the
       layout is a grid whose auto row would otherwise grow to this page's content height and
       push the whole workspace taller than the viewport. -->
  <div class="absolute inset-0 overflow-hidden bg-eldra-ink">
    <CreatorBackdrop
      :backdrop="backdrop"
      :stage="activeStep"
      :transition-ms="transition.durationMs"
      @failed="onBackdropFailed"
    />

    <div class="relative z-10 flex h-full min-w-0">
      <!-- Collapsed-by-default stage rail (desktop / tablet landscape). -->
      <CreationStageRail
        v-if="!compact && !catalogueLoading && !catalogueError && !catalogueIsEmpty"
        :stages="stageNav"
        :active-key="activeStep"
        variant="rail"
        @select="(key: string) => goTo(key as BuilderStepKey)"
      />

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <!-- ================= toolbar: title / progress / Back-Next ================ -->
        <header
          class="relative z-30 shrink-0 px-3 pb-2 pt-3 max-md:pl-14 sm:px-6"
        >
          <div class="flex items-center gap-3">
            <div class="hidden min-w-0 flex-1 xl:block">
              <h1 class="eldra-title font-serif text-2xl font-semibold leading-none text-eldra-text-strong [text-shadow:0_2px_18px_rgb(0_0_0/0.9)]">
                Create Your Character
              </h1>
              <p class="mt-1 truncate text-xs text-eldra-text-soft">
                Step into a world of adventure. Who are you?
              </p>
            </div>

            <template v-if="!catalogueLoading && !catalogueError && !catalogueIsEmpty">
              <div class="flex min-w-0 flex-1 items-center justify-between gap-2 xl:flex-none xl:justify-center xl:gap-3">
                <button
                  type="button"
                  class="inline-flex min-h-11 shrink-0 items-center gap-2 border border-eldra-accent/45 bg-eldra-ink/70 px-4 text-sm font-semibold text-eldra-text-soft backdrop-blur transition hover:border-eldra-accent-bright/70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
                  :disabled="!previousStep(activeStep)"
                  @click="goBack"
                >
                  <UIcon
                    name="i-lucide-arrow-left"
                    class="size-4"
                  />
                  Back
                </button>

                <!-- Progress: gilded track + node per stage, with the numbers in words. -->
                <div
                  v-if="!compact"
                  class="hidden min-w-0 flex-1 flex-col items-center gap-1.5 sm:flex xl:w-96 xl:flex-none"
                >
                  <p class="max-w-full truncate text-xs uppercase tracking-[0.16em] text-eldra-text-soft">
                    Step {{ activeStepPosition }} of {{ steps.length }}
                    <span class="text-eldra-text-faint">·</span>
                    <span class="font-semibold text-eldra-text-strong">{{ STEP_LABELS[activeStep] }}</span>
                  </p>
                  <div
                    aria-hidden="true"
                    class="flex w-full items-center"
                  >
                    <template
                      v-for="(step, index) in steps"
                      :key="step.key"
                    >
                      <span
                        v-if="index > 0"
                        class="h-px flex-1"
                        :class="index <= STEP_KEYS.indexOf(activeStep) ? 'bg-eldra-accent/70' : 'bg-eldra-accent/20'"
                      />
                      <span
                        class="size-2 shrink-0 rotate-45 border transition-colors"
                        :class="step.key === activeStep
                          ? 'scale-125 border-eldra-accent-bright bg-eldra-accent-bright'
                          : step.complete ? 'border-eldra-accent bg-eldra-accent/80' : 'border-eldra-accent/40 bg-transparent'"
                      />
                    </template>
                  </div>
                </div>

                <button
                  v-if="activeStep !== 'review'"
                  type="button"
                  class="eldra-button inline-flex min-h-11 shrink-0 items-center gap-2 rounded-none px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
                  @click="goNext"
                >
                  Next
                  <UIcon
                    name="i-lucide-arrow-right"
                    class="size-4"
                  />
                </button>
                <button
                  v-else
                  type="button"
                  class="eldra-button inline-flex min-h-11 shrink-0 items-center gap-2 rounded-none px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
                  :disabled="!complete || creating"
                  @click="createCharacter"
                >
                  {{ creating ? 'Creating…' : 'Create Character' }}
                </button>
              </div>
            </template>

            <div class="hidden flex-1 xl:block" />
          </div>

          <!-- Phone: compact stage indicator + expandable menu. -->
          <div
            v-if="compact && !catalogueLoading && !catalogueError && !catalogueIsEmpty"
            class="mt-2"
          >
            <CreationStageRail
              :stages="stageNav"
              :active-key="activeStep"
              variant="menu"
              @select="(key: string) => goTo(key as BuilderStepKey)"
            />
          </div>
        </header>

        <!-- ============================= stage content ============================= -->
        <div
          class="min-h-0 flex-1 overflow-y-auto px-3 pb-10 sm:px-6"
          :class="compact ? 'pt-2' : 'pt-4'"
        >
          <!-- States -->
          <div
            v-if="catalogueLoading"
            class="max-w-xl border border-eldra-accent/25 bg-eldra-ink/75 p-4 text-sm text-eldra-text-soft backdrop-blur-md"
          >
            Loading the World's Content Catalogue…
          </div>

          <div
            v-else-if="catalogueError"
            class="max-w-xl border border-red-900 bg-red-950/70 p-4 text-sm text-red-200 backdrop-blur-md"
          >
            Could not load this World's Content Catalogue. Try again shortly.
          </div>

          <div
            v-else-if="catalogueIsEmpty"
            class="max-w-xl border border-eldra-accent/25 bg-eldra-ink/75 p-4 text-sm text-eldra-text-soft backdrop-blur-md"
          >
            <template v-if="!hasAnyBoundPack">
              This World has no Content Packs bound yet. Bind one from Game Admin before creating a character.
            </template>
            <template v-else>
              This World's bound Content Packs contain no Species, Classes, or Backgrounds yet.
            </template>
          </div>

          <template v-else>
            <div
              class="mx-auto flex min-h-full w-full max-w-[96rem] gap-6"
              :class="compact ? 'flex-col' : ''"
            >
              <div class="flex min-h-full min-w-0 flex-1 flex-col">
                <!-- Phone: leave the top of the frame to the artwork. -->
                <div
                  v-if="compact && ['identity', 'class', 'background'].includes(activeStep)"
                  aria-hidden="true"
                  class="h-[16vh] shrink-0"
                />

                <!-- ============ IDENTITY: name + species roster | species hero ============ -->
                <div
                  v-if="activeStep === 'identity'"
                  class="flex min-w-0 flex-1 gap-8"
                  :class="compact ? 'flex-col' : 'items-center'"
                >
                  <div
                    class="shrink-0"
                    :class="compact ? 'order-2 w-full' : 'w-64 xl:w-72'"
                  >
                    <label
                      for="character-name"
                      class="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-eldra-accent-text"
                    >Character Name</label>
                    <input
                      id="character-name"
                      v-model="draft.name"
                      type="text"
                      autocomplete="off"
                      placeholder="Name your character"
                      class="eldra-input mb-5 min-h-12 w-full rounded-none border-eldra-accent/45 bg-eldra-ink/70 px-4 py-3 font-serif text-lg backdrop-blur"
                    >
                    <h2 class="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-eldra-accent-text">
                      Species
                    </h2>
                    <div :class="compact ? '' : 'max-h-[calc(100dvh-20rem)] overflow-y-auto pr-1'">
                      <CharacterBuilderOptionPicker
                        label="Species"
                        name="builder-species"
                        variant="list"
                        :options="optionsFor.species"
                        :model-value="selectedKeys.species"
                        :compact="compact"
                        @update:model-value="(value: string) => chooseOption('species', value)"
                      />
                    </div>
                  </div>

                  <CreationHero
                    :class="compact ? 'order-1' : ''"
                    kicker="Species"
                    :entry="draft.species?.presentation"
                    empty-title="Who are you?"
                    empty-hint="Choose a species to see what it is and what it grants."
                    :figure-url="heroFigureUrl"
                  />
                </div>

                <!-- ============ BACKGROUND: roster | background hero ============ -->
                <div
                  v-else-if="activeStep === 'background'"
                  class="flex min-w-0 flex-1 gap-8"
                  :class="compact ? 'flex-col' : 'items-center'"
                >
                  <div
                    class="shrink-0"
                    :class="compact ? 'order-2 w-full' : 'w-64 xl:w-72'"
                  >
                    <h2 class="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-eldra-accent-text">
                      Background
                    </h2>
                    <div :class="compact ? '' : 'max-h-[calc(100dvh-14rem)] overflow-y-auto pr-1'">
                      <CharacterBuilderOptionPicker
                        label="Background"
                        name="builder-background"
                        variant="list"
                        :options="optionsFor.background"
                        :model-value="selectedKeys.background"
                        :compact="compact"
                        @update:model-value="(value: string) => chooseOption('background', value)"
                      />
                    </div>
                  </div>

                  <CreationHero
                    :class="compact ? 'order-1' : ''"
                    kicker="Background"
                    :entry="draft.background?.presentation"
                    empty-title="Where do you come from?"
                    empty-hint="Choose a background to see the life you led before adventuring."
                    :figure-url="heroFigureUrl"
                  />
                </div>

                <!-- ============ CLASS: hero over art | medallion strip along the bottom ============ -->
                <!-- `min-h-0` on this step and the hero wrapper below (Character Creator V3
                     scroll/navigation repair): both are flex-COLUMN children with `flex-1` but no
                     declared height floor, so without it their default `min-height: auto` refuses
                     to shrink below the hero's own intrinsic content size -- the same flexbox
                     behaviour already guarded against one level up, at this step's own ancestor
                     (the `min-h-0` on the `flex flex-col` column a few lines above). The outer
                     stage-content region (`overflow-y-auto`, a few lines above that) already makes
                     any overflow here reachable by scrolling regardless, but leaving these two
                     items without `min-h-0` is the one place in this file that pattern wasn't
                     applied -- fixed defensively, not because a specific overflow was proven. -->
                <div
                  v-else-if="activeStep === 'class'"
                  class="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  <div class="flex min-h-0 flex-1 items-center py-4">
                    <CreationHero
                      kicker="Class"
                      :entry="draft.class?.presentation"
                      empty-title="What is your calling?"
                      empty-hint="Choose a class to see how it plays and what it grants."
                      :figure-url="heroFigureUrl"
                    />
                  </div>
                  <div class="mt-4 shrink-0 border-t border-eldra-accent/25 bg-eldra-ink/60 px-2 pt-3 backdrop-blur-md">
                    <h2 class="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-eldra-accent-text">
                      Class
                    </h2>
                    <CharacterBuilderOptionPicker
                      label="Class"
                      name="builder-class"
                      variant="strip"
                      :options="optionsFor.class"
                      :model-value="selectedKeys.class"
                      :compact="compact"
                      @update:model-value="(value: string) => chooseOption('class', value)"
                    />
                  </div>
                </div>

                <!-- ============ Every other stage: a header, then a dark-glass work area ============ -->
                <div
                  v-else
                  class="min-w-0 max-w-5xl py-2"
                >
                  <p class="eldra-kicker text-xs tracking-[0.34em]">
                    Step {{ activeStepPosition }} of {{ steps.length }}
                  </p>
                  <h2 class="mt-1 font-serif text-4xl font-semibold leading-[1.05] text-eldra-text-strong [text-shadow:0_2px_24px_rgb(0_0_0/0.85)] sm:text-5xl">
                    {{ STEP_LABELS[activeStep] }}
                  </h2>
                  <p class="mt-2 max-w-xl text-sm leading-6 text-eldra-text-soft [text-shadow:0_1px_12px_rgb(0_0_0/0.9)]">
                    {{ STAGE_BLURBS[activeStep] }}
                  </p>

                  <div class="mt-5 border border-eldra-accent/25 bg-eldra-ink/72 p-4 backdrop-blur-md sm:p-6">
                    <!-- Proficiencies -->
                    <div v-if="activeStep === 'proficiencies'">
                      <p
                        v-if="!proficiencyChoices.length && !contentChoicePickers.length"
                        class="text-sm leading-6 text-eldra-text-soft"
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

                    <!-- Spells: a roster beside a persistent inspector. -->
                    <div v-else-if="activeStep === 'spells'">
                      <p
                        v-if="!spellSections.length"
                        class="text-sm leading-6 text-eldra-text-soft"
                      >
                        The Class you chose grants no spells at Level 1, so there is nothing to answer here.
                      </p>

                      <div
                        v-else
                        class="grid gap-8"
                      >
                        <CharacterChoiceSetPicker
                          v-for="section in spellSections"
                          :key="section.requirementId"
                          layout="inspector"
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

                    <!-- Equipment: kit cards. -->
                    <div v-else-if="activeStep === 'equipment'">
                      <p
                        v-if="!equipmentSections.length"
                        class="text-sm leading-6 text-eldra-text-soft"
                      >
                        The Species, Class, and Background you chose declare no starting-equipment choice,
                        so there is nothing to answer here.
                      </p>
                      <CreationEquipmentChoices
                        v-else
                        :sections="equipmentSections"
                        :slot-labels="STEP_LABELS"
                        @select="chooseEquipmentBundle"
                      />
                    </div>

                    <!-- Ability scores -->
                    <div v-else-if="activeStep === 'abilities'">
                      <CharacterAbilityScoreEditor
                        :method="draft.abilities.method"
                        :assignment="abilityAssignment"
                        @update:method="chooseAbilityMethod"
                        @update:ability="setAbility"
                      />
                    </div>

                    <!-- Review -->
                    <div v-else-if="activeStep === 'review'">
                      <!-- Wide layouts show the ability summary continuously in the side
                           panel; narrower ones reach it here. -->
                      <div class="mb-5 xl:hidden">
                        <div class="mb-2 text-xs uppercase tracking-[0.2em] text-eldra-text-faint">
                          {{ STEP_LABELS.abilities }}
                        </div>
                        <CharacterAbilityScoresPanel
                          :scores="abilityScores"
                          empty-message="Not assigned yet."
                        />
                      </div>

                      <div class="grid gap-4 lg:grid-cols-3">
                        <CreationDetailPanel
                          v-for="row in summaryRows"
                          :key="`review-${row.key}`"
                          :title="row.label"
                        >
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

                      <CreationValidationBanner
                        :messages="outstanding"
                        :error-message="createErrorMessage"
                        class="mt-5"
                      />
                    </div>
                  </div>
                </div>

                <!-- Below xl the side panel is hidden: keep "who am I building" as a slim strip. -->
                <div class="mt-5 xl:hidden">
                  <CharacterPreviewPanel
                    :name="draft.name"
                    :rows="previewRows"
                    :image-url="portraitUrl"
                    compact
                  />
                  <CreationValidationBanner
                    v-if="activeStep !== 'review' && createErrorMessage"
                    :messages="[]"
                    :error-message="createErrorMessage"
                    compact
                    class="mt-3"
                  />
                </div>
              </div>

              <!-- ======= "Your Character" side panel (wide screens) ======= -->
              <!-- Character Creator V3 scroll/navigation repair: `xl:max-h-screen xl:overflow-y-auto`
                   added alongside the existing `xl:sticky xl:top-0` so this panel is reachable on
                   its OWN terms -- the surrounding flex row already grows tall enough to keep the
                   panel from clipping (its row height is the max of its children, this panel
                   included), but that guarantee was incidental to the current content, not
                   declared. A panel this tall at a short viewport now scrolls within itself once
                   stuck, rather than depending on the sibling column staying at least as tall. -->
              <aside
                v-if="!compact"
                class="hidden w-72 shrink-0 self-start xl:sticky xl:top-0 xl:block xl:max-h-screen xl:overflow-y-auto"
              >
                <CharacterPreviewPanel
                  :name="draft.name"
                  :rows="previewRows"
                  :image-url="portraitUrl"
                />

                <div class="mt-3 border border-eldra-accent/25 bg-eldra-ink/72 p-4 backdrop-blur-md">
                  <div class="mb-2 text-xs uppercase tracking-[0.2em] text-eldra-text-faint">
                    {{ STEP_LABELS.abilities }}
                  </div>
                  <CharacterAbilityScoresPanel
                    :scores="abilityScores"
                    empty-message="Not assigned yet."
                  />

                  <CreationValidationBanner
                    v-if="activeStep !== 'review' || createErrorMessage"
                    :messages="activeStep === 'review' ? [] : outstanding"
                    :error-message="createErrorMessage"
                    compact
                    class="mt-4"
                  />

                  <NuxtLink
                    :to="`/worlds/${worldId}/characters`"
                    class="eldra-arcane-link mt-3 inline-block min-h-11 text-sm leading-[2.75rem] text-eldra-text-faint"
                  >
                    Cancel
                  </NuxtLink>
                </div>
              </aside>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
