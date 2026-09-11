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

// ---------------------------------------------------------------------------
// WHERE A CATEGORY RENDERS -- Desktop IA pass (D&D Beyond reference layout),
// corrected by Header Phase H1
// ---------------------------------------------------------------------------
// The desktop sheet gives several of the categories above a bespoke home
// instead of the generic `CharacterDerivedPanel` label/value list: saves a
// two-up grid in the left region, skills a persistent table in the center
// region, proficiency bonus a vitals cell in the command center (see
// CharacterVitalsBar.vue's own `proficiencyBonus` prop). Abilities are
// DELIBERATELY NOT one of these yet -- H1 removed the command center's
// ability tiles and this phase does not give them a new home; they still
// render via the Character tab's pre-existing `CharacterAbilityScoresPanel`
// until a future phase builds the left region's own Ability Grid.
//
// Everything without a bespoke home still renders generically, which is
// what keeps a package that declares categories Eldra has never heard of
// visible rather than dropped.
//
// These are CATEGORY constants, never Definition ids -- §13.2's "Sheet
// regions address Rule Categories" is the whole reason a non-D&D package
// renders here without a code change, and naming an id in this file would
// be the first step to losing that.
export const ABILITIES_CATEGORY: RuleCategory = 'core.abilities'
export const SAVES_CATEGORY: RuleCategory = 'core.saves'
export const SKILLS_CATEGORY: RuleCategory = 'core.skills'

// Categories that render in the desktop left region (reference data read
// constantly, changed almost never) rather than in the Character tab's
// generic Derived section. `core.proficiency` is NOT one of these --
// Header Phase H1's own "Proficiency Bonus should exist only once" rule:
// it already has a bespoke home (the command center's vitals row), so
// giving it a second, generic rendering here would be exactly the
// duplication that phase's REMOVE DUPLICATION section forbids.
export const REFERENCE_CATEGORIES: readonly RuleCategory[] = ['core.defenses']

