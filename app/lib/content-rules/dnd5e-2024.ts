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
// choice. Both are in scope and both are authored.
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

import type { RulesFacetCorpus } from './types'

// Keyed by the `entityType` the importer writes, then by `slug`
// (`slugify(name-source)`), which is what a Character's stored choice
// records and what Character Assembly re-resolves on.
export const DND5E_2024_RULES_FACETS: RulesFacetCorpus = {
  class: {
    'barbarian-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.con.proficient', to: true }
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
      ]
    },
    'bard-xphb': {
      grants: [
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true }
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
      ]
    },
    'cleric-xphb': {
      grants: [
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true }
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
      ]
    },
    'druid-xphb': {
      grants: [
        { set: 'value:save.int.proficient', to: true },
        { set: 'value:save.wis.proficient', to: true }
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
      ]
    },
    'fighter-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.con.proficient', to: true }
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
      ]
    },
    'monk-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.dex.proficient', to: true }
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
      ]
    },
    'paladin-xphb': {
      grants: [
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true }
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
      ]
    },
    'ranger-xphb': {
      grants: [
        { set: 'value:save.str.proficient', to: true },
        { set: 'value:save.dex.proficient', to: true }
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
      ]
    },
    'rogue-xphb': {
      grants: [
        { set: 'value:save.dex.proficient', to: true },
        { set: 'value:save.int.proficient', to: true }
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
      ]
    },
    'sorcerer-xphb': {
      grants: [
        { set: 'value:save.con.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true }
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
      ]
    },
    'warlock-xphb': {
      grants: [
        { set: 'value:save.wis.proficient', to: true },
        { set: 'value:save.cha.proficient', to: true }
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
      ]
    },
    'wizard-xphb': {
      grants: [
        { set: 'value:save.int.proficient', to: true },
        { set: 'value:save.wis.proficient', to: true }
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
          fields: { category: 'armor', slot: 'armor' }
        }
      ]
    },
    'chain-mail-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'armor', slot: 'armor' }
        }
      ]
    },
    'chain-shirt-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'armor', slot: 'armor' }
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
          fields: { category: 'armor', slot: 'armor' }
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
          fields: { category: 'armor', slot: 'armor' }
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
          fields: { category: 'armor', slot: 'armor' }
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
          fields: { category: 'armor', slot: 'armor' }
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
          fields: { category: 'armor', slot: 'armor' }
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
          fields: { category: 'armor', slot: 'armor' }
        }
      ]
    },
    'scale-mail-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'armor', slot: 'armor' }
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
          fields: { category: 'armor', slot: 'armor' }
        }
      ]
    },
    'studded-leather-armor-xphb': {
      collectionFields: [
        {
          collection: 'collection:equipment',
          fields: { category: 'armor', slot: 'armor' }
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
