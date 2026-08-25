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
