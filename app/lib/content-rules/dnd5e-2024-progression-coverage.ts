// D&D 2024 Character Rules -- PROGRESSION COVERAGE LEDGER.
//
// Companion to dnd5e-2024.ts, created for the ALL-CLASS PROGRESSION
// CONTRACT AUDIT (2026-10-01) -- the real browser defect that exposed it:
// "subclass selection is COMPLETE" was true only for Wizard (the one class
// Character Progression Phase 1C was ever authored against); the other 11
// classes' facets never referenced `progression:class.subclass-selection`
// at all, so a real Barbarian's Level Manager preview silently produced
// pure automatic numeric progression with no Subclass choice. That specific
// defect is fixed (dnd5e-2024.ts, all 12 class facets). This ledger exists
// so the NEXT omission of this shape -- a real corpus choice nobody wired
// into any class facet -- is caught by CI, not by a player's browser.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS, AND IS NOT
// ---------------------------------------------------------------------------
// This is a CLASSIFICATION MAP, never a second copy of the D&D rules. The
// real 5etools XPHB corpus
// (/opt/eldra/datasets/5etools-src/data/class/class-*.json) remains sole
// authority for feature EXISTENCE, LEVEL, and NAME. This file owns exactly
// one fact per entry: how Eldra currently accounts for that corpus feature.
// `tests/rules/dnd5e-2024-progression-coverage.test.ts` is what actually
// enforces the contract -- it independently re-derives the candidate
// choice-bearing feature set from the REAL corpus (the identical detection
// heuristic documented below) and fails if the corpus and this ledger ever
// disagree, in either direction.
//
// ---------------------------------------------------------------------------
// DETECTION HEURISTIC (SOURCE DETECTION HONESTY)
// ---------------------------------------------------------------------------
// Fully automatic, 100%-reliable "is this a choice-bearing feature"
// detection is not achievable from free-form 5etools prose. The CI test
// uses the STRONGEST available structural signals instead, honestly
// reported as a heuristic, not a guarantee:
//   (a) a curated KNOWN-NAME set (classFeature/subclassFeature `name`
//       exactly matches, or ends with " Subclass") -- high confidence,
//       these are real, named 2024 mechanics with a stable identity;
//   (b) a TEXT-SIGNAL fallback (`optionalfeatures` filter tags, or strong
//       "choose one/two/three/a maneuver/spells of your choice" phrasing)
//       for everything else that reads like a real player decision.
// (b) alone over-triggers on narrative/combat-moment micro-choices (e.g.
// Wizard's "Spell Mastery" naming a spell once; a damage-type pick folded
// into an existing passive effect) -- every (b)-only hit discovered this
// pass is still given its OWN entry below (never silently dropped), most
// classified MILESTONE_DEFERRED with the specific reason "a combat-moment/
// narrative micro-choice, not a character-BUILD progression decision" --
// an honest classification, not an omission. A future tightening of this
// heuristic is a test-file change, never a silent ledger edit.
//
// ---------------------------------------------------------------------------
// SCOPE -- WHAT IS DELIBERATELY NOT HERE
// ---------------------------------------------------------------------------
// - Individual spells/cantrips. Spell ACQUISITION/PREPARATION is
//   classified once per casting class (the owning Spellcasting-adjacent
//   feature), never per spell -- "keep the ledger useful and finite," per
//   this task's own explicit instruction.
// - Subclass-internal RESOURCE unlocks (War Priest, Warding Flare, Dark
//   One's Own Luck) -- these are not player DECISIONS, they are resources
//   that unlock at a later subclass level than subclass SELECTION itself.
//   Tracked in the completeness audit's own "Subclass Internal
//   Progression" section instead, under the identical missing primitive
//   (`subclass-internal-feature-level-gating`) this file's own
//   `ENGINE_BLOCKED` entries for genuine subclass-internal CHOICES also
//   name.

export type ProgressionCoverageStatus =
  | 'IMPLEMENTED'
  | 'ENGINE_BLOCKED'
  | 'CONTENT_BLOCKED'
  | 'MILESTONE_DEFERRED'
  | 'SOURCE_BLOCKED'

// Which UI surface owns this choice today (or would, once unblocked) --
// Character Creation (`create-v2`, Level 1 only) vs. the Level Manager
// (post-creation Level-Up). The SAME real corpus feature can in principle
// participate in both (a Level-1 feature re-offered on a later multiclass
// level, say) -- not a case any entry below actually hits, but the field
// exists so a future one does not have to guess which surface to name.
export type ProgressionCoverageSurface = 'creation' | 'level-up'

