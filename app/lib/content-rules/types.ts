// Rules Facet models -- rules-package-architecture.md §8, Step 4.
//
// A Rules Facet is the ONE link from Content to Rules. It expresses, in a
// Rules Package's own vocabulary, what choosing a piece of content does
// mechanically -- and it does so using **references and literals only.**
//
// ---------------------------------------------------------------------------
// THE FOUR RULES THAT DEFINE IT (§8.2), AND WHAT EACH ONE CLOSES
// ---------------------------------------------------------------------------
// 1. Every string here is a Definition ID owned by the RULES PACKAGE. A
//    facet naming an id the active package does not define is an unresolved
//    reference to be surfaced, never a silent no-op.
// 2. A facet contains NO EXPRESSIONS. `{ set: 'value:hit_die', to: 10 }` is a
//    declaration; `10` is a literal, not a formula. The moment a facet may
//    carry an expression, every content author becomes a rules author and
//    the boundary is gone -- which is why `RulesFacetLiteral` is a closed
//    scalar union and deliberately cannot hold an `Expression`.
// 3. A facet is produced at PUBLICATION, never at runtime. It is a published
//    fact about a content version, integrity-hashed with the pack, because a
//    character was built against it (§8.5).
// 4. A facet is OPTIONAL. Content with none is legal and useful -- a
//    catalogue that presents but does not mechanise.
//
// ---------------------------------------------------------------------------
// WHAT THIS TYPE DELIBERATELY CANNOT EXPRESS
// ---------------------------------------------------------------------------
// There is no "increase by" grant, only `set`. A 2024 Background's ability
// score increase (+2/+1 to chosen abilities) is therefore NOT expressible
// here, and is not authored. Adding an `increase` operation would mean
// deciding how increases stack, in what order, and against what baseline --
// which is the Modifier pipeline's job (§16.4), reached through Sources, not
// a second additive mechanism smuggled into content. Recorded as a real gap
// rather than papered over.
//
// `DefinitionId` is imported from the Rules Engine because that is the
// correct direction and is already established (§8.3: content depends on
// rules; rules never depend on content). It is a type-only import, erased at
// runtime, and nothing in app/lib/rules/ imports anything from here.

import type { DefinitionId } from '../rules/types'

// Scalars only -- see rule 2 above. Never an Expression, never an object.
export type RulesFacetLiteral = boolean | number | string

// "This content sets this Definition to this literal." The only grant
// operation, deliberately (see WHAT THIS TYPE CANNOT EXPRESS).
export type RulesFacetGrant = {
  set: DefinitionId
  to: RulesFacetLiteral
}

// "This content requires a person to choose, from these options, this many
// times." `choiceSet` names a ChoiceSet the Rules Package declares; `from`
// narrows its options to the ones THIS content offers, which is the whole
// reason a ChoiceSet's own selector is `fromContentFacet` (§7.6) -- a
// Fighter's skill list differs from a Wizard's, and only the content knows
// which.
export type RulesFacetChoice = {
  choiceSet: DefinitionId
  count: number
  from?: DefinitionId[]
}

// "This content, when it becomes a Collection item, sets these itemSchema
// fields." The per-instance counterpart of `grants` -- needed because a
// Collection item (rules-package-architecture.md §7; `CollectionInstanceItem`
// in app/lib/rules/types.ts) has no Definition ID of its own for `grants` to
// target. `grants` sets exactly one character-wide Value; two different
// weapons a character carries need two different `category` values on two
// different item instances, which one shared Definition ID could never
// express -- `grants: [{ set: 'value:weapon.category', to: 'martial' }]`
// on both a Longsword and a Dagger would collide on the very first
// character who owns both.
//
// `collection` names the CollectionDefinition this content becomes an item
// of (e.g. `collection:equipment`); `fields` are itemSchema keys the Rules
// Package already declares for it. Scalars only, matching every other
// facet operation -- see RulesFacetLiteral's own rule.
//
// Added for Equipment (rules-package-architecture.md §7's Collection kind
// already existed; this is the first content type whose Rules Facet needs
// to reach it). The mechanism is general: any future per-instance Content
// (a known spell entering a `collection:spells`, say) uses the same field,
// not a second one invented per Collection.
export type RulesFacetCollectionFields = {
  collection: DefinitionId
  fields: Record<string, RulesFacetLiteral>
}

export type RulesFacet = {
  grants?: RulesFacetGrant[]
  choices?: RulesFacetChoice[]
  // Names a Progression the Rules Package declares (§7.5).
  progression?: DefinitionId
  // Names Sources the Rules Package declares. These become SourceInstances
  // in the ActorState the bridge produces, which the engine's existing
  // dynamic Source overlay (§16.8) then picks up unchanged.
  sources?: DefinitionId[]
  // See RulesFacetCollectionFields above. A list because content could in
  // principle become items of more than one Collection at once, though
  // nothing authored today needs more than one entry.
  collectionFields?: RulesFacetCollectionFields[]
}

// The hand-authored facet corpus for one Rules Vocabulary, keyed first by
// the content `entityType` the importer writes ('species' | 'class' |
// 'background' | ...) and then by `slug`. Keyed by slug rather than
// externalId because slug is what a Character's stored choice records and
// what character-assembly.ts re-resolves on (packageId, slug).
export type RulesFacetCorpus = Readonly<Record<string, Readonly<Record<string, RulesFacet>>>>
