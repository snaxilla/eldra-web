// Character Spellcasting -- the player-authored half of the Spellcasting
// System. Sixth module in the app/lib/characters/{ability-scores,
// rules-choices,inventory,character-notes,health}.ts family, shaped like
// Inventory in particular: an item is either a catalogue REFERENCE or a
// player-typed NAME, re-validated on read rather than trusted, and computing
// nothing.
//
// ---------------------------------------------------------------------------
// WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
// ---------------------------------------------------------------------------
// This task's own CHARACTER DATA section: "Persist only: Known spells,
// Prepared spells, Expended spell slots. Nothing else. All spellcasting
// numbers remain derived." Spellcasting Ability, Spell Save DC, Spell Attack
// Bonus, and Spell Slot progression are ALL Rules Engine output
// (packages/eldra-dnd5e-2024/definitions.json's `spellcasting` category) --
// nothing in this module names an ability, computes a modifier, or knows how
// many slots a level grants. This file has exactly two kinds of fact: which
// spells a character has learned/prepared, and how many of each spell-level
// slot are currently spent.
//
// A single `known`/`prepared` boolean pair per entry (mirroring
// StoredInventoryItem's `equipped`/`attuned` pair) serves every 2024 caster
// archetype uniformly, deliberately not modeling the RAW distinction between
// "prepares from the class list" (Wizard, Cleric, Druid, Paladin, ...) and
// "learns a fixed number of spells" (Warlock's Pact Magic) -- seeing content-
// rules/dnd5e-2024.ts's own SPELLCASTING header note for why that
// distinction, and any enforced maximum, is a deliberate, stated absence
// this pass rather than an oversight.
//
// `expendedSlots` is keyed by SLOT LEVEL as a string ('1'-'9'), a count of
// how many of that level's slots are currently spent -- not by which spell
// was cast, matching this task's own NON-GOALS ("Do NOT implement: Casting
// spells... Damage rolls... Concentration"). The same shape serves a Full or
// Half caster (several slot levels may carry a nonzero count) and a Pact
// caster (exactly one slot level ever will, since Pact Magic slots share one
// level -- itself Rules Engine output, `table:spellcasting.slots_pact`'s own
// `slot_level` column) with no special-casing here.
//
// ---------------------------------------------------------------------------
// ITEM IDENTITY: A REFERENCE, OR A NAME -- SAME RULE AS INVENTORY
// ---------------------------------------------------------------------------
// A spell is either CATALOGUE-BACKED (a `(packageId, slug)` reference
// re-resolved against the World's current catalogue on every read, exactly
// as an inventory item already is) or CUSTOM/homebrew, carrying only a name
// the player typed. See inventory.ts's own note on why both are kept: a
// character sheet that cannot record a homebrew spell is not usable at a
// real table.

import type { ContentAction } from '../content-actions'
import type { CanonicalSpellMechanics } from '../spell-mechanics'

export type SpellRef = {
  packageId: string
  slug: string
}

export type StoredSpellEntry = {
  instanceId: string
  // Present for a catalogue-backed spell; absent for a custom one.
  ref?: SpellRef
  // Present for a custom spell; absent for a catalogue-backed one, whose
  // title is read from the catalogue rather than copied here.
  name?: string
  known: boolean
  prepared: boolean
  // D&D 2024 Character Rules P3.2.1 -- SPELL REQUIREMENT PROVENANCE. Every package-authored
  // `SpellRequirement.id` (app/lib/content-rules/types.ts) this physical row's acquisition
  // satisfies. ONE row may name several (Magic Missile can be BOTH a Wizard spellbook member AND a
  // Wizard prepared spell at once -- `known: true, prepared: true, requirementIds: [spellbookId,
  // spellId]`), never two physical rows for the same spell identity.
  //
  // AUTHORITATIVE WHEN PRESENT (a non-empty array): `app/lib/characters/spell-requirements.ts`'s
  // `evaluate()` considers a tagged row a candidate ONLY for a requirement whose id appears here --
  // never inferred from level, classList, or another requirement's own legality. This is what stops
  // a real cantrip (which also carries `known: true`) from being swept into a Wizard spellbook
  // requirement's evaluation merely because both pools happen to read the same flag, and what stops
  // a future Magic-Initiate-granted cantrip (tagged with its OWN feat-requirement id) from ever
  // satisfying the Wizard CLASS cantrip requirement merely because it matches on level/classList/flag
  // too. Requirement ids are opaque, package-authored strings -- nothing here, or in `evaluate()`,
  // ever parses one for a class name or pool kind; a homebrew class authors its own ids and the exact
  // same mechanism applies with zero branching.
  //
  // ABSENT OR EMPTY means LEGACY: every row persisted before this phase, and any row a GM free-types
  // through the generic `spellcasting` PUT without this concept in mind, falls back to the PRE-P3.2.1
  // flag/level heuristic (`evaluate()`'s own documented fallback) -- the same pre-existing, honestly
  // imperfect behavior, never worse, never silently migrated. An empty array is deliberately treated
  // identically to absent (never a "tagged with nothing, invisible everywhere" state).
  //
  // An id naming a requirement NOT in the character's CURRENT requirement set (a stale tag from a
  // prior package version, or a class no longer selected) does not make the row relevant to some
  // OTHER requirement by accident -- `evaluate()`'s containment check is exact-match only. See
  // `orphanedProvenanceIdentities` for surfacing a row whose every tag is now unknown.
  requirementIds?: readonly string[]
}

