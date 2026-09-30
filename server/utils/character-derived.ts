// The Character Rules Projection -- rules-package-architecture.md §11.3.
//
// The Rules Engine returns one value per Definition ID. A sheet needs a
// coherent model. This module is the read-model over those calls: it
// composes Character Assembly, the actor bridge, and the World's active
// Rules Runtime, runs the evaluator, and returns what it computed grouped
// by Rule Category.
//
// ---------------------------------------------------------------------------
// DERIVED ON DEMAND, PERSISTED NOWHERE
// ---------------------------------------------------------------------------
// Every call rebuilds the ActorState from current content and re-evaluates
// from scratch. Nothing here writes to Directus, and there is no cache. That
// is ADR-003 ("derived values are never stored") applied literally: a
// persisted derived value is a cache with no invalidation strategy, and it
// is how a sheet silently drifts out of sync with the rules that produced
// it. Rebuilding is cheap; storing is dangerous.
//
// ---------------------------------------------------------------------------
// IT KNOWS NO GAME
// ---------------------------------------------------------------------------
// This module contains no ability name, no skill name, and no Definition ID.
// It asks the registry what Definitions exist, evaluates the ones that have
// a single evaluable value, and groups the results by the `category` each
// Definition declares. Everything specific to D&D lives in the package on
// disk; everything specific to 5etools lives in the Rules Facets. Swap the
// active package for a Call of Cthulhu one and this file returns Sanity and
// percentile skills without a line changing.
//
// That is why the projection is a FLAT LIST GROUPED BY CATEGORY rather than
// a `{ abilities, saves, skills }` shape: the moment it names those three,
// it has learned a game, and the next system needs a code change. Category
// is the agnostic vocabulary (§13.2: "Sheet regions address Rule
// Categories"), and choosing WHICH categories to render is the sheet's job.
//
// ---------------------------------------------------------------------------
// ONLY `kind: 'value'` IS EVALUATED
// ---------------------------------------------------------------------------
// Tables, Progressions, and ChoiceSets have no single evaluable RuleValue --
// asking the evaluator for one returns a RulesError by design (Step 2). They
// are skipped rather than evaluated-and-discarded, so an error in this
// projection always means something genuinely went wrong.

import { evaluate } from '../../app/lib/rules/evaluator'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import type {
  CollectionSlotDefinition,
  RuleCategory,
  RulesError,
  RuleValue,
  TableColumnDefinition,
  TableKeyDeclaration,
  TableRow
} from '../../app/lib/rules/types'
import { assembleCharacter, type CharacterAssemblyBlueprint } from './character-assembly'
import { buildActorState, type PendingChoice } from './character-actor-bridge'
import type { ResolvableChoice } from '../../app/lib/characters/rules-choices'
import { getWorldRuntime } from './world-runtime-service'
import { getWorldContentCatalogue } from './world-content-catalogue'
import { serializeContentRef } from '../../app/lib/characters/progression-plan'

// Mirrors evaluator.ts's and modifier-pipeline.ts's own `isRulesError`
// exactly. Duplicated rather than imported for the reason those two already
// document: neither exports it, and the engine deliberately keeps this
// structural check local to each module rather than exporting a shared one.
// Adding an export to the engine to save six lines here would be an engine
// change this step has no mandate for.
function isRulesError(value: unknown): value is RulesError {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'definitionId' in value &&
    'message' in value &&
    !('count' in value && 'faces' in value)
  )
}

// One declared Collection's metadata -- deliberately NOT its items (the
// item flags -- equipped, attuned -- are already displayed by the caller's
// own tracking surface, CharacterInventoryPanel.vue; showing them twice
// through two different paths is what §11.3 calls a second source of
// truth). Only what the PACKAGE declares about the collection: its slots.
// Generic across any collection any package might declare, exactly as
// `DerivedValue` is generic across any Value -- this module still names no
// game, no `equipment`, no `armor`.
export type DerivedCollection = {
  id: string
  label?: string
  category: RuleCategory
  slots: CollectionSlotDefinition[]
}

