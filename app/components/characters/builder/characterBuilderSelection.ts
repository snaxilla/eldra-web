// Pure selection/validation helpers behind Character Builder V2
// (app/pages/worlds/[id]/characters/create-v2.vue and
// CharacterBuilderOptionPicker.vue).
//
// Extracted rather than left inline for the same reason
// app/components/admin/content-packs/contentPackBuilderSelection.ts was:
// this repo has no DOM test environment (vitest.config.ts is
// `environment: 'node'`), so component logic is only testable when it lives
// in a plain module beside the component. Everything here is pure -- no
// I/O, no Vue, no DOM -- and is unit-tested in
// tests/components/characters/builder/characterBuilderSelection.test.ts.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. IDENTITY IS THE COMPOSITE (packageId, slug), NEVER slug ALONE.
//    server/api/worlds/[id]/characters/create-v2.post.ts's own
//    `findInCatalogue` matches on exactly that pair, and the catalogue can
//    legitimately contain the same slug from two different packs (a World
//    with both SRD 5.1 and XPHB bound has two "Human" species, two
//    "Fighter" classes). Matching on slug alone -- which the previous
//    Builder did -- can silently resolve to the wrong pack's entry. Every
//    lookup here goes through `optionKey`.
//
// 2. WHAT AN OPTION CAN SHOW IS BOUNDED BY THE CATALOGUE, NOT BY TASTE.
//    ContentCatalogueEntry carried identity + provenance ONLY through Phase
//    1 -- no description, no trait list, nothing to teach a player what an
//    option was. Phase 2 changed that: species/class/background entries now
//    also carry a resolved `presentation` model
//    (app/lib/content-presentation), and the Builder renders it beside the
//    picker so a choice can be understood before it is made.
//
//    The rule itself is unchanged, and still binding: an option shows what
//    the CATALOGUE publishes and nothing else. Nothing here fabricates a
//    description, and nothing here reads a 5etools field -- the resolver
//    already turned `data` into `description`/`facts`/`sections` before this
//    module or the picker ever sees it.
//
//    `searchText` deliberately still indexes only title/sourceBook/packageId.
//    Full-text search across trait prose would make "fire" match half of
//    every category and turn a precise picker into a fuzzy one; that is a
//    product decision to take deliberately, not a side effect of presentation
//    data becoming available.
//
// 3. THE SUBMIT PAYLOAD SENDS ONLY (packageId, slug). The save route reads
//    only those two fields off each choice and re-looks-up everything else
//    from its own catalogue copy, explicitly so a tampered client cannot
//    substitute a title or externalId. Sending more would imply the extra
//    fields are load-bearing when the server provably ignores them.

import type { PresentationEntry } from '~/lib/content-presentation'
import {
  defaultAssignmentForMethod,
  isCompleteForMethod,
  seedAssignmentForMethod,
  toAbilityScores,
  type AbilityScoreAssignment,
  type AbilityScoreMethod,
  type AbilityScores
} from '~/lib/characters/ability-scores'
import {
  resolveCreationChoices,
  type ChoiceSetRule,
  type CreationChoicePresentation,
  type CreationFacetInput,
  type CreationSlotInput
} from '~/lib/characters/creation-choice-eligibility'
import {
  declaredCreationContentChoices,
  resolveCreationContentChoices,
  type ContentChoiceSelector,
  type CreationContentPresentation,
  type CreationFeatEntry,
  type CreationItemEntry,
  type CreationSpellEntry
} from '~/lib/characters/creation-content-choices'
import {
  choiceKey,
  emptyStoredRulesChoices,
  selectionsFor,
  validateChoiceSelection,
  type ResolvableChoice,
  type StoredRulesChoices
} from '~/lib/characters/rules-choices'
import type { RulesFacet } from '~/lib/content-rules'
import { creationUnresolvedDecisions, decisionPhrase as sharedDecisionPhrase, type UnresolvedDecision } from '~/lib/content-rules/creation-completeness'
import { parseContentRef, serializeContentRef } from '~/lib/characters/progression-plan'
import {
  planSpellAcquisition,
  spellPoolLabel,
  type SpellAcquisitionPlan,
  type TentativeSpellSelection
} from '~/lib/characters/spell-acquisition-plan'
import type { EquipmentChoice, EquipmentGrant, SpellRequirementPoolKind } from '~/lib/content-rules/types'
import {
  findEquipmentBundle,
  resolveEquipmentBundle,
  type EquipmentBundleResolvers
} from '~/lib/characters/equipment-bundle'
import { DND5E_2024_EQUIPMENT_CROSS_REFERENCE_ITEM_SLUGS } from '~/lib/content-rules/dnd5e-2024'

// D&D 2024 Character Rules P3.4 -- re-exported, not redefined: the Level Manager
// (CharacterProgressionPanel.vue) now needs the identical pool-kind label mapping, so it was
// promoted to app/lib/characters/spell-acquisition-plan.ts (the shared module both this Builder and
// the planner already import). Re-exported here so no existing import site in this file or its
// tests needs to change.
export { spellPoolLabel }

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P3.3 -- LEVEL-1 SPELL ACQUISITION
// ---------------------------------------------------------------------------
// The Builder has no Rules Engine registry (this file's own design decisions,
// above), so it cannot derive a character's legal maximum castable spell
// level the way the server does (server/utils/character-spell-acquisition.ts,
// which reads the real activated package's own slot table). At CREATION,
// though, that value is not a per-character fact to derive at all: P3.3's own
// Level-1 matrix (re-verified against the real corpus, and -- for Paladin/
// Ranger -- against the Rules Hotfix 0.21.0 corrected table) proves every one
// of the 8 real 2024 casters grants AT LEAST one Level-1 spell slot at
// character Level 1, with no exception. `CREATION_SPELL_SLOT_LEVELS` is that
// proven constant, never a per-class branch and never a client-trusted
// substitute for anything the server does not ALSO independently re-derive:
// the server builds its own copy from the real activated package and refuses
// a creation whose spell state does not satisfy it, exactly as it already
// does for every other creation choice this module presents.
const CREATION_SPELL_SLOT_LEVELS: readonly { level: number; max: number; expended: number }[] = [
  { level: 1, max: 1, expended: 0 }
]