export type StoredCharacterSpellcasting = {
  spells: StoredSpellEntry[]
  // Slot level ('1'-'9') -> count currently expended. An absent key means
  // zero expended, not "unknown" -- the same "absence is legal" reading
  // every stored record in this family already gives a missing field.
  expendedSlots: Record<string, number>
}

export function emptyCharacterSpellcasting(): StoredCharacterSpellcasting {
  return { spells: [], expendedSlots: {} }
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(value: unknown): string | undefined {
  const text = trimmed(value)
  return text || undefined
}

function readRef(value: unknown): SpellRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const record = value as Record<string, unknown>
  const packageId = trimmed(record.packageId)
  const slug = trimmed(record.slug)

  // A half-written reference is not a reference -- mirrors inventory.ts's
  // own readRef exactly, for the identical reason.
  if (!packageId || !slug) return undefined

  return { packageId, slug }
}

// Deterministic per-entry identity -- mirrors inventory.ts's nextInstanceId,
// same reason: a random id would make an ActorState-adjacent record differ
// on every read, which nothing in this family allows.
export function nextInstanceId(existing: readonly StoredSpellEntry[]): string {
  let highest = 0

  for (const entry of existing) {
    const match = /^spell-(\d+)$/.exec(entry.instanceId)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > highest) highest = value
  }

  return `spell-${highest + 1}`
}

// A valid slot level is 1-9, matching the nine columns
// `table:spellcasting.slots_full` declares. Anything else cannot correspond
// to a real Spell Slot progression row and is refused rather than stored.
export function isValidSlotLevel(value: unknown): value is number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 9
}

function normalizeExpendedSlots(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const result: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isValidSlotLevel(key)) continue
    const count = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(count) || count <= 0) continue
    result[key] = Math.trunc(count)
  }
  return result
}

// D&D 2024 Character Rules P3.2.1 -- shape-only. Keeps every valid, non-empty string id, in
// submitted order, duplicates and all: `evaluate()` reads this with `.includes`, which does not
// care about repeats, and `legal.add(identity)` is already a Set -- a destructive dedup WRITE here
// would answer a question (semantic "is this requirement id meaningful") this function has no
// business asking (it only knows "is this a non-empty string"). Returns `[]`, never a malformed
// envelope, for anything that is not an array at all -- the caller folds an empty result into
// "field absent" (see its own call site).
function readRequirementIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

// Re-validated on read, never trusted -- the same posture
// normalizeStoredInventory takes. A malformed ENTRY is dropped rather than
// failing the whole record (a character's whole spell list should not
// disappear over one bad row); a malformed ENVELOPE still returns null.
export function normalizeStoredSpellcasting(value: unknown): StoredCharacterSpellcasting | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  if (!Array.isArray(input.spells)) return null

  const spells: StoredSpellEntry[] = []
  const seen = new Set<string>()

  for (const raw of input.spells) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue

    const record = raw as Record<string, unknown>
    const ref = readRef(record.ref)
    const name = optionalText(record.name)

    // A spell that is neither a reference nor a name cannot be displayed --
    // mirrors inventory.ts's identical rule.
    if (!ref && !name) continue

    const instanceId = trimmed(record.instanceId) || nextInstanceId(spells)
    if (seen.has(instanceId)) continue
    seen.add(instanceId)

    spells.push({
      instanceId,
      ...(ref ? { ref } : { name }),
      known: record.known === true,
      prepared: record.prepared === true,
      ...(() => {
        const ids = readRequirementIds(record.requirementIds)
        return ids.length ? { requirementIds: ids } : {}
      })()
    })
  }

  return { spells, expendedSlots: normalizeExpendedSlots(input.expendedSlots) }
}

