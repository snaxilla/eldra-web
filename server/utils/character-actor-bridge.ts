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
// WHAT IS NOT TRANSLATED, AND WHY
// ---------------------------------------------------------------------------
// `facet.choices` are declarations of questions, not answers. The answer to
// "choose two skills from your class list" is stored player data that no
// surface collects yet -- the Character Builder has no proficiency step (an
// explicit non-goal of the phase that built it). So choices are REPORTED on
// the result for a future consumer, and contribute nothing to
// `ActorState.choices`, which stays empty. The visible consequence is
// correct rather than convenient: a Fighter's two saving throws are
// proficient because the class grants them outright, and its two chosen
// skills are not, because nobody has chosen them.

import type { CharacterAssemblyBlueprint, CharacterAssemblySlot } from './character-assembly'
import type { RulesFacet, RulesFacetChoice } from '../../app/lib/content-rules'
import { ABILITY_KEYS } from '../../app/lib/characters/ability-scores'
import type { ActorState, RuleValue, SourceInstance } from '../../app/lib/rules/types'

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
}

export type ActorBridgeResult = {
  actorState: ActorState
  // Every choice declared by a facet and not yet answered (see the header).
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

export function buildActorState(input: ActorBridgeInput): ActorBridgeResult {
  const { blueprint } = input
  const values: Record<string, RuleValue> = {}
  const sources: SourceInstance[] = []
  const pendingChoices: PendingChoice[] = []
  const unresolvedGrants: string[] = []

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
      pendingChoices.push({ ...choice, slot: slotKey })
    }
  }

  const actorState: ActorState = {
    actorId: `entity:${blueprint.characterId}`,
    packageId: input.packageId,
    packageVersion: input.packageVersion,
    stateSchemaVersion: input.stateSchemaVersion,
    values,
    collections: {},
    // Empty by design, not by omission -- see the header's note on choices.
    choices: {},
    sources
  }

  return { actorState, pendingChoices, unresolvedGrants }
}
