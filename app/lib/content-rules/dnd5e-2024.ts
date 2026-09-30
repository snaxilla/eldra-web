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
      progression: ['progression:class.asi-standard']
    },
    'bard-xphb': {
      grants: [
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 },
        { set: 'value:spellcasting.ability.cha', to: true },
        { set: 'value:spellcasting.caster_type.full', to: true }
      ],
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
      progression: ['progression:class.asi-standard']
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
      // note above.
      progression: ['progression:class.asi-standard']
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
      // note above.
      progression: ['progression:class.asi-standard']
    },
    'fighter-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.con.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 10 }
      ],
      choices: [
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
      progression: ['progression:class.asi-extended']
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
      // note above.
      progression: ['progression:class.asi-standard']
    },
    'paladin-xphb': {
      grants: [
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 10 },
        { set: 'value:spellcasting.ability.cha', to: true },
        { set: 'value:spellcasting.caster_type.half', to: true }
      ],
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
      // note above.
      progression: ['progression:class.asi-standard']
    },
    'ranger-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 10 },
        { set: 'value:spellcasting.ability.wis', to: true },
        { set: 'value:spellcasting.caster_type.half', to: true }
      ],
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
      progression: ['progression:class.asi-standard']
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
      progression: ['progression:class.asi-frequent']
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
      // note above.
      progression: ['progression:class.asi-standard']
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
      progression: ['progression:class.asi-standard']
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
        'progression:class.asi-standard'
      ]
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