export type BuilderCatalogueEntry = {
  packageId: string
  packageVersion: string
  systemKey: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
  // Resolved server-side by server/utils/world-content-catalogue.ts. Optional
  // because a pack from a system with no resolver, or an entry whose `data`
  // could not be read, legitimately has none -- the Builder stays usable and
  // simply has less to teach.
  presentation?: PresentationEntry | null
  // rules-package-architecture.md §8. Relayed verbatim by
  // GET /api/worlds/:id/catalogue. Absent on content that mechanises
  // nothing, which is legal and common -- the Builder simply asks no
  // questions for it.
  rulesFacet?: RulesFacet
}

export type BuilderChoiceKey = 'species' | 'class' | 'background'

// Phase 3. One assignment PER METHOD, not one shared assignment -- this is
// mechanism 1 of app/lib/characters/ability-scores.ts's "Carrying work
// across a method switch": leaving Point Buy and coming back must restore
// exactly what was there, which is free if each method owns its own state
// and impossible if they share one.
export type CharacterAbilityDraft = {
  method: AbilityScoreMethod
  byMethod: Record<AbilityScoreMethod, AbilityScoreAssignment>
}

export type CharacterBuilderDraft = {
  name: string
  species: BuilderCatalogueEntry | null
  class: BuilderCatalogueEntry | null
  background: BuilderCatalogueEntry | null
  abilities: CharacterAbilityDraft
  // Answers to the ChoiceSets the chosen content declares, keyed
  // `slot:choiceSetId`. Held as the SAME StoredRulesChoices shape the server
  // persists and the bridge reads, so the draft needs no translation on
  // submit and no second shape can drift from the first.
  choices: StoredRulesChoices
  // PHASE 2C.2B -- ContentRef answers to CONTENT-backed creation choices,
  // keyed by the same progression key a declaration produces. A separate
  // domain from `choices` (Definition answers): a ContentRef is never a
  // DefinitionId and is never judged by the Definition path.
  contentChoices: Record<string, string[]>
  // D&D 2024 Character Rules P3.3 -- tentative Level-1 spell acquisition answers, keyed by the
  // package-authored SpellRequirement.id (never an array index, never a class/spell name -- see
  // app/lib/characters/spell-acquisition-plan.ts's own ANSWER IDENTITY header), each value a list
  // of `serializeContentRef`-encoded refs. A separate domain from `contentChoices`: a spell
  // requirement is not a ChoiceSet and is never judged by that path -- it is judged entirely by
  // `planSpellAcquisition`, the ONE shared authority this module and the server both call.
  spellSelections: Record<string, string[]>
  // D&D 2024 Character Rules P8B -- starting-equipment bundle answers, keyed by the package-
  // authored EquipmentChoice.id (never a slot name, never a class/background name -- the id
  // already encodes its own owner, see dnd5e-2024.ts's own `choice:equipment.starting.<slug>`
  // convention), each value the single selected EquipmentBundle.id ('A'/'B'/'C'). A SEPARATE
  // domain from every other choice kind here: an EquipmentChoice is not a ChoiceSet (no Definition
  // answer) and not a content choice (no ContentRef) -- it is judged entirely by
  // `resolveEquipmentBundle`, the SAME shared pure resolver the server authority already calls
  // (server/utils/character-equipment-bundle.ts). Not pruned on switch, deliberately, mirroring
  // `spellSelections`' own posture exactly: a stale answer for a slot no longer selected is simply
  // never LIVE (see `equipmentChoiceOwners`), so switching back to that slot later re-validates the
  // old answer rather than losing it, and a stale answer is never submitted either way.
  equipmentSelections: Record<string, string>
}

// What the Builder knows about this package's content choices. Supplied by the
// page from the World's rules choice options and catalogue; the default knows of
// none, so every Definition-only caller is unchanged.
export type BuilderCreationContext = {
  contentSelectorOf: (choiceSetId: string) => ContentChoiceSelector | null
  feats: readonly CreationFeatEntry[]
  // D&D 2024 Character Rules P2 -- the catalogue's own spells, for a 'spells' category content
  // choice (mirrors `feats` exactly). Defaults to none so every existing caller is unchanged.
  // D&D 2024 Character Rules P3.3 -- ALSO the catalogue `planSpellAcquisition` reads directly:
  // `CreationSpellEntry` and the planner's own `SpellCatalogueEntry` are the SAME shape
  // (packageId/slug/title/spellMechanics), so this one array now serves both the P2 'spells'
  // content-choice path and the P3.3 spell-acquisition path, never a second copy.
  spells?: readonly CreationSpellEntry[]
  // P7 -- the package's distinctness and per-option ceiling per ChoiceSet, echoed by the
  // choice-options endpoint. Absent means every choice is distinct (the pre-P7 rule).
  choiceSetRule?: (choiceSetId: string) => ChoiceSetRule
  // D&D 2024 Character Rules P8B -- the catalogue's own items, for resolving an `item` or
  // `crossReference` EquipmentGrant's real title (the World's bound catalogue is already fetched
  // for GET /api/worlds/:id/catalogue, which already includes `items` -- this only threads it
  // through, exactly like `spells` was threaded through for P2 before any real 'spells' choice
  // existed yet). Defaults to none so every existing caller is unchanged.
  items?: readonly BuilderEquipmentCatalogueEntry[]
  // LANGUAGE CORPUS + POLICY PHASE -- the active Rules Package's own package-wide creation
  // facts/choices (RulesPackageManifest.universalCreation, mirrored to the client by GET
  // /api/worlds/:id/rules/choice-options). Structurally identical to a Species/Class/Background
  // facet's own `grants`/`choices`, consumed as one more slot by `creationChoicePresentation`
  // below -- never a second mechanism. Absent/null means no package-wide declaration (every
  // package before this phase), a no-op.
  universalFacet?: CreationFacetInput | null
}