// A declared Table's full reference data -- rows included, unlike
// DerivedCollection above. A Table carries no formula (evaluator.ts: "Table
// is not modeled" -- `lookup()` parses but errors at evaluation time), so
// there is no `evaluate()` output to attach a `value` to the way DerivedValue
// does; the rows themselves ARE the output, meant to be read directly by a
// consumer that knows what to do with them (the same "reference data a
// consumer reads directly" role README.md already documents for
// `table:advancement.experience`). This module still names no game and no
// specific table: any package's Table surfaces here uniformly, exactly as
// any package's Collection already does via `collections` above.
export type DerivedTable = {
  id: string
  label?: string
  category: RuleCategory
  key: TableKeyDeclaration
  columns: TableColumnDefinition[]
  rows: TableRow[]
}

// One evaluated Definition. `value` is whatever the engine returned;
// `error` is set instead when evaluation produced a RulesError, because a
// broken formula must be visible rather than rendered as a plausible zero
// (§28's "visible degradation").
export type DerivedValue = {
  id: string
  label?: string
  category: RuleCategory
  tags?: string[]
  value?: RuleValue
  error?: string
}

// A declared choice with the labels a surface needs to render it. The
// labels come from the ACTIVE PACKAGE's own Definitions -- the prompt from
// the ChoiceSet, each option's from the Value it names -- so no consumer
// ever has to turn a Definition id into English, and no game vocabulary
// reaches a Vue file.
export type PresentableChoice = ResolvableChoice & {
  prompt: string
  label?: string
  answered: boolean
  selected: string[]
  options: string[]
  optionLabels: Record<string, string>
  // Character Progression Phase 1C -- 'content' when `options`/`selected`
  // are serializeContentRef-encoded Content Catalogue references (e.g.
  // subclass selection) rather than plain Definition ids. Defaults to
  // 'definition' for every choice built from `bridged.declaredChoices`
  // (unchanged behavior for every choice that predates this phase).
  kind: 'definition' | 'content'
}

export type DerivedCharacter = {
  worldId: string
  characterId: string
  characterTitle: string
  packageId: string
  packageVersion: string
  // Grouped by the category each Definition declares. A category with no
  // Definitions simply has no key -- the sheet then renders no region for
  // it, which is the visible degradation §13.2 describes.
  byCategory: Partial<Record<RuleCategory, DerivedValue[]>>
  // Every Collection the active package declares that has at least one
  // slot -- a Collection with no slots has nothing spatial to show and is
  // omitted, the same "nothing to render, nothing rendered" rule §13.2
  // already applies to an empty category.
  collections: DerivedCollection[]
  // Every Table the active package declares that has at least one row --
  // the Table counterpart of `collections` immediately above, added for the
  // Spellcasting System's Spell Slot progression tables (`lookup()` is not
  // evaluated, so a consumer that needs a Table's rows -- which slot count
  // applies at this character's level -- reads them from here directly,
  // never through `evaluate()`).
  tables: DerivedTable[]
  // EVERY choice the current facets declare, with labels and current
  // answers -- what an editing surface renders.
  choices: PresentableChoice[]
  // Declared by a facet and not yet validly answered. A subset of `choices`.
  pendingChoices: PendingChoice[]
  // Facet-granted ids the active package does not declare (§8.2 rule 1).
  unresolvedGrants: string[]
}

export type DerivedCharacterResult =
  | { available: true; derived: DerivedCharacter }
  | { available: false; reason: 'character-not-found' }
  | { available: false; reason: 'no-catalogue-selection'; message: string }
  // The World has no Rules Package activated. Legal and common -- the
  // character still exists and the Sheet still renders its content; there
  // is simply nothing to derive (§10.2: "absence is a legal state").
  | { available: false; reason: 'rules-unconfigured'; message: string }
  // A package IS activated but failed to load or build. Deliberately
  // DISTINCT from unconfigured -- collapsing the two would turn a corrupt
  // package into "no rules configured" and hide the failure, which
  // world-runtime-service.ts names as the single most likely mistake here.
  | { available: false; reason: 'rules-broken'; message: string }

