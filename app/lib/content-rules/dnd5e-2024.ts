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

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P8 -- STARTING EQUIPMENT CURRENCY AND CROSS-REFERENCES
// ---------------------------------------------------------------------------
// Every real XPHB `value` entry (barbarian.json's own `{ "value": 1500 }`) is already
// expressed in the smallest base unit -- copper -- confirmed by cross-checking against the
// corpus's own prose (`1500` alongside "15 GP" throughout every class/background's `entries`
// text, consistently a 100:1 ratio). One flat denomination is therefore the entire currency
// model P8 needs: no gp/sp/cp breakdown, no conversion table, nothing D&D-specific baked into
// app/lib/characters/currency.ts (which only ever sees this as an opaque string it sums).
// `'xphb'` is the PACKAGE/content-source token, never the player-facing label "Copper Pieces" --
// exactly how every other denominationless identity in this corpus is tokenized.
export const DND5E_2024_CURRENCY_DENOMINATION = 'currency:xphb.copper'

// The D&D-specific half of EquipmentGrant's `crossReference` resolution (see
// app/lib/characters/equipment-bundle.ts's own header for why this mapping is injected by the
// caller rather than imported by the generic resolver). Maps every real corpus `from` entry a
// `crossReference` grant can point at -- the SAME 17 artisan-tool, 10 instrument, and 4
// gaming-set proficiency Value ids already authored above -- to the real Solaris-catalogue item
// slug it corresponds to physically. Server-utils-side (character-equipment-bundle.ts) reads the
// character's own stored answer for the referenced ChoiceSet, looks the selected Value id up
// here, and resolves the resulting slug against the World's current catalogue exactly like any
// other item grant. Verified against the real bound Content Pack (217 curated items) before this
// table was written -- every one of these 31 slugs resolves; none is a guess.
export const DND5E_2024_EQUIPMENT_CROSS_REFERENCE_ITEM_SLUGS: Record<string, string> = {
  // Artisan's tools (17) -- Monk's choice:proficiency.artisan-or-instrument.class,
  // Artisan background's choice:proficiency.artisan-tool.background.
  'value:tool.alchemists_supplies.proficient': 'alchemists-supplies-xphb',
  'value:tool.brewers_supplies.proficient': 'brewers-supplies-xphb',
  'value:tool.calligraphers_supplies.proficient': 'calligraphers-supplies-xphb',
  'value:tool.carpenters_tools.proficient': 'carpenters-tools-xphb',
  'value:tool.cartographers_tools.proficient': 'cartographers-tools-xphb',
  'value:tool.cobblers_tools.proficient': 'cobblers-tools-xphb',
  'value:tool.cooks_utensils.proficient': 'cooks-utensils-xphb',
  'value:tool.glassblowers_tools.proficient': 'glassblowers-tools-xphb',
  'value:tool.jewelers_tools.proficient': 'jewelers-tools-xphb',
  'value:tool.leatherworkers_tools.proficient': 'leatherworkers-tools-xphb',
  'value:tool.masons_tools.proficient': 'masons-tools-xphb',
  'value:tool.painters_supplies.proficient': 'painters-supplies-xphb',
  'value:tool.potters_tools.proficient': 'potters-tools-xphb',
  'value:tool.smiths_tools.proficient': 'smiths-tools-xphb',
  'value:tool.tinkers_tools.proficient': 'tinkers-tools-xphb',
  'value:tool.weavers_tools.proficient': 'weavers-tools-xphb',
  'value:tool.woodcarvers_tools.proficient': 'woodcarvers-tools-xphb',
  // Musical instruments (10) -- Monk's artisan-or-instrument choice, Entertainer
  // background's choice:proficiency.instrument.background.
  'value:tool.bagpipes.proficient': 'bagpipes-xphb',
  'value:tool.drum.proficient': 'drum-xphb',
  'value:tool.dulcimer.proficient': 'dulcimer-xphb',
  'value:tool.flute.proficient': 'flute-xphb',
  'value:tool.horn.proficient': 'horn-xphb',
  'value:tool.lute.proficient': 'lute-xphb',
  'value:tool.lyre.proficient': 'lyre-xphb',
  'value:tool.pan_flute.proficient': 'pan-flute-xphb',
  'value:tool.shawm.proficient': 'shawm-xphb',
  'value:tool.viol.proficient': 'viol-xphb',
  // Gaming sets (4) -- Guard/Noble/Soldier backgrounds' shared
  // choice:proficiency.gaming-set.background.
  'value:tool.dice_set.proficient': 'dice-set-xphb',
  'value:tool.dragonchess_set.proficient': 'dragonchess-set-xphb',
  'value:tool.playing_cards.proficient': 'playing-cards-xphb',
  'value:tool.three_dragon_ante_set.proficient': 'three-dragon-ante-set-xphb'
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules -- CLASS FEATURE-OPTION DECISIONS: KNOWN DEFERRED EFFECTS
// ---------------------------------------------------------------------------
// Divine Order (Cleric, L1), Primal Order (Druid, L1), Blessed Strikes (Cleric, L7), and
// Elemental Fury (Druid, L7) are each a real XPHB "choose exactly 1 of 2 named options"
// decision, all four permanent (no replacement clause anywhere in the real corpus text) and all
// four authored through the SAME generic `choice:class.feature-option` ChoiceSet
// (packages/eldra-dnd5e-2024/definitions.json) -- never a class-specific picker, never a
// class-name branch in application code. This is build-decision completeness (Milestone A): the
// CHOICE itself is fully represented, persisted, validated server-side, and reachable through
// both creation and the Level Manager, exactly like Background ability distribution or ASI.
//
// Deliberately NOT the same claim as "every mechanical effect of the chosen option is
// automated" (Milestone B), which is a separate, later concern this phase does not claim:
//   - Protector (Cleric) / Warden (Druid): FULLY representable and authored now -- a fixed
//     martial-weapon + heavy/medium-armor training grant, through the identical Value/Modifier
//     mechanism every class's own `grants` array already uses, just reached via `activate-source`
//     instead of an always-on facet grant.
//   - Thaumaturge (Cleric) / Magician (Druid): FEAT-OWNED SPELL ACQUISITION PHASE REVISIT -- now
//     FULLY representable and authored (cleric-xphb/druid-xphb facets above). The real corpus
//     grants a bonus Cleric/Druid cantrip ("you know one extra cantrip from the [class] spell
//     list"), a genuine SPELL PICK conditioned on THIS SPECIFIC Source being active -- exactly the
//     gap `SpellRequirement.requiresActive` (added this phase) closes: `choice:class.feature-option`
//     is authored with `effect: 'activate-source'` and no `writesTo`, so the selected answer IS the
//     Source id itself, verbatim, in `StoredRulesChoices.selections` -- answerable by the SAME
//     chosen-Source gate check `gatherSpellRequirements` already performs, no new primitive beyond
//     what this phase already built for the Builder/server to reuse. Authored as a second,
//     independently-tagged `pool: 'cantrip'` requirement on each class's own facet (one MORE
//     cantrip pick, not a reclassification of the normal three) -- pure package authoring, the
//     Source itself needed no change beyond already activating correctly.
//   - Divine Strike (Cleric) / Primal Strike (Druid): a per-ATTACK damage-type choice made at
//     the moment of a hit ("your choice" happens in combat, not at acquisition) -- Milestone B
//     combat automation, deferred the same way every other per-use runtime effect in this corpus
//     already is (e.g. the Progression Coverage Ledger's own runtime-effect rows).
//   - Potent Spellcasting (Cleric and Druid, two separate Sources: cantrip-damage already scales
//     with a derived Wisdom-modifier bonus): a damage-ROLL modifier, which depends on the Actions
//     system's own damage-resolution path -- Milestone B, deferred, same reasoning.
//
// No fixed, currently-representable grant was left as prose: Protector/Warden/Thaumaturge/Magician
// are all fully authored. Every remaining deferred item above is Milestone B combat/damage
// automation -- never an oversight.

// Keyed by the `entityType` the importer writes, then by `slug`
// (`slugify(name-source)`), which is what a Character's stored choice
// records and what Character Assembly re-resolves on.
export const DND5E_2024_RULES_FACETS: RulesFacetCorpus = {
  class: {
    'barbarian-xphb': {
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:armor.medium.proficient', to: true },
        { set: 'value:armor.shield.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
        { set: 'value:weapon.martial.proficient', to: true },
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
        },
        // Weapon Mastery phase -- real corpus wording -- "two kinds of Simple or Martial MELEE weapons
        // of your choice" (class-barbarian.json's own Weapon Mastery feature, verified this
        // phase) -- Barbarian's own real restriction to melee weapons, not shared by every other
        // Weapon Mastery class, hence the dedicated `.melee-only` ChoiceSet variant (never a class
        // branch in application code -- the restriction lives in the package, like Fighting
        // Style's own `fs-only`/`fs-and-fs-p`/`fs-and-fs-r` variants).
        {
          choiceSet: 'choice:class.weapon-mastery.melee-only',
          count: 2
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
      // Weapon Mastery phase -- real corpus: Barbarian's own Weapon Mastery column on the
      // Barbarian Features table (class-barbarian.json's own `classTableGroups`, verified this
      // phase) reads 2 at Level 1, 3 at Level 4, 4 at Level 10, unchanged through Level 20 -- the
      // SAME `-4-10` cadence Fighter does not share (Fighter grows at 4/10/16 instead), hence the
      // separate cadence id, named by SHAPE, never by class.
      // D&D 2024 Character Rules A1 -- Primal Knowledge (XPHB classFeature, level 3): "You gain
      // proficiency in another skill of your choice from the skill list available to Barbarians
      // at level 1" -- the SAME 6-skill list as Barbarian's own Level-1 `choice:skill.proficiency`
      // above, re-offered via `choice:skill.proficiency`'s own generic `excludeIfAlreadyActive`
      // (the 2 already chosen at Level 1 are automatically excluded, leaving a real 4-option
      // choice -- "another skill" is honored for free, never a Barbarian-specific check). The
      // Rage-active ability-check-as-Strength clause is a RUNTIME effect (Milestone B), not an
      // acquisition decision -- not modeled here.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.epic-boon', 'progression:class.weapon-mastery-growth-4-10', 'progression:class.skill-proficiency-growth-3'],
      startingEquipment: {
        id: 'choice:equipment.starting.barbarian-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Greataxe, 4 Handaxes, Explorer's Pack, 15 GP",
            grants: [
              { kind: 'item', slug: 'greataxe-xphb' },
              { kind: 'item', slug: 'handaxe-xphb', quantity: 4 },
              { kind: 'item', slug: 'explorers-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1500 }
            ]
          },
          {
            id: 'B',
            label: "(B) 75 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 7500 }
            ]
          }
        ]
      }
    },
    'bard-xphb': {
      spellRequirements: [
        {
          id: 'spell-requirement.bard-xphb.spell',
          pool: 'spell',
          filter: { classList: ['Bard'] },
          totalByLevel: [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
        },
        {
          id: 'spell-requirement.bard-xphb.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Bard'], level: 0 },
          totalByLevel: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]
        }
      ],
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
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
          choiceSet: 'choice:proficiency.instrument.class',
          count: 3,
          from: [
            'value:tool.bagpipes.proficient',
            'value:tool.drum.proficient',
            'value:tool.dulcimer.proficient',
            'value:tool.flute.proficient',
            'value:tool.horn.proficient',
            'value:tool.lute.proficient',
            'value:tool.lyre.proficient',
            'value:tool.pan_flute.proficient',
            'value:tool.shawm.proficient',
            'value:tool.viol.proficient'
          ]
        },
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
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.skill-expertise-choose-two-at-2-and-9', 'progression:class.epic-boon'],
      startingEquipment: {
        id: 'choice:equipment.starting.bard-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Leather Armor, 2 Daggers, Musical Instrument of your choice, Entertainer's Pack, 19 GP",
            grants: [
              { kind: 'item', slug: 'leather-armor-xphb' },
              { kind: 'item', slug: 'dagger-xphb', quantity: 2 },
              // D&D 2024 Character Rules P8 -- real XPHB text ("Musical Instrument of your
              // choice") is independent of WHICH three instruments this Bard is proficient in
              // (unlike Monk's identical-looking line, which explicitly says "chosen for the
              // tool proficiency above") -- the 3-pick proficiency choice has no single
              // deterministic answer a `crossReference` grant could point at, and the engine's
              // ChoiceSet mechanism has no "answer this without writing a Value" mode (every
              // `fromContentFacet`/`explicit` ChoiceSet's default `effect: 'set-value'` always
              // sets `values[selected] = true` -- see ChoiceSetDefinition's own header,
              // app/lib/rules/types.ts): a second 1-of-10 pick sharing the SAME 10 instrument
              // Value ids would risk granting a 4th, unintended instrument proficiency the
              // moment a player picked a carried instrument different from their 3 chosen ones.
              // Building a non-mechanical "informational choice" primitive to avoid that is a
              // real engine change, out of this phase's scope -- so this resolves as `custom`,
              // the same escape Wizard's Spellbook already uses, trading "a specific catalogue
              // item" for "correct, with no invented engine primitive."
              { kind: 'custom', name: 'Musical Instrument' },
              { kind: 'item', slug: 'entertainers-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1900 }
            ]
          },
          {
            id: 'B',
            label: "(B) 90 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 9000 }
            ]
          }
        ]
      }
    },
    'cleric-xphb': {
      spellRequirements: [
        {
          id: 'spell-requirement.cleric-xphb.spell',
          pool: 'spell',
          filter: { classList: ['Cleric'] },
          totalByLevel: [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
        },
        {
          id: 'spell-requirement.cleric-xphb.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Cleric'], level: 0 },
          totalByLevel: [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5]
        },
        // FEAT-OWNED SPELL ACQUISITION PHASE -- Thaumaturge revisit. Source wording (class-cleric.json
        // classFeature "Thaumaturge", level 1): "You know one extra cantrip from the Cleric spell
        // list" -- a genuinely player-CHOSEN cantrip (never fixed), permanent (no stated growth), gated
        // on having chosen Thaumaturge over Protector in Divine Order's own `choice:class.feature-option`
        // below. `choice:class.feature-option` is authored with `effect: 'activate-source'` and no
        // `writesTo` (packages/eldra-dnd5e-2024/definitions.json), so the selected answer IS the Source
        // id `source:divine-order.thaumaturge` verbatim -- exactly the CHOSEN-Source gate shape
        // `requiresActive`/`gatherSpellRequirements` added this phase to support (see that file's own
        // header, app/lib/characters/spell-requirement-ownership.ts). Same `pool: 'cantrip'` kind as the
        // class's own cantrip pool above, but its own distinct requirement id -- evaluated and tagged
        // independently (P3.2.1 provenance), so this is one MORE cantrip pick, never a reclassification
        // of one of the normal three. Pure package authoring: no new primitive needed.
        {
          id: 'spell-requirement.cleric-xphb.thaumaturge-cantrip',
          pool: 'cantrip',
          filter: { classList: ['Cleric'], level: 0 },
          totalByLevel: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
          requiresActive: ['source:divine-order.thaumaturge'],
          label: 'Thaumaturge Cantrip'
        }
      ],
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:armor.medium.proficient', to: true },
        { set: 'value:armor.shield.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
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
        },
        // D&D 2024 Character Rules -- Divine Order (XPHB `classFeature` "Divine Order", level 1):
        // "You have dedicated yourself to one of the following sacred roles of your choice,"
        // exactly 1 of Protector/Thaumaturge, real corpus text confirmed permanent (no replacement
        // clause anywhere in the feature's own entries). The GENERIC `choice:class.feature-option`
        // ChoiceSet (packages/eldra-dnd5e-2024/definitions.json) -- reused verbatim by Druid's own
        // Primal Order below, and by any future class/homebrew needing the identical "choose 1 of
        // N named feature options" shape -- resolves this through `effect: 'activate-source'`:
        // selecting an option activates that Source directly, no `writesTo` template needed since
        // each option id IS the Source id. Protector's own grant (martial weapon + heavy armor
        // training) is fully representable and authored on `source:divine-order.protector`.
        // FEAT-OWNED SPELL ACQUISITION PHASE -- Thaumaturge's own extra-cantrip grant is now ALSO
        // fully authored, as a second `pool: 'cantrip'` spellRequirement on this facet (see this
        // facet's own `spellRequirements` array above) gated via `requiresActive:
        // ['source:divine-order.thaumaturge']` -- see this file's own "KNOWN DEFERRED EFFECTS" note
        // at the end of this corpus for the full mechanism citation.
        {
          choiceSet: 'choice:class.feature-option',
          count: 1,
          from: ['source:divine-order.protector', 'source:divine-order.thaumaturge']
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
      // Blessed Strikes (XPHB `classFeature` "Blessed Strikes", level 7): "You gain one of the
      // following options of your choice," exactly 1 of Divine Strike/Potent Spellcasting,
      // permanent (no replacement clause in the real text). The SAME generic ChoiceSet, referenced
      // from a dedicated `progression:class.feature-option.blessed-strikes` row -- named by the
      // feature it represents, never by "cleric", matching this package's own existing
      // `resources-action-surge-indomitable`-style naming convention. Both options' real combat
      // effects (a per-hit damage choice; a cantrip-damage bonus) are Milestone B -- deferred, see
      // this file's own "KNOWN DEFERRED EFFECTS" note.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-channel-divinity-standard', 'progression:class.feature-option.blessed-strikes', 'progression:class.epic-boon'],
      startingEquipment: {
        id: 'choice:equipment.starting.cleric-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Chain Shirt, Shield, Mace, Holy Symbol, Priest's Pack, 7 GP",
            grants: [
              { kind: 'item', slug: 'chain-shirt-xphb' },
              { kind: 'item', slug: 'shield-xphb' },
              { kind: 'item', slug: 'mace-xphb' },
              { kind: 'custom', name: 'Holy Symbol' },
              { kind: 'item', slug: 'priests-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 700 }
            ]
          },
          {
            id: 'B',
            label: "(B) 110 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 11000 }
            ]
          }
        ]
      }
    },
    'druid-xphb': {
      spellRequirements: [
        {
          id: 'spell-requirement.druid-xphb.spell',
          pool: 'spell',
          filter: { classList: ['Druid'] },
          totalByLevel: [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
        },
        {
          id: 'spell-requirement.druid-xphb.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Druid'], level: 0 },
          totalByLevel: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]
        },
        // FEAT-OWNED SPELL ACQUISITION PHASE -- Magician revisit, the exact Druid mirror of
        // Thaumaturge above (class-druid.json classFeature "Magician", level 1): "You know one
        // extra cantrip from the Druid spell list," gated on choosing Magician over Warden in
        // Primal Order's own `choice:class.feature-option` below. Same reasoning, same primitive,
        // same pure-authoring conclusion -- see Thaumaturge's own comment (cleric-xphb facet above)
        // for the full mechanism citation.
        {
          id: 'spell-requirement.druid-xphb.magician-cantrip',
          pool: 'cantrip',
          filter: { classList: ['Druid'], level: 0 },
          totalByLevel: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
          requiresActive: ['source:primal-order.magician'],
          label: 'Magician Cantrip'
        }
      ],
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:armor.shield.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
        { set: 'value:tool.herbalism_kit.proficient', to: true },
        { set: 'value:save.int.proficient', to: true },
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 },
        { set: 'value:spellcasting.ability.wis', to: true },
        { set: 'value:spellcasting.caster_type.full', to: true },
        // LANGUAGE CORPUS + POLICY PHASE -- real corpus wording (class-druid.json's own
        // "Druidic" classFeature, Level 1, source XPHB): "You know Druidic, the secret language
        // of Druids...". Purely fixed -- no "and one other language of your choice" clause
        // anywhere in the text, unlike Rogue's Thieves' Cant. A direct grant only, never a
        // player decision; Druid's own always-prepared Speak with Animals and hidden-message
        // mechanic are a separate, deferred runtime concern (see the audit's own Files note),
        // not authored here.
        { set: 'value:language.druidic.known', to: true }
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
        },
        // D&D 2024 Character Rules -- Primal Order (XPHB `classFeature` "Primal Order", level 1):
        // "You have dedicated yourself to one of the following sacred roles of your choice,"
        // exactly 1 of Magician/Warden, permanent (no replacement clause). The SAME generic
        // `choice:class.feature-option` ChoiceSet Cleric's own Divine Order above reuses verbatim
        // -- see that facet's own comment for the full mechanism explanation. Warden's grant
        // (martial weapon + medium armor training) is fully representable and authored on
        // `source:primal-order.warden`. FEAT-OWNED SPELL ACQUISITION PHASE -- Magician's own
        // extra-cantrip grant is now ALSO fully authored, the exact Druid mirror of Thaumaturge
        // (see this facet's own `spellRequirements` array above; see this file's own "KNOWN
        // DEFERRED EFFECTS" note for the full mechanism citation).
        {
          choiceSet: 'choice:class.feature-option',
          count: 1,
          from: ['source:primal-order.magician', 'source:primal-order.warden']
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above. D&D 2024 Character Rules Phase 2A.2 -- Wild Shape (XPHB
      // `classFeatures` level 2, level-gated, same reasoning as Cleric's
      // Channel Divinity immediately above).
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      // Elemental Fury (XPHB `classFeature` "Elemental Fury", level 7): "You gain one of the
      // following options of your choice," exactly 1 of Potent Spellcasting/Primal Strike,
      // permanent. The SAME generic ChoiceSet, via a dedicated
      // `progression:class.feature-option.elemental-fury` row. Both options' real combat effects
      // (a cantrip-damage bonus; a per-hit damage-type choice made at the moment of the attack,
      // never at acquisition) are Milestone B -- deferred, see this file's own "KNOWN DEFERRED
      // EFFECTS" note.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-wild-shape', 'progression:class.feature-option.elemental-fury', 'progression:class.epic-boon'],
      startingEquipment: {
        id: 'choice:equipment.starting.druid-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Leather Armor, Shield, Sickle, Druidic Focus, Explorer's Pack, Herbalism Kit, 9 GP",
            grants: [
              { kind: 'item', slug: 'leather-armor-xphb' },
              { kind: 'item', slug: 'shield-xphb' },
              { kind: 'item', slug: 'sickle-xphb' },
              { kind: 'custom', name: 'Druidic Focus' },
              { kind: 'item', slug: 'explorers-pack-xphb' },
              { kind: 'item', slug: 'herbalism-kit-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 900 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'fighter-xphb': {
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:armor.medium.proficient', to: true },
        { set: 'value:armor.heavy.proficient', to: true },
        { set: 'value:armor.shield.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
        { set: 'value:weapon.martial.proficient', to: true },
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
        },
        // Weapon Mastery phase -- real corpus wording -- "three kinds of Simple or Martial weapons of
        // your choice" (class-fighter.json's own Weapon Mastery feature, verified this phase) --
        // no melee restriction (unlike Barbarian), so the unrestricted `choice:class.weapon-
        // mastery` ChoiceSet, never the `.melee-only` variant.
        {
          choiceSet: 'choice:class.weapon-mastery',
          count: 3
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- Fighter is a real, verified
      // structural OUTLIER: six ASI/feat opportunities (4/6/8/12/14/16, an
      // extra one at 6 and 14), not the 4/8/12/16 most classes share
      // (class-fighter.json's own `classFeatures` references, verified this
      // phase) -- authored here exactly as measured, never assumed.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      // Weapon Mastery phase -- real corpus: Fighter's own Weapon Mastery column on the Fighter
      // Features table (class-fighter.json's own `classTableGroups`, verified this phase) reads 3
      // at Level 1, 4 at Level 4, 5 at Level 10, 6 at Level 16, unchanged through Level 20 -- its
      // own distinct cadence (no other Weapon Mastery class shares 4/10/16), hence the separate
      // cadence id, named by SHAPE, never by class.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-extended', 'progression:class.resources-action-surge-indomitable', 'progression:class.epic-boon', 'progression:class.weapon-mastery-growth-4-10-16'],
      startingEquipment: {
        id: 'choice:equipment.starting.fighter-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Chain Mail, Greatsword, Flail, 8 Javelins, Dungeoneer's Pack, 4 GP",
            grants: [
              { kind: 'item', slug: 'chain-mail-xphb' },
              { kind: 'item', slug: 'greatsword-xphb' },
              { kind: 'item', slug: 'flail-xphb' },
              { kind: 'item', slug: 'javelin-xphb', quantity: 8 },
              { kind: 'item', slug: 'dungeoneers-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 400 }
            ]
          },
          {
            id: 'B',
            label: "(B) Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Dungeoneer's Pack, 11 GP",
            grants: [
              { kind: 'item', slug: 'studded-leather-armor-xphb' },
              { kind: 'item', slug: 'scimitar-xphb' },
              { kind: 'item', slug: 'shortsword-xphb' },
              { kind: 'item', slug: 'longbow-xphb' },
              { kind: 'item', slug: 'arrows-20-xphb' },
              { kind: 'item', slug: 'quiver-xphb' },
              { kind: 'item', slug: 'dungeoneers-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1100 }
            ]
          },
          {
            id: 'C',
            label: "(C) 155 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 15500 }
            ]
          }
        ]
      }
    },
    'monk-xphb': {
      grants: [
        { set: 'value:weapon.simple.proficient', to: true },
        { set: 'value:weapon.martial_light.proficient', to: true },
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 }
      ],
      choices: [
        {
          choiceSet: 'choice:proficiency.artisan-or-instrument.class',
          count: 1,
          from: [
            'value:tool.alchemists_supplies.proficient',
            'value:tool.brewers_supplies.proficient',
            'value:tool.calligraphers_supplies.proficient',
            'value:tool.carpenters_tools.proficient',
            'value:tool.cartographers_tools.proficient',
            'value:tool.cobblers_tools.proficient',
            'value:tool.cooks_utensils.proficient',
            'value:tool.glassblowers_tools.proficient',
            'value:tool.jewelers_tools.proficient',
            'value:tool.leatherworkers_tools.proficient',
            'value:tool.masons_tools.proficient',
            'value:tool.painters_supplies.proficient',
            'value:tool.potters_tools.proficient',
            'value:tool.smiths_tools.proficient',
            'value:tool.tinkers_tools.proficient',
            'value:tool.weavers_tools.proficient',
            'value:tool.woodcarvers_tools.proficient',
            'value:tool.bagpipes.proficient',
            'value:tool.drum.proficient',
            'value:tool.dulcimer.proficient',
            'value:tool.flute.proficient',
            'value:tool.horn.proficient',
            'value:tool.lute.proficient',
            'value:tool.lyre.proficient',
            'value:tool.pan_flute.proficient',
            'value:tool.shawm.proficient',
            'value:tool.viol.proficient'
          ]
        },
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
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-focus-points', 'progression:class.epic-boon'],
      startingEquipment: {
        id: 'choice:equipment.starting.monk-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Spear, 5 Daggers, Artisan's Tools or Musical Instrument chosen for the tool proficiency above, Explorer's Pack, 11 GP",
            grants: [
              { kind: 'item', slug: 'spear-xphb' },
              { kind: 'item', slug: 'dagger-xphb', quantity: 5 },
              { kind: 'crossReference', choiceSetId: 'choice:proficiency.artisan-or-instrument.class' },
              { kind: 'item', slug: 'explorers-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1100 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'paladin-xphb': {
      spellRequirements: [
        {
          id: 'spell-requirement.paladin-xphb.spell',
          pool: 'spell',
          filter: { classList: ['Paladin'] },
          totalByLevel: [2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15]
        }
      ],
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:armor.medium.proficient', to: true },
        { set: 'value:armor.heavy.proficient', to: true },
        { set: 'value:armor.shield.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
        { set: 'value:weapon.martial.proficient', to: true },
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
        },
        // Weapon Mastery phase -- real corpus wording -- "two kinds of weapons of your choice with
        // which you have proficiency" (class-paladin.json's own Weapon Mastery feature, verified
        // this phase) -- no melee restriction, and no later growth column on the Paladin Features
        // table (verified this phase: fixed at 2 through Level 20).
        {
          choiceSet: 'choice:class.weapon-mastery',
          count: 2
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
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-channel-divinity-extended', 'progression:class.epic-boon', 'progression:class.fighting-style-fs-and-fs-p'],
      startingEquipment: {
        id: 'choice:equipment.starting.paladin-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Chain Mail, Shield, Longsword, 6 Javelins, Holy Symbol, Priest's Pack, 9 GP",
            grants: [
              { kind: 'item', slug: 'chain-mail-xphb' },
              { kind: 'item', slug: 'shield-xphb' },
              { kind: 'item', slug: 'longsword-xphb' },
              { kind: 'item', slug: 'javelin-xphb', quantity: 6 },
              { kind: 'custom', name: 'Holy Symbol' },
              { kind: 'item', slug: 'priests-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 900 }
            ]
          },
          {
            id: 'B',
            label: "(B) 150 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 15000 }
            ]
          }
        ]
      }
    },
    'ranger-xphb': {
      spellRequirements: [
        {
          id: 'spell-requirement.ranger-xphb.spell',
          pool: 'spell',
          filter: { classList: ['Ranger'] },
          totalByLevel: [2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15]
        }
      ],
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:armor.medium.proficient', to: true },
        { set: 'value:armor.shield.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
        { set: 'value:weapon.martial.proficient', to: true },
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
        },
        // Weapon Mastery phase -- real corpus wording -- "two kinds of weapons of your choice with
        // which you have proficiency" (class-ranger.json's own Weapon Mastery feature, verified
        // this phase) -- no melee restriction, and no later growth column on the Ranger Features
        // table (verified this phase: fixed at 2 through Level 20).
        {
          choiceSet: 'choice:class.weapon-mastery',
          count: 2
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
      // ROGUE EXPERTISE PHASE -- Ranger's own Level-2 "Deft Explorer"
      // feature (class-ranger.json's own `classFeature`, source XPHB)
      // nests a SECOND, independent Expertise grant inside its own prose
      // ("Choose one of your skill proficiencies with which you lack
      // Expertise. You gain Expertise in that skill."). Real shape: one
      // skill, genuinely unrestricted, same requiresActive eligibility as
      // the Level-9 row above -- a separate Progression Definition
      // (`progression:class.skill-expertise-deft-explorer`, named for the
      // real feature, never for Ranger) because its level/count differ
      // from every other Expertise row.
      // LANGUAGE CORPUS + POLICY PHASE -- the SAME Deft Explorer feature's
      // own "Languages" half ("You know two languages of your choice from
      // the language tables in chapter 2" -- Standard + Rare, genuinely
      // unrestricted, no fixed component): `progression:class.language-
      // deft-explorer`, a SIBLING Progression Definition at the identical
      // Level 2, proven to coexist with the Expertise row above (same
      // level, two independent decisions, never merged into one).
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-tireless', 'progression:class.skill-expertise-deft-explorer', 'progression:class.language-deft-explorer', 'progression:class.skill-expertise-choose-two-at-9', 'progression:class.epic-boon', 'progression:class.fighting-style-fs-and-fs-r'],
      startingEquipment: {
        id: 'choice:equipment.starting.ranger-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Druidic Focus (sprig of mistletoe), Explorer's Pack, 7 GP",
            grants: [
              { kind: 'item', slug: 'studded-leather-armor-xphb' },
              { kind: 'item', slug: 'scimitar-xphb' },
              { kind: 'item', slug: 'shortsword-xphb' },
              { kind: 'item', slug: 'longbow-xphb' },
              { kind: 'item', slug: 'arrows-20-xphb' },
              { kind: 'item', slug: 'quiver-xphb' },
              { kind: 'item', slug: 'sprig-of-mistletoe-xphb' },
              { kind: 'item', slug: 'explorers-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 700 }
            ]
          },
          {
            id: 'B',
            label: "(B) 150 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 15000 }
            ]
          }
        ]
      }
    },
    'rogue-xphb': {
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
        { set: 'value:weapon.martial_finesse_light.proficient', to: true },
        { set: 'value:tool.thieves_tools.proficient', to: true },
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:save.int.proficient', to: true },
        { set: 'value:hit_points.hit_die_size', to: 8 },
        // LANGUAGE CORPUS + POLICY PHASE -- real corpus wording (class-rogue.json's own
        // "Thieves' Cant" classFeature, Level 1, source XPHB): "You know Thieves' Cant and one
        // other language of your choice...". Thieves' Cant itself is FIXED, automatic, no
        // alternative -- a direct grant, never a player decision. The embedded "one other
        // language" half is authored separately below as a real choice.
        { set: 'value:language.thieves_cant.known', to: true }
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
        },
        // Weapon Mastery phase -- real corpus wording -- "two kinds of weapons of your choice with
        // which you have proficiency" (class-rogue.json's own Weapon Mastery feature, verified
        // this phase) -- no melee restriction, and no later growth column on the Rogue Features
        // table (verified this phase: fixed at 2 through Level 20). Rogue's own restricted
        // martial proficiency (`value:weapon.martial_finesse_light.proficient`, not the full
        // `value:weapon.martial.proficient` every other Weapon Mastery class grants) needs no
        // separate filter variant here: the unrestricted ChoiceSet's own proficiency check
        // (item-mechanics/eligibility.ts) already reads whichever of the item's own
        // `proficiencyGroups` this character's real derived Values satisfy, so a Greatsword
        // (martial, no Finesse/Light) is correctly ineligible and a Rapier (martial, Finesse) is
        // correctly eligible -- generic Value composition, never a Rogue-specific branch.
        {
          choiceSet: 'choice:class.weapon-mastery',
          count: 2
        },
        // ROGUE EXPERTISE PHASE -- real corpus wording (class-rogue.json's own "Expertise"
        // classFeature, Level 1, source XPHB) -- "two of your skill proficiencies of your
        // choice", genuinely unrestricted to any named subset, same shape as the already-
        // implemented Level-6 "two MORE" progression row (`progression:class.skill-expertise-
        // choose-two-at-6`) and Bard/Ranger's own base-class Expertise. Authored here as a
        // creation-time `facet.choices` entry (never a Progression row -- Level 1 has no prior
        // level to diff against), using this phase's own new creation-time `requiresActive`
        // eligibility (app/lib/characters/creation-choice-eligibility.ts) so a skill is offered
        // for Expertise only once it is ALREADY proficient -- composed generically across
        // species/class/background within the SAME creation plan, never a class-name branch.
        {
          choiceSet: 'choice:skill.expertise',
          count: 2,
          from: [
            'value:skill.acrobatics.expertise', 'value:skill.animal_handling.expertise', 'value:skill.arcana.expertise',
            'value:skill.athletics.expertise', 'value:skill.deception.expertise', 'value:skill.history.expertise',
            'value:skill.insight.expertise', 'value:skill.intimidation.expertise', 'value:skill.investigation.expertise',
            'value:skill.medicine.expertise', 'value:skill.nature.expertise', 'value:skill.perception.expertise',
            'value:skill.performance.expertise', 'value:skill.persuasion.expertise', 'value:skill.religion.expertise',
            'value:skill.sleight_of_hand.expertise', 'value:skill.stealth.expertise', 'value:skill.survival.expertise'
          ],
          requiresActive: [
            'value:skill.acrobatics.proficient', 'value:skill.animal_handling.proficient', 'value:skill.arcana.proficient',
            'value:skill.athletics.proficient', 'value:skill.deception.proficient', 'value:skill.history.proficient',
            'value:skill.insight.proficient', 'value:skill.intimidation.proficient', 'value:skill.investigation.proficient',
            'value:skill.medicine.proficient', 'value:skill.nature.proficient', 'value:skill.perception.proficient',
            'value:skill.performance.proficient', 'value:skill.persuasion.proficient', 'value:skill.religion.proficient',
            'value:skill.sleight_of_hand.proficient', 'value:skill.stealth.proficient', 'value:skill.survival.proficient'
          ]
        },
        // LANGUAGE CORPUS + POLICY PHASE -- Thieves' Cant's own embedded "one other language of
        // your choice, which you choose from the language tables in chapter 2" (both Standard
        // AND Rare -- "tables," plural). A genuine creation-time decision, bundled in the SAME
        // real feature as the fixed Thieves' Cant grant above but authored as its own choice
        // (never conflated with the fixed fact it sits beside). `excludeIfAlreadyActive`
        // (choice:language.known's own declaration) already keeps Common, Thieves' Cant, and
        // whatever the universal creation choice picked out of this list generically -- no
        // Rogue-specific duplicate check.
        {
          choiceSet: 'choice:language.known',
          count: 1,
          from: [
            'value:language.common.known', 'value:language.common_sign_language.known', 'value:language.draconic.known',
            'value:language.dwarvish.known', 'value:language.elvish.known', 'value:language.giant.known',
            'value:language.gnomish.known', 'value:language.goblin.known', 'value:language.halfling.known',
            'value:language.orc.known', 'value:language.abyssal.known', 'value:language.celestial.known',
            'value:language.deep_speech.known', 'value:language.druidic.known', 'value:language.infernal.known',
            'value:language.primordial.known', 'value:language.sylvan.known', 'value:language.thieves_cant.known',
            'value:language.undercommon.known'
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
      // choice, same bucket as Origin Feat/Fighting-Style-at-creation, see
      // the Progression Coverage Ledger) and Level 6 ("two MORE... of your
      // choice" -- post-creation, authored here). ROGUE EXPERTISE PHASE --
      // the Level-1 half is now authored above as a facet.choices entry;
      // never merged into this one Progression as if it were a single
      // Level-6 grant of four.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-frequent', 'progression:class.skill-expertise-choose-two-at-6', 'progression:class.epic-boon'],
      startingEquipment: {
        id: 'choice:equipment.starting.rogue-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Leather Armor, 2 Daggers, Shortsword, Shortbow, 20 Arrows, Quiver, Thieves' Tools, Burglar's Pack, 8 GP",
            grants: [
              { kind: 'item', slug: 'leather-armor-xphb' },
              { kind: 'item', slug: 'dagger-xphb', quantity: 2 },
              { kind: 'item', slug: 'shortsword-xphb' },
              { kind: 'item', slug: 'shortbow-xphb' },
              { kind: 'item', slug: 'arrows-20-xphb' },
              { kind: 'item', slug: 'quiver-xphb' },
              { kind: 'item', slug: 'thieves-tools-xphb' },
              { kind: 'item', slug: 'burglars-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 800 }
            ]
          },
          {
            id: 'B',
            label: "(B) 100 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 10000 }
            ]
          }
        ]
      }
    },
    'sorcerer-xphb': {
      spellRequirements: [
        {
          id: 'spell-requirement.sorcerer-xphb.spell',
          pool: 'spell',
          filter: { classList: ['Sorcerer'] },
          totalByLevel: [2,4,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
        },
        {
          id: 'spell-requirement.sorcerer-xphb.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Sorcerer'], level: 0 },
          totalByLevel: [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6]
        }
      ],
      grants: [
        { set: 'value:weapon.simple.proficient', to: true },
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
      // D&D 2024 Character Rules A1 -- Metamagic (XPHB classFeature "Metamagic", level 2: "you
      // gain two Metamagic options"; "Metamagic" at 10/17: "you learn an additional metamagic
      // option" -- re-derived from class-sorcerer.json directly: unlike the 2014/TCE text, XPHB
      // grants the FIRST two options at level 2 (never 3), and two MORE at each of level 10 and
      // 17 (never one). Authored via the SAME `choice:class.accumulating-option` +
      // `excludeIfAlreadyActive` machinery Eldritch Invocations already uses -- no new engine, a
      // new growth-cadence Definition named by shape (`-2-10-17`), never by class. Runtime
      // Metamagic effects (Careful/Distant/Empowered/etc Spell's own mechanical benefit) remain
      // Milestone B -- the 10 `value:metamagic.*.known` Values are deliberately opaque booleans.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.resources-sorcery-points', 'progression:class.epic-boon', 'progression:class.accumulating-option-growth-2-10-17'],
      startingEquipment: {
        id: 'choice:equipment.starting.sorcerer-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Spear, 2 Daggers, Arcane Focus (crystal), Dungeoneer's Pack, 28 GP",
            grants: [
              { kind: 'item', slug: 'spear-xphb' },
              { kind: 'item', slug: 'dagger-xphb', quantity: 2 },
              { kind: 'item', slug: 'crystal-xphb' },
              { kind: 'item', slug: 'dungeoneers-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 2800 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'warlock-xphb': {
      spellRequirements: [
        {
          id: 'spell-requirement.warlock-xphb.spell',
          pool: 'spell',
          filter: { classList: ['Warlock'] },
          totalByLevel: [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15]
        },
        {
          id: 'spell-requirement.warlock-xphb.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Warlock'], level: 0 },
          totalByLevel: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]
        },
        {
          id: 'spell-requirement.warlock-xphb.arcanum.6',
          pool: 'arcanum',
          filter: { classList: ['Warlock'], level: 6 },
          totalByLevel: [0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1]
        },
        {
          id: 'spell-requirement.warlock-xphb.arcanum.7',
          pool: 'arcanum',
          filter: { classList: ['Warlock'], level: 7 },
          totalByLevel: [0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1]
        },
        {
          id: 'spell-requirement.warlock-xphb.arcanum.8',
          pool: 'arcanum',
          filter: { classList: ['Warlock'], level: 8 },
          totalByLevel: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1]
        },
        {
          id: 'spell-requirement.warlock-xphb.arcanum.9',
          pool: 'arcanum',
          filter: { classList: ['Warlock'], level: 9 },
          totalByLevel: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1]
        }
      ],
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:weapon.simple.proficient', to: true },
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
        },
        // ELDRITCH INVOCATIONS PHASE -- real XPHB "Eldritch Invocation Options"
        // (optionalfeatures.json, featureType 'EI', source XPHB): Level 1 grants
        // exactly one invocation, legal from the 5 real options with no
        // prerequisite at all (the other 23 all carry a Warlock-level gate).
        // Modeled through the same domain-agnostic choice:class.accumulating-option
        // ChoiceSet the Level 2+ growth rows use (see
        // progression:class.accumulating-option-growth-2-5-7-9-12-15-18 below) --
        // never a bespoke "invocation" choice shape, so a homebrew class can reuse
        // the identical mechanism for its own accumulating option family.
        {
          choiceSet: 'choice:class.accumulating-option',
          count: 1,
          from: [
            'value:invocation.armor_of_shadows.known',
            'value:invocation.eldritch_mind.known',
            'value:invocation.pact_of_the_blade.known',
            'value:invocation.pact_of_the_chain.known',
            'value:invocation.pact_of_the_tome.known'
          ]
        }
      ],
      // D&D 2024 Character Rules Phase 2A.1 -- see barbarian's own identical
      // note above.
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see barbarian's own note above for the full corpus evidence (all 12 classes select subclass at Level 3).
      // ELDRITCH INVOCATIONS PHASE -- the real XPHB Invocations-known-by-level
      // table (class-warlock.json classTableGroups) is [1,3,3,3,5,5,6,6,7,7,7,
      // 8,8,8,9,9,9,10,10,10] for levels 1-20: growth at L2/L5/L7/L9/L12/L15/L18
      // (L1's own single invocation is the facet choice above, not a row here).
      // Replacement/retraining ("Replacing and Gaining Invocations") is real but
      // explicitly optional corpus text ("you CAN replace") -- intentionally not
      // modeled; a stale/removed selection is never implied by this progression.
      // 4 of the real 28 options are excluded from the authored pool, honestly,
      // not silently: Agonizing Blast, Eldritch Spear, and Repelling Blast are
      // each independently repeatable AND require "a Warlock cantrip that deals
      // damage" -- no generic spell-filter prerequisite primitive exists yet
      // (app/lib/feat-mechanics/dnd5e.ts's own SUPPORTED_PREREQUISITE_KEYS has no
      // 'spell' key); Lessons of the First Ones is repeatable with its own nested
      // Origin-feat sub-choice. All four are structurally repeatable-with-a-
      // nested-choice, a materially different shape from the other 24 (pick-once,
      // flat), so none is authored here. The remaining 24 have ample headroom at
      // every real acquisition point (10 legal at L2's own target of 3, up to 24
      // legal by L15/L18 against a final target of 10), so this exclusion never
      // blocks reaching the real L20 total.
      progression: ['progression:class.subclass-selection', 'progression:class.asi-standard', 'progression:class.epic-boon', 'progression:class.accumulating-option-growth-2-5-7-9-12-15-18'],
      startingEquipment: {
        id: 'choice:equipment.starting.warlock-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Leather Armor, Sickle, 2 Daggers, Arcane Focus (orb), Book (occult lore), Scholar's Pack, 15 GP",
            grants: [
              { kind: 'item', slug: 'leather-armor-xphb' },
              { kind: 'item', slug: 'sickle-xphb' },
              { kind: 'item', slug: 'dagger-xphb', quantity: 2 },
              { kind: 'item', slug: 'orb-xphb' },
              { kind: 'item', slug: 'book-xphb' },
              { kind: 'item', slug: 'scholars-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1500 }
            ]
          },
          {
            id: 'B',
            label: "(B) 100 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 10000 }
            ]
          }
        ]
      }
    },
    'wizard-xphb': {
      spellRequirements: [
        {
          id: 'spell-requirement.wizard-xphb.spellbook',
          pool: 'spellbook',
          filter: { classList: ['Wizard'] },
          totalByLevel: [6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44]
        },
        {
          id: 'spell-requirement.wizard-xphb.spell',
          pool: 'spell',
          filter: { classList: ['Wizard'] },
          totalByLevel: [4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25],
          requiresMembershipPool: 'spell-requirement.wizard-xphb.spellbook'
        },
        {
          id: 'spell-requirement.wizard-xphb.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Wizard'], level: 0 },
          totalByLevel: [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5]
        }
      ],
      grants: [
        { set: 'value:weapon.simple.proficient', to: true },
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
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.wizard-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) 2 Daggers, Arcane Focus (Quarterstaff), Robe, Spellbook, Scholar's Pack, 5 GP",
            grants: [
              { kind: 'item', slug: 'dagger-xphb', quantity: 2 },
              { kind: 'item', slug: 'quarterstaff-xphb' },
              { kind: 'item', slug: 'robe-xphb' },
              { kind: 'custom', name: 'Spellbook' },
              { kind: 'item', slug: 'scholars-pack-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 500 }
            ]
          },
          {
            id: 'B',
            label: "(B) 55 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5500 }
            ]
          }
        ]
      }
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
  // D&D 2024 Character Rules A2 WORKSTREAM 1 -- CORRECTION OF A STALE CLAIM.
  // The paragraph this replaces (Phase 2A.2, SUBCLASS AUDIT follow-up) asserted that
  // `ProgressionRow.resources` was "class-scoped" and that no mechanism existed for a
  // subclass's OWN feature to arrive at a level LATER than the subclass's own
  // selection level -- and on that basis left War Priest (Cleric, War Domain),
  // Warding Flare (Cleric, Light Domain), and Dark One's Own Luck (Warlock, Fiend
  // Patron) deliberately unwired, naming a "missing primitive."
  //
  // That claim is WRONG, disproven by direct test (tests/server/utils/character-
  // actor-bridge.test.ts, "A2 Workstream 1 -- a subclass selected at Level 3
  // independently activates its own later-level features"): `consumeFacet`
  // (character-actor-bridge.ts) consumes EVERY SLOT_ORDER slot -- species, class,
  // subclass, background -- through the IDENTICAL generic loop, including
  // `facet.progression` -> ProgressionRow.sets/.grants/.resources/.choices, gated by
  // `rowAt <= currentLevel` against the character's own CURRENT LEVEL, never against
  // "levels since this facet was consumed." Nothing in that loop singles out
  // `subclass` for different (or missing) treatment; a class's own facet already
  // relies on the exact same mechanism for later-level growth (Weapon Mastery
  // growth, Metamagic growth, Skill Expertise growth, Primal Knowledge). The
  // confusion: Battle Master's own `resources: ['resource:superiority_dice']` below
  // is a flat, unconditional `facet.resources` grant (correct ONLY because Fighter
  // selects its subclass AND Combat Superiority both land at Level 3) -- it was
  // mistaken for the ONLY shape a subclass facet can use, when `facet.progression`
  // (gated, later-level) was available the whole time, unchanged, no new engine code.
  //
  // PROVEN AUTHORING PATTERN for a subclass-internal feature arriving after subclass
  // selection: give the subclass's own RulesFacet a `progression: ['progression:
  // subclass.<name>-growth']` array, exactly mirroring a class's own growth-cadence
  // Progression Definition (e.g. `progression:class.weapon-mastery-growth-4-10`) --
  // same Definition kind, same `keyedBy: 'value:level'`, same row shape (`at`, plus
  // `sets`/`grants`/`resources`/`choices`), just referenced from a `subclass` facet.
  // War Priest/Warding Flare/Dark One's Own Luck are real, structurally clean
  // finite-pool resources (all three corpus-verified, all three the same
  // `max(1, ability modifier)` shape Bardic Inspiration/Tireless already prove) that
  // this exact pattern can now unblock -- left unauthored here deliberately (A2's own
  // scope is proving/wiring the GENERIC infrastructure, not authoring the subclass
  // corpus), but no longer blocked on any missing primitive. Their own three Resource
  // Definitions remain unauthored in definitions.json for the same "an unreferenced
  // Definition risks being mistaken for done" reason as before.
    // ---------------------------------------------------------------------
    // A3 -- SUBCLASS SPELL AUTHORING. Re-derived directly from the real XPHB corpus
    // (class-<name>.json's own `subclass[].additionalSpells`), via A2's already-proven,
    // zero-new-code generic machinery (subclassFacet/subclassPackageId ownership,
    // gatherSpellRequirements/resolveFixedSpellGrants treating `subclass` as an ordinary
    // owner alongside class/species/background). Every entry below is a FixedSpellGrant
    // (no "of your choice" clause in the real text -- a domain/patron/circle's own always-
    // prepared or permanently-known spells, growing by `minLevel`, omitted at Level 3 since
    // no subclass facet is ever active before its own subclass-selection level) or a
    // SpellRequirement (a real "of your choice" pick, reusing the IDENTICAL pool-kind/
    // level-gating machinery a class's own normal spellcasting already uses -- see each
    // group's own header below for why no new engine primitive was needed).
    //
    // DELIBERATELY NOT AUTHORED HERE, WITH THE EXACT REASON (never silently dropped):
    //   - Archfey Patron's Charisma-per-day Misty Step, Psi Warrior's 1/Long-Rest
    //     Telekinesis, Warrior of Shadow's Focus-Point Darkness: each is a spell usable
    //     ONLY via a specific finite resource/charge pool, never via the character's normal
    //     spell slots. `FixedSpellGrant` has exactly two flags ('known'/'prepared'), both of
    //     which mean "usable like any other known/prepared spell through normal casting" --
    //     neither honestly represents "usable only by spending this one resource." Modeling
    //     either as a plain FixedSpellGrant would misrepresent the real rule (letting the
    //     spell be freely prepared/cast via a normal slot, which the real text does not
    //     allow). No generic "spell gated behind a specific resource pool" primitive exists
    //     today -- a genuine gap, reported in this phase's own final report, not fabricated.
    //   - Eldritch Knight / Arcane Trickster's own LEVELED "expanded" Wizard spell pool
    //     (preparedSpellsProgression -- 3rd-level spells and up): see the THIRD-CASTER
    //     header below. Their CANTRIP pool is authored; their leveled pool is a reported
    //     STOP, not an omission.
    //   - Battle Master's Combat Superiority maneuvers, every subclass's own non-spell
    //     feature-option/proficiency/damage-type/feat-choice decision (Aspect of the Wilds,
    //     Champion's Additional Fighting Style, ...): out of A3's spell-only scope, per the
    //     task brief itself; still their own separate, pre-existing blocked ledger rows.
    //   - College of Glamour's own Level-6 "innate" Command: the SAME spell the Level-6
    //     "prepared" grant already names -- the "innate" tag only means it can ALSO be cast
    //     without expending a slot (a casting-mechanic variant of the identical acquisition
    //     fact, not a second one). Authoring a second FixedSpellGrant for the same slug would
    //     violate StoredSpellEntry's own "never two physical rows for the same spell
    //     identity" invariant (app/lib/characters/spellcasting.ts) -- the single `prepared`
    //     entry below is the honest, complete acquisition fact; the free-cast mechanic is
    //     the same deferred runtime-effect category every other subclass feature's own
    //     combat/utility text already sits in (Weapon Mastery property, Fighting Style
    //     effect, ...).
    subclass: {
      // A4 -- BATTLE MASTER MANEUVERS. Combat Superiority ("you learn three
      // maneuvers of your choice..."): all 20 real XPHB maneuvers carry no
      // prerequisite (optionalfeatures.json, featureType MV:B, source XPHB --
      // re-verified directly), so every one is representable via the SAME
      // domain-agnostic `choice:class.accumulating-option` shape Warlock
      // Invocations/Sorcerer Metamagic already use, reused here under a
      // second, owner-agnostic Definition (`choice:subclass.accumulating
      // -option`) so a subclass can be the owner -- never a class/feature
      // name check in engine code. The real growth ("two additional
      // maneuvers... at 7th, 10th, and 15th level") sits in the SAME feature
      // text as the base pick; `mandatory-decisions.ts`'s own regex only
      // captures the FIRST "learn N ... of your choice" match per feature
      // (a known, pre-existing discovery/model limitation, same shape as
      // Ritual Caster's own miscounted levels -- not fixed here, per that
      // same established precedent), so only ONE decision
      // (cardinality 3, Level 3) is ever discovered for this subclass. The
      // full real growth (3/5/7/9 total) is still authored below for
      // correctness; the coverage rule verifies the real authored facet
      // shape directly, never the discovery count alone. Superiority Dice
      // (the resource GATING maneuver use, not the acquisition) stays
      // exactly as already authored -- never conflated with this decision.
      'battle-master-xphb': {
        resources: ['resource:superiority_dice'],
        choices: [
          {
            choiceSet: 'choice:subclass.accumulating-option',
            count: 3,
            from: [
              'value:maneuver.ambush.known', 'value:maneuver.bait_and_switch.known', 'value:maneuver.commanders_strike.known',
              'value:maneuver.commanding_presence.known', 'value:maneuver.disarming_attack.known', 'value:maneuver.distracting_strike.known',
              'value:maneuver.evasive_footwork.known', 'value:maneuver.feinting_attack.known', 'value:maneuver.goading_attack.known',
              'value:maneuver.lunging_attack.known', 'value:maneuver.maneuvering_attack.known', 'value:maneuver.menacing_attack.known',
              'value:maneuver.parry.known', 'value:maneuver.precision_attack.known', 'value:maneuver.pushing_attack.known',
              'value:maneuver.rally.known', 'value:maneuver.riposte.known', 'value:maneuver.sweeping_attack.known',
              'value:maneuver.tactical_assessment.known', 'value:maneuver.trip_attack.known'
            ]
          }
        ],
        progression: ['progression:subclass.accumulating-option-growth-7-10-15']
      },
      // A4 -- CHAMPION (Fighter). Additional Fighting Style (Level 7): "You gain another
      // Fighting Style feat of your choice" -- the EXACT SAME content-catalogue-backed
      // `choice:feat.fighting-style.fs-only` pick the Fighter class itself already grants at
      // Level 1, re-offered as its own dedicated Level-7 Progression row. No new primitive:
      // the real XPHB Fighting Style feats (Archery, Defense, ...) are each `repeatable:
      // false` in the catalogue, so `findIllegalRepeatAcquisition` (already run generically
      // against every feat acquisition, server/utils/character-progression-plan.ts) already
      // rejects re-picking the IDENTICAL style twice; picking two DIFFERENT styles (Level 1
      // and Level 7) is two distinct feat refs, never flagged.
      'champion-xphb': { // Champion (Fighter)
        progression: ['progression:subclass.fighting-style-additional']
      },

      // -- FIXED SPELL GRANTS (prepared/known, no player choice at all) -----------------
      // One `minLevel`-windowed FixedSpellGrant per spell; `resolveFixedSpellGrants`'s own
      // existing windowing (app/lib/characters/spell-requirement-ownership.ts) already
      // de-duplicates a level-by-level progression walk, and `confirmProgression`
      // (server/utils/character-progression-plan.ts) already passes `subclass` through
      // the identical owners array as class/species/background -- zero new code below this
      // header, every subclass is a pure data entry.
      // A4 -- PATH OF THE WILD HEART. Aspect of the Wilds (Level 6): "You gain
      // one of the following options of your choice [Owl/Panther/Salmon].
      // Whenever you finish a Long Rest, you can change your choice" -- a
      // genuine, PERSISTENT build decision (the optional "change on Long
      // Rest" clause is `opt:replacement`, discovered and never blocking),
      // the SAME "choose 1 of N named options" shape Circle of the Land's
      // own terrain pick already uses, via the identical, owner-agnostic
      // `choice:subclass.feature-option` Definition. Rage of the Wilds
      // (Level 3) is DELIBERATELY NOT authored here: its own real text reads
      // "Whenever you ACTIVATE your Rage, you gain one of the following
      // options" (re-verified directly) -- re-chosen on every Rage
      // activation, not a persistent character-build fact at all, unlike
      // Aspect of the Wilds's own explicit "you gain X [once]; whenever you
      // finish a Long Rest, you CAN CHANGE" phrasing. `mandatory-decisions
      // .ts`'s own per-use-trigger filter only inspects a feature's FIRST
      // sentence, so this recurring-per-use clause (its own second sentence)
      // was never excluded at discovery time -- a genuine discovery
      // classification defect, corrected in mandatory-decision-coverage.ts
      // (see its own `fp:rage-of-the-wilds` rule), never fabricated as a
      // one-time pick it is not.
      'path-of-the-wild-heart-xphb': { // Path of the Wild Heart (Barbarian)
        fixedSpellGrants: [
          { slug: 'beast-sense-xphb', flag: 'known', minLevel: 3 },
          { slug: 'speak-with-animals-xphb', flag: 'known', minLevel: 3 },
          { slug: 'commune-with-nature-xphb', flag: 'known', minLevel: 10 }
        ],
        progression: ['progression:subclass.feature-option.aspect-of-the-wilds']
      },
      'college-of-glamour-xphb': { // College of Glamour (Bard)
        fixedSpellGrants: [
          { slug: 'charm-person-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'mirror-image-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'command-xphb', flag: 'prepared', minLevel: 6 }
        ]
      },
      'life-domain-xphb': { // Life Domain (Cleric)
        fixedSpellGrants: [
          { slug: 'aid-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'bless-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'cure-wounds-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'lesser-restoration-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'mass-healing-word-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'revivify-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'aura-of-life-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'death-ward-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'greater-restoration-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'mass-cure-wounds-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'light-domain-xphb': { // Light Domain (Cleric)
        fixedSpellGrants: [
          { slug: 'burning-hands-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'faerie-fire-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'scorching-ray-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'see-invisibility-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'daylight-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'fireball-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'arcane-eye-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'wall-of-fire-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'flame-strike-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'scrying-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'trickery-domain-xphb': { // Trickery Domain (Cleric)
        fixedSpellGrants: [
          { slug: 'charm-person-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'disguise-self-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'invisibility-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'pass-without-trace-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'hypnotic-pattern-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'nondetection-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'confusion-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'dimension-door-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'dominate-person-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'modify-memory-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'war-domain-xphb': { // War Domain (Cleric)
        fixedSpellGrants: [
          { slug: 'guiding-bolt-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'magic-weapon-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'shield-of-faith-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'spiritual-weapon-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'crusaders-mantle-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'spirit-guardians-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'fire-shield-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'freedom-of-movement-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'hold-monster-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'steel-wind-strike-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'circle-of-the-moon-xphb': { // Circle of the Moon (Druid)
        fixedSpellGrants: [
          { slug: 'cure-wounds-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'moonbeam-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'starry-wisp-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'conjure-animals-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'fount-of-moonlight-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'mass-cure-wounds-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'circle-of-the-sea-xphb': { // Circle of the Sea (Druid)
        fixedSpellGrants: [
          { slug: 'fog-cloud-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'gust-of-wind-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'ray-of-frost-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'shatter-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'thunderwave-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'lightning-bolt-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'water-breathing-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'control-water-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'ice-storm-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'conjure-elemental-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'hold-monster-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'circle-of-the-stars-xphb': { // Circle of the Stars (Druid)
        fixedSpellGrants: [
          { slug: 'guidance-xphb', flag: 'known', minLevel: 3 },
          { slug: 'guiding-bolt-xphb', flag: 'prepared', minLevel: 3 }
        ]
      },
      'warrior-of-shadow-xphb': { // Warrior of Shadow (Monk)
        fixedSpellGrants: [
          { slug: 'minor-illusion-xphb', flag: 'known', minLevel: 3 }
        ]
      },
      'warrior-of-the-elements-xphb': { // Warrior of the Elements (Monk)
        fixedSpellGrants: [
          { slug: 'elementalism-xphb', flag: 'known', minLevel: 3 }
        ]
      },
      'oath-of-devotion-xphb': { // Oath of Devotion (Paladin)
        fixedSpellGrants: [
          { slug: 'protection-from-evil-and-good-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'shield-of-faith-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'aid-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'zone-of-truth-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'beacon-of-hope-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'dispel-magic-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'freedom-of-movement-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'guardian-of-faith-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'commune-xphb', flag: 'prepared', minLevel: 17 },
          { slug: 'flame-strike-xphb', flag: 'prepared', minLevel: 17 }
        ]
      },
      'oath-of-glory-xphb': { // Oath of Glory (Paladin)
        fixedSpellGrants: [
          { slug: 'guiding-bolt-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'heroism-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'enhance-ability-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'magic-weapon-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'haste-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'protection-from-energy-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'compulsion-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'freedom-of-movement-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'legend-lore-xphb', flag: 'prepared', minLevel: 17 },
          { slug: 'yolandes-regal-presence-xphb', flag: 'prepared', minLevel: 17 }
        ]
      },
      'oath-of-the-ancients-xphb': { // Oath of the Ancients (Paladin)
        fixedSpellGrants: [
          { slug: 'ensnaring-strike-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'speak-with-animals-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'misty-step-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'moonbeam-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'plant-growth-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'protection-from-energy-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'ice-storm-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'stoneskin-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'commune-with-nature-xphb', flag: 'prepared', minLevel: 17 },
          { slug: 'tree-stride-xphb', flag: 'prepared', minLevel: 17 }
        ]
      },
      'oath-of-vengeance-xphb': { // Oath of Vengeance (Paladin)
        fixedSpellGrants: [
          { slug: 'bane-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'hunters-mark-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'hold-person-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'misty-step-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'haste-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'protection-from-energy-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'banishment-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'dimension-door-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'hold-monster-xphb', flag: 'prepared', minLevel: 17 },
          { slug: 'scrying-xphb', flag: 'prepared', minLevel: 17 }
        ]
      },
      'fey-wanderer-xphb': { // Fey Wanderer (Ranger)
        fixedSpellGrants: [
          { slug: 'charm-person-xphb', flag: 'known', minLevel: 3 },
          { slug: 'misty-step-xphb', flag: 'known', minLevel: 5 },
          { slug: 'summon-fey-xphb', flag: 'known', minLevel: 9 },
          { slug: 'dimension-door-xphb', flag: 'known', minLevel: 13 },
          { slug: 'mislead-xphb', flag: 'known', minLevel: 17 }
        ]
      },
      'gloom-stalker-xphb': { // Gloom Stalker (Ranger)
        fixedSpellGrants: [
          { slug: 'disguise-self-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'rope-trick-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'fear-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'greater-invisibility-xphb', flag: 'prepared', minLevel: 13 },
          { slug: 'seeming-xphb', flag: 'prepared', minLevel: 17 }
        ]
        // Gloom Stalker's own Level 7 "Iron Mind" (fixed Wisdom save proficiency, UNLESS
        // already proficient, in which case a free Intelligence-or-Charisma choice instead)
        // is a reported STOP, not an omission -- see this phase's own final report. No
        // existing primitive represents a grant that is FIXED in one branch and a CHOICE in
        // another, conditioned on the character's own prior state (`excludeIfAlreadyActive`
        // only ever narrows an existing choice pool, never switches a fixed grant into one).
      },
      // A4 -- HUNTER (Ranger). Hunter's Prey (Level 3, the SAME level this class selects its
      // subclass): "You gain one of the following feature options of your choice [Colossus
      // Slayer/Horde Breaker]. Whenever you finish a Short or Long Rest, you can replace the
      // chosen option" -- the SAME "choose 1 of N named options" shape Circle of the Land's
      // own terrain pick already uses (the optional replacement clause is its own separate,
      // never-blocking `opt:replacement` decision). Defensive Tactics (Level 7, later than
      // subclass selection) is the identical shape, authored as its own dedicated Progression
      // row -- mirrors Blessed Strikes'/Elemental Fury's own Level-1-vs-Level-7 split for
      // class-owned feature options.
      'hunter-xphb': { // Hunter (Ranger)
        choices: [
          {
            choiceSet: 'choice:subclass.feature-option',
            count: 1,
            from: ['source:hunters-prey.colossus-slayer', 'source:hunters-prey.horde-breaker']
          }
        ],
        progression: ['progression:subclass.feature-option.defensive-tactics']
      },
      'aberrant-sorcery-xphb': { // Aberrant Sorcery (Sorcerer)
        fixedSpellGrants: [
          { slug: 'arms-of-hadar-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'calm-emotions-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'detect-thoughts-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'dissonant-whispers-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'mind-sliver-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'hunger-of-hadar-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'sending-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'evards-black-tentacles-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'summon-aberration-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'rarys-telepathic-bond-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'telekinesis-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'clockwork-sorcery-xphb': { // Clockwork Sorcery (Sorcerer)
        fixedSpellGrants: [
          { slug: 'aid-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'alarm-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'lesser-restoration-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'protection-from-evil-and-good-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'dispel-magic-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'protection-from-energy-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'freedom-of-movement-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'summon-construct-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'greater-restoration-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'wall-of-force-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      // A4 -- DRACONIC SORCERY ELEMENTAL AFFINITY (Level 6). "Your draconic
      // magic has an affinity with a damage type... Choose one of those
      // types: Acid, Cold, Fire, Lightning, or Poison" -- re-verified
      // directly against the real XPHB corpus: there is no separate
      // "Draconic Ancestry" lineage pick for this subclass (unlike the 2014
      // rules), so this is a genuinely FREE, standalone 5-option choice,
      // the EXACT shape Elemental Adept's own feat-owned damage-type choice
      // already uses (opaque `value:*.damage-type.<type>.active` booleans,
      // Milestone B for the Resistance/Charisma-damage runtime effect) --
      // reused here under its own Definition (never a class/subclass name
      // check in engine code) since it is picked once, with no repeat
      // -acquisition differentiator needed.
      'draconic-sorcery-xphb': { // Draconic Sorcery (Sorcerer)
        fixedSpellGrants: [
          { slug: 'alter-self-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'chromatic-orb-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'command-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'dragons-breath-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'fear-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'fly-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'arcane-eye-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'charm-monster-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'legend-lore-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'summon-dragon-xphb', flag: 'prepared', minLevel: 9 }
        ],
        progression: ['progression:subclass.elemental-affinity']
      },
      'archfey-patron-xphb': { // Archfey Patron (Warlock)
        fixedSpellGrants: [
          { slug: 'calm-emotions-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'faerie-fire-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'misty-step-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'phantasmal-force-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'sleep-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'blink-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'plant-growth-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'dominate-beast-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'greater-invisibility-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'dominate-person-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'seeming-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'celestial-patron-xphb': { // Celestial Patron (Warlock)
        fixedSpellGrants: [
          { slug: 'sacred-flame-xphb', flag: 'known', minLevel: 1 },
          { slug: 'light-xphb', flag: 'known', minLevel: 1 },
          { slug: 'aid-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'cure-wounds-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'guiding-bolt-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'lesser-restoration-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'daylight-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'revivify-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'guardian-of-faith-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'wall-of-fire-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'greater-restoration-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'summon-celestial-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'fiend-patron-xphb': { // Fiend Patron (Warlock)
        fixedSpellGrants: [
          { slug: 'burning-hands-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'command-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'scorching-ray-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'suggestion-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'fireball-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'stinking-cloud-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'fire-shield-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'wall-of-fire-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'geas-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'insect-plague-xphb', flag: 'prepared', minLevel: 9 }
        ]
      },
      'great-old-one-patron-xphb': { // Great Old One Patron (Warlock)
        fixedSpellGrants: [
          { slug: 'detect-thoughts-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'dissonant-whispers-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'phantasmal-force-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'tashas-hideous-laughter-xphb', flag: 'prepared', minLevel: 3 },
          { slug: 'clairvoyance-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'hunger-of-hadar-xphb', flag: 'prepared', minLevel: 5 },
          { slug: 'confusion-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'summon-aberration-xphb', flag: 'prepared', minLevel: 7 },
          { slug: 'modify-memory-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'telekinesis-xphb', flag: 'prepared', minLevel: 9 },
          { slug: 'hex-xphb', flag: 'known', minLevel: 10 }
        ]
      },
      // (Abjurer/Diviner/Illusionist's own fixedSpellGrants are merged into the WIZARD ARCANE
      // TRADITIONS entries below, alongside their spellRequirements -- one block per subclass.)

      // -- CIRCLE OF THE LAND (variant-choice: which terrain's spell list applies) --------
      // "Choose a type of terrain... you can change your terrain whenever you finish a Long
      // Rest in that terrain." The terrain pick itself is the SAME `choice:species.feature
      // -option` shape (Elven/Gnomish Lineage, Fiendish Legacy) under a new, owner-agnostic
      // `choice:subclass.feature-option` Definition (packages/eldra-dnd5e-2024/
      // definitions.json) -- never a class/subclass name check. Each terrain's own fixed
      // spell list gates on its own Source via the IDENTICAL `requiresActive` evaluator
      // every lineage/legacy grant above already uses. The Long-Rest re-pick clause is the
      // SAME optional `replacement` family every other subclass's own re-answer clause
      // already sits in (`opt:replacement`) -- never implemented, never blocking.
      'circle-of-the-land-xphb': {
        choices: [
          {
            choiceSet: 'choice:subclass.feature-option',
            count: 1,
            from: ['source:land-circle.arid', 'source:land-circle.polar', 'source:land-circle.temperate', 'source:land-circle.tropical']
          }
        ],
        fixedSpellGrants: [
          { slug: 'blur-xphb', flag: 'prepared', requiresActive: ['source:land-circle.arid'] },
          { slug: 'burning-hands-xphb', flag: 'prepared', requiresActive: ['source:land-circle.arid'] },
          { slug: 'fire-bolt-xphb', flag: 'prepared', requiresActive: ['source:land-circle.arid'] },
          { slug: 'fireball-xphb', flag: 'prepared', requiresActive: ['source:land-circle.arid'], minLevel: 5 },
          { slug: 'blight-xphb', flag: 'prepared', requiresActive: ['source:land-circle.arid'], minLevel: 7 },
          { slug: 'wall-of-stone-xphb', flag: 'prepared', requiresActive: ['source:land-circle.arid'], minLevel: 9 },

          { slug: 'fog-cloud-xphb', flag: 'prepared', requiresActive: ['source:land-circle.polar'] },
          { slug: 'hold-person-xphb', flag: 'prepared', requiresActive: ['source:land-circle.polar'] },
          { slug: 'ray-of-frost-xphb', flag: 'prepared', requiresActive: ['source:land-circle.polar'] },
          { slug: 'sleet-storm-xphb', flag: 'prepared', requiresActive: ['source:land-circle.polar'], minLevel: 5 },
          { slug: 'ice-storm-xphb', flag: 'prepared', requiresActive: ['source:land-circle.polar'], minLevel: 7 },
          { slug: 'cone-of-cold-xphb', flag: 'prepared', requiresActive: ['source:land-circle.polar'], minLevel: 9 },

          { slug: 'misty-step-xphb', flag: 'prepared', requiresActive: ['source:land-circle.temperate'] },
          { slug: 'shocking-grasp-xphb', flag: 'prepared', requiresActive: ['source:land-circle.temperate'] },
          { slug: 'sleep-xphb', flag: 'prepared', requiresActive: ['source:land-circle.temperate'] },
          { slug: 'lightning-bolt-xphb', flag: 'prepared', requiresActive: ['source:land-circle.temperate'], minLevel: 5 },
          { slug: 'freedom-of-movement-xphb', flag: 'prepared', requiresActive: ['source:land-circle.temperate'], minLevel: 7 },
          { slug: 'tree-stride-xphb', flag: 'prepared', requiresActive: ['source:land-circle.temperate'], minLevel: 9 },

          { slug: 'acid-splash-xphb', flag: 'prepared', requiresActive: ['source:land-circle.tropical'] },
          { slug: 'ray-of-sickness-xphb', flag: 'prepared', requiresActive: ['source:land-circle.tropical'] },
          { slug: 'web-xphb', flag: 'prepared', requiresActive: ['source:land-circle.tropical'] },
          { slug: 'stinking-cloud-xphb', flag: 'prepared', requiresActive: ['source:land-circle.tropical'], minLevel: 5 },
          { slug: 'polymorph-xphb', flag: 'prepared', requiresActive: ['source:land-circle.tropical'], minLevel: 7 },
          { slug: 'insect-plague-xphb', flag: 'prepared', requiresActive: ['source:land-circle.tropical'], minLevel: 9 }
        ]
      },

      // -- WIZARD ARCANE TRADITIONS (spell SELECTION, school-restricted, growing) --------
      // "Whenever you gain a level in this class, you can replace one of these spells..." --
      // the replacement clause is `opt:replacement`, never implemented. The pick itself:
      // "learn N Wizard spells of 2nd level or lower from the school of <X>... they don't
      // count against the number of spells you know" (Abjurer/Diviner/Evoker: exactly this
      // shape; Illusionist adds its own separate, already-authored Minor Illusion/Summon
      // Beast-Fey fixed grants above). The level CAP ("2nd level or lower," widening every
      // two class levels) is NEVER encoded as `filter.level` here -- `SpellCatalogueFilter
      // .level` is exact-only (app/lib/rules/types.ts's own header), but `pool: 'spellbook'`
      // is ALREADY dynamically level-gated against the character's own derived castable
      // level (`isLevelGated`, app/lib/characters/spell-requirements.ts) -- and a WIZARD's
      // own normal spell-slot progression happens to reach exactly 2nd/3rd/4th/.../9th level
      // at character levels 3/5/7/.../17 (confirmed directly against the real XPHB Wizard
      // slot table), i.e. IDENTICAL to each tradition's own corpus-stated level cap at each
      // of those same levels. The existing primitive already expresses the real rule
      // exactly, with zero new filter shape. `pool: 'spellbook'` also gives `flag: 'known'`
      // (`flagFor`) -- matching the corpus's own "known" key (never "prepared") -- and does
      // NOT interact with the real Wizard class spellbook requirement on the SAME character
      // (`requiresMembershipPool` is opt-in per requirement; nothing here sets it, so these
      // rows never gate or get gated by the class's own spellbook pool).
      'abjurer-xphb': {
        fixedSpellGrants: [
          { slug: 'counterspell-xphb', flag: 'prepared', minLevel: 10 },
          { slug: 'dispel-magic-xphb', flag: 'prepared', minLevel: 10 }
        ],
        spellRequirements: [
          {
            id: 'spell-requirement.abjurer-xphb.tradition-spells',
            pool: 'spellbook',
            filter: { classList: ['Wizard'], school: ['Abjuration'] },
            totalByLevel: [0, 0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9],
            label: 'Abjurer Spells'
          }
        ]
      },
      'diviner-xphb': {
        fixedSpellGrants: [
          { slug: 'see-invisibility-xphb', flag: 'known', minLevel: 10 }
        ],
        spellRequirements: [
          {
            id: 'spell-requirement.diviner-xphb.tradition-spells',
            pool: 'spellbook',
            filter: { classList: ['Wizard'], school: ['Divination'] },
            totalByLevel: [0, 0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9],
            label: 'Diviner Spells'
          }
        ]
      },
      'evoker-xphb': {
        spellRequirements: [
          {
            id: 'spell-requirement.evoker-xphb.tradition-spells',
            pool: 'spellbook',
            filter: { classList: ['Wizard'], school: ['Evocation'] },
            totalByLevel: [0, 0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9],
            label: 'Evoker Spells'
          }
        ]
      },
      'illusionist-xphb': {
        fixedSpellGrants: [
          { slug: 'minor-illusion-xphb', flag: 'known', minLevel: 3 },
          { slug: 'summon-beast-xphb', flag: 'prepared', minLevel: 6 },
          { slug: 'summon-fey-xphb', flag: 'prepared', minLevel: 6 }
        ],
        spellRequirements: [
          {
            id: 'spell-requirement.illusionist-xphb.tradition-spells',
            pool: 'spellbook',
            filter: { classList: ['Wizard'], school: ['Illusion'] },
            totalByLevel: [0, 0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9],
            label: 'Illusionist Spells'
          }
        ]
      },

      // -- COLLEGE OF LORE (Magical Discoveries, spell SELECTION, multi-class list) ------
      // "Learn two spells of your choice, level 0-3, from the Cleric, Druid, or Wizard
      // spell list." `classList` is already an OR-of-several-classes array (its own header,
      // app/lib/rules/types.ts: "at least one of these named classes' list"), so 3 classes
      // is zero new shape. The level cap ("3rd level or lower") is, again, never a
      // `filter.level` literal -- `pool: 'spellbook'`'s own dynamic level-gating against a
      // BARD's own derived castable level happens to reach exactly 3rd level at character
      // level 6, the SAME level this feature is acquired, so the existing gate alone already
      // enforces "spells of your current castable level or lower," matching the real text.
      // A flat, one-time total (2 from Level 6 on) -- the real corpus has no further growth.
      'college-of-lore-xphb': {
        spellRequirements: [
          {
            id: 'spell-requirement.college-of-lore-xphb.magical-discoveries',
            pool: 'spellbook',
            filter: { classList: ['Cleric', 'Druid', 'Wizard'] },
            totalByLevel: [0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
            label: 'Magical Discoveries'
          }
        ]
      },

      // -- THIRD-CASTER SUBCLASSES (Eldritch Knight / Arcane Trickster) -- COMPLETE -------
      // CANTRIP pool: `pool: 'cantrip'` is never level-gated (`isLevelGated` only checks
      // 'spell'/'spellbook') -- its own filter already names an exact level (0). `totalByLevel`
      // re-derived directly from each subclass's own real `cantripProgression`
      // (class-fighter.json/class-rogue.json, byte-identical for both).
      //
      // LEVELED spell pool (1st-4th level Wizard spells, "Spells Prepared") -- A3 WORKSTREAM,
      // THIRD-CASTER LEVELED SPELL ACQUISITION. Previously undeliverable: `casterTypeOf`/
      // `progressionSpellSlotLevels` derived the character's own `maxSpellLevel` -- which gates
      // every 'spell'-pool requirement's legality -- from the CLASS facet alone, and Fighter's/
      // Rogue's own class facet is a non-caster, so this pool would always have seen
      // `maxSpellLevel === 0`. Fixed generically (server/utils/character-spell-acquisition.ts's
      // new `effectiveCasterTypeOf`, server/utils/character-progression-spell-acquisition.ts's
      // `progressionSpellSlotLevels` widened to accept an array of facets,
      // character-progression-plan.ts's own single real call site passing BOTH the class and
      // subclass facets) -- no subclass name anywhere in that fix, and every pre-existing
      // single-facet caller is unaffected (see each function's own header).
      //
      // The corpus's own "expanded" additionalSpells block (`{all: "level=N|class=Wizard"}`,
      // no `school` restriction, unlike the Wizard Arcane Traditions above) is NOT a second
      // acquisition -- it is 5etools' own "which spell levels are eligible" ELIGIBILITY marker
      // for this subclass's OWN "Spells Prepared" feature (subclassTableGroups, re-derived
      // directly from class-fighter.json/class-rogue.json: `preparedSpellsProgression` --
      // [0,0,3,4,4,4,5,6,6,7,8,8,9,10,10,11,11,11,12,13], byte-identical for both subclasses).
      // Re-verified directly against the real `rowsSpellProgression` slot table (not assumed):
      // 1st-level slots first appear at character level 3, 2nd at 7, 3rd at 13, 4th at 19 --
      // EXACTLY the corpus's own "expanded" unlock levels (3/3/7/13/19 for spell levels 0-4) --
      // confirming the THIRD-CASTER's own derived `maxSpellLevel` (now correctly read off the
      // subclass's own slot table via the fix above) already reaches each eligible level at
      // precisely the right character level, with zero extra filter shape: a single, UNGATED-
      // on-level `classList: ['Wizard']` 'spell'-pool requirement (flag 'prepared', matching
      // the real "Spells Prepared" table name, not "known") is exactly the real rule -- the
      // SAME pattern a real full/half caster's own normal 'spell' pool already uses, just
      // classList-restricted to Wizard instead of the owning class. REPLACEMENT ("you can
      // replace one of these spells...", discovered separately as `Eldritch Knight Spellcasting
      // /War Magic/Improved War Magic` and `Arcane Trickster Spellcasting`, each an
      // optional-re-answer `variant-choice`/`replacement` decision) is NOT modeled, exactly like
      // every other replacement clause in this corpus (`opt:replacement`) -- never implemented,
      // never blocking. No 2014-rules assumption anywhere here: every level/count/filter value
      // above is re-derived directly from the real native XPHB corpus, not carried over from a
      // prior edition's spell-list-restriction text.
      'eldritch-knight-xphb': {
        grants: [
          { set: 'value:spellcasting.caster_type.third', to: true }
        ],
        spellRequirements: [
          {
            id: 'spell-requirement.eldritch-knight-xphb.cantrip',
            pool: 'cantrip',
            filter: { classList: ['Wizard'], level: 0 },
            totalByLevel: [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
            label: 'Eldritch Knight Cantrips'
          },
          {
            id: 'spell-requirement.eldritch-knight-xphb.spell',
            pool: 'spell',
            filter: { classList: ['Wizard'] },
            totalByLevel: [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
            label: 'War Magic Spells'
          }
        ]
      },
      'arcane-trickster-xphb': {
        grants: [
          { set: 'value:spellcasting.caster_type.third', to: true }
        ],
        fixedSpellGrants: [
          { slug: 'mage-hand-xphb', flag: 'known', minLevel: 3 }
        ],
        spellRequirements: [
          {
            id: 'spell-requirement.arcane-trickster-xphb.cantrip',
            pool: 'cantrip',
            filter: { classList: ['Wizard'], level: 0 },
            totalByLevel: [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
            label: 'Arcane Trickster Cantrips'
          },
          {
            id: 'spell-requirement.arcane-trickster-xphb.spell',
            pool: 'spell',
            filter: { classList: ['Wizard'] },
            totalByLevel: [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
            label: 'Mystic Trickster Spells'
          }
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
    // FIGHTING STYLE FEATS -- PHASE 2C.2A. The ten ordinary XPHB Fighting Style
    // feats (raw category FS). Each declares its explicit coverage of the raw
    // prerequisite `feature: ["Fighting Style"]` by pointing at the package's
    // feature Value. The mapping is per-feat authored data, matched on the raw
    // name verbatim -- never inferred. Blessed Warrior and Druidic Warrior (FS:P,
    // FS:R) are deliberately NOT here, still: their own mandatory nested cantrip
    // choice is now authored (FEAT-OWNED SPELL ACQUISITION PHASE -- see their own
    // entries near the end of this object), but their raw prerequisite is
    // `otherSummary` (prose: "When Gaining the Level 2 Paladin/Ranger 'Fighting
    // Style' Feature"), not the clean `feature: [...]` key the other ten use --
    // `coverUnsupportedPrerequisites` (app/lib/feat-mechanics/eligibility.ts) only
    // ever covers the `feature` key, by construction, so no `featureRequirements`
    // mapping can satisfy an `otherSummary` entry. Both feats therefore remain
    // ILLEGAL overall (fail closed via `featOptionVerdict`) for this SEPARATE,
    // pre-existing reason, unrelated to and not fixed by this phase's own spell
    // acquisition work -- covering `otherSummary` prose generically would be a
    // genuinely new capability (prose matching, not a Value mapping), out of
    // scope here, not broadened into.
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
    // D&D 2024 Character Rules A1 -- real wording: unconditional "gain proficiency in a skill of
    // your choice" for EVERY one of the 18 skills (the raw corpus's own skill-proficiency field is
    // a flat `true` grant per skill, never a `choose`/`any` shape -- there is no skill PICK here,
    // only the Expertise pick below). Authored as plain `grants`, never a Definition-authored choice
    // (there is nothing to choose). "Direct grants are collected... before any choice is judged"
    // (creation-choice-eligibility.ts) means the Expertise choice's `requiresActive` sees all 18
    // as already active regardless of declaration order.
    'boon-of-skill-xphb': { // Boon of Skill
      grants: [
        { set: 'value:skill.acrobatics.proficient', to: true },
        { set: 'value:skill.animal_handling.proficient', to: true },
        { set: 'value:skill.arcana.proficient', to: true },
        { set: 'value:skill.athletics.proficient', to: true },
        { set: 'value:skill.deception.proficient', to: true },
        { set: 'value:skill.history.proficient', to: true },
        { set: 'value:skill.insight.proficient', to: true },
        { set: 'value:skill.intimidation.proficient', to: true },
        { set: 'value:skill.investigation.proficient', to: true },
        { set: 'value:skill.medicine.proficient', to: true },
        { set: 'value:skill.nature.proficient', to: true },
        { set: 'value:skill.perception.proficient', to: true },
        { set: 'value:skill.performance.proficient', to: true },
        { set: 'value:skill.persuasion.proficient', to: true },
        { set: 'value:skill.religion.proficient', to: true },
        { set: 'value:skill.sleight_of_hand.proficient', to: true },
        { set: 'value:skill.stealth.proficient', to: true },
        { set: 'value:skill.survival.proficient', to: true }
      ],
      choices: [
        {
          choiceSet: 'choice:feat.epic-boon-ability',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        },
        {
          choiceSet: 'choice:skill.expertise',
          count: 1,
          from: [
            'value:skill.acrobatics.expertise',
            'value:skill.animal_handling.expertise',
            'value:skill.arcana.expertise',
            'value:skill.athletics.expertise',
            'value:skill.deception.expertise',
            'value:skill.history.expertise',
            'value:skill.insight.expertise',
            'value:skill.intimidation.expertise',
            'value:skill.investigation.expertise',
            'value:skill.medicine.expertise',
            'value:skill.nature.expertise',
            'value:skill.perception.expertise',
            'value:skill.performance.expertise',
            'value:skill.persuasion.expertise',
            'value:skill.religion.expertise',
            'value:skill.sleight_of_hand.expertise',
            'value:skill.stealth.expertise',
            'value:skill.survival.expertise'
          ],
          requiresActive: [
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
      grants: [
        { set: 'value:tool.cooks_utensils.proficient', to: true },
      ],
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.con', 'source:asi.increase.wis']
        }
      ]
    },
    'crafter-xphb': { // Crafter
      choices: [
        {
          choiceSet: 'choice:feat.crafter.tools',
          count: 3,
          from: [
            'value:tool.carpenters_tools.proficient',
            'value:tool.leatherworkers_tools.proficient',
            'value:tool.masons_tools.proficient',
            'value:tool.potters_tools.proficient',
            'value:tool.smiths_tools.proficient',
            'value:tool.tinkers_tools.proficient',
            'value:tool.weavers_tools.proficient',
            'value:tool.woodcarvers_tools.proficient'
          ]
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
    // XPHB text (feats.json, Energy Mastery): "Choose one of the following damage types: Acid,
    // Cold, Fire, Lightning, or Thunder." -- no structured corpus field carries this at all, so
    // `detectFeatDecisions` needs a small, named supplement (see mandatory-decisions.ts's own
    // `FEAT_DAMAGE_TYPE_CHOICE`, mirroring `FeatureRequirementMapping`'s own "a small authored
    // mapping from a raw fact the engine cannot structurally parse" precedent -- never a
    // prose-parsing engine). Repeatable
    // (`"repeatable": true`), and the corpus is explicit: "you must choose a different damage type
    // each time for Energy Mastery" -- authored via `repeatAcquisitionDifferentiator`, the SAME
    // generic mechanism Magic Initiate's own spell-list differentiator uses. The 5
    // `value:elemental-adept.damage-type.*.active` Values are deliberately opaque booleans (no
    // runtime Resistance-ignoring/reroll effect modeled -- Milestone B).
    'elemental-adept-xphb': { // Elemental Adept
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        },
        {
          choiceSet: 'choice:feat.elemental-adept.damage-type',
          count: 1,
          from: [
            'value:elemental-adept.damage-type.acid.active',
            'value:elemental-adept.damage-type.cold.active',
            'value:elemental-adept.damage-type.fire.active',
            'value:elemental-adept.damage-type.lightning.active',
            'value:elemental-adept.damage-type.thunder.active'
          ]
        }
      ],
      repeatAcquisitionDifferentiator: 'choice:feat.elemental-adept.damage-type'
    },
    'fey-touched-xphb': { // Fey-Touched
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ],
      // FEAT-OWNED SPELL ACQUISITION PHASE -- the source wording: "You always have that spell and the Misty
      // Step spell prepared." Misty Step is a FIXED grant (no "of your choice" clause at all); the
      // Divination/Enchantment pick is the real decision, modeled via the SAME `fixed` pool kind
      // Magic Initiate's own Level-1 spell uses (ungated, flag 'prepared', exact level 1). No
      // classList restriction -- the real text names only a school pair, never a class list.
      fixedSpellGrants: [
        { slug: 'misty-step-xphb', flag: 'prepared' }
      ],
      spellRequirements: [
        {
          id: 'spell-requirement.fey-touched-xphb.spell',
          pool: 'fixed',
          filter: { level: 1, school: ['Divination', 'Enchantment'] },
          totalByLevel: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
          label: 'Fey-Touched Spell'
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
      grants: [
        { set: 'value:armor.heavy.proficient', to: true },
      ],
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
    // A4 -- KEEN MIND. Re-verified directly against the real corpus's own prose (the
    // structured raw skill-choice field alone UNDER-represents the real rule): "If
    // you LACK proficiency in the chosen skill, you gain proficiency in it, and if you
    // ALREADY HAVE proficiency in it, you gain EXPERTISE in it." This is a genuine STOP, NOT a
    // plain N-of-M skill-proficiency choice: the grant's own OUTPUT (proficiency vs.
    // Expertise) depends on the character's own prior state for that SAME skill -- the exact
    // same missing primitive as Gloom Stalker's own Iron Mind (a grant that is FIXED in one
    // branch and something ELSE in another, conditioned on prior state). `excludeIfAlready
    // Active` cannot represent this either (it only ever narrows a CHOICE pool, it cannot
    // switch a grant's own OUTPUT kind). See this phase's own final report for the minimal
    // proposed extension -- deliberately NOT authored as a plain skill-proficiency choice,
    // which would silently drop the real Expertise-on-repeat half of the rule.
    'keen-mind-xphb': { // Keen Mind
      sources: ['source:asi.increase.int']
    },
    'lightly-armored-xphb': { // Lightly Armored
      grants: [
        { set: 'value:armor.light.proficient', to: true },
        { set: 'value:armor.shield.proficient', to: true },
      ],
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
      grants: [
        { set: 'value:weapon.martial.proficient', to: true },
      ],
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
      grants: [
        { set: 'value:armor.medium.proficient', to: true },
      ],
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
    'musician-xphb': { // Musician
      choices: [
        {
          choiceSet: 'choice:feat.musician.instruments',
          count: 3,
          from: [
            'value:tool.bagpipes.proficient',
            'value:tool.drum.proficient',
            'value:tool.dulcimer.proficient',
            'value:tool.flute.proficient',
            'value:tool.horn.proficient',
            'value:tool.lute.proficient',
            'value:tool.lyre.proficient',
            'value:tool.pan_flute.proficient',
            'value:tool.shawm.proficient',
            'value:tool.viol.proficient'
          ]
        }
      ]
    },
    // A4 -- OBSERVANT. Re-verified directly: the IDENTICAL proficiency-OR-Expertise
    // conditional shape Keen Mind's own header above describes ("If you lack proficiency...
    // you gain proficiency... if you already have proficiency... you gain Expertise") --
    // the SAME genuine STOP, never authored as a plain skill-proficiency choice.
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
      grants: [
        { set: 'value:tool.poisoners_kit.proficient', to: true },
      ],
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
        },
        {
          choiceSet: 'choice:save.proficiency',
          count: 1,
          from: [
            'value:save.str.proficient',
            'value:save.dex.proficient',
            'value:save.con.proficient',
            'value:save.int.proficient',
            'value:save.wis.proficient',
            'value:save.cha.proficient'
          ]
        }
      ]
    },
    // D&D 2024 Character Rules A1 -- real wording: "Choose a number of level 1 spells equal to your
    // Proficiency Bonus that have the Ritual tag... Whenever your Proficiency Bonus increases
    // thereafter, you can add an additional level 1 spell with the Ritual tag." Re-derived
    // directly from feats.json's own structured `additionalSpells.prepared` block (levels
    // "1"/"5"/"9"/"13"/"17", counts 2/1/1/1/1 -- matching the real Proficiency Bonus growth table
    // exactly, since PB is 2 at level 1 and increases by 1 at each of those same four levels).
    // Modeled via the SAME `fixed` pool kind Magic Initiate/Fey-Touched already use (ungated, flag
    // 'prepared', exact level 1) -- no new pool kind. `filter.ritual: true` is the ONE new
    // dimension this phase adds to `SpellCatalogueFilter` (app/lib/rules/types.ts), wired into
    // `spellOptionVerdict` (app/lib/spell-mechanics/spell-option-eligibility.ts) against the
    // ALREADY-existing `CanonicalSpellMechanics.ritual` field -- no classList restriction (the
    // real text names none). "Quick Ritual" (cast without the extended ritual time, once per Long
    // Rest) is a RUNTIME effect (Milestone B), not an acquisition decision -- not modeled here.
    'ritual-caster-xphb': { // Ritual Caster
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ],
      spellRequirements: [
        {
          id: 'spell-requirement.ritual-caster-xphb.spell',
          pool: 'fixed',
          filter: { level: 1, ritual: true },
          totalByLevel: [2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6],
          label: 'Ritual Caster Spells'
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
      ],
      // FEAT-OWNED SPELL ACQUISITION PHASE -- the source wording: "You always have that spell and the
      // Invisibility spell prepared." Mirrors Fey-Touched's own identical shape exactly (Invisibility
      // fixed, the Illusion/Necromancy pick the real decision).
      fixedSpellGrants: [
        { slug: 'invisibility-xphb', flag: 'prepared' }
      ],
      spellRequirements: [
        {
          id: 'spell-requirement.shadow-touched-xphb.spell',
          pool: 'fixed',
          filter: { level: 1, school: ['Illusion', 'Necromancy'] },
          totalByLevel: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
          label: 'Shadow-Touched Spell'
        }
      ]
    },
    'sharpshooter-xphb': { // Sharpshooter
      sources: ['source:asi.increase.dex']
    },
    'shield-master-xphb': { // Shield Master
      sources: ['source:asi.increase.str']
    },
    // D&D 2024 Character Rules A1 -- real wording: "gain proficiency in one skill of your choice...
    // Choose one of your skill proficiencies [this feat's own new one included -- see below]. You
    // gain Expertise in that skill." The skill-proficiency choice is declared BEFORE the Expertise
    // choice in this facet's own `choices` array -- creation-choice-eligibility.ts's own documented
    // "sibling answers are judged in... facet order" rule means the newly-granted proficiency is
    // already visible to the Expertise choice's `requiresActive` gate in the SAME acquisition, so a
    // character with no OTHER proficient skill can still legally pick Expertise in the one this
    // feat itself just granted. Reuses the IDENTICAL `choice:skill.expertise` + all-18
    // `requiresActive` shape the class Expertise progression rows already use (Rogue/Bard/Ranger/
    // Wizard) -- a NEW coverage rule is needed (`impl:feat-expertise-choice`) because the existing
    // `impl:expertise` rule is narrowly scoped to `owner.kind === 'class'`.
    'skill-expert-xphb': { // Skill Expert
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.str', 'source:asi.increase.dex', 'source:asi.increase.con', 'source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        },
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
        },
        {
          choiceSet: 'choice:skill.expertise',
          count: 1,
          from: [
            'value:skill.acrobatics.expertise',
            'value:skill.animal_handling.expertise',
            'value:skill.arcana.expertise',
            'value:skill.athletics.expertise',
            'value:skill.deception.expertise',
            'value:skill.history.expertise',
            'value:skill.insight.expertise',
            'value:skill.intimidation.expertise',
            'value:skill.investigation.expertise',
            'value:skill.medicine.expertise',
            'value:skill.nature.expertise',
            'value:skill.perception.expertise',
            'value:skill.performance.expertise',
            'value:skill.persuasion.expertise',
            'value:skill.religion.expertise',
            'value:skill.sleight_of_hand.expertise',
            'value:skill.stealth.expertise',
            'value:skill.survival.expertise'
          ],
          requiresActive: [
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
    },
    'skilled-xphb': { // Skilled
      choices: [
        {
          choiceSet: 'choice:feat.skilled.skill-or-tool',
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
            'value:skill.survival.proficient',
            'value:tool.alchemists_supplies.proficient',
            'value:tool.brewers_supplies.proficient',
            'value:tool.calligraphers_supplies.proficient',
            'value:tool.carpenters_tools.proficient',
            'value:tool.cartographers_tools.proficient',
            'value:tool.cobblers_tools.proficient',
            'value:tool.cooks_utensils.proficient',
            'value:tool.glassblowers_tools.proficient',
            'value:tool.jewelers_tools.proficient',
            'value:tool.leatherworkers_tools.proficient',
            'value:tool.masons_tools.proficient',
            'value:tool.painters_supplies.proficient',
            'value:tool.potters_tools.proficient',
            'value:tool.smiths_tools.proficient',
            'value:tool.tinkers_tools.proficient',
            'value:tool.weavers_tools.proficient',
            'value:tool.woodcarvers_tools.proficient',
            'value:tool.bagpipes.proficient',
            'value:tool.drum.proficient',
            'value:tool.dulcimer.proficient',
            'value:tool.flute.proficient',
            'value:tool.horn.proficient',
            'value:tool.lute.proficient',
            'value:tool.lyre.proficient',
            'value:tool.pan_flute.proficient',
            'value:tool.shawm.proficient',
            'value:tool.viol.proficient',
            'value:tool.dice_set.proficient',
            'value:tool.dragonchess_set.proficient',
            'value:tool.playing_cards.proficient',
            'value:tool.three_dragon_ante_set.proficient',
            'value:tool.disguise_kit.proficient',
            'value:tool.forgery_kit.proficient',
            'value:tool.herbalism_kit.proficient',
            'value:tool.navigators_tools.proficient',
            'value:tool.poisoners_kit.proficient',
            'value:tool.thieves_tools.proficient'
          ]
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
      ],
      // FEAT-OWNED SPELL ACQUISITION PHASE -- the source wording: "You learn the Mage Hand spell" -- no
      // "of your choice" clause at all, a FIXED grant, never a mandatory decision requiring a
      // picker (see FixedSpellGrant's own header). `known`, matching the corpus's own "learn" verb.
      fixedSpellGrants: [
        { slug: 'mage-hand-xphb', flag: 'known' }
      ]
    },
    'telepathic-xphb': { // Telepathic
      choices: [
        {
          choiceSet: 'choice:feat.ability-choice-1',
          count: 1,
          from: ['source:asi.increase.int', 'source:asi.increase.wis', 'source:asi.increase.cha']
        }
      ],
      // FEAT-OWNED SPELL ACQUISITION PHASE -- the source wording: "You always have the Detect Thoughts
      // spell prepared" -- FIXED, no choice. `prepared`, matching the corpus's own verb exactly.
      fixedSpellGrants: [
        { slug: 'detect-thoughts-xphb', flag: 'prepared' }
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
    },
    'tavern-brawler-xphb': { // Tavern Brawler
      grants: [
        { set: 'value:weapon.improvised.proficient', to: true }
      ]
    },
    // FEAT-OWNED SPELL ACQUISITION PHASE -- Magic Initiate (category 'O', Origin), the Background's
    // own real fixed Origin Feat for Acolyte/Guide/Sage. The source wording: "You learn two cantrips of
    // your choice from the Cleric, Druid, or Wizard spell list... Choose a level 1 spell from the
    // SAME list you selected for this feat's cantrips. You always have that spell prepared."
    //
    // CORPUS CORRECTION, re-derived directly (never trusted from this phase's own first-draft
    // assumption): the raw Background `feats` key is NOT a bare `"magic initiate|xphb"` -- it is
    // `"magic initiate; cleric|xphb"` (Acolyte), `"...; druid|xphb"` (Guide), `"...; wizard|xphb"`
    // (Sage). The GRANTING BACKGROUND fixes WHICH list, every time, for ITS OWN acquisition.
    //
    // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- the earlier claim here ("there is NO real
    // creation path... where a player freely chooses among the three") was true only because no
    // generic Origin-feat-selection mechanism existed yet. Human's Versatile ("you gain an Origin
    // feat of your choice") is exactly that path now, and Magic Initiate's own category IS
    // 'O'/Origin, so it is swept in by the SAME generic filter as every other Origin feat -- its
    // own "choose a spell list" decision, re-derived directly from the feat's OWN real text
    // (feats.json: "You learn two cantrips of your choice from the Cleric, Druid, or Wizard spell
    // list... Intelligence, Wisdom, or Charisma is your spellcasting ability... choose when you
    // select this feat"), is therefore now authored as `choice:feat.magic-initiate.list` below --
    // the EXACT `choice:species.size` shape (a literal Value id per option, no activate-source).
    //
    // Still 6 `spellRequirements` (2 cantrip + 1 fixed-spell pool, times 3 lists), each gated via
    // `requiresActive` against the SAME plain boolean Value (`value:magic-initiate.list.1/2/3.active`)
    // as before -- but that Value is no longer set by a Background's own unconditional `grants`
    // entry. Acolyte/Guide/Sage's own fixed Origin Feat grant now PRESETS this facet's own nested
    // choice instead (`RulesFacet.originFeatPreset`, see their own facets below) -- the SAME
    // generic mechanism a freely-chosen acquisition answers for itself, just answered by the
    // Background rather than the player. `isGateActive`'s own owner-prefix scoping
    // (app/lib/characters/spell-requirement-ownership.ts) means each ACQUISITION's own answer is
    // checked against ONLY that acquisition's own selections -- a Background-fixed acquisition and
    // a freely-chosen one can coexist on the SAME character (e.g. Human+Acolyte) without either's
    // list choice bleeding into the other's gate.
    //
    // Repeatable (`"repeatable": true`, feats.json), and the corpus is explicit: "You can take
    // this feat more than once, but you must choose a different spell list each time." Authored
    // generically via `repeatAcquisitionDifferentiator: 'choice:feat.magic-initiate.list'` --
    // `findIllegalRepeatAcquisition` (app/lib/characters/creation-origin-feat.ts) compares two
    // acquisitions' own answers to THIS named choice, never a Magic-Initiate-specific check.
    //
    // Casting-ability ("Intelligence, Wisdom, or Charisma... choose when you select this feat") and
    // "Spell Change" (replace a spell on level-up) are real corpus text but NEITHER is a discovered
    // Phase-0 decision today (`detectFeatDecisions` does not parse a feat's own `ability` field at
    // all, a pre-existing, narrower gap this phase did not introduce or need to close) and
    // replacement is explicitly optional corpus text either way -- both left as documented, deferred
    // runtime/decision facts, never silently picked or faked.
    //
    // `value:magic-initiate.list.1/2/3.active` (Rules Package Definitions) are deliberately opaque
    // -- the Rules/Content boundary test (`tests/rules/dnd5e-2024-package.test.ts`) forbids a real
    // class name anywhere in the Rules Package itself. WHICH list is Cleric/Druid/Wizard is a
    // CONTENT fact, authored only here (list.1 = Cleric, list.2 = Druid, list.3 = Wizard) -- the
    // Value ids/labels in definitions.json name neither.
    'magic-initiate-xphb': { // Magic Initiate
      choices: [
        {
          choiceSet: 'choice:feat.magic-initiate.list',
          count: 1,
          from: ['value:magic-initiate.list.1.active', 'value:magic-initiate.list.2.active', 'value:magic-initiate.list.3.active']
        }
      ],
      repeatAcquisitionDifferentiator: 'choice:feat.magic-initiate.list',
      spellRequirements: [
        {
          id: 'spell-requirement.magic-initiate-xphb.cleric.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Cleric'], level: 0 },
          totalByLevel: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
          requiresActive: ['value:magic-initiate.list.1.active'],
          label: 'Magic Initiate Cantrips (Cleric)'
        },
        {
          id: 'spell-requirement.magic-initiate-xphb.cleric.spell',
          pool: 'fixed',
          filter: { classList: ['Cleric'], level: 1 },
          totalByLevel: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
          requiresActive: ['value:magic-initiate.list.1.active'],
          label: 'Magic Initiate Spell (Cleric)'
        },
        {
          id: 'spell-requirement.magic-initiate-xphb.druid.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Druid'], level: 0 },
          totalByLevel: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
          requiresActive: ['value:magic-initiate.list.2.active'],
          label: 'Magic Initiate Cantrips (Druid)'
        },
        {
          id: 'spell-requirement.magic-initiate-xphb.druid.spell',
          pool: 'fixed',
          filter: { classList: ['Druid'], level: 1 },
          totalByLevel: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
          requiresActive: ['value:magic-initiate.list.2.active'],
          label: 'Magic Initiate Spell (Druid)'
        },
        {
          id: 'spell-requirement.magic-initiate-xphb.wizard.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Wizard'], level: 0 },
          totalByLevel: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
          requiresActive: ['value:magic-initiate.list.3.active'],
          label: 'Magic Initiate Cantrips (Wizard)'
        },
        {
          id: 'spell-requirement.magic-initiate-xphb.wizard.spell',
          pool: 'fixed',
          filter: { classList: ['Wizard'], level: 1 },
          totalByLevel: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
          requiresActive: ['value:magic-initiate.list.3.active'],
          label: 'Magic Initiate Spell (Wizard)'
        }
      ]
    },
    // FEAT-OWNED SPELL ACQUISITION PHASE -- Blessed Warrior/Druidic Warrior (FS:P/FS:R), named as
    // "deliberately NOT here" by the Fighting Style comment above -- now authored, since their own
    // mandatory nested cantrip choice is exactly the real gap this phase closes. The source wording: "You
    // learn two Cleric/Druid cantrips of your choice... Charisma/Wisdom is your spellcasting
    // ability for them" -- a plain, ungated `cantrip` pool (fixed classList, fixed casting ability
    // stated directly in the text, never a player pick, so no nested ability choice is needed
    // here). Their own raw `otherSummary` prerequisite stays unsupported and unrelated to this
    // phase; acquisition through `choice:feat.fighting-style.*` is unaffected either way.
    'blessed-warrior-xphb': { // Blessed Warrior
      spellRequirements: [
        {
          id: 'spell-requirement.blessed-warrior-xphb.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Cleric'], level: 0 },
          totalByLevel: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
          label: 'Blessed Warrior Cantrips'
        }
      ]
    },
    'druidic-warrior-xphb': { // Druidic Warrior
      spellRequirements: [
        {
          id: 'spell-requirement.druidic-warrior-xphb.cantrip',
          pool: 'cantrip',
          filter: { classList: ['Druid'], level: 0 },
          totalByLevel: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
          label: 'Druidic Warrior Cantrips'
        }
      ]
    }
  },

  background: {
    'acolyte-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.int',
            'source:background.increase.wis',
            'source:background.increase.cha'
          ]
        }
      ],
      // FEAT-OWNED SPELL ACQUISITION PHASE -- Magic Initiate's own spell decisions are now
      // representable (see the feat's own facet entry above); `creationUnavailable` removed. The
      // real corpus FIXES Acolyte's own Magic Initiate to the Cleric list (raw Background feats
      // key: "magic initiate; cleric|xphb").
      //
      // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- the fixed list is no longer a plain
      // `grants` entry: Magic Initiate's facet now declares its OWN "choose a spell list" nested
      // choice unconditionally (so a FREELY-chosen acquisition, e.g. via Human's Versatile, can
      // answer it too), and a global `grants` entry would answer it for every acquisition of this
      // feat on the character, not just THIS Background's own -- exactly the cross-acquisition
      // bleed this phase closes. `originFeatPreset` instead presets THIS acquisition's own answer
      // to that nested choice (re-derived fresh every read, from this fact, never persisted) --
      // the SAME real corpus fact, fixed, never a player choice, just expressed as an answer to
      // the feat's own question rather than a global flag.
      originFeatSlug: 'magic-initiate-xphb',
      originFeatPreset: {
        'choice:feat.magic-initiate.list': ['value:magic-initiate.list.1.active']
      },
      grants: [
        { set: 'value:tool.calligraphers_supplies.proficient', to: true },
        { set: 'value:skill.insight.proficient', to: true },
        { set: 'value:skill.religion.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.acolyte-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Book (Prayers), Calligrapher's Supplies, Holy Symbol, 10 Parchment, Robe, 8 GP",
            grants: [
              { kind: 'item', slug: 'book-xphb' },
              { kind: 'item', slug: 'calligraphers-supplies-xphb' },
              { kind: 'custom', name: 'Holy Symbol' },
              { kind: 'item', slug: 'parchment-xphb', quantity: 10 },
              { kind: 'item', slug: 'robe-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 800 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'artisan-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.str',
            'source:background.increase.dex',
            'source:background.increase.int'
          ]
        },
        {
          choiceSet: 'choice:proficiency.artisan-tool.background',
          count: 1,
          from: [
            'value:tool.alchemists_supplies.proficient',
            'value:tool.brewers_supplies.proficient',
            'value:tool.calligraphers_supplies.proficient',
            'value:tool.carpenters_tools.proficient',
            'value:tool.cartographers_tools.proficient',
            'value:tool.cobblers_tools.proficient',
            'value:tool.cooks_utensils.proficient',
            'value:tool.glassblowers_tools.proficient',
            'value:tool.jewelers_tools.proficient',
            'value:tool.leatherworkers_tools.proficient',
            'value:tool.masons_tools.proficient',
            'value:tool.painters_supplies.proficient',
            'value:tool.potters_tools.proficient',
            'value:tool.smiths_tools.proficient',
            'value:tool.tinkers_tools.proficient',
            'value:tool.weavers_tools.proficient',
            'value:tool.woodcarvers_tools.proficient'
          ]
        },
      ],
      // D&D 2024 Character Rules A1 -- the former literal duplicate of Crafter's own nested
      // "choose 3 tools" choice (declared directly on THIS background's facet, back when Crafter
      // had no facet of its own) is REMOVED: Crafter now has its own real facet carrying this
      // exact choice, and the duplicate would have asked the player twice under two different
      // keys (`background:choice:feat.crafter.tools` here vs. the feat acquisition's own
      // `feat:<choiceKey>:choice:feat.crafter.tools`). The generic acquisition pipeline reaches
      // the feat's own facet automatically once it is acquired -- no preset needed, since the
      // player freely chooses which 3 tools, unlike Magic Initiate's own Background-FIXED list.
      originFeatSlug: 'crafter-xphb',
      grants: [
        { set: 'value:skill.investigation.proficient', to: true },
        { set: 'value:skill.persuasion.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.artisan-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Artisan's Tools chosen for the tool proficiency above, 2 Pouches, Traveler's Clothes, 32 GP",
            grants: [
              { kind: 'crossReference', choiceSetId: 'choice:proficiency.artisan-tool.background' },
              { kind: 'item', slug: 'pouch-xphb', quantity: 2 },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 3200 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'charlatan-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.dex',
            'source:background.increase.con',
            'source:background.increase.cha'
          ]
        },
      ],
      // D&D 2024 Character Rules A1 -- the former literal duplicate of Skilled's own nested
      // "choose 3 skills or tools" choice (see Artisan's own identical note above) is REMOVED:
      // Skilled now has its own real facet carrying this exact choice.
      originFeatSlug: 'skilled-xphb',
      grants: [
        { set: 'value:tool.forgery_kit.proficient', to: true },
        { set: 'value:skill.deception.proficient', to: true },
        { set: 'value:skill.sleight_of_hand.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.charlatan-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Forgery Kit, Costume, Fine Clothes, 15 GP",
            grants: [
              { kind: 'item', slug: 'forgery-kit-xphb' },
              { kind: 'item', slug: 'costume-xphb' },
              { kind: 'item', slug: 'fine-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1500 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'criminal-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.dex',
            'source:background.increase.con',
            'source:background.increase.int'
          ]
        }
      ],
      originFeatSlug: 'alert-xphb',
      grants: [
        { set: 'value:tool.thieves_tools.proficient', to: true },
        { set: 'value:skill.sleight_of_hand.proficient', to: true },
        { set: 'value:skill.stealth.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.criminal-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) 2 Daggers, Thieves' Tools, Crowbar, 2 Pouches, Traveler's Clothes, 16 GP",
            grants: [
              { kind: 'item', slug: 'dagger-xphb', quantity: 2 },
              { kind: 'item', slug: 'thieves-tools-xphb' },
              { kind: 'item', slug: 'crowbar-xphb' },
              { kind: 'item', slug: 'pouch-xphb', quantity: 2 },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1600 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'entertainer-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.str',
            'source:background.increase.dex',
            'source:background.increase.cha'
          ]
        },
        {
          choiceSet: 'choice:proficiency.instrument.background',
          count: 1,
          from: [
            'value:tool.bagpipes.proficient',
            'value:tool.drum.proficient',
            'value:tool.dulcimer.proficient',
            'value:tool.flute.proficient',
            'value:tool.horn.proficient',
            'value:tool.lute.proficient',
            'value:tool.lyre.proficient',
            'value:tool.pan_flute.proficient',
            'value:tool.shawm.proficient',
            'value:tool.viol.proficient'
          ]
        },
      ],
      // D&D 2024 Character Rules A1 -- the former literal duplicate of Musician's own nested
      // "choose 3 instruments" choice (see Artisan's own identical note above) is REMOVED:
      // Musician now has its own real facet carrying this exact choice.
      originFeatSlug: 'musician-xphb',
      grants: [
        { set: 'value:skill.acrobatics.proficient', to: true },
        { set: 'value:skill.performance.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.entertainer-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Musical Instrument chosen for the tool proficiency above, 2 Costumes, Mirror, Perfume, Traveler's Clothes, 11 GP",
            grants: [
              { kind: 'crossReference', choiceSetId: 'choice:proficiency.instrument.background' },
              { kind: 'item', slug: 'costume-xphb', quantity: 2 },
              { kind: 'item', slug: 'mirror-xphb' },
              { kind: 'item', slug: 'perfume-xphb' },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1100 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'farmer-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.str',
            'source:background.increase.con',
            'source:background.increase.wis'
          ]
        }
      ],
      originFeatSlug: 'tough-xphb',
      grants: [
        { set: 'value:tool.carpenters_tools.proficient', to: true },
        { set: 'value:skill.animal_handling.proficient', to: true },
        { set: 'value:skill.nature.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.farmer-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Sickle, Carpenter's Tools, Healer's Kit, Iron Pot, Shovel, Traveler's Clothes, 30 GP",
            grants: [
              { kind: 'item', slug: 'sickle-xphb' },
              { kind: 'item', slug: 'carpenters-tools-xphb' },
              { kind: 'item', slug: 'healers-kit-xphb' },
              { kind: 'item', slug: 'iron-pot-xphb' },
              { kind: 'item', slug: 'shovel-xphb' },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 3000 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'guard-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.str',
            'source:background.increase.int',
            'source:background.increase.wis'
          ]
        },
        {
          choiceSet: 'choice:proficiency.gaming-set.background',
          count: 1,
          from: [
            'value:tool.dice_set.proficient',
            'value:tool.dragonchess_set.proficient',
            'value:tool.playing_cards.proficient',
            'value:tool.three_dragon_ante_set.proficient'
          ]
        },
      ],
      originFeatSlug: 'alert-xphb',
      grants: [
        { set: 'value:skill.athletics.proficient', to: true },
        { set: 'value:skill.perception.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.guard-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Spear, Light Crossbow, 20 Bolts, Gaming Set chosen for the tool proficiency above, Hooded Lantern, Manacles, Quiver, Traveler's Clothes, 12 GP",
            grants: [
              { kind: 'item', slug: 'spear-xphb' },
              { kind: 'item', slug: 'light-crossbow-xphb' },
              { kind: 'item', slug: 'bolts-20-xphb' },
              { kind: 'crossReference', choiceSetId: 'choice:proficiency.gaming-set.background' },
              { kind: 'item', slug: 'hooded-lantern-xphb' },
              { kind: 'item', slug: 'manacles-xphb' },
              { kind: 'item', slug: 'quiver-xphb' },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1200 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'guide-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.dex',
            'source:background.increase.con',
            'source:background.increase.wis'
          ]
        }
      ],
      // FEAT-OWNED SPELL ACQUISITION PHASE -- see Acolyte's own identical note above. Guide's own
      // Magic Initiate is fixed to the Druid list (raw key: "magic initiate; druid|xphb").
      // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- see Acolyte's own identical note above
      // for why this is `originFeatPreset`, not a `grants` entry.
      originFeatSlug: 'magic-initiate-xphb',
      originFeatPreset: {
        'choice:feat.magic-initiate.list': ['value:magic-initiate.list.2.active']
      },
      grants: [
        { set: 'value:tool.cartographers_tools.proficient', to: true },
        { set: 'value:skill.stealth.proficient', to: true },
        { set: 'value:skill.survival.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.guide-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Shortbow, 20 Arrows, Cartographer's Tools, Bedroll, Quiver, Tent, Traveler's Clothes, 3 GP",
            grants: [
              { kind: 'item', slug: 'shortbow-xphb' },
              { kind: 'item', slug: 'arrows-20-xphb' },
              { kind: 'item', slug: 'cartographers-tools-xphb' },
              { kind: 'item', slug: 'bedroll-xphb' },
              { kind: 'item', slug: 'quiver-xphb' },
              { kind: 'item', slug: 'tent-xphb' },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 300 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'hermit-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.con',
            'source:background.increase.wis',
            'source:background.increase.cha'
          ]
        }
      ],
      originFeatSlug: 'healer-xphb',
      grants: [
        { set: 'value:tool.herbalism_kit.proficient', to: true },
        { set: 'value:skill.medicine.proficient', to: true },
        { set: 'value:skill.religion.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.hermit-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Quarterstaff, Herbalism Kit, Bedroll, Book, Lamp, 3 Oil, Traveler's Clothes, 16 GP",
            grants: [
              { kind: 'item', slug: 'quarterstaff-xphb' },
              { kind: 'item', slug: 'herbalism-kit-xphb' },
              { kind: 'item', slug: 'bedroll-xphb' },
              { kind: 'item', slug: 'book-xphb' },
              { kind: 'item', slug: 'lamp-xphb' },
              { kind: 'item', slug: 'oil-xphb', quantity: 3 },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1600 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'merchant-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.con',
            'source:background.increase.int',
            'source:background.increase.cha'
          ]
        }
      ],
      originFeatSlug: 'lucky-xphb',
      grants: [
        { set: 'value:tool.navigators_tools.proficient', to: true },
        { set: 'value:skill.animal_handling.proficient', to: true },
        { set: 'value:skill.persuasion.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.merchant-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Navigator's Tools, 2 Pouches, Traveler's Clothes, 22 GP",
            grants: [
              { kind: 'item', slug: 'navigators-tools-xphb' },
              { kind: 'item', slug: 'pouch-xphb', quantity: 2 },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 2200 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'noble-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.str',
            'source:background.increase.int',
            'source:background.increase.cha'
          ]
        },
        {
          choiceSet: 'choice:proficiency.gaming-set.background',
          count: 1,
          from: [
            'value:tool.dice_set.proficient',
            'value:tool.dragonchess_set.proficient',
            'value:tool.playing_cards.proficient',
            'value:tool.three_dragon_ante_set.proficient'
          ]
        },
      ],
      // D&D 2024 Character Rules A1 -- the former literal duplicate of Skilled's own nested
      // "choose 3 skills or tools" choice (see Artisan's own identical note above) is REMOVED:
      // Skilled now has its own real facet carrying this exact choice.
      originFeatSlug: 'skilled-xphb',
      grants: [
        { set: 'value:skill.history.proficient', to: true },
        { set: 'value:skill.persuasion.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.noble-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Gaming Set chosen for the tool proficiency above, Fine Clothes, Perfume, 29 GP",
            grants: [
              { kind: 'crossReference', choiceSetId: 'choice:proficiency.gaming-set.background' },
              { kind: 'item', slug: 'fine-clothes-xphb' },
              { kind: 'item', slug: 'perfume-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 2900 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'sage-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.con',
            'source:background.increase.int',
            'source:background.increase.wis'
          ]
        }
      ],
      // FEAT-OWNED SPELL ACQUISITION PHASE -- see Acolyte's own identical note above. Sage's own
      // Magic Initiate is fixed to the Wizard list (raw key: "magic initiate; wizard|xphb").
      // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- see Acolyte's own identical note above
      // for why this is `originFeatPreset`, not a `grants` entry.
      originFeatSlug: 'magic-initiate-xphb',
      originFeatPreset: {
        'choice:feat.magic-initiate.list': ['value:magic-initiate.list.3.active']
      },
      grants: [
        { set: 'value:tool.calligraphers_supplies.proficient', to: true },
        { set: 'value:skill.arcana.proficient', to: true },
        { set: 'value:skill.history.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.sage-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Quarterstaff, Calligrapher's Supplies, Book, 8 Parchment, Robe, 8 GP",
            grants: [
              { kind: 'item', slug: 'quarterstaff-xphb' },
              { kind: 'item', slug: 'calligraphers-supplies-xphb' },
              { kind: 'item', slug: 'book-xphb' },
              { kind: 'item', slug: 'parchment-xphb', quantity: 8 },
              { kind: 'item', slug: 'robe-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 800 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'sailor-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.str',
            'source:background.increase.dex',
            'source:background.increase.wis'
          ]
        }
      ],
      originFeatSlug: 'tavern-brawler-xphb',
      grants: [
        { set: 'value:tool.navigators_tools.proficient', to: true },
        { set: 'value:skill.acrobatics.proficient', to: true },
        { set: 'value:skill.perception.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.sailor-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Dagger, Navigator's Tools, Rope, Traveler's Clothes, 20 GP",
            grants: [
              { kind: 'item', slug: 'dagger-xphb' },
              { kind: 'item', slug: 'navigators-tools-xphb' },
              { kind: 'item', slug: 'rope-xphb' },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 2000 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'scribe-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.dex',
            'source:background.increase.int',
            'source:background.increase.wis'
          ]
        },
      ],
      // D&D 2024 Character Rules A1 -- the former literal duplicate of Skilled's own nested
      // "choose 3 skills or tools" choice (see Artisan's own identical note above) is REMOVED:
      // Skilled now has its own real facet carrying this exact choice.
      originFeatSlug: 'skilled-xphb',
      grants: [
        { set: 'value:tool.calligraphers_supplies.proficient', to: true },
        { set: 'value:skill.investigation.proficient', to: true },
        { set: 'value:skill.perception.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.scribe-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Calligrapher's Supplies, Fine Clothes, Lamp, Oil, Parchment, 23 GP",
            grants: [
              { kind: 'item', slug: 'calligraphers-supplies-xphb' },
              { kind: 'item', slug: 'fine-clothes-xphb' },
              { kind: 'item', slug: 'lamp-xphb' },
              { kind: 'item', slug: 'oil-xphb' },
              { kind: 'item', slug: 'parchment-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 2300 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'soldier-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.str',
            'source:background.increase.dex',
            'source:background.increase.con'
          ]
        },
        {
          choiceSet: 'choice:proficiency.gaming-set.background',
          count: 1,
          from: [
            'value:tool.dice_set.proficient',
            'value:tool.dragonchess_set.proficient',
            'value:tool.playing_cards.proficient',
            'value:tool.three_dragon_ante_set.proficient'
          ]
        },
      ],
      originFeatSlug: 'savage-attacker-xphb',
      grants: [
        { set: 'value:skill.athletics.proficient', to: true },
        { set: 'value:skill.intimidation.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.soldier-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) Spear, Shortbow, 20 Arrows, Gaming Set chosen for the tool proficiency above, Healer's Kit, Quiver, Traveler's Clothes, 14 GP",
            grants: [
              { kind: 'item', slug: 'spear-xphb' },
              { kind: 'item', slug: 'shortbow-xphb' },
              { kind: 'item', slug: 'arrows-20-xphb' },
              { kind: 'crossReference', choiceSetId: 'choice:proficiency.gaming-set.background' },
              { kind: 'item', slug: 'healers-kit-xphb' },
              { kind: 'item', slug: 'quiver-xphb' },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1400 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    },
    'wayfarer-xphb': {
      choices: [
        {
          choiceSet: 'choice:background.ability-distribution',
          count: 3,
          from: [
            'source:background.increase.dex',
            'source:background.increase.wis',
            'source:background.increase.cha'
          ]
        }
      ],
      originFeatSlug: 'lucky-xphb',
      grants: [
        { set: 'value:tool.thieves_tools.proficient', to: true },
        { set: 'value:skill.insight.proficient', to: true },
        { set: 'value:skill.stealth.proficient', to: true }
      ],
      startingEquipment: {
        id: 'choice:equipment.starting.wayfarer-xphb',
        bundles: [
          {
            id: 'A',
            label: "(A) 2 Daggers, Thieves' Tools, Gaming Set, Bedroll, 2 Pouches, Traveler's Clothes, 16 GP",
            grants: [
              { kind: 'item', slug: 'dagger-xphb', quantity: 2 },
              { kind: 'item', slug: 'thieves-tools-xphb' },
              { kind: 'custom', name: 'Gaming Set' },
              { kind: 'item', slug: 'bedroll-xphb' },
              { kind: 'item', slug: 'pouch-xphb', quantity: 2 },
              { kind: 'item', slug: 'travelers-clothes-xphb' },
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 1600 }
            ]
          },
          {
            id: 'B',
            label: "(B) 50 GP",
            grants: [
              { kind: 'currency', denominationId: DND5E_2024_CURRENCY_DENOMINATION, amount: 5000 }
            ]
          }
        ]
      }
    }
  },

  species: {
    // AASIMAR CREATION COMPLETION PHASE -- re-derived directly from races.json (XPHB), not
    // trusted from any prior forecast. Full real entry: size ['S','M'] (sizeEntry: "Medium...or
    // Small..., chosen when you select this species" -- a genuine Level-1 choice, never fixed);
    // speed 30; darkvision 60; resist ['necrotic','radiant'] (plain strings, never `{choose:...}`
    // -- fixed, not a decision); additionalSpells a single unnamed block (`known.1: ['light']`,
    // ability 'cha') -- Light Bearer's own source wording: "You know the Light cantrip. Charisma is
    // your spellcasting ability for it," a true fixed grant, no "of your choice" clause at all.
    // Healing Hands (a Magic action, PBx d4 healing, 1/Long Rest) and Celestial Revelation
    // (Level 3+, "choose the option EACH TIME you transform" -- the corpus's own words, confirming
    // this is a PER-USE runtime choice, never a persistent build decision) are deliberately NOT
    // authored here -- see this file's own header comment block below for the full reasoning.
    'aasimar-xphb': {
      // The size choice: the SAME "choose 1 of 2 named fixed options, each a literal Value id"
      // shape `choice:skill.proficiency` already uses everywhere (no activate-source needed --
      // size is a plain fact, not a Source). New, generic, reusable ChoiceSet `choice:species.size`
      // (packages/eldra-dnd5e-2024/definitions.json) -- any future species with a size choice
      // reuses it verbatim; never Aasimar-specific. Discovery (`detectSpeciesDecisions`,
      // mandatory-decisions.ts) gained a matching `size-choice` family this phase, mirroring how
      // every other real corpus shape earns its own discovery case.
      choices: [
        {
          choiceSet: 'choice:species.size',
          count: 1,
          from: ['value:size.medium', 'value:size.small']
        }
      ],
      // Darkvision/Speed/Resistance Value vocabulary did not exist anywhere in the package before
      // this phase (confirmed directly: zero species facet -- including the 3 already-available
      // ones, Dwarf/Halfling/Orc -- declares any of the three, even though Dwarf's own real corpus
      // has a fixed Poison resistance of its own). Authored here as plain, generic, reusable
      // Values (the exact same declarative pattern as value:hit_points.hit_die_size: a bare
      // number/boolean Value, set via an ordinary facet grant -- never a new ChoiceSet/Source
      // mechanism), so any future species/feat/homebrew with the identical fixed fact reuses them
      // with zero new primitive. Only the two damage types Aasimar's own corpus actually needs are
      // declared; more are added only when a real corpus fact needs them, the same incremental
      // discipline every language/skill Value in this package already follows.
      grants: [
        { set: 'value:sense.darkvision', to: 60 },
        { set: 'value:speed.walking', to: 30 },
        { set: 'value:resistance.necrotic.granted', to: true },
        { set: 'value:resistance.radiant.granted', to: true }
      ],
      // Light Bearer: a true fixed grant, the exact FixedSpellGrant shape Telekinetic's/
      // Telepathic's own single always-known/-prepared spell already uses (FEAT-OWNED SPELL
      // ACQUISITION PHASE) -- flag 'known' because the real text says "You know," never "you
      // always have... prepared." Casting ability (Charisma) is the SAME deferred Milestone-B/
      // runtime concern as every other feat/species-owned fixed spell this project has authored
      // so far -- never silently invented.
      fixedSpellGrants: [
        { slug: 'light-xphb', flag: 'known' }
      ]
      // NOT authored (re-derived directly, not assumed):
      //  - Healing Hands: a runtime action with a Long-Rest-recharge resource, the SAME deferred
      //    category as Savage Attacker's/Lucky's own per-rest reroll -- Milestone B, not a build
      //    decision; no mandatory decision exists for it.
      //  - Celestial Revelation (Level 3+): the real corpus text is explicit -- "choose the
      //    option EACH TIME you transform" -- a PER-USE runtime choice, never a persistent build
      //    decision. Nothing is authored for it: no mandatory decision exists, so there is
      //    nothing for Milestone A to represent. (Species facets also have no progression/
      //    level-gating authoring at all today -- irrelevant here since there is no decision to
      //    gate, but flagged honestly rather than silently worked around.)
    },
    // PURE-AUTHORING SPECIES SWEEP -- re-derived directly from races.json (XPHB). Draconic
    // Ancestry: "Choose the kind of dragon from the Draconic Ancestors table. Your choice affects
    // your Breath Weapon and Damage Resistance traits as well as your appearance" -- 10 named
    // dragons (the table's own rows), collapsing to 5 UNIQUE damage types (confirmed directly:
    // acid/lightning/fire/poison/cold), a genuine PERMANENT Level-1 choice ("choose 1 of N named
    // options"), structurally identical to Divine Order's/Primal Order's own `choice:class
    // .feature-option` -- reused under a second, owner-agnostic Definition id,
    // `choice:species.feature-option` (same shape, `effect: 'activate-source'`; the "class." id
    // would be misleading authored from a species facet, so a second Definition was added rather
    // than renaming the existing public one). Each of the 10 named Sources carries its own real
    // damage-type consequence as a Source `modifiers` entry (boolean `phase: 'set'`, the exact,
    // already-proven mechanism `source:divine-order.protector`'s own proficiency grant uses) --
    // the player chooses ancestry ONCE; Breath Weapon's damage type is a LINKED consequence of
    // that single choice, never a second mandatory decision. Breath Weapon itself (a replace-one-
    // attack action, PBx/Long Rest, scaling damage by level) and Draconic Flight (Level 5+, a
    // Bonus Action, 1/Long Rest, NO choice of any kind) are both runtime actions with no build
    // decision -- confirmed directly from the corpus text, deferred Milestone B, the same posture
    // as Aasimar's own Healing Hands/Draconic Flight-shaped traits.
    'dragonborn-xphb': {
      choices: [
        {
          choiceSet: 'choice:species.feature-option',
          count: 1,
          from: [
            'source:draconic-ancestry.black', 'source:draconic-ancestry.blue', 'source:draconic-ancestry.brass',
            'source:draconic-ancestry.bronze', 'source:draconic-ancestry.copper', 'source:draconic-ancestry.gold',
            'source:draconic-ancestry.green', 'source:draconic-ancestry.red', 'source:draconic-ancestry.silver',
            'source:draconic-ancestry.white'
          ]
        }
      ],
      grants: [
        { set: 'value:size.medium', to: true },
        { set: 'value:speed.walking', to: 30 },
        { set: 'value:sense.darkvision', to: 60 }
      ]
    },
    // PURE-AUTHORING SPECIES SWEEP -- Elven Lineage re-derived from the REAL 2024 prose directly
    // (not the raw `additionalSpells` structured field alone, which under-describes High Elf's own
    // replacement clause): "Choose a lineage from the Elven Lineages table. You gain the level 1
    // benefit of that lineage... Intelligence, Wisdom, or Charisma is your spellcasting ability for
    // the spells you cast with this trait (choose the ability when you select the lineage)." TWO
    // separate Level-1 decisions: the lineage pick itself (Drow/High Elf/Wood Elf, permanent,
    // `choice:species.feature-option` reused again) and a NESTED casting-ability pick, unconditional
    // on the species (every lineage needs it) -- a new, generic, reusable `choice:species.innate
    // -spellcasting-ability` ChoiceSet (the exact `choice:species.size` shape: a literal Value id
    // per option, no activate-source), with 3 new, owner-agnostic Values
    // (`value:innate-spellcasting.ability.int/wis/cha` -- deliberately NOT `value:spellcasting
    // .ability.*`, which already means "my CLASS's own casting ability"; these are a separate real
    // fact, "my TRAIT's own casting ability," per the corpus's own wording). Each lineage's own
    // Level-1 grant is a TRUE FIXED cantrip (re-verified: Drow's Dancing Lights, Wood Elf's
    // Druidcraft, and -- re-reading the prose precisely -- High Elf's own Prestidigitation too; the
    // "replace that cantrip" clause is an OPTIONAL daily swap, classified OPTIONAL, never
    // implemented, the same posture this project already gives every other replacement clause) --
    // via `fixedSpellGrants`, each gated `requiresActive` on its own lineage Source (the ONE new,
    // small, package-authored field this phase adds to `FixedSpellGrant`, reusing the IDENTICAL
    // `isGateActive` evaluator `SpellRequirement.requiresActive` already uses -- see that field's
    // own header, app/lib/content-rules/types.ts). Levels 3/5 (a further FIXED, no-choice spell per
    // lineage, "always have that spell prepared," cast once free/Long Rest or via a real slot) are a
    // genuine PROGRESSION-TIME fact, but species facets have no level-gating/progression authoring
    // at all today, and building one is exactly the kind of new generic capability this phase is
    // forbidden from inventing -- deliberately deferred, non-blocking (discovery collapses all of
    // Elf's spell content into ONE Level-1 `variant-choice` decision, so this never blocks creation).
    // Drow's own Darkvision-120 range increase and Wood Elf's own Speed-35 increase are NOT
    // authored either: both would need a numeric Source `modifiers` override on top of an already-
    // granted base Value, a shape with zero existing precedent anywhere in this package (every real
    // `phase: 'set'` Source modifier today is boolean) -- rather than invent an unproven numeric-
    // override mechanism, both are left as the species' own fixed base (Darkvision 60, Speed 30),
    // honestly reported as deferred, not silently assumed correct.
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
        },
        {
          choiceSet: 'choice:species.feature-option',
          count: 1,
          from: ['source:elven-lineage.drow', 'source:elven-lineage.high', 'source:elven-lineage.wood']
        },
        {
          choiceSet: 'choice:species.innate-spellcasting-ability',
          count: 1,
          from: ['value:innate-spellcasting.ability.int', 'value:innate-spellcasting.ability.wis', 'value:innate-spellcasting.ability.cha']
        }
      ],
      grants: [
        { set: 'value:size.medium', to: true },
        { set: 'value:speed.walking', to: 30 },
        { set: 'value:sense.darkvision', to: 60 }
      ],
      fixedSpellGrants: [
        { slug: 'dancing-lights-xphb', flag: 'known', requiresActive: ['source:elven-lineage.drow'] },
        { slug: 'prestidigitation-xphb', flag: 'known', requiresActive: ['source:elven-lineage.high'] },
        { slug: 'druidcraft-xphb', flag: 'known', requiresActive: ['source:elven-lineage.wood'] }
      ]
    },
    // PURE-AUTHORING SPECIES SWEEP -- Giant Ancestry re-derived directly: "Choose one of the
    // following benefits -- a supernatural boon from your ancestry; you can use the chosen benefit
    // a number of times equal to your Proficiency Bonus, and you regain all expended uses when you
    // finish a Long Rest." Confirmed PERMANENT (chosen once, unlike Aasimar's own per-use Celestial
    // Revelation) -- the exact `choice:species.feature-option` shape, 6 named benefits (Cloud's
    // Jaunt, Fire's/Frost's/Storm's X, Hill's Tumble, Stone's Endurance), ZERO spell content, ZERO
    // nested ability choice. None of the 6 benefits grants any currently fixed-representable state
    // (teleport, on-hit damage, a condition, a reaction) -- all 6 are per-use runtime combat
    // effects, so every Source's own `modifiers` is empty; the choice ITSELF is the entire Milestone
    // -A decision. Large Form (Level 5+, a Bonus Action, no choice, 1/Long Rest) and Powerful Build
    // (passive, no choice) need no authoring, the same posture as every other runtime/passive trait.
    'goliath-xphb': {
      choices: [
        {
          choiceSet: 'choice:species.feature-option',
          count: 1,
          from: [
            'source:giant-ancestry.clouds-jaunt', 'source:giant-ancestry.fires-burn', 'source:giant-ancestry.frosts-chill',
            'source:giant-ancestry.hills-tumble', 'source:giant-ancestry.stones-endurance', 'source:giant-ancestry.storms-thunder'
          ]
        }
      ],
      grants: [
        { set: 'value:size.medium', to: true },
        { set: 'value:speed.walking', to: 35 }
      ]
    },
    // PURE-AUTHORING SPECIES SWEEP -- Gnomish Lineage re-derived directly: "Choose one of the
    // following options; whichever one you choose, Intelligence, Wisdom, or Charisma is your
    // spellcasting ability for the spells you cast with this trait (choose the ability when you
    // select the lineage)." The EXACT same two-decision shape as Elf (lineage pick + the SAME
    // shared `choice:species.innate-spellcasting-ability`, reused verbatim, never Gnome- or
    // Elf-specific). Forest Gnome: a fixed cantrip (Minor Illusion, 'known') + a fixed,
    // always-prepared spell (Speak with Animals, 'prepared' -- "you also always have [it]
    // prepared," the identical wording convention Magic Initiate's own fixed Level-1 spell already
    // uses) -- both gated `requiresActive` on the Forest-Gnome Source. The PBx/Long-Rest free-cast-
    // without-a-slot resource and ordinary slot-casting are both Milestone B, deferred. Rock Gnome:
    // two fixed cantrips (Mending, Prestidigitation), gated on the Rock-Gnome Source; its own Tiny-
    // clockwork-device crafting mechanic is NOT a spell-acquisition shape at all (an item-creation
    // mechanic), genuinely unrepresented but Milestone B, never a blocker for the lineage choice or
    // its spell content.
    'gnome-xphb': {
      choices: [
        {
          choiceSet: 'choice:species.feature-option',
          count: 1,
          from: ['source:gnomish-lineage.forest-gnome', 'source:gnomish-lineage.rock-gnome']
        },
        {
          choiceSet: 'choice:species.innate-spellcasting-ability',
          count: 1,
          from: ['value:innate-spellcasting.ability.int', 'value:innate-spellcasting.ability.wis', 'value:innate-spellcasting.ability.cha']
        }
      ],
      grants: [
        { set: 'value:size.small', to: true },
        { set: 'value:speed.walking', to: 30 },
        { set: 'value:sense.darkvision', to: 60 }
      ],
      fixedSpellGrants: [
        { slug: 'minor-illusion-xphb', flag: 'known', requiresActive: ['source:gnomish-lineage.forest-gnome'] },
        { slug: 'speak-with-animals-xphb', flag: 'prepared', requiresActive: ['source:gnomish-lineage.forest-gnome'] },
        { slug: 'mending-xphb', flag: 'known', requiresActive: ['source:gnomish-lineage.rock-gnome'] },
        { slug: 'prestidigitation-xphb', flag: 'known', requiresActive: ['source:gnomish-lineage.rock-gnome'] }
      ]
    },
    // TIEFLING SPECIES COMPLETION -- re-derived directly from races.json (XPHB), not trusted from
    // any prior forecast. Full real entry: size ['S','M'] (the SAME "chosen when you select this
    // species" shape Aasimar/Human already have -- reuses choice:species.size verbatim); speed 30;
    // darkvision 60; resist `{choose: {from: [poison, necrotic, fire]}}` -- the STRUCTURED field's
    // own "choice" shape is really the SAME single Fiendish Legacy pick the prose describes (never
    // a second, separate decision -- `impl:species-feature-option` already matches BOTH
    // `damage-type-choice` and `variant-choice`, so authoring the legacy choice alone resolves
    // both discovered decisions at once, exactly as it did for Dragonborn). Fiendish Legacy:
    // "Choose a legacy from the Fiendish Legacies table. You gain the level 1 benefit... When you
    // reach character levels 3 and 5, you learn a higher-level spell... You always have that spell
    // prepared... Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you
    // cast with this trait (choose the ability when you select the legacy)" -- the EXACT Elf/Gnome
    // two-decision shape (persistent legacy pick + a nested, unconditional innate-ability pick),
    // reusing choice:species.feature-option + choice:species.innate-spellcasting-ability verbatim.
    // Otherworldly Presence ("You know the Thaumaturgy cantrip...") is a SEPARATE, legacy-
    // INDEPENDENT feature -- re-derived from the real prose, not the raw `additionalSpells`
    // structured field (which redundantly repeats Thaumaturgy inside each legacy's own block,
    // achieving the same end result but obscuring that it is unconditional) -- authored as a plain,
    // ungated `fixedSpellGrants` entry, the same "re-derive the true prose, don't just mirror the
    // structured field" discipline Elf's own High Elf entry already established.
    'tiefling-xphb': {
      choices: [
        {
          choiceSet: 'choice:species.size',
          count: 1,
          from: ['value:size.medium', 'value:size.small']
        },
        {
          choiceSet: 'choice:species.feature-option',
          count: 1,
          from: ['source:fiendish-legacy.abyssal', 'source:fiendish-legacy.chthonic', 'source:fiendish-legacy.infernal']
        },
        {
          choiceSet: 'choice:species.innate-spellcasting-ability',
          count: 1,
          from: ['value:innate-spellcasting.ability.int', 'value:innate-spellcasting.ability.wis', 'value:innate-spellcasting.ability.cha']
        }
      ],
      grants: [
        { set: 'value:speed.walking', to: 30 },
        { set: 'value:sense.darkvision', to: 60 }
      ],
      // Otherworldly Presence: unconditional, no legacy gate at all. Level-1 legacy cantrips: each
      // gated on its own legacy Source, `minLevel` omitted (defaults to 1, resolved at creation).
      // Level-3/5 legacy spells: "you always have that spell prepared" -- flag 'prepared', the same
      // wording convention Magic Initiate's/Telepathic's own fixed Level-1 spells already use --
      // each gated on its own legacy Source AND carrying the real `minLevel` this phase's new field
      // exists for, resolved ONLY once the character's own level actually reaches it (see
      // `resolveFixedSpellGrants`'s own header, app/lib/characters/spell-requirement-ownership.ts,
      // and `confirmProgression`'s own new windowed call,
      // server/utils/character-progression-plan.ts). The once-per-Long-Rest free-cast-without-a-
      // slot resource, and ordinary slot-casting, are BOTH deliberately NOT authored here -- a
      // runtime/resource concern, Milestone B, never required to represent the acquisition fact
      // honestly. Casting ability (the player's own innate-spellcasting-ability pick) is the same
      // deferred Milestone-B/runtime concern as every other feat/species-owned spell's own casting
      // ability in this project so far -- never silently invented.
      fixedSpellGrants: [
        { slug: 'thaumaturgy-xphb', flag: 'known' },
        { slug: 'poison-spray-xphb', flag: 'known', requiresActive: ['source:fiendish-legacy.abyssal'] },
        { slug: 'chill-touch-xphb', flag: 'known', requiresActive: ['source:fiendish-legacy.chthonic'] },
        { slug: 'fire-bolt-xphb', flag: 'known', requiresActive: ['source:fiendish-legacy.infernal'] },
        { slug: 'ray-of-sickness-xphb', flag: 'prepared', requiresActive: ['source:fiendish-legacy.abyssal'], minLevel: 3 },
        { slug: 'false-life-xphb', flag: 'prepared', requiresActive: ['source:fiendish-legacy.chthonic'], minLevel: 3 },
        { slug: 'hellish-rebuke-xphb', flag: 'prepared', requiresActive: ['source:fiendish-legacy.infernal'], minLevel: 3 },
        { slug: 'hold-person-xphb', flag: 'prepared', requiresActive: ['source:fiendish-legacy.abyssal'], minLevel: 5 },
        { slug: 'ray-of-enfeeblement-xphb', flag: 'prepared', requiresActive: ['source:fiendish-legacy.chthonic'], minLevel: 5 },
        { slug: 'darkness-xphb', flag: 'prepared', requiresActive: ['source:fiendish-legacy.infernal'], minLevel: 5 }
      ]
    },
    // HUMAN SPECIES COMPLETION -- re-derived directly from races.json (XPHB), not trusted from any
    // prior forecast. Full real entry: size ['S','M'] ("chosen when you select this species", the
    // SAME shape Aasimar/Tiefling already have -- reuses choice:species.size verbatim); speed 30;
    // no darkvision, no resistance. Skillful: "proficiency in one skill of your choice" -- the
    // EXACT choice:skill.proficiency shape already authored below, unchanged, confirmed sufficient
    // by this phase's own independent census (no missed nested decision). Versatile: "you gain an
    // Origin feat of your choice" -- the REAL generic mechanism this phase adds: a creation-time,
    // `fromContentCatalogue`-backed feat-selection ChoiceSet filtered to `category: 'origin'`,
    // reusing the EXACT `choice:feat.fighting-style.fs-only`-shaped precedent (Fighter's own
    // Fighting Style choice, already creation-time and catalogue-backed) -- never a Human-specific
    // feat picker. No Human-specific application code exists anywhere: a selected feat's own
    // facet (its `choices`/`spellRequirements`/`fixedSpellGrants`) activates through the SAME
    // generic acquisition pipeline a Background's fixed Origin Feat already uses (see
    // create-v2.post.ts's own `acquisitions`/`slots` widening).
    'human-xphb': {
      choices: [
        {
          choiceSet: 'choice:species.size',
          count: 1,
          from: ['value:size.medium', 'value:size.small']
        },
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
        },
        {
          choiceSet: 'choice:feat.origin-selection',
          count: 1
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