// The entry shape this module needs from the World Content Catalogue for equipment presentation
// -- structural, so both the server catalogue and the Builder's copy satisfy it, mirroring
// CreationSpellEntry's own minimal envelope.
export type BuilderEquipmentCatalogueEntry = {
  packageId: string
  slug: string
  title: string
  // Weapon Mastery phase -- mirrors `spells`'s own "one array, two callers" posture exactly: the
  // SAME `items` array already threaded through for equipment-bundle title resolution (P8B) now
  // also carries each entry's own item mechanics, for the 'items' content-choice path
  // (resolveCreationContentChoices). Optional/absent means "not resolved to a weapon," the same
  // "absent entirely" reading `itemMechanics` already has on the server catalogue entry.
  itemMechanics?: CreationItemEntry['itemMechanics']
}

export const NO_CREATION_CONTENT: BuilderCreationContext = {
  contentSelectorOf: () => null,
  feats: []
}

export type BuilderStepKey = 'identity' | BuilderChoiceKey | 'proficiencies' | 'spells' | 'equipment' | 'abilities' | 'review'

export const CHOICE_KEYS: readonly BuilderChoiceKey[] = ['species', 'class', 'background']

// Proficiencies sits AFTER the three content choices and before abilities,
// because the questions it asks are declared BY those choices -- there is
// nothing to ask until a Class is picked. It is a real step even when it is
// empty (see isStepComplete): a step that appears and disappears as a
// player changes Class would make the progress rail jump under their thumb.
//
// D&D 2024 Character Rules P3.3 -- 'spells' sits right after 'proficiencies' for the identical
// reason: its questions are declared by the chosen Class's own facet, so there is nothing to ask
// until a Class is picked, and it is a real, always-present step (empty for a non-caster) for the
// same "the rail must not jump under a player's thumb" reasoning.
//
// D&D 2024 Character Rules P8B -- 'equipment' sits right after 'spells', for the same reasoning
// again: its questions are declared by whichever selected slots' own facets carry a
// `startingEquipment` choice (today: class and background, generically -- see
// `equipmentChoiceOwners`), so there is nothing to ask until at least one is picked, and it is a
// real, always-present step (empty only if nothing selected yet) for the identical "rail must not
// jump" reasoning.
export const STEP_KEYS: readonly BuilderStepKey[] = ['identity', 'species', 'class', 'background', 'proficiencies', 'spells', 'equipment', 'abilities', 'review']

export const STEP_LABELS: Record<BuilderStepKey, string> = {
  identity: 'Name',
  species: 'Species',
  class: 'Class',
  background: 'Background',
  proficiencies: 'Proficiencies',
  spells: 'Spells',
  equipment: 'Equipment',
  abilities: 'Ability Scores',
  review: 'Review'
}

export function emptyAbilityDraft(): CharacterAbilityDraft {
  return {
    // Standard Array first: it is the method the 2024 book leads with, and
    // the one that needs no explanation to a new player.
    method: 'standard-array',
    byMethod: {
      'standard-array': defaultAssignmentForMethod('standard-array'),
      'point-buy': defaultAssignmentForMethod('point-buy'),
      manual: defaultAssignmentForMethod('manual'),
      roll: defaultAssignmentForMethod('roll')
    }
  }
}

export function emptyDraft(): CharacterBuilderDraft {
  return {
    name: '',
    species: null,
    class: null,
    background: null,
    abilities: emptyAbilityDraft(),
    choices: emptyStoredRulesChoices(),
    contentChoices: {},
    spellSelections: {},
    equipmentSelections: {}
  }
}

// The assignment the player is currently editing.
export function activeAssignment(draft: CharacterBuilderDraft): AbilityScoreAssignment {
  return draft.abilities.byMethod[draft.abilities.method]
}

// Switching methods. Mechanism 2 of ability-scores.ts's own note: a method
// opened for the FIRST time is seeded from what the player already built,
// when it can represent those numbers honestly; a method with work already
// in it is left exactly as the player left it.
export function switchAbilityMethod(draft: CharacterBuilderDraft, method: AbilityScoreMethod): void {
  const previous = activeAssignment(draft)
  const target = draft.abilities.byMethod[method]
  const targetIsPristine = shallowEqualAssignment(target, defaultAssignmentForMethod(method))

  if (targetIsPristine) {
    draft.abilities.byMethod[method] = seedAssignmentForMethod(method, previous)
  }

  draft.abilities.method = method
}

function shallowEqualAssignment(a: AbilityScoreAssignment, b: AbilityScoreAssignment): boolean {
  return (Object.keys(b) as Array<keyof AbilityScoreAssignment>).every((key) => a[key] === b[key])
}

export function isAbilityStepComplete(draft: CharacterBuilderDraft): boolean {
  return isCompleteForMethod(draft.abilities.method, activeAssignment(draft))
}

// The six numbers to persist, or null when the step is not finished.
export function draftAbilityScores(draft: CharacterBuilderDraft): AbilityScores | null {
  if (!isAbilityStepComplete(draft)) return null
  return toAbilityScores(activeAssignment(draft))
}

// The composite identity -- see design decision 1. `::` is not a legal
// character in either a packageId (reverse-DNS) or a slug (slugified), so
// the join is unambiguous.
export function optionKey(entry: Pick<BuilderCatalogueEntry, 'packageId' | 'slug'> | null | undefined): string {
  if (!entry) return ''
  return `${entry.packageId}::${entry.slug}`
}

// PHASE 2C.3A -- the package's own creation availability, read generically. A
// non-null reason means the option is VISIBLE but DISABLED. This is presentation
// only: create-v2 POST refuses the same selection before any entity is written.
export function creationUnavailableReason(entry: Pick<BuilderCatalogueEntry, 'rulesFacet'> | null | undefined): string | null {
  return entry?.rulesFacet?.creationUnavailable ?? null
}

export function findOptionByKey(
  options: readonly BuilderCatalogueEntry[],
  key: string
): BuilderCatalogueEntry | null {
  if (!key) return null
  return options.find((option) => optionKey(option) === key) ?? null
}

// Everything a user could reasonably type to find an option, limited to
// fields the catalogue actually exposes -- design decision 2.
function searchText(option: BuilderCatalogueEntry): string {
  return [option.title, option.sourceBook, option.packageId].filter(Boolean).join(' ').toLowerCase()
}

// Whitespace-tolerant AND-matching across terms, so "human xphb" finds the
// XPHB Human without the user knowing field order.
export function filterOptions(
  options: readonly BuilderCatalogueEntry[],
  query: string
): BuilderCatalogueEntry[] {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return [...options]

  return options.filter((option) => {
    const haystack = searchText(option)
    return terms.every((term) => haystack.includes(term))
  })
}

