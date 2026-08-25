// Character Health -- the player-authored side of the Health System.
//
// The fifth module in the app/lib/characters/{ability-scores,rules-choices,
// inventory,character-notes}.ts family, shaped like the others on purpose:
// pure, re-validated on read rather than trusted, and computing nothing.
// Ability scores are numbers a player chose; health is numbers a player (or
// the table) records as play happens -- current HP after taking damage,
// temporary HP from an effect, hit dice spent on a short rest, death save
// marks. All four are decisions or observations, never derivations.
//
// ---------------------------------------------------------------------------
// WHAT IS STORED, AND WHY MAXIMUM HP IS NOT ONE OF THEM
// ---------------------------------------------------------------------------
// rules-package-architecture.md §13.2's stored/derived invariant, applied
// here exactly as it already is for ability modifiers and skill bonuses:
// Maximum HP is a CONSEQUENCE of Hit Die size (granted by the character's
// Class, via its Rules Facet), Constitution modifier, and level -- all
// three already exist as Values the Rules Engine can read. Storing a
// fourth, precomputed "max HP" number here would create a second source of
// that fact, one the engine does not produce and cannot keep in sync: level
// up, and a stored max silently stops matching what the formula would say.
// `value:hit_points.max` in packages/eldra-dnd5e-2024/definitions.json is
// `storage: 'derived'` for exactly this reason -- this module has no field
// for it because there is nothing to store.
//
// Hit Die SIZE is the same story one level down: it is granted by the
// Class's Rules Facet (character-actor-bridge.ts already threads facet
// grants into ActorState.values, unchanged by this task), not typed in by
// a player, so it has no field here either -- only how many of that
// character's hit dice have been SPENT is the player's own record.
//
// ---------------------------------------------------------------------------
// NO BOUND AGAINST MAXIMUM HP, ON PURPOSE
// ---------------------------------------------------------------------------
// This module is pure and registry-free (no Directus, no catalogue, no
// Rules Engine import) -- the same constraint every module in this family
// keeps, for the same reason: it is what makes the whole translation
// testable with no mocks. Checking "is currentHp <= maxHp" would require
// reading the active Rules Package's formula, which this module structurally
// cannot do. `currentHp` is therefore bounded only at zero (a real, engine-
// declared constraint on `value:hit_points.current`); a value above the
// character's derived maximum is accepted here and simply never occurs in
// practice, because nothing in this milestone computes damage or healing
// that could push it there (this task's own NON-GOALS).

export type StoredDeathSaves = {
  successes: number
  failures: number
}

export type StoredCharacterHealth = {
  currentHp: number
  temporaryHp: number
  hitDiceSpent: number
  deathSaves: StoredDeathSaves
}

export const MAX_DEATH_SAVE_MARKS = 3

export function emptyCharacterHealth(): StoredCharacterHealth {
  return {
    currentHp: 0,
    temporaryHp: 0,
    hitDiceSpent: 0,
    deathSaves: { successes: 0, failures: 0 }
  }
}

function nonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const whole = Math.trunc(parsed)
  return whole < 0 ? fallback : whole
}

function deathSaveMarkCount(value: unknown): number {
  const parsed = nonNegativeInt(value, 0)
  return Math.min(parsed, MAX_DEATH_SAVE_MARKS)
}

// Re-validated on read, never trusted -- the same posture every module in
// this family takes. A record hand-edited into an unreadable shape degrades
// to "nothing recorded yet" rather than rendering broken numbers.
//
// Every field coerces independently rather than rejecting the whole record
// on one bad value: a malformed `hitDiceSpent` should not also blank out a
// perfectly good `currentHp`. Death save marks are clamped to
// [0, MAX_DEATH_SAVE_MARKS] rather than rejected outside it, mirroring
// `deathSaveMarkCount`'s own job -- a hand-edited "5" reads as "3 marked",
// not as an error, since a mark count has no meaning past the cap.
export function normalizeStoredCharacterHealth(value: unknown): StoredCharacterHealth | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  const deathSavesInput =
    input.deathSaves && typeof input.deathSaves === 'object' && !Array.isArray(input.deathSaves)
      ? (input.deathSaves as Record<string, unknown>)
      : {}

  return {
    currentHp: nonNegativeInt(input.currentHp),
    temporaryHp: nonNegativeInt(input.temporaryHp),
    hitDiceSpent: nonNegativeInt(input.hitDiceSpent),
    deathSaves: {
      successes: deathSaveMarkCount(deathSavesInput.successes),
      failures: deathSaveMarkCount(deathSavesInput.failures)
    }
  }
}