// Categories that have a bespoke home and must therefore NOT also appear in
// the generic Derived section -- showing the same fact twice through two
// different paths is the "second source of truth" this module's own
// findDerivedNumber note already warns against for Health. `core.proficiency`
// is listed explicitly (rather than folded into REFERENCE_CATEGORIES,
// above) because its bespoke home is the command center, not the left
// region -- it still needs excluding from the generic section, just not by
// way of appearing in the reference one.
export const HOMED_CATEGORIES: readonly RuleCategory[] = [
  ABILITIES_CATEGORY,
  SAVES_CATEGORY,
  SKILLS_CATEGORY,
  'core.proficiency',
  ...REFERENCE_CATEGORIES
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

// How a single derived value reads on screen. Signed ONLY when the package
// tags it as a modifier-like value -- "+2" and "2" mean different things on
// a character sheet, and the TAG makes that a package-declared fact rather
// than a guess about ids. Lifted out of CharacterDerivedPanel.vue unchanged
// when the skills/saves/ability tables became additional consumers: one
// copy of this rule, four renderers.
const SIGNED_TAGS = ['ability-modifier', 'proficiency', 'save', 'skill']

export function formatDerivedValue(entry: DerivedValue): string {
  const value = entry.value

  if (typeof value === 'number') {
    const signed = (entry.tags ?? []).some((tag) => SIGNED_TAGS.includes(tag))
    return signed && value >= 0 ? `+${value}` : String(value)
  }

  if (typeof value === 'string') return value
  if (value === undefined || value === null) return '—'
  return String(value)
}

// ---------------------------------------------------------------------------
// GROUPING DERIVED VALUES THAT DESCRIBE THE SAME THING
// ---------------------------------------------------------------------------
// A character sheet reads "Stealth +9 (proficient)" as ONE row, but the
// engine emits it as two independent Values, and "Dexterity 20 (+5)" as two
// more. Rendering each Value on its own line is exactly the split-modifier
// problem the Beautification Pass §2.3.2 named: the two halves of one fact
// end up in different places.
//
// This groups them back together WITHOUT knowing what any of them mean. It
// reads two things, both structural rather than game-specific:
//
//   1. Id shape. Packages already name related Values as a stem plus a
//      suffix -- `<stem>.bonus` / `<stem>.proficient` for a pair of
//      siblings, or `<an existing Value's id>.mod` for a value derived from
//      another. Both are matched here by string structure alone; no id is
//      ever named, matched against a list, or parsed for meaning.
//   2. Value type. Which sibling is the number and which is the flag is
//      decided by `typeof`, never by reading a suffix -- a package that
//      calls its flag `.trained` instead of `.proficient` groups correctly
//      with no change here.
//
// Everything a caller then displays (the label, the qualifier, the number,
// the flag) came off the engine. NOTHING IS COMPUTED: no sum, no sign
// change, no default. A group with only half its parts renders only that
// half, which is the same "absence is legal and visible" posture the rest
// of this module already takes.
export type DerivedGroup = {
  // Stable identity for `:key` -- the shared stem, or the lone entry's id.
  key: string
  label: string
  // The `x:y` tag families packages use to say "this belongs to that" --
  // e.g. a skill tagged `ability:dex` is keyed off Dexterity. Rendered as a
  // column by the skills/saves tables; `null` when the package declares no
  // such tag, in which case the column simply stays empty.
  qualifier: string | null
  // The entry whose id IS the group key, when one exists (a parent Value
  // that other Values hang off, e.g. an ability score beside its modifier).
  primary: DerivedValue | null
  // Number-valued entries, `primary` first when it is itself a number.
  numbers: DerivedValue[]
  // Boolean-valued entries (proficiency/training flags).
  flags: DerivedValue[]
  error: string | null
}

// The id minus its last `.`-delimited segment, or '' when it has none.
function idStem(id: string): string {
  const lastDot = id.lastIndexOf('.')
  return lastDot > 0 ? id.slice(0, lastDot) : ''
}

function qualifierOf(entries: DerivedValue[]): string | null {
  for (const entry of entries) {
    for (const tag of entry.tags ?? []) {
      const colon = tag.indexOf(':')
      if (colon > 0) return tag.slice(colon + 1)
    }
  }
  return null
}

export function groupDerivedValues(entries: readonly DerivedValue[]): DerivedGroup[] {
  const ids = new Set(entries.map((entry) => entry.id))

  // How many entries share each stem -- distinguishes a real sibling pair
  // (`.bonus`/`.proficient`, two entries under one stem) from an entry that
  // merely happens to contain a dot.
  const stemCounts = new Map<string, number>()
  for (const entry of entries) {
    const stem = idStem(entry.id)
    if (stem) stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1)
  }

  function groupKeyFor(entry: DerivedValue): string {
    const stem = idStem(entry.id)
    if (!stem) return entry.id
    // A Value hanging off another Value that actually exists (`.mod`).
    if (ids.has(stem)) return stem
    // Siblings sharing a stem that is not itself a Value (`.bonus`/`.proficient`).
    if ((stemCounts.get(stem) ?? 0) > 1) return stem
    return entry.id
  }

  const order: string[] = []
  const buckets = new Map<string, DerivedValue[]>()

  for (const entry of entries) {
    const key = groupKeyFor(entry)
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(entry)
  }

  return order.map((key) => {
    const members = buckets.get(key) ?? []
    const primary = members.find((entry) => entry.id === key) ?? null

    const numbers = members.filter((entry) => typeof entry.value === 'number')
    // `primary` leads when it is itself a number, so a caller can rely on
    // numbers[0] being "the parent value" and the rest being derived from it.
    numbers.sort((a, b) => Number(b.id === key) - Number(a.id === key))

    const flags = members.filter((entry) => typeof entry.value === 'boolean')
    const errored = members.find((entry) => entry.error)

    return {
      key,
      label: primary?.label || numbers[0]?.label || members[0]?.label || key,
      qualifier: qualifierOf(members),
      primary,
      numbers,
      flags,
      error: errored?.error ?? null
    }
  })
}
