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

import type { DefinitionId, SpellCatalogueFilter } from '../rules/types'

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
  // CHOICE ELIGIBILITY PHASE 2B -- parallel to `from` (same index = same
  // option): names, for `from[i]`, the Value that must ALREADY be active
  // for that option to be offered at all (a real prerequisite, e.g.
  // Expertise's own XPHB rule "choose a skill in which you have
  // proficiency" -- `from[i]` is `value:skill.X.expertise`,
  // `requiresActive[i]` is `value:skill.X.proficient`). Omitted entirely
  // (every choice authored before this phase) means no option has a
  // prerequisite, byte-identical old behavior. Package-declared, never a
  // special-cased validator for one named mechanic -- see
  // character-actor-bridge.ts's own ELIGIBILITY header for how this is
  // read.
  requiresActive?: (DefinitionId | null)[]
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
  // Names every Progression the Rules Package declares that this content
  // participates in (§7.5). Character Progression Phase 1C -- widened from
  // a single DefinitionId to an array: a class facet may need BOTH its own
  // class-specific Progression (e.g. Wizard's `progression:class.skill-
  // expertise`) AND a generic, shared one every class can independently opt
  // into (`progression:class.subclass-selection`) -- two genuinely separate
  // ProgressionDefinitions, not two rows of the same one, since bundling
  // them into a single Definition would force every class wanting subclass
  // selection to also inherit Wizard's Expertise mechanic. This is a
  // type-only change: RulesFacet is hand-authored source code
  // (app/lib/content-rules/dnd5e-2024.ts), never persisted to Directus, so
  // there is no stored data to migrate -- every existing single-id usage
  // becomes a one-element array at the one call site that declares it.
  progression?: DefinitionId[]
  // Names Sources the Rules Package declares. These become SourceInstances
  // in the ActorState the bridge produces, which the engine's existing
  // dynamic Source overlay (§16.8) then picks up unchanged.
  sources?: DefinitionId[]
  // See RulesFacetCollectionFields above. A list because content could in
  // principle become items of more than one Collection at once, though
  // nothing authored today needs more than one entry.
  collectionFields?: RulesFacetCollectionFields[]
  // D&D 2024 Character Rules Phase 2A.2 -- names Resource Definitions
  // (`kind: 'resource'`, app/lib/rules/types.ts) this content makes
  // available FROM THE MOMENT THIS FACET APPLIES (level 1 for a base
  // class -- Rage, Second Wind, Bardic Inspiration, Lay on Hands, Sorcery
  // Points, Arcane Recovery's own spell-slot interaction aside). Mirrors
  // `sources` exactly in shape and in consumption (`character-actor-
  // bridge.ts`'s `consumeFacet`), but a Resource is never auto-activated
  // into `ActorState.sources` the way a Source is -- it is tracked
  // separately (`acquiredResourceIds`), because a Resource's own
  // expenditure is player-decided persisted state (`resources` block), not
  // a Modifier-pipeline input. A resource acquired at a LATER level (Monk's
  // Focus Points at level 2, Fighter's Action Surge at level 2) is declared
  // on `ProgressionRow.resources` instead (app/lib/rules/types.ts), never
  // here -- the same "always-on facet field vs. level-gated row field"
  // split `sources`/`grants` already draw against `row.grants`.
  resources?: DefinitionId[]
  // PHASE 2C.2A -- explicit package authority for a raw feat prerequisite the
  // engine cannot read by itself. `feature` names a RAW prerequisite value
  // verbatim (5etools' own `feature: ["Fighting Style"]`), and `requires` is the
  // feature Value that proves it (`value:feature.fighting-style`). Nothing is
  // slugged or matched by display name: a raw name with no mapping stays
  // unsupported and fails closed. Lives on the FEAT facet, because the
  // prerequisite is a property of the feat.
  featureRequirements?: RulesFacetFeatureRequirement[]
  // PHASE 2C.3A -- a Background's FIXED Origin Feat, named by the feat's slug in
  // the SAME package (XPHB Backgrounds grant exactly one feat, no choice). Only
  // read by create-v2 POST, which derives the acquisition server-side and writes
  // it into progression.feats[] under a background-source key. Never read by
  // assembly: an existing character gets no retroactive grant.
  originFeatSlug?: string
  // PHASE 2C.3A -- package-authored CREATION availability. Present means this
  // content is visible in the Builder but cannot be chosen at creation yet; the
  // string is the user-facing reason. Absent means available. Consumed generically
  // by the Builder and by create-v2 POST; nothing branches on a content name.
  creationUnavailable?: string
  // D&D 2024 Character Rules P3.1 -- which spell-state pools this content requires, and how many
  // selections each needs at every character level. See SpellRequirement's own header
  // (app/lib/characters/spell-requirements.ts owns the validator; the TYPE lives here, beside every
  // other RulesFacet field, because a requirement is a published fact about content, exactly like
  // `grants`/`choices`). Lives only on class facets today; nothing here names a class.
  spellRequirements?: SpellRequirement[]
}

