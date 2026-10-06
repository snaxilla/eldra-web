// Hand-authored Rules Facets for the XPHB Content Pack, expressed in the
// `dnd5e.2024` vocabulary -- rules-package-architecture.md Step 5.
//
// HAND-AUTHORED ON PURPOSE (§18.2, Decision 2). No adapter derives these
// from 5etools JSON. Classes, backgrounds, and species (12, 16, and 2
// respectively) were each read off the source and written out with a game
// judgment behind every entry -- which skill list a class offers, which
// saves it grants. When an auto-generator is eventually built, this file
// becomes its test corpus: a generator that cannot reproduce these entries
// is not ready.
//
// The 52 ITEM entries are different in kind: category/slot are a
// STRUCTURAL fact (5etools' own `type` code), not a judgment call, so they
// were generated from a verified measurement against the real dataset
// rather than typed by hand one at a time -- see the ITEMS section below
// for exactly what was measured and how. Still hand-INTEGRATED (reviewed,
// checked for duplicate slugs, checked against a real registry) rather
// than auto-applied at publish time, which is what keeps this file the
// single readable source of the whole corpus.
//
// ---------------------------------------------------------------------------
// EVERY ID BELOW IS OWNED BY packages/eldra-dnd5e-2024
// ---------------------------------------------------------------------------
// `value:save.<key>.proficient`, `value:skill.<slug>.proficient`, and
// `choice:skill.proficiency` are all Definitions that package declares. This
// file names them; it never defines them, and it contains no formula, no
// expression, and no 5etools field name. A test resolves every id here
// against the real package on disk, so a rename on either side fails loudly
// rather than degrading into a silent no-op.
//
// ---------------------------------------------------------------------------
// WHAT IS AUTHORED, AND WHAT IS DELIBERATELY ABSENT
// ---------------------------------------------------------------------------
// CLASSES grant two saving throw proficiencies outright, and offer a skill
// choice. Both are in scope and both are authored. Each class's `grants`
// now carries a THIRD entry: `value:hit_points.hit_die_size`, measured from
// the real XPHB dataset's own `hd.faces` field (Barbarian 12, Fighter/
// Paladin/Ranger 10, most others 8, Sorcerer/Wizard 6). This is the ONE
// piece of a Class's mechanics `grants` was always able to express and
// simply had no Definition to target until the Health System added
// `hit_points.hit_die_size` -- unlike the ASI/Origin Feat gaps immediately
// below, which remain gaps for their own, separate reasons.
//
// BACKGROUNDS grant two skill proficiencies outright. In the 2024 rules a
// Background also grants an Ability Score Increase and an Origin Feat --
// NEITHER is authored here, for different reasons and both worth stating:
//   - The ASI needs an "increase by" operation a Rules Facet deliberately
//     does not have (see types.ts), and it is a choice of which abilities.
//   - Origin Feats need feat Definitions, which the Core Character Rules
//     package does not declare (feats are not one of its seven categories).
//
// SPECIES grant almost nothing expressible today. Measured against the real
// dataset: 8 of 10 XPHB species declare no skill proficiencies at all, and
// what they DO grant -- Darkvision, speed, damage resistances, lineage
// traits -- lives in `movement`, `conditions`, and `combat`, none of which
// the Core Character Rules package covers. Only Elf and Human appear below,
// and only for their skill choice. This is not an authoring shortfall; it is
// the Rules/Content boundary reporting honestly on how much of a Species is
// mechanics the current package can express.
//
// ITEMS grant no character-wide facts at all -- they are never chosen the
// way a Class or Background is, so `grants`/`choices`/`sources` have nothing
// to attach to. What they DO carry is `collectionFields`
// (rules-package-architecture.md Equipment Rules, types.ts's
// RulesFacetCollectionFields): which `collection:equipment` itemSchema
// fields this item sets when a player carries it -- `category` ('weapon' |
// 'armor'), `slot` ('held' | 'armor'), and `requiresAttunement` when true.
// Every entry below is measured against the real XPHB dataset (source `M`/
// `R` -> weapon/held; `LA`/`MA`/`HA` -> armor/armor; `S` (shield) ->
// armor/held, since a shield occupies the held slot, not the armor slot,
// even though it is mechanically armor). None of XPHB's 217 items declares
// `reqAttune` -- attunement is overwhelmingly a magic-item property, and
// XPHB is mundane starting equipment, so `requiresAttunement` is exercised
// by the mechanism (the itemSchema field exists and is readable) without
// yet being exercised by real content. XDMG (593 items, mostly magic) is
// where that changes, but XDMG's provider does not yet declare
// `vocabulary: 'dnd5e.2024'` (server/utils/content-sources/dnd5e/xdmg.ts)
// -- a one-line follow-up, not done here, since this task's own testing
// scope names only XPHB.
//
// `category`/`slot`/`requiresAttunement` cover every item that has
// equipment mechanics to express: adventuring gear, tools, instruments, and
// vehicles carry none (`category` simply defaults to the itemSchema's own
// 'gear'), so they have no facet at all -- content with none presents but
// does not mechanise (§8.2 rule 4), exactly like a Species that grants
// nothing.
//
// TOOL proficiencies and starting gold remain absent for the same reason
// as before: no `value:tool.*` Definition exists to name, and currency
// (Category 16) is not part of this package (rules-package-architecture.md
// §6.3).
//
// ---------------------------------------------------------------------------
// SPELLCASTING -- MEASURED, LIKE HIT DIE SIZE
// ---------------------------------------------------------------------------
// Eight of the twelve classes now carry two more `grants` entries:
// `value:spellcasting.ability.<int|wis|cha>` (which ability powers this
// class's spells) and `value:spellcasting.caster_type.<full|half|pact>`
// (which of the three Spell Slot progression tables in definitions.json
// applies). Both are measured, not judged, directly off the vendored XPHB
// class dataset's own `spellcastingAbility` and `casterProgression` fields
// (`"full"` -> full, `"artificer"` -> half [5etools' internal label for
// that table shape], `"pact"` -> pact). Barbarian, Fighter, Monk, and Rogue
// carry neither field in their base class JSON and grant nothing here --
// confirmed non-casters at the base-class level (Eldritch Knight and
// Arcane Trickster are subclass-only casters, not modeled by this package).
//
// DELIBERATELY NOT AUTHORED: how many spells each class may PREPARE or
// KNOW at a given level. The vendored dataset's own `preparedSpellsProgression`
// arrays exist for all eight casting classes, but do not reduce to the
// closed-form "level + ability modifier" rule this task could verify by
// test (they appear to assume some fixed ability-score progression already
// baked in) -- authoring a formula from an unverified guess would be worse
// than leaving the gap stated. A character's Known/Prepared spell lists are
// therefore tracked with no enforced maximum this pass, the same "recorded
// as a real gap rather than papered over" posture the ASI and Origin Feat
// gaps above already take.
//
// ---------------------------------------------------------------------------
// ARMOR ALSO CARRIES A SOURCE -- the first equipment-driven derived value
// ---------------------------------------------------------------------------
// The 12 body armor items (not the Shield -- see below) additionally set
// `sourceRef: 'source:equipment.armor'` plus the three numbers that Source's
// one Modifier reads: `armorClass` (the item's own base AC), and
// `dexCapMin`/`dexCapMax` (how much of the wearer's Dex modifier applies).
// All three are measured, not authored per-item by judgment: `armorClass`
// is the dataset's own `ac` field; `dexCapMin`/`dexCapMax` follow directly
// from the SAME `LA`/`MA`/`HA` type code `category`/`slot` already used --
// light armor applies Dex uncapped (`[-99, 99]`, sentinels standing in for
// "no bound"), medium caps the BONUS at +2 but still applies a Dex PENALTY
// in full (`[-99, 2]`), heavy applies no Dex at all in either direction
// (`[0, 0]`) -- which is why `clamp()`, not a bare `min()`, is the formula's
// own choice (source:equipment.armor in definitions.json): `min(dexMod, 2)`
// would incorrectly let a heavy-armor wearer's negative Dex subtract from
// their AC, when RAW heavy armor ignores Dex in both directions.
//
// The Shield is deliberately EXCLUDED from this. It is category:'armor' but
// mechanically ADDS to whatever AC a character already has (a `phase:'add'`
// modifier) rather than REPLACING it (`phase:'set'`, what every body armor
// piece above declares) -- a genuinely different modifier shape this
// package does not yet declare. Authoring one now would be "shield bonuses
// beyond what the package can already express," which the task that added
// this section named as explicitly out of scope.