export type ProgressionCoverageEntry = {
  // Stable identity: `<classSlug>:<feature-slug>` for a class/background
  // feature, or `<classSlug>:<subclassSlug>:<feature-slug>` for a
  // subclass-internal one. Never a display label alone (display names are
  // not guaranteed stable/unique across a corpus update).
  id: string
  // The real corpus class this feature belongs to ('background' for a
  // Background-granted creation-time feature, which has no class slug).
  classSlug: string
  // The exact real corpus `classFeature`/`subclassFeature` name(s) this
  // entry accounts for (an array when the SAME named feature recurs at
  // multiple levels, e.g. Rogue's "Expertise" at both 1 and 6).
  featureName: string
  // The exact real corpus level(s) this feature is granted/re-granted at.
  levels: number[]
  surface: ProgressionCoverageSurface
  status: ProgressionCoverageStatus
  // The Rules/Content Definition id this entry's IMPLEMENTED status rests
  // on, when mechanically checkable (a real registry/facet lookup the CI
  // test can perform) -- required whenever `status === 'IMPLEMENTED'`.
  implementationRef?: string
  // Required whenever status is ENGINE_BLOCKED/CONTENT_BLOCKED/
  // SOURCE_BLOCKED: names the missing primitive, missing content, or
  // source-structure limitation precisely enough to act on later.
  blockerReason?: string
  notes?: string
}

// The one named missing primitive this pass's SUBCLASS-INTERNAL findings
// (both the genuine choices below and the Resource-phase's own resource
// unlocks, tracked in the completeness audit) share: a subclass facet is
// consumed unconditionally at subclass-SELECTION time
// (character-actor-bridge.ts's ordinary SLOT_ORDER 'subclass' slot), with
// no mechanism analogous to `ProgressionRow.resources`/`.choices` for "this
// subclass facet's OWN feature arrives at ITS level N, independent of when
// the subclass itself was selected."
const SUBCLASS_INTERNAL_GATING_BLOCKER =
  'subclass-internal-feature-level-gating: no mechanism exists for a subclass facet\'s own feature to activate at a LATER level than the subclass\'s own selection level (unlike ProgressionRow.resources/.choices, which are already class-level-gated).'

// The "accumulating known options from a catalogue category, chosen once
// and kept permanently, with a level-scaling count" shape Metamagic and
// Eldritch Invocations both need -- distinct from Feat Selection (one pick
// per level-up, never revisited) and from ordinary skill Expertise
// (fixed count, chosen once). No current ChoiceSet selector expresses
// "offer N total slots across a level-scaling table, backfilled from a
// Content Catalogue category, with the PREVIOUS picks still counting
// toward the total."
const ACCUMULATING_OPTIONAL_FEATURE_BLOCKER =
  'accumulating-optional-feature-selection: no ChoiceSet shape exists for "learn N options total from a catalogue category, scaling by level, kept permanently" (Metamagic/Eldritch Invocations\' real shape) -- distinct from both ordinary Feat Selection (one pick per row) and fixed-count Expertise.'

// PHASE 2C.1 -- the generic, package-owned feat category filter now exists
// (`choice:feat.epic-boon` filters to category `epic-boon`; `choice:feat.
// selection` filters to `general`), and the feat resolver preserves the raw
// source variant (FS / FS:P / FS:R). The earlier single blocker ("the option
// resolver is hardcoded to General") is therefore FALSE and is retired. The
// remaining blockers are named per row below, each for its real cause.
const EPIC_BOON_EFFECT_BLOCKER =
  'epic-boon-effects: acquisition and the ability increase (choose one ability, +1, cap 30) are implemented; the Boons\' OTHER text is not structurally applied. Energy Resistance (damage-type resistance), Speed, and Truesight need vocabulary the Rules Package does not declare (no resistance/speed/senses Definitions). Boon of Skill needs proficiency plus expertise nested choices, and expertise over a grant made by the same feat needs a `requiresActive` primitive that does not exist yet. The rest are prose-only effects, the same posture every General feat already has.'

