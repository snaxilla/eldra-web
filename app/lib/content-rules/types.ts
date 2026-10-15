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
  // FEAT-OWNED SPELL ACQUISITION PHASE -- see FixedSpellGrant's own header above. Lives beside
  // `spellRequirements` for the identical reason: a published fact about content, never an
  // application branch. Today authored only on feat facets (Telekinetic, Telepathic); the shape
  // itself names no owner kind.
  fixedSpellGrants?: readonly FixedSpellGrant[]
  // D&D 2024 Character Rules P8 -- the creation-time "choose ONE bundle of starting gear" decision
  // this content declares, if any. See EquipmentChoice's own header
  // (app/lib/characters/equipment-bundle.ts owns the pure resolver; the TYPE lives here for the
  // identical reason `spellRequirements` does -- a published fact about content). Lives on class
  // and background facets in the real XPHB corpus; the shape itself names no owner kind.
  startingEquipment?: EquipmentChoice
}

// D&D 2024 Character Rules P8 -- the generic shape for "choose ONE bundle from N package-authored
// bundles, each a flat list of heterogeneous grants." This is the ENTIRE missing primitive the
// post-P3 critical-path census found: every one of the real XPHB corpus's 28 class/background
// starting-equipment decisions is exactly this shape (an A/B, or Fighter's own A/B/C, choice), never
// a nested picker, never nothing. Deliberately NOT named `ClassStartingEquipment`/
// `BackgroundStartingEquipment`/`DndEquipmentChoice` -- a future species, feat, or homebrew content
// (or a non-D&D rules package's own "pick a loadout" decision) uses the IDENTICAL shape with zero
// new application code, the same "no owner-name routing" discipline every other generic primitive
// in this family (SpellRequirement, ResolvableChoice) already follows.
//
// WHY THIS IS THE SMALLEST SHAPE THAT COVERS ALL 28 DECISIONS (P8's own audit, re-verified directly
// against the real corpus before this type was written): every decision is "pick exactly one of
// several bundles," and every bundle is a FLAT list of grants -- never a bundle containing a nested
// sub-choice of its own (the one apparent exception, `equipmentType`/`equipmentTypes`, is a
// DETERMINISTIC reference to an ALREADY-answered proficiency choice elsewhere, never a second
// pick -- see `EquipmentGrant`'s own `crossReference` case). A smaller shape (e.g. a bare list of
// items with no bundle grouping) could not express "A or B"; a larger one (e.g. nested choice trees)
// is not needed by any real decision in the corpus and was not built on spec.
export type EquipmentBundle = {
  // Stable identity within this choice -- the corpus's own A/B/C label (never re-derived from the
  // label text, which is free-form and could change).
  id: string
  // Human-readable, package-authored. Never computed by stitching grant summaries together here --
  // that is a PRESENTATION concern (app/components/characters/builder's own summary renderer), not
  // an authoring fact.
  label: string
  grants: EquipmentGrant[]
}