// ---------------------------------------------------------------------------
// The view model -- one spell, joined to the catalogue
// ---------------------------------------------------------------------------
// Lives here rather than beside Character Assembly for the same reason
// inventory.ts's AssembledInventoryItem does: `app/` must never import from
// `server/`. Assembly produces this shape; the panel renders it.
export type SpellCatalogueEntry = {
  packageId: string
  packageVersion: string
  title: string
  slug: string
  sourceBook?: string
  // Character Actions System addition -- relayed the same way
  // InventoryCatalogueEntry's own `actions` field is (Character Assembly
  // spreads the resolved catalogue entry verbatim). Every resolved spell
  // carries exactly one.
  actions?: ContentAction[]
  // Character Sheet Body Phase 1B.1 addition -- relayed the same way
  // `actions` above is (character-assembly.ts's own `resolveSpells` spreads
  // the resolved server/utils/world-content-catalogue.ts entry verbatim,
  // this field included). `CanonicalSpellMechanics` already lives in
  // app/lib/ (app/lib/spell-mechanics), so -- unlike `ContentAction`, which
  // has its own client-side restatement one file up -- this is a direct
  // import, not a second copy of the type.
  spellMechanics?: CanonicalSpellMechanics | null
}

export type AssembledSpellEntry = StoredSpellEntry & {
  status: 'resolved' | 'custom' | 'missing'
  title: string
  entry?: SpellCatalogueEntry
  reason?: string
}

export function unresolvedSpellLabel(ref: SpellRef): string {
  return `${ref.slug} (unavailable)`
}

// D&D 2024 Character Rules P3.2.1 -- the inverse of assembly's own spread (`resolveSpells`'s
// `{...entry, status, title, ...}`), kept here as a pure, directly-testable function for the SAME
// reason `characterBuilderSelection.ts`'s own header gives for extracting Builder logic: this repo
// has no DOM test environment, so "does an ordinary Sheet-side spell edit preserve requirementIds"
// needs to be provable without mounting a composable. `useCharacterMutations.ts`'s
// `persistSpellcasting` -- the ONE function every Sheet-side spell mutation already funnels through,
// and which rebuilds the full `spells[]` array before every PUT (a full replace, never a patch) --
// calls this per entry instead of hand-listing fields, so a future field added to `StoredSpellEntry`
// only has to be taught to THIS function once, not re-discovered the next time something silently
// stops round-tripping through an ordinary edit.
export function toStoredSpellEntry(entry: AssembledSpellEntry): StoredSpellEntry {
  return {
    instanceId: entry.instanceId,
    ...(entry.ref ? { ref: entry.ref } : { name: entry.name }),
    known: entry.known,
    prepared: entry.prepared,
    ...(entry.requirementIds?.length ? { requirementIds: entry.requirementIds } : {})
  }
}

// ---------------------------------------------------------------------------
// Mutations -- pure, total, and the only place this shape changes
// ---------------------------------------------------------------------------
// Every one returns a NEW record rather than mutating in place -- the same
// discipline inventory.ts's own "Mutations" section and health.ts's own
// "Recovery" section already establish.

export function addSpell(
  spells: readonly StoredSpellEntry[],
  spell: { ref?: SpellRef; name?: string }
): StoredSpellEntry[] {
  const ref = spell.ref
  const name = optionalText(spell.name)

  if (!ref && !name) return [...spells]

  return [
    ...spells,
    {
      instanceId: nextInstanceId(spells),
      ...(ref ? { ref } : { name }),
      known: true,
      prepared: false
    }
  ]
}

export function removeSpell(
  spells: readonly StoredSpellEntry[],
  instanceId: string
): StoredSpellEntry[] {
  return spells.filter((entry) => entry.instanceId !== instanceId)
}

export type SpellFlag = 'known' | 'prepared'

export function toggleSpellFlag(
  spells: readonly StoredSpellEntry[],
  instanceId: string,
  flag: SpellFlag
): StoredSpellEntry[] {
  return spells.map((entry) =>
    entry.instanceId === instanceId ? { ...entry, [flag]: !entry[flag] } : entry
  )
}