export const DND5E_2024_PROGRESSION_COVERAGE: ProgressionCoverageEntry[] = [
  // -------------------------------------------------------------------
  // SUBCLASS SELECTION -- the defect this audit exists to close. All 12,
  // real Level 3, confirmed identical across the corpus (a 2024 PHB
  // standardization; 2014 D&D varied this per class).
  // -------------------------------------------------------------------
  ...([
    'barbarian-xphb', 'bard-xphb', 'cleric-xphb', 'druid-xphb', 'fighter-xphb',
    'monk-xphb', 'paladin-xphb', 'ranger-xphb', 'rogue-xphb', 'sorcerer-xphb',
    'warlock-xphb', 'wizard-xphb'
  ] as const).map((classSlug): ProgressionCoverageEntry => ({
    id: `${classSlug}:subclass-selection`,
    classSlug,
    // Matches the real corpus `classFeature.name` exactly (e.g. "Wizard
    // Subclass", "Barbarian Subclass") -- capitalized class name, not the
    // lowercase slug, so this entry's identity is directly comparable
    // against the corpus scan in dnd5e-2024-progression-coverage.test.ts.
    featureName: `${classSlug.replace('-xphb', '').replace(/^[a-z]/, (c) => c.toUpperCase())} Subclass`,
    levels: [3],
    surface: 'level-up',
    status: 'IMPLEMENTED',
    implementationRef: 'progression:class.subclass-selection',
    notes: 'Fixed this phase -- previously referenced only by wizard-xphb\'s own facet.'
  })),

  // -------------------------------------------------------------------
  // ASI / GENERAL FEAT -- real cadence per class (Phase 2A.1). Fighter and
  // Rogue are real structural outliers, not a shared default.
  // -------------------------------------------------------------------
  ...([
    ['barbarian-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['bard-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['cleric-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['druid-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['fighter-xphb', 'progression:class.asi-extended', [4, 6, 8, 12, 14, 16]],
    ['monk-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['paladin-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['ranger-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['rogue-xphb', 'progression:class.asi-frequent', [4, 8, 10, 12, 16]],
    ['sorcerer-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['warlock-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]],
    ['wizard-xphb', 'progression:class.asi-standard', [4, 8, 12, 16]]
  ] as const).map(([classSlug, ref, levels]): ProgressionCoverageEntry => ({
    id: `${classSlug}:ability-score-improvement`,
    classSlug,
    featureName: 'Ability Score Improvement',
    levels: [...levels],
    surface: 'level-up',
    status: 'IMPLEMENTED',
    implementationRef: ref
  })),

  // -------------------------------------------------------------------
  // EPIC BOON -- real Level 19, all 12 classes. PHASE 2C.1. Split into two
  // honest rows per class, never one broad green row:
  //   - ACQUISITION (IMPLEMENTED): one shared Level-19 progression
  //     (`progression:class.epic-boon`), the package-filtered `epic-boon`
  //     category, the ability increase (cap 30), canonical persistence.
  //   - EFFECTS (ENGINE_BLOCKED): the Boons' own runtime text, which the
  //     engine does not structurally apply (see EPIC_BOON_EFFECT_BLOCKER).
  // -------------------------------------------------------------------
  ...([
    'barbarian-xphb', 'bard-xphb', 'cleric-xphb', 'druid-xphb', 'fighter-xphb',
    'monk-xphb', 'paladin-xphb', 'ranger-xphb', 'rogue-xphb', 'sorcerer-xphb',
    'warlock-xphb', 'wizard-xphb'
  ] as const).map((classSlug): ProgressionCoverageEntry => ({
    id: `${classSlug}:epic-boon`,
    classSlug,
    featureName: 'Epic Boon',
    levels: [19],
    surface: 'level-up',
    status: 'IMPLEMENTED',
    implementationRef: 'progression:class.epic-boon',
    notes: 'Acquisition and the ability component. One Epic Boon is chosen at Level 19 (category epic-boon, package-filtered) and persisted through progression.feats[]; its nested ability increase (choose one, +1, cap 30) is enforced at Confirm. The ability component is proven by the persisted-read regression "EPIC BOON -- persist -> fresh reload -> derive" in tests/server/utils/character-progression-level-1-to-20.test.ts: Confirm -> persisted feat -> persisted nested answer -> fresh normalized read -> fresh getDerivedCharacterAtLevel -> ability +1 (base unchanged, cap 30 honored). Runtime effects are NOT covered by this row; see epic-boon-effects.'
  })),
  ...([
    'barbarian-xphb', 'bard-xphb', 'cleric-xphb', 'druid-xphb', 'fighter-xphb',
    'monk-xphb', 'paladin-xphb', 'ranger-xphb', 'rogue-xphb', 'sorcerer-xphb',
    'warlock-xphb', 'wizard-xphb'
  ] as const).map((classSlug): ProgressionCoverageEntry => ({
    id: `${classSlug}:epic-boon-effects`,
    classSlug,
    featureName: 'Epic Boon',
    levels: [19],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: EPIC_BOON_EFFECT_BLOCKER
  })),

  // -------------------------------------------------------------------
  // FIGHTING STYLE -- CHOICE ELIGIBILITY / CONTENT COVERAGE PHASE 2B
  // re-audit. Real XPHB structure (class-fighter/paladin/ranger.json's
  // own "Fighting Style" classFeature, source XPHB): "gain a {@filter
  // Fighting Style feat|feats|category=FS} of your choice" -- Fighting
  // Style is a real FEAT CATEGORY ('FS'), using the exact SAME
  // `choice:feat.selection`-shaped mechanism Feat Selection/Epic Boon
  // already do, filtered to `category: 'FS'` instead of `'general'`.
  //
  // Real per-class level differs genuinely (never a shared cadence):
  // Fighter gains it at Level 1 (a CREATION-time grant, out of Level-Up
  // progression's own scope entirely); Paladin/Ranger gain it at Level 2
  // (a real Level-Up progression choice).
  //
  // RECLASSIFIED THIS PHASE: previously CONTENT_BLOCKED ("zero engine
  // work needed, just author it") -- WRONG, found by tracing the real
  // option-resolution code this phase's own Choice Eligibility work
  // required reading closely (server/utils/character-derived.ts's own
  // `category === 'feats'` branch): the legal-options filter is
  // HARDCODED to `entry.featMechanics?.category !== 'general'` --
  // EXCLUDED, with no way for a DIFFERENT ChoiceSet (a hypothetical
  // `choice:feat.fighting-style-selection`) to ask for category 'FS'
  // instead. This is the SAME missing primitive Epic Boon's own entry
  // below independently needed. RETIRED in Phase 2C.1 -- see the Fighting Style rows below for the real current blockers.
  {
    id: 'fighter-xphb:fighting-style',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style',
    levels: [1],
    surface: 'creation',
    status: 'IMPLEMENTED',
    implementationRef: 'choice:feat.fighting-style.fs-only',
    notes: 'Creation acquisition (Phase 2C.2B): the Fighter declares one content choice (FS only) and the feature Value value:feature.fighting-style via its own facet grant. Built through the V2 Builder, judged authoritatively by create-v2 POST, and persisted through canonical creation progression (progression.feats[]). Proven by the Fighter creation acceptance (real route, fresh persisted read) and the Builder browser-shape regression. Runtime effects of the chosen style are classified separately.'
  },
  {
    id: 'paladin-xphb:fighting-style',
    classSlug: 'paladin-xphb',
    featureName: 'Fighting Style',
    levels: [2],
    surface: 'level-up',
    status: 'IMPLEMENTED',
    implementationRef: 'progression:class.fighting-style-fs-and-fs-p',
    notes: 'Acquisition: at Level 2 the progression row activates value:feature.fighting-style and offers one Fighting Style feat, filtered to FS and FS:P. Only the ten ordinary FS feats are legal today: Blessed Warrior (FS:P) is refused because its otherSummary prerequisite is unsupported and its mandatory nested cantrips need Spell Acquisition. Runtime effects are classified separately (see the per-style rows).'
  },
  {
    id: 'ranger-xphb:fighting-style',
    classSlug: 'ranger-xphb',
    featureName: 'Fighting Style',
    levels: [2],
    surface: 'level-up',
    status: 'IMPLEMENTED',
    implementationRef: 'progression:class.fighting-style-fs-and-fs-r',
    notes: 'Acquisition: at Level 2 the progression row activates value:feature.fighting-style and offers one Fighting Style feat, filtered to FS and FS:R. Only the ten ordinary FS feats are legal today: Druidic Warrior (FS:R) is refused because its otherSummary prerequisite is unsupported and its mandatory nested cantrips need Spell Acquisition. Runtime effects are classified separately (see the per-style rows).'
  },
  {
    id: 'fighter-xphb:fighting-style-replacement',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style',
    levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-replacement: "Whenever you gain a Fighter level, you can replace the feat you chose with a different Fighting Style feat." This is a re-answerable choice. Every existing choice is answered once and persists; no mutable/re-answerable choice primitive exists. Not implemented in Phase 2C.2A.'
  },
  {
    id: 'fighter-xphb:additional-fighting-style',
    classSlug: 'fighter-xphb',
    featureName: 'Additional Fighting Style',
    levels: [7],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'subclass-internal feature-level gating: Champion\'s Level-7 "Additional Fighting Style" is a subclass feature (subclassFeature, Champion). The engine has no subclass-internal, feature-level acquisition gate. Not implemented in Phase 2C.2A.'
  },

  // Fighting Style effects and the two special variants are feat-level facts,
  // not class-level features: each is recorded here under the Fighter class (whose
  // Fighting Style feature the ordinary feats originate from) and listed in the
  // coverage test's documented out-of-scan allowance, never silently merged.

  {
    id: 'paladin-xphb:fighting-style-variant-blessed-warrior',
    classSlug: 'paladin-xphb',
    featureName: 'Blessed Warrior',
    levels: [2],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'nested Spell Acquisition: Blessed Warrior (FS:P) requires two Cleric cantrip choices made immediately on acquisition, and its otherSummary prerequisite is unsupported. Neither can be completed yet, so it is never legal and never owned incompletely.'
  },
  {
    id: 'ranger-xphb:fighting-style-variant-druidic-warrior',
    classSlug: 'ranger-xphb',
    featureName: 'Druidic Warrior',
    levels: [2],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'nested Spell Acquisition: Druidic Warrior (FS:R) requires two Druid cantrip choices made immediately on acquisition, and its otherSummary prerequisite is unsupported. Neither can be completed yet, so it is never legal and never owned incompletely.'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-archery',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Archery',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Archery): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: representable today as a modifier on value:combat.ranged_attack_bonus, not authored.'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-blind-fighting',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Blind Fighting',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Blind Fighting): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing senses vocabulary (Blindsight).'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-defense',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Defense',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Defense): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing/unverified equipped-armor condition for the +1 AC.'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-dueling',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Dueling',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Dueling): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing damage vocabulary (+2 damage, one-handed melee).'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-great-weapon-fighting',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Great Weapon Fighting',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Great Weapon Fighting): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing roll-rewrite primitive (treat 1-2 as 3).'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-interception',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Interception',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Interception): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing reaction and damage-reduction primitives.'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-protection',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Protection',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Protection): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing reaction primitive (impose disadvantage).'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-thrown-weapon-fighting',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Thrown Weapon Fighting',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Thrown Weapon Fighting): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing damage vocabulary (+2 thrown damage).'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-two-weapon-fighting',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Two-Weapon Fighting',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Two-Weapon Fighting): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing damage vocabulary (ability modifier on off-hand damage).'
  },
  {
    id: 'fighter-xphb:fighting-style-effect-unarmed-fighting',
    classSlug: 'fighter-xphb',
    featureName: 'Fighting Style effect: Unarmed Fighting',
    levels: [1],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'fighting-style-effect (Unarmed Fighting): ACQUISITION is legal; the feat\'s mechanical effect is NOT authored. Classification: missing damage and unarmed-strike primitives.'
  },

  // -------------------------------------------------------------------
  // WEAPON MASTERY -- CHOICE ELIGIBILITY / CONTENT COVERAGE PHASE 2B
  // re-audit. Real XPHB structure (class-fighter.json's own "Weapon
  // Mastery" classFeature, source XPHB): a character selects 3 (or more,
  // scaling by level for some classes) weapon TYPES to apply mastery
  // properties to, chosen from the Items catalogue (not a Feat, not a
  // Value/Source boolean) -- AND, critically, "whenever you finish a
  // Long Rest, you can practice weapon drills and CHANGE one of those
  // weapon choices." Confirmed still genuinely blocked, but the EXACT
  // reason is sharper than the prior pass's own note: this is not merely
  // "no facet shape decided yet" -- the real feature needs a MUTABLE,
  // RE-ANSWERABLE choice (re-selectable on every Long Rest), a shape
  // nothing in this engine has today. Every existing choice (Subclass,
  // ASI, Expertise, Skill Proficiency) is answered ONCE and persists
  // forever; Resources have expend/restore but no analogous "my
  // selection set itself can change" primitive exists for a Content-
  // Catalogue-backed choice. Equipment-adjacent (needs Items catalogue
  // access, like the Equipment primitive gap) AND needs this new
  // mutable-choice primitive -- genuinely two gaps, not one.
  // -------------------------------------------------------------------
  ...([
    'barbarian-xphb', 'fighter-xphb', 'paladin-xphb', 'ranger-xphb', 'rogue-xphb'
  ] as const).map((classSlug): ProgressionCoverageEntry => ({
    id: `${classSlug}:weapon-mastery`,
    classSlug,
    featureName: 'Weapon Mastery',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'mutable-reanswerable-choice: Weapon Mastery\'s real XPHB rule lets the player CHANGE one mastered weapon choice on every Long Rest -- no primitive exists for a Content-Catalogue-backed choice that can be legally re-answered after its first answer (every existing choice is answer-once-forever). Also needs Items-catalogue-backed option resolution (kin to the Equipment primitive gap, §11/§14 #4), a second, independent blocker.'
  })),

  // -------------------------------------------------------------------
  // WIZARD'S "SCHOLAR" -- Wizard's own real BASE-CLASS Level 2 feature
  // (class-wizard.json's own `classFeature`, source XPHB -- NOT
  // subclass-conditional, corrected from an earlier pass's own comment
  // here): "Choose one of [Arcana/History/Investigation/Medicine/Nature/
  // Religion]... you have Expertise in the chosen skill." Already
  // IMPLEMENTED -- `progression:class.skill-expertise` at Level 2,
  // referenced by wizard-xphb's own facet (dnd5e-2024.ts). This is the
  // SAME generic mechanism the three CONTENT_BLOCKED Expertise entries
  // below need authored for their own classes/levels.
  {
    id: 'wizard-xphb:scholar',
    classSlug: 'wizard-xphb',
    featureName: 'Scholar',
    levels: [2],
    surface: 'level-up',
    status: 'IMPLEMENTED',
    implementationRef: 'progression:class.skill-expertise',
    notes: 'CHOICE ELIGIBILITY PHASE 2B regression found and fixed: the real XPHB prerequisite ("a skill in which you have proficiency") was NOT enforced -- the ChoiceSet offered all 6 skills unconditionally, regardless of whether the character was actually proficient in any of them. Fixed via this phase\'s own new `requiresActive` field on the Progression row (packages/eldra-dnd5e-2024/definitions.json), never a special-cased Expertise validator.'
  },

  // -------------------------------------------------------------------
  // EXPERTISE (base-class) -- CHOICE ELIGIBILITY / CONTENT COVERAGE PHASE
  // 2B. Audited against the real XPHB text (class-bard.json/class-
  // ranger.json/class-rogue.json's own "Expertise" classFeature, source
  // XPHB) and authored this phase: unlike Wizard's own Scholar (a
  // restricted 6-skill list, no real dynamic prerequisite previously
  // enforced), Bard/Ranger/Rogue's real rule is "two of your skill
  // proficiencies OF YOUR CHOICE" -- genuinely unrestricted to any named
  // subset, so authoring it HONESTLY required this phase's own new
  // generic Choice Eligibility mechanism (`requiresActive`) to express
  // "any skill, but only one you already have" -- never a class-specific
  // skill list, never a special-cased Expertise validator. Real per-class
  // shape (never shared with Wizard's own Scholar Progression, whose
  // level/count/skill-list genuinely differ):
  //   Bard: two rows (L2 count 2, L9 "two MORE" count 2) --
  //     `progression:class.skill-expertise-choose-two-at-2-and-9`.
  //   Ranger: one row (L9 count 2) --
  //     `progression:class.skill-expertise-choose-two-at-9`.
  //   Rogue: real XPHB grants this TWICE -- L1 (count 2, a CREATION-time
  //     grant, out of Level-Up progression's own scope entirely -- see
  //     the separate rogue-xphb:expertise-creation entry below) and L6
  //     ("two MORE", count 2, authored here as `progression:class.
  //     skill-expertise-choose-two-at-6`).
  ...([
    ['bard-xphb', [2, 9], 'progression:class.skill-expertise-choose-two-at-2-and-9'],
    ['ranger-xphb', [9], 'progression:class.skill-expertise-choose-two-at-9'],
    ['rogue-xphb', [6], 'progression:class.skill-expertise-choose-two-at-6']
  ] as const).map(([classSlug, levels, ref]): ProgressionCoverageEntry => ({
    id: `${classSlug}:expertise`,
    classSlug,
    featureName: 'Expertise',
    levels: [...levels],
    surface: 'level-up',
    status: 'IMPLEMENTED',
    implementationRef: ref
  })),

  // Rogue's OWN Level-1 half of the identical real "Expertise" feature --
  // a genuine creation-time grant (count 2, same unrestricted skill
  // shape), never wired into Level-Up progression (Level 1 has no
  // "previous level" to diff against, and the create-v2 Builder has no
  // generic skill-expertise picker surface at all today, for any class).
  // Tracked with its own stable identity so it is never silently merged
  // into the L6 "two more" row above as if it were one combined grant of
  // four.
  {
    id: 'rogue-xphb:expertise-creation',
    classSlug: 'rogue-xphb',
    featureName: 'Expertise',
    levels: [1],
    surface: 'creation',
    status: 'CONTENT_BLOCKED',
    blockerReason: 'The engine mechanism (`choice:skill.expertise` + this phase\'s own Choice Eligibility) already supports this shape -- the real gap is surface-only: this would need authoring as a creation-time `facet.choices` entry (never a Progression row, since Level 1 has no prior level to diff against) AND the create-v2 Builder has no rendering surface for ANY class-specific skill-expertise picker today. Owned by a future Creation/Builder phase, not this one.'
  },

  // -------------------------------------------------------------------
  // METAMAGIC (Sorcerer) / ELDRITCH INVOCATIONS (Warlock) -- real
  // `optionalfeatureProgression`-structured corpus data (the STRONGEST
  // possible structural signal: 5etools itself tags these as a distinct
  // mechanic). Missing a generic primitive, not merely unauthored
  // content -- see ACCUMULATING_OPTIONAL_FEATURE_BLOCKER's own header.
  // -------------------------------------------------------------------
  {
    id: 'sorcerer-xphb:metamagic',
    classSlug: 'sorcerer-xphb',
    featureName: 'Metamagic',
    levels: [2, 10, 17],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: ACCUMULATING_OPTIONAL_FEATURE_BLOCKER
  },
  {
    id: 'warlock-xphb:eldritch-invocations',
    classSlug: 'warlock-xphb',
    featureName: 'Eldritch Invocations',
    // Corrected in Phase 0 from the corpus Invocations column: the increases are
    // 1, 2, 5, 7, 9, 12, 15, 18 (10 picks total). The earlier list was wrong.
    levels: [1, 2, 5, 7, 9, 12, 15, 18],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: ACCUMULATING_OPTIONAL_FEATURE_BLOCKER,
    notes: 'Levels listed are every row the real optionalfeatureProgression array\'s own count increases at, not every level (a flat count between increases is not a new choice).'
  },

  // -------------------------------------------------------------------
  // MYSTIC ARCANUM (Warlock) -- learn one 6th/7th/8th/9th-level spell, kept permanently.
  // -------------------------------------------------------------------
  {
    id: 'warlock-xphb:mystic-arcanum',
    classSlug: 'warlock-xphb',
    featureName: 'Mystic Arcanum',
    levels: [11, 13, 15, 17],
    surface: 'level-up',
    // D&D 2024 Character Rules P3.5 -- RECLASSIFIED IMPLEMENTED (was ENGINE_BLOCKED): the
    // class-spell-list-filtering/known-prepared enforcement capability this entry's own history
    // named as missing now exists end-to-end (P2 spellOptionVerdict -> P3.1 count authority ->
    // P3.2 target-state planning -> P3.2.1 provenance -> P3.4 progression write-through). Each of
    // the four tiers is its own authored `arcanum` SpellRequirement at the matching real level
    // (6/7/8/9), reachable through the Level Manager's Confirm at its own real target level
    // (11/13/15/17) -- proven in tests/server/utils/character-progression-spell-acquisition.test.ts's
    // own WARLOCK describe block and mandatory-decision-coverage.ts's own `impl:mystic-arcanum` rule.
    status: 'IMPLEMENTED',
    implementationRef: 'facet:spellRequirements',
    notes: 'Reclassified P3.5 (2026-10-08) -- see mandatory-decision-coverage.ts\'s own impl:mystic-arcanum rule for the per-tier verification this status rests on.'
  },

  // -------------------------------------------------------------------
  // SPELL / CANTRIP ACQUISITION OR PREPARATION -- classified ONCE per
  // casting class (never per spell, per this task's own explicit
  // instruction), at the owning Spellcasting feature. The SLOT COUNT
  // itself is automatic derived output, not a player decision, and is
  // correctly excluded from this CHOICE ledger -- only WHICH spells a
  // player selects is the choice being classified here.
  // -------------------------------------------------------------------
  ...([
    'bard-xphb', 'cleric-xphb', 'druid-xphb', 'paladin-xphb', 'ranger-xphb',
    'sorcerer-xphb', 'warlock-xphb', 'wizard-xphb'
  ] as const).map((classSlug): ProgressionCoverageEntry => ({
    id: `${classSlug}:spellcasting-spell-selection`,
    classSlug,
    featureName: 'Spellcasting',
    levels: [1],
    surface: 'creation',
    // D&D 2024 Character Rules P3.5 -- RECLASSIFIED IMPLEMENTED (was ENGINE_BLOCKED): the
    // class-spell-list-filtering/known-prepared enforcement capability this entry's own history
    // named as missing now exists end-to-end. Level 1 (this entry's own `surface: 'creation'`
    // scope) is covered by the Builder's own real write-through
    // (server/api/worlds/[id]/characters/create-v2.post.ts, P3.3) -- the submitted class list,
    // spell level, pool, and known/prepared count are all independently re-derived and validated
    // through planSpellAcquisition (P3.2) against the real activated package, never trusted from
    // the client. Slot COUNT itself remains derived output, unaffected by this reclassification.
    status: 'IMPLEMENTED',
    implementationRef: 'facet:spellRequirements',
    notes: 'Reclassified P3.5 (2026-10-08) -- see mandatory-decision-coverage.ts\'s own impl:spell-count/impl:caster-creation-spell-choice rules for the per-class verification this status rests on. Later-level (progression) spell growth for this same class is a SEPARATE Phase-0 decision family (spell-count/spell-choice table deltas), independently reclassified by the same P3.5 pass -- this entry\'s own scope stays Level 1 only, per its `surface: \'creation\'` field.'
  })),

  // -------------------------------------------------------------------
  // SUBCLASS-INTERNAL SELECTABLE FEATURES -- real, genuine player
  // decisions declared by a SUBCLASS's own later feature (not the
  // subclass SELECTION itself, which is IMPLEMENTED above). Blocked on
  // the SAME missing primitive the Resource phase's own War Priest/
  // Warding Flare/Dark One's Own Luck findings already named -- a
  // subclass facet has no mechanism to gate ITS OWN feature to a level
  // later than the subclass's own selection level.
  // -------------------------------------------------------------------
  ...([
    ['bard-xphb', 'college-of-lore-xphb', 'Magical Discoveries', [6]],
    ['fighter-xphb', 'battle-master-xphb', 'Combat Superiority', [3]],
    ['warlock-xphb', 'archfey-patron-xphb', 'Steps of the Fey', [3]],
    ['warlock-xphb', 'fiend-patron-xphb', 'Fiendish Resilience', [10]],
    ['wizard-xphb', 'diviner-xphb', 'The Third Eye', [10]],
    ['wizard-xphb', 'evoker-xphb', 'Sculpt Spells', [6]],
    ['wizard-xphb', 'illusionist-xphb', 'Illusory Reality', [14]]
  ] as const).map(([classSlug, subclassSlug, featureName, levels]): ProgressionCoverageEntry => ({
    id: `${classSlug}:${subclassSlug}:${featureName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    classSlug,
    featureName,
    levels: [...levels],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: SUBCLASS_INTERNAL_GATING_BLOCKER
  })),

  // -------------------------------------------------------------------
  // TEXT-SIGNAL FALSE POSITIVES -- the detection heuristic's own (b)
  // fallback (optionalfeatures tag / strong "choose" phrasing) flagged
  // these two class-level features as candidates; direct read of their
  // real entries (class-monk.json, class-sorcerer.json) confirms neither
  // is a character-BUILD progression decision. Classified explicitly,
  // per this ledger's own Source Detection Honesty header, rather than
  // silently dropped or miscounted as a real gap.
  // -------------------------------------------------------------------
  {
    id: 'monk-xphb:heightened-focus',
    classSlug: 'monk-xphb',
    featureName: 'Heightened Focus',
    levels: [10],
    surface: 'level-up',
    status: 'MILESTONE_DEFERRED',
    blockerReason: 'False positive from the "choose" text signal: the only choice embedded in this feature\'s real text is an in-combat TARGET pick for Step of the Wind ("choose a willing creature within 5 feet") -- a combat-moment tactical choice, not a character-build progression decision. The feature itself (passive Flurry of Blows/Patient Defense/Step of the Wind upgrades) requires no new ProgressionRow.'
  },
  {
    id: 'sorcerer-xphb:sorcery-incarnate',
    classSlug: 'sorcerer-xphb',
    featureName: 'Sorcery Incarnate',
    levels: [7],
    surface: 'level-up',
    status: 'MILESTONE_DEFERRED',
    blockerReason: 'False positive from the `|optionalfeatures|` text signal: this feature only lets a Sorcerer use UP TO TWO of their ALREADY-CHOSEN Metamagic options per spell while Innate Sorcery is active -- it grants no new Metamagic selection of its own, so it adds nothing beyond the Metamagic gap already tracked at sorcerer-xphb:metamagic.'
  },

  // -------------------------------------------------------------------
  // LEVEL-1 CREATION-TIME GAPS -- named explicitly by this task (Origin
  // Feat, starting equipment/gold), both Background-granted, both
  // already documented in the original completeness audit (§2/§11).
  // Given stable identity here for CI tracking even though the owning
  // SURFACE is Character Creation, not the Level Manager.
  // -------------------------------------------------------------------
  // PHASE 2C.3A -- the Origin Feat, split honestly. The FIXED acquisition is
  // implemented for the 8 Backgrounds whose Origin feat needs no choice (6 unique
  // feats). The 8 whose feat needs a choice stay blocked. Runtime EFFECTS of the
  // acquired feats are separate rows: acquiring a feat is not the same as the
  // feat changing play.
  {
    id: 'background:origin-feat:fixed-acquisition',
    classSlug: 'background',
    featureName: 'Origin Feat',
    levels: [1],
    surface: 'creation',
    status: 'IMPLEMENTED',
    // Not a Rules Package Definition: the grant is the Background facet's own
    // structured `originFeatSlug`. The coverage test verifies the facet directly.
    implementationRef: 'facet:background.originFeatSlug',
    notes: 'Criminal, Guard -> Alert; Farmer -> Tough; Hermit -> Healer; Merchant, Wayfarer -> Lucky; Sailor -> Tavern Brawler; Soldier -> Savage Attacker. Acquisition only (progression.feats[] at creation); no retroactive grant to existing characters.'
  },
  {
    id: 'background:origin-feat:choice-acquisition',
    classSlug: 'background',
    featureName: 'Origin Feat',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'Origin feats that need a choice: Crafter (artisan tool choice), Musician (instrument choice), Skilled (skill-or-tool choice), Magic Initiate (spell/cantrip acquisition). Each needs a primitive the Rules Package does not have yet. Builder shows these Backgrounds disabled with the reason.'
  },
  {
    id: 'background:origin-feat-effect:alert',
    classSlug: 'background',
    featureName: 'Origin Feat effect: Alert',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'Alert initiative bonus and Initiative Proficiency need an initiative primitive; none exists.'
  },
  {
    id: 'background:origin-feat-effect:tough',
    classSlug: 'background',
    featureName: 'Origin Feat effect: Tough',
    levels: [1],
    surface: 'creation',
    status: 'CONTENT_BLOCKED',
    blockerReason: 'Tough (+2 hit points per level) is representable with value:hit_points.max, but the effect is not authored in the Rules Package.'
  },
  {
    id: 'background:origin-feat-effect:healer',
    classSlug: 'background',
    featureName: 'Origin Feat effect: Healer',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'Healer healing-kit action is prose-only and needs an action/resource primitive.'
  },
  {
    id: 'background:origin-feat-effect:lucky',
    classSlug: 'background',
    featureName: 'Origin Feat effect: Lucky',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'Lucky Luck Points resource and reroll need a resource and roll-modifier primitive; neither is authored for feats.'
  },
  {
    id: 'background:origin-feat-effect:tavern-brawler',
    classSlug: 'background',
    featureName: 'Origin Feat effect: Tavern Brawler',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'Tavern Brawler improvised-weapon proficiency and unarmed grapple need weapon-proficiency and attack-action primitives.'
  },
  {
    id: 'background:origin-feat-effect:savage-attacker',
    classSlug: 'background',
    featureName: 'Origin Feat effect: Savage Attacker',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'Savage Attacker reroll-weapon-damage needs a damage-roll modifier primitive.'
  },
  {
    id: 'background:starting-equipment',
    classSlug: 'background',
    featureName: 'Starting Equipment / Gold',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'No facet shape exists for a creation-time equipment GRANT (distinct from the already-A.COMPLETE ongoing inventory system) -- original completeness audit §11/§14 #4, requires a design decision (package-vs-package choice, gold alternative) before authoring.'
  }
]