function describeBlueprint(blueprint: CharacterAssemblyBlueprint) {
  return {
    worldId: blueprint.worldId,
    characterId: blueprint.characterId,
    characterTitle: blueprint.characterTitle
  }
}

// The canonical entry point. Composes assembleCharacter -> getWorldRuntime
// -> buildActorState -> evaluate, in that order, and nothing else.
export async function getDerivedCharacter(
  worldId: string | number,
  characterId: string | number
): Promise<DerivedCharacterResult> {
  return getDerivedCharacterInternal(worldId, characterId, undefined)
}

// Character Progression Phase 1A -- SIMULATES this character's derived
// state as if their total level were `levelOverride`, without persisting
// anything (`buildActorState`'s own `levelOverride` input, threaded through
// unchanged). Used only by server/utils/character-progression-plan.ts to
// preview each level a Progression Plan would pass through, one evaluation
// per level, before anything is confirmed. Identical in every other respect
// to `getDerivedCharacter` above -- same assembly, same runtime, same
// evaluation -- so a preview and the real post-confirmation read can never
// honestly disagree about what a given level produces.
//
// Character Progression Phase 1B -- `tentativeAnswers` (optional, additive
// on top of this character's own REAL persisted `rulesChoices`, never
// replacing them) is how a Progression Plan preview evaluates "what would
// this level produce if the player picks THIS option" without persisting
// anything -- see server/utils/character-progression-plan.ts's own
// DEPENDENT CHOICES header for why an earlier step's tentative answer must
// stay applied while a LATER step is evaluated (this function is called
// once per level in that walk, always with the SAME full tentative-answer
// set, not just the one belonging to the step currently being built).
// Character Progression Phase 1C -- `tentativeSubclassRef` (optional,
// mirrors `tentativeAnswers` exactly): a NOT-YET-CONFIRMED subclass
// selection to assemble the character AS IF it were already chosen, so a
// LATER level's automatic consequences/choices can honestly reflect it
// during preview (see character-assembly.ts's own `assembleCharacter`
// `tentativeSubclassRef` doc comment -- this is threaded straight through,
// unchanged, never mutating anything persisted).
// D&D 2024 Character Rules Phase 2A.1 -- `tentativeFeatAcquisitions`
// mirrors `tentativeSubclassRef` exactly (see that parameter's own doc
// comment), generalized from one slot to a list for the reason
// character-assembly.ts's own `assembleCharacter` doc comment gives: a
// single preview can cross several ASI-tier levels at once.
export async function getDerivedCharacterAtLevel(
  worldId: string | number,
  characterId: string | number,
  levelOverride: number,
  tentativeAnswers?: Record<string, string[]>,
  tentativeSubclassRef?: { packageId: string; slug: string } | null,
  tentativeFeatAcquisitions?: readonly { choiceKey: string; ref: { packageId: string; slug: string } }[]
): Promise<DerivedCharacterResult> {
  return getDerivedCharacterInternal(
    worldId, characterId, levelOverride, tentativeAnswers, tentativeSubclassRef, tentativeFeatAcquisitions
  )
}