// One heterogeneous grant inside a bundle. Four kinds, exactly covering what the real corpus's own
// `item` / `item+quantity` / `value` / `equipmentType(s)` / `displayName+item` / `special` shapes
// resolve to:
//   'item'            -- a catalogue item, named by `slug` ALONE, with an optional quantity (default
//                        1). Covers `item`, `item+quantity`, and `displayName+item` (the display
//                        label is a Builder/Sheet presentation concern, read from the catalogue entry
//                        itself -- the grant names no override field, matching every other
//                        catalogue-backed reference in this codebase).
//
//                        NO `packageId` HERE, DELIBERATELY: this file is bound to no one World's
//                        Content Pack (`item:` facets immediately below are keyed by `slug` alone for
//                        the identical reason -- a 5etools-sourced slug is `slugify(name-source)`,
//                        stable across every republish of the same source content, by the
//                        importer's own convention). Authoring a specific `packageId` here would
//                        hardcode one World's catalogue identity (e.g. a Solaris-specific published
//                        pack id) into Rules content meant to bind to ANY Content Pack declaring
//                        `vocabulary: 'dnd5e.2024'`. Resolution supplies the packageId, by matching
//                        this slug against whichever catalogue is actually live -- the same split
//                        `resolveSlot`'s own stored-choice resolution already keeps, one layer
//                        earlier (there the STORED answer pins a packageId at pick time and
//                        re-resolves it; here the AUTHORED fact never pins one at all).
//   'crossReference'  -- a DETERMINISTIC reference to whichever tool/instrument/gaming-set identity
//                        an ALREADY-DECLARED proficiency ChoiceSet on the SAME facet resolves to (the
//                        corpus's own `equipmentType`/`equipmentTypes` -- NOT only "tool or
//                        instrument": Guard/Noble/Soldier's own `equipmentType: 'setGaming'` resolves
//                        against their own already-authored `choice:proficiency.gaming-set.background`
//                        exactly the same way Monk's resolves against
//                        `choice:proficiency.artisan-or-instrument.class`, which is why this kind is
//                        named by WHAT it does (reference an existing answer), never by WHICH
//                        proficiency family happens to use it). `choiceSetId` names that ChoiceSet;
//                        resolution reads the character's own real answer to it, never a second
//                        player-facing pick. See EquipmentChoice's own CROSS-REFERENCE header.
//   'currency'        -- a numeric amount of one package-owned denomination. `denominationId` is an
//                        opaque, package-authored string (never hardcoded in application code,
//                        never "GP"/"gold") -- see app/lib/characters/currency.ts's own header.
//   'custom'          -- a non-catalogue grant, named directly (Wizard's own "Spellbook," or any
//                        item this World's Content Pack has not (yet) curated) -- resolves straight
//                        to StoredInventoryItem's own existing custom-name capability, never a fake
//                        catalogue entity invented to avoid this case.
export type EquipmentGrant =
  | { kind: 'item'; slug: string; quantity?: number }
  | { kind: 'crossReference'; choiceSetId: DefinitionId }
  | { kind: 'currency'; denominationId: string; amount: number }
  | { kind: 'custom'; name: string; quantity?: number }

// One creation-time "choose a bundle" decision. `id` is the stable, opaque key this choice's own
// answer is persisted under (app/lib/characters/rules-choices.ts's existing `choiceKey(slot, id)` --
// P8 invents no second persistence mechanism, the identical reuse SpellRequirement's own `id` field
// already established for the SAME reason). `bundles.length` is 2 for every real XPHB decision but
// Fighter's own 3 -- never hardcoded as "2 options" anywhere that reads this.
export type EquipmentChoice = {
  id: DefinitionId
  bundles: EquipmentBundle[]
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
//   'fixed'     -- FEAT-OWNED SPELL ACQUISITION PHASE. Structurally IDENTICAL to 'arcanum' (ungated,
//                  exact `filter.level`, flag 'known', permanent once learned) -- the real gap
//                  'arcanum' already generalized by construction, just under a name specific to one
//                  class's own flavor text. Named separately, never by reusing 'arcanum' literally,
//                  because an unrelated feat's spell showing up tagged 'arcanum' (and labeled
//                  "Mystic Arcanum" by the default `spellPoolLabel`) would be a real identity lie,
//                  not a cosmetic one -- see `SpellRequirement.label` below for how the DISPLAY half
//                  of that is fixed. Needed because 'spell'/'spellbook' are GATED by the character's
//                  own derived max spell-slot level (see `isLevelGated`,
//                  app/lib/characters/spell-requirements.ts) -- correct for a class's own leveled
//                  casting, but WRONG for a feat like Magic Initiate, whose level-1 spell must
//                  remain legal even for a non-caster with zero spell slots (casterType 'none' ->
//                  maxSpellLevel 0 -> a gated pool would refuse it outright, defeating the feat's
//                  entire point). 'fixed' needs zero code change to `isLevelGated`/`flagFor` (both
//                  already default any kind outside 'spell'/'spellbook' to ungated/'known') -- only
//                  `KNOWN_POOL_KINDS` and the display-label map gain the new tag.
export type SpellRequirementPoolKind = 'cantrip' | 'spell' | 'spellbook' | 'arcanum' | 'fixed'

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
  // FEAT-OWNED SPELL ACQUISITION PHASE -- a package-authored, human-facing override for this
  // requirement's own display grouping, read in PREFERENCE to the generic per-pool-kind default
  // (`spellPoolLabel`, app/lib/characters/spell-acquisition-plan.ts) wherever one is shown. Needed
  // because pool kind alone cannot distinguish "Magic Initiate's own Cleric cantrips" from a real
  // Cleric's own class cantrips (both pool: 'cantrip'), or name which of Magic Initiate's three
  // mutually-exclusive spell lists a given requirement belongs to -- "infrastructure-grade"
  // provenance, never a class/feat name baked into application code (the STRING lives entirely in
  // package data, authored per requirement, exactly like `EquipmentBundle.label`).
  label?: string
  // FEAT-OWNED SPELL ACQUISITION PHASE -- the one new, small, generic conditional-activation gate
  // this phase adds: this requirement participates in planning/validation/persistence ONLY while
  // EVERY named Source is active on the character (AND semantics; absent/empty means always
  // active, byte-identical to every requirement authored before this phase). "Active" means the id
  // appears as a resolved selection for some `effect: 'activate-source'` ChoiceSet with no
  // `writesTo` (the selected value IS the Source id directly -- see
  // app/lib/characters/spell-requirement-ownership.ts's own header for the exact check and why it
  // is NOT the same thing as a ChoiceSet's own `requiresActive`, which reads `values[]`, never
  // `sources[]`). This is the exact missing primitive the Feature-Option phase identified and
  // explicitly deferred for Thaumaturge/Magician's own conditional bonus cantrip (see
  // dnd5e-2024-progression-coverage.ts's own blockerReason for both) -- filtering happens entirely
  // OUTSIDE this file and outside the P3.1/P3.2 validator/planner (a filtered-out requirement is
  // simply never included in the array those pure functions receive), so neither gains a single
  // line of new conditional logic. Magic Initiate's own three spell-list variants are the first
  // real authored use (each requirement active only while ITS OWN chosen-list Source is active).
  requiresActive?: readonly DefinitionId[]
}