// True when a selection exists but the current search has filtered it out
// of view. Selecting an option and then searching for something else
// otherwise makes the choice silently invisible: the radio is no longer in
// the DOM, so nothing on screen is checked, even though the draft still
// holds it. The picker uses this to keep the choice stated rather than
// letting a search appear to clear it.
export function isSelectionHidden(
  visibleOptions: readonly BuilderCatalogueEntry[],
  selectedKey: string
): boolean {
  if (!selectedKey) return false
  return !visibleOptions.some((option) => optionKey(option) === selectedKey)
}

// True when two or more options in the same category share a title -- the
// SRD-5.1-plus-XPHB case. When it happens the source book stops being
// decoration and becomes the only thing distinguishing two rows, so the UI
// uses this to guarantee provenance is always visible for that category.
export function hasAmbiguousTitles(options: readonly BuilderCatalogueEntry[]): boolean {
  const seen = new Set<string>()
  for (const option of options) {
    const title = option.title.trim().toLowerCase()
    if (seen.has(title)) return true
    seen.add(title)
  }
  return false
}

// The questions this draft is currently being asked, in slot order --
// derived from whatever content is selected RIGHT NOW, never stored. Change
// the Class and this list changes with it, which is what makes "changing the
// Class changes the available choices" true by construction rather than by
// an invalidation step someone has to remember to run.
// Every creation choice the three selected slots declare, judged by the SAME
// shared rule the save route applies (app/lib/characters/
// creation-choice-eligibility.ts). The draft is passed whole so direct grants
// from ALL three slots are visible to every choice -- never only the slot
// that happens to render first.
export function creationChoicePresentation(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): CreationChoicePresentation[] {
  // LANGUAGE CORPUS + POLICY PHASE -- the universal package-wide slot, placed FIRST so its own
  // fixed grants (Common) and choice are visible to every later slot's own eligibility within
  // this SAME call -- the real server (create-v2.post.ts) builds the identical slots array.
  const slots: CreationSlotInput[] = [
    { slot: 'universal', facet: context.universalFacet ?? null },
    ...CHOICE_KEYS.map((key) => ({ slot: key, facet: draft[key]?.rulesFacet }))
  ]
  return resolveCreationChoices(
    slots,
    draft.choices.selections,
    (id) => context.contentSelectorOf(id) !== null,
    (id) => context.choiceSetRule?.(id) ?? null
  )
}

// PHASE 2C.2B -- the creation-time ContentRef choices the CURRENT selected slots
// declare (class switching changes this list), judged by the shared creation
// content authority. Every presentation here is a content choice only.
export function creationContentPresentation(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): CreationContentPresentation[] {
  const slots = CHOICE_KEYS.map((key) => ({ slot: key, facet: draft[key]?.rulesFacet }))
  const declarations = declaredCreationContentChoices(slots, context.contentSelectorOf)
  return resolveCreationContentChoices(declarations, slots, draft.contentChoices, context.feats, context.spells ?? [], context.items ?? [])
}

