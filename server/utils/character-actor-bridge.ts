// Character -> ActorState bridge -- rules-package-architecture.md §11.2,
// Step 6. This is the module three earlier tasks named as deliberately
// excluded work ("this task's own NON-GOALS exclude the actor bridge"), and
// the one the cancelled Character Phase 4 was blocked on.
//
// It does exactly one thing: TRANSLATE. It performs no I/O, no evaluation,
// and no arithmetic. Character data goes in; the structure the existing
// Rules Engine already expects comes out. Every number a player eventually
// sees is computed by the evaluator from this input, never here.
//
// ---------------------------------------------------------------------------
// PURE ON PURPOSE
// ---------------------------------------------------------------------------
// The caller supplies an already-assembled blueprint and the active
// package's identity; this module reads no Directus, no catalogue, and no
// files. That makes the whole Character -> ActorState translation testable
// with no mocks at all, which matters because it is the layer where a
// mistake is least visible: a wrong mapping here produces plausible numbers
// rather than an error.
//
// ---------------------------------------------------------------------------
// IT READS ONLY RULES FACETS, NEVER CONTENT
// ---------------------------------------------------------------------------
// The only thing this module reads about a Species, Class, or Background is
// its `rulesFacet` -- Definition IDs and literals (§8.2). It never touches
// `data` (the raw 5etools JSON), never touches `presentation`, and contains
// no 5etools field name and no D&D concept. Point it at a Pathfinder
// catalogue whose packs carry facets in a `pf2e` vocabulary and it works
// unchanged, because it does not know what a saving throw is.
//
// ---------------------------------------------------------------------------
// NOTHING DERIVED IS EVER STORED
// ---------------------------------------------------------------------------
// §11.2 states the requirement as "grants become derived Sources, never
// stored values," anticipating a mechanism where content grants arrive
// through the dynamic Source overlay. Two facts about the current system
// make a literal reading impossible today: the Core Character Rules package
// declares no SourceDefinitions for a facet to name, and `buildSourceOverlay`
// resolves `ActorState.sources` against Definitions that must exist in the
// registry -- so a synthesised Source has nothing to resolve to, and
// inventing one would require an engine change this step forbids.
//
// The GUARANTEE that requirement exists to protect is preserved in full, by
// a different mechanism: **the ActorState this module returns is itself
// derived.** It is rebuilt from the current facets on every read and is
// never persisted anywhere -- no Directus write, no cache, no
// `actor_rules_state` row. Repin a Content Pack to a version whose Fighter
// grants different saves and the very next read reflects it, which is
// exactly the property §11.2 protects against a materialised copy that
// "silently diverges."
//
// `facet.sources` IS wired through to `ActorState.sources` regardless, so
// the overlay path works the day a package declares a Source. It is empty
// today because nothing declares one, not because it is unimplemented.
//
// ---------------------------------------------------------------------------
// CHOICES: THE ANSWER IS TRANSLATED, THE CONSEQUENCE IS NOT COMPUTED
// ---------------------------------------------------------------------------
// `facet.choices` are declarations of QUESTIONS ("choose two skills from
// your class list"). The ANSWERS are stored player data, collected by the
// Builder and persisted under the `rules_choices` block.
//
// This module joins the two. For every choice a facet declares it looks for
// a stored answer, and:
//
//   answered validly  -> the answer is recorded in `ActorState.choices`, and
//                        each selected Definition is set in `values`
//   not answered, or
//   no longer valid   -> reported in `pendingChoices`, and nothing is set
//
// Setting `values[selected] = true` is the SAME operation a facet grant
// already performs, reached through the ChoiceSet's own `writesTo`
// declaration (§7.6: "writesTo makes the effect of a choice declarative").
// It is not a computed consequence: no bonus, modifier, or total is produced
// here. `value:skill.athletics.bonus` is still derived by the evaluator from
// `value:skill.athletics.proficient`, exactly as it is for a granted
// proficiency -- this module only reports which box the player ticked.
//
// A stored answer is NEVER trusted to still fit its question. It is
// re-validated on every read against the facet that is current NOW, because
// repinning a Content Pack can turn a valid answer into an invalid one with
// nothing having edited it. An answer that no longer fits reverts to
// outstanding rather than being partially applied.