// FEAT-OWNED SPELL ACQUISITION PHASE -- the smallest shape for "this content ALWAYS grants this one
// exact spell, with no player choice at all" (Telekinetic's Mage Hand, Telepathic's Detect
// Thoughts): a FACT about content, never a decision needing a ChoiceSet/picker -- the real corpus
// text has no "of your choice" clause for either. Deliberately NOT modeled as a one-option
// SpellRequirement (which would still present as a pickable decision with exactly one legal
// choice): per this phase's own instruction, "Fixed grants: do NOT become mandatory decisions" --
// this is closer in kind to `originFeatSlug` (a bare slug, resolved against whichever packageId is
// actually live, same package as the owning content) than to any choice-shaped primitive here.
export type FixedSpellGrant = {
  slug: string
  // 'known' for a permanently-learned spell (Telekinetic's Mage Hand -- cast it like any other
  // known spell); 'prepared' for a spell the character "always has prepared" independent of their
  // normal preparation routine (Telepathic's Detect Thoughts). Mirrors `flagFor`'s own two values
  // exactly (app/lib/characters/spell-requirements.ts) -- never a third flag invented here.
  flag: 'known' | 'prepared'
  // PURE-AUTHORING SPECIES SWEEP -- a fixed grant that only applies once a NAMED option within the
  // SAME owning facet is active (Elf's own Drow/High-Elf/Wood-Elf lineage, each fixing a DIFFERENT
  // cantrip; Gnome's own Forest-Gnome/Rock-Gnome lineage, each fixing different cantrips/spells).
  // Unlike Telekinetic's/Telepathic's own unconditional grants (the owning FACET itself is only
  // ever present when that feat is owned, so no further gating was ever needed), a lineage choice
  // is a SUB-SELECTION within one always-present species facet -- the grant itself still has no
  // player choice ("of your choice" never appears in the source text), but WHETHER it applies does.
  // Reuses the IDENTICAL generic gate check `SpellRequirement.requiresActive` already uses
  // (`isGateActive`, app/lib/characters/spell-requirement-ownership.ts) -- the same evaluator, a
  // new call site, never a second gating mechanism. Omitted (as for Telekinetic/Telepathic) means
  // unconditional, exactly as before this field existed.
  requiresActive?: readonly DefinitionId[]
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
