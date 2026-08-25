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
  validateChoiceSelection,
  type ResolvableChoice,
  type StoredRulesChoices
} from '../../app/lib/characters/rules-choices'
import { ABILITY_KEYS } from '../../app/lib/characters/ability-scores'
import type { ActorState, CollectionInstanceItem, RuleValue, SourceInstance } from '../../app/lib/rules/types'

// The three catalogue-backed slots, in the order their grants are applied.
// Later wins on conflict. The order is Species -> Class -> Background
// because it runs least-specific to most-specific, and because it matches
// the order the Builder asks for them -- a player who set something in a
// later step should not have it silently overridden by an earlier one.
// Nothing in the current corpus actually collides; the order is declared so
// that the first collision has a defined answer rather than an accidental
// one.
const SLOT_ORDER = ['species', 'class', 'background'] as const

export type ActorBridgeSlotKey = (typeof SLOT_ORDER)[number]

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
  // Facet-granted Definition IDs that the ACTIVE Rules Package does not
  // declare. §8.2 rule 1: an unresolved reference is surfaced, never a
  // silent no-op. Populated only when the caller supplies `knownDefinition`.
  unresolvedGrants: string[]
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
  lookupChoiceSet?: (id: string) => { writesTo: string } | null | undefined
}

function facetFor(slot: CharacterAssemblySlot): RulesFacet | null {
  return slot.status === 'resolved' ? slot.entry.rulesFacet ?? null : null
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
  const answeredChoices: Record<string, RuleValue> = {}

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

  // --- Facet grants, sources, and choices --------------------------------
  for (const slotKey of SLOT_ORDER) {
    const facet = facetFor(blueprint[slotKey])
    if (!facet) continue

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

    for (const choice of facet.choices ?? []) {
      // Shared with the Builder so both ask the identical question -- see
      // toResolvableChoice. A facet with no `from` offers nothing, which
      // validates as answerable only at count 0: correct, not a special case.
      const resolvable = toResolvableChoice(slotKey, choice)
      const key = resolvable.key
      declaredChoices.push(resolvable)

      const validation = validateChoiceSelection(resolvable, selectionsFor(input.rulesChoices, key))

      if (!validation.ok) {
        pendingChoices.push({ ...choice, slot: slotKey, key })
        continue
      }

      // The answer itself -- the player's decision, recorded verbatim.
      answeredChoices[key] = [...validation.selected]

      // ...and what the ChoiceSet says that answer MEANS. Still not a
      // computed value: this sets the same boolean a facet grant sets, and
      // every number derived from it is the evaluator's work.
      const writesTo = input.lookupChoiceSet?.(choice.choiceSet)?.writesTo

      for (const selected of validation.selected) {
        const target = writesTo ? resolveChoiceTarget(writesTo, selected) : selected

        if (input.knownDefinition && !input.knownDefinition(target)) {
          unresolvedGrants.push(target)
          continue
        }

        values[target] = true
      }
    }
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

  return { actorState, declaredChoices, pendingChoices, unresolvedGrants }
}