import type { AssembledInventoryItem, CharacterAssemblyBlueprint, CharacterAssemblySlot } from './character-assembly'
// ---------------------------------------------------------------------------
// EQUIPMENT: STORED DECISIONS BECOME A COLLECTION, NOTHING IS COMPUTED
// ---------------------------------------------------------------------------
// `blueprint.inventory` (server/utils/character-inventory.ts, Character
// Assembly's catalogue join) is what a character carries and which of it is
// equipped or attuned -- all three player decisions, stored verbatim. This
// module's only job for them is the same one it already does for ability
// scores: copy them into the shape the engine expects and stop.
//
// Every item is translated, resolved or not. `equipped`/`attuned` are facts
// about what the player marked, independent of whether that item's Content
// Pack still resolves -- a broken reference does not un-attune anything, the
// same way losing your reading glasses does not un-read the book. What the
// Rules Package does with these booleans (count them, compare against a
// limit) is entirely its own authored content
// (rules-package-architecture.md §7 -- the `collection:equipment`
// CollectionDefinition and its Category 13 Values); this module knows only
// the fixed key name the package's own vocabulary declares, exactly as
// `abilityValueId` already hardcodes `value:ability.<key>`.
//
// `category`/`slot`/`requiresAttunement` are facts about the ITEM
// (content), not the player, so `equipped`/`attuned` alone are never the
// whole story. They arrive via `entry.rulesFacet.collectionFields`
// (app/lib/content-rules/types.ts's `RulesFacetCollectionFields`) --
// exactly the same "content declares, bridge relays, engine evaluates"
// shape a Class's `grants` already uses, just per-item instead of
// per-character (see that type's own header for why `grants` cannot do
// this job). An item with no facet -- adventuring gear, tools, anything
// XPHB's own facet corpus has no entry for -- contributes none of these
// three keys, and `equipmentCollectionItems` below writes the same default
// every unfaceted item would otherwise be missing -- see that function's
// own note on why the engine will NOT fill a missing field in from the
// Collection's declared default on its own.
//
// ARMOR carries a fourth, optional group through the exact same path:
// `sourceRef`/`armorClass`/`dexCapMin`/`dexCapMax` -- code for THIS module
// is unchanged for it, because `collectionFieldsFor`'s spread already
// forwards whatever a facet declares, key-for-key, with no per-field
// knowledge here of what any of them mean. `sourceRef` (a Definition ID
// naming `source:equipment.armor`) is what makes the equipment Collection's
// declared `sourceRefField` do anything at all: the engine's Source Overlay
// (app/lib/rules/source-overlay.ts, unmodified) instantiates one
// `ResolvedSourceInstance` per item whose `sourceRef` resolves, and the
// Modifier that Source declares reads `armorClass`/`dexCapMin`/`dexCapMax`
// straight back off the SAME item via `@source:<field>` -- see
// dnd5e-2024.ts's own note on why `equipped` becomes the Modifier's
// `condition` rather than something this bridge branches on: the toggle a
// player already flips in Inventory is the ONLY thing that turns Armor
// Class on or off, and this module never touches it beyond copying it
// through.
import type { RulesFacet, RulesFacetChoice, RulesFacetLiteral } from '../../app/lib/content-rules'
import {
  resolveChoiceTarget,
  selectionsFor,
  toResolvableChoice,
  toResolvableProgressionChoice,
  validateChoiceSelection,
  type ResolvableChoice,
  type StoredRulesChoices
} from '../../app/lib/characters/rules-choices'
import { ABILITY_KEYS } from '../../app/lib/characters/ability-scores'
import { totalCharacterLevel } from '../../app/lib/characters/progression'
import type {
  ActorState,
  CollectionInstanceItem,
  DefinitionId,
  ProgressionDefinition,
  RuleValue,
  SourceInstance
} from '../../app/lib/rules/types'

// ---------------------------------------------------------------------------
// PROGRESSION: THE DORMANT `kind:'progression'` SEAM, NOW CONSUMED --
// Character Progression Phase 1B
// ---------------------------------------------------------------------------
// `RulesFacet.progression` names a `ProgressionDefinition` the active
// package declares (rules-package-architecture.md §7.5) -- Character
// Progression Phase 1A's own audit found the shape fully designed (`keyedBy`
// + `rows[].{at,grants,sets}`) but completely unconsumed: zero real
// instances shipped, and `evaluate()`/the dependency graph both treat
// `kind:'progression'` as an intentional no-op (Step 2's own scope). This
// module is that missing consumer, for exactly the same reason it already
// is the one consumer of `facet.choices`/`facet.grants`/`facet.sources`:
// a Progression's rows describe what a SPECIFIC character level unlocks,
// and this bridge is the one place "this character's own current level" and
// "this package's own declared facts" already meet.
//
// ONLY EVER EVALUATED WHEN `keyedBy` MATCHES THE BRIDGE'S OWN KNOWN LEVEL
// FACT. This bridge runs BEFORE evaluation (§11.2) -- it has no general
// "resolve any Definition's current value" capability, only the specific
// stored/input facts it already translates (ability scores, health, and,
// since Phase 1A, level via `input.levelDefinitionId`/`levelOverride`). A
// Progression whose `keyedBy` names anything else is therefore honestly
// out of this bridge's reach and is left un-evaluated (its `grants`/`sets`/
// `choices` never apply) rather than guessed at -- every real Progression
// this package declares today (and every one 5e's own rules describe:
// nothing in D&D gates content on anything but character/class level) is
// keyed by the level Definition, so this is not a practical limitation
// today, only an honestly-scoped one.
//
// CUMULATIVE, NOT "ONLY AT THE ENTERED LEVEL": a row whose `at` is at or
// below the character's CURRENT level stays active (`rowAt <= currentLevel`)
// -- the same "once unlocked, stays unlocked" semantics `facet.grants`/
// `facet.sources` already have unconditionally. A level-2 Wizard's row-2
// facts remain active at level 5; nothing here models a fact "expiring."
// Which row was reached MOST RECENTLY (relevant only for a Level Manager
// walking one level at a time) is entirely
// server/utils/character-progression-plan.ts's own job -- this function
// answers "what applies right now," never "what changed this step."
//
// `row.grants` (a `DefinitionId[]`) becomes SourceInstances, exactly
// mirroring `facet.sources` immediately above and matching this seam's own
// designed intent verbatim (types.ts's own ProgressionRow header: "changes
// an actor's active set of Sources through the dynamic Source overlay").
// `row.sets` (a `Record<DefinitionId, RuleValue>`) becomes direct `values`
// writes, mirroring `facet.grants`'s own `set`/`to` shape exactly -- the
// two are deliberately parallel, restated at two different layers (see
// `ProgressionRow.choices`'s own header, types.ts, for why `rules/` never
// imports `content-rules/`). `row.choices` joins the EXACT SAME
// `declaredChoices`/`pendingChoices`/`answeredChoices` pipeline
// `facet.choices` already populates below, keyed by
// `progressionChoiceKey(slot, row.at, choiceSetId)` rather than
// `choiceKey(slot, choiceSetId)` -- see that function's own header
// (rules-choices.ts) for why the two can never collide even when they
// happen to name the same ChoiceSet.

