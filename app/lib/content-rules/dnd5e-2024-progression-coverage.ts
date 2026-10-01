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
  // EPIC BOON -- real Level 19, all 12 classes. Deliberately NOT counted
  // as ordinary ASI (this task's own explicit instruction) -- the real
  // corpus's own `feats.json` EB category (12 feats) is a DIFFERENT
  // legal option set than General (43), and no ChoiceSet row offers it
  // yet.
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
    status: 'CONTENT_BLOCKED',
    blockerReason: 'The Feat Selection ChoiceSet/engine mechanism already exists (same as ordinary ASI) -- no ProgressionRow references an Epic-Boon-scoped Feat Selection at level 19 yet, and no `featMechanics.category === \'epic-boon\'\' filter exists for the catalogue resolver to use even once one does.'
  })),

  // -------------------------------------------------------------------
  // FIGHTING STYLE -- real creation-time (Level 1 or 2) feature,
  // Fighter/Paladin/Ranger. Engine-ready (a pure choiceSet, no increment
  // dependency, per the original completeness audit's own §4 finding);
  // not yet authored as content.
  // -------------------------------------------------------------------
  ...([
    ['fighter-xphb', [1]],
    ['paladin-xphb', [2]],
    ['ranger-xphb', [2]]
  ] as const).map(([classSlug, levels]): ProgressionCoverageEntry => ({
    id: `${classSlug}:fighting-style`,
    classSlug,
    featureName: 'Fighting Style',
    levels: [...levels],
    surface: 'creation',
    status: 'CONTENT_BLOCKED',
    blockerReason: 'No `choiceSet` entry for Fighting Style exists in the Rules Package/facet corpus yet; the generic Proficiencies step would render it automatically the moment one is authored (confirmed, original completeness audit §2/§18) -- zero engine or Builder work needed.'
  })),

  // -------------------------------------------------------------------
  // WEAPON MASTERY -- real Level-1 (creation-time) feature for 5 martial
  // classes. 2024-new mechanic (weapon "mastery properties"); no facet
  // shape authored.
  // -------------------------------------------------------------------
  ...([
    'barbarian-xphb', 'fighter-xphb', 'paladin-xphb', 'ranger-xphb', 'rogue-xphb'
  ] as const).map((classSlug): ProgressionCoverageEntry => ({
    id: `${classSlug}:weapon-mastery`,
    classSlug,
    featureName: 'Weapon Mastery',
    levels: [1],
    surface: 'creation',
    status: 'CONTENT_BLOCKED',
    blockerReason: 'No Weapon Mastery choiceSet/Definition exists -- this package has no concept of a weapon\'s "mastery property" at all (equipment facets only carry armor/category/slot fields today). Needs a facet-shape decision before authoring, closer in kind to the Equipment primitive gap (#4) than to a simple ChoiceSet.'
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
    implementationRef: 'progression:class.skill-expertise'
  },

  // -------------------------------------------------------------------
  // EXPERTISE (base-class) -- Bard/Ranger/Rogue's own real Expertise
  // rows. Engine mechanism (`choice:skill.expertise`) already proven by
  // Wizard's own Scholar entry immediately above; these three classes'
  // own rows are simply unauthored.
  // -------------------------------------------------------------------
  ...([
    ['bard-xphb', [2, 9]],
    ['ranger-xphb', [9]],
    ['rogue-xphb', [1, 6]]
  ] as const).map(([classSlug, levels]): ProgressionCoverageEntry => ({
    id: `${classSlug}:expertise`,
    classSlug,
    featureName: 'Expertise',
    levels: [...levels],
    surface: 'level-up',
    status: 'CONTENT_BLOCKED',
    blockerReason: 'The `choice:skill.expertise`/`progression:class.skill-expertise` mechanism already works (Wizard\'s own real Scholar row, wizard-xphb:scholar above) -- this class simply has no ProgressionRow referencing it at its own real level(s) yet.'
  })),

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
    levels: [1, 2, 5, 6, 7, 8, 9, 10],
    surface: 'level-up',
    status: 'ENGINE_BLOCKED',
    blockerReason: ACCUMULATING_OPTIONAL_FEATURE_BLOCKER,
    notes: 'Levels listed are every row the real optionalfeatureProgression array\'s own count increases at, not every level (a flat count between increases is not a new choice).'
  },

  // -------------------------------------------------------------------
  // MYSTIC ARCANUM (Warlock) -- learn one 6th/7th/8th/9th-level spell,
  // kept permanently; a spell-SELECTION choice, classified alongside
  // ordinary spell acquisition/preparation below (same blocker: no
  // class-spell-list filtering exists anywhere in the engine, per the
  // original completeness audit §6).
  // -------------------------------------------------------------------
  {
    id: 'warlock-xphb:mystic-arcanum',
    classSlug: 'warlock-xphb',
    featureName: 'Mystic Arcanum',
    levels: [11, 13, 15, 17],
    surface: 'level-up',
    status: 'CONTENT_BLOCKED',
    blockerReason: 'Spell-selection choice; no class-spell-list filtering or known/prepared count enforcement exists anywhere in the engine yet (original completeness audit §6) -- the same gap every other casting class\'s own spell acquisition has.'
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
    status: 'CONTENT_BLOCKED',
    blockerReason: 'Confirmed absent, not merely unverified (original completeness audit §6): no class-spell-list filtering exists on the add-spell path (any spell in the bound catalogue can be added to any character), and no known/prepared maximum is enforced. Slot COUNT itself is unaffected -- that is derived output, already A. COMPLETE, and is not a player decision.'
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
  {
    id: 'background:origin-feat',
    classSlug: 'background',
    featureName: 'Origin Feat',
    levels: [1],
    surface: 'creation',
    status: 'ENGINE_BLOCKED',
    blockerReason: 'The Core Character Rules package has no Feat Definition category at all yet (content-rules/dnd5e-2024.ts\'s own header, original completeness audit §2/§14 #3) -- a more foundational gap than a missing ChoiceSet, since Origin Feats need a Feat vocabulary to exist before a selection mechanism can reference it.'
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