// The ContentRef answers that count for the CURRENT selection, keyed by the
// declared key. A stale answer for a slot no longer selected never appears here,
// so it can never be submitted.
export function effectiveContentChoices(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): Record<string, string[]> {
  return Object.fromEntries(creationContentPresentation(draft, context).map((p) => [p.key, [...p.selected]]))
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P3.3 -- Level-1 spell acquisition.
// ---------------------------------------------------------------------------
// ONE shared authority, `planSpellAcquisition` (P3.2), consumed identically here and by the server
// (server/utils/character-spell-acquisition.ts) -- this module never re-implements count, pool,
// membership, or filtering legality. The only thing specific to CREATION is the inputs: no persisted
// state yet (`candidates: []`), Level 1 always, and the fixed `CREATION_SPELL_SLOT_LEVELS` constant
// above.
export function spellRequirementsFor(draft: CharacterBuilderDraft) {
  return draft.class?.rulesFacet?.spellRequirements ?? []
}

function tentativeSpellSelections(draft: CharacterBuilderDraft): TentativeSpellSelection[] {
  const out: TentativeSpellSelection[] = []
  for (const [requirementId, refs] of Object.entries(draft.spellSelections)) {
    for (const ref of refs) {
      const parsed = parseContentRef(ref)
      if (parsed) out.push({ requirementId, ref: parsed })
    }
  }
  return out
}

export function spellAcquisitionPresentation(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): SpellAcquisitionPlan {
  return planSpellAcquisition({
    requirements: spellRequirementsFor(draft),
    characterLevel: 1,
    candidates: [],
    catalogue: context.spells ?? [],
    spellSlotLevels: CREATION_SPELL_SLOT_LEVELS,
    tentative: tentativeSpellSelections(draft)
  })
}

export function setSpellSelections(draft: CharacterBuilderDraft, requirementId: string, selected: readonly string[]): void {
  draft.spellSelections[requirementId] = [...selected]
}

export function isSpellStepComplete(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): boolean {
  return spellAcquisitionPresentation(draft, context).complete
}

// The answers that count for the CURRENTLY selected Class, in P3.2's own wire shape. A prior
// Class's answers are not deleted from the draft (switching back re-validates them against the
// current plan rather than losing them), but they are never live here and are therefore never
// submitted -- see this module's own header on why re-validating on read is enough.
export function effectiveSpellSelections(draft: CharacterBuilderDraft): TentativeSpellSelection[] {
  const liveIds = new Set(spellRequirementsFor(draft).map((r) => r.id))
  return tentativeSpellSelections(draft).filter((selection) => liveIds.has(selection.requirementId))
}

export type SpellRequirementSection = {
  requirementId: string
  pool: SpellRequirementPoolKind
  label: string
  choice: ResolvableChoice
  optionLabels: Record<string, string>
  satisfied: boolean
}

// One renderable section per requirement whose Level-1 target is non-zero (Mystic Arcanum's own
// four requirements are always 0 at Level 1 -- see `planSpellAcquisition`'s own header on why a
// requirement with nothing missing requests no selection -- so they never produce a section here).
// `choice.count` is the requirement's FULL target, never `missing`: a picker counts UP to a fixed
// total exactly like every other ChoiceSet in this codebase, rather than a shrinking "remaining"
// number that would renumber the player's own slots as they fill them.
// `choice.options` is the union of `r.options` (legal, not-yet-selected catalogue spells) and
// whatever is ALREADY selected for this requirement -- a slot's own currently-chosen value must be
// one of its renderable options, or the underlying <select> would hold a value with no matching
// <option> (P3.2's own `options` deliberately excludes an already-selected spell FROM BEING OFFERED
// AGAIN, which is correct for new picks but would otherwise silently break the picker that holds the
// existing pick).
// `distinct: false, maxPerOption: 1` reuses the SAME slot-mode CharacterChoiceSetPicker machinery
// Ability Score Improvement's own repeatable choice already exercises -- the smallest existing
// control for "N independent slots, each one spell, no repeats" already in this codebase (see this
// phase's own report for why no new searchable/autocomplete component was introduced).
export function spellRequirementSections(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): SpellRequirementSection[] {
  const plan = spellAcquisitionPresentation(draft, context)
  const catalogueTitleByRef = new Map(
    (context.spells ?? []).map((entry) => [serializeContentRef({ packageId: entry.packageId, slug: entry.slug }), entry.title])
  )

  return plan.requirements
    .filter((requirement) => requirement.target > 0)
    .map((requirement) => {
      const selectedRefs = draft.spellSelections[requirement.requirementId] ?? []
      const optionLabels: Record<string, string> = {}
      for (const option of requirement.options) optionLabels[option.ref] = option.title
      for (const ref of selectedRefs) if (!(ref in optionLabels)) optionLabels[ref] = catalogueTitleByRef.get(ref) ?? ref

      return {
        requirementId: requirement.requirementId,
        pool: requirement.pool,
        label: spellPoolLabel(requirement.pool),
        choice: {
          key: requirement.requirementId,
          slot: 'class',
          choiceSetId: requirement.pool,
          count: requirement.target,
          options: Object.keys(optionLabels),
          distinct: false,
          maxPerOption: 1
        },
        optionLabels,
        satisfied: requirement.satisfied
      }
    })
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P8B -- starting equipment.
// ---------------------------------------------------------------------------
// ONE shared pure resolver, `resolveEquipmentBundle` (app/lib/characters/equipment-bundle.ts, P8),
// consumed identically here and by the server authority (server/utils/character-equipment-
// bundle.ts) -- this module never re-implements what a bundle grant MEANS or whether a selected
// bundle is legal. The only things specific to the BUILDER are: which slots currently carry a
// live `startingEquipment` choice (generic over slot, never a hardcoded "class and background"
// pair -- a future species/feat facet needs zero change here), and how to describe a resolved
// grant in one line for a player who has not yet created the character.
//
// `DND5E_2024_EQUIPMENT_CROSS_REFERENCE_ITEM_SLUGS` is imported directly (not injected) because it
// is already a transitive dependency of this very file: `creationUnresolvedDecisions`
// (imported above, already called by `ownCreationBlocker`) pulls in the entire
// `dnd5e-2024.ts` facet corpus through `mandatory-decision-coverage.ts`'s own `findRulesFacet`
// import, so this adds no new client bundle weight -- it only makes an existing transitive
// dependency explicit, exactly the posture the server's OWN `character-equipment-bundle.ts`
// already takes with the identical constant.

// Every live startingEquipment choice the CURRENTLY selected slots declare, in slot order.
// Generic: a slot with no EquipmentChoice on its facet simply contributes nothing -- no owner-kind
// branch anywhere in this function.
export type EquipmentChoiceOwner = { slot: BuilderChoiceKey; choice: EquipmentChoice }

export function equipmentChoiceOwners(draft: CharacterBuilderDraft): EquipmentChoiceOwner[] {
  const owners: EquipmentChoiceOwner[] = []
  for (const slot of CHOICE_KEYS) {
    const choice = draft[slot]?.rulesFacet?.startingEquipment
    if (choice) owners.push({ slot, choice })
  }
  return owners
}

export function setEquipmentSelection(draft: CharacterBuilderDraft, choiceId: string, bundleId: string): void {
  draft.equipmentSelections[choiceId] = bundleId
}

function builderItemResolver(context: BuilderCreationContext) {
  const items = context.items ?? []
  return (slug: string) => {
    const found = items.find((entry) => entry.slug === slug)
    return found ? { packageId: found.packageId, slug: found.slug } : null
  }
}

// The D&D-specific half of a `crossReference` grant's resolution -- reads the character's OWN
// already-in-progress `rules_choices` answer for the named ChoiceSet (scoped to `slot`, exactly as
// every other creation-time choice already is), looks the selected Value id up in the package's
// own tool/instrument/gaming-set -> item-slug table, then resolves that slug the identical way an
// `item` grant does. Mirrors server/utils/character-equipment-bundle.ts's own
// `crossReferenceResolverFor` exactly, one layer earlier (draft state instead of persisted
// `rules_choices`).
function builderCrossReferenceResolver(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext,
  slot: BuilderChoiceKey
) {
  const resolveItem = builderItemResolver(context)
  return (choiceSetId: string) => {
    const selected = selectionsFor(draft.choices, choiceKey(slot, choiceSetId))[0]
    if (!selected) return null
    const slug = DND5E_2024_EQUIPMENT_CROSS_REFERENCE_ITEM_SLUGS[selected]
    if (!slug) return null
    return resolveItem(slug)
  }
}

function builderEquipmentResolvers(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext,
  slot: BuilderChoiceKey
): EquipmentBundleResolvers {
  return {
    resolveItemSlug: builderItemResolver(context),
    resolveCrossReference: builderCrossReferenceResolver(draft, context, slot)
  }
}

// Real legality, never presentation-only: a choice is satisfied only when a selected bundle id
// actually exists on this choice AND `resolveEquipmentBundle` resolves it in full (every item
// slug found, every cross-reference answered) -- the SAME fail-closed authority the server
// applies, never weakened here to make the step look complete sooner.
export function equipmentChoiceSatisfied(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext,
  owner: EquipmentChoiceOwner
): boolean {
  const bundleId = draft.equipmentSelections[owner.choice.id]
  if (!bundleId) return false
  const bundle = findEquipmentBundle(owner.choice, bundleId)
  if (!bundle) return false
  return resolveEquipmentBundle(bundle, builderEquipmentResolvers(draft, context, owner.slot)).ok
}

export function isEquipmentStepComplete(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): boolean {
  return equipmentChoiceOwners(draft).every((owner) => equipmentChoiceSatisfied(draft, context, owner))
}

function titleForItemSlug(context: BuilderCreationContext, slug: string): string {
  return context.items?.find((entry) => entry.slug === slug)?.title ?? `${slug} (unavailable)`
}

// One grant, described in one line. Deliberately NEVER the authority on legality (that is
// `equipmentChoiceSatisfied`'s job, via the real `resolveEquipmentBundle`) -- this degrades
// gracefully, grant by grant, so a bundle with one still-unanswered cross-reference still shows
// every OTHER grant it carries, rather than refusing to describe the whole bundle at all.
function summarizeEquipmentGrant(
  grant: EquipmentGrant,
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext,
  slot: BuilderChoiceKey
): string {
  if (grant.kind === 'item') {
    const title = titleForItemSlug(context, grant.slug)
    return grant.quantity && grant.quantity > 1 ? `${grant.quantity}× ${title}` : title
  }
  if (grant.kind === 'custom') {
    return grant.quantity && grant.quantity > 1 ? `${grant.quantity}× ${grant.name}` : grant.name
  }
  if (grant.kind === 'currency') {
    // `denominationId` is opaque and package-owned (see app/lib/characters/currency.ts's own
    // header) -- this deliberately never hardcodes "GP"/"gold" or a conversion rate. Infrastructure-
    // grade only: the amount and the denomination's own identity, nothing invented.
    return `${grant.amount} (currency: ${grant.denominationId})`
  }
  // grant.kind === 'crossReference'
  const ref = builderCrossReferenceResolver(draft, context, slot)(grant.choiceSetId)
  if (!ref) return 'an item determined by a proficiency choice you have not made yet'
  return titleForItemSlug(context, ref.slug)
}

export type EquipmentBundleSummary = {
  id: string
  label: string
  summary: string
}

export type EquipmentChoiceSection = {
  slot: BuilderChoiceKey
  choiceId: string
  bundles: EquipmentBundleSummary[]
  selectedBundleId: string | null
  satisfied: boolean
}

export function equipmentChoiceSections(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): EquipmentChoiceSection[] {
  return equipmentChoiceOwners(draft).map((owner) => ({
    slot: owner.slot,
    choiceId: owner.choice.id,
    bundles: owner.choice.bundles.map((bundle) => ({
      id: bundle.id,
      label: bundle.label,
      summary: bundle.grants.map((grant) => summarizeEquipmentGrant(grant, draft, context, owner.slot)).join(', ')
    })),
    selectedBundleId: draft.equipmentSelections[owner.choice.id] ?? null,
    satisfied: equipmentChoiceSatisfied(draft, context, owner)
  }))
}

// The answers that count for the CURRENTLY live choices, in P8's own server wire shape
// (`{ [choiceId]: bundleId }`). A prior slot's stale answer is not deleted from the draft
// (switching back re-validates it against the current owners rather than losing it), but it is
// never live here and is therefore never submitted -- the identical posture
// `effectiveSpellSelections` already established one domain over.
export function effectiveStartingEquipment(draft: CharacterBuilderDraft): Record<string, string> {
  const liveIds = new Set(equipmentChoiceOwners(draft).map((owner) => owner.choice.id))
  const effective: Record<string, string> = {}
  for (const [choiceId, bundleId] of Object.entries(draft.equipmentSelections)) {
    if (liveIds.has(choiceId) && bundleId) effective[choiceId] = bundleId
  }
  return effective
}

// The question as the rest of the Builder reads it: options are only the
// ELIGIBLE ones, and the selection is the effective one. Callers that need to
// SHOW unavailable options read creationChoicePresentation instead.
export function declaredChoices(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): ResolvableChoice[] {
  return creationChoicePresentation(draft, context).map((presentation) => ({
    key: presentation.key,
    slot: presentation.slot,
    choiceSetId: presentation.choiceSetId,
    count: presentation.count,
    options: presentation.offered.filter((option) => option.eligible).map((option) => option.value),
    distinct: presentation.distinct,
    maxPerOption: presentation.maxPerOption
  }))
}

export function choiceSelections(draft: CharacterBuilderDraft, key: string): string[] {
  return selectionsFor(draft.choices, key)
}

// Records an answer, and PRUNES answers to questions no longer being asked.
//
// Pruning here rather than on submit is deliberate: a player who picks
// Fighter, chooses two Fighter skills, then switches to Wizard must not
// carry two Fighter-only skills into a Wizard character. The stale key would
// fail server validation anyway, but failing at the end of a form is a worse
// experience than never holding invalid state at all.
// P7 -- the context is required in practice: pruning judges a repeatable answer by the package's
// rule, and without it a legal repeat (two picks of one Background ability) would be pruned away.
export function setChoiceSelections(
  draft: CharacterBuilderDraft,
  key: string,
  selected: readonly string[],
  context: BuilderCreationContext = NO_CREATION_CONTENT
): void {
  draft.choices.selections[key] = [...selected]
  pruneChoices(draft, context)
}

// Drops answers that the CURRENT questions no longer accept, in both ways
// that can happen:
//
//   1. the question is gone entirely (a Class that declared a choice was
//      swapped for one that declares none) -- the key is removed
//   2. the question remains but its OPTIONS changed (Fighter -> Wizard: both
//      declare choice:skill.proficiency on the class slot, so the key is
//      identical, but Athletics is not on the Wizard's list) -- the options
//      that are no longer offered are removed, and any that still are stay
//
// Case 2 is the one that bites: leaving a stale answer in place would leave
// the draft holding two picks for a two-pick question, so the picker would
// consider itself full and DISABLE every option the new Class actually
// offers -- a player unable to choose anything, with no visible reason.
// Records a ContentRef answer and prunes what the current selection no longer
// declares -- the content counterpart of setChoiceSelections.
export function setContentChoiceSelections(
  draft: CharacterBuilderDraft,
  key: string,
  selected: readonly string[],
  context: BuilderCreationContext = NO_CREATION_CONTENT
): void {
  draft.contentChoices[key] = [...selected]
  pruneChoices(draft, context)
}

export function pruneChoices(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): void {
  // Content answers follow the same rule as Definition answers: a key the
  // current selection no longer declares is removed, so a class switch can never
  // leave a hidden requirement behind (switching back re-asks the question).
  const contentPresentations = creationContentPresentation(draft, context)
  const liveContent = new Set(contentPresentations.map((presentation) => presentation.key))
  for (const key of Object.keys(draft.contentChoices)) {
    if (!liveContent.has(key)) delete draft.contentChoices[key]
  }
  for (const presentation of contentPresentations) {
    const current = draft.contentChoices[presentation.key] ?? []
    if (!sameSelection(current, presentation.selected)) draft.contentChoices[presentation.key] = [...presentation.selected]
  }

  const presentations = creationChoicePresentation(draft, context)
  const live = new Set(presentations.map((presentation) => presentation.key))

  for (const key of Object.keys(draft.choices.selections)) {
    if (!live.has(key)) delete draft.choices.selections[key]
  }

  // Writes back the EFFECTIVE selection -- a stale answer that the current
  // grants or sibling answers have made illegal is removed from the draft
  // itself, not merely hidden, so it can never be submitted. Only a CHANGED
  // answer is written: this runs on mount and on every slot change, and a
  // clean draft must not be rewritten with an equal-but-fresh array each time.
  for (const presentation of presentations) {
    const current = draft.choices.selections[presentation.key] ?? []
    if (sameSelection(current, presentation.selected)) continue
    draft.choices.selections[presentation.key] = [...presentation.selected]
  }
}

function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

// True when every declared question is validly answered by ELIGIBLE answers.
// Vacuously true when nothing declares a choice -- a World whose content
// carries no facets has no proficiency step to complete.
export function isProficiencyStepComplete(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): boolean {
  return creationChoicePresentation(draft, context).every((presentation) => presentation.answered)
}

// Creation's ContentRef choices count toward the same proficiency-step validity as
// the Definition choices: a required feat choice is unsatisfied until VALID.
export function isCreationContentComplete(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): boolean {
  return creationContentPresentation(draft, context).every((presentation) => presentation.valid)
}

export function isChoiceComplete(draft: CharacterBuilderDraft, key: BuilderChoiceKey): boolean {
  return Boolean(draft[key])
}

export function isNameComplete(draft: CharacterBuilderDraft): boolean {
  return draft.name.trim().length > 0
}

export function isStepComplete(
  draft: CharacterBuilderDraft,
  step: BuilderStepKey,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): boolean {
  if (step === 'identity') return isNameComplete(draft)
  if (step === 'proficiencies') return isProficiencyStepComplete(draft, context) && isCreationContentComplete(draft, context)
  if (step === 'spells') return isSpellStepComplete(draft, context)
  if (step === 'equipment') return isEquipmentStepComplete(draft, context)
  if (step === 'abilities') return isAbilityStepComplete(draft)
  if (step === 'review') return isDraftComplete(draft, context)
  return isChoiceComplete(draft, step)
}

export function isDraftComplete(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): boolean {
  return isNameComplete(draft)
    && CHOICE_KEYS.every((key) => isChoiceComplete(draft, key))
    && isProficiencyStepComplete(draft, context)
    && isCreationContentComplete(draft, context)
    && isSpellStepComplete(draft, context)
    && isEquipmentStepComplete(draft, context)
    && isAbilityStepComplete(draft)
    // PHASE 0 -- an entity with a mandatory decision Eldra cannot record cannot be created.
    && creationBlockerMessages(draft).length === 0
}

// Human-readable list of what is still outstanding. Mirrors (never
// replaces) the server's own validation -- the save route remains the sole
// authority on whether a create is actually valid; this only explains a
// disabled button, the same posture AdminContentPackBuilderPanel.vue's
// `validationMessages` already established.
export function missingRequirements(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): string[] {
  const missing: string[] = []
  if (!isNameComplete(draft)) missing.push('Enter a character name.')
  for (const key of CHOICE_KEYS) {
    if (!isChoiceComplete(draft, key)) missing.push(`Choose a ${STEP_LABELS[key]}.`)
  }
  for (const presentation of creationContentPresentation(draft, context)) {
    if (presentation.valid) continue
    missing.push(`${STEP_LABELS[presentation.slot as BuilderChoiceKey] ?? presentation.slot}: choose ${presentation.count} option${presentation.count === 1 ? '' : 's'}.`)
  }
  for (const presentation of creationChoicePresentation(draft, context)) {
    if (presentation.answered) continue
    const eligible = presentation.offered.filter((option) => option.eligible).map((option) => option.value)
    const validation = validateChoiceSelection(
      { key: presentation.key, slot: presentation.slot, choiceSetId: presentation.choiceSetId, count: presentation.count, options: eligible, distinct: presentation.distinct, maxPerOption: presentation.maxPerOption },
      presentation.selected
    )
    const reason = validation.ok ? 'Choose your options.' : validation.reason
    missing.push(`${STEP_LABELS[presentation.slot as BuilderChoiceKey] ?? presentation.slot}: ${reason}`)
  }
  for (const section of spellRequirementSections(draft, context)) {
    if (section.satisfied) continue
    const chosen = (draft.spellSelections[section.requirementId] ?? []).length
    missing.push(`${section.label}: choose ${chosen} of ${section.choice.count}.`)
  }
  for (const section of equipmentChoiceSections(draft, context)) {
    if (section.satisfied) continue
    missing.push(`${STEP_LABELS[section.slot]}: choose a starting-equipment option.`)
  }
  if (!isAbilityStepComplete(draft)) missing.push('Finish assigning ability scores.')
  missing.push(...creationBlockerMessages(draft))
  return missing
}

export type CharacterCreatePayload = {
  title: string
  species: { packageId: string; slug: string }
  class: { packageId: string; slug: string }
  background: { packageId: string; slug: string }
  // Phase 3. Unlike the three catalogue choices -- which the save route
  // re-resolves and therefore reads only (packageId, slug) from -- ability
  // scores have no catalogue to re-resolve against. They ARE the player's
  // data, so they are sent in full and the server validates shape/bounds
  // rather than looking anything up.
  abilities: { method: AbilityScoreMethod; scores: AbilityScores }
  // PHASE 2C.2B -- ContentRef answers to content-backed creation choices, keyed
  // by declared key, each value a list of encoded `packageId::slug` refs. The
  // server re-resolves every ref against the declaration it names.
  contentChoices: Record<string, string[]>
  // The player's ChoiceSet answers. Like ability scores -- and unlike the
  // three catalogue refs -- these ARE the player's data, so they are sent in
  // full. The server still re-derives the questions from the character's own
  // facets and validates every answer against them; sending them does not
  // make them trusted.
  choices: StoredRulesChoices
  // D&D 2024 Character Rules P3.3 -- tentative Level-1 spell acquisition answers, in P3.2's own
  // wire shape. The client submits ONLY requirement identity + Spell ContentRef -- never a class
  // name, spell level, school, pool kind, or known/prepared flag. The server independently
  // re-derives every one of those from the selected Class's own package facet and rebuilds the
  // SAME plan before trusting any of it (see server/utils/character-spell-acquisition.ts).
  spellSelections: TentativeSpellSelection[]
  // D&D 2024 Character Rules P8B -- the selected bundle id per live starting-equipment choice,
  // keyed by EquipmentChoice.id. The client submits ONLY this selection identity -- never an item
  // slug, quantity, currency amount, resolved cross-reference item, or custom grant name. The
  // server independently re-derives every grant from the selected class/background's own package
  // facet and the World's real catalogue before trusting any of it (see server/utils/
  // character-equipment-bundle.ts's own `resolveStartingEquipment`).
  startingEquipment: Record<string, string>
}

// See design decision 3 -- only the two fields the save route actually reads.
export function toCreatePayload(
  draft: CharacterBuilderDraft,
  context: BuilderCreationContext = NO_CREATION_CONTENT
): CharacterCreatePayload | null {
  if (!isDraftComplete(draft, context)) return null

  const scores = draftAbilityScores(draft)
  if (!scores) return null

  const ref = (entry: BuilderCatalogueEntry) => ({ packageId: entry.packageId, slug: entry.slug })

  return {
    title: draft.name.trim(),
    species: ref(draft.species!),
    class: ref(draft.class!),
    background: ref(draft.background!),
    abilities: { method: draft.abilities.method, scores },
    choices: { selections: { ...draft.choices.selections } },
    // PHASE 2C.2B -- only the answers the CURRENT selection declares and makes
    // valid. A stale answer for a class no longer selected is never submitted.
    contentChoices: effectiveContentChoices(draft, context),
    // D&D 2024 Character Rules P3.3 -- only the answers the CURRENTLY selected Class's own
    // requirements declare; a prior Class's stale answers are never live and are never submitted.
    spellSelections: effectiveSpellSelections(draft),
    // D&D 2024 Character Rules P8B -- only the bundle ids the CURRENTLY live choices declare; a
    // prior class/background's stale answer is never live and is never submitted.
    startingEquipment: effectiveStartingEquipment(draft)
  }
}

// The next step a user most likely wants after completing `step`. Used only
// by the compact (stepper) layout's "Next" affordance -- never to GATE a
// step, since every step is reachable at any time on every viewport.
export function nextStep(step: BuilderStepKey): BuilderStepKey | null {
  const index = STEP_KEYS.indexOf(step)
  if (index < 0 || index >= STEP_KEYS.length - 1) return null
  return STEP_KEYS[index + 1]!
}

export function previousStep(step: BuilderStepKey): BuilderStepKey | null {
  const index = STEP_KEYS.indexOf(step)
  if (index <= 0) return null
  return STEP_KEYS[index - 1]!
}

// PHASE 0 -- fail-closed presentation. The Builder asks the SAME authority the server
// enforces, per selected entity, and says why an option cannot be chosen yet. Presentation
// only: create-v2 POST refuses the same selection regardless.
const NO_SLUG = '-'

// The first mandatory decision a single entity owns that Eldra cannot record, or null.
export function ownCreationBlocker(kind: 'species' | 'class' | 'background', slug: string): UnresolvedDecision | null {
  return creationUnresolvedDecisions({
    species: kind === 'species' ? slug : NO_SLUG,
    class: kind === 'class' ? slug : NO_SLUG,
    background: kind === 'background' ? slug : NO_SLUG
  })[0] ?? null
}

// The Builder's wording is the authority's wording: one phrase table, shared with the server.
export function decisionPhrase(blocker: UnresolvedDecision): string {
  return sharedDecisionPhrase(blocker.family)
}

export function blockerReason(blocker: UnresolvedDecision): string {
  return `Requires ${sharedDecisionPhrase(blocker.family)}${/^[A-Z]/.test(blocker.source) ? ` (${blocker.source})` : ''}.`
}

// Each catalogue entry, with the package's own availability reason filled in when the entry
// owns an unrecordable decision. A reason the package already authored (Origin backgrounds) wins.
export function withCreationBlockers<T extends BuilderCatalogueEntry>(entries: readonly T[], kind: 'species' | 'class' | 'background'): T[] {
  return entries.map((entry) => {
    if (entry.rulesFacet?.creationUnavailable) return entry
    const blocker = ownCreationBlocker(kind, entry.slug)
    if (!blocker) return entry
    return { ...entry, rulesFacet: { ...(entry.rulesFacet ?? {}), creationUnavailable: blockerReason(blocker) } as RulesFacet }
  })
}

// Messages for the Create gate: every selected entity that owns an unrecordable decision.
export function creationBlockerMessages(draft: CharacterBuilderDraft): string[] {
  const messages: string[] = []
  for (const [key, kind] of [['species', 'species'], ['class', 'class'], ['background', 'background']] as const) {
    const entry = draft[key]
    if (!entry) continue
    const blocker = ownCreationBlocker(kind, entry.slug)
    if (blocker) messages.push(`${STEP_LABELS[key]} cannot be completed yet. ${blockerReason(blocker)}`)
  }
  return messages
}