// The catalogue-backed slots, in the order their grants are applied. Later
// wins on conflict. The order is Species -> Class -> Subclass -> Background
// because it runs least-specific to most-specific, and because it matches
// the order the Builder asks for them -- a player who set something in a
// later step should not have it silently overridden by an earlier one.
// Nothing in the current corpus actually collides; the order is declared so
// that the first collision has a defined answer rather than an accidental
// one.
//
// Character Progression Phase 1C -- `subclass` added right after `class`
// (its parent): a selected subclass's RulesFacet reaches this bridge
// through this exact same slot-consumption loop, not a special case. It is
// resolved via `progression.classes[].subclassRef` (server/utils/
// character-assembly.ts's own new `subclass` blueprint field) -- `missing`
// (never resolved) for every character before this phase, which is a
// legal, inert state this loop already handles uniformly for every slot.
const SLOT_ORDER = ['species', 'class', 'subclass', 'background'] as const

// D&D 2024 Character Rules Phase 2A.1 -- widened from the closed
// `(typeof SLOT_ORDER)[number]` union to plain `string`. A feat acquisition
// is consumed through this EXACT same per-slot machinery (see
// `consumeFacet`/the new feat loop below) but there are as many feat
// "slots" as a character has acquired feats, each identified by its own
// `feat:${choiceKey}` -- a closed four-member union cannot name an
// unbounded set. Nothing downstream exhaustively switches over this type
// (confirmed by tracing every consumer: character-derived.ts treats
// `choice.slot`/`stub.slot` as an opaque label, never a discriminant), so
// this widening changes no behavior for the four original slots.
export type ActorBridgeSlotKey = string

// A choice a facet declared and nobody has answered. Surfaced so a future
// Builder step (or a diagnostic UI) can see what is outstanding, without
// this module pretending to resolve it.
//
// The slot is named `slot`, not `from`: `RulesFacetChoice` already has a
// `from` (the option list), and intersecting two different `from` types
// would silently collapse the field to `never`.
export type PendingChoice = RulesFacetChoice & {
  // Which slot's facet declared it -- a choice is meaningless without
  // knowing whether the Class or the Background is asking.
  slot: ActorBridgeSlotKey
  // The identity an answer is stored under, `slot:choiceSetId`. Carried on
  // the pending record so a consumer that wants to ANSWER this choice does
  // not have to reconstruct the key and risk disagreeing about its shape.
  key: string
}

// Character Progression Phase 1C -- the minimal stub a content-shaped
// progression-row choice contributes. Deliberately NOT a full
// ResolvableChoice: this bridge has no Content Catalogue access (it is
// "PURE ON PURPOSE"), so it cannot know the real legal options, only THAT a
// content choice was declared, by whom, and how many picks it requires.
// character-derived.ts (which already has catalogue access via
// assembleCharacter) resolves this stub into a real, presentable choice.
export type PendingContentChoiceStub = {
  key: string
  slot: ActorBridgeSlotKey
  choiceSetId: string
  count: number
}

