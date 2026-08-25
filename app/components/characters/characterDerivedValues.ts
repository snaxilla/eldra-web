// The client-side shape of the Character Rules Projection --
// rules-package-architecture.md §11.3.
//
// Extracted into a plain module beside the component for the same reason
// characterBuilderSelection.ts was: a `<script setup>` block cannot export a
// type, so a shape shared between a page and its component needs a real
// module. Declaring it twice is what TypeScript rejects, and rightly -- two
// copies of one contract drift.
//
// This mirrors `DerivedValue` in server/utils/character-derived.ts, which is
// the authority. It is restated rather than imported because app code must
// not import from server/utils: that module reaches Directus and the
// evaluator, neither of which belongs in a browser bundle. The restatement
// is deliberately minimal -- identity, category, tags, and the value -- and
// a page or component that needs more should get it from the endpoint, not
// by widening this.

import type { RuleCategory } from '~/lib/rules/types'

// `value` is `unknown` on purpose. The engine returns a `RuleValue` union
// (number | string | boolean | array | DiceSpec | RulesError), and a
// renderer that narrowed it here would be deciding what it is allowed to
// display -- which is exactly the game knowledge §13.1 keeps out of the
// sheet. It is narrowed at the point of rendering instead.
export type DerivedValue = {
  id: string
  label?: string
  category: RuleCategory
  tags?: string[]
  value?: unknown
  error?: string
}

// One declared Collection's SLOT metadata -- never its items. The item
// flags (equipped, attuned) are already shown by CharacterInventoryPanel.vue,
// which reads them from Character Assembly's own inventory join; showing
// them a second time from this endpoint would be a second source of truth
// for the same fact. This mirrors `server/utils/character-derived.ts`'s own
// `DerivedCollection`, restated here for the same reason `DerivedValue` is:
// app code must not import from server/utils.
export type DerivedCollection = {
  id: string
  label?: string
  category: RuleCategory
  slots: Array<{ id: string; capacity: number }>
}

// The Table counterpart of DerivedCollection above -- see
// server/utils/character-derived.ts's own `DerivedTable` for why rows are
// exposed directly rather than through `evaluate()`. Restated here for the
// same app/server boundary reason every other type in this file is.
export type DerivedTable = {
  id: string
  label?: string
  category: RuleCategory
  key: { valueType: string; match: string }
  columns: Array<{ key: string; valueType: string }>
  rows: Array<Record<string, unknown>>
}

export type DerivedCharacterView = {
  packageId: string
  packageVersion: string
  byCategory: Partial<Record<RuleCategory, DerivedValue[]>>
  collections: DerivedCollection[]
  tables: DerivedTable[]
  pendingChoices: Array<{ slot: string; count: number }>
}

export type DerivedCharacterResponse =
  | { available: true; derived: DerivedCharacterView }
  | { available: false; reason: string; message?: string }

// The categories the Character Sheet renders, in reading order.
//
// Selecting by CATEGORY rather than by Definition ID is what keeps the sheet
// game-agnostic (§13.2: "Sheet regions address Rule Categories"). A package
// that declares no `core.skills` definitions produces no skills region --
// visible degradation, no configuration, no per-system code.
//
// Later phases add rows here. They add no logic.
export const DERIVED_SHEET_REGIONS: ReadonlyArray<{ category: RuleCategory; label: string }> = [
  { category: 'core.abilities', label: 'Abilities' },
  { category: 'core.proficiency', label: 'Proficiency' },
  { category: 'core.defenses', label: 'Defenses' },
  { category: 'core.saves', label: 'Saving Throws' },
  { category: 'core.skills', label: 'Skills' },
  { category: 'equipment', label: 'Equipment' },
  { category: 'spellcasting', label: 'Spellcasting' }
]

// `core.health` is deliberately NOT one of the regions above. Unlike every
// other category here, it mixes derived read-only summaries (Maximum HP,
// Hit Dice total/available) with values that are ALSO independently
// editable (Current HP, Temporary HP, Hit Dice spent, Death Saves) through
// CharacterHealthPanel.vue. Rendering the whole category generically would
// show the editable fields twice, through two different paths -- the exact
// "second source of truth" `character-derived.ts`'s own `DerivedCollection`
// note already warns against for Equipment's item list. This helper reads
// ONLY the specific read-only summaries the Health panel needs, by id, and
// nothing that panel already lets the player see (and change) directly.
export function findDerivedNumber(
  byCategory: Partial<Record<RuleCategory, DerivedValue[]>>,
  category: RuleCategory,
  id: string
): number | null {
  const entry = (byCategory[category] ?? []).find((candidate) => candidate.id === id)
  return typeof entry?.value === 'number' ? entry.value : null
}

// Mirrors findDerivedNumber exactly, for a boolean Value -- the Spellcasting
// System's `value:spellcasting.is_caster` (and any future per-character
// derived flag a Sheet needs to read directly rather than render through the
// generic `byCategory` region, the same "second source of truth" reasoning
// findDerivedNumber's own note already gives for Health).
export function findDerivedBoolean(
  byCategory: Partial<Record<RuleCategory, DerivedValue[]>>,
  category: RuleCategory,
  id: string
): boolean | null {
  const entry = (byCategory[category] ?? []).find((candidate) => candidate.id === id)
  return typeof entry?.value === 'boolean' ? entry.value : null
}
