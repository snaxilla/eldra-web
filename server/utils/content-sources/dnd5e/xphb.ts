// The Player's Handbook (2024) Source Collection Provider -- the
// architectural acceptance test for
// .github/docs/architecture/content-source-architecture.md's provider
// abstraction (§12 Step 8: "One registry entry, one provider. If this step
// touches a route, the Builder, or the publisher, stop and fix the
// architecture instead.").
//
// It does not touch a route, the Builder, or the publisher. The entire
// collection is this file: a membership predicate and a category list,
// handed to the same create5eToolsCollectionProvider srd51Provider already
// uses. Dataset traversal, importer wiring, adapter invocation, preview
// shaping, publish orchestration, availability derivation, and both
// generic routes are all reused unchanged.
//
// MEMBERSHIP: `source === 'XPHB'`, exactly as the architecture doc's §5.3
// predicted. See isEntryFromSource in 5etools-dataset.ts for why this is
// keyed on `source` rather than `edition: 'one'` -- measured against the
// real dataset, `edition` is absent on XPHB feats, spells, and most items,
// so it identifies a ruleset revision rather than a book.
//
// CATEGORIES: the same six 5etools datasets SRD 5.1 uses, in the same
// order. XPHB genuinely populates all six (unlike a future XMM, which
// would be monsters-only) so no category list narrowing is needed here --
// and per this task's own NON-GOALS, provider-declared dynamic categories
// in the Builder remain Step 6 work, untouched.

import { create5eToolsCollectionProvider } from './5etools-collection'
import { CATEGORY_LABELS, DATASETS, isEntryFromSource } from './5etools-dataset'
import { loadSubclassCandidatesFor } from './subclasses'
import {
  loadClassFeatureOptionCandidatesFor,
  loadClassOptionCandidatesFor,
  loadSpeciesFeatureOptionCandidatesFor
} from './feature-options'
import { slugify } from '../../../../app/lib/importers/5etools-feature-options'
import type { SourceCategoryLoadResult } from '../types'

const VOCABULARY = 'dnd5e.2024'

// COMPLETE OPTION-DESCRIPTION COVERAGE. Every Identity/Class `definitionId` this provider
// publishes, derived structurally per family below and verified byte-for-byte (this phase's own
// tests/server/utils/content-sources-feature-options.test.ts) against the real, already
// hand-authored ids in packages/eldra-dnd5e-2024/definitions.json -- never guessed, never
// inferred from prose. Species families use `choice:species.feature-option`'s own `source:*`
// ids; class families use `choice:class.feature-option`/`choice:class.accumulating-option`'s own
// `source:*`/`value:*` ids (app/lib/content-rules/dnd5e-2024.ts). `choice:species.size` and
// `choice:species.innate-spellcasting-ability` are REAL Identity-stage ChoiceSets too, but their
// options (`value:size.medium/.small`, `value:innate-spellcasting.ability.int/wis/cha`) are bare
// literal picks with no corpus prose beyond the option's own name -- deliberately NOT given a
// Feature Option entry here; see this phase's own final report for why that is a documented
// non-gap, not an oversight.
//
// Elf's own three ids drop the common "Elf" suffix ("High Elf" -> `.high`, "Wood Elf" -> `.wood`)
// that every sibling species' id formula keeps -- a real, verified fact about THIS corpus's
// existing hand-authored ids (packages/eldra-dnd5e-2024/definitions.json), not a convenience this
// phase invented, so it is spelled out explicitly here rather than folded into a shared formula
// that would silently mis-derive it.
function stripElfSuffix(name: string): string {
  return name.replace(/\s+Elf$/i, '')
}

