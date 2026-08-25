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
      prepared: record.prepared === true
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