async function getDerivedCharacterInternal(
  worldId: string | number,
  characterId: string | number,
  levelOverride: number | undefined,
  tentativeAnswers?: Record<string, string[]>,
  tentativeSubclassRef?: { packageId: string; slug: string } | null,
  tentativeFeatAcquisitions?: readonly { choiceKey: string; ref: { packageId: string; slug: string } }[]
): Promise<DerivedCharacterResult> {
  const assembly = await assembleCharacter(worldId, characterId, tentativeSubclassRef, tentativeFeatAcquisitions)
  if (!assembly.available) {
    return assembly
  }

  const runtime = await getWorldRuntime(worldId)

  if (!runtime.configured) {
    return {
      available: false,
      reason: 'rules-unconfigured',
      message: 'This World has no Rules Package activated, so there is nothing to derive from this character\'s data.'
    }
  }

  if (!runtime.ok) {
    return {
      available: false,
      reason: 'rules-broken',
      message: `This World's active Rules Package failed to load (${runtime.stage}). Derived values are unavailable until it is repaired or a different version is activated.`
    }
  }

  const { registry, dependencyGraph, worldConfig, packageId, packageVersion } = runtime.runtime

  // Both lookups read the ACTIVE package's registry, so a choice is
  // resolved against the rules the World is actually running -- not against
  // whatever was current when the answer was stored.
  const choiceSetFor = (id: string) => {
    const definition = registry.getById(id)
    return definition && definition.kind === 'choiceSet' ? definition : null
  }

  // Character Progression Phase 1B -- the identical pattern, one kind over:
  // resolves a Progression id against the SAME active-package registry, so
  // a facet's `progression` reference is honored (or reported unresolved)
  // against the rules the World is actually running.
  const progressionFor = (id: string) => {
    const definition = registry.getById(id)
    return definition && definition.kind === 'progression' ? definition : null
  }

  // Character Progression Phase 1C -- tells the bridge which ChoiceSet ids
  // are Content-Catalogue-sourced, resolved against the SAME active-package
  // registry as every other lookup here.
  const isContentChoiceSet = (id: string) => {
    const definition = registry.getById(id)
    return Boolean(definition && definition.kind === 'choiceSet' && definition.from.kind === 'fromContentCatalogue')
  }

  // Character Progression Phase 1B -- tentative answers are laid ON TOP OF
  // this character's own real persisted `rulesChoices`, never replacing
  // them (a spread of the real `selections` map, then overwritten only by
  // the keys `tentativeAnswers` names) -- so a Plan preview can simulate
  // "what if I pick X" for a NOT-YET-CONFIRMED choice while every other
  // real, already-answered choice (creation-time or a prior CONFIRMED
  // progression level) still reads exactly as persisted. `undefined` (the
  // ordinary read path, every caller before this phase) is a no-op spread,
  // producing the exact same object `assembly.blueprint.rulesChoices`
  // already was.
  const rulesChoicesForEvaluation = tentativeAnswers && Object.keys(tentativeAnswers).length
    ? { selections: { ...(assembly.blueprint.rulesChoices?.selections ?? {}), ...tentativeAnswers } }
    : assembly.blueprint.rulesChoices

  const bridged = buildActorState({
    blueprint: assembly.blueprint,
    packageId,
    packageVersion,
    stateSchemaVersion: runtime.runtime.manifest.stateSchemaVersion,
    knownDefinition: (id) => registry.has(id),
    rulesChoices: rulesChoicesForEvaluation,
    lookupChoiceSet: choiceSetFor,
    lookupProgression: progressionFor,
    isContentChoiceSet,
    // Character Progression Phase 1A -- resolved via the active package's
    // OWN semantic-role binding (manifest.json's `semanticRoles.level`),
    // never hardcoded to `'value:level'` here: a future non-level-based
    // package simply has no 'level' role bound, and `levelDefinitionId`
    // is then `undefined`, which `buildActorState` already treats as a
    // no-op (see that function's own doc comment on this field).
    levelDefinitionId: registry.getBySemanticRole('level')?.id,
    levelOverride
  })

  // Labels are looked up ONCE per definition here rather than per consumer.
  const labelFor = (id: string): string | undefined => registry.getById(id)?.label

  const choices: PresentableChoice[] = bridged.declaredChoices.map((choice) => {
    const choiceSet = choiceSetFor(choice.choiceSetId)
    const optionLabels: Record<string, string> = {}

    for (const option of choice.options) {
      const label = labelFor(option)
      if (label) optionLabels[option] = label
    }

    const selected = bridged.actorState.choices[choice.key]

    return {
      ...choice,
      prompt: choiceSet?.prompt ?? 'Choose your options.',
      label: choiceSet?.label,
      answered: Array.isArray(selected),
      selected: Array.isArray(selected) ? (selected as string[]) : [],
      optionLabels,
      kind: 'definition' as const
    }
  })

  // Character Progression Phase 1C -- resolves each content-choice STUB the
  // bridge collected (it has no catalogue access) into a real, presentable
  // choice. Legal options: every `catalogue.subclasses` entry whose
  // `parentClassSlug` matches THIS character's own resolved class slug --
  // never every subclass in the catalogue, and never filtered by display
  // name (PARENT-CLASS FILTERING requirement). Current answer: this
  // character's own resolved `subclass` slot (persisted, or the tentative
  // override threaded through assembly) if resolved; otherwise a tentative
  // answer supplied for this exact key, if any; otherwise unanswered.
  //
  // D&D 2024 Character Rules Phase 2A.1 -- generalized to a SECOND
  // catalogue category, 'feats' (the ordinary ASI-tier Feat Selection
  // choice), alongside 'subclasses'. Legal options: every `catalogue.feats`
  // entry whose `featMechanics.category === 'general'` -- General is the
  // ONLY category this phase's own progression rows reference (Origin/
  // Fighting Style/Epic Boon feats use different ChoiceSets, not authored
  // this phase, see dnd5e-2024.ts's own FEAT AUDIT header) -- MINUS any
  // General feat this character already owns from a DIFFERENT acquisition
  // (a different `choiceKey`) whose `featMechanics.repeatable` is not
  // `true` (REPEATABILITY requirement: "the option resolver should exclude
  // already-owned non-repeatable feats"). Current answer: this exact
  // stub's own `choiceKey` resolved against `assembly.blueprint.feats` if
  // present there (persisted, or a tentative acquisition threaded through
  // assembly for THIS key specifically); otherwise a tentative answer
  // supplied for this exact key, if any; otherwise unanswered.
  if (bridged.contentChoices.length) {
    const catalogue = await getWorldContentCatalogue(worldId)
    const parentClassSlug = assembly.blueprint.class.status === 'resolved' ? assembly.blueprint.class.entry.slug : null

    const currentSubclassRef = assembly.blueprint.subclass?.status === 'resolved'
      ? { packageId: assembly.blueprint.subclass.entry.packageId, slug: assembly.blueprint.subclass.entry.slug }
      : null

    // Every OTHER acquired feat (any choiceKey but the one being resolved),
    // resolved, General-category, non-repeatable -- the exact set a legal
    // option list must exclude. Computed once per call, not per stub: the
    // set of owned feats does not depend on which stub is currently being
    // resolved, only which choiceKey is excluded from counting as "owned
    // elsewhere" (a stub must never exclude its own current answer from its
    // own option list, or a tentatively-answered choice would read as
    // `answered: false`).
    // A plain loop, not filter().map(): TypeScript does not narrow a union
    // array element's type across a separate `.map()` call from a boolean-
    // returning `.filter()` predicate, only within a single control-flow
    // block -- the `continue` form below lets `slot.status === 'resolved'`
    // correctly narrow `slot` to its `entry`-bearing variant before it is
    // read.
    const ownedFeatRefs = (excludeChoiceKey: string) => {
      const owned: { packageId: string; slug: string; repeatable: boolean }[] = []
      for (const slot of assembly.blueprint.feats ?? []) {
        if (slot.choiceKey === excludeChoiceKey || slot.status !== 'resolved') continue
        owned.push({
          packageId: slot.entry.packageId,
          slug: slot.entry.slug,
          repeatable: slot.entry.featMechanics?.repeatable === true
        })
      }
      return owned
    }

    for (const stub of bridged.contentChoices) {
      const choiceSet = choiceSetFor(stub.choiceSetId)
      const category = choiceSet && choiceSet.from.kind === 'fromContentCatalogue' ? choiceSet.from.category : null

      let legalOptions: typeof catalogue.subclasses = []

      if (category === 'subclasses' && parentClassSlug) {
        legalOptions = catalogue.subclasses.filter((entry) => entry.parentClassSlug === parentClassSlug)
      } else if (category === 'feats') {
        const owned = ownedFeatRefs(stub.key)
        legalOptions = catalogue.feats.filter((entry) => {
          if (entry.featMechanics?.category !== 'general') return false
          const ownedElsewhere = owned.find((ref) => ref.packageId === entry.packageId && ref.slug === entry.slug)
          // Not owned by any OTHER acquisition -- always legal. Owned
          // elsewhere -- legal again only if repeatable (Ability Score
          // Improvement's own real `repeatable: true`).
          return !ownedElsewhere || ownedElsewhere.repeatable
        })
      }

      const options = legalOptions.map((entry) => serializeContentRef({ packageId: entry.packageId, slug: entry.slug }))
      const optionLabels: Record<string, string> = {}
      for (const entry of legalOptions) {
        optionLabels[serializeContentRef({ packageId: entry.packageId, slug: entry.slug })] = entry.title
      }

      const tentative = tentativeAnswers?.[stub.key]

      const currentFeatSlot = category === 'feats'
        ? (assembly.blueprint.feats ?? []).find((slot) => slot.choiceKey === stub.key)
        : undefined
      const currentFeatRef = currentFeatSlot?.status === 'resolved'
        ? { packageId: currentFeatSlot.entry.packageId, slug: currentFeatSlot.entry.slug }
        : null

      const currentRef = category === 'subclasses' ? currentSubclassRef : currentFeatRef

      const selected = currentRef
        ? [serializeContentRef(currentRef)]
        : (Array.isArray(tentative) ? tentative : [])

      choices.push({
        key: stub.key,
        slot: stub.slot,
        choiceSetId: stub.choiceSetId,
        count: stub.count,
        prompt: choiceSet?.prompt ?? 'Choose your options.',
        label: choiceSet?.label,
        answered: selected.length === stub.count && selected.every((id) => options.includes(id)),
        selected,
        options,
        optionLabels,
        kind: 'content' as const
      })
    }
  }

  // ONE session for the whole projection, so the evaluator's own memo cache
  // does its job: `value:proficiency_bonus` is read by all six saves and all
  // eighteen skills, and is computed once.
  const session = new EvaluationSession(registry, dependencyGraph, bridged.actorState, {
    world: worldConfig.snapshot
  })

  const byCategory: Partial<Record<RuleCategory, DerivedValue[]>> = {}
  const collections: DerivedCollection[] = []
  const tables: DerivedTable[] = []

  for (const definition of registry.listAll()) {
    if (definition.kind === 'collection') {
      // Mirrors the `if (!category) continue` skip below for Values: an
      // uncategorised Collection has no region to render into.
      if (definition.category && definition.slots?.length) {
        collections.push({
          id: definition.id,
          label: definition.label,
          category: definition.category,
          slots: definition.slots
        })
      }
      continue
    }

    if (definition.kind === 'table') {
      // Mirrors the Collection branch immediately above: a Table with no
      // rows has nothing for a consumer to read and is omitted.
      if (definition.category && definition.rows?.length) {
        tables.push({
          id: definition.id,
          label: definition.label,
          category: definition.category,
          key: definition.key,
          columns: definition.columns,
          rows: definition.rows
        })
      }
      continue
    }

    if (definition.kind !== 'value') continue

    const category = definition.category
    if (!category) continue

    const result = evaluate(definition.id, session)
    const entry: DerivedValue = {
      id: definition.id,
      label: definition.label,
      category,
      tags: definition.tags
    }

    if (isRulesError(result)) {
      entry.error = result.message
    } else {
      entry.value = result
    }

    const group = byCategory[category]
    if (group) group.push(entry)
    else byCategory[category] = [entry]
  }

  return {
    available: true,
    derived: {
      ...describeBlueprint(assembly.blueprint),
      packageId,
      packageVersion,
      byCategory,
      collections,
      tables,
      choices,
      pendingChoices: bridged.pendingChoices,
      unresolvedGrants: bridged.unresolvedGrants
    }
  }
}