// D&D 2024 Character Rules P3.1 -- the generic shape for "this content requires the player to own
// this many spells from this pool, by character level." Four pool kinds are enough for every real
// 2024 caster mechanic the §25.26 audit found:
//   'cantrip'   -- a bounded selected set (exact count required; over-count illegal).
//   'spell'     -- the SAME bounded shape, for leveled "Prepared Spells of Level 1+" (every one of
//                  the 8 classes uses this identical mechanic -- the 2024 corpus itself draws no
//                  "known" vs "prepared" caster distinction; see the audit for the corpus citations).
//   'spellbook' -- a cumulative MINIMUM membership set (Wizard only). Never shrinks, so "owns AT
//                  LEAST this many" is the correct comparison, never "exactly."
//   'arcanum'   -- Mystic Arcanum's own exact-level tier slot (Warlock only). The SAME bounded shape
//                  as 'cantrip'/'spell' (count 1, exact), just with `filter.level` pinned to one
//                  spell level and `totalByLevel` staying 0 until the tier's own acquisition level,
//                  then 1 for every level after -- no special primitive, one requirement per tier.
export type SpellRequirementPoolKind = 'cantrip' | 'spell' | 'spellbook' | 'arcanum'

export type SpellRequirement = {
  // Stable identity. Read by the application only to report which requirement an issue belongs to,
  // and to resolve `requiresMembershipPool` below -- never a class-name branch target.
  id: DefinitionId
  pool: SpellRequirementPoolKind
  // Reused verbatim from P2 (app/lib/rules/types.ts) -- the SAME filter spellOptionVerdict already
  // judges a spell against. `level` here is EXACT (cantrip: 0; arcanum: the tier's own spell
  // level); omitted for 'spell'/'spellbook', whose maximum legal spell level is derived from the
  // character's OWN spell-slot progression at validation time, never duplicated here (see
  // app/lib/characters/spell-requirements.ts's own header on why slot tables are not re-stated).
  filter: SpellCatalogueFilter
  // Index 0 = character level 1 ... index 19 = character level 20. The corpus's own TOTAL (never a
  // delta) required at that level; 0 means "not yet available." A level jump computes one lookup
  // against the target level, never a sequential walk.
  totalByLevel: readonly number[]
  // Only meaningful for pool 'spell': the `id` of a 'spellbook'-pool requirement ON THE SAME FACET
  // that every legal entry here must ALSO already satisfy (Wizard's own "prepare FROM your
  // spellbook" rule -- the prepared pool is a subset of the membership pool). Absent for every
  // class whose 'spell' pool has no membership gate (every class but Wizard). Nothing here names
  // "Wizard" -- a future class with the same two-tier shape sets this identically.
  requiresMembershipPool?: DefinitionId
}

export type RulesFacetFeatureRequirement = {
  feature: string
  requires: DefinitionId
}

// The hand-authored facet corpus for one Rules Vocabulary, keyed first by
// the content `entityType` the importer writes ('species' | 'class' |
// 'background' | ...) and then by `slug`. Keyed by slug rather than
// externalId because slug is what a Character's stored choice records and
// what character-assembly.ts re-resolves on (packageId, slug).
export type RulesFacetCorpus = Readonly<Record<string, Readonly<Record<string, RulesFacet>>>>
