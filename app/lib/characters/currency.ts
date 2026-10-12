// Character Currency -- the money a character carries, as stored player data.
//
// The fourth module in the same family as ability-scores.ts, rules-choices.ts,
// and inventory.ts, and deliberately shaped like them: pure, re-validated on
// read rather than trusted, and computing nothing.
//
// ---------------------------------------------------------------------------
// WHY A NEW STORE, NOT A ROW IN INVENTORY
// ---------------------------------------------------------------------------
// inventory.ts's own header already named this gap explicitly: V1 stored
// currency as inventory rows named "currency:gold", string-matched and
// folded at a hardcoded 10:1 platinum-to-gold rate -- a game's own money
// hardcoded into application code. That hack is deliberately not repeated.
//
// Currency is not an item: it has no instanceId, is never equipped or
// attuned, and a player does not "carry three stacks of copper" the way they
// carry three daggers. It is a flat map of amounts, one entry per
// denomination, which is also the shape `expendedSlots: Record<string,
// number>` already establishes in spellcasting.ts for "a flat count per
// opaque id the active package defines."
//
// ---------------------------------------------------------------------------
// DENOMINATION IDENTITY IS PACKAGE-OWNED, NEVER HARDCODED HERE
// ---------------------------------------------------------------------------
// `RuleCategory`/`SemanticRole` (app/lib/content-rules/types.ts) already
// declare `'currency'` as a category and a role, with no Definition kind or
// conversion table built on top of it yet. Until a package declares one,
// a `denominationId` is an opaque string this module never interprets --
// not "gp", not "gold", not a conversion rate between two of them. The
// active D&D package's own authoring layer (dnd5e-2024.ts) is the only place
// that knows `currency:copper` exists and what the corpus's raw numeric
// values mean; this module stores whatever denomination id it is given and
// sums amounts sharing one, nothing more.

export type StoredCharacterCurrency = {
  amounts: Record<string, number>
}

export function emptyCurrency(): StoredCharacterCurrency {
  return { amounts: {} }
}

// Amounts are whole, non-negative counts of an opaque denomination -- never
// negative (a character cannot owe currency) and never fractional (every
// real corpus value is already expressed in its smallest base unit).
export function clampAmount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0

  const whole = Math.floor(parsed)
  return whole < 0 ? 0 : whole
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Re-validated on read, never trusted -- the same posture
// normalizeStoredInventory takes. A malformed denomination key is dropped
// rather than failing the whole record, for the same reason a malformed
// item row is dropped rather than emptying the whole pack. A malformed
// ENVELOPE still returns null.
export function normalizeStoredCurrency(value: unknown): StoredCharacterCurrency | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  if (!input.amounts || typeof input.amounts !== 'object' || Array.isArray(input.amounts)) return null

  const amounts: Record<string, number> = {}

  for (const [key, raw] of Object.entries(input.amounts as Record<string, unknown>)) {
    const denominationId = trimmed(key)
    if (!denominationId) continue

    const amount = clampAmount(raw)
    if (amount === 0) continue

    amounts[denominationId] = amount
  }

  return { amounts }
}

// ---------------------------------------------------------------------------
// Mutations -- pure, total, and the only place currency changes shape
// ---------------------------------------------------------------------------
// Returns a NEW record rather than mutating in place, matching every other
// mutation in this module family, so a failed save leaves the previous
// amounts intact to fall back to.

// Adds a delta per denomination (e.g. a starting-equipment grant) to the
// current amounts. A denomination absent from `current` starts at zero. A
// resulting zero is dropped rather than stored as an explicit zero entry, so
// two characters with "no currency" compare equal.
// A delta may be negative (spending currency already on hand) even though a STORED amount never
// is -- `clampAmount` floors to zero, which is correct for the latter but would silently turn
// every debit into a no-op if applied to the former. Only the whole number matters here; the sign
// is resolved once, after adding, by `clampAmount` on the RESULT below.
function rawDelta(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

export function addCurrencyAmounts(
  current: StoredCharacterCurrency,
  delta: Readonly<Record<string, number>>
): StoredCharacterCurrency {
  const amounts: Record<string, number> = { ...current.amounts }

  for (const [denominationId, value] of Object.entries(delta)) {
    const id = trimmed(denominationId)
    if (!id) continue

    const next = clampAmount((amounts[id] ?? 0) + rawDelta(value))
    if (next === 0) {
      delete amounts[id]
    } else {
      amounts[id] = next
    }
  }

  return { amounts }
}