export type ActorBridgeResult = {
  actorState: ActorState
  // EVERY choice the current facets declare, answered or not, in slot order
  // -- the question list an editing surface renders. Separate from
  // `pendingChoices` because an editor must show answered choices too (so
  // they can be changed), while a "still outstanding" notice must not.
  declaredChoices: ResolvableChoice[]
  // Every choice declared by a facet and not yet validly answered (see the
  // header). A subset of `declaredChoices`.
  pendingChoices: PendingChoice[]
  // Character Progression Phase 1C -- every content-shaped progression-row
  // choice declared by an active row, regardless of answered state (unlike
  // `pendingChoices`, this bridge cannot determine "answered" for a content
  // choice at all, since that requires catalogue + `progression.classes[].
  // subclassRef` resolution it has no access to -- character-derived.ts
  // owns that). Empty for every character/package that predates this
  // phase.
  contentChoices: PendingContentChoiceStub[]
  // Facet-granted Definition IDs that the ACTIVE Rules Package does not
  // declare. §8.2 rule 1: an unresolved reference is surfaced, never a
  // silent no-op. Populated only when the caller supplies `knownDefinition`.
  unresolvedGrants: string[]
  // D&D 2024 Character Rules Phase 2A.2 -- every Resource Definition id
  // this character currently has ACCESS TO, collected from `facet.resources`
  // (every SLOT_ORDER slot plus every acquired feat, via `consumeFacet`
  // exactly like `facet.sources` already is) and from `row.resources` on
  // every active Progression row (`rowAt <= currentLevel`, exactly like
  // `row.grants` already is). This is RESOURCE AVAILABILITY, not Resource
  // EVALUATION -- the bridge is "PURE ON PURPOSE" (this file's own header)
  // and performs no `evaluate()` call of any kind; a caller with registry
  // access (character-derived.ts) resolves each id into its real maximum/
  // recovery/presentation. De-duplicated (a `Set` internally) and in
  // first-encountered order -- the same two Sources being granted twice by
  // two different facets would be a harmless, order-stable duplicate here,
  // mirroring how a duplicate `facet.sources` entry already behaves
  // (two identical SourceInstances, not an error).
  acquiredResourceIds: DefinitionId[]
}

export type ActorBridgeInput = {
  blueprint: CharacterAssemblyBlueprint
  // The ACTIVE package's identity. ActorState records which package its
  // stored values were written against (§13.1), and this is that record.
  packageId: string
  packageVersion: string
  stateSchemaVersion: number
  // Optional registry predicate. When supplied, a granted id the package
  // does not declare is collected into `unresolvedGrants` instead of being
  // written into `values` -- so a facet naming a renamed Definition surfaces
  // as a diagnostic rather than as a value nothing will ever read.
  knownDefinition?: (id: string) => boolean
  // The player's stored answers, or null when none were recorded. Absent
  // answers are not an error: every choice simply reads as outstanding.
  rulesChoices?: StoredRulesChoices | null
  // Resolves a ChoiceSet id to its `writesTo` template. Optional because
  // this module stays pure and registry-free; `character-derived.ts` supplies
  // it from the active package. Without it, a selected option is taken to BE
  // its own target -- which is what the authored corpus produces anyway,
  // since a facet's `from` is typed `DefinitionId[]` (see
  // resolveChoiceTarget).
  // Character Progression Phase 1C -- `writesTo` itself is now optional on
  // the real ChoiceSetDefinition (a Content-kind ChoiceSet has none, per
  // app/lib/rules/types.ts's own doc comment). `applyChoice` already
  // treats an absent `writesTo` correctly (falls back to "the option is its
  // own target"), so widening this signature to match is a pure type
  // correction, not a behavior change.
  //
  // D&D 2024 Character Rules Phase 2A.1 -- `effect`/`resultCap`/`distinct`
  // added, mirroring the three new ChoiceSetDefinition fields exactly
  // (app/lib/rules/types.ts). `effect`/`distinct` are read by `applyChoice`
  // below; `resultCap` is NOT read by this module at all (this bridge
  // performs no evaluation and has no derived-value access to check a cap
  // against) -- it is carried on the lookup purely so a caller with
  // registry access (character-derived.ts) could thread it to a validator
  // that does; relayed here only for type completeness, matching how
  // `lookupProgression`'s own return type already carries fields this
  // module reads selectively, not exhaustively.
  lookupChoiceSet?: (id: string) => {
    writesTo?: string
    effect?: 'set-value' | 'activate-source'
    resultCap?: number
    distinct?: boolean
  } | null | undefined
  // Character Progression Phase 1A -- the active package's own Definition
  // id for "the level concept," resolved via `registry.getBySemanticRole('level')`
  // by character-derived.ts (never hardcoded here, matching this module's
  // own "no game vocabulary" rule -- a future non-level-based package simply
  // has no such role bound, and this stays a no-op for it). Optional for the
  // same reason `lookupChoiceSet` is: this module stays pure and
  // registry-free.
  levelDefinitionId?: string
  // Character Progression Phase 1A -- overrides `blueprint.progression`'s own
  // total level for ONE evaluation, without persisting anything. Used only
  // by server/utils/character-progression-plan.ts to simulate what an
  // UNCOMMITTED target level would produce (the Progression Plan's own
  // per-level automatic-consequence preview) -- omitted (the default,
  // ordinary read path) uses this character's own actually-stored level.
  levelOverride?: number
  // Character Progression Phase 1B -- resolves a Progression id
  // (`RulesFacet.progression`) to its declared `{keyedBy, rows}`, mirroring
  // `lookupChoiceSet` exactly (optional, registry-backed, supplied by
  // character-derived.ts from the active package). Without it, no facet's
  // `progression` is ever consumed -- the same "absent means no-op, never a
  // hard failure" contract `lookupChoiceSet` already has, since a package
  // that declares no real Progression instance (every package before this
  // phase) must keep behaving exactly as it always did.
  lookupProgression?: (id: string) => Pick<ProgressionDefinition, 'keyedBy' | 'rows'> | null | undefined
  // Character Progression Phase 1C -- tells this bridge which ChoiceSet ids
  // are Content-Catalogue-sourced (e.g. subclass selection), so their
  // progression-row entries are skipped in the Definition-choice loop
  // instead of being treated as an unanswerable Definition choice with zero
  // options. Optional, registry-backed, supplied by character-derived.ts
  // (checks `definition.kind === 'choiceSet' && definition.from.kind ===
  // 'fromContentCatalogue'`) -- unset (every caller predating this phase)
  // skips nothing, byte-identical old behavior.
  isContentChoiceSet?: (choiceSetId: string) => boolean
}