// Expending a slot only ever increments by one and is a no-op past `max` --
// the disabled-button-guards-the-action shape CharacterHealthPanel.vue's
// Spend Hit Die already uses, kept a total function rather than one that
// throws for the identical reason spendHitDie (health.ts) is.
export function expendSlot(
  expendedSlots: Record<string, number>,
  slotLevel: number,
  max: number
): Record<string, number> {
  if (!isValidSlotLevel(slotLevel)) return { ...expendedSlots }
  const key = String(slotLevel)
  const current = expendedSlots[key] ?? 0
  if (current >= max) return { ...expendedSlots }
  return { ...expendedSlots, [key]: current + 1 }
}

export function restoreSlot(
  expendedSlots: Record<string, number>,
  slotLevel: number
): Record<string, number> {
  if (!isValidSlotLevel(slotLevel)) return { ...expendedSlots }
  const key = String(slotLevel)
  const current = expendedSlots[key] ?? 0
  if (current <= 0) return { ...expendedSlots }
  const next = { ...expendedSlots, [key]: current - 1 }
  if (next[key] === 0) delete next[key]
  return next
}

// A Long Rest recovers every spell slot regardless of caster type (RAW); a
// Short Rest recovers only a Pact caster's (character-recovery.ts decides
// WHICH characters qualify -- this function just performs the reset once
// asked to).
export function resetAllSlots(): Record<string, number> {
  return {}
}

// ---------------------------------------------------------------------------
// Slot-level derivation -- Character Sheet Body Phase 1B.2 extraction.
// ---------------------------------------------------------------------------
// Moved here, UNCHANGED, from app/composables/useCharacterSheet.ts's own
// `slotLevels` computed -- that composable now calls this exact function
// instead of computing the same loop inline. Extracted because Phase 1B.2's
// authoritative Cast command needs the IDENTICAL max/available derivation
// SERVER-SIDE, and this task's own explicit instruction ("do NOT duplicate
// slot-bound arithmetic") makes restating this loop a second time -- one
// copy the client trusts for display, a second copy the server trusts for
// authority -- the exact drift risk that instruction exists to prevent. A
// pure function of already-fetched Rules Engine output (a caster type
// already resolved from `value:spellcasting.caster_type.*`, and the ONE
// Table row matching this character's level), never itself deriving either
// -- the caller (useCharacterSheet.ts client-side, character-cast.ts
// server-side) still owns finding those two facts with its own idiom, the
// same "restate the tiny id lookup, share the actual arithmetic" split this
// codebase already draws everywhere else (character-recovery.ts's own
// MAX_HP_ID vs. the shared applyHealing/spendHitDie functions it calls).

export type SpellSlotLevel = { level: number; max: number; expended: number }

// The three Rules Engine Table ids a caster type's own slot progression
// lives under -- exported so server/utils/character-cast.ts and
// useCharacterSheet.ts both name the SAME three ids rather than each
// typing their own copy of the strings.
export const SLOT_TABLE_BY_CASTER_TYPE: Record<'full' | 'half' | 'pact', string> = {
  full: 'table:spellcasting.slots_full',
  half: 'table:spellcasting.slots_half',
  pact: 'table:spellcasting.slots_pact'
}

export function deriveSpellSlotLevels(input: {
  casterType: 'full' | 'half' | 'pact' | null
  // The ALREADY-SELECTED table (SLOT_TABLE_BY_CASTER_TYPE[casterType])'s
  // rows -- callers on both sides already have a `DerivedTable`-shaped
  // value in hand (client: `derived.tables`; server: `getDerivedCharacter`'s
  // identical `.derived.tables`), so this only ever indexes into rows
  // already fetched, never fetches anything itself.
  tableRows: readonly Record<string, unknown>[] | undefined
  characterLevel: number
  expendedSlots: Record<string, number>
}): SpellSlotLevel[] {
  const { casterType, tableRows, characterLevel, expendedSlots } = input
  if (!casterType) return []

  const row = tableRows?.find((candidate) => candidate.key === characterLevel)
  if (!row) return []

  // Pact Magic (`table:spellcasting.slots_pact`) declares `slots`/
  // `slot_level` rather than one column per spell level -- every slot the
  // character has shares that one level. Full/Half declare `slot_1`..
  // `slot_9` directly.
  if (casterType === 'pact') {
    const level = Number(row.slot_level)
    const max = Number(row.slots)
    if (!level || !max) return []
    return [{ level, max, expended: expendedSlots[String(level)] ?? 0 }]
  }

  const levels: SpellSlotLevel[] = []
  for (let level = 1; level <= 9; level++) {
    const max = Number(row[`slot_${level}`] ?? 0)
    if (max <= 0) continue
    levels.push({ level, max, expended: expendedSlots[String(level)] ?? 0 })
  }
  return levels
}