import type { RulesFacetCorpus } from './types'

// Keyed by the `entityType` the importer writes, then by `slug`
// (`slugify(name-source)`), which is what a Character's stored choice
// records and what Character Assembly re-resolves on.
export const DND5E_2024_RULES_FACETS: RulesFacetCorpus = {
  class: {
    'barbarian-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.con.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 12 }
      ],
      // D&D 2024 Character Rules Phase 2A.2 -- Rage (XPHB `classFeatures`
      // level 1, real class-barbarian.json `classTableGroups` "Rages"
      // column: 2/2/3/3/3/4/4/4/4/4/4/5/5/5/5/5/6/6/6/6 for levels 1-20,
      // authored verbatim as `resource:rage`'s own nested `if`
      // max expression). Always-on from level 1, like every other
      // base-class `grants`/`choices` entry here -- unlike Action Surge/
      // Channel Divinity/Wild Shape/Focus Points/Sorcery Points (acquired
      // LATER, authored via `progression[].resources` on the owning
      // class facet instead), Rage needs no row gate.
      resources: ['resource:rage'],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.animal_handling.proficient',
            'value:skill.athletics.proficient',
            'value:skill.intimidation.proficient',
            'value:skill.nature.proficient',
            'value:skill.perception.proficient',
            'value:skill.survival.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- real XPHB ASI levels for
      // this class (class-barbarian.json's own `classFeatures` "Ability
      // Score Improvement" references, verified this phase) match the
      // STANDARD 4/8/12/16 cadence ten of the twelve classes share --
      // `progression:class.asi-standard`'s own rows
      // (packages/eldra-dnd5e-2024/definitions.json) are named by CADENCE,
      // never by class (the Rules Package names no class, per this package's
      // own purity rule, tests/rules/dnd5e-2024-package.test.ts). Fighter
      // and Rogue reference their own distinct cadence ids instead (`-
      // extended`, `-frequent`) -- see those two classes' own facets.
      //
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- real browser
      // acceptance (Bob, a Level-1 Barbarian, Level Manager preview to
      // Level 3) exposed that `progression:class.subclass-selection`
      // (hardcoded `at: 3`, packages/eldra-dnd5e-2024/definitions.json)
      // was referenced by exactly ONE class facet in this entire
      // corpus -- Wizard's, below -- meaning Character Progression Phase
      // 1C was effectively authored only for Wizard, never generalized to
      // the other 11. Re-audited against the real corpus
      // (class-<name>.json's own "<Class> Subclass" `classFeature`,
      // `source: 'XPHB'`, every one of the 12 classes): ALL 12 select
      // their subclass at Level 3 -- a genuine 2024 PHB standardization
      // (2014 D&D varied this per class) -- so the EXISTING, already-
      // correct `at: 3` Progression needed no new cadence variant, only
      // to be referenced by the other 11 facets, exactly mirroring how
      // Wizard's own facet already does. Verified, not assumed: every one
      // of the 48 native-XPHB subclasses (4 per class) is already present
      // in Solaris's bound Content Pack with the correct `parentClassSlug`
      // -- this was a Rules-authoring gap, never a Content gap.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.epic-boon']
    },
    'bard-xphb': {
      grants: [
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 },
        { set: 'value:spellcasting.ability.cha', to: true },
        { set: 'value:spellcasting.caster_type.full', to: true }
      ],
      // D&D 2024 Character Rules Phase 2A.2 -- Bardic Inspiration (XPHB
      // `classFeatures` level 1). Max is `max(1, Charisma modifier)` -- a
      // DERIVED-ABILITY max, not a level table, the real structural reason
      // this resource was chosen as a vertical slice (see
      // `resource:bardic_inspiration`'s own definitions.json comment).
      // Die size (1d6 -> 1d8 @ L5 -> 1d10 @ L10 -> 1d12 @ L15) is carried
      // on the Resource's own `presentation.dieSize`, package-authored, not
      // inferred by the UI. DEFERRED, HONESTLY: Level 5's "Font of
      // Inspiration" feature additionally lets a Short Rest recover it (on
      // top of Long Rest) and lets a spell slot be spent to recover one use
      // -- both are real level-5-conditional recovery refinements this
      // Resource Definition does not yet model (recovery is a fixed,
      // non-level-conditional array today); this is an intentionally
      // incomplete but HONEST partial implementation (Long Rest recovery is
      // correct for every level), not a silent gap.
      resources: ['resource:bardic_inspiration'],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 3,
          from: [
            'value:skill.acrobatics.proficient',
            'value:skill.animal_handling.proficient',
            'value:skill.arcana.proficient',
            'value:skill.athletics.proficient',
            'value:skill.deception.proficient',
            'value:skill.history.proficient',
            'value:skill.insight.proficient',
            'value:skill.intimidation.proficient',
            'value:skill.investigation.proficient',
            'value:skill.medicine.proficient',
            'value:skill.nature.proficient',
            'value:skill.perception.proficient',
            'value:skill.performance.proficient',
            'value:skill.persuasion.proficient',
            'value:skill.religion.proficient',
            'value:skill.sleight_of_hand.proficient',
            'value:skill.stealth.proficient',
            'value:skill.survival.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      // CHOICE ELIGIBILITY / CONTENT COVERAGE PHASE 2B -- real XPHB Bard
      // Expertise (class-bard.json's own `classFeature` "Expertise", source
      // XPHB): "two of your skill proficiencies of your choice" at Level 2,
      // "two MORE... of your choice" at Level 9 -- genuinely unrestricted to
      // any named subset (unlike Wizard's own Scholar), so `choice:skill.
      // expertise`'s real option list here is every one of the 18 real
      // skills, dynamically narrowed to only the ones THIS character is
      // actually proficient in by this phase's own new `requiresActive`
      // eligibility field -- no Bard-specific skill list authored, no
      // special-cased Expertise validator.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.skill-expertise-choose-two-at-2-and-9', 'progression:class.epic-boon']
    },
    'cleric-xphb': {
      grants: [
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 },
        { set: 'value:spellcasting.ability.wis', to: true },
        { set: 'value:spellcasting.caster_type.full', to: true }
      ],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.history.proficient',
            'value:skill.insight.proficient',
            'value:skill.medicine.proficient',
            'value:skill.persuasion.proficient',
            'value:skill.religion.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above. D&D 2024 Character Rules Phase 2A.2 -- Channel Divinity
      // (XPHB `classFeatures` level 2, real class-cleric.json
      // `classTableGroups` "Channel Divinity" column) is LEVEL-GATED, so it
      // is authored via a dedicated `progression:class.resources-channel-divinity-standard`
      // row rather than `facet.resources` -- see
      // `resource:channel_divinity.standard`'s own definitions.json comment
      // for its max expression.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-channel-divinity-standard', 'progression:class.epic-boon']
    },
    'druid-xphb': {
      grants: [
        { set: 'value:save.int.proficient', to: true },
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 },
        { set: 'value:spellcasting.ability.wis', to: true },
        { set: 'value:spellcasting.caster_type.full', to: true }
      ],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.arcana.proficient',
            'value:skill.animal_handling.proficient',
            'value:skill.insight.proficient',
            'value:skill.medicine.proficient',
            'value:skill.nature.proficient',
            'value:skill.perception.proficient',
            'value:skill.religion.proficient',
            'value:skill.survival.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above. D&D 2024 Character Rules Phase 2A.2 -- Wild Shape (XPHB
      // `classFeatures` level 2, level-gated, same reasoning as Cleric's
      // Channel Divinity immediately above).
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-wild-shape', 'progression:class.epic-boon']
    },
    'fighter-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.con.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 10 },
        // PHASE 2C.2B -- the Fighter's Level-1 Fighting Style feature (XPHB
        // class-fighter.json "Fighting Style", level 1). Authored ONCE, here:
        // the creation Builder and normal assembly both read this same grant.
        { set: 'value:feature.fighting-style', to: true }
      ],
      // D&D 2024 Character Rules Phase 2A.2 -- Second Wind (XPHB
      // `classFeatures` level 1, real class-fighter.json
      // `classTableGroups` "Second Wind" column) is always-on from level
      // 1. Action Surge (level 2) and Indomitable (level 9) are LEVEL-GATED
      // and authored via `progression:class.resources-action-surge-indomitable` instead
      // (below) -- see this file's own Rage comment above for why the
      // always-on/level-gated split is drawn this way throughout this
      // phase's authoring pass.
      resources: ['resource:second_wind'],
      choices: [
        // PHASE 2C.2B -- "gain a Fighting Style feat of your choice" (FS only).
        // A CONTENT-backed choice (its ChoiceSet selects from the Content
        // Catalogue), judged by creation-content-choices.ts, never a Definition.
        { choiceSet: 'choice:feat.fighting-style.fs-only', count: 1 },
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.acrobatics.proficient',
            'value:skill.animal_handling.proficient',
            'value:skill.athletics.proficient',
            'value:skill.history.proficient',
            'value:skill.insight.proficient',
            'value:skill.intimidation.proficient',
            'value:skill.persuasion.proficient',
            'value:skill.perception.proficient',
            'value:skill.survival.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- Fighter is a real, verified
      // structural OUTLIER: six ASI/feat opportunities (4/6/8/12/14/16, an
      // extra one at 6 and 14), not the 4/8/12/16 most classes share
      // (class-fighter.json's own `classFeatures` references, verified this
      // phase) -- authored here exactly as measured, never assumed.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      progression: ['progression:class.subclass-selection', 'progression:class.asi-extended', 'progression:class.resources-action-surge-indomitable', 'progression:class.epic-boon']
    },
    'monk-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 }
      ],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.acrobatics.proficient',
            'value:skill.athletics.proficient',
            'value:skill.history.proficient',
            'value:skill.insight.proficient',
            'value:skill.religion.proficient',
            'value:skill.stealth.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above. D&D 2024 Character Rules Phase 2A.2 -- Focus Points
      // (XPHB `classFeatures` level 2, level-gated; real class-monk.json
      // `classTableGroups` "Focus Points" column is exactly the character's
      // own level for L2+, authored as a direct reference to the Level
      // Value itself per `resource:focus_points`'s own
      // definitions.json comment -- "prefer references to existing
      // derived Values" applied literally).
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-focus-points', 'progression:class.epic-boon']
    },
    'paladin-xphb': {
      grants: [
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 10 },
        { set: 'value:spellcasting.ability.cha', to: true },
        { set: 'value:spellcasting.caster_type.half', to: true }
      ],
      // D&D 2024 Character Rules Phase 2A.2 -- Lay on Hands (XPHB
      // `classFeatures` level 1), always-on. Max is `5 * level` -- a plain
      // derived-Value formula, not a table (see `resource:lay_on_hands`'s
      // own definitions.json comment). NOTE, honestly
      // reported: real expenditure is a VARIABLE amount per use (spend 1 to
      // N of the pool's remaining points to heal that many Hit Points, or a
      // fixed 5 to cure Poisoned) -- this phase's generic orb UI only
      // expends/restores ONE unit per click, so at high level (up to 100
      // points at L20) this resource is structurally correct but presents
      // awkwardly as 100 individual orbs. Reported as a UI limitation, not
      // silently hidden -- a future "spend N" input is the right fix,
      // out of this phase's scope.
      resources: ['resource:lay_on_hands'],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.athletics.proficient',
            'value:skill.insight.proficient',
            'value:skill.intimidation.proficient',
            'value:skill.medicine.proficient',
            'value:skill.persuasion.proficient',
            'value:skill.religion.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above. D&D 2024 Character Rules Phase 2A.2 -- Paladin's own
      // Channel Divinity is acquired at level 3 (NOT level 2, unlike
      // Cleric's -- real class-paladin.json `classTableGroups` "Channel
      // Divinity" column; its own, separately-authored Resource/Progression
      // pair, never shared with Cleric's, since the two tables' thresholds
      // genuinely differ -- see `resource:channel_divinity.extended`'s own
      // comment).
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-channel-divinity-extended', 'progression:class.epic-boon', 'progression:class.fighting-style-fs-and-fs-p']
    },
    'ranger-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 10 },
        { set: 'value:spellcasting.ability.wis', to: true },
        { set: 'value:spellcasting.caster_type.half', to: true }
      ],
      // D&D 2024 Character Rules Phase 2A.2 (Ranger completeness follow-up)
      // -- Favored Enemy (XPHB `classFeatures` level 1, real
      // class-ranger.json `classTableGroups` "Favored Enemy" column),
      // always-on from level 1 like Rage/Second Wind/Bardic Inspiration/Lay
      // on Hands. Tireless (level 10, ability-derived max, Long-Rest-only)
      // is level-gated via `progression:class.resources-tireless` instead
      // -- added below alongside the ASI progression, mirroring every
      // other level-gated resource's own always-on/gated split this phase
      // already established.
      resources: ['resource:favored_enemy'],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 3,
          from: [
            'value:skill.animal_handling.proficient',
            'value:skill.athletics.proficient',
            'value:skill.insight.proficient',
            'value:skill.investigation.proficient',
            'value:skill.nature.proficient',
            'value:skill.perception.proficient',
            'value:skill.stealth.proficient',
            'value:skill.survival.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      // CHOICE ELIGIBILITY / CONTENT COVERAGE PHASE 2B -- real XPHB Ranger
      // Expertise (class-ranger.json's own `classFeature` "Expertise",
      // source XPHB): "Choose two of your skill proficiencies with which
      // you lack Expertise" at Level 9 only -- see bard-xphb's own note
      // immediately above for why no Ranger-specific skill list is
      // authored here either.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-tireless', 'progression:class.skill-expertise-choose-two-at-9', 'progression:class.epic-boon', 'progression:class.fighting-style-fs-and-fs-r']
    },
    'rogue-xphb': {
      grants: [
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:save.int.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 }
      ],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 4,
          from: [
            'value:skill.acrobatics.proficient',
            'value:skill.athletics.proficient',
            'value:skill.deception.proficient',
            'value:skill.insight.proficient',
            'value:skill.intimidation.proficient',
            'value:skill.investigation.proficient',
            'value:skill.perception.proficient',
            'value:skill.persuasion.proficient',
            'value:skill.sleight_of_hand.proficient',
            'value:skill.stealth.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- Rogue is a real, verified
      // structural OUTLIER: five ASI/feat opportunities (4/8/10/12/16, an
      // extra one at 10), not the 4/8/12/16 most classes share
      // (class-rogue.json's own `classFeatures` references, verified this
      // phase) -- authored here exactly as measured, never assumed.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      // CHOICE ELIGIBILITY / CONTENT COVERAGE PHASE 2B -- real XPHB Rogue
      // Expertise (class-rogue.json's own `classFeature` "Expertise",
      // source XPHB) is genuinely TWO separate grants: Level 1 ("two of
      // your skill proficiencies of your choice" -- a CREATION-time
      // choice, out of this Level-Up progression's own scope, same bucket
      // as Origin Feat/Fighting-Style-at-creation, see the Progression
      // Coverage Ledger) and Level 6 ("two MORE... of your choice" --
      // post-creation, authored here). Only the real Level-6 grant is
      // wired into Level-Up progression; the Level-1 half remains a
      // documented Builder/creation gap, never silently merged into this
      // one Progression as if it were a single Level-6 grant of four.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-frequent', 'progression:class.skill-expertise-choose-two-at-6', 'progression:class.epic-boon']
    },
    'sorcerer-xphb': {
      grants: [
        { set: 'value:save.con.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 6 },
        { set: 'value:spellcasting.ability.cha', to: true },
        { set: 'value:spellcasting.caster_type.full', to: true }
      ],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.arcana.proficient',
            'value:skill.deception.proficient',
            'value:skill.insight.proficient',
            'value:skill.intimidation.proficient',
            'value:skill.persuasion.proficient',
            'value:skill.religion.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above. D&D 2024 Character Rules Phase 2A.2 -- Sorcery Points
      // (XPHB `classFeatures` level 2, level-gated; real class-sorcerer.json
      // `classTableGroups` "Sorcery Points" column is exactly the
      // character's own level for L2+, authored as a direct reference to
      // the Level Value itself -- see `resource:sorcery_points`'s
      // own comment). DEFERRED,
      // HONESTLY: "Sorcerous Restoration" (level 5, a Short Rest partially
      // recovers Sorcery Points, capped at half level) is a RECOVERY
      // FEATURE that modifies another resource rather than owning its own
      // pool (this phase's own category E) -- not modeled; Long Rest's
      // full recovery is correct at every level regardless.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-sorcery-points', 'progression:class.epic-boon']
    },
    'warlock-xphb': {
      grants: [
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 },
        { set: 'value:spellcasting.ability.cha', to: true },
        { set: 'value:spellcasting.caster_type.pact', to: true }
      ],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.arcana.proficient',
            'value:skill.deception.proficient',
            'value:skill.history.proficient',
            'value:skill.intimidation.proficient',
            'value:skill.investigation.proficient',
            'value:skill.nature.proficient',
            'value:skill.religion.proficient'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.epic-boon']
    },
    'wizard-xphb': {
      grants: [
        { set: 'value:save.int.proficient', to: true },
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 6 },
        { set: 'value:spellcasting.ability.int', to: true },
        { set: 'value:spellcasting.caster_type.full', to: true }
      ],
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [
            'value:skill.arcana.proficient',
            'value:skill.history.proficient',
            'value:skill.insight.proficient',
            'value:skill.investigation.proficient',
            'value:skill.medicine.proficient',
            'value:skill.nature.proficient',
            'value:skill.religion.proficient'
          ]
        }
      ],
      // Character Progression Phase 1B -- the Wizard's own real 2024 XPHB
      // Level 2 "Scholar" feature (verified directly against
      // /opt/eldra/datasets/5etools-src/data/class/class-wizard.json's own
      // `classFeature` entries, source XPHB): "Choose one of [Arcana,
      // History, Investigation, Medicine, Nature, or Religion] in which you
      // have proficiency. You have Expertise in the chosen skill." A real,
      // structurally-authored progression fact -- not fabricated, not
      // present merely because 2024 D&D normally has one -- see
      // packages/eldra-dnd5e-2024/definitions.json's own
      // `progression:class.skill-expertise` for the level-2 row this points at and
      // this package's own new `value:skill.*.expertise`/
      // `choice:skill.expertise` Definitions for what answering it means.
      //
      // Character Progression Phase 1C -- `progression:class.subclass-selection`
      // added as a SECOND, independent Progression this facet opts into
      // (RulesFacet.progression is an array precisely so a class can
      // reference more than one Progression without either bundling
      // unrelated mechanics into one Definition or forcing every class to
      // share Wizard's own Expertise progression). It is the SAME generic,
      // class-agnostic Definition any class's facet could reference
      // (packages/eldra-dnd5e-2024/definitions.json declares no class name
      // in it) -- its Level-3 threshold is the real, structurally-verified
      // 2024 XPHB Wizard subclass-selection level (class-wizard.json's own
      // `classFeature` entries), not invented.
      //
      // D&D 2024 Character Rules Phase 2A.1 -- the Level 4 Ability Score
      // Improvement/feat gap immediately above is now closed: the relative-
      // increase blocker (`RulesFacetGrant`'s own "no increase, only set")
      // is resolved by reusing the EXISTING Source + `phase: 'add'`
      // Modifier machinery (never a new grant operation -- see
      // app/lib/rules/types.ts's own `effect` header), and Feat Selection
      // reuses the identical `fromContentCatalogue` precedent Subclass
      // Selection (immediately above) already proved. `progression:class.
      // asi-wizard` is a THIRD, independent Progression this facet opts
      // into -- real XPHB Wizard ASI levels (4/8/12/16, class-wizard.json's
      // own `classFeatures`), a separate Definition from every other
      // class's own ASI progression for the exact reason Fighter/Rogue's
      // own outlier cadences require it (see those two classes' own facets).
      progression: [
        'progression:class.skill-expertise',
        'progression:class.subclass-selection',
        'progression:class.asi-standard',
        'progression:class.epic-boon'
      ]
    }
  },

  // ---------------------------------------------------------------------
  // SUBCLASSES -- D&D 2024 Character Rules Phase 2A.2, SUBCLASS RESOURCE
  // PROOF
  // ---------------------------------------------------------------------
  // The FIRST subclass-entityType facet this corpus has ever authored --
  // every other subclass of the real 48 (§5 of the completeness audit)
  // remains genuinely unauthored, exactly as that audit found. This ONE
  // entry exists specifically to prove "resource acquisition is not
  // class-slot-specific" (this phase's own explicit SUBCLASS RESOURCE
  // PROOF requirement): Battle Master's Superiority Dice is a clean,
  // real, finite-pool resource (XPHB class-fighter.json's own
  // `subclassFeature` "Combat Superiority" -- "You have four Superiority
  // Dice, which are d8s... you regain all expended Superiority Dice when
  // you finish a Short Rest or Long Rest... five dice total at level 7,
  // six total at level 15"; die size becomes d10 at level 10, d12 at
  // level 18 via the same subclass's own later features), authored on
  // `facet.resources` exactly like a base class's always-on resource
  // (Rage, Second Wind) -- no NEW mechanism, because a resolved subclass
  // reaches `character-actor-bridge.ts` through the ordinary SLOT_ORDER
  // 'subclass' slot, which already consumes `facet.resources` identically
  // to every other slot.
  //
  // SLUG, HONESTLY FLAGGED: `battle-master-xphb` follows this corpus's own
  // `<title-kebab-case>-xphb` convention (human-xphb, wizard-xphb, ...)
  // but, because NO subclass has ever been imported into a real Content
  // Pack (the import pipeline that would assign this entry's actual slug
  // has never run for any of the 48), this is an ASSUMED, not a
  // production-verified, slug -- mirrors the exact same honest caveat
  // tests/server/utils/character-progression-plan.test.ts's own
  // `SUBCLASS_OPTION` fixture already carries for `school-of-evocation-phb`
  // ("these tests exercise the generic progression machinery, not any
  // real published subclass corpus"). Making this live on Solaris's bound
  // Content Pack requires that Pack to be rebuilt/republished against this
  // corpus -- a separate, out-of-this-phase content-pack operation, not a
  // Rules Package change.
  // D&D 2024 Character Rules Phase 2A.2 (SUBCLASS AUDIT follow-up) --
  // `battle-master-xphb` is the ONLY subclass facet authored this phase.
  // War Priest (Cleric, War Domain), Warding Flare (Cleric, Light Domain),
  // and Dark One's Own Luck (Warlock, Fiend Patron) were identified as
  // real, structurally clean finite-pool resources (all three
  // corpus-verified, all three the same `max(1, ability modifier)` shape
  // Bardic Inspiration/Tireless already prove) but DELIBERATELY NOT wired
  // here -- a real correctness gap, caught before authoring: a subclass
  // facet is consumed unconditionally the moment `progression.classes[].
  // subclassRef` resolves (character-actor-bridge.ts's ordinary SLOT_ORDER
  // 'subclass' slot), with no subclass-INTERNAL level gate -- there is no
  // mechanism analogous to `ProgressionRow.resources` (class-scoped, keyed
  // by `value:level`) for "this subclass facet's OWN feature arrives at
  // ITS level N, independent of when the subclass itself was selected."
  // Battle Master happens to have no gap (Fighter selects its subclass AND
  // Combat Superiority both land at level 3), which is why it was safe to
  // author -- but Cleric/Warlock select their subclass at level 1 while
  // War Priest/Warding Flare are real level-3 features and Dark One's Own
  // Luck is a real level-6 feature; wiring any of the three today would
  // grant access 2-5 levels early, a CORRECTNESS REGRESSION, not merely an
  // incomplete one. The three Resource Definitions themselves are left
  // unauthored in definitions.json for the identical reason -- an
  // unreferenced Definition serves no purpose and risks being mistaken for
  // "done." Missing primitive, precisely named: a subclass-scoped,
  // feature-level-keyed resource-acquisition row (the subclass-facet
  // counterpart of `ProgressionRow.resources`) -- deferred, not solved, by
  // this phase.
  subclass: {
    'battle-master-xphb': {
      resources: ['resource:superiority_dice']
    }
  },

  // ---------------------------------------------------------------------
  // FEATS -- D&D 2024 Character Rules Phase 2A.1
  // ---------------------------------------------------------------------
  // All 43 native-XPHB General feats (`category: 'G'`, `source === 'XPHB'`
  // in the real feats.json corpus) -- every one of them, not a sample, per
  // this phase's own PRODUCT ACCEPTANCE ("the legal set includes Ability
  // Score Improvement plus other legal General feats for which the
  // character qualifies"). Origin/Fighting Style/Epic Boon feats are
  // DELIBERATELY NOT authored here -- see this phase's own DEFERRED
  // section of its report; `choice:feat.selection`'s own
  // `fromContentCatalogue` selector only offers `featMechanics.category
  // === 'general'` entries (server/utils/character-derived.ts), so an
  // unauthored Origin/Fighting Style/Epic Boon feat simply presents in the
  // Catalogue without being selectable through THIS progression -- exactly
  // the "content with none presents but does not mechanise" rule (§8.2
  // rule 4) this file already applies to unfaceted species/items.
  //
  // WHAT EVERY ONE OF THESE FACETS DOES, AND DOES NOT, DO. This phase's
  // own HARD STOP -- FEAT EFFECT COMPLETENESS instruction required
  // determining what selecting a feat can honestly do TODAY before
  // authoring a single facet: verified directly against the real corpus
  // (feats.json, all 43 General entries) that EVERY ONE grants exactly one
  // ability-increase shape (fixed +1, choose-one +1, or -- Ability Score
  // Improvement alone -- the +2-one/+1-two-distinct shape) ALONGSIDE its
  // own unique thematic mechanic (Crossbow Expert's ignore-loading text,
  // Great Weapon Master's bonus-action attack, Shield Master's shove
  // reaction, ...). The ability increase is the ONE effect Eldra's engine
  // can structurally apply today (via `source:asi.increase.*`, the Source +
  // `phase: 'add'` Modifier this phase's own increment-primitive design
  // reuses -- see app/lib/rules/types.ts's own `effect` header). Every
  // OTHER per-feat mechanic is NOT modeled here -- no Action, no combat
  // rule, no passive grant beyond the ability bump. Selecting any of these
  // 43 feats is therefore honest and complete for: identity (ContentRef),
  // persistence (survives reload), the ability-score consequence, and Sheet
  // display -- and structurally inert for the feat's own named combat/
  // utility text, which remains prose the player reads and adjudicates,
  // exactly the same "feat selection/persistence is structurally supported;
  // feat EFFECT beyond the ability increase is not" boundary this phase's
  // own report states explicitly, never silently claimed complete.
  //
  // RESILIENT'S OWN KNOWN SIMPLIFICATION: the real feat text restricts its
  // ability choice to "an ability in which you lack saving throw
  // proficiency." That per-character dynamic filter is NOT applied here --
  // `resilient-xphb`'s own `from` offers all six abilities unconditionally,
  // the same static list every other `choice:feat.ability-choice-1` feat
  // uses. A deliberate, reported simplification (dynamic filtering by
  // CURRENT proficiency state is not a trivial addition to the existing
  // choice-option machinery), not a silently dropped requirement.
  //
  // Every `from`/`sources` entry below names a REAL, registered
  // `source:asi.increase.<ability>` Definition (definitions.json) -- never
  // a bare ability token -- matching §8.2 rule 1 exactly as every other
  // facet in this corpus already does (verified directly by this
  // codebase's own `every offered option is a Definition the Rules Package
  // actually declares` test). `choice:feat.asi-ability-increase`'s/
  // `choice:feat.ability-choice-1`'s own `writesTo: 'source:asi.increase.
  // {selected}'` template therefore degenerates to a pass-through for this
  // corpus (`resolveChoiceTarget`'s own "already resolved" branch,
  // app/lib/characters/rules-choices.ts) -- the identical relationship
  // `choice:skill.proficiency`'s own `writesTo` already has with THIS
  // corpus's fully-qualified `value:skill.*.proficient` options.
  feat: {
    // FIGHTING STYLE FEATS -- PHASE 2C.2A. The ten ordinary XPHB Fighting Style
    // feats (raw category FS). Each declares its explicit coverage of the raw
    // prerequisite `feature: ["Fighting Style"]` by pointing at the package's
    // feature Value. The mapping is per-feat authored data, matched on the raw
    // name verbatim -- never inferred. Blessed Warrior and Druidic Warrior (FS:P,
    // FS:R) are deliberately NOT here: their `otherSummary` prerequisite stays
    // unsupported, and their mandatory nested cantrip choices need Spell
    // Acquisition, so they remain illegal (fail closed).
    'archery-xphb': { // Archery
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'blind-fighting-xphb': { // Blind Fighting
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'defense-xphb': { // Defense
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'dueling-xphb': { // Dueling
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'great-weapon-fighting-xphb': { // Great Weapon Fighting
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'interception-xphb': { // Interception
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'protection-xphb': { // Protection
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'thrown-weapon-fighting-xphb': { // Thrown Weapon Fighting
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'two-weapon-fighting-xphb': { // Two-Weapon Fighting
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    'unarmed-fighting-xphb': { // Unarmed Fighting
      featureRequirements: [
        { feature: 'Fighting Style', requires: 'value:feature.fighting-style' }
      ]
    },
    // EPIC BOONS -- D&D 2024 Character Rules Phase 2C.1. All 12 native-XPHB
    // Epic Boons (`category: 'EB'`). Each authors ONLY its ability increase:
    // choose one listed ability, +1, cap 30 (`choice:feat.epic-boon-ability`'s
    // own resultCap). Their other text is NOT authored and NOT structurally
    // applied: Energy Resistance (damage-type resistance), Speed, and Truesight
    // need vocabulary the package does not declare, and Skill's proficiency +
    // expertise nested choices need a `requiresActive` over a same-feat grant
    // (a new primitive). Acquisition is complete; those effects are reported as
    // separate ENGINE_BLOCKED rows in the coverage ledger, never folded in here.
    'boon-of-combat-prowess-xphb': { // Boon of Combat Prowess
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-dimensional-travel-xphb': { // Boon of Dimensional Travel
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-energy-resistance-xphb': { // Boon of Energy Resistance
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-fate-xphb': { // Boon of Fate
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-fortitude-xphb': { // Boon of Fortitude
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-irresistible-offense-xphb': { // Boon of Irresistible Offense
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'boon-of-recovery-xphb': { // Boon of Recovery
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-skill-xphb': { // Boon of Skill
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-speed-xphb': { // Boon of Speed
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-spell-recall-xphb': { // Boon of Spell Recall
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-the-night-spirit-xphb': { // Boon of the Night Spirit
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'boon-of-truesight-xphb': { // Boon of Truesight
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'ability-score-improvement-xphb': { // Ability Score Improvement
      choices: [
        {
          choiceSet: 'choice:feat.asi-ability-increase',
          count: 2,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'actor-xphb': { // Actor
      sources: ['source:asi.increase.cha']
    },
    'athlete-xphb': { // Athlete
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'charger-xphb': { // Charger
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'chef-xphb': { // Chef
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.con', 'source:asi.increase.wis']
        }
      ]
    },
    'crossbow-expert-xphb': { // Crossbow Expert
      sources: ['source:asi.increase.dex']
    },
    'crusher-xphb': { // Crusher
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.con']
        }
      ]
    },
    'defensive-duelist-xphb': { // Defensive Duelist
      sources: ['source:asi.increase.dex']
    },
    'dual-wielder-xphb': { // Dual Wielder
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'durable-xphb': { // Durable
      sources: ['source:asi.increase.con']
    },
    'elemental-adept-xphb': { // Elemental Adept
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'fey-touched-xphb': { // Fey-Touched
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'grappler-xphb': { // Grappler
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'great-weapon-master-xphb': { // Great Weapon Master
      sources: ['source:asi.increase.str']
    },
    'heavily-armored-xphb': { // Heavily Armored
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.con', 'source:asi.increase.str']
        }
      ]
    },
    'heavy-armor-master-xphb': { // Heavy Armor Master
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.con', 'source:asi.increase.str']
        }
      ]
    },
    'inspiring-leader-xphb': { // Inspiring Leader
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'keen-mind-xphb': { // Keen Mind
      sources: ['source:asi.increase.int']
    },
    'lightly-armored-xphb': { // Lightly Armored
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'mage-slayer-xphb': { // Mage Slayer
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'martial-weapon-training-xphb': { // Martial Weapon Training
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'medium-armor-master-xphb': { // Medium Armor Master
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'moderately-armored-xphb': { // Moderately Armored
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'mounted-combatant-xphb': { // Mounted Combatant
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.wis']
        }
      ]
    },
    'observant-xphb': { // Observant
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis']
        }
      ]
    },
    'piercer-xphb': { // Piercer
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'poisoner-xphb': { // Poisoner
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.dex', 'source:asi.increase.int']
        }
      ]
    },
    'polearm-master-xphb': { // Polearm Master
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.dex', 'source:asi.increase.str']
        }
      ]
    },
    'resilient-xphb': { // Resilient
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'ritual-caster-xphb': { // Ritual Caster
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'sentinel-xphb': { // Sentinel
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'shadow-touched-xphb': { // Shadow-Touched
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'sharpshooter-xphb': { // Sharpshooter
      sources: ['source:asi.increase.dex']
    },
    'shield-master-xphb': { // Shield Master
      sources: ['source:asi.increase.str']
    },
    'skill-expert-xphb': { // Skill Expert
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'skulker-xphb': { // Skulker
      sources: ['source:asi.increase.dex']
    },
    'slasher-xphb': { // Slasher
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    },
    'speedy-xphb': { // Speedy
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.dex', 'source:asi.increase.con']
        }
      ]
    },
    'spell-sniper-xphb': { // Spell Sniper
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'telekinetic-xphb': { // Telekinetic
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'telepathic-xphb': { // Telepathic
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'war-caster-xphb': { // War Caster
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ]
    },
    'weapon-master-xphb': { // Weapon Master
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex']
        }
      ]
    }
  },

  background: {
    'acolyte-xphb': {
      grants: [
        { set: 'value:skill.insight.proficient', to: true },
        { set: 'value:skill.religion.proficient', to: true }
      ]
    },
    'artisan-xphb': {
      grants: [
        { set: 'value:skill.investigation.proficient', to: true },
        { set: 'value:skill.persuasion.proficient', to: true }
      ]
    },
    'charlatan-xphb': {
      grants: [
        { set: 'value:skill.deception.proficient', to: true },
        { set: 'value:skill.sleight_of_hand.proficient', to: true }
      ]
    },
    'criminal-xphb': {
      grants: [
        { set: 'value:skill.sleight_of_hand.proficient', to: true },
        { set: 'value:skill.stealth.proficient', to: true }
      ]
    },
    'entertainer-xphb': {
      grants: [
        { set: 'value:skill.acrobatics.proficient', to: true },
        { set: 'value:skill.performance.proficient', to: true }
      ]
    },
    'farmer-xphb': {
      grants: [
        { set: 'value:skill.animal_handling.proficient', to: true },
        { set: 'value:skill.nature.proficient', to: true }
      ]
    },
    'guard-xphb': {
      grants: [
        { set: 'value:skill.athletics.proficient', to: true },
        { set: 'value:skill.perception.proficient', to: true }
      ]
    },
    'guide-xphb': {
      grants: [
        { set: 'value:skill.stealth.proficient', to: true },
        { set: 'value:skill.survival.proficient', to: true }
      ]
    },
    'hermit-xphb': {
      grants: [
        { set: 'value:skill.medicine.proficient', to: true },
        { set: 'value:skill.religion.proficient', to: true }
      ]
    },
    'merchant-xphb': {
      grants: [
        { set: 'value:skill.animal_handling.proficient', to: true },
        { set: 'value:skill.persuasion.proficient', to: true }
      ]
    },
    'noble-xphb': {
      grants: [
        { set: 'value:skill.history.proficient', to: true },
        { set: 'value:skill.persuasion.proficient', to: true }
      ]
    },
    'sage-xphb': {
      grants: [
        { set: 'value:skill.arcana.proficient', to: true },
        { set: 'value:skill.history.proficient', to: true }
      ]
    },
    'sailor-xphb': {
      grants: [
        { set: 'value:skill.acrobatics.proficient', to: true },
        { set: 'value:skill.perception.proficient', to: true }
      ]
    },
    'scribe-xphb': {
      grants: [
        { set: 'value:skill.investigation.proficient', to: true },
        { set: 'value:skill.perception.proficient', to: true }
      ]
    },
    'soldier-xphb': {
      grants: [
        { set: 'value:skill.athletics.proficient', to: true },
        { set: 'value:skill.intimidation.proficient', to: true }
      ]
    },
    'wayfarer-xphb': {
      grants: [
        { set: 'value:skill.insight.proficient', to: true },
        { set: 'value:skill.stealth.proficient', to: true }
      ]
    }
  },

  species: {
    'elf-xphb': {
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 1,
          from: [
            'value:skill.insight.proficient',
            'value:skill.perception.proficient',
            'value:skill.survival.proficient'
          ]
        }
      ]
    },
    'human-xphb': {
      choices: [
        {
          choiceSet: 'choice:skill.proficiency',
          count: 1,
          from: [
            'value:skill.acrobatics.proficient',
            'value:skill.animal_handling.proficient',
            'value:skill.arcana.proficient',
            'value:skill.athletics.proficient',
            'value:skill.deception.proficient',
            'value:skill.history.proficient',
            'value:skill.insight.proficient',
            'value:skill.intimidation.proficient',
            'value:skill.investigation.proficient',
            'value:skill.medicine.proficient',
            'value:skill.nature.proficient',
            'value:skill.perception.proficient',
            'value:skill.performance.proficient',
            'value:skill.persuasion.proficient',
            'value:skill.religion.proficient',
            'value:skill.sleight_of_hand.proficient',
            'value:skill.stealth.proficient',
            'value:skill.survival.proficient'
          ]
        }
      ]
    }
  },
  item: {
    'battleaxe-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'blowgun-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'breastplate-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 14,
            dexCapMin: -99,
            dexCapMax: 2
          }
        }
      ]
    },
    'chain-mail-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 16,
            dexCapMin: 0,
            dexCapMax: 0
          }
        }
      ]
    },
    'chain-shirt-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 13,
            dexCapMin: -99,
            dexCapMax: 2
          }
        }
      ]
    },
    'club-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'dagger-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'dart-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'flail-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'glaive-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'greataxe-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'greatclub-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'greatsword-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'halberd-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'half-plate-armor-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 15,
            dexCapMin: -99,
            dexCapMax: 2
          }
        }
      ]
    },
    'hand-crossbow-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'handaxe-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'heavy-crossbow-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'hide-armor-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 12,
            dexCapMin: -99,
            dexCapMax: 2
          }
        }
      ]
    },
    'javelin-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'lance-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'leather-armor-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 11,
            dexCapMin: -99,
            dexCapMax: 99
          }
        }
      ]
    },
    'light-crossbow-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'light-hammer-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'longbow-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'longsword-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'mace-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'maul-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'morningstar-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'musket-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'padded-armor-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 11,
            dexCapMin: -99,
            dexCapMax: 99
          }
        }
      ]
    },
    'pike-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'pistol-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'plate-armor-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 18,
            dexCapMin: 0,
            dexCapMax: 0
          }
        }
      ]
    },
    'psychic-blade-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'quarterstaff-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'rapier-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'ring-mail-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 14,
            dexCapMin: 0,
            dexCapMax: 0
          }
        }
      ]
    },
    'scale-mail-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 14,
            dexCapMin: -99,
            dexCapMax: 2
          }
        }
      ]
    },
    'scimitar-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'shield-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'armor', slot: 'held' }
        }
      ]
    },
    'shortbow-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'shortsword-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'sickle-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'sling-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'spear-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'splint-armor-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 17,
            dexCapMin: 0,
            dexCapMax: 0
          }
        }
      ]
    },
    'studded-leather-armor-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: {
            category: 'armor',
            slot: 'armor',
            sourceRef: 'source:equipment.armor',
            armorClass: 12,
            dexCapMin: -99,
            dexCapMax: 99
          }
        }
      ]
    },
    'trident-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'war-pick-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'warhammer-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    },
    'whip-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'weapon', slot: 'held' }
        }
      ]
    }
  }
}