// Character Progression Phase 1C -- `slot` accepts `undefined` defensively:
// a blueprint built by a test fixture (or any future caller) that predates
// the `subclass` field simply has no key for it, and an absent slot is
// exactly as legal/inert as an explicitly `missing` one -- never a crash.
function facetFor(slot: CharacterAssemblySlot | undefined): RulesFacet | null {
  return slot?.status === 'resolved' ? slot.entry.rulesFacet ?? null : null
}

// The one place ability scores become Definition IDs. `value:ability.<key>`
// is the Rules Package's naming, and ABILITY_KEYS is the same six-key list
// the Builder and the storage layer already share -- so a mismatch between
// what a player entered and what the engine reads is impossible by
// construction rather than by convention.
function abilityValueId(key: string): string {
  return `value:ability.${key}`
}

// The Rules Package's own collection id -- the equipment counterpart of
// `abilityValueId` above. Fixed for the same reason: this is the package's
// vocabulary, not a piece of content, so there is nothing to look up.
const EQUIPMENT_COLLECTION_ID = 'collection:equipment'

// Reads the equipment-collection field values a resolved item's Rules Facet
// declares -- `{}` for a custom item, a missing/broken reference, or a
// resolved item whose facet declares no `collectionFields` entry naming
// this collection (adventuring gear, tools: content with none presents but
// does not mechanise, §8.2 rule 4).
function collectionFieldsFor(
  item: AssembledInventoryItem,
  collectionId: string
): Record<string, RulesFacetLiteral> {
  if (item.status !== 'resolved') return {}

  const facet = item.entry?.rulesFacet
  const declared = facet?.collectionFields?.find((entry) => entry.collection === collectionId)
  return declared?.fields ?? {}
}

// EVERY itemSchema field this collection declares is written EXPLICITLY on
// every item, never left absent for the engine to fill in from the
// Collection's own declared `default`. Verified directly against the
// evaluator: a `[key]` / `[key = "x"]` predicate over a field genuinely
// ABSENT from an item does not fall back to the schema default -- it falls
// back to comparing the predicate's own literal operand as plain text
// (evaluator.ts's literal-as-field-reference case checks only `key in
// itemScope`, with no schema lookup on a miss). A boolean field's schema
// default of `false` would therefore read as a truthy STRING if a future
// definition ever filtered on it while the field was left unset -- the
// opposite of the intended default. Writing every field here, defaulted to
// the same value the schema declares, closes that gap before any real
// definition exercises it.
function equipmentCollectionItems(inventory: readonly AssembledInventoryItem[]): CollectionInstanceItem[] {
  return inventory.map((item) => {
    const facetFields = collectionFieldsFor(item, EQUIPMENT_COLLECTION_ID)

    return {
      instanceId: item.instanceId,
      equipped: item.equipped,
      attuned: item.attuned,
      // Mirrors collection:equipment's own declared defaults (definitions.json).
      category: 'gear',
      slot: '',
      requiresAttunement: false,
      ...facetFields
    }
  })
}