// ---------------------------------------------------------------------------
// Recovery -- pure, total mutations. Character Recovery System.
// ---------------------------------------------------------------------------
// Every function below takes the CURRENT stored health plus whatever Rules
// Engine output it needs as an EXPLICIT PARAMETER, and returns a NEW record
// -- never mutating its input, same discipline
// app/lib/characters/inventory.ts's own "Mutations" section already
// established. This is what keeps the module registry-free: it is told
// "Maximum HP is 13" by its caller (server/utils/character-recovery.ts,
// which reads it from getDerivedCharacter); it never asks the Rules Engine
// itself.
//
// This split is the literal shape rules-package-architecture.md §13.2
// draws one layer up: the ENGINE determines the NUMBER (how much a Hit Die
// heals, what Maximum HP is, how many Hit Dice a Long Rest recovers); this
// module determines the RESULT of applying a player action to stored state
// using that number. Neither one does the other's job -- this module
// performs no formula evaluation, and nothing in app/lib/rules/ is ever
// asked to mutate anything.

// Damage needs NO Rules Engine input at all: temporary HP absorbs first,
// any remainder reduces current HP, both floored at zero. This is why
// server/utils/character-recovery.ts can apply damage even to a character
// in a World with no Rules Package activated -- see that module's own note.
export function applyDamage(health: StoredCharacterHealth, amount: number): StoredCharacterHealth {
  const incoming = nonNegativeInt(amount)
  const absorbedByTemp = Math.min(health.temporaryHp, incoming)
  const remaining = incoming - absorbedByTemp

  return {
    ...health,
    temporaryHp: health.temporaryHp - absorbedByTemp,
    currentHp: Math.max(0, health.currentHp - remaining)
  }
}

// Healing needs Maximum HP -- gained hit points can never push Current HP
// past it (§13.2: the one place Recovery reads a derived value to know
// where to stop, never to decide what to store).
export function applyHealing(
  health: StoredCharacterHealth,
  amount: number,
  maxHp: number
): StoredCharacterHealth {
  const gained = nonNegativeInt(amount)
  const ceiling = Math.max(0, nonNegativeInt(maxHp))

  return {
    ...health,
    currentHp: Math.min(ceiling, health.currentHp + gained)
  }
}

// Spending a Hit Die: one die moves from "available" to "spent", and the
// character heals by that die's average roll (Constitution modifier
// included) -- both numbers are Rules Engine output, supplied by the
// caller. A no-op, not an error, when no die is available: the button that
// calls this is disabled at that point, but the function itself stays a
// pure "what would this produce" rather than a place that throws.
export function spendHitDie(
  health: StoredCharacterHealth,
  hitDiceMax: number,
  averageRoll: number,
  maxHp: number
): StoredCharacterHealth {
  if (health.hitDiceSpent >= nonNegativeInt(hitDiceMax)) return { ...health }

  return applyHealing(
    { ...health, hitDiceSpent: health.hitDiceSpent + 1 },
    averageRoll,
    maxHp
  )
}

// Long Rest: full heal, temporary HP cleared (RAW: unused temporary HP is
// lost at the end of a long rest, not carried forward), spent Hit Dice
// recovered up to the Rules Engine's own declared recovery amount (never
// below zero spent), and Death Save marks cleared -- healing back to full
// is what makes them moot, the same fact `resetDeathSaves` below expresses
// as its own standalone action for the case where nothing else about
// Health has changed.
export function takeLongRest(
  health: StoredCharacterHealth,
  maxHp: number,
  hitDiceRecovery: number
): StoredCharacterHealth {
  return {
    currentHp: Math.max(0, nonNegativeInt(maxHp)),
    temporaryHp: 0,
    hitDiceSpent: Math.max(0, health.hitDiceSpent - nonNegativeInt(hitDiceRecovery)),
    deathSaves: { successes: 0, failures: 0 }
  }
}

// Independently available -- not folded into Long Rest alone, because a
// future Recovery action (stabilization, a Medicine check -- both this
// milestone's own NON-GOALS) will need to clear marks without also forcing
// a full heal.
export function resetDeathSaves(health: StoredCharacterHealth): StoredCharacterHealth {
  return { ...health, deathSaves: { successes: 0, failures: 0 } }
}