async function loadFeatureOptionCandidates(membership: (entry: any) => boolean): Promise<SourceCategoryLoadResult> {
  const loaders = [
    // SPECIES -- choice:species.feature-option (24 real Definition ids across 5 species).
    loadSpeciesFeatureOptionCandidatesFor(
      'XPHB', 'Dragonborn', 'Draconic Ancestry', ['Breath Weapon', 'Damage Resistance'],
      (name) => `source:draconic-ancestry.${slugify(name)}`, VOCABULARY
    ),
    loadSpeciesFeatureOptionCandidatesFor(
      'XPHB', 'Elf', 'Elven Lineage', [],
      (name) => `source:elven-lineage.${slugify(stripElfSuffix(name))}`, VOCABULARY
    ),
    loadSpeciesFeatureOptionCandidatesFor(
      'XPHB', 'Goliath', 'Giant Ancestry', [],
      (name) => `source:giant-ancestry.${slugify(name)}`, VOCABULARY
    ),
    loadSpeciesFeatureOptionCandidatesFor(
      'XPHB', 'Gnome', 'Gnomish Lineage', [],
      (name) => `source:gnomish-lineage.${slugify(name)}`, VOCABULARY
    ),
    loadSpeciesFeatureOptionCandidatesFor(
      'XPHB', 'Tiefling', 'Fiendish Legacy', [],
      (name) => `source:fiendish-legacy.${slugify(name)}`, VOCABULARY
    ),
    // CLASS -- choice:class.accumulating-option (Warlock invocations) and
    // choice:class.feature-option (Cleric's Divine Order, Druid's Primal Order).
    loadClassOptionCandidatesFor(
      'XPHB', ['Armor of Shadows', 'Eldritch Mind', 'Pact of the Blade', 'Pact of the Chain', 'Pact of the Tome'],
      (name) => `value:invocation.${slugify(name, '_')}.known`, VOCABULARY
    ),
    loadClassFeatureOptionCandidatesFor(
      'class-cleric.json', 'XPHB', ['Protector', 'Thaumaturge'],
      (name) => `source:divine-order.${slugify(name)}`, 'Divine Order'
    ),
    loadClassFeatureOptionCandidatesFor(
      'class-druid.json', 'XPHB', ['Magician', 'Warden'],
      (name) => `source:primal-order.${slugify(name)}`, 'Primal Order'
    )
  ]

  const results = await Promise.all(loaders.map((loader) => loader(membership)))
  return {
    candidates: results.flatMap((result) => result.candidates),
    warnings: results.flatMap((result) => result.warnings)
  }
}

export const xphbProvider = create5eToolsCollectionProvider({
  collectionKey: 'xphb',
  label: "Player's Handbook (2024)",
  // rules-package-architecture.md Step 5. XPHB is the first -- and, today,
  // only -- collection whose content carries hand-authored Rules Facets, so
  // it is the only provider that names a vocabulary. Adding one to another
  // collection is this one line plus a corpus in app/lib/content-rules.
  vocabulary: VOCABULARY,
  membership: isEntryFromSource('XPHB'),
  categories: [
    ...DATASETS.map((key) => ({ key, label: CATEGORY_LABELS[key], datasetKey: key })),
    // Character Progression Phase 1C -- 'subclasses' is a seventh category,
    // added here rather than to the shared `DATASETS` constant so SRD 5.1
    // and XDMG do not silently gain a subclasses category too (neither has
    // been audited for subclass source-shape compatibility, and this task's
    // vertical slice is XPHB only). Uses `loadCandidates` because subclasses
    // need a different membership predicate than every other category in
    // this same collection -- see subclasses.ts's own header.
    { key: 'subclasses', label: CATEGORY_LABELS.subclasses, loadCandidates: loadSubclassCandidatesFor('XPHB', VOCABULARY) },
    // Character Creator V3 -- Selected Option Explanations. A ninth category, same posture as
    // 'subclasses' above: real prose for every currently offered Identity/Class option this phase
    // can author (COMPLETE OPTION-DESCRIPTION COVERAGE -- see loadFeatureOptionCandidates above
    // for the full species/class inventory and the two literal-pick ChoiceSets deliberately left
    // without an entry).
    { key: 'feature-options', label: 'Feature Options', loadCandidates: loadFeatureOptionCandidates }
  ]
})