export function buildActorState(input: ActorBridgeInput): ActorBridgeResult {
  const { blueprint } = input
  const values: Record<string, RuleValue> = {}
  const collections: Record<string, CollectionInstanceItem[]> = {
    [EQUIPMENT_COLLECTION_ID]: equipmentCollectionItems(blueprint.inventory)
  }
  const sources: SourceInstance[] = []
  const declaredChoices: ResolvableChoice[] = []
  const pendingChoices: PendingChoice[] = []
  const unresolvedGrants: string[] = []
  const contentChoices: PendingContentChoiceStub[] = []
  const answeredChoices: Record<string, RuleValue> = {}
  // D&D 2024 Character Rules Phase 2A.2 -- see ActorBridgeResult's own
  // `acquiredResourceIds` doc comment. A `Set` so the SAME resource id
  // declared by two different facets/rows (unusual, but not forbidden)
  // still produces one entry, not a duplicate.
  const acquiredResourceIds = new Set<DefinitionId>()

  // --- Ability scores: the player's own data, copied verbatim ------------
  // Absent scores are left absent rather than defaulted to 10 here. The
  // Rules Package already declares each ability's default, and letting the
  // engine apply it keeps ONE source of that number instead of two that can
  // disagree (§13.2's stored/derived invariant, applied to defaults).
  if (blueprint.abilityScores) {
    for (const key of ABILITY_KEYS) {
      values[abilityValueId(key)] = blueprint.abilityScores.scores[key]
    }
  }

  // --- Level: the player's own data (or a simulated override), copied
  // verbatim -- Character Progression Phase 1A ------------------------------
  // Mirrors ability scores/health immediately above and below: a stored
  // fact, copied through, never computed here. `totalCharacterLevel` already
  // defaults to 1 when `blueprint.progression` has no entries (every
  // character predating this phase) -- the identical number `value:level`'s
  // own Rules Engine default would produce if this were omitted entirely, so
  // writing it explicitly here changes nothing for those characters and is
  // only ever a real override once a Level Manager transition has actually
  // been confirmed. Skipped entirely when the active package has no 'level'
  // semantic role bound (`levelDefinitionId` absent) -- this module must
  // never assume every package has a level concept at all.
  if (input.levelDefinitionId) {
    values[input.levelDefinitionId] = input.levelOverride ?? totalCharacterLevel(blueprint.progression)
  }

  // --- Health: the player's own data, copied verbatim ---------------------
  // Same posture as ability scores immediately above: absent when nothing
  // was ever recorded, rather than defaulted here, so the Value's own
  // `default: 0` (definitions.json) is the one place that number lives.
  // `hit_points.max` is NEVER written here -- it has no stored form to copy
  // from (see health.ts's own header on why), only a formula the evaluator
  // resolves from `hit_points.hit_die_size` (a Class grant, applied below,
  // unchanged by this addition), `ability.con.mod`, and `level`.
  if (blueprint.health) {
    values['value:hit_points.current'] = blueprint.health.currentHp
    values['value:hit_points.temp'] = blueprint.health.temporaryHp
    values['value:hit_points.hit_dice_spent'] = blueprint.health.hitDiceSpent
    values['value:death_saves.successes'] = blueprint.health.deathSaves.successes
    values['value:death_saves.failures'] = blueprint.health.deathSaves.failures
  }

  // Shared by both the creation-time loop (`facet.choices`) and the
  // Progression loop (`row.choices`) below -- one place that resolves a
  // declared choice against a stored answer and applies what a valid answer
  // MEANS, so the two can never independently drift on how an answer is
  // validated or written. `resolvable` already carries the correct KEY for
  // whichever caller built it (`toResolvableChoice` vs.
  // `toResolvableProgressionChoice`) -- this helper never constructs one
  // itself.
  function applyChoice(resolvable: ResolvableChoice, choiceLike: RulesFacetChoice, slotKey: ActorBridgeSlotKey) {
    const key = resolvable.key
    declaredChoices.push(resolvable)

    const validation = validateChoiceSelection(resolvable, selectionsFor(input.rulesChoices, key))

    if (!validation.ok) {
      pendingChoices.push({ ...choiceLike, slot: slotKey, key })
      return
    }

    // The answer itself -- the player's decision, recorded verbatim.
    answeredChoices[key] = [...validation.selected]

    // ...and what the ChoiceSet says that answer MEANS.
    const choiceSetInfo = input.lookupChoiceSet?.(resolvable.choiceSetId)
    const writesTo = choiceSetInfo?.writesTo

    // D&D 2024 Character Rules Phase 2A.1 -- `effect: 'activate-source'`
    // (app/lib/rules/types.ts's own header has the full reasoning). Indexed
    // rather than deduped: `distinct: false` (validated above by
    // `validateChoiceSelection`) permits the SAME selected option to appear
    // more than once in `validation.selected` -- e.g. `['str','str']` for
    // "+2 Strength" -- and each occurrence must become its OWN
    // SourceInstance so the Modifier pipeline's `stack` policy sums them
    // (two independently-activated +1 Sources = +2), never collapse to one.
    if (choiceSetInfo?.effect === 'activate-source') {
      validation.selected.forEach((selected, index) => {
        const target = writesTo ? resolveChoiceTarget(writesTo, selected) : selected

        if (input.knownDefinition && !input.knownDefinition(target)) {
          unresolvedGrants.push(target)
          return
        }

        sources.push({
          // Deterministic, matching every other SourceInstance id this
          // bridge builds: the same answer must produce the same ids on
          // every read. `index` (not `selected`) disambiguates two
          // activations of the identical target.
          instanceId: `${slotKey}:${key}:${index}`,
          sourceRef: target,
          origin: { kind: 'declared' }
        })
      })
      return
    }

    // The default, pre-Phase-2A.1 behavior -- sets the same boolean a facet
    // grant sets, unchanged for every choice authored before this phase.
    for (const selected of validation.selected) {
      const target = writesTo ? resolveChoiceTarget(writesTo, selected) : selected

      if (input.knownDefinition && !input.knownDefinition(target)) {
        unresolvedGrants.push(target)
        continue
      }

      values[target] = true
    }
  }

  // --- Facet grants, sources, choices, and Progression --------------------
  // D&D 2024 Character Rules Phase 2A.1 -- factored into `consumeFacet` so
  // the identical grants/sources/choices/progression consumption applies
  // uniformly to the four fixed SLOT_ORDER slots AND to an unbounded list
  // of acquired feats (see the feat loop immediately below this one) -- one
  // consumption rule, two callers, never a second copy that could drift.
  function consumeFacet(slotKey: string, facet: RulesFacet | null) {
    if (!facet) return

    for (const grant of facet.grants ?? []) {
      if (input.knownDefinition && !input.knownDefinition(grant.set)) {
        unresolvedGrants.push(grant.set)
        continue
      }
      values[grant.set] = grant.to
    }

    for (const sourceRef of facet.sources ?? []) {
      if (input.knownDefinition && !input.knownDefinition(sourceRef)) {
        unresolvedGrants.push(sourceRef)
        continue
      }
      sources.push({
        // Deterministic, never random: the same character must produce a
        // byte-identical ActorState on every read, or nothing downstream can
        // be cached, compared, or reasoned about.
        instanceId: `${slotKey}:${sourceRef}`,
        sourceRef,
        origin: { kind: 'declared' }
      })
    }

    // D&D 2024 Character Rules Phase 2A.2 -- always-on resource access
    // (Rage, Bardic Inspiration, Sorcery Points, Lay on Hands, ...),
    // consumed through the SAME `consumeFacet` path as `facet.sources`
    // immediately above, so every SLOT_ORDER slot AND every acquired feat
    // grants resource access identically (no special-casing which kind of
    // facet names a resource).
    for (const resourceId of facet.resources ?? []) {
      if (input.knownDefinition && !input.knownDefinition(resourceId)) {
        unresolvedGrants.push(resourceId)
        continue
      }
      acquiredResourceIds.add(resourceId)
    }

    for (const choice of facet.choices ?? []) {
      // Shared with the Builder so both ask the identical question -- see
      // toResolvableChoice. A facet with no `from` offers nothing, which
      // validates as answerable only at count 0: correct, not a special case.
      // D&D 2024 Character Rules Phase 2A.1 -- `distinct` threaded through
      // from the ChoiceSet's own declaration (the Builder, which has no
      // registry access, never passes one -- see toResolvableChoice's own
      // doc comment for why that is correct).
      const distinct = input.lookupChoiceSet?.(choice.choiceSet)?.distinct
      applyChoice(toResolvableChoice(slotKey, choice, distinct), choice, slotKey)
    }

    // Character Progression Phase 1B -- see this file's own PROGRESSION
    // header above for the full reasoning (keyedBy scoping, cumulative
    // activation, grants-as-Sources). Only ever runs when this facet names
    // one AND a lookup was supplied AND this bridge knows how to resolve
    // `keyedBy`'s current value at all -- every condition already false for
    // every package/facet that predates this phase, so this is a pure
    // addition with no behavior change for them.
    //
    // Character Progression Phase 1C -- `facet.progression` widened to an
    // array (app/lib/content-rules/types.ts's own doc comment explains why:
    // a class may independently opt into more than one ProgressionDefinition,
    // e.g. Wizard's own Expertise progression AND the generic, shared
    // subclass-selection progression every class can reference). Looped
    // rather than singular; every existing single-id package/facet becomes
    // a one-element array with byte-identical behavior.
    for (const progressionId of facet.progression ?? []) {
      const progressionDef = input.lookupProgression?.(progressionId)

      // §8.2 rule 1, restated for `facet.progression` the same way it already
      // applies to `facet.grants`/`facet.sources`/`facet.choices` above -- an
      // unresolved reference is surfaced, never a silent no-op. ONLY when the
      // caller actually asked for verification (`lookupProgression` supplied,
      // mirroring `knownDefinition`'s own opt-in contract -- choices.put.ts's
      // own call site never supplies it, and must stay exactly as silent as
      // it always was). This is the diagnostic that was MISSING for the real
      // production defect a fresh Wizard's Level 2 Scholar/Expertise choice
      // hit: the active World's published Rules Package predated this
      // package's own `progression:class.skill-expertise` Definition, so
      // `progressionDef` was `null` here with nothing reporting it -- the
      // whole Progression silently behaved as if the facet had never named
      // one at all. Reported here now so a stale/unpublished package
      // reference is visible in `unresolvedGrants` (the Character Sheet's own
      // existing "something this package doesn't declare" surface) instead of
      // looking identical to "this class has no Progression."
      if (input.lookupProgression && !progressionDef) {
        unresolvedGrants.push(progressionId)
        continue
      }

      if (!progressionDef || !input.levelDefinitionId || progressionDef.keyedBy !== input.levelDefinitionId) {
        continue
      }

      const currentLevel = input.levelOverride ?? totalCharacterLevel(blueprint.progression)

      for (const row of progressionDef.rows) {
        const rowAt = typeof row.at === 'number' ? row.at : Number(row.at)
        // A row whose own `at` cannot be read as a number can never be
        // reached by a numeric character level -- skipped rather than
        // guessed at, the same "absence of a safe reading is not a reason
        // to fabricate one" rule this bridge already applies elsewhere.
        if (!Number.isFinite(rowAt) || rowAt > currentLevel) continue

        for (const [definitionId, value] of Object.entries(row.sets ?? {})) {
          if (input.knownDefinition && !input.knownDefinition(definitionId)) {
            unresolvedGrants.push(definitionId)
            continue
          }
          values[definitionId] = value
        }

        for (const grantId of row.grants ?? []) {
          if (input.knownDefinition && !input.knownDefinition(grantId)) {
            unresolvedGrants.push(grantId)
            continue
          }
          sources.push({
            instanceId: `${slotKey}:progression:${rowAt}:${grantId}`,
            sourceRef: grantId,
            origin: { kind: 'declared' }
          })
        }

        // D&D 2024 Character Rules Phase 2A.2 -- LEVEL-GATED resource
        // access (Monk's Focus Points at level 2, Fighter's Action Surge
        // at level 2, Battle Master's Superiority Dice at subclass level
        // 3, ...), mirroring `row.grants` immediately above exactly: only
        // rows at or below the character's CURRENT level are active (the
        // same `rowAt <= currentLevel` gate this whole loop already
        // enforces), and a row's resource ids are reported unresolved
        // under the identical `knownDefinition` check every other
        // row-level reference already uses.
        for (const resourceId of row.resources ?? []) {
          if (input.knownDefinition && !input.knownDefinition(resourceId)) {
            unresolvedGrants.push(resourceId)
            continue
          }
          acquiredResourceIds.add(resourceId)
        }

        for (const choice of row.choices ?? []) {
          // Character Progression Phase 1C -- a row's choice may now be
          // Content-Catalogue-sourced (e.g. subclass selection) rather than
          // Definition-sourced. `applyChoice` (below) is a pure Definition
          // writer -- it has no `writesTo` to resolve and no Content
          // Catalogue access to find legal options against (this bridge is
          // "PURE ON PURPOSE": no I/O, no catalogue). A content-shaped
          // choice is therefore entirely SKIPPED here, never added to
          // `declaredChoices`/`pendingChoices`/`answeredChoices` -- its
          // presentation and resolution belong entirely to
          // server/utils/character-progression-plan.ts, which already has
          // World Content Catalogue access and already builds
          // `ProgressionChoice[]` by walking these same rows. This bridge's
          // job for a content choice is limited to what happens AFTER it is
          // answered: once `progression.classes[].subclassRef` resolves to
          // a real catalogue entry, that entry's OWN RulesFacet reaches this
          // bridge through the normal subclass slot (see SLOT_ORDER below),
          // not through this choice-application loop at all.
          // `input.isContentChoiceSet` (optional, mirrors every other opt-in
          // lookup here) tells this bridge which choiceSetIds are
          // content-shaped, so it can skip them without needing to know
          // what "subclass" means -- an unset lookup (every caller that
          // predates this phase) skips nothing, byte-identical old behavior.
          if (input.isContentChoiceSet?.(choice.choiceSet)) {
            const resolvable = toResolvableProgressionChoice(slotKey, rowAt, choice)
            contentChoices.push({
              key: resolvable.key,
              slot: slotKey,
              choiceSetId: choice.choiceSet,
              count: choice.count
            })
            continue
          }

          // D&D 2024 Character Rules Phase 2A.1 -- `distinct` threaded
          // through, identical reasoning to the creation-time loop above.
          const distinct = input.lookupChoiceSet?.(choice.choiceSet)?.distinct
          applyChoice(toResolvableProgressionChoice(slotKey, rowAt, choice, distinct), choice, slotKey)
        }
      }
    }
  }

  for (const slotKey of SLOT_ORDER) {
    consumeFacet(slotKey, facetFor(blueprint[slotKey]))
  }

  // D&D 2024 Character Rules Phase 2A.1 -- every acquired feat's own facet
  // reaches this bridge through the EXACT same `consumeFacet` path as a
  // named slot, just looped over `blueprint.feats` instead of SLOT_ORDER.
  // This is what makes the Ability Score Improvement feat's own NESTED
  // ability-distribution choice (its facet's own `choices` field) surface
  // automatically the moment the feat is acquired -- no special-cased
  // "second choice" mechanism exists anywhere in this bridge; it is the
  // SAME declaredChoices/pendingChoices pipeline every other facet choice
  // already goes through. `slotKey` is `feat:${choiceKey}`, unique PER
  // ACQUISITION rather than per feat identity -- the same repeatable feat
  // taken twice produces two distinct slot keys, so their own
  // SourceInstance/choice-answer ids never collide.
  for (const featSlot of blueprint.feats ?? []) {
    consumeFacet(`feat:${featSlot.choiceKey}`, facetFor(featSlot))
  }

  const actorState: ActorState = {
    actorId: `entity:${blueprint.characterId}`,
    packageId: input.packageId,
    packageVersion: input.packageVersion,
    stateSchemaVersion: input.stateSchemaVersion,
    values,
    collections,
    // The player's answers, keyed `slot:choiceSetId`. Empty when nothing has
    // been chosen yet, which is a legal state rather than an omission.
    choices: answeredChoices,
    sources
  }

  return {
    actorState,
    declaredChoices,
    pendingChoices,
    unresolvedGrants,
    contentChoices,
    acquiredResourceIds: [...acquiredResourceIds]
  }
}
